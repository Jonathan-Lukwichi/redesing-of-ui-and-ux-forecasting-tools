"""Startup bootstrap: make the live G1 (daily-demand) group available without a
manual Data Hub → Prepare step, so the Forecast and Optimization pages always
run on the SAME real arrivals and report the SAME accuracy.

G1 lives in-memory (lost on restart), so we rebuild it on startup, best-effort:
fetch the three source datasets from the configured data repo, then merge. If
the repo isn't reachable, we skip silently and the pages fall back to demo data.
"""
from __future__ import annotations
import logging

from core import prepare_registry

log = logging.getLogger("bootstrap")

# G1 = daily arrivals + calendar + daily weather (see core/joins.py GROUPS).
G1_DATASETS = ("daily_arrival", "calendar", "weather_daily")


async def ensure_g1() -> bool:
    """Build G1 if it isn't already loaded. Returns True if G1 is available."""
    if prepare_registry.get_df("g1") is not None:
        return True

    # Imported lazily to avoid a circular import at module load.
    from routers.datasets import fetch_from_source
    from routers.prepare import build, BuildRequest

    try:
        for ds in G1_DATASETS:
            from core import registry
            if registry.get_df(ds) is None:
                await fetch_from_source(ds)
        await build(BuildRequest(group="g1"))
        log.info("G1 auto-built on startup (live forecast ready).")
        return True
    except Exception as e:  # network / repo / schema issue — degrade gracefully
        log.warning("G1 auto-build skipped (%s: %s); pages will use demo data "
                    "until G1 is built on Prepare.", type(e).__name__, e)
        return False
