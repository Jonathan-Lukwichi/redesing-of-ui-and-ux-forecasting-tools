"""
G1–G4 join builders (Chapter 4 §4.5.4).

Each function takes the per-source DataFrames from the dataset registry and
returns the joined DataFrame plus an Audit. Cleaning steps applied during the
build are recorded on the audit so the Prepare page can display them.

G1 = daily_arrival + calendar + weather_daily             (key: date)
G2 = hourly_arrival + calendar + weather_hourly           (key: date+hour)
G3 = clinical_daily + calendar + weather_daily            (key: date)
G4 = clinical_hourly + calendar + weather_hourly          (key: date+hour)
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

import pandas as pd

from . import cleaning


@dataclass(frozen=True)
class GroupSpec:
    id: str
    label: str
    description: str
    grain: str
    key_columns: tuple[str, ...]
    required_datasets: tuple[str, ...]
    expected_rows_hint: int | None = None


GROUPS: tuple[GroupSpec, ...] = (
    GroupSpec(
        id="g1",
        label="G1 · Daily demand",
        description="Daily total arrivals + calendar + weather. Task 1 forecasting dataset.",
        grain="daily",
        key_columns=("date",),
        required_datasets=("daily_arrival", "calendar", "weather_daily"),
        expected_rows_hint=2440,
    ),
    GroupSpec(
        id="g2",
        label="G2 · Hourly demand",
        description="Hourly arrivals + calendar (broadcast) + hourly weather. Layer 2 input.",
        grain="hourly",
        key_columns=("date", "hour"),
        required_datasets=("hourly_arrival", "calendar", "weather_hourly"),
        expected_rows_hint=58560,
    ),
    GroupSpec(
        id="g3",
        label="G3 · Clinical daily",
        description="Daily clinical breakdown + calendar + weather. Task 2 & 3 features.",
        grain="daily",
        key_columns=("date",),
        required_datasets=("clinical_daily", "calendar", "weather_daily"),
        expected_rows_hint=2440,
    ),
    GroupSpec(
        id="g4",
        label="G4 · Clinical hourly",
        description="Hourly clinical breakdown + calendar + hourly weather. Richest feature set.",
        grain="hourly",
        key_columns=("date", "hour"),
        required_datasets=("clinical_hourly", "calendar", "weather_hourly"),
        expected_rows_hint=58560,
    ),
)

_BY_ID = {g.id: g for g in GROUPS}


def get_group(group_id: str) -> GroupSpec | None:
    return _BY_ID.get(group_id)


def group_ids() -> list[str]:
    return [g.id for g in GROUPS]


# -- internal helpers ----------------------------------------------------------

def _merge_no_collision(
    left: pd.DataFrame,
    right: pd.DataFrame,
    on: list[str],
    right_name: str,
    audit: cleaning.Audit,
    how: str = "inner",
) -> pd.DataFrame:
    """Merge left and right on `on`. If right brings columns that already exist
    in left (other than the join keys), drop them from right first — we always
    keep the left source's version. This avoids the `_x`/`_y` collision noise
    pandas would otherwise produce when calendar/weather share date columns."""
    drop_from_right = [c for c in right.columns if c in left.columns and c not in on]
    if drop_from_right:
        right = right.drop(columns=drop_from_right)
    rows_before = len(left)
    merged = left.merge(right, on=on, how=how)
    audit.add(
        f"merge_{right_name}",
        on=on,
        how=how,
        rows_before=rows_before,
        rows_after=int(len(merged)),
        right_columns_added=len(right.columns) - len(on),
        right_columns_dropped_due_to_collision=drop_from_right,
    )
    return merged


def _normalise_date(df: pd.DataFrame, col: str = "date") -> pd.DataFrame:
    """Ensure df[col] is a string YYYY-MM-DD so merges line up regardless of
    whether the source had dt64 or strings."""
    if col not in df.columns:
        return df
    df = df.copy()
    df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d")
    return df


# -- group builders ------------------------------------------------------------

def build_g1(
    daily_arrival: pd.DataFrame,
    calendar: pd.DataFrame,
    weather_daily: pd.DataFrame,
    *, date_start: str | None = None, date_end: str | None = None,
) -> tuple[pd.DataFrame, cleaning.Audit]:
    audit = cleaning.Audit()
    a = _normalise_date(daily_arrival)
    c = _normalise_date(calendar)
    w = _normalise_date(weather_daily)
    audit.add("normalise_date", note="date columns coerced to YYYY-MM-DD strings on all three sources")

    df = _merge_no_collision(a, c, on=["date"], right_name="calendar", audit=audit)
    df = _merge_no_collision(df, w, on=["date"], right_name="weather_daily", audit=audit)

    df = cleaning.drop_empty_columns(df, audit)
    df = cleaning.audit_duplicate_keys(df, ["date"], audit)
    df = cleaning.slice_by_date(df, "date", date_start, date_end, audit)
    df = cleaning.assign_schema_era(df, "date", audit)
    df = cleaning.assign_covid_regime(df, "date", audit)
    df = cleaning.flag_zero_arrival_days(df, "total_daily_arrivals", audit)
    return df, audit


def build_g2(
    hourly_arrival: pd.DataFrame,
    calendar: pd.DataFrame,
    weather_hourly: pd.DataFrame,
    *, date_start: str | None = None, date_end: str | None = None,
) -> tuple[pd.DataFrame, cleaning.Audit]:
    audit = cleaning.Audit()
    a = _normalise_date(hourly_arrival)
    c = _normalise_date(calendar)
    w = _normalise_date(weather_hourly)
    audit.add("normalise_date", note="date columns coerced to YYYY-MM-DD strings on all three sources")

    # Calendar broadcasts across hours (left-merge so missing dates in calendar don't drop hours).
    df = _merge_no_collision(a, c, on=["date"], right_name="calendar", audit=audit, how="left")
    df = _merge_no_collision(df, w, on=["date", "hour"], right_name="weather_hourly", audit=audit, how="left")

    df = cleaning.drop_empty_columns(df, audit)
    df = cleaning.audit_duplicate_keys(df, ["date", "hour"], audit)
    df = cleaning.slice_by_date(df, "date", date_start, date_end, audit)
    df = cleaning.assign_schema_era(df, "date", audit)
    df = cleaning.assign_covid_regime(df, "date", audit)
    df = cleaning.flag_zero_arrival_days(df, "arrival_count", audit)
    return df, audit


def build_g3(
    clinical_daily: pd.DataFrame,
    calendar: pd.DataFrame,
    weather_daily: pd.DataFrame,
    *, date_start: str | None = None, date_end: str | None = None,
) -> tuple[pd.DataFrame, cleaning.Audit]:
    audit = cleaning.Audit()
    cd = _normalise_date(clinical_daily)
    c  = _normalise_date(calendar)
    w  = _normalise_date(weather_daily)
    audit.add("normalise_date", note="date columns coerced to YYYY-MM-DD strings on all three sources")

    # Derive a clinical total from the specialty columns so we can flag zero-days.
    spec_cols = [c for c in cd.columns if c.startswith("spec_")]
    if spec_cols:
        cd = cd.copy()
        cd["clinical_total"] = cd[spec_cols].sum(axis=1, numeric_only=True)
        audit.add("derive_clinical_total", from_columns=spec_cols)

    df = _merge_no_collision(cd, c, on=["date"], right_name="calendar", audit=audit)
    df = _merge_no_collision(df, w, on=["date"], right_name="weather_daily", audit=audit)

    df = cleaning.drop_empty_columns(df, audit)
    df = cleaning.audit_duplicate_keys(df, ["date"], audit)
    df = cleaning.slice_by_date(df, "date", date_start, date_end, audit)
    df = cleaning.assign_schema_era(df, "date", audit)
    df = cleaning.assign_covid_regime(df, "date", audit)
    df = cleaning.flag_zero_arrival_days(df, "clinical_total", audit)
    return df, audit


def build_g4(
    clinical_hourly: pd.DataFrame,
    calendar: pd.DataFrame,
    weather_hourly: pd.DataFrame,
    *, date_start: str | None = None, date_end: str | None = None,
) -> tuple[pd.DataFrame, cleaning.Audit]:
    audit = cleaning.Audit()
    ch = _normalise_date(clinical_hourly)
    c  = _normalise_date(calendar)
    w  = _normalise_date(weather_hourly)
    audit.add("normalise_date", note="date columns coerced to YYYY-MM-DD strings on all three sources")

    df = _merge_no_collision(ch, c, on=["date"], right_name="calendar", audit=audit, how="left")
    df = _merge_no_collision(df, w, on=["date", "hour"], right_name="weather_hourly", audit=audit, how="left")

    df = cleaning.drop_empty_columns(df, audit)
    df = cleaning.audit_duplicate_keys(df, ["date", "hour"], audit)
    df = cleaning.slice_by_date(df, "date", date_start, date_end, audit)
    df = cleaning.assign_schema_era(df, "date", audit)
    df = cleaning.assign_covid_regime(df, "date", audit)
    df = cleaning.flag_zero_arrival_days(df, "arrival_count", audit)
    return df, audit


BUILDERS = {
    "g1": build_g1,
    "g2": build_g2,
    "g3": build_g3,
    "g4": build_g4,
}
