"""Findings F9 to F12, the KPSS addition and the analyse stage."""
import numpy as np
import pandas as pd
import pytest

from core import prepare_registry, simulation_data
from core.explore import findings, pipeline
from core.explore.analyzers import ops_links, seasonality_test
from core.explore.metrics.stationarity import StationarityMetric
from core.explore.pipeline import AnalysisContext, Analyzer, GroupProfile
from core.pipeline import stages

OPS_PROFILE = GroupProfile(group_id="ops", grain="daily", date="date",
                           target="total_daily_arrivals")
G1_PROFILE = GroupProfile(group_id="g1", grain="daily", date="date",
                          target="total_daily_arrivals", day_of_week="day_of_week",
                          month="month", zero_day_flag="is_zero_day")


@pytest.fixture(autouse=True)
def restore_globals():
    saved_meta = dict(simulation_data._META)
    saved = {g: prepare_registry.get(g) for g in ("g1", "ops_daily")}
    saved_failures = list(pipeline._FAILURES)
    yield
    simulation_data._META.clear()
    simulation_data._META.update(saved_meta)
    for gid, entry in saved.items():
        prepare_registry.clear(gid)
        if entry is not None:
            prepare_registry.put(gid, entry.df, entry.metadata)
    pipeline._FAILURES[:] = saved_failures


def _ops(linked=True, n=200, seed=1):
    rng = np.random.default_rng(seed)
    arrivals = rng.integers(40, 120, n)
    if linked:
        nurses = arrivals // 10 + rng.integers(0, 2, n)
        use = arrivals * 3 + rng.integers(0, 20, n)
        stock = (arrivals >= np.quantile(arrivals, 0.9)).astype(int) * 5
    else:
        nurses = rng.integers(5, 15, n)
        use = rng.integers(100, 400, n)
        stock = rng.integers(0, 2, n) * 5
    return pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=n).strftime("%Y-%m-%d"),
        "total_daily_arrivals": arrivals, "required_nurses": nurses,
        "staffed_nurses": nurses, "locum_hours": 0.0,
        "consumption_units": use, "stockout_units": stock, "stock_value_zar": 1.0})


def _run(analyzer, df):
    ctx = AnalysisContext(groups={"ops": (df, OPS_PROFILE)}, raw_datasets={})
    return analyzer.run("ops", df, OPS_PROFILE, ctx)


ANALYZERS = (ops_links.ArrivalsVsConsumption, ops_links.ArrivalsVsNurses,
             ops_links.StockoutsOnBusyDays)


@pytest.mark.parametrize("cls", ANALYZERS)
def test_links_carry_the_simulated_label(cls, monkeypatch):
    for origin in ("simulated", None):
        monkeypatch.setitem(simulation_data._META, "origin", origin)
        f = _run(cls(), _ops(linked=True))
        assert ops_links.SIMULATED_LABEL in f.mechanism


@pytest.mark.parametrize("cls", ANALYZERS)
def test_no_link_verdict_still_carries_the_label(cls, monkeypatch):
    monkeypatch.setitem(simulation_data._META, "origin", "simulated")
    f = _run(cls(), _ops(linked=False))
    assert "no clear link" in f.title.lower()
    assert ops_links.SIMULATED_LABEL in f.mechanism


@pytest.mark.parametrize("cls", ANALYZERS)
def test_links_omit_label_for_real_data(cls, monkeypatch):
    monkeypatch.setitem(simulation_data._META, "origin", "real")
    f = _run(cls(), _ops(linked=True))
    assert "simulated" not in f.mechanism.lower()


def test_label_text_is_exact():
    assert ops_links.SIMULATED_LABEL == (
        "This relationship was built into the simulated data, so it shows the "
        "pipeline working, not a finding about the hospital.")


def test_links_skip_without_ops_table():
    prepare_registry.clear("ops_daily")
    ctx = findings._build_context()
    assert "ops" not in ctx.groups
    before = len(pipeline.recent_failures())
    out = pipeline.FindingPipeline([c() for c in ANALYZERS]).run(ctx)
    assert out == [] and len(pipeline.recent_failures()) == before


def test_analyzers_registered_as_f9_to_f12():
    codes = {a.code for a in findings.DEFAULT_ANALYZERS}
    assert {"F9", "F10", "F11", "F12"} <= codes


def test_ops_daily_joins_the_context():
    prepare_registry.put("ops_daily", _ops(), {"id": "ops_daily"})
    df, prof = findings._build_context().groups["ops"]
    assert prof.date == "date" and prof.target == "total_daily_arrivals"
    assert prof.grain == "daily" and len(df) == 200


def test_verdict_follows_the_value(monkeypatch):
    monkeypatch.setitem(simulation_data._META, "origin", "real")
    for cls in ANALYZERS:
        weak = _run(cls(), _ops(linked=False))
        assert "no clear link" in weak.title.lower() and weak.category == "stable"
        strong = _run(cls(), _ops(linked=True))
        assert "no clear link" not in strong.title.lower() and strong.category == "watch"
    assert _run(ops_links.ArrivalsVsConsumption(), _ops(linked=True)).detail["rho"] >= 0.3


def _g1(values, dow, month, zero=None):
    df = pd.DataFrame({"date": pd.date_range("2024-01-01", periods=len(values)),
                       "total_daily_arrivals": values, "day_of_week": dow, "month": month})
    if zero is not None:
        df["is_zero_day"] = zero
    return df


def _kw(df):
    ctx = AnalysisContext(groups={"g1": (df, G1_PROFILE)}, raw_datasets={})
    return seasonality_test.KruskalWallisAnalyzer().run("g1", df, G1_PROFILE, ctx)


def test_kruskal_verdict_follows_the_p_value():
    n = 364
    idx = np.arange(n)
    dow, month = idx % 7, (idx // 31) % 12 + 1
    flat = _kw(_g1(np.full(n, 55), dow, month, [0] * n))
    assert "no significant pattern" in flat.title.lower() and flat.category == "stable"
    rng = np.random.default_rng(3)
    cyc = _kw(_g1(50 + dow * 10 + rng.integers(0, 3, n), dow, month, [0] * n))
    assert "no significant" not in cyc.title.lower() and "significant" in cyc.title.lower()
    assert cyc.detail["day_of_week"]["h"] > 100 and cyc.detail["day_of_week"]["p"] < 0.05


def test_kruskal_excludes_zero_days():
    n = 364
    idx = np.arange(n)
    dow, month = idx % 7, (idx // 31) % 12 + 1
    zero = (dow == 3).astype(int)           # one weekday flagged as zero days
    values = np.where(zero == 1, 0, 55)
    f = _kw(_g1(values, dow, month, zero))
    assert "no significant pattern" in f.title.lower()


def _arrivals_only():
    rng = np.random.default_rng(0)
    df = pd.DataFrame({"date": pd.date_range("2024-01-01", periods=200),
                       "total_daily_arrivals": rng.normal(60, 5, 200)})
    prof = GroupProfile(group_id="g1", grain="daily", date="date",
                        target="total_daily_arrivals")
    return df, prof


def test_stationarity_reports_kpss():
    df, prof = _arrivals_only()
    m = StationarityMetric().run("g1", df, prof, None)
    assert 0 <= m.detail["kpss_p"] <= 1 and "p_value" in m.detail


def test_stationarity_kpss_raises_no_warning(recwarn):
    df, prof = _arrivals_only()
    StationarityMetric().run("g1", df, prof, None)
    assert not [w for w in recwarn if "Interpolation" in w.category.__name__]


class _Boom(Analyzer):
    code = "FX"
    preferred_group_ids = ("g1",)

    def run(self, *a, **k):
        raise RuntimeError("secret cell value")


def test_analyse_stage_reports_counts_and_failures(monkeypatch):
    n = 100
    prepare_registry.put("g1", _g1(np.arange(n) % 9 + 50, np.arange(n) % 7, 1), {"id": "g1"})
    ok = stages.analyse_stage()
    assert ok.status == "done" and ok.warnings == []
    assert " findings, " in ok.receipt and ok.receipt.endswith(" metrics")

    monkeypatch.setattr(findings.PIPELINE, "analyzers",
                        findings.PIPELINE.analyzers + [_Boom()])
    bad = stages.analyse_stage()
    assert bad.status == "amber"
    assert any("FX" in w for w in bad.warnings)
    assert all("secret" not in w for w in bad.warnings)


def test_analyse_follows_consolidate_and_precedes_forecast():
    ids = [sid for sid, _label, _fn in stages.STAGES]
    assert ids.index("consolidate") < ids.index("analyse") < ids.index("forecast")


class _BoomToo(_Boom):
    code = "FY"


def _seed_g1():
    n = 100
    prepare_registry.put("g1", _g1(np.arange(n) % 9 + 50, np.arange(n) % 7, 1), {"id": "g1"})


def test_analyse_stage_goes_amber_when_the_failure_log_is_full(monkeypatch):
    _seed_g1()
    monkeypatch.setattr(findings.PIPELINE, "analyzers",
                        findings.PIPELINE.analyzers + [_Boom(), _BoomToo()])
    for _ in range(3):   # the same analyzers fail every run; the log stays at its cap
        pipeline._FAILURES[:] = [{"analyzer": "x", "code": "FX", "group_id": "g1",
                                  "error": "e"}] * 50
        r = stages.analyse_stage()
        assert len(pipeline.recent_failures()) == 50
        assert r.status == "amber" and "FX" in r.warnings[0] and "FY" in r.warnings[0]


def test_analyse_stage_ignores_failures_logged_by_other_requests():
    _seed_g1()
    pipeline._FAILURES.append({"analyzer": "x", "code": "FZ", "group_id": "g1", "error": "e"})
    r = stages.analyse_stage()
    assert r.status == "done" and r.warnings == []
