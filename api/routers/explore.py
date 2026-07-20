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
    sections,
)
from core.explore.pipeline import slice_by_range
from core.explore.profiles import profile_for
from core import prepare_registry


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
async def findings_run(time_range: str = "all_time", specialty: str | None = None) -> dict[str, Any]:
    """Run the full finding pipeline against the currently loaded groups +
    raw datasets, optionally restricted to a time window."""
    return F.run_findings(time_range=time_range, specialty=specialty)


@router.get("/metrics")
async def metrics_run(
    section: str = "forecast", time_range: str = "all_time",
    specialty: str | None = None,
) -> dict[str, Any]:
    """Pipeline-driven KPI strip. ?section=forecast (default) returns
    forecaster-relevant signals. ?section=data_health returns descriptive
    book-keeping cards. ?section=all returns everything. ?time_range slices
    every analyzer's input window."""
    return F.run_metrics(section=section, time_range=time_range, specialty=specialty)


# ---- Section builders (chart-specific data) --------------------------------
# Each endpoint runs a single section-builder against the requested merged
# group, optionally restricted to a time-range / specialty / horizon.

def _section_context(group_id: str, time_range: str = "all_time"):
    df = prepare_registry.get_df(group_id)
    if df is None:
        raise HTTPException(404, f"Group '{group_id}' not built")
    sliced = slice_by_range(df, time_range, date_col="date")
    profile = profile_for(group_id, sliced)
    return sliced, profile


@router.get("/sections/patient_arrivals_band")
async def section_patient_arrivals_band(group: str = "g1", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_patient_arrivals_band(df, profile, None)}


@router.get("/sections/yearly_trend")
async def section_yearly_trend(group: str = "g1"):
    # Yearly trend always uses the full series — the time-range filter would
    # hide the very thing the chart is trying to show.
    df, profile = _section_context(group, "all_time")
    return {"group": group, **sections.build_yearly_trend(df, profile, None)}


@router.get("/sections/day_of_week_pattern")
async def section_dow_pattern(group: str = "g1", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_day_of_week_pattern(df, profile, None)}


@router.get("/sections/weekday_vs_weekend_hourly")
async def section_weekday_vs_weekend_hourly(group: str = "g2", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_weekday_vs_weekend_hourly(df, profile, None)}


@router.get("/sections/calendar_effects_ranked")
async def section_calendar_effects_ranked(group: str = "g1", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_calendar_effects_ranked(df, profile, None)}


@router.get("/sections/temperature_by_category")
async def section_temperature_by_category(group: str = "g3", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_temperature_by_category(df, profile, None)}


@router.get("/sections/calendar_x_category")
async def section_calendar_x_category(group: str = "g3", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_calendar_x_category(df, profile, None)}


@router.get("/sections/hour_dow_banded")
async def section_hour_dow_banded(group: str = "g2", time_range: str = "all_time"):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range, **sections.build_hour_dow_banded(df, profile, None)}


@router.get("/sections/category_volume_by_horizon")
async def section_category_volume_by_horizon(
    group: str = "g3", time_range: str = "all_time", horizon: str = "day",
):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range,
            **sections.build_category_volume_by_horizon(df, profile, None, horizon=horizon)}


@router.get("/sections/critical_events_by_horizon")
async def section_critical_events_by_horizon(
    group: str = "g3", time_range: str = "all_time", horizon: str = "week",
):
    df, profile = _section_context(group, time_range)
    return {"group": group, "time_range": time_range,
            **sections.build_critical_events_by_horizon(df, profile, None, horizon=horizon)}


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
