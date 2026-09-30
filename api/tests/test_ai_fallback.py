"""Claude -> Gemini fallback (ai/client.py, ai/gemini.py), with no network."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai import client, config, gemini  # noqa: E402


class _NoCredit(Exception):
    status_code = 400

    def __str__(self):
        return "Your credit balance is too low to access the Anthropic API."


@pytest.fixture()
def keys(monkeypatch):
    def set_keys(claude=True, gem=True):
        monkeypatch.setattr(config, "api_key", lambda: "sk-test" if claude else "")
        monkeypatch.setattr(config, "gemini_key", lambda: "g-test" if gem else "")
    monkeypatch.setattr(client, "_claude_paused_until", 0.0)
    return set_keys


def _claude_ok():
    yield "claude"


def _claude_broke():
    raise _NoCredit()
    yield  # pragma: no cover


def _gemini_ok():
    yield "gemini"


def test_claude_answers_when_it_can(keys):
    keys()
    assert list(client.with_fallback(_claude_ok, _gemini_ok)) == ["claude"]


def test_no_credit_falls_back_to_gemini_and_pauses_claude(keys):
    keys()
    assert list(client.with_fallback(_claude_broke, _gemini_ok)) == ["gemini"]
    calls = []

    def _claude_spy():
        calls.append(1)
        yield "claude"
    # Billing failures do not fix themselves in seconds: Claude is skipped now.
    assert list(client.with_fallback(_claude_spy, _gemini_ok)) == ["gemini"]
    assert calls == []


def test_gemini_only_deployment(keys):
    keys(claude=False)
    assert list(client.with_fallback(_claude_ok, _gemini_ok)) == ["gemini"]


def test_without_gemini_the_claude_error_surfaces(keys):
    keys(gem=False)
    with pytest.raises(_NoCredit):
        list(client.with_fallback(_claude_broke, _gemini_ok))


def test_friendly_message_never_shows_the_exception_name():
    msg = client.friendly(_NoCredit())
    assert "Error" not in msg and "offline" in msg


def test_gemini_tool_loop_runs_tools_then_answers(monkeypatch):
    replies = iter([
        {"message": {"content": "", "tool_calls": [{"id": "c1", "type": "function",
            "function": {"name": "get_forecast", "arguments": "{\"horizon\": 7}"}}]},
         "usage": {"in": 10, "out": 2}, "model": "gemini-2.5-flash"},
        {"message": {"content": "Monday is the peak at 78 patients."},
         "usage": {"in": 30, "out": 8}, "model": "gemini-2.5-flash"},
    ])
    sent = []

    def fake_complete(system, messages, **kw):
        sent.append([dict(m) for m in messages])
        return next(replies)
    monkeypatch.setattr(gemini, "complete", fake_complete)
    ran = []
    out = list(gemini.chat("sys", [{"role": "user", "content": "peak?"}], [],
                           lambda n, a: ran.append((n, a)) or {"peak": 78}, 4))
    assert ran == [("get_forecast", {"horizon": 7})]
    assert ("delta", "Monday is the peak at 78 patients.") in out
    assert ("usage", {"in": 40, "out": 10}) in out
    # The tool result went back to the model under the matching call id.
    assert sent[1][-1] == {"role": "tool", "tool_call_id": "c1", "content": "{\"peak\": 78}"}


def test_an_overloaded_gemini_model_hands_over_to_the_next(monkeypatch):
    class _R:
        def __init__(self, status, payload=None):
            self.status_code, self._p, self.text = status, payload, "high demand"

        def json(self):
            return self._p
    tried = []

    class _Http:
        def post(self, url, json, headers):
            tried.append(json["model"])
            if len(tried) == 1:
                return _R(503)
            return _R(200, {"choices": [{"message": {"content": "ok"}}], "usage": {}})
    monkeypatch.setattr(gemini, "_http", lambda: _Http())
    monkeypatch.setattr(config, "gemini_key", lambda: "g-test")
    monkeypatch.setattr(config, "gemini_models", lambda: ["first", "second"])
    res = gemini.complete("sys", [{"role": "user", "content": "hi"}])
    assert tried == ["first", "second"]
    assert res["model"] == "second" and res["message"]["content"] == "ok"


def test_gemini_usage_costs_nothing():
    assert config.cost_usd("gemini-2.5-flash", 10_000, 10_000) == 0.0
