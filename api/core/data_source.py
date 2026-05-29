"""
Server-side fetcher that pulls dataset CSVs from a private GitHub repo using
the GitHub Contents API (so it works for both public and private repos with
a single code path).

Config via environment variables:
- DATA_REPO            : "<owner>/<repo>" — e.g. "Jonathan-Lukwichi/healthforecast-data"
- DATA_REPO_BRANCH     : branch name, defaults to "main"
- DATA_REPO_SUBPATH    : optional folder inside the repo, e.g. "csv/"
- GITHUB_TOKEN         : fine-grained personal access token with read-only
                         content access to that one repo

The token never leaves the FastAPI process; the browser only sees the parsed
DataFrame metadata.
"""
from __future__ import annotations
import os
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class DataSourceConfig:
    repo:    str
    branch:  str
    subpath: str
    token:   str

    @property
    def configured(self) -> bool:
        return bool(self.repo and self.token)


def get_config() -> DataSourceConfig:
    """Read fresh from env every call so .env edits take effect without restart."""
    subpath = (os.getenv("DATA_REPO_SUBPATH") or "").strip().strip("/")
    if subpath:
        subpath = subpath + "/"
    return DataSourceConfig(
        repo=(os.getenv("DATA_REPO") or "").strip(),
        branch=(os.getenv("DATA_REPO_BRANCH") or "main").strip(),
        subpath=subpath,
        token=(os.getenv("GITHUB_TOKEN") or "").strip(),
    )


def status() -> dict[str, object]:
    """Lightweight diagnostic for the frontend so it can disable the Fetch
    button when the backend isn't configured."""
    cfg = get_config()
    return {
        "configured": cfg.configured,
        "repo":       cfg.repo or None,
        "branch":     cfg.branch,
        "subpath":    cfg.subpath or None,
        "token_set":  bool(cfg.token),
    }


class FetchError(RuntimeError):
    def __init__(self, message: str, http_status: int | None = None):
        super().__init__(message)
        self.http_status = http_status


async def fetch_raw(filename: str) -> bytes:
    """Fetch one file from the configured repo. Filename is treated as relative
    to DATA_REPO_SUBPATH (if any). Returns the raw bytes."""
    cfg = get_config()
    if not cfg.configured:
        raise FetchError(
            "Data fetch is not configured. Set DATA_REPO and GITHUB_TOKEN in api/.env.",
            http_status=503,
        )

    path = f"{cfg.subpath}{filename}"
    url  = f"https://api.github.com/repos/{cfg.repo}/contents/{path}"
    headers = {
        "Authorization": f"Bearer {cfg.token}",
        "Accept":        "application/vnd.github.raw",
        "User-Agent":    "healthforecast-ai",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    params = {"ref": cfg.branch}

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code == 200:
        return resp.content
    if resp.status_code == 404:
        raise FetchError(
            f"File '{path}' not found on branch '{cfg.branch}' of {cfg.repo}. "
            f"Check the filename and DATA_REPO_SUBPATH.",
            http_status=404,
        )
    if resp.status_code == 401:
        raise FetchError(
            "GitHub rejected the token (401). Generate a new fine-grained token "
            "with read-only Contents access to the data repo.",
            http_status=401,
        )
    if resp.status_code == 403:
        raise FetchError(
            "GitHub forbids access (403). The token may not have access to this "
            "repo, or you may be rate-limited.",
            http_status=403,
        )
    raise FetchError(
        f"GitHub returned {resp.status_code}: {resp.text[:200]}",
        http_status=resp.status_code,
    )
