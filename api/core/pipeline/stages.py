"""The pipeline stages, in run order. Each takes no arguments, reads the
uploaded data from the registries, and returns a StageResult or raises
StageFailed with a plain-English reason.

Receipts and warnings name files, counts and months only: never a cell value
from a hospital file.
"""
from __future__ import annotations

import asyncio
import gc
from dataclasses import dataclass, field
from typing import Callable, Literal

import pandas as pd

from core import datasets, ops_derive, prepare_registry, registry, simulation_data
from core.explore import findings
from core.explore.pipeline import recent_failures
from core.pipeline import preflight, staging
from core.pipeline.consolidate import build_ops_daily
from core.transform.assemble import assemble, overlay, quality_checks

TRANSFORMED = preflight.TRANSFORMED
GROUP_IDS = ("g1", "g2", "g3", "g4")
OPS_IDS = ("inventory_items", "inventory_movements", "staff_list", "shift_log",
           "staffing_daily")
HOURLY_CLINICAL_NOTICE = (
    "Hourly clinical figures are each day's values repeated across its 24 hours, "
    "not counts measured hour by hour.")
EARLY_CLINICAL_NOTICE = (
    "Some clinical breakdowns read 0 before April 2023: the older registers kept "
    "them only in the *_all and total_* columns, which the transformation drops.")
_APRIL_2023 = (2023, 4)


@dataclass
class StageResult:
    receipt: str
    warnings: list[str] = field(default_factory=list)
    status: Literal["done", "skipped", "amber"] = "done"


class StageFailed(Exception):
    """A stage could not finish. The message is shown to the user as is."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _plural(n: int, word: str) -> str:
    return f"{n:,} {word}" + ("" if n == 1 else "s")


# --- 0. Check -----------------------------------------------------------------

def check() -> StageResult:
    r = preflight.run_checks()
    errors = [f"{i['file']}: {i['message']}" for i in r["issues"] if i["level"] == "error"]
    warnings = [f"{i['file']}: {i['message']}" for i in r["issues"]
                if i["level"] != "error"]
    if errors:
        raise StageFailed("The files are not ready. " + " ".join(errors))
    receipt = "Files present and consistent"
    if r["replaced_months"]:
        receipt += (f"; staged registers replace {_plural(len(r['replaced_months']), 'month')}"
                    f" of the uploaded history ({', '.join(r['replaced_months'])})")
    return StageResult(receipt, warnings)


# --- 1. Transform ---------------------------------------------------------------

def _clear_groups() -> None:
    for g in (*GROUP_IDS, "ops_daily"):
        prepare_registry.clear(g)


def _slot_metadata(sid: str, df: pd.DataFrame, signature: bytes) -> dict:
    # Imported lazily, as core/bootstrap.py does, to avoid a circular import.
    from routers.datasets import _build_metadata
    meta = _build_metadata(datasets.get_schema(sid), df, TRANSFORMED, signature)
    meta["filename"] = TRANSFORMED   # the replaced-months rule in preflight reads this
    return meta


def transform() -> StageResult:
    # The checks have passed, so the inputs are about to change: drop the built
    # groups now, so a later failure leaves them absent, never half-replaced.
    _clear_groups()
    months = staging.months()
    if not months:
        return StageResult("No registers staged; the uploaded daily tables are used as "
                           "they are", status="skipped")
    new = assemble(months)
    tables = {sid: overlay(registry.get_df(sid), df) for sid, df in new.items()}
    del new
    daily = tables["daily_arrival"]
    if daily.empty or pd.to_numeric(daily["total_daily_arrivals"]).sum() <= 0:
        raise StageFailed("No arrivals remain after the transform, so the run stopped. "
                          "Upload registers that record arrivals.")

    signature = "".join(m.sha256 for m in months).encode()
    for sid, df in tables.items():
        registry.put(sid, df, _slot_metadata(sid, df, signature))
    warnings = quality_checks(tables)
    if not tables["clinical_hourly"].empty:
        warnings.append(HOURLY_CLINICAL_NOTICE)
    if any((m.year, m.month) < _APRIL_2023 for m in months):
        warnings.append(EARLY_CLINICAL_NOTICE)
    staging.mark_applied()

    arrivals = sum(int(m.receipt["arrivals"]) for m in months)
    return StageResult(f"{_plural(len(months), 'month')}, {arrivals:,} arrivals, "
                       "no patient identifiers kept", warnings)


# --- 2. Operations ------------------------------------------------------------

def operations() -> StageResult:
    frames = {sid: registry.get_df(sid) for sid in OPS_IDS}
    missing = [sid for sid, df in frames.items() if df is None]
    if missing:
        raise StageFailed(f"Missing operations files: {', '.join(missing)}.")
    items, staff = frames["inventory_items"], frames["staff_list"]
    try:
        derived = ops_derive.derive(items, frames["inventory_movements"], staff,
                                    frames["shift_log"], frames["staffing_daily"])
    except ValueError as e:   # the messages name the file, never a cell value
        raise StageFailed(str(e)) from None
    origin = ops_derive.origin_of(items, staff)
    simulation_data.publish(derived, origin, posts=len(staff))
    days = int(derived["supply_panel.csv"]["date"].nunique())
    active = len(derived["staff_members.csv"])
    return StageResult(f"{_plural(len(items), 'item')}, {active:,} active staff of "
                       f"{_plural(len(staff), 'post')}, {_plural(days, 'day')} of stock "
                       f"movements, {origin} data")


# --- 3. Consolidate -----------------------------------------------------------

def _build_failure(group: str, exc) -> str:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict) and detail.get("error") == "missing_sources":
        return detail["message"]
    # Other join errors may quote data, so only the group is named.
    return f"Could not build {group.upper()} from the uploaded files."


def consolidate() -> StageResult:
    try:
        return _consolidate()
    except BaseException:
        _clear_groups()   # groups built before the failure go too: none half-replaced
        raise


def _consolidate() -> StageResult:
    # Imported lazily, as core/bootstrap.py does, to avoid a circular import.
    from fastapi import HTTPException
    from routers.prepare import BuildRequest, build

    rows = {}
    for g in GROUP_IDS:
        try:
            meta = asyncio.run(build(BuildRequest(group=g)))
        except HTTPException as e:
            raise StageFailed(_build_failure(g, e)) from None
        rows[g] = int(meta["rows"])
        del meta
        gc.collect()

    df = build_ops_daily(prepare_registry.get_df("g1"), registry.get_df("staffing_daily"),
                         registry.get_df("inventory_movements"),
                         registry.get_df("inventory_items"))
    dates = pd.to_datetime(df["date"])
    prepare_registry.put("ops_daily", df, {
        "id": "ops_daily", "label": "Daily operations", "grain": "daily",
        "rows": int(len(df)), "columns": list(df.columns), "n_columns": int(df.shape[1]),
        "date_range": ({"start": str(dates.min().date()), "end": str(dates.max().date())}
                       if len(df) else None),
    })
    groups = ", ".join(f"{g.upper()} {_plural(n, 'row')}" for g, n in rows.items())
    receipt = f"{groups}; daily operations {_plural(len(df), 'day')}"
    if df.empty:
        return StageResult(receipt, ["The arrivals, staffing and stock movement files share "
                                     "no dates, so the daily operations table is empty."],
                           status="amber")
    return StageResult(receipt)


# --- 4. Analyse ---------------------------------------------------------------

def analyse_stage() -> StageResult:
    before = recent_failures()
    n_findings = findings.run_findings()["count"]
    n_metrics = findings.run_metrics("all")["count"]
    after = recent_failures()
    receipt = f"{n_findings} findings, {n_metrics} metrics"
    # The failure log keeps only the last 50, so at that cap compare contents.
    grew = len(after) > len(before) or (len(before) >= 50 and after != before)
    if not grew:
        return StageResult(receipt)
    new = after[-max(1, len(after) - len(before)):]
    codes = ", ".join(sorted({f["code"] for f in new}))
    return StageResult(receipt, [f"Some analyses did not finish ({codes}); the rest are shown."],
                       status="amber")


# Run order. Later tasks append forecast, optimise and recommend.
STAGES: list[tuple[str, str, Callable[[], StageResult]]] = [
    ("check", "Check", check),
    ("transform", "Transform", transform),
    ("operations", "Operations", operations),
    ("consolidate", "Consolidate", consolidate),
    ("analyse", "Analyse", analyse_stage),
]
