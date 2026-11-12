"""The assistant can start the pipeline's own steps, and it can never decide.

Four pins:
- the model is offered exactly these tools, and the assistant's router can change
  nothing but start a confirmed run;
- every stage a plan can reach is a real pipeline stage (no other code path);
- a real full run started from a proposal never adopts a policy, records an
  Action Center decision, or clears or replaces data;
- the assistant modules hold no call that decides anything.

The dynamic test runs the real stages on the seeded data, with the AI
unconfigured (Recommend ends amber) so no test calls a real AI API.
"""
import inspect

import pytest

from ai import config, proposals, run_tools, tools
from core import action_store, data_version, optimization_engine as engine
from core import prepare_registry, registry
from core.pipeline import READY_STEPS, job, preflight, sample, stages, staging, steps
from tests.pipeline_fixtures import seeded  # noqa: F401
from tests.test_assistant_runs import open_client  # noqa: F401

ALLOWED_TOOLS = {"get_forecast", "get_supply_status", "get_staff_status", "get_optimization",
                 "get_explore_findings", "lookup_knowledge", "check_data", "propose_run",
                 "get_run_status"}


def test_the_assistant_has_exactly_these_tools():
    assert {t["name"] for t in tools.TOOL_SCHEMAS + run_tools.SCHEMAS} == ALLOWED_TOOLS


def test_the_assistant_router_can_change_nothing_but_start_a_run():
    import main
    writes = {(m, r.path) for r in main.app.routes if getattr(r, "path", "").startswith("/api/ai")
              for m in (r.methods or set()) - {"GET", "HEAD"}}
    assert writes == {("POST", "/api/ai/explain/forecast"), ("POST", "/api/ai/explain"),
                      ("POST", "/api/ai/briefing"), ("POST", "/api/ai/chat"),
                      ("POST", "/api/ai/run")}


@pytest.mark.parametrize("req", [[s] for s in steps.STEPS] + [["full"], ["sample"]])
@pytest.mark.parametrize("ready,prep", [(set(), True), (set(READY_STEPS), False)])
def test_every_stage_a_plan_reaches_is_a_pipeline_stage(monkeypatch, req, ready, prep):
    monkeypatch.setattr(job, "ready_steps", lambda: frozenset(ready))
    monkeypatch.setattr(steps, "needs_preparation", lambda: prep)
    monkeypatch.setattr(sample, "refusal", lambda *a, **k: None)
    monkeypatch.setattr(preflight, "run_checks", lambda: {"ok": True, "issues": []})
    p = steps.plan(req)
    real = [fn for _sid, _label, fn in (*stages.STAGES, *stages.EXTRA_STAGES)]
    assert p.stage_ids
    for sid in p.stage_ids:
        fn = stages.stage_entry(sid)[2]
        assert any(fn is r for r in real), sid


@pytest.fixture
def world(seeded, monkeypatch):  # noqa: F811
    """The seeded data, a fresh job state, the AI unconfigured, and every global
    the real full run touches put back afterwards."""
    saved_policy = dict(engine._POLICY_STATE)
    monkeypatch.setattr(job, "_STATE", job._State())
    monkeypatch.setattr(config, "configured", lambda: False)
    proposals.reset()
    yield
    assert job.wait(60), "a test left the job running"
    proposals.reset()
    data_version.invalidate_all()
    engine._POLICY_STATE.clear()
    engine._POLICY_STATE.update(saved_policy)


def test_no_assistant_run_reaches_a_decision(open_client, world, monkeypatch):  # noqa: F811
    policy = engine.get_policy_state()["policy"]
    tok = proposals.issue("demo", steps.plan(["full"]))["token"]   # real stages, AI unconfigured
    # The patches are scoped to the run, so the fixtures can still clean up after it.
    with monkeypatch.context() as m:
        for target, attr in [(engine, "set_policy"), (action_store, "record"),
                             (registry, "clear_all"), (prepare_registry, "clear_all"),
                             (staging, "clear"), (sample, "load")]:
            m.setattr(target, attr, lambda *a, _attr=attr, **k: pytest.fail(f"{_attr} was called"))
        assert open_client.post("/api/ai/run", json={"token": tok}).status_code == 200
        assert job.wait(300)
        last = job.status()["stages"][-1]
        assert last["status"] in ("done", "amber"), last
        assert engine.get_policy_state()["policy"] == policy


def test_the_assistant_modules_hold_no_decision_calls():
    forbidden = ("set_policy", "action_store", "/api/actions", "replace=True", "clear_all",
                 "/api/datasets", "/api/prepare", ".put(", ".delete(")
    for mod in (tools, run_tools, proposals, steps):
        src = inspect.getsource(mod)
        assert not [w for w in forbidden if w in src], mod.__name__
    assert inspect.getsource(tools).count("_post(") == 1      # the helper is defined, never called
