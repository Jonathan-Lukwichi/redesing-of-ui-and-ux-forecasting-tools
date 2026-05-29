"""
Pandas-only cleaning helpers used by the Prepare stage. All functions are pure:
they take a DataFrame and return a (possibly modified) copy plus an audit
record describing what was done.

These helpers implement the data-prep operations called out in Chapter 4:
- §4.4 ETL: timezone-naive datetime, drop empty columns
- §4.4.2 schema-era assignment (3 eras)
- §4.6.3 COVID structural break (3 regimes)
- §4.6.1 zero-arrival day flag

Dates used for eras and regimes match the v2.1 ETL spec. They can be tuned
later by passing different cutoffs.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd


# Default cutoffs — Chapter 4 v2.1.
ERA_CUTOFFS = (datetime(2021, 11, 1), datetime(2023, 4, 1))
COVID_CUTOFFS = (datetime(2020, 3, 15), datetime(2022, 3, 1))


@dataclass
class AuditStep:
    name: str
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class Audit:
    steps: list[AuditStep] = field(default_factory=list)

    def add(self, name: str, **detail: Any) -> None:
        self.steps.append(AuditStep(name=name, detail=detail))

    def to_list(self) -> list[dict[str, Any]]:
        return [{"step": s.name, **s.detail} for s in self.steps]


# ---- 1. Datetime normalisation ----------------------------------------------

_DT_CANDIDATES = ("datetime", "date", "Date", "timestamp", "ds", "time")


def find_datetime_col(df: pd.DataFrame) -> str | None:
    for c in _DT_CANDIDATES:
        if c in df.columns:
            return c
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            return c
    return None


def clean_datetime(df: pd.DataFrame, audit: Audit | None = None) -> pd.DataFrame:
    """Force the datetime column to timezone-naive datetime64[ns].
    Renames the column to `datetime` if it isn't already, leaving any
    original `date` column untouched."""
    df = df.copy()
    col = find_datetime_col(df)
    if col is None:
        if audit is not None:
            audit.add("clean_datetime", outcome="skipped — no datetime column")
        return df

    dt = pd.to_datetime(df[col], errors="coerce")
    tz_stripped = False
    if getattr(dt.dt, "tz", None) is not None:
        dt = dt.dt.tz_localize(None)
        tz_stripped = True

    # Ensure both 'date' and 'datetime' columns exist consistently.
    if col != "datetime":
        df["datetime"] = dt
    else:
        df["datetime"] = dt

    if "date" not in df.columns:
        df["date"] = dt.dt.normalize().dt.strftime("%Y-%m-%d")

    if audit is not None:
        audit.add(
            "clean_datetime",
            source_column=col,
            tz_stripped=tz_stripped,
            na_after=int(dt.isna().sum()),
        )
    return df


# ---- 2. Empty column drop ----------------------------------------------------

def drop_empty_columns(df: pd.DataFrame, audit: Audit | None = None) -> pd.DataFrame:
    dropped: list[str] = []
    for c in df.columns:
        s = df[c]
        if s.isna().all():
            dropped.append(c)
            continue
        # all-empty-string after strip
        try:
            if s.dtype == object and (s.astype(str).str.strip() == "").all():
                dropped.append(c)
        except Exception:
            pass
    out = df.drop(columns=dropped) if dropped else df
    if audit is not None:
        audit.add("drop_empty_columns", dropped=dropped, count=len(dropped))
    return out


# ---- 3. Schema era (Chapter 4 §4.4.2) ----------------------------------------

def assign_schema_era(
    df: pd.DataFrame,
    date_col: str = "date",
    audit: Audit | None = None,
    cutoffs: tuple[datetime, datetime] = ERA_CUTOFFS,
) -> pd.DataFrame:
    if date_col not in df.columns:
        if audit is not None:
            audit.add("assign_schema_era", outcome=f"skipped — no '{date_col}' column")
        return df
    df = df.copy()
    dt = pd.to_datetime(df[date_col], errors="coerce")
    c1, c2 = cutoffs
    eras = np.where(dt < c1, 1, np.where(dt < c2, 2, 3))
    df["schema_era"] = eras
    counts = pd.Series(eras).value_counts().to_dict()
    if audit is not None:
        audit.add(
            "assign_schema_era",
            era_1_pre=f"<{c1.date().isoformat()}",
            era_2=f"{c1.date().isoformat()}–{c2.date().isoformat()}",
            era_3_post=f">={c2.date().isoformat()}",
            counts={int(k): int(v) for k, v in counts.items()},
        )
    return df


# ---- 4. COVID regime (Chapter 4 §4.6.3) --------------------------------------

def assign_covid_regime(
    df: pd.DataFrame,
    date_col: str = "date",
    audit: Audit | None = None,
    cutoffs: tuple[datetime, datetime] = COVID_CUTOFFS,
) -> pd.DataFrame:
    if date_col not in df.columns:
        if audit is not None:
            audit.add("assign_covid_regime", outcome=f"skipped — no '{date_col}' column")
        return df
    df = df.copy()
    dt = pd.to_datetime(df[date_col], errors="coerce")
    c1, c2 = cutoffs
    regimes = np.where(dt < c1, "pre", np.where(dt < c2, "during", "post"))
    df["covid_regime"] = regimes
    counts = pd.Series(regimes).value_counts().to_dict()
    if audit is not None:
        audit.add(
            "assign_covid_regime",
            pre=f"<{c1.date().isoformat()}",
            during=f"{c1.date().isoformat()}–{c2.date().isoformat()}",
            post=f">={c2.date().isoformat()}",
            counts={str(k): int(v) for k, v in counts.items()},
        )
    return df


# ---- 5. Zero-arrival flag (Chapter 4 §4.6.1) ---------------------------------

def flag_zero_arrival_days(
    df: pd.DataFrame,
    arrival_col: str,
    audit: Audit | None = None,
) -> pd.DataFrame:
    if arrival_col not in df.columns:
        if audit is not None:
            audit.add("flag_zero_arrival_days", outcome=f"skipped — no '{arrival_col}' column")
        return df
    df = df.copy()
    s = pd.to_numeric(df[arrival_col], errors="coerce").fillna(0)
    df["is_zero_day"] = (s == 0).astype(int)
    n = int(df["is_zero_day"].sum())
    if audit is not None:
        audit.add(
            "flag_zero_arrival_days",
            source_column=arrival_col,
            zero_day_count=n,
        )
    return df


# ---- 6. Duplicate-key audit --------------------------------------------------

def audit_duplicate_keys(
    df: pd.DataFrame,
    key_columns: tuple[str, ...] | list[str],
    audit: Audit | None = None,
) -> pd.DataFrame:
    cols = [c for c in key_columns if c in df.columns]
    if not cols or audit is None:
        return df
    dup_mask = df.duplicated(subset=cols, keep=False)
    audit.add("audit_duplicate_keys", key_columns=cols, duplicate_rows=int(dup_mask.sum()))
    return df


# ---- 7. Date-range slice -----------------------------------------------------

def slice_by_date(
    df: pd.DataFrame,
    date_col: str = "date",
    start: str | None = None,
    end: str | None = None,
    audit: Audit | None = None,
) -> pd.DataFrame:
    if date_col not in df.columns or (start is None and end is None):
        return df
    dt = pd.to_datetime(df[date_col], errors="coerce")
    mask = pd.Series([True] * len(df), index=df.index)
    if start:
        mask &= dt >= pd.to_datetime(start)
    if end:
        mask &= dt <= pd.to_datetime(end)
    out = df.loc[mask].reset_index(drop=True)
    if audit is not None:
        audit.add(
            "slice_by_date",
            start=start, end=end,
            rows_before=int(len(df)), rows_after=int(len(out)),
        )
    return out
