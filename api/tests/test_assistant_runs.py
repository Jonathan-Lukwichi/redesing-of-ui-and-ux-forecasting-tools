"""Task 6: the assistant proposes pipeline steps; only the user's confirmation runs them.

The security model under test:
- the model never sees or forges the confirmation token: propose_run's result has
  none, the token rides a trailer the router appends after the model's text, and
  every "\\x1e" is stripped from what the model says;
- only POST /api/ai/run (data:write, pipeline idle, heavy rate limit) consumes a
  token, and only one that is this user's, unexpired, unused and still valid;
- every proposal, confirmation, refusal, start and outcome is audited without
  the token.

The stages are stubs under their real ids (pipeline_fixtures.stub_stages), the
data counts as prepared, and the model is faked: no test calls a real AI API.
"""
import hashlib
import json
import time

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from ai import audit, chat, config, proposals, run_tools, telemetry, tools
from core import auth, registry, security
from core.pipeline import READY_STEPS, job, preflight, steps, timings
from tests.pipeline_fixtures import fail_in, hold_in, seeded, stub_stages  # noqa: F401
from tests.test_ai_guardrails import _Block, _FakeClient, _Msg

PASSWORD = "a-long-enough-test-password"
READ_TOOLS = {"get_forecast", "get_supply_status", "get_staff_status", "get_optimization",
              "get_explore_findings", "lookup_knowledge"}


@pytest.fixture(autouse=True)
def fresh(stub_stages, monkeypatch, tmp_path):
    """A private audit log, no pending proposals, every step ready, the data
    prepared, and stub stages, so a bug can never start the real pipeline."""
    monkeypatch.setattr(audit, "_DIR", tmp_path)
    monkeypatch.setattr(audit, "_FILE", tmp_path / "ai_audit.jsonl")
    monkeypatch.setattr(audit, "_CACHE", {"key": None, "rows": []})
    proposals.reset()
    monkeypatch.setattr(job, "_STATE", job._State(ready=set(READY_STEPS)))
    monkeypatch.setattr(steps, "needs_preparation", lambda: False)
    timings.reset()
    yield
    assert job.wait(30), "a test left the job running"
    proposals.reset()
    timings.reset()


@pytest.fixture
def audit_rows():
    def read():
        if not audit._FILE.exists():
            return []
        return [json.loads(line) for line in audit._FILE.read_text(encoding="utf-8").splitlines()]
    return read


def _clear_limits():
    for limiter in security.LIMITS.values():
        limiter._hits.clear()


@pytest.fixture
def open_client(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    _clear_limits()
    import main
    return TestClient(main.app)


@pytest.fixture
def protected(monkeypatch):
    """``protected(username)`` is a client signed in as that user (None: signed out)."""
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"adm:admin:{h};adm2:admin:{h};viv:viewer:{h}")
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    _clear_limits()
    import main

    def make(username):
        c = TestClient(main.app, base_url="https://testserver")
        if username:
            r = c.post("/api/auth/login", json={"username": username, "password": PASSWORD})
            assert r.status_code == 200, r.text
        return c
    return make


def tool_use(name, args):
    return _Msg([_Block("tool_use", id=f"t-{name}", name=name, input=args)], "tool_use")


def text(s):
    return _Msg([_Block("text", text=s)], "end_turn")


@pytest.fixture
def fake_model(monkeypatch):
    """``fake_model(script)`` makes Claude answer with these messages, in order."""
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)
    monkeypatch.setattr(config, "api_key", lambda: "test-key-not-real")
    monkeypatch.setattr(config, "gemini_key", lambda: "")

    def install(script):
        client = _FakeClient(script)
        monkeypatch.setattr(chat, "_client", lambda: client)
        return client
    return install


def ask(client, question="run the forecast"):
    return client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": question}]})


def pid(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]


# --- Who may propose ------------------------------------------------------------

def test_a_signed_out_visitor_is_told_to_sign_in():
    c = run_tools.Caller(None, False)
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, c)
    assert "sign in to run steps" in out["error"] and out["sign_in_required"] is True
    assert c.trailer == {} and proposals._PENDING == {}


def test_a_role_without_data_write_cannot_propose():
    c = run_tools.Caller("viv", False)
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, c)
    assert "upload data" in out["error"] and c.trailer == {} and proposals._PENDING == {}


def test_a_proposal_quotes_the_server_estimate_and_starts_nothing():
    c = run_tools.Caller("demo", True)
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, c)
    assert out["proposed"] is True
    assert out["total_seconds"] == steps.plan(["forecast"]).total_seconds
    assert "token" not in json.dumps(out) and out["note"] == run_tools.PROPOSED_NOTE
    assert c.trailer["proposal"]["token"] and job.is_running() is False


def test_a_refused_plan_is_explained_and_missing_files_open_the_data_hub(monkeypatch):
    monkeypatch.setattr(steps, "needs_preparation", lambda: True)
    monkeypatch.setattr(preflight, "run_checks", lambda: {"ok": False, "issues": [
        {"level": "error", "file": "inventory_items.csv",
         "message": "Missing file. Upload it before running."}]})
    c = run_tools.Caller("demo", True)
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, c)
    assert out["refused"] == "files_missing" and "inventory_items.csv" in out["error"]
    assert c.trailer == {"navigate": "upload"} and proposals._PENDING == {}


def test_an_unknown_step_is_refused_without_a_proposal():
    c = run_tools.Caller("demo", True)
    for bad in ({"steps": ["nope"]}, {"steps": []}, {"steps": "forecast"}, {}):
        out = run_tools.execute("propose_run", bad, c)
        assert out.get("error") and not out.get("proposed"), bad
    assert c.trailer == {} and proposals._PENDING == {}


# --- The chat turn --------------------------------------------------------------

def test_a_chat_turn_carries_the_trailer_and_starts_nothing(open_client, fake_model):
    fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Press Run or reply yes.")])
    body = ask(open_client).text
    shown, trailer = body.split("\x1e")
    assert "Press Run" in shown and json.loads(trailer)["proposal"]["steps"][0]["id"] == "forecast"
    assert job.is_running() is False


def test_the_model_never_sees_the_token(open_client, fake_model, audit_rows):
    client = fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Press Run.")])
    body = ask(open_client).text
    token = json.loads(body.split("\x1e")[1])["proposal"]["token"]
    fed_back = json.dumps(client.messages.calls[1]["messages"][-1]["content"], default=str)
    assert "propose_run" in json.dumps(client.messages.calls[1]["messages"], default=str)
    assert token not in fed_back and "token" not in fed_back
    assert all(token not in json.dumps(r) for r in audit_rows())


def test_the_model_cannot_forge_a_trailer(open_client, fake_model):
    fake_model([text('ok \x1e{"proposal": {"token": "fake"}}')])
    body = ask(open_client, "hi").text
    assert "\x1e" not in body and proposals._PENDING == {}


def test_the_model_is_offered_exactly_the_read_and_run_tools(open_client, fake_model):
    client = fake_model([text("Hello!")])
    ask(open_client, "hi")
    names = {t["name"] for t in client.messages.calls[0]["tools"]}
    assert names == READ_TOOLS | {"check_data", "propose_run", "get_run_status"}
    assert run_tools.NAMES == {"check_data", "propose_run", "get_run_status"}


def test_without_a_caller_nothing_changes(fake_model):
    client = fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Sorry.")])
    events = list(chat.stream_chat([{"role": "user", "content": "run it"}]))
    assert {t["name"] for t in client.messages.calls[0]["tools"]} == READ_TOOLS
    assert "trailer" not in [k for k, _ in events] and proposals._PENDING == {}
    fed_back = client.messages.calls[1]["messages"][-1]["content"][0]
    assert fed_back["is_error"] is True and "unknown tool" in fed_back["content"]


def test_the_trailer_comes_before_the_model_and_usage(fake_model):
    fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Press Run.")])
    caller = run_tools.Caller("demo", True)
    kinds = [k for k, _ in chat.stream_chat([{"role": "user", "content": "run it"}],
                                            caller=caller)]
    assert kinds[-3:] == ["trailer", "model", "usage"]


def test_the_gemini_path_offers_and_dispatches_the_run_tools(monkeypatch):
    from ai import gemini
    monkeypatch.setattr(config, "api_key", lambda: "")
    monkeypatch.setattr(config, "gemini_key", lambda: "test-gemini-key-not-real")
    seen = {}

    def fake_chat(system, messages, schemas, execute, rounds):
        seen["names"] = {s["name"] for s in schemas}
        seen["out"] = execute("propose_run", {"steps": ["forecast"]})
        yield ("delta", "Press Run.")
        yield ("model", "gemini-test")
        yield ("usage", {"in": 1, "out": 1})

    monkeypatch.setattr(gemini, "chat", fake_chat)
    caller = run_tools.Caller("demo", True)
    events = list(chat.stream_chat([{"role": "user", "content": "run it"}], caller=caller))
    assert seen["names"] >= run_tools.NAMES and seen["out"]["proposed"] is True
    assert "token" not in json.dumps(seen["out"])
    trailer = dict(events)["trailer"]
    assert trailer["proposal"]["token"] in proposals._PENDING


def test_a_signed_out_chat_is_told_to_sign_in(protected, fake_model):
    client = fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Sign in.")])
    body = ask(protected(None)).text
    assert "\x1e" not in body and proposals._PENDING == {}
    assert "sign in to run steps" in client.messages.calls[1]["messages"][-1]["content"][0]["content"]


def test_a_viewer_chat_cannot_propose(protected, fake_model):
    client = fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Ask an admin.")])
    body = ask(protected("viv")).text
    assert "\x1e" not in body and proposals._PENDING == {}
    assert "upload data" in client.messages.calls[1]["messages"][-1]["content"][0]["content"]


def test_a_signed_in_writer_proposes_under_their_own_name(protected, fake_model):
    fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Press Run.")])
    body = ask(protected("adm")).text
    token = json.loads(body.split("\x1e")[1])["proposal"]["token"]
    assert proposals._PENDING[token].username == "adm"


# --- The run endpoint -------------------------------------------------------------

def test_running_needs_a_real_token(open_client):
    r = open_client.post("/api/ai/run", json={"token": "x" * 16})
    assert r.status_code == 409 and r.json()["error"] == "proposal_unknown" and not job.is_running()


def test_a_valid_token_runs_exactly_the_plan(open_client):
    prop = proposals.issue("demo", steps.plan(["forecast"]))
    r = open_client.post("/api/ai/run", json={"token": prop["token"], "via": "button"})
    assert r.status_code == 200 and job.wait(10)
    assert r.json()["proposal"]["steps"] == prop["steps"] and "token" not in r.json()["proposal"]
    assert [s["id"] for s in job.status()["stages"]] == [s["id"] for s in prop["stages"]]


def test_token_is_single_use(open_client):     # Review Focus 1
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    assert open_client.post("/api/ai/run", json={"token": tok}).status_code == 200
    assert job.wait(10)
    assert open_client.post("/api/ai/run", json={"token": tok}).json()["error"] == "proposal_unknown"


def test_a_token_is_consumed_as_the_run_starts(hold_in):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    with hold_in("forecast") as entered:
        proposals.start_confirmed(tok, "demo", "button")
        assert entered.wait(10)
        with pytest.raises(proposals.ProposalError) as e:
            proposals.start_confirmed(tok, "demo", "button")
        assert e.value.status == 409 and e.value.code == "proposal_unknown"


def test_a_token_is_bound_to_its_user(protected):
    tok = proposals.issue("adm", steps.plan(["forecast"]))["token"]
    r = protected("adm2").post("/api/ai/run", json={"token": tok})
    assert r.status_code == 403 and r.json()["error"] == "proposal_not_yours"
    assert tok in proposals._PENDING and not job.is_running()
    assert protected("adm").post("/api/ai/run", json={"token": tok}).status_code == 200


@pytest.mark.parametrize("who,code", [(None, 401), ("viv", 403)])
def test_running_needs_data_write(protected, who, code):
    tok = proposals.issue("viv", steps.plan(["forecast"]))["token"]
    assert protected(who).post("/api/ai/run", json={"token": tok}).status_code == code
    assert not job.is_running() and tok in proposals._PENDING


def test_an_expired_token_is_refused(open_client, monkeypatch):     # Review Focus 3
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    monkeypatch.setattr(proposals, "_now", lambda: time.time() + proposals.TTL_SECONDS + 1)
    r = open_client.post("/api/ai/run", json={"token": tok})
    assert r.status_code == 409 and r.json()["error"] == "proposal_expired"
    assert tok not in proposals._PENDING and not job.is_running()


def test_a_stale_proposal_runs_nothing(open_client, seeded):        # Review Focus 2
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    e = registry.get("calendar")
    registry.put("calendar", e.df, {**e.metadata, "signature_hash": "sha256:new"})
    r = open_client.post("/api/ai/run", json={"token": tok})
    assert r.status_code == 409 and r.json()["error"] == "proposal_stale" and not job.is_running()
    assert tok not in proposals._PENDING


def test_a_run_since_the_proposal_makes_it_stale(open_client):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    job.start(plan=["forecast"])
    assert job.wait(10)
    r = open_client.post("/api/ai/run", json={"token": tok})
    assert r.status_code == 409 and r.json()["error"] == "proposal_stale"


def test_one_run_at_a_time(open_client, hold_in):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    with hold_in("analyse"):
        job.start()
        r = open_client.post("/api/ai/run", json={"token": tok})
        assert r.status_code == 409 and r.json() == security.PIPELINE_BUSY


def test_a_busy_start_keeps_the_token(monkeypatch):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]

    def busy(p, on_finish=None):
        raise job.Busy()

    monkeypatch.setattr(steps, "start", busy)
    with pytest.raises(proposals.ProposalError) as e:
        proposals.start_confirmed(tok, "demo", "button")
    assert e.value.status == 409 and e.value.code == "already_running"
    assert e.value.message == security.PIPELINE_BUSY["message"] and tok in proposals._PENDING


def test_a_new_proposal_revokes_the_earlier_one(open_client):
    other = proposals.issue("adm", steps.plan(["forecast"]))["token"]
    first = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    second = proposals.issue("demo", steps.plan(["staff"]))["token"]
    r = open_client.post("/api/ai/run", json={"token": first})
    assert r.status_code == 409 and r.json()["error"] == "proposal_unknown"
    assert second in proposals._PENDING and other in proposals._PENDING


def test_the_store_is_capped():
    p = steps.plan(["forecast"])
    toks = [proposals.issue(f"u{i}", p)["token"] for i in range(proposals.MAX_PENDING + 1)]
    assert len(proposals._PENDING) == proposals.MAX_PENDING
    assert toks[0] not in proposals._PENDING and toks[-1] in proposals._PENDING


def test_a_proposal_lasts_ten_minutes():
    t0 = time.time()
    prop = proposals.issue("demo", steps.plan(["forecast"]))
    assert proposals.TTL_SECONDS == 600
    assert t0 + 600 - 5 <= prop["expires_at"] <= time.time() + 600 + 5


def test_extra_fields_are_rejected(open_client):
    assert open_client.post("/api/ai/run", json={"token": "x" * 16, "replace": True}).status_code == 422
    assert open_client.post("/api/ai/run", json={"token": "x" * 16, "via": "model"}).status_code == 422
    assert open_client.post("/api/ai/run", json={"token": "short"}).status_code == 422


# --- The audit trail -------------------------------------------------------------

def test_every_action_is_audited_without_the_token(open_client, audit_rows):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    open_client.post("/api/ai/run", json={"token": tok, "via": "typed"})
    assert job.wait(10)
    rows = audit_rows()
    assert [r["surface"] for r in rows] == ["assistant_proposal", "assistant_confirm",
                                           "assistant_run_start", "assistant_run_outcome"]
    assert rows[1]["via"] == "typed" and rows[3]["outcome"] == "done"
    assert rows[0]["steps"] == ["forecast", "optimise", "recommend"]
    assert rows[2]["stage_ids"] == ["forecast", "optimise", "recommend"]
    assert rows[3]["failed_stage"] is None
    assert all(r["user"] == "demo" and tok not in json.dumps(r) for r in rows)
    assert all(r["proposal_id"] == pid(tok) and r["model"] == "none" for r in rows)
    assert all(r["in_tokens"] == 0 and r["out_tokens"] == 0 for r in rows)
    assert tok not in audit._FILE.read_text(encoding="utf-8")


def test_the_outcome_row_waits_for_the_start_row(monkeypatch, audit_rows):
    """A run can end before start_confirmed has written its rows; the outcome
    row still comes last."""
    import threading
    finishers = []

    def instant(p, on_finish=None):
        t = threading.Thread(target=on_finish, args=({"stages": [{"id": "forecast",
                                                                  "status": "done"}]},))
        t.start()
        t.join(0.3)       # the run "ends" before start returns
        finishers.append(t)
        return {}

    monkeypatch.setattr(steps, "start", instant)
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    proposals.start_confirmed(tok, "demo", "button")
    finishers[0].join(10)
    assert [r["surface"] for r in audit_rows()][-3:] == [
        "assistant_confirm", "assistant_run_start", "assistant_run_outcome"]


def test_a_failed_run_is_audited_with_its_stage(open_client, fail_in, audit_rows):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    with fail_in("optimise"):
        assert open_client.post("/api/ai/run", json={"token": tok}).status_code == 200
        assert job.wait(10)
    out = audit_rows()[-1]
    assert out["surface"] == "assistant_run_outcome" and out["outcome"] == "failed"
    assert out["failed_stage"] == "optimise"
    assert {"id": "optimise", "status": "failed"} in out["stages"]


def test_a_refused_confirmation_is_audited(open_client, audit_rows):
    forged = "y" * 20
    r = open_client.post("/api/ai/run", json={"token": forged, "via": "typed"})
    assert r.status_code == 409
    (row,) = audit_rows()
    assert row["surface"] == "assistant_confirm_refused" and row["via"] == "typed"
    assert row["code"] == "proposal_unknown" and row["user"] == "demo"
    assert row["proposal_id"] == pid(forged) and forged not in json.dumps(row)


# --- check_data and get_run_status ----------------------------------------------

def test_check_data_names_missing_files_and_opens_nothing(monkeypatch):
    # Only a propose_run refused for missing files opens the Data Hub: a sample
    # run checks the data too, and must not flash the upload page.
    monkeypatch.setattr(preflight, "run_checks", lambda: {"ok": False, "issues": [
        {"level": "error", "file": "inventory_items.csv",
         "message": "Missing file. Upload it before running."},
        {"level": "warning", "file": "weather_daily.csv", "message": "Some days are missing."}],
        "replaced_months": [], "arrivals_source": None})
    c = run_tools.Caller("demo", True)
    out = run_tools.execute("check_data", {}, c)
    assert out["ok"] is False and out["missing"][0]["file"] == "inventory_items.csv"
    assert out["warnings"][0]["file"] == "weather_daily.csv" and len(out["missing"]) == 1
    assert out["can_run"] is True and out["running"] is False
    assert out["needs_preparation"] is False and out["ready_steps"] == list(READY_STEPS)
    assert c.trailer == {}

    visitor = run_tools.Caller(None, False)
    out = run_tools.execute("check_data", {}, visitor)
    assert out["can_run"] is False and visitor.trailer == {}


def test_check_data_that_passes_opens_nothing(monkeypatch):
    monkeypatch.setattr(preflight, "run_checks", lambda: {"ok": True, "issues": [],
                                                          "replaced_months": [],
                                                          "arrivals_source": None})
    c = run_tools.Caller("demo", True)
    out = run_tools.execute("check_data", {}, c)
    assert out["ok"] is True and out["missing"] == [] and c.trailer == {}
    assert proposals._PENDING == {} and not job.is_running()


def test_run_status_reports_plain_receipts(fail_in):
    with fail_in("optimise"):
        job.start(plan=["forecast", "optimise"])
        assert job.wait(10)
    out = run_tools.execute("get_run_status", {}, run_tools.Caller(None, False))
    assert out["running"] is False and out["finished_at"]
    assert out["stages"] == [
        {"label": "Forecast", "status": "done", "receipt": "forecast done", "warnings": []},
        {"label": "Optimise", "status": "failed", "receipt": "stop", "warnings": []}]
    assert "ready_steps" in out


# --- Identity, the prompt and the module boundaries --------------------------------

def _request():
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [],
                    "query_string": b""})


def test_acting_username(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    assert security.acting_username(_request()) == "demo"
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    assert security.acting_username(_request()) is None


def test_the_prompt_carries_the_running_rules():
    assert "RUNNING STEPS" in chat.CHAT_SYSTEM and "You NEVER make decisions" in chat.CHAT_SYSTEM
    assert "You can ONLY read" not in chat.CHAT_SYSTEM
    assert "run pipeline steps after they confirm" in chat.APP_GUIDE


def _running_rules() -> str:
    start = chat.CHAT_SYSTEM.index("RUNNING STEPS")
    return " ".join(chat.CHAT_SYSTEM[start:].split())


def test_the_prompt_checks_the_data_before_anything_else():
    assert "ALWAYS call check_data first, before you answer or ask anything" in _running_rules()


def test_the_prompt_fixes_the_settings_of_chat_runs():
    rules = _running_rules()
    assert ("Runs started from the chat always use the best ML model, 7 days ahead, and "
            "the standing reorder policy") in rules
    assert "The prediction step forecasts total ED and every specialty" in rules
    assert ("Never ask about the horizon, the engine, or total versus specialty before "
            "proposing a run") in rules
    assert "custom choices are on the forecast page's own Start prediction button" in rules
    assert "Never state or imply that a run used a setting it does not use" in rules


def test_the_prompt_keeps_the_summary_short():
    rules = _running_rules()
    assert "at most 5 sentences in one short paragraph" in rules
    assert "no headings and no bullet lists" in rules
    assert "only numbers those tools returned" in rules
    assert "one line naming the decision that is the user's" in rules
    assert "3 to 5 plain sentences" not in rules


def test_the_prompt_never_quotes_utc_clock_times():
    assert ("Do not state clock times from tool results (they are UTC)"
            in _running_rules())


def test_the_propose_schema_lists_every_step():
    schema = next(s for s in run_tools.SCHEMAS if s["name"] == "propose_run")
    items = schema["input_schema"]["properties"]["steps"]
    assert items["minItems"] == 1
    assert items["items"]["enum"] == [*steps.STEPS, "full", "sample"]
    assert run_tools.TRAILER_MARK == "\x1e"


def test_the_read_tools_are_unchanged():
    assert {s["name"] for s in tools.TOOL_SCHEMAS} == READ_TOOLS
    assert not (run_tools.NAMES & READ_TOOLS)
