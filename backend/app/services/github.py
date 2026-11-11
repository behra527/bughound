import base64
import re
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException

from app.core.config import settings


class GitHubError(RuntimeError):
    pass


def parse_repository_url(repository_url: str) -> str:
    parsed = urlsplit(repository_url.strip())
    segments = [part for part in parsed.path.strip("/").split("/") if part]
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or len(segments) != 2
    ):
        raise HTTPException(status_code=422, detail="Use a canonical public GitHub URL: https://github.com/owner/repository")
    owner, name = segments
    name = name.removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", name):
        raise HTTPException(status_code=422, detail="Invalid GitHub owner or repository name")
    if owner in {".", ".."} or name in {".", ".."}:
        raise HTTPException(status_code=422, detail="Invalid GitHub repository path")
    return f"{owner}/{name}".lower()


def ensure_authorized(repository: str, *, write: bool = False) -> None:
    if repository.lower() not in settings.authorized_repository_set:
        raise HTTPException(status_code=403, detail="Repository is not in the server's AUTHORIZED_REPOSITORIES allowlist")
    if write and not settings.github_token:
        raise HTTPException(status_code=503, detail="GitHub write authorization is not configured")


class GitHubClient:
    def __init__(self) -> None:
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        self.client = httpx.Client(base_url="https://api.github.com", headers=headers, timeout=30, follow_redirects=False)

    def _get(self, path: str, params: dict | None = None) -> dict:
        try:
            response = self.client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise GitHubError(f"GitHub read failed: {error}") from error

    def _post(self, path: str, body: dict) -> dict:
        try:
            response = self.client.post(path, json=body)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            detail = ""
            if isinstance(error, httpx.HTTPStatusError):
                detail = f" (HTTP {error.response.status_code})"
            raise GitHubError(f"GitHub write failed{detail}: {error}") from error

    def inspect_repository(self, repository: str) -> dict:
        ensure_authorized(repository)
        metadata = self._get(f"/repos/{repository}")
        if metadata.get("private"):
            raise GitHubError("Only public repositories are supported")
        branch = metadata.get("default_branch")
        if not branch:
            raise GitHubError("GitHub repository has no default branch")
        commits = self._get(f"/repos/{repository}/commits", {"sha": branch, "per_page": 10})
        ref = self._get(f"/repos/{repository}/git/ref/heads/{quote(branch, safe='')}")
        commit_sha = ref["object"]["sha"]
        tree_sha = self._get(f"/repos/{repository}/git/commits/{commit_sha}")["tree"]["sha"]
        tree = self._get(f"/repos/{repository}/git/trees/{tree_sha}", {"recursive": "1"})
        if tree.get("truncated"):
            raise GitHubError("Repository file tree is too large to safely analyze")
        paths = [item["path"] for item in tree.get("tree", []) if item.get("type") == "blob"]
        return {
            "repository": repository,
            "default_branch": branch,
            "commit_sha": commit_sha,
            "commits": [
                {"sha": item.get("sha"), "message": item.get("commit", {}).get("message", "")[:500]}
                for item in commits
            ],
            "paths": paths[:5000],
        }

    def get_text_file(self, repository: str, path: str, ref: str) -> str:
        response = self._get(f"/repos/{repository}/contents/{quote(path, safe='/')}", {"ref": ref})
        if response.get("type") != "file" or response.get("encoding") != "base64":
            raise GitHubError(f"{path} is not a regular text file")
        if int(response.get("size", 0)) > 40_000:
            raise GitHubError(f"{path} exceeds the 40 KB analysis limit")
        try:
            content = base64.b64decode(response["content"], validate=False).decode("utf-8")
        except (KeyError, UnicodeDecodeError, ValueError) as error:
            raise GitHubError(f"{path} is not UTF-8 text") from error
        return content[:40_000]

    def create_pull_request(self, ticket, files: list[dict]) -> dict:
        ensure_authorized(ticket.repository, write=True)
        metadata = self._get(f"/repos/{ticket.repository}")
        if metadata.get("private"):
            raise GitHubError("Repository is not public")
        base = ticket.base_branch
        current_ref = self._get(f"/repos/{ticket.repository}/git/ref/heads/{quote(base, safe='')}")
        if current_ref.get("object", {}).get("sha") != ticket.base_commit_sha:
            raise GitHubError("The repository default branch changed after analysis; rerun the workflow before approval")
        base_commit = self._get(f"/repos/{ticket.repository}/git/commits/{ticket.base_commit_sha}")
        tree = self._post(
            f"/repos/{ticket.repository}/git/trees",
            {
                "base_tree": base_commit["tree"]["sha"],
                "tree": [
                    {"path": item["path"], "mode": "100644", "type": "blob", "content": item["content"]}
                    for item in files
                ],
            },
        )
        branch = f"bughound/ticket-{ticket.id}-{ticket.base_commit_sha[:7]}"
        commit = self._post(
            f"/repos/{ticket.repository}/git/commits",
            {
                "message": f"fix: resolve ticket T-{ticket.id} - {ticket.title[:100]}",
                "tree": tree["sha"],
                "parents": [ticket.base_commit_sha],
            },
        )
        self._post(f"/repos/{ticket.repository}/git/refs", {"ref": f"refs/heads/{branch}", "sha": commit["sha"]})
        pull = self._post(
            f"/repos/{ticket.repository}/pulls",
            {
                "title": f"Fix T-{ticket.id}: {ticket.title[:160]}",
                "head": branch,
                "base": base,
                "body": f"Approved BugHound patch for ticket T-{ticket.id}.\n\nAutomated merge is disabled; repository checks and maintainers must review this PR.\n\n{ticket.description}",
            },
        )
        return {"branch": branch, "commit_sha": commit["sha"], "pr_url": pull["html_url"], "pr_number": pull["number"]}
