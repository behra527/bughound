import hashlib

import httpx

from app.core.config import settings


class RunnerError(RuntimeError):
    pass


def dispatch(ticket, *, phase: str, run_id: str, patch_diff: str | None = None) -> dict:
    if not settings.ci_runner_url or not settings.ci_runner_token or not settings.runner_callback_secret:
        raise RunnerError("External isolated CI runner is not configured; no repository code was executed")
    payload = {
        "ticket_id": ticket.id,
        "phase": phase,
        "run_id": run_id,
        "repository": ticket.repository,
        "repository_url": ticket.repository_url,
        "base_branch": ticket.base_branch,
        "base_commit_sha": ticket.base_commit_sha,
        "fix_branch": ticket.fix_branch,
        "patch_diff": patch_diff,
        "patch_sha256": hashlib.sha256(patch_diff.encode("utf-8")).hexdigest() if patch_diff is not None else None,
        "resulting_commit_sha": ticket.resulting_commit_sha,
        "callback_url": f"{settings.public_api_url.rstrip('/')}/api/runner/tickets/{ticket.id}/result",
    }
    try:
        response = httpx.post(
            settings.ci_runner_url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.ci_runner_token}"},
            timeout=20,
        )
        response.raise_for_status()
        result = response.json()
        if not result.get("run_id"):
            raise RunnerError("Runner did not return a run_id; no test result is recorded")
        if str(result["run_id"]) != run_id:
            raise RunnerError("Runner must echo the supplied run_id to bind callbacks to the persisted execution")
        return result
    except (httpx.HTTPError, ValueError) as error:
        raise RunnerError(f"CI runner dispatch failed: {error}") from error
