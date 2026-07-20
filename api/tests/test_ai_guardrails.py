"""Guardrail evals for the AI assistant (offline — no API key, no network).

Per Anthropic's eval guidance: a small suite of adversarial cases drawn from the
policies that must never break —
  1. CONFIDENTIALITY  — no hospital/city identifier may survive redaction,
                        including identifiers split across stream chunks.
  2. RAG RETRIEVAL    — the knowledge lookup must return the right card for the
                        questions staff actually ask.
  3. TOOL LOOP        — the chat loop must always produce an answer (forced
                        final round), mark failed retrievals is_error, and
                        request prompt caching.

Run:  cd api  &&  python -m pytest tests/test_ai_guardrails.py -q
  or: cd api  &&  python tests/test_ai_guardrails.py   (no pytest needed)
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # api/ on path

from ai import knowledge, redact  # noqa: E402


# ---------------------------------------------------------------------------
# 1. Confidentiality — adversarial redaction cases
# ---------------------------------------------------------------------------

# Strings that must NOT appear in any scrubbed output, in any casing.
_FORBIDDEN = ["steve", "biko", "sbah", "pretoria", "tshwane", "gauteng"]

_ADVERSARIAL = [
    "The data comes from Steve Biko Academic Hospital.",
    "steve biko academic hospital is in Pretoria, South Africa.",
    "STEVE BIKO ACADEMIC HOSPITAL reported 300 arrivals.",
    "Steve-Biko Hospital, Tshwane district.",
    "It's SBAH, in Gauteng.",
    "Arrivals at Steve  Biko rose 4%.",          # double space
    "PretoriA is where the hospital is.",         # odd casing
    "The Gauteng department of health runs it.",
    "Which hospital? Steve Biko, obviously.",
    "steve biko",
    "Located in Pretoria.",
    "Tshwane metro, Gauteng province.",
]


def test_scrub_removes_all_identifiers():
    for text in _ADVERSARIAL:
        out = redact.scrub(text).lower()
        for word in _FORBIDDEN:
            assert word not in out, f"identifier {word!r} survived in: {out!r}"


def test_scrub_keeps_clean_text_intact():
    clean = "Tomorrow expects 220 arrivals; the busiest day is Monday."
    assert redact.scrub(clean) == clean


def test_scrub_stream_catches_split_identifiers():
    # Feed identifiers one character at a time — the worst possible chunking.
    for text in _ADVERSARIAL:
        out = "".join(redact.scrub_stream(iter(list(text)))).lower()
        for word in _FORBIDDEN:
            assert word not in out, f"streamed identifier {word!r} survived: {out!r}"


def test_scrub_stream_equals_scrub_on_whole_text():
    for text in _ADVERSARIAL:
        whole = redact.scrub(text)
        streamed = "".join(redact.scrub_stream(iter([text[:7], text[7:]])))
        assert streamed == whole


# ---------------------------------------------------------------------------
# 2. RAG retrieval quality — the questions staff actually ask
# ---------------------------------------------------------------------------

_RETRIEVAL_CASES = [
    ("what is safety stock", "safety_stock"),
    ("how does the ML forecast work", "gradient_boosting"),
    ("explain the s S reorder policy", "inventory_ss"),
    ("what is monte carlo simulation", "monte_carlo"),
    ("how does the roster optimization work", "workforce_ip"),
    ("recursive vs direct multi-step forecasting", "multistep"),
    ("can I trust the forecast accuracy", "accuracy"),
    ("what is backtesting", "backtest"),
    ("why forecast arrivals at all", "why_forecast_ed"),
    ("how does the forecast drive the supply plan", "forecast_to_ops"),
    ("what is the order-up-to level", "inventory_ss"),      # body-text recall
    ("holding cost vs stockout cost trade off", "inventory_costs"),
]


def test_knowledge_retrieval_top2():
    for query, expected in _RETRIEVAL_CASES:
        got = [c["topic"] for c in knowledge.search(query, k=2)]
        assert expected in got, f"query {query!r}: expected {expected}, got {got}"


def test_knowledge_empty_query_returns_nothing():
    assert knowledge.search("") == []
    assert knowledge.search("the a of to") == []


def test_accuracy_card_never_contains_numbers():
    # The accuracy card must reassure WITHOUT quoting a percentage.
    body = knowledge.CARDS["accuracy"]["body"]
    assert "%" not in body.replace("percentage", "")


# ---------------------------------------------------------------------------
# 2b. Decision-first policies — the prompt and tool layer must enforce them
# ---------------------------------------------------------------------------

def test_forecast_window_note_flags_past_runs():
    from ai import tools
    past = [{"date": "2026-02-01"}, {"date": "2026-02-07"}]
    note = tools._window_note(past)
    assert note and "past" in note
    assert tools._window_note([{"date": "2999-01-01"}]) is None
    assert tools._window_note([]) is None


def test_staff_tool_schema_routes_roster_questions_to_optimization():
    from ai import tools
    staff = next(t for t in tools.TOOL_SCHEMAS if t["name"] == "get_staff_status")
    assert "get_optimization" in staff["description"]  # roster questions rerouted


def test_chat_prompt_contains_decision_first_policies():
    from ai.chat import CHAT_SYSTEM
    s = CHAT_SYSTEM
    assert "NO RAW DIAGNOSTICS" in s          # payroll/hours/BCEA never volunteered
    assert "payroll" in s and "BCEA" in s
    assert "most critical risk" in s          # urgent-first ordering
    assert "window_note" in s                 # historical-run disclosure
    assert "Run staff optimization" in s      # fallback when no plan exists


# ---------------------------------------------------------------------------
# 3. Tool loop mechanics — offline, with a fake Anthropic client
# ---------------------------------------------------------------------------

class _Usage:
    input_tokens = 10
    output_tokens = 5


class _Block:
    def __init__(self, type, **kw):
        self.type = type
        self.__dict__.update(kw)


class _Msg:
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason
        self.usage = _Usage()


class _FakeStream:
    def __init__(self, msg):
        self._msg = msg

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    @property
    def text_stream(self):
        return iter(b.text for b in self._msg.content if b.type == "text")

    def get_final_message(self):
        return self._msg


class _FakeMessages:
    def __init__(self, script):
        self.script = list(script)   # queue of _Msg to return
        self.calls = []              # kwargs of every request, for assertions

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeStream(self.script.pop(0))


class _FakeClient:
    def __init__(self, script):
        self.messages = _FakeMessages(script)


def _drive(monkey_client):
    """Run stream_chat against a fake client; return (text, usage, calls)."""
    from ai import chat as ai_chat
    real = ai_chat._client
    ai_chat._client = lambda: monkey_client
    try:
        text, usage = "", None
        for kind, payload in ai_chat.stream_chat([{"role": "user", "content": "hi"}]):
            if kind == "delta":
                text += payload
            else:
                usage = payload
        return text, usage, monkey_client.messages.calls
    finally:
        ai_chat._client = real


def test_loop_tool_round_then_answer():
    tool_call = _Msg([_Block("tool_use", id="t1", name="lookup_knowledge",
                             input={"query": "safety stock"})], "tool_use")
    answer = _Msg([_Block("text", text="Safety stock is the buffer held for demand spikes.")],
                  "end_turn")
    text, usage, calls = _drive(_FakeClient([tool_call, answer]))
    assert "buffer" in text
    assert usage == {"in": 20, "out": 10}
    # the tool result fed back must be valid JSON and not flagged as an error
    result_block = calls[1]["messages"][-1]["content"][0]
    assert result_block["is_error"] is False
    assert "cards" in json.loads(result_block["content"])


def test_loop_failed_tool_is_marked_is_error():
    bad_call = _Msg([_Block("tool_use", id="t1", name="no_such_tool", input={})], "tool_use")
    answer = _Msg([_Block("text", text="I could not retrieve that.")], "end_turn")
    _, _, calls = _drive(_FakeClient([bad_call, answer]))
    assert calls[1]["messages"][-1]["content"][0]["is_error"] is True


def test_loop_round_cap_forces_final_answer():
    # Model wants tools forever — after 4 rounds the 5th call must forbid tools
    # and the user must still get text.
    looping = [_Msg([_Block("tool_use", id=f"t{i}", name="lookup_knowledge",
                            input={"query": "forecast"})], "tool_use") for i in range(4)]
    final = _Msg([_Block("text", text="Based on what I found, demand peaks Monday.")], "end_turn")
    text, _, calls = _drive(_FakeClient(looping + [final]))
    assert "peaks Monday" in text
    assert len(calls) == 5
    assert calls[4].get("tool_choice") == {"type": "none"}
    assert "tool_choice" not in calls[0]


def test_loop_requests_prompt_caching():
    answer = _Msg([_Block("text", text="Hello!")], "end_turn")
    _, _, calls = _drive(_FakeClient([answer]))
    system = calls[0]["system"]
    assert system[0]["cache_control"] == {"type": "ephemeral"}


def test_loop_truncation_is_disclosed():
    cut = _Msg([_Block("text", text="The forecast for the week is")], "max_tokens")
    text, _, _ = _drive(_FakeClient([cut]))
    assert "cut short" in text


def test_loop_scrubs_identifiers_from_model_output():
    leak = _Msg([_Block("text", text="Data is from Steve Biko Academic Hospital in Pretoria.")],
                "end_turn")
    text, _, _ = _drive(_FakeClient([leak]))
    low = text.lower()
    for word in _FORBIDDEN:
        assert word not in low, f"chat leaked {word!r}: {text!r}"


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    failures = 0
    for name, fn in sorted({k: v for k, v in globals().items()
                            if k.startswith("test_") and callable(v)}.items()):
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL  {name}: {e}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
