"""Confidentiality safety-net: scrub any hospital-identifying name from AI output.

The model has a very strong prior and will sometimes name the real hospital even
when the prompt forbids it. This is the guaranteed backstop — every AI response
(chat, explainers, briefing, actions) is passed through `scrub()` so no specific
hospital / city name can ever reach the user, regardless of what the model says.
"""
from __future__ import annotations
import re
from typing import Iterator

# (pattern, replacement). Case-insensitive. Order matters (longest first).
_PATTERNS = [
    (re.compile(r"steve[\s\-]*biko(?:\s+academic)?(?:\s+hospital)?", re.I), "the hospital"),
    (re.compile(r"\bSBAH\b"), "the hospital"),
    (re.compile(r"\bPretoria,?\s+South\s+Africa\b", re.I), "South Africa"),
    (re.compile(r"\bPretoria\b", re.I), "the region"),
    (re.compile(r"\b(?:Tshwane|Gauteng)\b", re.I), "the region"),
]

# Longest identifier we might need to hold back while streaming
# ("steve biko academic hospital" ≈ 28 chars). 40 gives comfortable margin so a
# name can never straddle the emit/hold boundary.
_HOLD = 40


def scrub(text: str) -> str:
    if not text:
        return text
    for pat, repl in _PATTERNS:
        text = pat.sub(repl, text)
    # tidy any doubled phrasing the substitution can create
    text = re.sub(r"\bthe hospital(\s+the hospital)+\b", "the hospital", text, flags=re.I)
    return text


def scrub_stream(chunks: Iterator[str]) -> Iterator[str]:
    """Redact a token stream safely. We scrub the WHOLE accumulated text each
    time (so an identifier split across chunks is still caught), then only emit
    up to len-_HOLD of the scrubbed output — holding back a tail long enough that
    a still-incomplete identifier can't be committed before it's scrubbed."""
    raw = ""
    committed = 0
    for ch in chunks:
        if not ch:
            continue
        raw += ch
        full = scrub(raw)
        safe = len(full) - _HOLD
        if safe > committed:
            yield full[committed:safe]
            committed = safe
    full = scrub(raw)
    if len(full) > committed:
        yield full[committed:]
