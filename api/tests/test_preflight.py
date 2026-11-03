"""Pre-run checks (Task 8): the uploaded files must agree before a run."""
import pandas as pd
import pytest

from core import joins, registry
from core.pipeline import preflight, staging
from core.transform.month import MonthTables
from tests import pipeline_fixtures as fx


@pytest.fixture(autouse=True)
def seeded():
    saved = {sid: registry.get(sid) for sid in fx.slot_ids()}
    fx.reset()
    fx.seed_all()
    yield
    fx.reset()
    for sid, entry in saved.items():
        if entry is not None:
            registry.put(sid, entry.df, entry.metadata)


def _edit(sid, fn):
    df = registry.get_df(sid).copy()
    fn(df)
    fx.put(sid, df)


def _month(year, month, count=10):
    dates = pd.date_range(f"{year}-{month:02d}-01", periods=3).strftime("%Y-%m-%d")
    daily = pd.DataFrame({"date": dates, "patient_count": count})
    return MonthTables(year, month, f"sha-{year}-{month}-{count}", daily,
                       pd.DataFrame(), pd.DataFrame(), {"file": "x", "month": f"{year}-{month:02d}"})


def _issues(level=None, file=None):
    out = preflight.run_checks()["issues"]
    return [i for i in out if (level is None or i["level"] == level)
            and (file is None or i["file"] == file)]


def test_complete_set_is_ok():
    r = preflight.run_checks()
    assert r["ok"] and r["issues"] == []
    assert r["arrivals_source"] == "pure" and r["replaced_months"] == []


@pytest.mark.parametrize("builder", ["g1", "g2", "g3", "g4"])
def test_seed_all_builds_every_group(builder):
    spec = joins.get_group(builder)
    frames = [registry.get_df(d) for d in spec.required_datasets]
    df, _ = joins.BUILDERS[builder](*frames)
    assert len(df) > 0


def test_no_arrivals_source_is_an_error():
    registry.clear("daily_arrival")
    r = preflight.run_checks()
    assert not r["ok"] and r["arrivals_source"] is None
    errors = [i for i in r["issues"] if i["level"] == "error"]
    assert len(errors) == 1 and "No arrivals" in errors[0]["message"]


def test_staged_months_alone_are_a_source():
    registry.clear("daily_arrival")
    for sid in ("hourly_arrival", "clinical_daily", "clinical_hourly"):
        registry.clear(sid)
    staging.put(_month(2025, 3))
    r = preflight.run_checks()
    assert r["arrivals_source"] == "raw" and r["ok"]


def test_missing_calendar_is_an_error():
    registry.clear("calendar")
    errs = _issues("error", "calendar_features_2019_2026.csv")
    assert len(errs) == 1 and "Missing" in errs[0]["message"]
    assert len(_issues("error")) == 1   # nothing else reports the same cause


def test_duplicate_date_item_is_an_error():
    df = registry.get_df("inventory_movements")
    fx.put("inventory_movements", pd.concat([df, df.iloc[:3]], ignore_index=True))
    errs = _issues("error", "inventory_movements.csv")
    assert len(errs) == 1
    assert "3 rows repeat a date and item_id" in errs[0]["message"]


def test_unknown_item_is_an_error():
    df = registry.get_df("inventory_movements").copy()
    df.loc[df["item_id"] == "A01", "item_id"] = "ZZ9"
    fx.put("inventory_movements", df)
    msgs = [i["message"] for i in _issues("error")]
    assert any("ZZ9" in m and "not in inventory_items.csv" in m for m in msgs)
    assert any("A01" in m and "no rows in inventory_movements.csv" in m for m in msgs)


def test_item_ids_in_messages_are_capped_at_five():
    df = registry.get_df("inventory_movements").copy()
    df["item_id"] = "NEW" + df["item_id"].astype(str)
    fx.put("inventory_movements", df)
    msg = next(i["message"] for i in _issues("error", "inventory_movements.csv"))
    assert "30 item_ids" in msg and "and more" in msg
    assert len([t for t in msg.split() if t.startswith("NEW")]) == 5


def test_no_date_overlap_is_an_error():
    def shift_years(d):
        d["date"] = (pd.to_datetime(d["date"]) + pd.DateOffset(years=5)).dt.strftime("%Y-%m-%d")
    _edit("inventory_movements", shift_years)
    errs = [i for i in _issues("error") if "share no dates" in i["message"]]
    assert len(errs) == 1


def test_no_professional_nurse_is_an_error():
    _edit("staff_list", lambda d: d.__setitem__("category", "Enrolled Nurse"))
    errs = _issues("error", "staff_list.csv")
    assert len(errs) == 1 and "Professional Nurse" in errs[0]["message"]


def test_bad_shift_name_is_an_error():
    def rename(d):
        d.loc[d.index[:4], "shift"] = "Morning"
    _edit("shift_log", rename)
    errs = _issues("error", "shift_log.csv")
    assert len(errs) == 1 and "4 rows" in errs[0]["message"]
    assert "Morning" not in errs[0]["message"]


def test_bad_origin_value_is_an_error():
    _edit("inventory_items", lambda d: d.__setitem__("data_origin", "synthetic"))
    errs = _issues("error", "inventory_items.csv")
    assert len(errs) == 1 and "30 rows" in errs[0]["message"]


def test_unparseable_dates_are_an_error_not_a_crash():
    _edit("shift_log", lambda d: d.__setitem__("date", "03/04/2025"))
    errs = _issues("error", "shift_log.csv")
    assert len(errs) == 1 and "YYYY-MM-DD" in errs[0]["message"]


def test_arrivals_mismatch_is_a_warning():
    def bump(d):
        d.loc[d.index[0], "total_arrivals"] += 7
        d.loc[d.index[1], "total_arrivals"] += 3
    _edit("staffing_daily", bump)
    r = preflight.run_checks()
    assert r["ok"]
    warn = [i for i in r["issues"] if i["level"] == "warning"]
    assert len(warn) == 1 and warn[0]["file"] == "staffing_daily.csv"
    assert "2 of 396" in warn[0]["message"] and "largest gap is 7" in warn[0]["message"]


def test_coverage_past_calendar_is_a_warning():
    _edit("calendar", lambda d: d.drop(d.index[-10:], inplace=True))
    r = preflight.run_checks()
    assert r["ok"]
    warn = [i for i in r["issues"] if i["level"] == "warning"]
    assert warn and all("10 days past the end of the calendar" in w["message"] for w in warn)


def test_replaced_months_lists_overlap_with_uploaded_history():
    staging.put(_month(2025, 3))      # inside the uploaded history
    staging.put(_month(2030, 1))      # outside it
    r = preflight.run_checks()
    assert r["replaced_months"] == ["2025-03"]
    assert r["arrivals_source"] == "both"


def test_second_run_lists_only_new_months():
    staging.put(_month(2025, 3))
    staging.put(_month(2025, 4))
    registry.put("daily_arrival", registry.get_df("daily_arrival"),
                 {"id": "daily_arrival", "filename": "transformed"})
    staging.mark_applied()
    assert preflight.run_checks()["replaced_months"] == []
    staging.put(_month(2025, 4, count=99))        # re-uploaded and changed
    r = preflight.run_checks()
    assert r["replaced_months"] == ["2025-04"]
    assert r["arrivals_source"] == "raw"
