"""The invalidation seam: one call clears every cached result."""
import pytest

from core import data_version


@pytest.fixture
def clean_registry():
    saved = dict(data_version._CLEARERS)
    data_version._CLEARERS.clear()
    yield
    data_version._CLEARERS.clear()
    data_version._CLEARERS.update(saved)


def test_invalidate_bumps_version_and_calls_clearers(clean_registry):
    calls = []
    data_version.register("a", lambda: calls.append("a"))
    before = data_version.current()
    n = data_version.invalidate_all()
    assert calls == ["a"]
    assert data_version.current() == before + 1
    assert n == before + 1


def test_clearer_failure_does_not_stop_the_others(clean_registry):
    calls = []

    def boom():
        raise RuntimeError("boom")

    data_version.register("first", boom)
    data_version.register("second", lambda: calls.append("second"))
    with pytest.raises(RuntimeError):
        data_version.invalidate_all()
    assert calls == ["second"]


def test_invalidate_clears_every_result_cache():
    import main  # noqa: F401  (imports every router so all clearers register)
    from routers import forecast, optimization, supply, staff
    from core import optimization_engine as engine

    saved_run = forecast._LAST_RUN
    saved_last = dict(engine._LAST)
    try:
        forecast._LAST_RUN = {"x": 1}
        forecast._LAST_SPECIALTY["x"] = {"y": 1}
        forecast._ENGINE_CACHE["x"] = 1
        forecast._VALIDATION_CACHE["x"] = {"y": 1}
        optimization._LAST_TUNE["x"] = 1
        optimization._FC_CACHE[("ml", "open")] = {"y": 1}
        supply._LAST_COMPARE["result"] = 1
        supply._LAST_SWEEP["result"] = 1
        staff._LAST_STRATEGY["result"] = 1
        engine._LAST["staff"] = {"z": 1}

        data_version.invalidate_all()

        assert forecast._LAST_RUN is None
        assert not forecast._LAST_SPECIALTY
        assert not forecast._ENGINE_CACHE
        assert not forecast._VALIDATION_CACHE
        assert not optimization._LAST_TUNE
        assert not optimization._FC_CACHE
        assert not supply._LAST_COMPARE
        assert not supply._LAST_SWEEP
        assert not staff._LAST_STRATEGY
        assert all(v is None for v in engine._LAST.values())
    finally:
        forecast._LAST_RUN = saved_run
        engine._LAST.clear()
        engine._LAST.update(saved_last)


def test_invalidate_keeps_family_but_resets_tuned_params():
    import main  # noqa: F401
    from core import optimization_engine as engine

    saved = dict(engine._POLICY_STATE)
    try:
        engine.set_policy("s_q", tuned={"params_by_item": {"A": {}}, "tuned_at": "t"})
        data_version.invalidate_all()
        state = engine.get_policy_state()
        assert state["policy"] == "s_q"
        assert state["params_by_item"] is None
        assert state["tuned_at"] is None
    finally:
        engine._POLICY_STATE.clear()
        engine._POLICY_STATE.update(saved)
