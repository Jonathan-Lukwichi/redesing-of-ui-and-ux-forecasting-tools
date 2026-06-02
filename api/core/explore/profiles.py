"""Default GroupProfile factory.

Today the four merged groups (G1–G4) have known shapes, so the profile is
declared explicitly. When a new group is added later, this is the single
file that needs an entry: every analyzer downstream picks it up
automatically through the pipeline.

A profile may also be filled dynamically from a DataFrame — for example,
to detect a category set from any column with a `spec_` prefix. Use
introspect_profile() for that path.
"""
from __future__ import annotations
import pandas as pd

from .pipeline import GroupProfile


_SPECIALTY_HINTS = (
    "spec_medicine", "spec_orthopaedics", "spec_surgery", "spec_gynae",
    "spec_maternity", "spec_paediatrics", "spec_psychiatry",
)


def _present(df: pd.DataFrame, cols: tuple[str, ...]) -> list[str]:
    return [c for c in cols if c in df.columns]


def profile_for(group_id: str, df: pd.DataFrame) -> GroupProfile:
    """Return a GroupProfile for one of the known merged groups."""
    g = group_id.lower()

    common = dict(
        group_id=g,
        date="date" if "date" in df.columns else None,
        hour="hour" if "hour" in df.columns else None,
        weekend_flag="is_weekend" if "is_weekend" in df.columns else None,
        holiday_flag="is_public_holiday" if "is_public_holiday" in df.columns else None,
        month="month" if "month" in df.columns else None,
        day_of_week="day_of_week" if "day_of_week" in df.columns else None,
        regime_label="covid_regime" if "covid_regime" in df.columns else None,
        era_label="schema_era" if "schema_era" in df.columns else None,
        zero_day_flag="is_zero_day" if "is_zero_day" in df.columns else None,
        weather_temp="temp_mean_C" if "temp_mean_C" in df.columns else (
            "temp_C" if "temp_C" in df.columns else None
        ),
        weather_precip="precipitation_mm" if "precipitation_mm" in df.columns else None,
    )

    if g == "g1":
        return GroupProfile(
            **common, grain="daily",
            target="total_daily_arrivals" if "total_daily_arrivals" in df.columns else None,
            categories={},
        )
    if g == "g2":
        return GroupProfile(
            **common, grain="hourly",
            target="arrival_count" if "arrival_count" in df.columns else None,
            categories={},
        )
    if g == "g3":
        return GroupProfile(
            **common, grain="daily",
            target="clinical_total" if "clinical_total" in df.columns else None,
            categories={"specialty": _present(df, _SPECIALTY_HINTS)},
        )
    if g == "g4":
        return GroupProfile(
            **common, grain="hourly",
            target="arrival_count" if "arrival_count" in df.columns else None,
            categories={"specialty": _present(df, _SPECIALTY_HINTS)},
        )

    # Fallback: introspect.
    return introspect_profile(group_id, df)


def introspect_profile(group_id: str, df: pd.DataFrame) -> GroupProfile:
    """Best-effort profile when the group is not pre-declared."""
    grain = "hourly" if "hour" in df.columns else "daily"
    target = None
    for c in ("total_daily_arrivals", "arrival_count", "clinical_total"):
        if c in df.columns:
            target = c; break
    specialties = [c for c in df.columns if c.startswith("spec_")]
    return GroupProfile(
        group_id=group_id, grain=grain, target=target,
        date="date" if "date" in df.columns else None,
        hour="hour" if "hour" in df.columns else None,
        weekend_flag="is_weekend" if "is_weekend" in df.columns else None,
        holiday_flag="is_public_holiday" if "is_public_holiday" in df.columns else None,
        month="month" if "month" in df.columns else None,
        day_of_week="day_of_week" if "day_of_week" in df.columns else None,
        regime_label="covid_regime" if "covid_regime" in df.columns else None,
        categories={"specialty": specialties} if specialties else {},
    )
