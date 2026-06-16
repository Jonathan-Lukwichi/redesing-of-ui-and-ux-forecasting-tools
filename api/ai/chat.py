"""Ask-chat: a read-only, tool-using assistant over the live app data.

Runs a manual tool loop on the reasoning-tier model (Sonnet), then yields the
final answer. Read-only by design — it can look things up but never act.
"""
from __future__ import annotations
from typing import Iterator

from ai import config, prompts, tools
from ai.client import _client, AIError

CHAT_SYSTEM = (
    prompts.GROUNDING + "\n\n"
    "You are the HealthForecast operations assistant. Answer questions about ED "
    "arrivals, staffing, and supplies. Use your tools to look up live numbers — "
    "do not answer from memory. Only state numbers that came from a tool result or "
    "the conversation; if a tool returns an error, tell the user plainly what to do "
    "(e.g. build G1/G3 on the Prepare page, or fetch the data). Keep answers short, "
    "concrete, and in plain English. Do NOT use markdown tables, headings, or emoji — "
    "write short paragraphs and simple dash bullets only, so it reads cleanly in a chat.\n\n"
    "You can ONLY read. You cannot change a schedule, place a supply order, or move "
    "stock. If asked to do any of those, explain that a human must review and approve "
    "the action on the relevant page (Staff, Supply, or Action Center)."
)


def stream_chat(messages: list[dict]) -> Iterator[tuple[str, object]]:
    """messages: [{role:'user'|'assistant', content:str}]. Yields ('delta', text)
    chunks then ('usage', {in,out})."""
    client = _client()
    model = config.model_reasoning()
    convo: list[dict] = [{"role": m["role"], "content": m["content"]} for m in messages]
    in_tok = out_tok = 0

    for _round in range(4):  # cap tool rounds
        resp = client.messages.create(
            model=model, max_tokens=900, system=CHAT_SYSTEM,
            tools=tools.TOOL_SCHEMAS, messages=convo,
        )
        in_tok += resp.usage.input_tokens
        out_tok += resp.usage.output_tokens

        if resp.stop_reason == "tool_use":
            convo.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    out = tools.execute(block.name, block.input or {})
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": __import__("json").dumps(out, default=str),
                    })
            convo.append({"role": "user", "content": results})
            continue

        # Final answer — emit its text.
        for block in resp.content:
            if block.type == "text" and block.text:
                yield ("delta", block.text)
        break

    yield ("usage", {"in": in_tok, "out": out_tok})
