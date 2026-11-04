"""Fixes the full pipeline depends on (Task 2)."""
import asyncio

import pandas as pd
import pytest
from fastapi import HTTPException

from core import data_version, prepare_registry
from core import optimization_engine as engine


def test_weekly_cost_with_zero_payroll_unpacks(monkeypatch):
    from routers import optimization
    from core import simulation_data

    async def fake_load(name):
        return pd.DataFrame({"total_payroll_cost_zar": [0.0, 0.0],
                             "total_arrivals": [10, 12]})

    monkeypatch.setattr(simulation_data, "load", fake_load)
    cost, arrivals = asyncio.run(optimization._current_weekly_staff_cost())
    assert (cost, arrivals) == (None, None)


def test_strict_week_forecast_raises_instead_of_demo_fallback(monkeypatch):
    from routers import optimization, forecast

    # G1 not built: the live path has no data to forecast from.
    monkeypatch.setattr(prepare_registry, "get_df", lambda name: None)
    with pytest.raises(HTTPException):
        asyncio.run(optimization._compute_week_forecast("ml", None, strict=True))
    fc = asyncio.run(optimization._compute_week_forecast("ml", None, strict=False))
    assert fc["live"] is False


def test_week_forecast_from_result_is_live():
    from routers import optimization

    res = {"forecast": [{"date": f"2026-01-0{i}", "predicted": 10 + i,
                         "lower": 5, "upper": 20} for i in range(1, 8)],
           "mae": 2.0, "validated_mae": 3.0}
    wk = optimization.week_forecast_from_result(res, "ml")
    assert wk["live"] is True
    assert wk["mae"] == 3.0 and wk["error_basis"] == "rolling_origin"
    assert len(wk["daily_total"]) == 7


def test_strategy_compare_honours_pool_size():
    default = engine.compare_staff_strategies()
    explicit = engine.compare_staff_strategies(n_active=engine.STAFF_N_ACTIVE)
    bigger = engine.compare_staff_strategies(n_active=30)
    assert default == explicit
    assert bigger != default


_ITEM = {"total_ordering_cost_zar": 700, "total_orders_placed": 2,
         "avg_stock_on_hand": 10, "total_holding_cost_zar": 396.0 * 10 * 0.5,
         "total_stockout_units": 4, "total_stockout_cost_zar": 40}


def test_item_cost_params_uses_observed_days():
    _, h396, p1, _ = engine._item_cost_params(dict(_ITEM, observed_days=396), 10.0)
    _, h198, p2, _ = engine._item_cost_params(dict(_ITEM, observed_days=198), 10.0)
    assert h198 == pytest.approx(2 * h396)
    assert p1 == p2


def test_observed_days_defaults_to_396_for_bundled_items():
    _, h_default, _, _ = engine._item_cost_params(dict(_ITEM), 10.0)
    _, h396, _, _ = engine._item_cost_params(dict(_ITEM, observed_days=396), 10.0)
    assert h_default == h396 == pytest.approx(0.5)


def test_arm_items_uses_uploaded_holding_rate():
    from routers import optimization

    base = {"item_id": "A", "mean_daily_consumption": 5, "unit_price_zar": 2}
    out = optimization._arm_items([dict(base, holding_cost_rate_per_year=0.3), base])
    assert out[0]["holding_rate"] == 0.3
    assert out[1]["holding_rate"] == 0.25


def test_bootstrap_does_not_touch_after_a_run(monkeypatch):
    from core import bootstrap
    from routers import datasets

    called = []

    async def boom(ds):
        called.append(ds)

    monkeypatch.setattr(prepare_registry, "get_df", lambda name: None)
    monkeypatch.setattr(datasets, "fetch_from_source", boom)
    data_version.invalidate_all()
    assert asyncio.run(bootstrap.ensure_g1()) is True
    assert called == []


def test_specialty_last_route_reads_cache():
    from routers import forecast

    saved = dict(forecast._LAST_SPECIALTY)
    try:
        forecast._LAST_SPECIALTY.clear()
        assert asyncio.run(forecast.last_specialty("Medicine")) == {"available": False}
        forecast._LAST_SPECIALTY["Medicine"] = {"x": 1}
        assert asyncio.run(forecast.last_specialty("Medicine")) == {
            "available": True, "result": {"x": 1}}
    finally:
        forecast._LAST_SPECIALTY.clear()
        forecast._LAST_SPECIALTY.update(saved)


def test_publish_swaps_the_uploaded_frames_in_one_step(monkeypatch):
    """A reader holding the published frames never sees them emptied: a new
    publish rebinds a complete dict instead of clearing the old one first."""
    from core import simulation_data

    monkeypatch.setattr(simulation_data, "_UPLOADED", {})
    monkeypatch.setattr(simulation_data, "_META", dict(simulation_data._META))
    simulation_data.publish({"a.csv": pd.DataFrame({"x": [1]})}, "simulated", posts=1)
    seen = simulation_data._UPLOADED
    simulation_data.publish({"b.csv": pd.DataFrame({"x": [2]})}, "real", posts=2)
    assert list(seen) == ["a.csv"]                      # the earlier view stays whole
    assert list(simulation_data._UPLOADED) == ["b.csv"]
    simulation_data.unpublish()
    assert list(seen) == ["a.csv"] and simulation_data._UPLOADED == {}
    assert not simulation_data.is_uploaded()
