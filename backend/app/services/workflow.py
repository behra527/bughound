
import difflib
import hashlib
import re
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_session_factory
from app.models import AgentRun, AuditLog, Ticket
from app.services.agent_schemas import InvestigationReport, ValidationReport
from app.services.github import GitHubClient, ensure_authorized
from app.services.openrouter import ask_json
from app.services.runner import dispatch


SOURCE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".cs",
    ".c",
    ".h",
    ".cpp",
    ".html",
    ".css",
}

BLOCKED_PATH_PARTS = {
    ".git",
    ".github",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "coverage",
}

MAX_PATCH_FILES = 3
MAX_SOURCE_FILES = 5
MAX_SOURCE_FILE_BYTES = 40_000


class WorkflowError(RuntimeError):
    """Raised when an agent workflow operation cannot safely continue."""


def _record_run(
    db: Session,
    ticket_id: int,
    agent: str,
    inputs: dict,
    operation,
) -> tuple[dict, AgentRun]:
    """Persist an agent execution and its input/output."""

    run = AgentRun(
        ticket_id=ticket_id,
        agent_name=agent,
        status="running",
        input_data=inputs,
        started_at=datetime.now(timezone.utc),
    )

    db.add(run)
    db.commit()

    try:
        output = operation()

        run.output_data = output
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)

        db.commit()

        return output, run

    except Exception as error:
        run.status = "failed"
        run.error_message = str(error)[:4000]
        run.completed_at = datetime.now(timezone.utc)

        db.commit()
        raise


def _audit(
    db: Session,
    ticket_id: int,
    action: str,
    details: dict | None = None,
) -> None:
    """Persist a ticket audit event."""

    db.add(
        AuditLog(
            ticket_id=ticket_id,
            action=action,
            details=details or {},
        )
    )

    db.commit()


def _candidate_paths(paths: list[str]) -> list[str]:
    """Filter repository paths to supported source files."""

    candidates = []

    for path in paths:
        if not isinstance(path, str) or not path:
            continue

        normalized_parts = path.replace("\\", "/").split("/")

        if any(
            part.lower() in BLOCKED_PATH_PARTS
            for part in normalized_parts
        ):
            continue

        if not any(
            path.lower().endswith(extension)
            for extension in SOURCE_EXTENSIONS
        ):
            continue

        candidates.append(path)

        if len(candidates) >= 1500:
            break

    return candidates


def _validate_evidence_references(
    evidence: list,
    source_files: list[dict],
    *,
    agent_name: str,
) -> None:
    """
    Validate that evidence references retrieved source files
    and valid 1-based source line numbers.
    """

    files_by_path = {
        item["path"]: item["content"]
        for item in source_files
        if isinstance(item, dict)
        and isinstance(item.get("path"), str)
        and isinstance(item.get("content"), str)
    }

    for item in evidence:
        if item.path not in files_by_path:
            raise WorkflowError(
                f"{agent_name} referenced a file outside the retrieved "
                f"source evidence: {item.path}"
            )

        if item.lines is None:
            continue

        content = files_by_path[item.path]
        total_lines = len(content.splitlines())

        if isinstance(item.lines, list):
            line_numbers = item.lines
        else:
            line_numbers = [
                int(value)
                for value in re.findall(r"\d+", item.lines)
            ]

        if not line_numbers:
            raise WorkflowError(
                f"{agent_name} returned an invalid line reference "
                f"for {item.path}"
            )

        if any(
            not isinstance(number, int)
            or isinstance(number, bool)
            or number < 1
            or number > total_lines
            for number in line_numbers
        ):
            raise WorkflowError(
                f"{agent_name} referenced line numbers outside "
                f"{item.path} (valid range: 1-{total_lines})"
            )


def _validation_payload(
    bug: dict,
    investigation: dict,
) -> dict:
    """Build the exact payload sent to Agent 2."""

    return {
        "bug": bug,
        "investigation_report": {
            key: value
            for key, value in investigation.items()
            if key != "evidence_files"
        },
        "source_evidence": investigation.get("evidence_files", []),
    }


def _evidence_report(
    repository_data: dict,
    bug: dict,
) -> dict:
    """Agent 1: discover relevant files and investigate the bug."""

    candidate_paths = _candidate_paths(repository_data["paths"])

    if not candidate_paths:
        raise WorkflowError(
            "No supported source files were found in the repository"
        )

    selection = ask_json(
        (
            "You are a software bug investigator. Select up to five existing "
            "source file paths relevant to the user's report. Use only paths "
            "from the supplied tree. Return JSON with keys: "
            "relevant_paths (array of strings), reasoning (string). "
            "Do not propose code changes."
        ),
        {
            "bug": bug,
            "repository": repository_data["repository"],
            "branch": repository_data["default_branch"],
            "recent_commits": repository_data["commits"],
            "candidate_paths": candidate_paths,
        },
        max_tokens=1200,
    )

    relevant_paths = selection.get("relevant_paths")

    if not isinstance(relevant_paths, list):
        raise WorkflowError(
            "Agent 1 returned an invalid relevant_paths list"
        )

    allowed_paths = set(candidate_paths)

    selected = list(
        dict.fromkeys(
            path
            for path in relevant_paths
            if isinstance(path, str) and path in allowed_paths
        )
    )[:MAX_SOURCE_FILES]

    if not selected:
        raise WorkflowError(
            "Agent 1 did not identify any existing source files "
            "from the repository tree"
        )

    client = GitHubClient()

    files = []

    for path in selected:
        content = client.get_text_file(
            repository_data["repository"],
            path,
            repository_data["commit_sha"],
        )

        if not isinstance(content, str):
            raise WorkflowError(
                f"GitHub returned invalid source content for {path}"
            )

        if len(content.encode("utf-8")) > MAX_SOURCE_FILE_BYTES:
            raise WorkflowError(
                f"Selected source file exceeds the "
                f"{MAX_SOURCE_FILE_BYTES // 1000} KB limit: {path}"
            )

        files.append(
            {
                "path": path,
                "content": content,
            }
        )

    raw_report = ask_json(
        (
            "You are Agent 1, a software bug investigator. Analyze the "
            "supplied bug report and source files at the specified commit. "
            "Use only supplied source contents and commit metadata as evidence. "
            "Separate observed facts from hypotheses. Every evidence item "
            "must reference one supplied file path. Line references must be "
            "actual 1-based source line numbers. Do not invent evidence. "
            "If the root cause is uncertain, state that explicitly. "
            "Return JSON with keys: summary, suspected_root_cause, confidence "
            "(0-1), evidence (array of {path, lines, observation}), assumptions "
            "(array of strings), additional_information_needed "
            "(array of strings). Do not generate a patch."
        ),
        {
            "bug": bug,
            "repository": repository_data["repository"],
            "commit_sha": repository_data["commit_sha"],
            "recent_commits": repository_data["commits"],
            "files": files,
        },
        max_tokens=4000,
    )

    try:
        report = InvestigationReport.model_validate(raw_report)

    except ValidationError as error:
        raise WorkflowError(
            f"Agent 1 returned an invalid investigation report: {error}"
        ) from error

    _validate_evidence_references(
        report.evidence,
        files,
        agent_name="Agent 1",
    )

    result = report.model_dump()

    # Internal source evidence is retained for Agent 2 and Agent 3.
    result["evidence_files"] = files

    result["repository_commits"] = repository_data["commits"]

    return result


def _validate_report(
    bug: dict,
    investigation: dict,
) -> dict:
    """Agent 2: validate Agent 1's root-cause hypothesis."""

    source_files = investigation.get("evidence_files", [])

    if not source_files:
        raise WorkflowError(
            "Agent 2 cannot validate the investigation "
            "without source evidence"
        )

    payload = _validation_payload(
        bug,
        investigation,
    )

    raw_report = ask_json(
        (
            "You are Agent 2, an independent root-cause validator. "
            "Critically evaluate Agent 1's hypothesis against the original "
            "bug report and supplied source files. Do not blindly accept "
            "Agent 1's conclusion. Inspect the supplied source evidence "
            "independently. Identify supporting evidence, counterevidence, "
            "and incorrect assumptions. Every evidence item must reference "
            "a supplied file and valid 1-based source line numbers when "
            "lines are provided. Set validated=false when evidence is "
            "insufficient, contradictory, or does not establish the claimed "
            "root cause. If validated=true, provide a specific root_cause "
            "and at least one supporting_evidence item. "
            "Return JSON with keys: validated (boolean), root_cause "
            "(string or null), confidence (0-1), supporting_evidence "
            "(array of {path, lines, observation}), counterevidence "
            "(array of {path, lines, observation}), assumptions_to_correct "
            "(array of strings), rationale (string). Do not create a patch."
        ),
        payload,
        max_tokens=3000,
    )

    try:
        report = ValidationReport.model_validate(raw_report)

    except ValidationError as error:
        raise WorkflowError(
            f"Agent 2 returned an invalid validation report: {error}"
        ) from error

    _validate_evidence_references(
        report.supporting_evidence,
        source_files,
        agent_name="Agent 2",
    )

    _validate_evidence_references(
        report.counterevidence,
        source_files,
        agent_name="Agent 2",
    )

    if report.validated:
        if not report.root_cause or not report.root_cause.strip():
            raise WorkflowError(
                "Agent 2 marked the root cause as validated "
                "but supplied no root cause"
            )

        if not report.supporting_evidence:
            raise WorkflowError(
                "Agent 2 marked the root cause as validated "
                "without supporting evidence"
            )

    return report.model_dump()


def _valid_patch_path(
    path: str,
    allowed_paths: set[str],
) -> bool:
    """Ensure Agent 3 can only modify selected existing source files."""

    if not isinstance(path, str) or not path:
        return False

    normalized_path = path.replace("\\", "/")
    parts = normalized_path.split("/")

    return (
        path in allowed_paths
        and not path.startswith(("/", "\\"))
        and all(part not in {"", ".", ".."} for part in parts)
        and not any(
            part.lower() in BLOCKED_PATH_PARTS
            for part in parts
        )
        and any(
            path.lower().endswith(extension)
            for extension in SOURCE_EXTENSIONS
        )
    )


def _generate_patch(
    ticket: Ticket,
    validation: dict,
    investigation: dict,
    failure: dict | None = None,
) -> list[dict]:
    """Agent 3: generate a constrained patch against retrieved source files."""

    evidence = investigation.get("evidence_files", [])

    if not evidence:
        raise WorkflowError(
            "Agent 3 cannot generate a patch without original source evidence"
        )

    if validation.get("validated") is not True:
        raise WorkflowError(
            "Agent 3 cannot generate a patch without validated root cause"
        )

    original_by_path = {
        item["path"]: item["content"]
        for item in evidence
        if isinstance(item, dict)
        and isinstance(item.get("path"), str)
        and isinstance(item.get("content"), str)
    }

    allowed_paths = set(original_by_path)

    if not allowed_paths:
        raise WorkflowError(
            "No valid original source files are available for patch generation"
        )

    prompt = (
        "You are Agent 3, a conservative patch generator. "
        "Return JSON only: "
        '{"files":[{"path":"existing path",'
        '"content":"complete corrected UTF-8 file contents"}],'
        '"summary":"..."}'
        ". Change at most three supplied files. Preserve unrelated behavior. "
        "Do not add files, change dependencies, workflows, credentials, "
        "or deployment configuration. Do not claim tests ran. "
        "Only address the validated root cause."
    )

    payload = {
        "ticket": {
            "title": ticket.title,
            "description": ticket.description,
            "steps_to_reproduce": ticket.steps_to_reproduce,
        },
        "validation_report": validation,
        "original_files": evidence,
        "previous_test_failure": failure,
    }

    response = ask_json(
        prompt,
        payload,
        max_tokens=7000,
    )

    replacements = response.get("files")

    if (
        not isinstance(replacements, list)
        or not 1 <= len(replacements) <= MAX_PATCH_FILES
    ):
        raise WorkflowError(
            "Agent 3 must return between one and three replacement files"
        )

    patch_files = []
    seen = set()

    for replacement in replacements:
        if not isinstance(replacement, dict):
            raise WorkflowError(
                "Agent 3 returned an invalid file replacement"
            )

        path = replacement.get("path")
        content = replacement.get("content")

        if (
            not isinstance(path, str)
            or not isinstance(content, str)
            or not _valid_patch_path(path, allowed_paths)
        ):
            raise WorkflowError(
                "Agent 3 attempted to change a file "
                "outside the selected source evidence"
            )

        if path in seen:
            raise WorkflowError(
                f"Agent 3 returned a duplicate file path: {path}"
            )

        if len(content.encode("utf-8")) > MAX_SOURCE_FILE_BYTES:
            raise WorkflowError(
                f"Agent 3 returned a file exceeding the "
                f"{MAX_SOURCE_FILE_BYTES // 1000} KB limit: {path}"
            )

        seen.add(path)

        original = original_by_path[path]

        if original == content:
            continue

        diff = difflib.unified_diff(
            original.splitlines(),
            content.splitlines(),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            lineterm="",
        )

        patch_files.append(
            {
                "path": path,
                "original": original,
                "content": content,
                "diff": "\n".join(diff) + "\n",
            }
        )

    if not patch_files:
        raise WorkflowError(
            "Agent 3 returned no source changes"
        )

    return patch_files


def _dispatch_tests(
    db: Session,
    ticket: Ticket,
    *,
    phase: str,
    patch_diff: str | None = None,
) -> None:
    """Dispatch test execution to the configured external CI runner."""

    runner_run_id = str(uuid4())

    run = AgentRun(
        ticket_id=ticket.id,
        agent_name="Agent 4 - Testing",
        status="running",
        input_data={
            "phase": phase,
            "base_commit_sha": ticket.base_commit_sha,
            "patch_sha256": (
                hashlib.sha256(
                    patch_diff.encode("utf-8")
                ).hexdigest()
                if patch_diff is not None
                else None
            ),
            "note": (
                "Tests run only in the configured external isolated runner."
            ),
        },
        output_data={
            "phase": phase,
            "runner_run_id": runner_run_id,
            "accepted": False,
        },
        started_at=datetime.now(timezone.utc),
    )

    db.add(run)
    db.commit()

    try:
        dispatch(
            ticket,
            phase=phase,
            run_id=runner_run_id,
            patch_diff=patch_diff,
        )

        if run.status == "running":
            run.output_data = {
                **(run.output_data or {}),
                "accepted": True,
            }

            if phase == "patch_tests":
                ticket.test_status = "running"
            else:
                ticket.verification_status = "running"

            db.commit()

    except Exception as error:
        if run.status == "running":
            run.status = "blocked"
            run.error_message = str(error)[:4000]
            run.output_data = {
                **(run.output_data or {}),
                "result": "not_run",
            }
            run.completed_at = datetime.now(timezone.utc)

            if phase == "patch_tests":
                ticket.test_status = "not_run"
                ticket.test_report = {
                    "status": "not_run",
                    "reason": str(error),
                }
            else:
                ticket.verification_status = "blocked"

            ticket.status = (
                "testing_blocked"
                if phase == "patch_tests"
                else "verification_blocked"
            )

            ticket.stage = phase
            ticket.error_message = str(error)[:4000]

            db.commit()


def run_pipeline(ticket_id: int) -> None:
    """Execute Agent 1, Agent 2, Agent 3 and Agent 4 pipeline."""

    factory = get_session_factory()
    db = factory()

    ticket = db.get(Ticket, ticket_id)

    if ticket is None:
        db.close()
        return

    try:
        ensure_authorized(ticket.repository)

        ticket.status = "investigating"
        ticket.stage = "agent1"
        ticket.error_message = None

        db.commit()

        bug = {
            "title": ticket.title,
            "description": ticket.description,
            "steps_to_reproduce": ticket.steps_to_reproduce,
        }

        repo_data, _ = _record_run(
            db,
            ticket.id,
            "Agent 1 - Investigator",
            {"bug": bug},
            lambda: GitHubClient().inspect_repository(
                ticket.repository
            ),
        )

        ticket.base_branch = repo_data["default_branch"]
        ticket.base_commit_sha = repo_data["commit_sha"]

        db.commit()

        investigation, _ = _record_run(
            db,
            ticket.id,
            "Agent 1 - Investigator",
            {
                "repository_data": {
                    key: value
                    for key, value in repo_data.items()
                    if key != "paths"
                },
                "bug": bug,
            },
            lambda: _evidence_report(repo_data, bug),
        )

        ticket.investigation_report = {
            key: value
            for key, value in investigation.items()
            if key != "evidence_files"
        }

        ticket.status = "validating"
        ticket.stage = "agent2"

        db.commit()

        validation_payload = _validation_payload(
            bug,
            investigation,
        )

        validation, _ = _record_run(
            db,
            ticket.id,
            "Agent 2 - Validator",
            validation_payload,
            lambda: _validate_report(
                bug,
                investigation,
            ),
        )

        ticket.validation_report = validation

        if not validation["validated"]:
            ticket.status = "root_cause_unverified"
            ticket.stage = "agent2"

            _audit(
                db,
                ticket.id,
                "root_cause_not_validated",
                {
                    "confidence": validation.get("confidence"),
                    "rationale": validation.get("rationale"),
                },
            )

            return

        ticket.status = "patching"
        ticket.stage = "agent3"

        db.commit()

        patch_files, _ = _record_run(
            db,
            ticket.id,
            "Agent 3 - Patch Generator",
            {"validation": validation},
            lambda: _generate_patch(
                ticket,
                validation,
                investigation,
            ),
        )

        ticket.patch_files = patch_files

        ticket.patch_diff = (
            "\n".join(
                item["diff"].rstrip("\n")
                for item in patch_files
            )
            + "\n"
        )

        ticket.status = "testing"
        ticket.stage = "agent4"
        ticket.test_status = "queued"
        ticket.test_report = None

        db.commit()

        _dispatch_tests(
            db,
            ticket,
            phase="patch_tests",
            patch_diff=ticket.patch_diff,
        )

        _audit(
            db,
            ticket.id,
            "agent_pipeline_dispatched",
            {
                "base_commit_sha": ticket.base_commit_sha,
            },
        )

    except Exception as error:
        ticket.status = "workflow_failed"
        ticket.stage = "failed"
        ticket.error_message = str(error)[:4000]

        db.commit()

        _audit(
            db,
            ticket.id,
            "workflow_failed",
            {
                "error": ticket.error_message,
            },
        )

    finally:
        db.close()


def retry_patch_after_test_failure(
    ticket_id: int,
    test_report: dict,
) -> None:
    """Allow one patch regeneration attempt after failed CI tests."""

    db = get_session_factory()()

    ticket = db.get(Ticket, ticket_id)

    if ticket is None:
        db.close()
        return

    try:
        if (
            ticket.test_retry_count >= 1
            or not ticket.investigation_report
            or not ticket.validation_report
        ):
            ticket.status = "tests_failed"
            ticket.stage = "agent4"

            db.commit()
            return

        if ticket.validation_report.get("validated") is not True:
            raise WorkflowError(
                "Patch retry requires a validated root cause"
            )

        ticket.test_retry_count += 1
        ticket.status = "patching"
        ticket.stage = "agent3_retry"

        db.commit()

        outputs = db.scalars(
            select(AgentRun)
            .where(
                AgentRun.ticket_id == ticket.id,
                AgentRun.agent_name == "Agent 1 - Investigator",
            )
            .order_by(AgentRun.id.desc())
        ).all()

        full_investigation = next(
            (
                row.output_data
                for row in outputs
                if row.output_data
                and row.output_data.get("evidence_files")
            ),
            None,
        )

        if not full_investigation:
            raise WorkflowError(
                "Stored source evidence for retry is unavailable"
            )

        patch_files, _ = _record_run(
            db,
            ticket.id,
            "Agent 3 - Patch Generator",
            {
                "validation": ticket.validation_report,
                "test_failure": test_report,
            },
            lambda: _generate_patch(
                ticket,
                ticket.validation_report,
                full_investigation,
                test_report,
            ),
        )

        ticket.patch_files = patch_files

        ticket.patch_diff = (
            "\n".join(
                item["diff"].rstrip("\n")
                for item in patch_files
            )
            + "\n"
        )

        ticket.status = "testing"
        ticket.stage = "agent4_retry"
        ticket.test_status = "queued"

        db.commit()

        _dispatch_tests(
            db,
            ticket,
            phase="patch_tests",
            patch_diff=ticket.patch_diff,
        )

        _audit(
            db,
            ticket.id,
            "patch_regenerated_after_test_failure",
            {
                "retry": ticket.test_retry_count,
            },
        )

    except Exception as error:
        ticket.status = "workflow_failed"
        ticket.stage = "agent3_retry_failed"
        ticket.error_message = str(error)[:4000]

        db.commit()

        _audit(
            db,
            ticket.id,
            "patch_retry_failed",
            {
                "error": ticket.error_message,
            },
        )

    finally:
        db.close()


def mark_runner_result(
    ticket_id: int,
    result: dict,
    callback_secret: str,
) -> tuple[str, bool]:
    """Validate and persist an external CI runner callback."""

    if (
        not settings.runner_callback_secret
        or callback_secret != settings.runner_callback_secret
    ):
        raise WorkflowError(
            "Invalid runner callback authorization"
        )

    phase = result.get("phase")
    state = result.get("status")
    run_id = str(result.get("run_id", ""))

    if (
        phase not in {"patch_tests", "post_pr_verification"}
        or state not in {"passed", "failed", "cancelled"}
        or not run_id
    ):
        raise WorkflowError(
            "Runner callback must include a known phase, run_id, "
            "and actual status"
        )

    run_url = result.get("run_url")
    exit_code = result.get("exit_code")

    if state == "passed":
        if (
            result.get("executed") is not True
            or exit_code != 0
            or not isinstance(run_url, str)
            or not run_url.startswith("https://")
        ):
            raise WorkflowError(
                "A passing callback requires executed=true, "
                "exit_code=0, and an HTTPS CI run URL"
            )

    verification = result.get("verification")

    if phase == "post_pr_verification" and state == "passed":
        if (
            not isinstance(verification, dict)
            or verification.get("build") != "passed"
            or verification.get("tests") != "passed"
        ):
            raise WorkflowError(
                "Post-PR success requires actual passing "
                "build and test results"
            )

        if (
            verification.get("deployment")
            not in {"passed", "not_configured"}
            or verification.get("health_check")
            not in {"passed", "not_configured"}
        ):
            raise WorkflowError(
                "Post-PR deployment and health-check results "
                "must pass or be explicitly not_configured"
            )

    db = get_session_factory()()

    try:
        ticket = db.get(Ticket, ticket_id)

        if ticket is None:
            raise WorkflowError("Ticket not found")

        run = db.scalar(
            select(AgentRun)
            .where(
                AgentRun.ticket_id == ticket_id,
                AgentRun.agent_name == "Agent 4 - Testing",
                AgentRun.status == "running",
            )
            .order_by(AgentRun.id.desc())
        )

        if (
            run is None
            or not run.output_data
            or run.output_data.get("runner_run_id") != run_id
            or run.output_data.get("phase") != phase
        ):
            raise WorkflowError(
                "No matching active runner execution was found"
            )

        if phase == "patch_tests":
            if (
                result.get("base_commit_sha") != ticket.base_commit_sha
                or result.get("patch_sha256")
                != run.input_data.get("patch_sha256")
            ):
                raise WorkflowError(
                    "Patch test result does not match the ticket "
                    "base commit and generated diff"
                )

        elif result.get("tested_commit_sha") != ticket.resulting_commit_sha:
            raise WorkflowError(
                "Post-PR result does not match the approved GitHub commit"
            )

        report = {
            "status": state,
            "phase": phase,
            "run_id": run_id,
            "exit_code": result.get("exit_code"),
            "summary": str(result.get("summary", ""))[:4000],
            "logs": str(result.get("logs", ""))[-20000:],
            "run_url": run_url,
            "tested_commit_sha": result.get("tested_commit_sha"),
            "base_commit_sha": result.get("base_commit_sha"),
            "patch_sha256": result.get("patch_sha256"),
            "verification": verification,
            "completed_at": result.get("completed_at"),
        }

        run.status = state
        run.output_data = report
        run.completed_at = datetime.now(timezone.utc)

        if phase == "patch_tests":
            ticket.test_status = state
            ticket.test_report = report

            ticket.status = (
                "awaiting_approval"
                if state == "passed"
                else "tests_failed"
            )

            ticket.stage = (
                "awaiting_approval"
                if state == "passed"
                else "agent4"
            )

            _audit(
                db,
                ticket_id,
                "patch_tests_completed",
                {
                    "status": state,
                    "run_id": run_id,
                },
            )

            retry = (
                state == "failed"
                and ticket.test_retry_count < 1
            )

        else:
            ticket.verification_status = state

            ticket.status = (
                "resolved"
                if state == "passed"
                else "verification_failed"
            )

            ticket.stage = (
                "resolved"
                if state == "passed"
                else "post_pr_verification"
            )

            _audit(
                db,
                ticket_id,
                "post_pr_verification_completed",
                {
                    "status": state,
                    "run_id": run_id,
                },
            )

            retry = False

        db.commit()

        return phase, retry

    finally:
        db.close()
