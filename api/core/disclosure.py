"""What the public app may say about forecast accuracy.

Governance rule: accuracy percentages, MAPE and MASE are admin-only. Front-line
users get the forecast, its range, the typical miss in patients, and a
plain-English verdict on whether it beats a simple rule — never a score that
invites them to anchor on a single percentage.

The figures are still computed and cached in full, because the admin view, the
optimiser and the tests all need them. Redaction happens on the way out, as a
copy, so the shared `/last` result every consumer reads is never altered.
"""
from __future__ import annotations

from typing import Any

_EXACT = frozenset({
    "mape", "mase", "accuracy_pct", "confidence_pct", "confidence_tier",
    "accuracy_gain_pts",
})
_SUFFIXES = ("_mape", "_mase", "accuracy_pct", "_pct_error")

# Cheap pre-check on the raw response bytes: most responses contain none of
# these, and can skip the parse entirely.
MARKERS = (b"mape", b"MAPE", b"mase", b"accuracy", b"confidence_", b"_pct_error")


def is_accuracy_key(key: Any) -> bool:
    if not isinstance(key, str):
        return False
    k = key.lower()
    return k in _EXACT or k.endswith(_SUFFIXES)


def redact_accuracy(obj: Any) -> Any:
    """A copy of `obj` with every accuracy field removed, at any depth."""
    if isinstance(obj, dict):
        return {k: redact_accuracy(v) for k, v in obj.items() if not is_accuracy_key(k)}
    if isinstance(obj, list):
        return [redact_accuracy(v) for v in obj]
    return obj
