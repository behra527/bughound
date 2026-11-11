
import hashlib
from urllib.parse import urlsplit

import httpx

from app.core.config import settings


API_URL = "https://api.github.com"
API_VERSION = "2022-11-28"

RESULT_ARTIFACT_NAME = "bughound-result"
MAX_ARTIFACT_BYTES = 5 * 1024 * 1024

ALLOWED_DOWNLOAD_SUFFIXES = (
    ".blob.core.windows.net",
    ".githubusercontent.com",
)


class GitHubActionsError(RuntimeError):
    """Raised when GitHub Actions data cannot be trusted or retrieved."""


class GitHubActionsClient:
    """Read and verify GitHub Actions workflow executions and artifacts."""

    def __init__(self) -> None:
        if not settings.github_actions_configured:
            raise GitHubActionsError(
                "GitHub Actions credentials are not configured"
            )

        self.repository = settings.bughound_actions_repository.lower()
        self.workflow = settings.bughound_actions_workflow
        self.ref = settings.bughound_actions_ref

        self.headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {settings.github_actions_token}",
            "X-GitHub-Api-Version": API_VERSION,
        }

    def _get_json(self, path: str) -> dict:
        try:
            response = httpx.get(
                f"{API_URL}{path}",
                headers=self.headers,
                timeout=30,
                follow_redirects=False,
            )
            response.raise_for_status()
            result = response.json()

        except (httpx.HTTPError, ValueError):
            raise GitHubActionsError(
                "GitHub Actions API request failed"
            ) from None

        if not isinstance(result, dict):
            raise GitHubActionsError(
                "GitHub Actions API returned an invalid response"
            )

        return result

    def get_run(self, workflow_run_id: int) -> dict:
        if not isinstance(workflow_run_id, int) or workflow_run_id <= 0:
            raise GitHubActionsError("Invalid workflow run ID")

        return self._get_json(
            f"/repos/{self.repository}/actions/runs/{workflow_run_id}"
        )

    def verify_run_provenance(self, run: dict) -> None:
        """Reject runs that do not belong to the expected workflow context."""

        repository = (
            run.get("repository", {}).get("full_name", "").lower()
        )

        expected_path = (
            f".github/workflows/{self.workflow}"
        )

        actual_path = str(run.get("path", "")).split("@", 1)[0]

        expected_ref = f"refs/heads/{self.ref}"

        if repository != self.repository:
            raise GitHubActionsError(
                "Workflow run repository does not match"
            )

        if actual_path != expected_path:
            raise GitHubActionsError(
                "Workflow run path does not match"
            )

        if run.get("event") != "workflow_dispatch":
            raise GitHubActionsError(
                "Workflow run was not manually dispatched"
            )

        if run.get("ref") != expected_ref:
            raise GitHubActionsError(
                "Workflow run ref does not match"
            )

        if not run.get("head_sha"):
            raise GitHubActionsError(
                "Workflow run has no source commit SHA"
            )

    def list_artifacts(self, workflow_run_id: int) -> list[dict]:
        if not isinstance(workflow_run_id, int) or workflow_run_id <= 0:
            raise GitHubActionsError("Invalid workflow run ID")

        result = self._get_json(
            f"/repos/{self.repository}/actions/runs/"
            f"{workflow_run_id}/artifacts"
        )

        artifacts = result.get("artifacts")

        if not isinstance(artifacts, list):
            raise GitHubActionsError(
                "GitHub returned an invalid artifact list"
            )

        return artifacts

    def get_result_artifact(
        self,
        workflow_run_id: int,
    ) -> dict:
        """Find exactly one valid result artifact for the specified run."""

        artifacts = self.list_artifacts(workflow_run_id)

        matches = [
            item
            for item in artifacts
            if item.get("name") == RESULT_ARTIFACT_NAME
        ]

        if len(matches) != 1:
            raise GitHubActionsError(
                "Expected exactly one BugHound result artifact"
            )

        artifact = matches[0]

        if artifact.get("expired") is not False:
            raise GitHubActionsError(
                "Result artifact is expired or has unknown expiry status"
            )

        if artifact.get("workflow_run", {}).get("id") != workflow_run_id:
            raise GitHubActionsError(
                "Artifact does not belong to the expected workflow run"
            )

        size = artifact.get("size_in_bytes")

        if (
            not isinstance(size, int)
            or size <= 0
            or size > MAX_ARTIFACT_BYTES
        ):
            raise GitHubActionsError(
                "Artifact size is invalid or exceeds the configured limit"
            )

        return artifact

    @staticmethod
    def _validate_download_url(url: str) -> None:
        parsed = urlsplit(url)

        if parsed.scheme != "https":
            raise GitHubActionsError(
                "Artifact download URL must use HTTPS"
            )

        if parsed.username or parsed.password or parsed.port not in (None, 443):
            raise GitHubActionsError(
                "Artifact download URL contains an invalid authority"
            )

        hostname = (parsed.hostname or "").lower()

        if not any(
            hostname.endswith(suffix)
            for suffix in ALLOWED_DOWNLOAD_SUFFIXES
        ):
            raise GitHubActionsError(
                "Artifact download host is not trusted"
            )

    def download_artifact_zip(self, artifact: dict) -> bytes:
        """Download a bounded ZIP without forwarding credentials to redirects."""

        artifact_id = artifact.get("id")
        expected_size = artifact.get("size_in_bytes")

        if not isinstance(artifact_id, int) or artifact_id <= 0:
            raise GitHubActionsError("Invalid artifact ID")

        if (
            not isinstance(expected_size, int)
            or expected_size <= 0
            or expected_size > MAX_ARTIFACT_BYTES
        ):
            raise GitHubActionsError("Invalid artifact download size")

        endpoint = (
            f"{API_URL}/repos/{self.repository}/actions/"
            f"artifacts/{artifact_id}/zip"
        )

        try:
            with httpx.Client(
                timeout=30,
                follow_redirects=False,
            ) as client:
                response = client.get(
                    endpoint,
                    headers=self.headers,
                )

                if response.status_code != 302:
                    raise GitHubActionsError(
                        "GitHub did not return an artifact download redirect"
                    )

                download_url = response.headers.get("Location")

                if not download_url:
                    raise GitHubActionsError(
                        "Artifact download redirect has no location"
                    )

                self._validate_download_url(download_url)

                # Intentionally do not forward the GitHub Authorization header.
                with client.stream(
                    "GET",
                    download_url,
                    headers={"Accept": "application/zip"},
                ) as download:
                    download.raise_for_status()

                    chunks: list[bytes] = []
                    total = 0

                    for chunk in download.iter_bytes():
                        total += len(chunk)

                        if total > MAX_ARTIFACT_BYTES:
                            raise GitHubActionsError(
                                "Downloaded artifact exceeds size limit"
                            )

                        chunks.append(chunk)

            data = b"".join(chunks)

        except GitHubActionsError:
            raise
        except httpx.HTTPError:
            raise GitHubActionsError(
                "Artifact download failed"
            ) from None

        if len(data) != expected_size:
            raise GitHubActionsError(
                "Downloaded artifact size does not match GitHub metadata"
            )

        expected_digest = artifact.get("digest")

        if isinstance(expected_digest, str) and expected_digest.startswith(
            "sha256:"
        ):
            actual_digest = hashlib.sha256(data).hexdigest()

            if actual_digest != expected_digest.removeprefix("sha256:"):
                raise GitHubActionsError(
                    "Artifact SHA-256 digest verification failed"
                )

        return data

import io
import json
import zipfile


def parse_result_artifact(
    archive_bytes: bytes,
    *,
    expected_ticket_id: int,
    expected_run_id: str,
    expected_phase: str,
    expected_base_commit_sha: str,
    expected_patch_sha256: str | None,
    expected_resulting_commit_sha: str | None,
    expected_workflow_run_id: int,
    verified_run_url: str,
) -> dict:
    """Parse and strictly validate a trusted GitHub Actions result artifact."""

    import re
    from datetime import datetime
    from urllib.parse import urlsplit

    max_result_bytes = 256 * 1024

    if (
        not isinstance(archive_bytes, bytes)
        or not archive_bytes
        or len(archive_bytes) > MAX_ARTIFACT_BYTES
    ):
        raise GitHubActionsError("Artifact archive is empty or exceeds size limit")

    if (
        type(expected_ticket_id) is not int
        or expected_ticket_id <= 0
        or not isinstance(expected_run_id, str)
        or not expected_run_id
        or type(expected_workflow_run_id) is not int
        or expected_workflow_run_id <= 0
    ):
        raise GitHubActionsError("Invalid expected execution identifiers")

    if expected_phase not in {"patch_tests", "post_pr_verification"}:
        raise GitHubActionsError("Unsupported execution phase")

    sha_pattern = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$", re.I)
    if (
        not isinstance(expected_base_commit_sha, str)
        or not sha_pattern.fullmatch(expected_base_commit_sha)
    ):
        raise GitHubActionsError("Invalid expected base commit SHA")

    if expected_phase == "patch_tests":
        if (
            not isinstance(expected_patch_sha256, str)
            or not re.fullmatch(r"[0-9a-f]{64}", expected_patch_sha256)
            or expected_resulting_commit_sha is not None
        ):
            raise GitHubActionsError("Invalid expected patch metadata")
    else:
        if (
            expected_patch_sha256 is not None
            or not isinstance(expected_resulting_commit_sha, str)
            or not sha_pattern.fullmatch(expected_resulting_commit_sha)
        ):
            raise GitHubActionsError("Invalid expected resulting commit metadata")

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            entries = archive.infolist()

            if len(entries) != 1:
                raise GitHubActionsError(
                    "Artifact must contain exactly one file"
                )

            entry = entries[0]
            unix_mode = (entry.external_attr >> 16) & 0o170000

            if (
                entry.filename != "result.json"
                or entry.is_dir()
                or entry.flag_bits & 0x1
                or unix_mode not in (0, 0o100000)
                or entry.file_size <= 0
                or entry.file_size > max_result_bytes
                or entry.compress_size > max_result_bytes
            ):
                raise GitHubActionsError("Artifact file is invalid")

            raw = archive.read(entry)

    except GitHubActionsError:
        raise
    except (zipfile.BadZipFile, RuntimeError, OSError, EOFError):
        raise GitHubActionsError(
            "Artifact ZIP is invalid or unreadable"
        ) from None

    if len(raw) > max_result_bytes:
        raise GitHubActionsError("Artifact JSON exceeds size limit")

    def reject_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result

    try:
        result = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (UnicodeDecodeError, ValueError):
        raise GitHubActionsError("Artifact result JSON is invalid") from None

    if not isinstance(result, dict):
        raise GitHubActionsError("Artifact result must be an object")

    allowed_fields = {
        "ticket_id",
        "run_id",
        "phase",
        "status",
        "executed",
        "exit_code",
        "base_commit_sha",
        "patch_sha256",
        "tested_commit_sha",
        "summary",
        "logs",
        "verification",
        "completed_at",
    }

    if set(result) != allowed_fields:
        raise GitHubActionsError("Artifact result fields do not match expected schema")

    if type(result["ticket_id"]) is not int or result["ticket_id"] != expected_ticket_id:
        raise GitHubActionsError("Artifact ticket ID mismatch")

    if result["run_id"] != expected_run_id:
        raise GitHubActionsError("Artifact execution ID mismatch")

    if result["phase"] != expected_phase:
        raise GitHubActionsError("Artifact phase mismatch")

    if result["status"] not in {"passed", "failed", "cancelled"}:
        raise GitHubActionsError("Invalid execution status")

    if type(result["executed"]) is not bool:
        raise GitHubActionsError("Invalid execution flag")

    exit_code = result["exit_code"]
    if exit_code is not None and type(exit_code) is not int:
        raise GitHubActionsError("Invalid exit code")

    if result["status"] == "passed":
        if result["executed"] is not True or exit_code != 0:
            raise GitHubActionsError(
                "Passing result requires execution and exit code zero"
            )
    elif result["status"] == "failed":
        if result["executed"] and (exit_code is None or exit_code == 0):
            raise GitHubActionsError(
                "Failed execution requires a non-zero exit code"
            )
        if not result["executed"] and exit_code is not None:
            raise GitHubActionsError(
                "Non-executed failure cannot have an exit code"
            )
    elif not result["executed"] and exit_code is not None:
        raise GitHubActionsError(
            "Non-executed cancellation cannot have an exit code"
        )

    if (
        not isinstance(result["base_commit_sha"], str)
        or result["base_commit_sha"].lower()
        != expected_base_commit_sha.lower()
    ):
        raise GitHubActionsError("Base commit mismatch")

    if expected_phase == "patch_tests":
        if result["patch_sha256"] != expected_patch_sha256:
            raise GitHubActionsError("Patch SHA-256 mismatch")
        if result["tested_commit_sha"] is not None:
            raise GitHubActionsError("Unexpected tested commit in patch test result")
        if result["verification"] is not None:
            raise GitHubActionsError("Unexpected post-PR verification data")
    else:
        if result["patch_sha256"] is not None:
            raise GitHubActionsError("Unexpected patch digest in post-PR result")
        if (
            not isinstance(result["tested_commit_sha"], str)
            or result["tested_commit_sha"].lower()
            != expected_resulting_commit_sha.lower()
        ):
            raise GitHubActionsError("Tested commit mismatch")

    summary = result["summary"]
    logs = result["logs"]

    if not isinstance(summary, str) or not isinstance(logs, str):
        raise GitHubActionsError("Invalid summary or logs")

    verification = result["verification"]
    if verification is not None and not isinstance(verification, dict):
        raise GitHubActionsError("Invalid verification data")

    if expected_phase == "post_pr_verification" and result["status"] == "passed":
        if (
            not isinstance(verification, dict)
            or verification.get("build") != "passed"
            or verification.get("tests") != "passed"
            or verification.get("deployment") not in {"passed", "not_configured"}
            or verification.get("health_check") not in {"passed", "not_configured"}
        ):
            raise GitHubActionsError(
                "Post-PR verification requirements not satisfied"
            )

    completed_at = result["completed_at"]
    if not isinstance(completed_at, str):
        raise GitHubActionsError("Invalid completion timestamp")

    try:
        parsed_timestamp = datetime.fromisoformat(
            completed_at.replace("Z", "+00:00")
        )
        if parsed_timestamp.tzinfo is None or parsed_timestamp.utcoffset() is None:
            raise ValueError("Timezone is required")
    except (ValueError, OverflowError):
        raise GitHubActionsError(
            "Completion timestamp must be ISO-8601 with timezone"
        ) from None

    repository = settings.bughound_actions_repository.strip("/")
    repository_parts = repository.split("/")

    if (
        len(repository_parts) != 2
        or any(not re.fullmatch(r"[A-Za-z0-9_.-]+", part) for part in repository_parts)
    ):
        raise GitHubActionsError("Configured Actions repository is invalid")

    expected_url_path = (
        f"/{repository}/actions/runs/{expected_workflow_run_id}"
    )

    try:
        parsed_url = urlsplit(verified_run_url)
        valid_port = parsed_url.port in (None, 443)
    except (TypeError, ValueError):
        raise GitHubActionsError("Invalid verified workflow run URL") from None

    if (
        parsed_url.scheme != "https"
        or parsed_url.hostname != "github.com"
        or parsed_url.username is not None
        or parsed_url.password is not None
        or not valid_port
        or parsed_url.path != expected_url_path
        or parsed_url.query
        or parsed_url.fragment
    ):
        raise GitHubActionsError("Untrusted workflow run URL")

    result["run_url"] = verified_run_url
    result["summary"] = summary[:4000]
    result["logs"] = logs[-20000:]

    return result
