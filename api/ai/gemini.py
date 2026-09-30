"""Google Gemini as the fallback provider.

Used when Claude is unavailable (no key, no credit, outage) and GEMINI_API_KEY
is set. Talks to Gemini's OpenAI-compatible endpoint over plain httpx, so it
needs no extra SDK and goes through the same OS trust store as the Anthropic
client (corporate TLS inspection).

Same governance as the Claude path: the same system prompt, the same read-only
tools filtered to the caller's territory, the same redaction on the way out.

Privacy note: on Google's free tier, prompts may be used to improve Google's
products. What the assistant sends is aggregate operational figures (daily
counts, rosters, stock levels) with the hospital's identity scrubbed — never
patient-level records.
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Iterator

import httpx

from ai import config
from ai.client import AIError, _SSL_CONTEXT

_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
_TRY_NEXT_MODEL = (429, 500, 503, 504)   # overloaded or out of quota, not a bad request


@lru_cache(maxsize=1)
def _http() -> httpx.Client:
    return httpx.Client(verify=_SSL_CONTEXT, timeout=httpx.Timeout(120.0, connect=20.0))


def _openai_tools(anthropic_schemas: list[dict]) -> list[dict]:
    """Anthropic tool schemas -> OpenAI function tools (same JSON schema body)."""
    return [{"type": "function", "function": {
        "name": s["name"], "description": s["description"],
        "parameters": s.get("input_schema") or {"type": "object", "properties": {}},
    }} for s in anthropic_schemas]


def complete(system: str, messages: list[dict], *, tools: list[dict] | None = None,
             max_tokens: int = 1500, tool_choice: str | None = None) -> dict[str, Any]:
    """One non-streaming call. Returns {message, usage:{in,out}}."""
    key = config.gemini_key()
    if not key:
        raise AIError("GEMINI_API_KEY is not set.")
    body: dict[str, Any] = {
        "messages": [{"role": "system", "content": system}] + messages,
        "max_tokens": max_tokens,
    }
    if tools:
        body["tools"] = _openai_tools(tools)
        if tool_choice:
            body["tool_choice"] = tool_choice
    # Free-tier models return 503 "high demand" or 429 "quota" often enough to
    # matter in a live demo. Each model has its own capacity and quota, so the
    # next model in line usually answers at once.
    last = ""
    for model in config.gemini_models():
        body["model"] = model
        r = _http().post(_URL, json=body, headers={"Authorization": f"Bearer {key}"})
        if r.status_code == 200:
            data = r.json()
            u = data.get("usage") or {}
            return {"message": data["choices"][0]["message"], "model": model,
                    "usage": {"in": int(u.get("prompt_tokens") or 0),
                              "out": int(u.get("completion_tokens") or 0)}}
        last = f"Gemini returned {r.status_code}: {r.text[:300]}"
        if r.status_code not in _TRY_NEXT_MODEL:
            break
    raise AIError(last)


def stream_text(system: str, user_content: str, max_tokens: int = 1500):
    """Same event shape as ai.client.stream_text, in one chunk."""
    res = complete(system, [{"role": "user", "content": user_content}], max_tokens=max_tokens)
    yield ("delta", res["message"].get("content") or "")
    yield ("model", res["model"])
    yield ("usage", res["usage"])


def chat(system: str, messages: list[dict], tool_schemas: list[dict], execute,
         max_rounds: int) -> Iterator[tuple[str, object]]:
    """The tool loop, mirroring ai.chat.stream_chat. `execute(name, args)` runs
    a read-only tool. Yields ('delta', text) then ('usage', {in,out})."""
    convo = [{"role": m["role"], "content": m["content"]} for m in messages]
    usage = {"in": 0, "out": 0}
    for round_no in range(max_rounds + 1):
        forced = round_no == max_rounds
        res = complete(system, convo, tools=tool_schemas,
                       tool_choice="none" if forced else None)
        usage["in"] += res["usage"]["in"]
        usage["out"] += res["usage"]["out"]
        msg = res["message"]
        calls = msg.get("tool_calls") or []
        if calls and not forced:
            convo.append({"role": "assistant", "content": msg.get("content") or "",
                          "tool_calls": calls})
            for call in calls:
                fn = call.get("function") or {}
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except ValueError:
                    args = {}
                out = execute(fn.get("name", ""), args)
                convo.append({"role": "tool", "tool_call_id": call.get("id", ""),
                              "content": json.dumps(out, default=str)})
            continue
        yield ("delta", msg.get("content") or "")
        yield ("model", res["model"])
        break
    yield ("usage", usage)
