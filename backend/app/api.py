import hmac
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import AgentRun, AuditLog, Ticket, User
from app.schemas import CustomerCreate, LoginRequest, PasswordUpdate, ProfileUpdate, RepositoryConnect, TicketCreate, TicketView, TokenResponse, UserView
from app.security import create_access_token, get_current_user, hash_password, require_admin, verify_password
from app.services.github import GitHubClient, GitHubError, ensure_authorized, parse_repository_url
from app.services.runner import dispatch
from app.services.workflow import WorkflowError, mark_runner_result, retry_patch_after_test_failure
from app.services.workflow import _audit

router = APIRouter(prefix="/api")


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower(), User.is_active.is_(True)))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(user), user=UserView.model_validate(user))


@router.get("/auth/me", response_model=UserView)
def current_user(user: User = Depends(get_current_user)) -> UserView:
    return UserView.model_validate(user)


@router.patch("/auth/profile", response_model=UserView)
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    user.name = payload.name.strip()
    user.company = payload.company.strip()
    db.add(AuditLog(actor_id=user.id, action="profile_updated", details={"name": user.name}))
    db.commit()
    db.refresh(user)
    return user


@router.post("/auth/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.add(AuditLog(actor_id=user.id, action="password_changed"))
    db.commit()


@router.post("/admin/customers", response_model=UserView, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    email = payload.email.lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, name=payload.name, company=payload.company.strip(), password_hash=hash_password(payload.password), role="customer")
    db.add(user)
    db.flush()
    db.add(AuditLog(actor_id=admin.id, action="customer_created", details={"user_id": user.id, "email": email}))
    db.commit()
    db.refresh(user)
    return user


@router.get("/admin/customers")
def list_customers(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(
        select(User, func.count(Ticket.id))
        .outerjoin(Ticket, Ticket.owner_id == User.id)
        .where(User.role == "customer")
        .group_by(User.id)
        .order_by(User.created_at.desc())
    ).all()
    return [
        {
            "id": user.id,
            "initials": "".join(part[0] for part in user.name.split()[:2]).upper(),
            "name": user.name,
            "company": user.company,
            "email": user.email,
            "projects": 0,
            "tickets": ticket_count,
            "joined": user.created_at,
            "status": "Active" if user.is_active else "Blocked",
        }
        for user, ticket_count in rows
    ]


@router.post("/tickets", response_model=TicketView, status_code=status.HTTP_202_ACCEPTED)
def create_ticket(
    payload: TicketCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Ticket:
    if user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customer accounts can submit tickets")
    ticket = Ticket(
        owner_id=user.id,
        customer_name=user.name,
        repository_url=None,
        repository="",
        title=payload.title.strip(),
        description=payload.description.strip(),
        steps_to_reproduce=payload.steps_to_reproduce.strip(),
        status="pending_admin",
        stage="admin_review",
    )
    db.add(ticket)
    db.flush()
    db.add(AuditLog(actor_id=user.id, ticket_id=ticket.id, action="ticket_created", details={"repository_assignment": "pending_admin"}))
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/admin/tickets/{ticket_id}/repository", response_model=TicketView)
def connect_repository_and_start_agents(
    ticket_id: int,
    payload: RepositoryConnect,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "pending_admin":
        raise HTTPException(status_code=409, detail="Repository can only be assigned before agent processing starts")
    repository = parse_repository_url(payload.repository_url)
    ensure_authorized(repository)
    ticket.repository = repository
    ticket.repository_url = f"https://github.com/{repository}"
    ticket.status, ticket.stage, ticket.error_message = "queued", "queued", None
    db.add(AuditLog(
        actor_id=admin.id,
        ticket_id=ticket.id,
        action="repository_connected_agents_queued",
        details={"repository": repository},
    ))
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/tickets", response_model=list[TicketView])
def list_tickets(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Ticket]:
    query = select(Ticket).order_by(Ticket.created_at.desc())
    if user.role != "admin":
        query = query.where(Ticket.owner_id == user.id)
    return list(db.scalars(query).all())


@router.get("/tickets/{ticket_id}", response_model=TicketView)
def get_ticket(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or (user.role != "admin" and ticket.owner_id != user.id):
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.get("/tickets/{ticket_id}/agents")
def get_agent_runs(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or (user.role != "admin" and ticket.owner_id != user.id):
        raise HTTPException(status_code=404, detail="Ticket not found")
    runs = db.scalars(select(AgentRun).where(AgentRun.ticket_id == ticket_id).order_by(AgentRun.id)).all()
    return [
        {
            "id": run.id,
            "agent_name": run.agent_name,
            "status": run.status,
            "output_data": run.output_data,
            "error_message": run.error_message,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
        }
        for run in runs
    ]


@router.get("/tickets/{ticket_id}/repository")
def get_repository_snapshot(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or (user.role != "admin" and ticket.owner_id != user.id):
        raise HTTPException(status_code=404, detail="Ticket not found")
    runs = db.scalars(
        select(AgentRun).where(AgentRun.ticket_id == ticket_id, AgentRun.agent_name == "Agent 1 - Investigator").order_by(AgentRun.id)
    ).all()
    repository_data = next((run.output_data for run in runs if run.output_data and run.output_data.get("paths")), None)
    investigation = next((run.output_data for run in reversed(runs) if run.output_data and run.output_data.get("evidence_files")), None)
    if repository_data is None:
        raise HTTPException(status_code=409, detail="Repository snapshot is not available until Agent 1 completes repository inspection")
    return {
        "repository": ticket.repository,
        "base_branch": ticket.base_branch,
        "base_commit_sha": ticket.base_commit_sha,
        "commits": repository_data.get("commits", []),
        "paths": repository_data.get("paths", []),
        "files": investigation.get("evidence_files", []) if investigation else [],
    }


@router.post("/admin/tickets/{ticket_id}/approve", response_model=TicketView)
def approve_ticket(
    ticket_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "awaiting_approval" or ticket.test_status != "passed" or not ticket.patch_files:
        raise HTTPException(status_code=409, detail="Ticket requires a verified passing runner result and a generated patch before approval")
    try:
        ensure_authorized(ticket.repository, write=True)
        result = GitHubClient().create_pull_request(ticket, ticket.patch_files)
    except (GitHubError, HTTPException) as error:
        detail = error.detail if isinstance(error, HTTPException) else str(error)
        ticket.status, ticket.stage, ticket.error_message = "github_blocked", "github_update", str(detail)[:4000]
        db.add(AuditLog(actor_id=admin.id, ticket_id=ticket.id, action="github_update_blocked", details={"reason": str(detail)}))
        db.commit()
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(status_code=502, detail=str(detail)) from error
    ticket.approval_by = admin.id
    ticket.fix_branch = result["branch"]
    ticket.resulting_commit_sha = result["commit_sha"]
    ticket.pr_url = result["pr_url"]
    ticket.pr_number = result["pr_number"]
    ticket.status, ticket.stage = "verifying", "post_pr_verification"
    ticket.verification_status = "queued"
    db.add(AuditLog(actor_id=admin.id, ticket_id=ticket.id, action="patch_approved_pr_created", details=result))
    db.commit()
    db.refresh(ticket)
    runner_run_id = str(uuid4())
    run = AgentRun(
        ticket_id=ticket.id,
        agent_name="Agent 4 - Testing",
        status="running",
        input_data={"phase": "post_pr_verification", "pr_url": ticket.pr_url, "resulting_commit_sha": ticket.resulting_commit_sha},
        output_data={"phase": "post_pr_verification", "runner_run_id": runner_run_id, "accepted": False},
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    try:
        dispatch_result = dispatch(
            ticket,
            phase="post_pr_verification",
            run_id=runner_run_id,
        )

        if (
            not isinstance(dispatch_result, dict)
            or dispatch_result.get("run_id") != runner_run_id
            or dispatch_result.get("accepted") is not True
            or type(dispatch_result.get("workflow_run_id")) is not int
            or dispatch_result["workflow_run_id"] <= 0
        ):
            raise WorkflowError(
                "GitHub Actions dispatch returned invalid correlation data"
            )

        db.refresh(run)
        db.refresh(ticket)

        if run.status == "running":
            run.output_data = {
                **(run.output_data or {}),
                "accepted": True,
                "workflow_run_id": dispatch_result["workflow_run_id"],
                "workflow_run_api_url": dispatch_result["run_url"],
                "workflow_run_html_url": dispatch_result["html_url"],
                "payload_bytes": dispatch_result["payload_bytes"],
                "patch_sha256": dispatch_result["patch_sha256"],
            }
            ticket.verification_status = "running"
            db.commit()
    except Exception as error:
        db.refresh(run)
        if run.status == "running":
            run.status = "blocked"
            run.error_message = str(error)[:4000]
            run.completed_at = datetime.now(timezone.utc)
            ticket.status, ticket.stage = "verification_blocked", "post_pr_verification"
            ticket.verification_status = "blocked"
            ticket.error_message = f"PR created at {ticket.pr_url}, but post-PR verification could not start: {error}"[:4000]
            db.add(AuditLog(actor_id=admin.id, ticket_id=ticket.id, action="post_pr_verification_blocked", details={"error": str(error)}))
            db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/admin/tickets/{ticket_id}/reject", response_model=TicketView)
def reject_ticket(
    ticket_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "awaiting_approval":
        raise HTTPException(status_code=409, detail="Only a ticket awaiting approval can be rejected")
    ticket.status, ticket.stage = "rejected", "admin_review"
    ticket.approval_by = admin.id
    db.add(AuditLog(actor_id=admin.id, ticket_id=ticket.id, action="patch_rejected", details={"github_updated": False}))
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/runner/tickets/{ticket_id}/result", status_code=status.HTTP_202_ACCEPTED)
def runner_result(
    ticket_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    x_runner_secret: str = Header(default=""),
) -> dict:
    if not hmac.compare_digest(x_runner_secret, settings.runner_callback_secret or "invalid"):
        raise HTTPException(status_code=401, detail="Invalid runner callback authorization")
    try:
        phase, retry = mark_runner_result(ticket_id, payload, x_runner_secret)
    except WorkflowError as error:
        raise HTTPException(status_code=409 if "matching active" in str(error) else 422, detail=str(error)) from error
    if retry:
        background_tasks.add_task(retry_patch_after_test_failure, ticket_id, payload)
    return {"accepted": True, "phase": phase, "retry_started": retry}


@router.get("/admin/audit")
def audit_logs(
    ticket_id: int | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)
    if ticket_id is not None:
        query = query.where(AuditLog.ticket_id == ticket_id)
    return [
        {"id": row.id, "actor_id": row.actor_id, "ticket_id": row.ticket_id, "action": row.action, "details": row.details, "created_at": row.created_at}
        for row in db.scalars(query).all()
    ]


@router.get("/admin/integrations")
def integration_status(admin: User = Depends(require_admin)) -> dict:
    return {
        "openrouter_configured": bool(settings.openrouter_api_key),
        "openrouter_model": settings.openrouter_model,
        "github_read_configured": True,
        "github_write_configured": bool(settings.github_token),
        "authorized_repository_count": len(settings.authorized_repository_set),
        "github_actions_configured": settings.github_actions_configured,
        "github_actions_repository": settings.bughound_actions_repository,
        "github_actions_workflow": settings.bughound_actions_workflow,
        "github_actions_ref": settings.bughound_actions_ref,
        "github_actions_poll_interval_seconds": settings.github_actions_poll_interval_seconds,
        "github_actions_run_timeout_seconds": settings.github_actions_run_timeout_seconds,
        "github_actions_max_dispatch_bytes": settings.github_actions_max_dispatch_bytes,
    }
