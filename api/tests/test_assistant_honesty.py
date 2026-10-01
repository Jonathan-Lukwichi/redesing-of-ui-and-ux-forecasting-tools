"""The assistant must report only what the app has materialised, and say
truthfully where each number came from (ai/tools.py). No network: the app's
own endpoints are stubbed."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai import tools  # noqa: E402


@pytest.fixture()
def app(monkeypatch):
    """Stub the app endpoints the tools read; record any POST."""
    state = {"get": {}, "posts": []}
    monkeypatch.setattr(tools, "_get", lambda path: state["get"].get(path, {"error": "404"}))
    monkeypatch.setattr(tools, "_post", lambda path, body: state["posts"].append(path) or {})
    return state


def test_no_forecast_run_means_no_numbers_and_no_private_run(app):
    """It used to run a forecast of its own, overwrite the user's 'last
    forecast', and then claim the numbers came from an earlier run."""
    app["get"]["/api/forecast/last"] = {"available": False}
    out = tools.execute("get_forecast", {"horizon": 7})
    assert "error" in out and "No forecast has been run" in out["error"]
    assert app["posts"] == [], "the assistant started a forecast run of its own"


def test_the_forecast_source_names_when_and_where_it_was_run(app):
    app["get"]["/api/forecast/last"] = {"available": True, "kind": "total",
        "ran_at": "2026-10-01T09:15:00", "result": {
            "requested_model": "ml", "validated": False,
            "forecast": [{"date": "2026-02-01", "predicted": 59.0, "lower": 44.0, "upper": 84.0}]}}
    out = tools.execute("get_forecast", {})
    assert "2026-10-01T09:15:00" in out["source"] and "Dashboard" in out["source"]
    assert out["trust"] == "not yet checked against past weeks"
    assert app["posts"] == []


def test_staffing_is_labelled_simulated_and_locum_hours_are_period_totals(app):
    app["get"]["/api/staff/overview"] = {
        "days_simulated": 396, "kpis": {"staffing_shortfall": 7},
        "shifts": [{"shift": "Night", "avg_required": 2.6, "avg_filled": 2.1,
                    "unfilled": 0, "locum_hours": 2256.0, "cost_zar": 3442661.0}]}
    out = tools.execute("get_staff_status", {})
    assert "SIMULATED" in out["source"] and "396" in out["source"]
    night = out["shifts"][0]
    assert night["locum_hours_total_over_period"] == 2256.0
    assert "locum_hours" not in night, "a bare 'locum_hours' reads as a weekly figure"
    assert "not per week" in out["note"]


def test_supply_is_labelled_simulated(app):
    app["get"]["/api/supply/overview"] = {"kpis": {}, "items_at_risk": 0, "items": []}
    assert "SIMULATED" in tools.execute("get_supply_status", {})["source"]


def test_explore_findings_mark_reasons_as_untested(app):
    app["get"]["/api/explore/findings"] = {"findings": [{
        "title": "Permanent demand shift", "headline": "+9.2%",
        "summary": "Post-COVID averages 61.6 vs 56.4 pre-COVID.",
        "mechanism": "Deferred-care backlog.", "action": "Rebase plans."}]}
    out = tools.execute("get_explore_findings", {})
    f = out["findings"][0]
    assert f["possible_reason"] == "Deferred-care backlog." and "mechanism" not in f
    assert "NOT been statistically tested" in out["note"]
