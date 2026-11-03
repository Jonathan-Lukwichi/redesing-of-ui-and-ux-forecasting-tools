"""Action Center generator. Gathers live signals (forecast, supply, staff) via
the read-only tools, then asks the cheap model to turn them into a ranked,
plain-English action list. Suggestions only — humans approve."""
from __future__ import annotations
import copy
import json
import re
import threading
from datetime import datetime, timezone
from typing import Any

from ai import config, prompts, tools, redact
from ai.client import _client, with_fallback
from core import data_version


def gather_signals() -> dict[str, Any]:
    return {
        "forecast":     tools.execute("get_forecast", {"horizon": 7, "model": "ml"}),
        "optimization": tools.execute("get_optimization", {}),
        "supply":       tools.execute("get_supply_status", {}),
        "staff":        tools.execute("get_staff_status", {}),
    }


_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title":    {"type": "string"},
                    "reason":   {"type": "string"},
                    "category": {"type": "string", "enum": ["staff", "supply", "capacity"]},
                    "urgency":  {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["title", "reason", "category", "urgency"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["actions"],
    "additionalProperties": False,
}


def _ask_claude(content: str):
    client = _client()
    try:
        resp = client.messages.create(
            model=config.model_fast(),
            max_tokens=900,
            system=prompts.action_ranker(),
            messages=[{"role": "user", "content": content}],
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
        )
    except Exception as e:
        if getattr(e, "status_code", None) in (401, 403) or "credit balance" in str(e).lower():
            raise   # the account, not the schema: let the fallback take over
        # Fallback without structured-output constraint.
        resp = client.messages.create(
            model=config.model_fast(), max_tokens=900,
            system=prompts.action_ranker() + "\nReturn ONLY a JSON object: {\"actions\":[...]}.",
            messages=[{"role": "user", "content": content}],
        )
    text = "".join(b.text for b in resp.content if b.type == "text")
    yield (text, (resp.usage.input_tokens, resp.usage.output_tokens), config.model_fast())


def _ask_gemini(content: str):
    from ai import gemini
    res = gemini.complete(
        prompts.action_ranker() + "\nReturn ONLY a JSON object: {\"actions\":[...]}.",
        [{"role": "user", "content": content}], max_tokens=4000)
    yield (res["message"].get("content") or "", (res["usage"]["in"], res["usage"]["out"]),
           res["model"])


def generate() -> dict[str, Any]:
    signals = gather_signals()
    content = (
        "Here are the live operational signals. The 'optimization' block is the "
        "forecast-driven plan for next week (the cheapest lawful nurse roster that "
        "covers the forecast "
        "and the reorder plan) — prefer it as the basis for concrete actions: the "
        "nurse shortfall and locum hours, the busiest under-covered shifts, and the "
        "specific items to reorder. Turn them into a ranked action list (most "
        "urgent first). Only use numbers present here.\n\n<context>\n"
        + json.dumps(signals, default=str)
        + "\n</context>"
    )
    text, usage, model = next(with_fallback(lambda: _ask_claude(content),
                                            lambda: _ask_gemini(content)))

    actions = []
    try:
        actions = json.loads(text).get("actions", [])
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                actions = json.loads(m.group(0)).get("actions", [])
            except Exception:
                actions = []

    rank = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda a: rank.get(a.get("urgency"), 9))
    for i, a in enumerate(actions):
        a["id"] = i
        a["title"] = redact.scrub(a.get("title", ""))   # confidentiality safety-net
        a["reason"] = redact.scrub(a.get("reason", ""))
    return {"actions": actions, "usage": {"in": usage[0], "out": usage[1]}, "model": model}


# --- The stored list ----------------------------------------------------------
# The pipeline rebuilds the list once per run; the Action Center then reads that
# stored list, so opening the page never spends an AI call. The on-demand path
# in the route is the fallback only when nothing is stored.

_LOCK = threading.Lock()
_STORED: dict[str, Any] | None = None


def stored() -> dict[str, Any] | None:
    """A copy of the stored list, or None. A copy, because callers decorate it."""
    with _LOCK:
        return copy.deepcopy(_STORED)


def clear_stored() -> None:
    global _STORED
    with _LOCK:
        _STORED = None


def record_usage(out: dict[str, Any]) -> dict[str, Any]:
    """Telemetry and audit for one generation, once, when the list is made.
    Removes `usage` and `model` from `out` and returns it."""
    from ai import audit, telemetry
    u = out.pop("usage", None)
    model = out.pop("model", None) or config.model_fast()
    in_t = (u or {}).get("in", 0)
    out_t = (u or {}).get("out", 0)
    if u:
        telemetry.record("actions", model, in_t, out_t)
    audit.log_event("actions", model, "live forecast/staff/supply/optimization signals",
                    json.dumps(out.get("actions", []), default=str), in_t, out_t)
    return out


def build_and_store() -> dict[str, Any]:
    """Generate the list, record its usage, keep it. Raises what generate() raises."""
    global _STORED
    version = data_version.current()
    out = record_usage(generate())
    out["built_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out["data_version"] = version
    with _LOCK:
        # A run that invalidated the data while we were generating owns the cache.
        if data_version.current() == version:
            _STORED = copy.deepcopy(out)
    return out


data_version.register("actions", clear_stored)
