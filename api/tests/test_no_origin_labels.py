"""No user-visible text labels the inventory and scheduling data by origin.

Jonathan's decision (2026-11-11): the app does not call the data simulated
anywhere a user can read it; the presenter says so in person. The assistant
stays honest: if asked directly, it answers from the DATA ORIGIN note in its
system prompt. Internal names, file names and docs may keep the word.
"""
import json

import pytest
from fastapi.testclient import TestClient

from core import data_source, security, simulation_data
from core.pipeline import job
from tests import pipeline_fixtures as fx

WORD = "simulat"


def _has_word(obj) -> bool:
    return WORD in json.dumps(obj, default=str).lower()


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    for limiter in security.LIMITS.values():
        limiter._hits.clear()

    async def offline(filename):
        raise data_source.FetchError("offline in tests", http_status=503)
    monkeypatch.setattr(data_source, "fetch_raw", offline)
    import main
    return TestClient(main.app)


@pytest.fixture()
def finished_run(monkeypatch):
    """A real eight-stage run on the seed frames and the demo pack (whose
    data_origin is simulated), with no AI provider: Recommend ends amber."""
    from ai import config as ai_config
    monkeypatch.setattr(ai_config, "configured", lambda: False)
    monkeypatch.setattr(job, "_STATE", job._State())
    saved_uploaded, saved_meta = dict(simulation_data._UPLOADED), dict(simulation_data._META)
    fx.reset()
    fx.seed_all()
    job.start(source="sample")
    assert job.wait(300)
    yield job.status()
    fx.reset()
    simulation_data._UPLOADED.clear()
    simulation_data._UPLOADED.update(saved_uploaded)
    simulation_data._META.update(saved_meta)


def test_stage_receipts_tool_results_and_pages_never_say_simulated(client, finished_run, monkeypatch):
    s = finished_run
    assert s["results_ready"] is True and simulation_data.origin() == "simulated"
    for st in s["stages"]:
        assert not _has_word([st["receipt"], st["warnings"]]), st

    # Every payload a page or the assistant reads from this run.
    for path in ("/api/staff/overview", "/api/supply/overview", "/api/forecast/last",
                 "/api/optimization/last", "/api/supply/compare-last",
                 "/api/staff/strategy-compare-last", "/api/explore/findings",
                 "/api/optimization/forecast-options", "/api/pipeline/status"):
        body = client.get(path).json()
        text = json.dumps(body, default=str).lower()
        # The status's `origin` field is an internal code the UI never prints.
        if path == "/api/pipeline/status":
            body = {k: v for k, v in body.items() if k != "origin"}
            text = json.dumps(body, default=str).lower()
        assert WORD not in text, path

    from ai import tools
    monkeypatch.setattr(tools, "_get", lambda path: client.get(path).json())
    for name in ("get_forecast", "get_supply_status", "get_staff_status",
                 "get_optimization", "get_explore_findings"):
        out = tools.execute(name, {})
        assert not _has_word(out), (name, out)


def test_no_teaching_card_says_simulated():
    from ai import knowledge
    for key, card in knowledge.CARDS.items():
        assert WORD not in (card["title"] + " " + card["body"]).lower(), key


def test_the_report_email_never_says_simulated(client, monkeypatch):
    from ai import client as ai_client
    from core import notify

    def no_ai(*_a, **_k):
        raise ai_client.AIError("no provider in tests")
        yield  # pragma: no cover

    monkeypatch.setattr(ai_client, "stream_text", no_ai)
    monkeypatch.setattr(notify, "send_email", lambda **_k: True)
    r = client.post("/api/reports/email", json={
        "to": "someone@example.org", "pdf_base64": "", "context": {"week": "x"}})
    assert r.status_code == 200, r.text
    assert not _has_word(r.json())
    from ai import prompts
    assert WORD not in prompts.report_email_note().lower()


def test_the_assistant_is_told_not_to_volunteer_but_to_answer_truthfully(monkeypatch):
    from ai import chat
    assert "asks DIRECTLY" in chat.CHAT_SYSTEM
    assert "SIMULATED study data" not in chat.CHAT_SYSTEM
    monkeypatch.setitem(simulation_data._META, "origin", "simulated")
    note = chat.data_origin_note()
    assert "demonstration data" in note and "inventory and scheduling" in note
    assert chat._system_blocks(None)[-1]["text"] == note
    monkeypatch.setitem(simulation_data._META, "origin", "real")
    assert "uploaded" in chat.data_origin_note()
    assert "demonstration" not in chat.data_origin_note()


def test_explore_context_and_page_context_say_nothing_about_origin():
    from ai import context
    staff = context.build_staff_context({"kpis": {}, "ci": {}, "shifts": []})
    supply = context.build_supply_context({"kpis": {}, "ci": {}})
    opt = context.build_optimization_context({"supply": {"cost": {"before_zar": 1}}})
    for text in (staff, supply, opt):
        assert WORD not in text.lower() and "seed" not in text.lower()
