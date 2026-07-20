"""Section builders — one chart card per function.

Same dataset-agnostic contract as MetricAnalyzer/Analyzer: each function
takes the AnalysisContext (already sliced by time range / specialty) and
the matching GroupProfile, then returns a JSON-ready payload for the
frontend. Adding a new section means writing one function and exposing
it on api/routers/explore.py.
"""
from .patient_arrivals_band     import build_patient_arrivals_band
from .yearly_trend              import build_yearly_trend
from .day_of_week_pattern       import build_day_of_week_pattern
from .weekday_vs_weekend_hourly import build_weekday_vs_weekend_hourly
from .calendar_effects_ranked   import build_calendar_effects_ranked
from .temperature_by_category   import build_temperature_by_category
from .calendar_x_category       import build_calendar_x_category
from .hour_dow_banded           import build_hour_dow_banded
from .critical_events_by_horizon import build_critical_events_by_horizon
from .category_volume_by_horizon import build_category_volume_by_horizon
