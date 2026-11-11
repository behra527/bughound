
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.db import get_session_factory
from app.models import AgentRun, Ticket
from app.services.github_actions import (
    GitHubActionsClient,
    GitHubActionsError,
    parse_result_artifact,
)
from app.services.workflow import (
    record_actions_result,
    retry_patch_after_test_failure,
    run_pipeline,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("bughound.worker")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _active_actions_runs() -> list[dict]:
    """Copy active execution metadata; never retain DB sessions during HTTP."""

    factory = get_session_factory()

    with factory() as db:
        rows = db.scalars(
            select(AgentRun)
            .where(
                AgentRun.agent_name == "Agent 4 - Testing",
                AgentRun.status == "running",
            )
            .order_by(AgentRun.id)
        ).all()

        candidates = []

        for row in rows:
            output = row.output_data or {}

            if (
                output.get("accepted") is not True
                or type(output.get("workflow_run_id")) is not int
            ):
                continue

            ticket = db.get(Ticket, row.ticket_id)

            if ticket is None:
                continue

            candidates.append(
                {
                    "agent_run_id": row.id,
                    "ticket_id": row.ticket_id,
                    "runner_run_id": output.get("runner_run_id"),
                    "workflow_run_id": output["workflow_run_id"],
                    "phase": output.get("phase"),
                    "started_at": row.started_at,
                    "input_data": dict(row.input_data or {}),
                    "base_commit_sha": ticket.base_commit_sha,
                    "resulting_commit_sha": ticket.resulting_commit_sha,
                }
            )

        return candidates


def _block_execution(candidate: dict, reason: str) -> None:
    """Block an execution when its successful result cannot be trusted."""

    factory = get_session_factory()

    with factory() as db:
        run = db.scalar(
            select(AgentRun)
            .where(
                AgentRun.id == candidate["agent_run_id"],
                AgentRun.status == "running",
            )
            .with_for_update()
        )

        if run is None:
            return

        ticket = db.get(Ticket, candidate["ticket_id"])

        run.status = "blocked"
        run.error_message = reason[:4000]
        run.output_data = {
            **(run.output_data or {}),
            "result": "untrusted_or_missing",
            "error": reason[:4000],
        }
        run.completed_at = _utc_now()

        if ticket is not None:
            if candidate["phase"] == "patch_tests":
                ticket.test_status = "not_run"
                ticket.test_report = {
                    "status": "not_run",
                    "reason": reason[:4000],
                }
                ticket.status = "testing_blocked"
            else:
                ticket.verification_status = "blocked"
                ticket.status = "verification_blocked"

            ticket.stage = candidate["phase"]
            ticket.error_message = reason[:4000]

        db.commit()


def _failure_result(
    candidate: dict,
    *,
    status: str,
    summary: str,
    run_url: str,
) -> dict:
    """Build a non-passing result from GitHub's verified run conclusion."""

    phase = candidate["phase"]
    inputs = candidate["input_data"]

    return {
        "ticket_id": candidate["ticket_id"],
        "run_id": candidate["runner_run_id"],
        "phase": phase,
        "status": status,
        "executed": False,
        "exit_code": None,
        "base_commit_sha": candidate["base_commit_sha"],
        "patch_sha256": (
            inputs.get("patch_sha256")
            if phase == "patch_tests"
            else None
        ),
        "tested_commit_sha": (
            candidate["resulting_commit_sha"]
            if phase == "post_pr_verification"
            else None
        ),
        "summary": summary[:4000],
        "logs": "",
        "verification": None,
        "completed_at": _utc_now().isoformat(),
        "run_url": run_url,
    }


def _process_actions_run(
    client: GitHubActionsClient,
    candidate: dict,
) -> None:
    workflow_run_id = candidate["workflow_run_id"]
    ticket_id = candidate["ticket_id"]
    phase = candidate["phase"]

    try:
        run = client.get_run(workflow_run_id)
        client.verify_run_provenance(run)

        run_url = (
            f"https://github.com/{client.repository}"
            f"/actions/runs/{workflow_run_id}"
        )

        status = run.get("status")
        conclusion = run.get("conclusion")

        started_at = candidate.get("started_at")

        if started_at is not None:
            deadline = (
                _as_utc(started_at)
                + timedelta(seconds=settings.github_actions_run_timeout_seconds)
            )

            if _utc_now() >= deadline and status != "completed":
                result = _failure_result(
                    candidate,
                    status="failed",
                    summary="GitHub Actions execution exceeded its configured timeout.",
                    run_url=run_url,
                )

                _, retry = record_actions_result(
                    ticket_id,
                    result,
                    workflow_run_id,
                )

                if retry:
                    retry_patch_after_test_failure(ticket_id, result)

                logger.warning(
                    "Timed out GitHub Actions run %s for ticket %s",
                    workflow_run_id,
                    ticket_id,
                )
                return

        if status != "completed":
            return

        if conclusion != "success":
            result_status = (
                "cancelled" if conclusion == "cancelled" else "failed"
            )

            result = _failure_result(
                candidate,
                status=result_status,
                summary=f"GitHub Actions workflow concluded: {conclusion or 'unknown'}.",
                run_url=run_url,
            )

            _, retry = record_actions_result(
                ticket_id,
                result,
                workflow_run_id,
            )

            if retry:
                retry_patch_after_test_failure(ticket_id, result)

            logger.info(
                "Recorded %s for ticket %s, workflow run %s",
                result_status,
                ticket_id,
                workflow_run_id,
            )
            return

        # A successful workflow without a valid artifact is NOT a passing test.
        artifact = client.get_result_artifact(workflow_run_id)
        archive_bytes = client.download_artifact_zip(artifact)

        inputs = candidate["input_data"]

        result = parse_result_artifact(
            archive_bytes,
            expected_ticket_id=ticket_id,
            expected_run_id=candidate["runner_run_id"],
            expected_phase=phase,
            expected_base_commit_sha=candidate["base_commit_sha"],
            expected_patch_sha256=(
                inputs.get("patch_sha256")
                if phase == "patch_tests"
                else None
            ),
            expected_resulting_commit_sha=(
                candidate["resulting_commit_sha"]
                if phase == "post_pr_verification"
                else None
            ),
            expected_workflow_run_id=workflow_run_id,
            verified_run_url=run_url,
        )

        _, retry = record_actions_result(
            ticket_id,
            result,
            workflow_run_id,
        )

        if retry:
            retry_patch_after_test_failure(ticket_id, result)

        logger.info(
            "Recorded artifact result %s for ticket %s, workflow run %s",
            result["status"],
            ticket_id,
            workflow_run_id,
        )

    except (GitHubActionsError, ValueError, KeyError) as error:
        logger.exception(
            "GitHub Actions result could not be verified for ticket %s, run %s",
            ticket_id,
            workflow_run_id,
        )
        _block_execution(candidate, str(error))

    except Exception:
        logger.exception(
            "Unexpected polling failure for ticket %s, run %s",
            ticket_id,
            workflow_run_id,
        )


def poll_actions_runs() -> None:
    """Poll all accepted GitHub Actions runs without holding DB locks."""

    if not settings.github_actions_configured:
        return

    try:
        client = GitHubActionsClient()
    except GitHubActionsError:
        logger.exception("GitHub Actions client initialization failed")
        return

    for candidate in _active_actions_runs():
        try:
            _process_actions_run(client, candidate)
        except Exception:
            logger.exception(
                "Failed to process ticket %s Actions run %s",
                candidate["ticket_id"],
                candidate["workflow_run_id"],
            )


def claim_next_ticket() -> int | None:
    """Atomically claim one queued ticket."""

    factory = get_session_factory()

    with factory() as db:
        ticket_id = db.scalar(
            select(Ticket.id)
            .where(Ticket.status == "queued")
            .order_by(Ticket.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )

        if ticket_id is None:
            return None

        ticket = db.get(Ticket, ticket_id)
        ticket.status = "queued_worker"
        ticket.stage = "worker"
        db.commit()

        return ticket_id


def main() -> None:
    logger.info(
        "BugHound worker started; Actions polling interval=%ss, timeout=%ss",
        settings.github_actions_poll_interval_seconds,
        settings.github_actions_run_timeout_seconds,
    )

    while True:
        poll_actions_runs()

        ticket_id = claim_next_ticket()

        if ticket_id is not None:
            try:
                run_pipeline(ticket_id)
            except Exception:
                logger.exception("Ticket %s worker task failed", ticket_id)

        time.sleep(max(1, settings.github_actions_poll_interval_seconds))


if __name__ == "__main__":
    main()
