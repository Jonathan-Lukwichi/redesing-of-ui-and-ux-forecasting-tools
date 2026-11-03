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

from core import data_version, datasets, ops_derive, prepare_registry, registry
from core import optimization_engine as engine, simulation_data
from core.explore import findings
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
    f = findings.run_findings()
    m = findings.run_metrics("all")
    receipt = f"{f['count']} findings, {m['count']} metrics"
    codes = sorted(set(f["failed_codes"]) | set(m["failed_codes"]))   # this run only
    if not codes:
        return StageResult(receipt)
    return StageResult(receipt, [f"Some analyses did not finish ({', '.join(codes)}); "
                                 "the rest are shown."], status="amber")


# --- 5. Forecast --------------------------------------------------------------

PIPELINE_MODEL = "ml"
PIPELINE_HORIZON = 7
WEEKLY_SPECIALTIES = ("Maternity", "Psychiatry")
WEEKLY_HORIZON = 4


def _forecast_failure(exc) -> str:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict) and detail.get("error") == "g1_not_merged":
        return "There is no daily demand group (G1) to forecast from."
    if getattr(exc, "status_code", None) == 422:
        return "Too little arrivals history to forecast: at least 30 days are needed."
    # Other engine errors may quote data, so only the target is named.
    return "The Total ED forecast could not be fitted to the uploaded arrivals."


def forecast_stage() -> StageResult:
    # Imported lazily, as core/bootstrap.py does, to avoid a circular import.
    from fastapi import HTTPException
    from routers import forecast, optimization

    try:
        s, _weekly = forecast._series_for("g1", None)
        # Backtest first: the forecast then finds it and sizes its error with it.
        validation = forecast.compute_validation(
            forecast._training_window(s, False), PIPELINE_MODEL, PIPELINE_HORIZON)
        res = forecast.compute_total(PIPELINE_MODEL, PIPELINE_HORIZON)
    except HTTPException as e:
        raise StageFailed(_forecast_failure(e)) from None
    forecast._remember_run("total", res)
    optimization._FC_CACHE[(PIPELINE_MODEL, "open")] = optimization.week_forecast_from_result(
        res, PIPELINE_MODEL)
    del s
    gc.collect()

    done, absent, failed = _specialty_forecasts(forecast)
    receipt = f"Total ED: {PIPELINE_HORIZON}-day forecast from {res['forecast_start']}, "
    warnings: list[str] = []
    status = "done"
    if validation is not None and res.get("validated"):
        receipt += f"backtested on {_plural(int(validation['n_folds']), 'rolling origin')}"
    else:
        receipt += "not backtested, so plans use the model's one-step error"
        warnings.append("The Total ED forecast was not backtested: rolling-origin validation "
                        "needs at least 90 days of training data plus one full horizon.")
        status = "amber"
    receipt += f"; {len(done)} {'specialty' if len(done) == 1 else 'specialties'} forecast"
    weekly = [n for n in done if n in WEEKLY_SPECIALTIES]
    if weekly:
        receipt += f" ({' and '.join(weekly)} by week)"
    if absent:
        warnings.append(f"Not in the clinical file, so not forecast: {', '.join(absent)}.")
        status = "amber"
    if failed:
        warnings.append(f"Could not be forecast from the uploaded data: {', '.join(failed)}.")
        status = "amber"
    return StageResult(receipt, warnings, status)


def _specialty_forecasts(forecast) -> tuple[list[str], list[str], list[str]]:
    """Each specialty into its own keyed store, never the Total ED /last."""
    g3 = prepare_registry.get_df("g3")
    columns = set(g3.columns) if g3 is not None else set()
    del g3
    done, absent, failed = [], [], []
    for name, col in forecast.SPECIALTY_COLUMN.items():
        if col not in columns:
            absent.append(name)
            continue
        weekly = name in WEEKLY_SPECIALTIES
        try:
            res = forecast.compute_specialty(
                name, PIPELINE_MODEL, WEEKLY_HORIZON if weekly else PIPELINE_HORIZON,
                "weekly" if weekly else "daily")
        except Exception:  # noqa: BLE001 - one specialty never stops the rest
            failed.append(name)
            continue
        res["data_version"] = data_version.current()
        forecast._LAST_SPECIALTY[name] = res
        done.append(name)
    return done, absent, failed


# --- 6. Optimise --------------------------------------------------------------

POLICY_NOTICE = ("Tuned reorder settings were reset because the data changed. "
                 "Re-tune on the Optimization page.")


def recommended_family(comparison: dict | None) -> str | None:
    """The deployable family with the lowest simulated total cost. Naive and
    oracle are benchmarks, so they are never candidates; None if no deployable
    family was compared."""
    policies = (comparison or {}).get("policies") or {}
    costs = {p: float(v["total_cost_mean"]) for p, v in policies.items()
             if p in engine.DEPLOYABLE_POLICIES and v.get("total_cost_mean") is not None}
    return min(costs, key=costs.get) if costs else None


def _plan_failure(exc) -> str:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict) and detail.get("error") == "g1_not_merged":
        return ("There is no daily demand group (G1), so there is no forecast to plan "
                "from. The run never plans from demonstration data instead.")
    if isinstance(detail, dict) and detail.get("error") == "simulation_missing":
        return "The staff or stock tables are missing, so no plan was made."
    return "The roster and supply plan could not be built from the forecast."


def optimise_stage() -> StageResult:
    # Imported lazily, as core/bootstrap.py does, to avoid a circular import.
    from fastapi import HTTPException
    from routers import optimization, staff, supply

    try:
        plan = optimization.run_for_pipeline(PIPELINE_MODEL)
    except HTTPException as e:
        raise StageFailed(_plan_failure(e)) from None
    except ValueError:   # the live forecast had no days
        raise StageFailed("The forecast has no days to plan from.") from None
    gc.collect()
    # The evidence ladders, through the route functions so their /last caches fill.
    comparison = asyncio.run(supply.supply_compare_demo())
    gc.collect()
    ladder = asyncio.run(staff.staff_strategy_compare_demo())

    state = engine.get_policy_state()
    adopted = engine.DEPLOYABLE_POLICIES[state["policy"]]["label"]
    week = (plan.get("forecast") or {}).get("week_starting")
    kpis = (plan.get("supply") or {}).get("kpis") or {}
    receipt = (f"Lawful roster for the week from {week}; supply plan under the adopted "
               f"family, {adopted}, with {kpis.get('items_to_order', 0)} of "
               f"{_plural(int(kpis.get('items_total', 0)), 'item')} to order")
    rec = recommended_family(comparison)
    if rec is None:
        receipt += "; no recommendation, because no deployable family was compared"
    elif rec == state["policy"]:
        receipt += f"; the evidence recommends {adopted}, the adopted family"
    else:
        receipt += (f"; the evidence recommends {engine.DEPLOYABLE_POLICIES[rec]['label']}, "
                    f"while {adopted} stays adopted until changed on the Optimization page")
    n = len(ladder.get("strategies") or {})
    receipt += (f"; {n} rostering {'strategy' if n == 1 else 'strategies'} compared, "
                "and only the lawful roster is deployed")
    warnings = [POLICY_NOTICE] if engine.tuned_was_reset() else []
    return StageResult(receipt, warnings)


# Run order. Task 12 appends recommend.
STAGES: list[tuple[str, str, Callable[[], StageResult]]] = [
    ("check", "Check", check),
    ("transform", "Transform", transform),
    ("operations", "Operations", operations),
    ("consolidate", "Consolidate", consolidate),
    ("analyse", "Analyse", analyse_stage),
    ("forecast", "Forecast", forecast_stage),
    ("optimise", "Optimise", optimise_stage),
]
