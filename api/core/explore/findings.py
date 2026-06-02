"""Public entry point for the findings layer.

Thin orchestrator: builds an AnalysisContext from the registries and runs
the default FindingPipeline. The router never imports the analyzer modules
directly — only this file.
"""
from __future__ import annotations
from typing import Any

from core import prepare_registry, registry
from core.joins import GROUPS

from .pipeline import AnalysisContext, FindingPipeline, MetricPipeline, recent_failures
from .profiles import profile_for
from .analyzers import DEFAULT as DEFAULT_ANALYZERS
from .metrics   import DEFAULT_FORECAST, DEFAULT_DATA_HEALTH, DEFAULT_METRICS


PIPELINE                = FindingPipeline(DEFAULT_ANALYZERS)
FORECAST_PIPELINE       = MetricPipeline(DEFAULT_FORECAST)
DATA_HEALTH_PIPELINE    = MetricPipeline(DEFAULT_DATA_HEALTH)
ALL_METRICS_PIPELINE    = MetricPipeline(DEFAULT_METRICS)


def _build_context() -> AnalysisContext:
    groups = {}
    for g in GROUPS:
        df = prepare_registry.get_df(g.id)
        if df is None:
            continue
        groups[g.id] = (df, profile_for(g.id, df))
    raw = {}
    for d_id in registry.loaded_ids():
        df = registry.get_df(d_id)
        if df is not None:
            raw[d_id] = df
    return AnalysisContext(groups=groups, raw_datasets=raw)


def run_findings() -> dict[str, Any]:
    ctx = _build_context()
    findings = PIPELINE.run(ctx)
    return {
        "findings": [f.to_dict() for f in findings],
        "count":    len(findings),
        "groups_seen": list(ctx.groups.keys()),
        "raw_datasets_seen": list(ctx.raw_datasets.keys()),
        "recent_failures": recent_failures(),
    }


def run_metrics(section: str = "forecast") -> dict[str, Any]:
    """Pipeline-driven KPI strip. `section` selects which analyzer set:
       - 'forecast'     : forecaster-relevant signals (default — Headlines)
       - 'data_health'  : descriptive book-keeping (Data Health tab)
       - 'all'          : both sets combined
    Adds zero hard-coded cards: every Metric is produced by a MetricAnalyzer
    applicable to the currently loaded groups."""
    if section == "data_health":
        pipeline = DATA_HEALTH_PIPELINE
    elif section == "all":
        pipeline = ALL_METRICS_PIPELINE
    else:
        pipeline = FORECAST_PIPELINE
    ctx = _build_context()
    metrics = pipeline.run(ctx)
    return {
        "metrics": [m.to_dict() for m in metrics],
        "count":   len(metrics),
        "section": section,
        "groups_seen": list(ctx.groups.keys()),
    }


def index() -> dict[str, Any]:
    """Static index of registered analyzers — useful for the UI to show what
    types of findings the pipeline knows how to produce, independent of
    whether the current context can satisfy them."""
    items = []
    for a in DEFAULT_ANALYZERS:
        items.append({
            "code":    a.code,
            "name":    a.__class__.__name__,
            "section": a.section,
            "required_roles":     list(a.required_roles),
            "requires_categories": list(a.requires_categories),
            "requires_raw_datasets": list(a.requires_raw_datasets),
            "required_group_grain": a.required_group_grain,
            "preferred_group_ids": list(a.preferred_group_ids),
        })
    return {"analyzers": items, "count": len(items)}


def coverage() -> dict[str, Any]:
    """Show, for the current loaded context, which analyzers can run and
    against which group. Helpful for the empty-state UI on the Headlines
    tab when only some groups are merged."""
    ctx = _build_context()
    pairs = PIPELINE.applicable_against(ctx)
    return {
        "items": [
            {"code": a.code, "name": a.__class__.__name__, "group": gid or None}
            for a, gid in pairs
        ],
        "groups_seen": list(ctx.groups.keys()),
        "raw_datasets_seen": list(ctx.raw_datasets.keys()),
    }
