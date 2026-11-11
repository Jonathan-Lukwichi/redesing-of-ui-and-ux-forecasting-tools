"""Small valid frames for all 12 upload slots, and shared fixtures, for
pipeline tests.

``seed_all()`` registers the frames in the in-memory registry and saves nothing
to disk. Callers must clear the registry and staging afterwards (``reset()``),
or use the ``seeded`` fixture, which does both and restores what was there.
The 396 days (2025-01-01 to 2026-01-31) are the days of the bundled
staff_daily.csv; arrivals come from its ``total_arrivals``; the five
operations slots are the demo pack.

The fixtures (``stub_stages``, ``hold_in``, ``fail_in``, ``seeded``) are used by
importing them into a test module: ``from tests.pipeline_fixtures import ...``.
"""
import contextlib
import threading
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from core import datasets, prepare_registry, registry, simulation_data
from core.pipeline import stages, staging

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "api" / "data" / "demo-pack"
BUNDLED = REPO / "api" / "data" / "simulation" / "staff_daily.csv"
OPS_SLOTS = ("inventory_items", "inventory_movements", "staff_list", "shift_log",
             "staffing_daily")


def slot_ids() -> list[str]:
    return datasets.schema_ids()


def put(dataset_id: str, df: pd.DataFrame, filename: str | None = None) -> None:
    schema = datasets.get_schema(dataset_id)
    registry.put(dataset_id, df, {"id": dataset_id, "filename": filename or schema.source_filename_hint,
                                  "rows": int(len(df))})


def reset() -> None:
    registry.clear_all()
    staging.clear()


def _hourly_counts(totals: pd.Series) -> np.ndarray:
    """Spread each day's total over 24 hours (whole numbers that sum back)."""
    base, extra = np.divmod(totals.to_numpy(dtype=int), 24)
    return base[:, None] + (np.arange(24)[None, :] < extra[:, None])


def seed_all() -> None:
    staff_daily = pd.read_csv(BUNDLED)
    dates = staff_daily["date"].astype(str)
    total = staff_daily["total_arrivals"].astype(int)
    n = len(dates)

    daily = pd.DataFrame({"date": dates, "arrivals_normal_hours": total // 2,
                          "arrivals_after_hours": total - total // 2,
                          "total_daily_arrivals": total})
    hours = np.tile(np.arange(24), n)
    hdates = np.repeat(dates.to_numpy(), 24)
    hourly = pd.DataFrame({"date": hdates, "hour": hours,
                           "arrival_count": _hourly_counts(total).ravel()})
    spec = {c: 1 for c in ("spec_medicine", "spec_orthopaedics", "spec_surgery",
                           "spec_paediatrics")}
    clin_daily = pd.DataFrame({"date": dates, **{c: [v] * n for c, v in spec.items()}})
    clin_hourly = hourly.assign(spec_medicine=1, spec_surgery=1)

    calendar = pd.DataFrame({"date": dates, "is_weekend": staff_daily["is_weekend"],
                             "is_public_holiday": staff_daily["is_public_holiday"]})
    weather_daily = pd.DataFrame({"date": dates, "temp_mean_C": 20.0})
    weather_hourly = pd.DataFrame({
        "datetime": [f"{d} {h:02d}:00:00" for d, h in zip(hdates, hours)],
        "temp_C": 20.0, "date": hdates, "hour": hours})

    for sid, df in (("daily_arrival", daily), ("hourly_arrival", hourly),
                    ("clinical_daily", clin_daily), ("clinical_hourly", clin_hourly),
                    ("calendar", calendar), ("weather_daily", weather_daily),
                    ("weather_hourly", weather_hourly)):
        put(sid, df)
    for sid in OPS_SLOTS:
        put(sid, pd.read_csv(PACK / f"{sid}.csv"))


# --- Shared fixtures -----------------------------------------------------------

GROUPS = ("g1", "g2", "g3", "g4", "ops_daily")
STAGE_IDS = ("check", "transform", "operations", "consolidate", "analyse", "forecast",
             "optimise", "recommend")
EXTRA_STAGE_IDS = ("analyse_arrivals", "analyse_staff", "analyse_supply")


@pytest.fixture
def seeded():
    """The 12 slots seeded with seed_all(); the registries are restored afterwards."""
    saved_slots = {sid: registry.get(sid) for sid in slot_ids()}
    saved_groups = {g: prepare_registry.get(g) for g in GROUPS}
    saved_uploaded = dict(simulation_data._UPLOADED)
    saved_meta = dict(simulation_data._META)
    reset()
    seed_all()
    yield
    reset()
    for sid, entry in saved_slots.items():
        if entry is not None:
            registry.put(sid, entry.df, entry.metadata)
    for g, entry in saved_groups.items():
        prepare_registry.clear(g)
        if entry is not None:
            prepare_registry.put(g, entry.df, entry.metadata)
    simulation_data._UPLOADED.clear()
    simulation_data._UPLOADED.update(saved_uploaded)
    simulation_data._META.clear()
    simulation_data._META.update(saved_meta)


@pytest.fixture
def stub_stages(monkeypatch):
    """Replace every stage, pipeline and extra, with a stub under its real id
    that does nothing and ends done. Returns {stage id: function}: a function
    put there runs in that stub's place (hold_in and fail_in use it)."""
    instead: dict = {}

    def stub(sid):
        def run():
            other = instead.get(sid)
            return other() if other is not None else stages.StageResult(f"{sid} done")
        return run

    monkeypatch.setattr(stages, "STAGES", [(sid, sid.capitalize(), stub(sid))
                                           for sid in STAGE_IDS])
    monkeypatch.setattr(stages, "EXTRA_STAGES", [(sid, sid.capitalize(), stub(sid))
                                                 for sid in EXTRA_STAGE_IDS])
    return instead


@pytest.fixture
def hold_in(stub_stages):
    """``with hold_in(sid) as entered:`` makes that stub block until the block
    exits. ``entered`` is set once the stub has started."""
    @contextlib.contextmanager
    def hold(sid):
        entered, release = threading.Event(), threading.Event()

        def held():
            entered.set()
            release.wait(30)
            return stages.StageResult(f"{sid} done")

        stub_stages[sid] = held
        try:
            yield entered
        finally:
            release.set()
    return hold


@pytest.fixture
def fail_in(stub_stages):
    """``with fail_in(sid):`` makes that stub raise StageFailed("stop")."""
    @contextlib.contextmanager
    def fail(sid):
        def failing():
            raise stages.StageFailed("stop")

        stub_stages[sid] = failing
        try:
            yield
        finally:
            stub_stages.pop(sid, None)
    return fail
