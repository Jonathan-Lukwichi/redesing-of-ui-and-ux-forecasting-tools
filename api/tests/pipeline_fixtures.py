"""Small valid frames for all 12 upload slots, for pipeline tests.

``seed_all()`` registers them in the in-memory registry and saves nothing to
disk. Callers must clear the registry and staging afterwards (``reset()``).
The 396 days (2025-01-01 to 2026-01-31) are the days of the bundled
staff_daily.csv; arrivals come from its ``total_arrivals``; the five
operations slots are the demo pack.
"""
from pathlib import Path

import numpy as np
import pandas as pd

from core import datasets, registry
from core.pipeline import staging

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "demo-data"
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
