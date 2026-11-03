"""Run inventory and staffing from uploaded files (Task 4)."""
import asyncio
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from core import ops_derive, simulation_data

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "demo-data"
BUNDLED = REPO / "api" / "data" / "simulation"


def _pack():
    return {n: pd.read_csv(PACK / f"{n}.csv") for n in
            ("inventory_items", "inventory_movements", "staff_list", "shift_log", "staffing_daily")}


def _as_registry(df):
    """Registry frames hold float32 numerics (slim_numeric)."""
    out = df.copy()
    for c in out.columns:
        if pd.api.types.is_float_dtype(out[c]):
            out[c] = out[c].astype("float32")
    return out


def _derive(registry_like=False):
    p = _pack()
    if registry_like:
        p = {k: _as_registry(v) for k, v in p.items()}
    return ops_derive.derive(p["inventory_items"], p["inventory_movements"],
                             p["staff_list"], p["shift_log"], p["staffing_daily"])


@pytest.fixture(autouse=True)
def _clean_published():
    simulation_data.unpublish()
    yield
    simulation_data.unpublish()


def _load(name):
    return asyncio.run(simulation_data.load(name))


def test_round_trip_reproduces_bundled_items():
    got = _derive()["supply_items.csv"].set_index("item_id")
    ref = pd.read_csv(BUNDLED / "supply_items.csv").set_index("item_id")
    assert list(got.index) == list(ref.index)
    for col in ("total_consumption_units", "number_of_stockout_events", "total_stockout_units",
                "total_orders_placed", "total_ordering_cost_zar", "total_stockout_cost_zar"):
        assert np.allclose(got[col], ref[col], atol=1e-9, rtol=0), col
    for col in ("mean_daily_consumption", "sd_daily_consumption"):
        assert (got[col] - ref[col]).abs().max() <= 0.01, col
    for col in ("total_holding_cost_zar", "avg_stock_on_hand", "inventory_value_zar"):
        rel = ((got[col] - ref[col]).abs() / ref[col].abs().where(ref[col] != 0, 1)).max()
        assert rel <= 0.02, (col, rel)


def test_round_trip_survives_float32_registry_frames():
    got = _derive(registry_like=True)["supply_items.csv"].set_index("item_id")
    ref = pd.read_csv(BUNDLED / "supply_items.csv").set_index("item_id")
    assert np.allclose(got["total_consumption_units"], ref["total_consumption_units"], atol=1e-9, rtol=0)
    assert np.allclose(got["total_stockout_cost_zar"], ref["total_stockout_cost_zar"], atol=1e-9, rtol=0)


def test_service_level_formula():
    items = _derive()["supply_items.csv"].set_index("item_id")
    a01 = items.loc["A01"]
    assert a01["service_level_achieved"] == round(1 - a01["total_stockout_units"] / a01["total_consumption_units"], 2)
    assert a01["service_level_achieved"] == 0.91


def test_observed_days_is_distinct_dates():
    items = _derive()["supply_items.csv"]
    assert set(items["observed_days"]) == {396}


def test_money_totals_do_not_lose_precision_to_float32():
    p = _pack()
    mv = p["inventory_movements"].copy()
    it = p["inventory_items"].copy()
    it = it[it["item_id"] == "A01"].reset_index(drop=True)
    mv = mv[mv["item_id"] == "A01"].copy()
    mv["stockout_today_units"] = 16_777_217 // 396 + 3  # large enough to exceed float32's exact integers in total
    it["stockout_penalty_zar"] = 380.5  # exact in float32, so only the sum can lose precision
    out = ops_derive.derive(_as_registry(it), _as_registry(mv), p["staff_list"], p["shift_log"],
                            p["staffing_daily"])["supply_items.csv"]
    units = int(mv["stockout_today_units"].sum())
    assert out.loc[0, "total_stockout_cost_zar"] == units * 380.5
    assert float(np.float32(units) * np.float32(380.5)) != units * 380.5  # float32 would have been wrong


def test_only_filled_posts_become_members():
    members = _derive()["staff_members.csv"]
    assert len(members) == 23
    staff = _pack()["staff_list"]
    filled = set(staff.loc[~staff["is_vacant"].astype(bool), "staff_id"])
    assert set(members["staff_id"]) == filled
    ref = pd.read_csv(BUNDLED / "staff_members.csv")
    assert set(ref.columns) <= set(members.columns)


def test_shifts_and_daily_pass_through():
    out = _derive()
    p = _pack()
    assert len(out["staff_shifts.csv"]) == len(p["shift_log"])
    assert len(out["staff_daily.csv"]) == 396
    assert out["supply_panel.csv"].shape == p["inventory_movements"].shape


def test_derive_returns_the_seven_names():
    assert set(_derive()) == {"staff_members.csv", "staff_daily.csv", "staff_shifts.csv",
                              "staff_kpis.csv", "supply_items.csv", "supply_panel.csv",
                              "supply_kpis.csv"}


def test_load_prefers_published_frames():
    frames = _derive()
    simulation_data.publish(frames, "simulated", posts=30)
    got = _load("supply_items.csv")
    assert got is frames["supply_items.csv"]
    assert simulation_data.is_uploaded() is True
    assert simulation_data.origin() == "simulated"
    assert simulation_data.posts() == 30


def test_unpublish_restores_bundled_files():
    simulation_data.publish(_derive(), "simulated", posts=30)
    simulation_data.unpublish()
    assert simulation_data.is_uploaded() is False
    assert simulation_data.origin() is None and simulation_data.posts() is None
    ref = pd.read_csv(BUNDLED / "staff_members.csv")
    assert len(_load("staff_members.csv")) == len(ref)


def test_kpi_files_are_empty_when_uploaded():
    simulation_data.publish(_derive(), "simulated", posts=30)
    for name in ("staff_kpis.csv", "supply_kpis.csv"):
        k = _load(name)
        assert len(k) == 0 and "kpi" in k.columns


def test_overview_ci_is_empty_when_uploaded():
    from fastapi.testclient import TestClient
    import main
    simulation_data.publish(_derive(), "simulated", posts=30)
    with TestClient(main.app) as c:
        for url in ("/api/staff/overview", "/api/supply/overview"):
            r = c.get(url)
            assert r.status_code == 200, r.text
            assert r.json()["ci"] == {}
        assert c.get("/api/staff/overview").json()["kpis"]["n_posts"] == 30


def test_strategy_compare_demo_uses_uploaded_pool(monkeypatch):
    from fastapi.testclient import TestClient
    import main
    from routers import staff as staff_router
    seen = {}

    def fake(mean_arrivals=None, n_active=None, **kw):
        seen.update(mean_arrivals=mean_arrivals, n_active=n_active)
        return {"ok": True}

    monkeypatch.setattr(staff_router, "compare_staff_strategies", fake)
    g1 = pd.DataFrame({"date": ["2025-01-01", "2025-01-02"], "total_daily_arrivals": [100.0, 120.0]})
    monkeypatch.setattr(staff_router.prepare_registry, "get_df", lambda gid: g1)
    with TestClient(main.app) as c:
        c.get("/api/staff/strategy-compare-demo")
        assert seen == {"mean_arrivals": None, "n_active": None}  # bundled mode unchanged
        simulation_data.publish(_derive(), "simulated", posts=30)
        c.get("/api/staff/strategy-compare-demo")
        assert seen == {"mean_arrivals": 110.0, "n_active": 23}
        c.get("/api/staff/strategy-compare-demo", params={"mean_arrivals": 60})
        assert seen == {"mean_arrivals": 60.0, "n_active": 23}


@pytest.mark.parametrize("raw", [["TRUE", "FALSE"], ["True", "False"], [True, False], [1, 0],
                                 np.array([1.0, 0.0])])
def test_excel_resaved_booleans_parse(raw):
    got = ops_derive.parse_bool(pd.Series(raw))
    assert list(got) == [True, False]


def test_parse_bool_rejects_garbage():
    with pytest.raises(ValueError):
        ops_derive.parse_bool(pd.Series(["maybe"]))


def test_excel_resaved_dates_are_rejected_by_name():
    with pytest.raises(ValueError) as e:
        ops_derive.parse_iso_date(pd.Series(["31/01/2025"]), "shift_log")
    assert "shift_log" in str(e.value)
    ok = ops_derive.parse_iso_date(pd.Series(["2025-01-31", "2025-02-01"]), "shift_log")
    assert list(ok) == ["2025-01-31", "2025-02-01"]


def test_origin_of():
    p = _pack()
    assert ops_derive.origin_of(p["inventory_items"], p["staff_list"]) == "simulated"
    real_items = p["inventory_items"].assign(data_origin="real")
    real_staff = p["staff_list"].assign(data_origin="real")
    assert ops_derive.origin_of(real_items, real_staff) == "real"
    assert ops_derive.origin_of(real_items, p["staff_list"]) == "simulated"
