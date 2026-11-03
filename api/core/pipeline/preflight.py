"""Pre-run checks: do the uploaded files agree with each other?

Each check returns issues and never raises on bad data. Messages name the file
by its upload file name and give counts; they never quote a cell value from a
hospital file (item ids from the simulated operations files may appear, up to
the first five). A check whose inputs are missing is skipped silently when
another error already reports the missing file.
"""
from __future__ import annotations

import pandas as pd

from core import datasets, ops_derive, registry
from core.pipeline import staging

SHIFT_NAMES = ("Day", "Evening", "Night")
ORIGINS = ("simulated", "real")
NURSE_CATEGORY = "Professional Nurse"   # the solver matches this exact string
TRANSFORMED = "transformed"
_PURE_OTHERS = ("hourly_arrival", "clinical_daily", "clinical_hourly")
_ALWAYS = ("calendar", "weather_daily", "weather_hourly", "inventory_items",
           "inventory_movements", "staff_list", "shift_log", "staffing_daily")
_MAX_IDS = 5


def _file(dataset_id: str) -> str:
    return datasets.get_schema(dataset_id).source_filename_hint


def _issue(level: str, dataset_id: str, message: str) -> dict:
    return {"level": level, "file": _file(dataset_id), "message": message}


def _ids(values) -> str:
    vals = sorted(str(v) for v in values)
    return ", ".join(vals[:_MAX_IDS]) + (", and more" if len(vals) > _MAX_IDS else "")


def _slot_is_transformed() -> bool:
    meta = registry.get_metadata("daily_arrival") or {}
    return meta.get("filename") == TRANSFORMED


def _month_keys(dates: pd.Series) -> set[str]:
    parsed = pd.to_datetime(dates, errors="coerce").dropna()
    return set(parsed.dt.strftime("%Y-%m"))


def _arrivals_source() -> str | None:
    staged = bool(staging.months())
    has_pure = registry.get_df("daily_arrival") is not None
    # A slot filled by a previous run holds the transformed months, not an
    # independent upload: it counts as raw while those months are staged.
    uploaded = has_pure and not (staged and _slot_is_transformed())
    if staged and uploaded:
        return "both"
    if staged:
        return "raw"
    return "pure" if has_pure else None


def replaced_months() -> list[str]:
    """Staged months that would replace months of the uploaded pure history."""
    df = registry.get_df("daily_arrival")
    if df is None or "date" not in df.columns:
        return []
    history = _month_keys(df["date"])
    if _slot_is_transformed():
        candidates = staging.unapplied()
    else:
        candidates = [f"{m.year:04d}-{m.month:02d}" for m in staging.months()]
    return [m for m in candidates if m in history]


def _as_series(values, dates) -> pd.Series:
    s = pd.Series(pd.to_numeric(values, errors="coerce").astype("float64").to_numpy(),
                  index=pd.to_datetime(dates, errors="coerce"))
    return s[s.index.notna()]


def _arrival_counts() -> pd.Series | None:
    """Arrivals per date: staged months laid over the pure history, a whole
    month at a time."""
    parts = []
    staged = staging.months()
    pure = registry.get_df("daily_arrival")
    if pure is not None and {"date", "total_daily_arrivals"} <= set(pure.columns):
        s = _as_series(pure["total_daily_arrivals"], pure["date"])
        replaced = {(m.year, m.month) for m in staged}
        parts.append(s[[(d.year, d.month) not in replaced for d in s.index]])
    for m in staged:
        parts.append(_as_series(m.daily["patient_count"], m.daily["date"]))
    if not parts:
        return None
    out = pd.concat(parts)
    return out[~out.index.duplicated(keep="last")].sort_index()


def _ops_dates(dataset_id: str, issues: list) -> pd.Series | None:
    """Parsed dates of an operations file, or None (with an issue) if unreadable."""
    df = registry.get_df(dataset_id)
    if df is None or "date" not in df.columns:
        return None
    try:
        return pd.to_datetime(ops_derive.parse_iso_date(df["date"], _file(dataset_id)))
    except ValueError as e:
        issues.append(_issue("error", dataset_id, str(e)))
        return None


def _range(dates) -> str:
    return f"{min(dates).date()} to {max(dates).date()}"


def _presence(source, issues: list) -> None:
    if source is None:
        issues.append(_issue("error", "daily_arrival",
                             "No arrivals found. Upload the monthly registers or the "
                             "daily arrivals file."))
    elif source == "pure":
        for sid in _PURE_OTHERS:
            if registry.get_df(sid) is None:
                issues.append(_issue("error", sid, "Missing file. Upload it, or upload "
                                     "the monthly registers instead."))
    for sid in _ALWAYS:
        if registry.get_df(sid) is None:
            issues.append(_issue("error", sid, "Missing file. Upload it before running."))


def _ops_checks(issues: list) -> None:
    items = registry.get_df("inventory_items")
    moves = registry.get_df("inventory_movements")
    staff = registry.get_df("staff_list")
    shifts = registry.get_df("shift_log")

    if moves is not None and {"date", "item_id"} <= set(moves.columns):
        dup = int(moves.duplicated(["date", "item_id"]).sum())
        if dup:
            issues.append(_issue("error", "inventory_movements",
                                 f"{dup} rows repeat a date and item_id combination. "
                                 "Each item may appear once per day."))
    if items is not None and moves is not None \
            and "item_id" in items.columns and "item_id" in moves.columns:
        known, used = set(items["item_id"].astype(str)), set(moves["item_id"].astype(str))
        if used - known:
            issues.append(_issue("error", "inventory_movements",
                                 f"{len(used - known)} item_ids have movements but are not "
                                 f"in inventory_items.csv: {_ids(used - known)}."))
        if known - used:
            issues.append(_issue("error", "inventory_items",
                                 f"{len(known - used)} items have no rows in "
                                 f"inventory_movements.csv: {_ids(known - used)}."))
    if staff is not None and "category" in staff.columns:
        if not (staff["category"].astype(str).str.strip() == NURSE_CATEGORY).any():
            issues.append(_issue("error", "staff_list",
                                 f"No {NURSE_CATEGORY} in the category column. The roster "
                                 "solver needs at least one."))
    if shifts is not None and "shift" in shifts.columns:
        bad = int((~shifts["shift"].astype(str).str.strip().isin(SHIFT_NAMES)).sum())
        if bad:
            issues.append(_issue("error", "shift_log",
                                 f"{bad} rows have a shift name other than "
                                 f"{', '.join(SHIFT_NAMES)}."))
    for sid, df in (("inventory_items", items), ("staff_list", staff)):
        if df is not None and "data_origin" in df.columns:
            bad = int((~df["data_origin"].astype(str).str.strip().str.lower()
                       .isin(ORIGINS)).sum())
            if bad:
                issues.append(_issue("error", sid, f"{bad} rows have a data_origin other "
                                     f"than {' or '.join(ORIGINS)}."))


def _date_checks(issues: list) -> None:
    arrivals = _arrival_counts()
    move_dates = _ops_dates("inventory_movements", issues)
    shift_dates = _ops_dates("shift_log", issues)
    staffing_dates = _ops_dates("staffing_daily", issues)

    spans = {}
    if arrivals is not None and len(arrivals):
        spans["daily arrivals"] = set(arrivals.index)
    if move_dates is not None and len(move_dates):
        spans["inventory_movements.csv"] = set(move_dates)
    if shift_dates is not None and len(shift_dates):
        spans["shift_log.csv"] = set(shift_dates)
    if len(spans) >= 2 and not set.intersection(*spans.values()):
        detail = "; ".join(f"{k} {_range(v)}" for k, v in spans.items())
        issues.append({"level": "error", "file": ", ".join(spans),
                       "message": f"These files share no dates: {detail}."})

    staffing = registry.get_df("staffing_daily")
    if arrivals is not None and staffing is not None and staffing_dates is not None \
            and "total_arrivals" in staffing.columns:
        ops = _as_series(staffing["total_arrivals"], staffing_dates.to_numpy())
        ops = ops[~ops.index.duplicated(keep="first")]
        both = arrivals.index.intersection(ops.index)
        gap = (arrivals.loc[both] - ops.loc[both]).abs()
        off = gap[gap > 0.5]
        if len(off):
            issues.append(_issue("warning", "staffing_daily",
                                 f"total_arrivals differs from the daily arrivals on "
                                 f"{len(off)} of {len(both)} shared days; the largest gap "
                                 f"is {off.max():.0f}."))

    calendar = registry.get_df("calendar")
    if calendar is not None and "date" in calendar.columns:
        cal = pd.to_datetime(calendar["date"], errors="coerce").dropna()
        if len(cal):
            last = cal.max()
            for name, dates in (("Daily arrivals", None if arrivals is None else arrivals.index),
                                ("inventory_movements.csv", move_dates),
                                ("shift_log.csv", shift_dates)):
                if dates is not None and len(dates):
                    beyond = len(set(dates[dates > last]))
                    if beyond:
                        issues.append(_issue("warning", "calendar",
                                             f"{name} cover {beyond} days past the end of "
                                             f"the calendar ({last.date()})."))


def run_checks() -> dict:
    issues: list[dict] = []
    source = _arrivals_source()
    _presence(source, issues)
    _ops_checks(issues)
    _date_checks(issues)
    return {
        "ok": not any(i["level"] == "error" for i in issues),
        "issues": issues,
        "replaced_months": replaced_months(),
        "arrivals_source": source,
    }
