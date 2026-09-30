"""Provider wrapper around the Anthropic SDK, with Gemini as the fallback.

The ONLY place the Anthropic SDK is imported. Uses the OS trust store
(truststore) so it works behind TLS-inspecting corporate networks, the same as
core/data_source.py.

Provider order: Claude first whenever ANTHROPIC_API_KEY is set; Google Gemini
(ai/gemini.py) when Claude fails before saying anything — no key, no credit, an
outage — and GEMINI_API_KEY is set. Topping up the Anthropic account restores
Claude automatically; nothing needs redeploying.
"""
from __future__ import annotations
import logging
import ssl
import time
from functools import lru_cache

import httpx

from ai import config

try:
    import truststore
    _SSL_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except ImportError:  # pragma: no cover
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

log = logging.getLogger(__name__)


class AIError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client():
    import anthropic
    key = config.api_key()
    if not key:
        raise AIError("ANTHROPIC_API_KEY is not set in api/.env.")
    http = httpx.Client(verify=_SSL_CONTEXT, timeout=httpx.Timeout(120.0, connect=20.0))
    return anthropic.Anthropic(api_key=key, http_client=http)


# ── Provider fallback ────────────────────────────────────────────────────────
# A billing or auth failure will not fix itself in the next few seconds, so
# after one we skip Claude for a while instead of paying a failed round-trip on
# every question. Transient errors (overload, network) are retried next time.
_CLAUDE_PAUSE_SECONDS = 600
_claude_paused_until = 0.0


def _note_claude_failure(exc: Exception) -> None:
    global _claude_paused_until
    status = getattr(exc, "status_code", None)
    text = str(exc).lower()
    if status in (401, 403) or "credit balance" in text or "billing" in text:
        _claude_paused_until = time.monotonic() + _CLAUDE_PAUSE_SECONDS
    log.warning("Claude unavailable, falling back to Gemini: %s", exc)


def _claude_first() -> bool:
    if not config.api_key():
        return False
    if not config.gemini_key():
        return True          # nothing to fall back to: always try Claude
    return time.monotonic() >= _claude_paused_until


def with_fallback(primary, fallback):
    """Run the `primary` (Claude) generator; if it fails before yielding
    anything, run `fallback` (Gemini) instead. A failure after output has
    started is re-raised — half an answer from each model would be worse."""
    if _claude_first():
        emitted = False
        try:
            for item in primary():
                emitted = True
                yield item
            return
        except Exception as e:
            if emitted or not config.gemini_key():
                raise
            _note_claude_failure(e)
    if not config.gemini_key():
        raise AIError("No AI provider is configured.")
    yield from fallback()


def friendly(exc: Exception) -> str:
    """What the person in the chat sees. The exception itself goes to the log;
    an examiner or a nurse manager should never be shown 'BadRequestError'."""
    log.warning("assistant error: %r", exc)
    text = str(exc)
    if "429" in text or "rate" in text.lower() or "quota" in text.lower():
        return ("\n[The assistant is busy right now. Please wait a minute and ask "
                "again. The rest of the app works normally.]")
    return ("\n[The assistant is offline right now. The rest of the app works "
            "normally.]")


def stream_text(system: str, user_content: str, model: str, max_tokens: int = 700):
    """Stream the model's reply as text chunks. Yields ('delta', text) tuples,
    a ('model', name) tuple, then a final ('usage', {in,out}) tuple."""
    def _claude():
        client = _client()
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        ) as stream:
            for text in stream.text_stream:
                yield ("delta", text)
            final = stream.get_final_message()
        yield ("model", model)
        yield ("usage", {
            "in":  final.usage.input_tokens,
            "out": final.usage.output_tokens,
        })

    def _gemini():
        from ai import gemini
        # Gemini's thinking tokens count against max_tokens; leave headroom.
        yield from gemini.stream_text(system, user_content, max_tokens=max(max_tokens * 3, 2000))

    yield from with_fallback(_claude, _gemini)
