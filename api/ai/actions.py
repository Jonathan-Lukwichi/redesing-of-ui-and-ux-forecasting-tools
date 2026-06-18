"""Action Center generator. Gathers live signals (forecast, supply, staff) via
the read-only tools, then asks the cheap model to turn them into a ranked,
plain-English action list. Suggestions only — humans approve."""
from __future__ import annotations
import json
import re
from typing import Any

from ai import config, prompts, tools
from ai.client import _client


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


def generate() -> dict[str, Any]:
    signals = gather_signals()
    client = _client()
    content = (
        "Here are the live operational signals. The 'optimization' block is the "
        "forecast-driven plan for next week (the cost-minimal lawful nurse roster "
        "and the reorder plan) — prefer it as the basis for concrete actions: the "
        "nurse shortfall and locum hours, the busiest under-covered shifts, and the "
        "specific items to reorder. Turn them into a ranked action list (most "
        "urgent first). Only use numbers present here.\n\n<context>\n"
        + json.dumps(signals, default=str)
        + "\n</context>"
    )
    try:
        resp = client.messages.create(
            model=config.model_fast(),
            max_tokens=900,
            system=prompts.action_ranker(),
            messages=[{"role": "user", "content": content}],
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        usage = (resp.usage.input_tokens, resp.usage.output_tokens)
    except Exception:
        # Fallback without structured-output constraint.
        resp = client.messages.create(
            model=config.model_fast(), max_tokens=900,
            system=prompts.action_ranker() + "\nReturn ONLY a JSON object: {\"actions\":[...]}.",
            messages=[{"role": "user", "content": content}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        usage = (resp.usage.input_tokens, resp.usage.output_tokens)

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
    return {"actions": actions, "usage": {"in": usage[0], "out": usage[1]}}
