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
import asyncio
import os
from dataclasses import dataclass
from pathlib import Path

import ssl

import certifi
import httpx
from dotenv import load_dotenv

# Use the OS trust store (Windows / macOS keychain) when available so corporate
# TLS inspection certificates are honoured. Falls back to certifi otherwise.
try:
    import truststore
    _SSL_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except ImportError:  # pragma: no cover
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


# Re-load api/.env each time so edits take effect without an uvicorn restart.
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


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
    if _ENV_PATH.exists():
        load_dotenv(_ENV_PATH, override=True)
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


# Network hiccups that are worth retrying (mid-stream drops, read timeouts).
_TRANSIENT_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.ConnectError,
    httpx.ConnectTimeout,
)
_MAX_ATTEMPTS = 4


def _raise_for_status(status: int, path: str, repo: str, branch: str, body: str = "") -> None:
    if status == 404:
        raise FetchError(
            f"File '{path}' not found on branch '{branch}' of {repo}. "
            f"Check the filename and DATA_REPO_SUBPATH.",
            http_status=404,
        )
    if status == 401:
        raise FetchError(
            "GitHub rejected the token (401). Generate a new fine-grained token "
            "with read-only Contents access to the data repo.",
            http_status=401,
        )
    if status == 403:
        raise FetchError(
            "GitHub forbids access (403). The token may not have access to this "
            "repo, or you may be rate-limited.",
            http_status=403,
        )
    raise FetchError(f"GitHub returned {status}: {body[:200]}", http_status=status)


async def _download_streaming(url: str, headers: dict, params: dict | None,
                              path: str, cfg: "DataSourceConfig") -> bytes:
    """Stream a GET into a buffer. Streaming (vs .content) copes far better with
    large files: we read in chunks instead of waiting on one giant body."""
    buf = bytearray()
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0),
                                 verify=_SSL_CONTEXT, follow_redirects=True) as client:
        async with client.stream("GET", url, headers=headers, params=params) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", "replace")
                _raise_for_status(resp.status_code, path, cfg.repo, cfg.branch, body)
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                buf.extend(chunk)
    return bytes(buf)


async def fetch_raw(filename: str) -> bytes:
    """Fetch one file from the configured repo. Filename is relative to
    DATA_REPO_SUBPATH (if any). Returns the raw bytes.

    Primary path is the raw CDN (raw.githubusercontent.com) — it is built for
    serving file content and handles multi-MB files far more reliably than the
    Contents API, which drops the stream on large files (e.g. the ~11 MB hourly
    clinical CSV). We stream the body and retry transient mid-stream drops, then
    fall back to the Contents API as a last resort."""
    cfg = get_config()
    if not cfg.configured:
        raise FetchError(
            "Data fetch is not configured. Set DATA_REPO and GITHUB_TOKEN in api/.env.",
            http_status=503,
        )

    path = f"{cfg.subpath}{filename}"
    raw_url = f"https://raw.githubusercontent.com/{cfg.repo}/{cfg.branch}/{path}"
    raw_headers = {
        "Authorization": f"Bearer {cfg.token}",
        "User-Agent":    "healthforecast-ai",
    }
    api_url = f"https://api.github.com/repos/{cfg.repo}/contents/{path}"
    api_headers = {
        "Authorization": f"Bearer {cfg.token}",
        "Accept":        "application/vnd.github.raw",
        "User-Agent":    "healthforecast-ai",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    last_exc: Exception | None = None
    # Try the raw CDN first (fast + reliable), then the Contents API as fallback.
    targets = [
        (raw_url, raw_headers, None),
        (api_url, api_headers, {"ref": cfg.branch}),
    ]
    for url, headers, params in targets:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                return await _download_streaming(url, headers, params, path, cfg)
            except FetchError as e:
                # 404 means wrong path on this endpoint — fall through to the next
                # target; any other HTTP error is terminal.
                if e.http_status == 404:
                    last_exc = e
                    break
                raise
            except _TRANSIENT_ERRORS as e:
                last_exc = e
                # brief backoff before retrying the same endpoint
                if attempt < _MAX_ATTEMPTS:
                    await asyncio.sleep(0.6 * attempt)
                continue

    if isinstance(last_exc, FetchError):
        raise last_exc
    raise FetchError(
        f"Could not download '{path}' after retries on both the raw CDN and the "
        f"Contents API. Last error: {type(last_exc).__name__}: {last_exc}",
        http_status=504,
    )
