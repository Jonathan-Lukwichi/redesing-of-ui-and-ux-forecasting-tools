"""
/api/explore/* — exploratory data analyses computed on demand from the
merged groups (G1–G4) cached in core.prepare_registry.

Twelve endpoints organised in 6 sections, all returning JSON for the
React Charts components on the Explore page.
"""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, HTTPException

from core import prepare_registry
from core.explore import (
    quality,
    task1,
    task2,
    task3,
    layer2,
    impact_matrix as impact,
    findings as F,
)


router = APIRouter(prefix="/api/explore", tags=["explore"])


# ---- helpers -----------------------------------------------------------------

def _require_df(group_id: str):
    df = prepare_registry.get_df(group_id)
    if df is None:
        raise HTTPException(
            404,
            f"Group '{group_id}' is not merged yet. Build it on the Prepare page first.",
        )
    return df


# ---- Findings pipeline (headline cards) -------------------------------------

@router.get("/findings")
async def findings_run() -> dict[str, Any]:
    """Run the full finding pipeline against the currently loaded groups +
    raw datasets and return the resulting headline cards."""
    return F.run_findings()


@router.get("/metrics")
async def metrics_run(section: str = "forecast") -> dict[str, Any]:
    """Pipeline-driven KPI strip. ?section=forecast (default) returns
    forecaster-relevant signals. ?section=data_health returns the descriptive
    book-keeping cards. ?section=all returns everything."""
    return F.run_metrics(section=section)


@router.get("/findings/index")
async def findings_index() -> dict[str, Any]:
    """Static index of registered analyzers — independent of what's loaded.
    Lets the UI describe what kinds of findings the pipeline produces."""
    return F.index()


@router.get("/findings/coverage")
async def findings_coverage() -> dict[str, Any]:
    """For the current context: which analyzers can run and against which
    group. Drives the empty-state messaging on the Headlines tab when only
    some groups are merged."""
    return F.coverage()


# ---- index -------------------------------------------------------------------

@router.get("/index")
async def index() -> dict[str, Any]:
    """List every endpoint with its target group + short description."""
    return {
        "items": [
            # Quality
            {"id": "missingness",     "group": "any", "section": "quality", "label": "Missingness summary"},
            {"id": "outliers",        "group": "g1",  "section": "quality", "label": "Outlier scatter"},
            {"id": "covid_regimes",   "group": "g1",  "section": "quality", "label": "COVID regime split"},
            # Task 1
            {"id": "distribution",    "group": "g1",  "section": "task1",   "label": "Distribution + fitted PDFs"},
            {"id": "stl",             "group": "g1",  "section": "task1",   "label": "STL decomposition"},
            {"id": "acf_pacf",        "group": "g1",  "section": "task1",   "label": "ACF / PACF"},
            {"id": "calendar_effects","group": "g1",  "section": "task1",   "label": "Calendar effects"},
            # Task 2
            {"id": "specialty_mix",   "group": "g3",  "section": "task2",   "label": "Specialty mix over time"},
            {"id": "specialty_corr",  "group": "g3",  "section": "task2",   "label": "Specialty correlation"},
            # Task 3
            {"id": "class_balance",   "group": "g3",  "section": "task3",   "label": "Critical-event class balance"},
            # Layer 2
            {"id": "hourly_profile",  "group": "g2",  "section": "layer2",  "label": "Hourly profile"},
            # Synthesis
            {"id": "impact_matrix",   "group": "g1",  "section": "synthesis","label": "Impact matrix"},
        ],
    }


# ---- §5.2 Quality -----------------------------------------------------------

@router.get("/missingness")
async def get_missingness(group: str = "g1") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **quality.missingness(df)}


@router.get("/outliers")
async def get_outliers(group: str = "g1", target: str = "total_daily_arrivals") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **quality.outliers(df, target_col=target)}


@router.get("/covid_regimes")
async def get_covid_regimes(group: str = "g1", target: str = "total_daily_arrivals") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **quality.covid_regimes(df, target_col=target)}


# ---- §5.3 Task 1 ------------------------------------------------------------

@router.get("/task1/distribution")
async def get_task1_distribution(group: str = "g1", target: str = "total_daily_arrivals",
                                  bins: int = 30) -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task1.distribution(df, target_col=target, bins=bins)}


@router.get("/task1/stl")
async def get_task1_stl(group: str = "g1", target: str = "total_daily_arrivals",
                         period: int = 7) -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task1.stl_decomposition(df, target_col=target, period=period)}


@router.get("/task1/acf_pacf")
async def get_task1_acf_pacf(group: str = "g1", target: str = "total_daily_arrivals",
                              nlags: int = 30) -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task1.acf_pacf(df, target_col=target, nlags=nlags)}


@router.get("/task1/calendar_effects")
async def get_task1_calendar_effects(group: str = "g1",
                                       target: str = "total_daily_arrivals") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task1.calendar_effects(df, target_col=target)}


# ---- §5.4 Task 2 ------------------------------------------------------------

@router.get("/task2/specialty_mix")
async def get_task2_specialty_mix(group: str = "g3") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task2.specialty_mix(df)}


@router.get("/task2/specialty_corr")
async def get_task2_specialty_corr(group: str = "g3") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task2.specialty_correlation(df)}


# ---- §5.5 Task 3 ------------------------------------------------------------

@router.get("/task3/class_balance")
async def get_task3_class_balance(group: str = "g3", percentile: int = 90) -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **task3.class_balance(df, percentile=percentile)}


# ---- §5.6 Layer 2 -----------------------------------------------------------

@router.get("/layer2/hourly_profile")
async def get_layer2_hourly_profile(group: str = "g2",
                                      target: str = "arrival_count") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **layer2.hourly_profile(df, target_col=target)}


# ---- §5.7 Synthesis ---------------------------------------------------------

@router.get("/impact_matrix")
async def get_impact_matrix(group: str = "g1",
                              target: str = "total_daily_arrivals") -> dict[str, Any]:
    df = _require_df(group)
    return {"group": group, **impact.impact_matrix(df, target_col=target)}
