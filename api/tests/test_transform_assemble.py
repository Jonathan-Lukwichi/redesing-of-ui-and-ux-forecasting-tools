"""Assembling transformed months into the four pure tables (Task 6).

Built from small synthetic MonthTables: no register is read here. The
equivalence proof against the offline pipeline's pure CSVs is the gated
golden test in test_transform_golden.py.
"""
import calendar
from datetime import datetime

import pandas as pd

from core import datasets
from core.transform import assemble, clinical
from core.transform.month import MonthTables

TABLE_SCHEMAS = {
    "daily_arrival": datasets.DAILY_ARRIVAL,
    "hourly_arrival": datasets.HOURLY_ARRIVAL,
    "clinical_daily": datasets.CLINICAL_DAILY,
    "clinical_hourly": datasets.CLINICAL_HOURLY,
}


def _month(year, month, clinical_fields, nh=3, ah=2, zero_days=()):
    """One month as transform_month returns it, with `nh` arrivals at 09:00
    and `ah` at 20:00 every day except `zero_days`."""
    name = f"Casualty_Daily_Register_{year}_{month:02d}.xlsx"
    n = calendar.monthrange(year, month)[1]
    days = range(1, n + 1)
    meta = lambda d: {"date": datetime(year, month, d), "year": year,  # noqa: E731
                      "month": month, "day": d, "source_file": name}

    hourly = pd.DataFrame([
        {**meta(d), "hour": h,
         "arrival_count": 0 if d in zero_days else {9: nh, 20: ah}.get(h, 0)}
        for d in days for h in range(24)
    ])
    daily = pd.DataFrame([
        {**meta(d),
         "arrival_normal_hours": 0 if d in zero_days else nh,
         "arrival_after_hours": 0 if d in zero_days else ah,
         "patient_count": 0 if d in zero_days else nh + ah}
        for d in days
    ])
    clinical = pd.DataFrame([{**meta(d), **clinical_fields} for d in days])
    receipt = {"file": name, "month": f"{year:04d}-{month:02d}"}
    return MonthTables(year, month, "0" * 64, daily, hourly, clinical, receipt)


# An old-template month (race-based violence, *_all) and a new-template month
# (gender-based violence, death on arrival), with the fields clinical.py
# extracts for each template.
OLD = {**dict.fromkeys(clinical.MAPPING_B, 0),
       "spec_medicine": 4, "gunshot_all": 2, "accident_mva": 1}
NEW = {**dict.fromkeys(clinical.MAPPING_C, 0),
       "spec_medicine": 3, "gunshot_male": 1, "death_on_arrival": 1, "accident_mva": -2}


def test_columns_match_the_pure_schemas():
    tables = assemble.assemble([_month(2021, 3, OLD), _month(2023, 4, NEW)])
    assert set(tables) == set(TABLE_SCHEMAS)
    for table_id, schema in TABLE_SCHEMAS.items():
        df = tables[table_id]
        assert list(df.columns) == list(schema.expected_columns), table_id
        assert set(schema.required_columns) <= set(df.columns)
        # Dates are text, as in the pure CSVs the upload slots accept.
        assert df["date"].str.fullmatch(r"\d{4}-\d{2}-\d{2}").all()
    assert len(tables["daily_arrival"]) == 31 + 30
    assert len(tables["hourly_arrival"]) == (31 + 30) * 24
    assert len(tables["clinical_hourly"]) == (31 + 30) * 24
    daily = tables["daily_arrival"]
    assert (daily["total_daily_arrivals"] == 5).all()
    assert (daily["arrivals_normal_hours"] == 3).all()


def test_templates_with_different_columns_combine():
    tables = assemble.assemble([_month(2021, 3, OLD), _month(2023, 4, NEW)])
    clin = tables["clinical_daily"].set_index("date")
    hourly = tables["clinical_hourly"]
    for df in (clin, hourly):
        assert not df.isna().any().any()
    old, new = clin.loc["2021-03-15"], clin.loc["2023-04-15"]
    # A field the template lacks is 0, not NaN.
    assert old["death_on_arrival"] == 0
    assert new["death_on_arrival"] == 1
    assert old["spec_medicine"] == 4 and new["spec_medicine"] == 3
    # Negative counts are clipped to 0, as the offline pipeline does.
    assert new["accident_mva"] == 0
    # *_all is dropped, so old-template violence reads 0 (spec section 11).
    assert "gunshot_all" not in clin.columns
    assert not any(c.startswith("total_") for c in clin.columns)
    assert old["gunshot_male"] == 0 and new["gunshot_male"] == 1
    # The hourly clinical table repeats each day's values across its 24 hours.
    day = hourly[hourly["date"] == "2023-04-15"]
    assert len(day) == 24
    assert (day["spec_medicine"] == 3).all()
    assert day["arrival_count"].sum() == 5


def _daily(dates, value):
    return pd.DataFrame({"date": dates, "total_daily_arrivals": value})


def test_overlay_replaces_whole_months_only():
    jan = [f"2024-01-{d:02d}" for d in range(1, 32)]
    feb = [f"2024-02-{d:02d}" for d in range(1, 30)]
    existing = _daily(jan + feb, 100)
    new = _daily(["2024-02-01", "2024-02-02"], 7)
    out = assemble.overlay(existing, new)
    assert list(out.columns) == ["date", "total_daily_arrivals"]
    assert out["date"].tolist() == jan + ["2024-02-01", "2024-02-02"]
    assert (out.loc[out["date"].str.startswith("2024-01"), "total_daily_arrivals"] == 100).all()
    assert out.loc[out["date"].str.startswith("2024-02"), "total_daily_arrivals"].tolist() == [7, 7]
    # Hourly tables are ordered by date then hour.
    hourly_old = pd.DataFrame({"date": ["2024-01-01"] * 2 + ["2024-02-01"] * 2,
                               "hour": [0, 1, 0, 1], "arrival_count": [1, 1, 1, 1]})
    hourly_new = pd.DataFrame({"date": ["2024-02-01"] * 2, "hour": [1, 0],
                               "arrival_count": [9, 8]})
    out = assemble.overlay(hourly_old, hourly_new)
    assert out[["date", "hour"]].values.tolist() == [
        ["2024-01-01", 0], ["2024-01-01", 1], ["2024-02-01", 0], ["2024-02-01", 1]]
    assert out["arrival_count"].tolist() == [1, 1, 8, 9]


def test_overlay_with_no_history_returns_new():
    new = _daily(["2024-02-01", "2024-02-02"], 7)
    for existing in (None, new.iloc[0:0]):
        out = assemble.overlay(existing, new)
        pd.testing.assert_frame_equal(out, new)


def test_quality_checks_warn_on_zero_days():
    clean = assemble.assemble([_month(2021, 3, OLD), _month(2023, 4, NEW)])
    assert not any("zero arrivals" in w for w in assemble.quality_checks(clean))

    gappy = assemble.assemble([_month(2021, 3, OLD, zero_days=(4, 5)),
                               _month(2023, 4, NEW, zero_days=(9,))])
    warnings = assemble.quality_checks(gappy)
    zero = [w for w in warnings if "zero arrivals" in w]
    assert len(zero) == 1
    assert "3 days" in zero[0]
    assert "2021-03 (2)" in zero[0] and "2023-04 (1)" in zero[0]
