
import base64
import hashlib
import json
import re
import zlib
from urllib.parse import quote

import httpx

from app.core.config import settings


GITHUB_API_URL = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"

ALLOWED_PHASES = {
    "patch_tests",
    "post_pr_verification",
}

MAX_WORKFLOW_INPUTS = 25


class RunnerError(RuntimeError):
    """Raised when GitHub Actions dispatch cannot be completed safely."""


def _encode_patch(patch_diff: str | None) -> tuple[str, str, str]:
    """Return compressed patch, SHA-256 and encoding metadata."""

    if patch_diff is None:
        return "", "", "zlib+base64"

    raw = patch_diff.encode("utf-8")

    if not raw:
        raise RunnerError("Patch is empty")

    digest = hashlib.sha256(raw).hexdigest()
    compressed = zlib.compress(raw, level=9)
    encoded = base64.b64encode(compressed).decode("ascii")

    return encoded, digest, "zlib+base64"


def _build_inputs(
    ticket,
    *,
    phase: str,
    run_id: str,
    patch_diff: str | None,
) -> dict[str, str]:
    if phase not in ALLOWED_PHASES:
        raise RunnerError("Unsupported CI execution phase")

    if not run_id or len(run_id) > 100:
        raise RunnerError("Invalid execution correlation ID")

    if phase == "patch_tests" and patch_diff is None:
        raise RunnerError("Patch testing requires a patch")

    if phase == "post_pr_verification" and patch_diff is not None:
        raise RunnerError("Post-PR verification must use the committed repository state")

    patch_b64, patch_sha256, patch_encoding = _encode_patch(
        patch_diff
    )

    inputs = {
        "ticket_id": str(ticket.id),
        "phase": phase,
        "run_id": run_id,
        "repository": str(ticket.repository),
        "repository_url": str(ticket.repository_url),
        "base_branch": str(ticket.base_branch or ""),
        "base_commit_sha": str(ticket.base_commit_sha or ""),
        "resulting_commit_sha": str(
            ticket.resulting_commit_sha or ""
        ),
        "patch_encoding": patch_encoding,
        "patch_b64": patch_b64,
        "patch_sha256": patch_sha256,
    }

    if len(inputs) > MAX_WORKFLOW_INPUTS:
        raise RunnerError("Workflow input count exceeds GitHub's limit")

    return inputs


def dispatch(
    ticket,
    *,
    phase: str,
    run_id: str,
    patch_diff: str | None = None,
) -> dict:
    """Dispatch an isolated GitHub Actions workflow execution."""

    if not settings.github_actions_configured:
        raise RunnerError(
            "GitHub Actions integration is not configured"
        )

    repository = settings.bughound_actions_repository.strip()

    if not re.fullmatch(
        r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
        repository,
    ):
        raise RunnerError("Invalid BugHound Actions repository")

    inputs = _build_inputs(
        ticket,
        phase=phase,
        run_id=run_id,
        patch_diff=patch_diff,
    )

    body = {
        "ref": settings.bughound_actions_ref,
        "inputs": inputs,
        "return_run_details": True,
    }

    serialized_body = json.dumps(
        body,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")

    if len(serialized_body) > settings.github_actions_max_dispatch_bytes:
        raise RunnerError(
            "Compressed workflow payload exceeds the configured size limit"
        )

    workflow = quote(
        settings.bughound_actions_workflow,
        safe="",
    )

    endpoint = (
        f"{GITHUB_API_URL}/repos/{repository}"
        f"/actions/workflows/{workflow}/dispatches"
    )

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {settings.github_actions_token}",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(
            timeout=30,
            follow_redirects=False,
        ) as client:
            response = client.post(
                endpoint,
                content=serialized_body,
                headers=headers,
            )

        if response.status_code != 200:
            if response.status_code == 204:
                raise RunnerError(
                    "GitHub accepted dispatch but returned no run details; "
                    "execution cannot be safely correlated"
                )

            raise RunnerError(
                f"GitHub Actions dispatch failed with HTTP "
                f"{response.status_code}"
            )

        result = response.json()

    except RunnerError:
        raise
    except (httpx.HTTPError, ValueError):
        raise RunnerError(
            "GitHub Actions dispatch request failed"
        ) from None

    workflow_run_id = result.get("workflow_run_id")
    run_url = result.get("run_url")
    html_url = result.get("html_url")

    if not isinstance(workflow_run_id, int) or workflow_run_id <= 0:
        raise RunnerError(
            "GitHub did not return a valid workflow run ID"
        )

    if not isinstance(run_url, str) or not run_url.startswith(
        "https://api.github.com/"
    ):
        raise RunnerError(
            "GitHub returned an invalid workflow API URL"
        )

    if not isinstance(html_url, str) or not html_url.startswith(
        "https://github.com/"
    ):
        raise RunnerError(
            "GitHub returned an invalid workflow web URL"
        )

    return {
        "run_id": run_id,
        "workflow_run_id": workflow_run_id,
        "run_url": run_url,
        "html_url": html_url,
        "accepted": True,
        "payload_bytes": len(serialized_body),
        "patch_sha256": inputs["patch_sha256"],
    }
