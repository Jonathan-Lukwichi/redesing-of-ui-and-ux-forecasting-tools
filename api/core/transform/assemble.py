"""Assemble transformed months into the four pure tables, in memory.

Copied from the offline healthforecast_pipeline, in the order a full rebuild
runs it: run_pipeline.update_clinical_dataset (fill, then unify, then
aggregate), build_clinical_hourly, and src/purify.py's four build_pure_*
functions. Changes from the source, and only these:
  - frames pass in memory instead of through CSVs on disk; dates leave as
    YYYY-MM-DD text, as the pure CSVs carry them;
  - build_clinical_hourly's daily_* and temporal columns are not built,
    because purify drops them unread;
  - columns follow the pure schemas in core/datasets.py, with a field no
    assembled month's template carries filled with 0. A full rebuild gets the
    same 0 from the source's NaN fill, so a subset of months matches the
    full-rebuild files column for column.

Purify's dropping of total_* and *_all columns is kept on purpose: it zeroes
36 old-template clinical columns (spec section 11).

quality_checks ports scripts/validate_pure_datasets.py and adds the
zero-arrival-day warning from spec section 11.
"""
import pandas as pd

from core import datasets
from core.transform import clinical
from core.transform.month import MonthTables

_SCHEMAS = {
    "daily_arrival": datasets.DAILY_ARRIVAL,
    "hourly_arrival": datasets.HOURLY_ARRIVAL,
    "clinical_daily": datasets.CLINICAL_DAILY,
    "clinical_hourly": datasets.CLINICAL_HOURLY,
}


def assemble(months: list[MonthTables]) -> dict[str, pd.DataFrame]:
    """The four pure tables from a list of transformed months."""
    if not months:
        raise ValueError("no months to assemble")
    daily = pd.concat([m.daily for m in months], ignore_index=True)
    hourly = pd.concat([m.hourly for m in months], ignore_index=True)
    clin = _clinical_reasons_daily(
        pd.concat([m.clinical for m in months], ignore_index=True))
    tables = {
        "daily_arrival": _pure_daily(daily),
        "hourly_arrival": _pure_hourly(hourly),
        "clinical_daily": _pure_clinical(clin),
        "clinical_hourly": _pure_hourly_clinical(clin, hourly),
    }
    return {k: _schema_order(df, _SCHEMAS[k]) for k, df in tables.items()}


def overlay(existing: pd.DataFrame | None, new: pd.DataFrame) -> pd.DataFrame:
    """`new` replaces whole months of `existing`: every month that has a row in
    `new` keeps only new's rows; other months of `existing` are untouched."""
    if existing is None or existing.empty:
        return _sorted(new.copy())
    replaced = set(_month_key(new["date"]))
    kept = existing[~_month_key(existing["date"]).isin(replaced)]
    return _sorted(pd.concat([kept, new], ignore_index=True))


def _month_key(dates: pd.Series) -> pd.Series:
    return pd.to_datetime(dates).dt.strftime("%Y-%m")


def _sorted(df: pd.DataFrame) -> pd.DataFrame:
    keys = ["date", "hour"] if "hour" in df.columns else ["date"]
    return df.sort_values(keys, kind="stable").reset_index(drop=True)


def _schema_order(df: pd.DataFrame, schema) -> pd.DataFrame:
    expected = list(schema.expected_columns)
    missing = [c for c in expected if c not in df.columns]
    if missing:
        df = pd.concat([df, pd.DataFrame(0, index=df.index, columns=missing)], axis=1)
    extras = [c for c in df.columns if c not in expected]
    return df[expected + extras]


# --- run_pipeline.update_clinical_dataset (full rebuild) ---------------------

def _clinical_reasons_daily(combined: pd.DataFrame) -> pd.DataFrame:
    combined["date"] = pd.to_datetime(combined["date"])
    # A row whose template lacks a given field (e.g. template C has no *_all
    # violence columns) gets NaN for it after concat - coerce to 0 BEFORE
    # unify_violence_columns, whose "row[all_col] > 0" test must see a real
    # 0, not NaN, to correctly fall back to the male/female/child sum.
    skip_cols = {'date', 'year', 'month', 'day', 'source_file'}
    for col in combined.columns:
        if col not in skip_cols:
            combined[col] = pd.to_numeric(combined[col], errors='coerce').fillna(0).astype(int)
            combined.loc[combined[col] < 0, col] = 0
    # One block per column after the loop above; consolidate before unify adds more.
    combined = combined.copy()

    combined = clinical.unify_violence_columns(combined)
    combined = clinical.add_aggregate_columns(combined)
    return combined


# --- src/purify.py ------------------------------------------------------------

def _pure_daily(df: pd.DataFrame) -> pd.DataFrame:
    pure = df[[
        "date", "arrival_normal_hours", "arrival_after_hours", "patient_count"
    ]].rename(columns={
        "arrival_normal_hours": "arrivals_normal_hours",
        "arrival_after_hours": "arrivals_after_hours",
        "patient_count": "total_daily_arrivals",
    })
    pure["date"] = pd.to_datetime(pure["date"]).dt.strftime("%Y-%m-%d")
    for col in ["arrivals_normal_hours", "arrivals_after_hours", "total_daily_arrivals"]:
        pure[col] = pd.to_numeric(pure[col], errors="coerce").fillna(0).astype(int)
    return pure.sort_values("date").drop_duplicates("date").reset_index(drop=True)


def _pure_hourly(df: pd.DataFrame) -> pd.DataFrame:
    pure = df[["date", "hour", "arrival_count"]].copy()
    pure["date"] = pd.to_datetime(pure["date"]).dt.strftime("%Y-%m-%d")
    pure["hour"] = pure["hour"].astype(int)
    pure["arrival_count"] = pd.to_numeric(pure["arrival_count"], errors="coerce").fillna(0).astype(int)
    return (
        pure.sort_values(["date", "hour"])
            .drop_duplicates(["date", "hour"])
            .reset_index(drop=True)
    )


def _pure_clinical(df: pd.DataFrame) -> pd.DataFrame:
    # Drop derived aggregates - belong in feature engineering, not a pure dataset
    derived_prefix = tuple(["total_"])
    derived_suffix = tuple(["_all"])
    metadata = {"year", "month", "day", "source_file"}

    drop_cols = {
        c for c in df.columns
        if c.startswith(derived_prefix)
        or c.endswith(derived_suffix)
        or c in metadata
    }
    keep_cols = [c for c in df.columns if c not in drop_cols]

    pure = df[keep_cols].copy()
    pure["date"] = pd.to_datetime(pure["date"]).dt.strftime("%Y-%m-%d")
    for col in pure.columns:
        if col == "date":
            continue
        pure[col] = pd.to_numeric(pure[col], errors="coerce").fillna(0).astype(int)
    return pure.sort_values("date").drop_duplicates("date").reset_index(drop=True)


def _pure_hourly_clinical(clinical_daily: pd.DataFrame, hourly: pd.DataFrame) -> pd.DataFrame:
    # run_pipeline.build_clinical_hourly: the daily clinical features, prefixed
    # 'clinical_', left-joined onto the hourly arrivals by date.
    clinical_features = clinical_daily.drop(columns=['year', 'month', 'day', 'source_file'], errors='ignore')
    clinical_cols = [c for c in clinical_features.columns if c != 'date']
    clinical_features = clinical_features.rename(columns={c: f'clinical_{c}' for c in clinical_cols})

    merged = hourly.drop(columns=['datetime'], errors='ignore').copy()
    merged['date'] = pd.to_datetime(merged['date'])
    merged = merged.merge(clinical_features, on='date', how='left')
    c_cols = sorted([c for c in merged.columns if c.startswith('clinical_')])

    # purify.build_pure_hourly_clinical
    keep_base = ["date", "hour", "arrival_count"]
    atomic_clinical = [
        c for c in c_cols
        if not c.startswith("clinical_total_")
        and not c.endswith("_all")
    ]
    pure = merged[keep_base + atomic_clinical].copy()
    pure = pure.rename(columns={c: c[len("clinical_"):] for c in atomic_clinical})

    pure["date"] = pd.to_datetime(pure["date"]).dt.strftime("%Y-%m-%d")
    pure["hour"] = pure["hour"].astype(int)
    for col in pure.columns:
        if col == "date":
            continue
        pure[col] = pd.to_numeric(pure[col], errors="coerce").fillna(0).astype(int)
    return (
        pure.sort_values(["date", "hour"])
            .drop_duplicates(["date", "hour"])
            .reset_index(drop=True)
    )


# --- scripts/validate_pure_datasets.py ---------------------------------------

SPECIALTY_COLS = [
    "spec_medicine", "spec_orthopaedics", "spec_surgery", "spec_gynae",
    "spec_maternity", "spec_paediatrics", "spec_psychiatry",
]
AGE_COLS = ["age_0_5", "age_5_12", "age_12_plus"]
GENDER_COLS = ["gender_male", "gender_female"]

EPS = 0.05  # 5% tolerance for coherence invariants (specialty / demographics vs total)


def quality_checks(tables: dict[str, pd.DataFrame]) -> list[str]:
    """Warnings for the run receipt: every validator invariant that did not
    pass ("FAIL" or "WARN", as the validator grades it), then zero-arrival
    days. An empty list means every check passed."""
    results = _validate(tables)
    out = [f"{r['status']} {r['invariant']}: {r['detail']}"
           for r in results if r["status"] != "PASS"]
    zero = _zero_arrival_days(tables["daily_arrival"])
    if zero:
        out.append(zero)
    return out


def _zero_arrival_days(daily: pd.DataFrame) -> str | None:
    zero = daily.loc[daily["total_daily_arrivals"] == 0, "date"]
    if zero.empty:
        return None
    per_month = _month_key(zero).value_counts().sort_index()
    where = ", ".join(f"{m} ({n})" for m, n in per_month.items())
    days = "1 day has" if len(zero) == 1 else f"{len(zero)} days have"
    return f"WARN {days} zero arrivals and may be missing data: {where}"


def _check(results, name, ok, detail, severity="FAIL"):
    status = "PASS" if ok else severity
    results.append({"invariant": name, "status": status, "detail": detail})
    return ok


def _validate(tables: dict[str, pd.DataFrame]) -> list[dict]:
    daily = tables["daily_arrival"].copy()
    hourly = tables["hourly_arrival"].copy()
    clinical = tables["clinical_daily"].copy()
    hourly_clinical = tables["clinical_hourly"].copy()

    daily["date"] = pd.to_datetime(daily["date"])
    hourly["date"] = pd.to_datetime(hourly["date"])
    clinical["date"] = pd.to_datetime(clinical["date"])
    hourly_clinical["date"] = pd.to_datetime(hourly_clinical["date"])

    results = []

    # 1. pure_daily.date unique and monotonic
    dup_daily = daily["date"].duplicated().sum()
    mono_daily = daily["date"].is_monotonic_increasing
    _check(results, "1. pure_daily.date unique & monotonic",
           dup_daily == 0 and mono_daily,
           f"duplicates={dup_daily}, monotonic={mono_daily}")

    # 2. pure_hourly.(date,hour) unique; 24 rows per complete day
    dup_hourly = hourly.duplicated(["date", "hour"]).sum()
    hours_per_day = hourly.groupby("date").size()
    incomplete_days = int((hours_per_day != 24).sum())
    _check(results, "2. pure_hourly.(date,hour) unique & 24 rows/day",
           dup_hourly == 0 and incomplete_days == 0,
           f"duplicates={dup_hourly}, days_not_24h={incomplete_days}")

    # 3. Sum of hourly arrivals == daily total_daily_arrivals
    hourly_sum = hourly.groupby("date")["arrival_count"].sum().reset_index(name="hourly_sum")
    merged = daily.merge(hourly_sum, on="date", how="inner")
    mismatch3 = (merged["hourly_sum"] != merged["total_daily_arrivals"]).sum()
    _check(results, "3. sum(hourly) == daily total",
           mismatch3 == 0,
           f"mismatched_days={mismatch3} of {len(merged)}")

    # 4, 7, 8. Specialty, age and gender sums approx daily total -- WARN
    for name, cols in (("4. sum(specialties) ~= daily total", SPECIALTY_COLS),
                       ("7. sum(age buckets) ~= daily total", AGE_COLS),
                       ("8. sum(gender) ~= daily total", GENDER_COLS)):
        if all(c in clinical.columns for c in cols):
            part = clinical[cols].sum(axis=1).rename("_sum")
            m = daily.merge(pd.concat([clinical["date"], part], axis=1), on="date", how="inner")
            denom = m["total_daily_arrivals"].replace(0, pd.NA)
            rel_err = (m["_sum"] - m["total_daily_arrivals"]).abs() / denom
            bad = int((rel_err > EPS).sum())
            _check(results, f"{name} (tol 5%)", bad == 0,
                   f"days_exceeding_tolerance={bad} of {int(denom.notna().sum())}",
                   severity="WARN")
        else:
            _check(results, name, False, "columns missing from pure_clinical",
                   severity="WARN")

    # 5. All three datasets share the same date range
    same_range = (daily["date"].min() == hourly["date"].min() == clinical["date"].min()) and (
        daily["date"].max() == hourly["date"].max() == clinical["date"].max()
    )
    _check(results, "5. shared date range across datasets",
           same_range,
           f"daily=[{daily['date'].min().date()}..{daily['date'].max().date()}], "
           f"hourly=[{hourly['date'].min().date()}..{hourly['date'].max().date()}], "
           f"clinical=[{clinical['date'].min().date()}..{clinical['date'].max().date()}]")

    # 6. total_daily_arrivals == NH + AH (exact)
    nh_ah_sum = daily["arrivals_normal_hours"] + daily["arrivals_after_hours"]
    bad6 = int((nh_ah_sum != daily["total_daily_arrivals"]).sum())
    _check(results, "6. total == NH + AH (exact)",
           bad6 == 0,
           f"mismatched_rows={bad6} of {len(daily)}")

    # 9. No negative values in any count column
    negs = [int((df.select_dtypes(include=["number"]) < 0).sum().sum())
            for df in (daily, hourly, clinical, hourly_clinical)]
    _check(results, "9. no negative counts anywhere",
           sum(negs) == 0,
           f"daily_neg={negs[0]}, hourly_neg={negs[1]}, clinical_neg={negs[2]}, "
           f"hourly_clinical_neg={negs[3]}")

    # 10. pure_hourly_clinical.(date,hour) unique & 24 rows/day
    dup_hc = hourly_clinical.duplicated(["date", "hour"]).sum()
    hours_per_day_hc = hourly_clinical.groupby("date").size()
    incomplete_hc = int((hours_per_day_hc != 24).sum())
    _check(results, "10. pure_hourly_clinical.(date,hour) unique & 24 rows/day",
           dup_hc == 0 and incomplete_hc == 0,
           f"duplicates={dup_hc}, days_not_24h={incomplete_hc}")

    # 11. pure_hourly_clinical.arrival_count matches pure_hourly.arrival_count
    m11 = hourly.merge(
        hourly_clinical[["date", "hour", "arrival_count"]].rename(
            columns={"arrival_count": "arrival_count_hc"}
        ),
        on=["date", "hour"],
        how="inner",
    )
    mismatch11 = int((m11["arrival_count"] != m11["arrival_count_hc"]).sum())
    _check(results, "11. arrival_count matches between hourly datasets",
           mismatch11 == 0,
           f"mismatched_rows={mismatch11} of {len(m11)}")

    # 12. sum over hours of hourly_clinical specialty == pure_clinical daily specialty (WARN)
    check_cols = ["spec_medicine", "age_0_5", "gender_male"]
    per_col_bad = []
    for col in check_cols:
        if col not in hourly_clinical.columns or col not in clinical.columns:
            per_col_bad.append(f"{col}=MISSING")
            continue
        hc_sum = hourly_clinical.groupby("date")[col].sum().reset_index(name="hc_sum")
        m = clinical[["date", col]].merge(hc_sum, on="date", how="inner")
        denom = m[col].replace(0, pd.NA)
        rel_err = (m["hc_sum"] - m[col]).abs() / denom
        bad = int((rel_err > EPS).sum())
        per_col_bad.append(f"{col}={bad}")
    _check(results, "12. sum(hourly_clinical) ~= daily_clinical for sample cols (tol 5%)",
           all("=0" in s for s in per_col_bad),
           ", ".join(per_col_bad),
           severity="WARN")

    results.sort(key=lambda r: int(r["invariant"].split(".")[0]))
    return results
