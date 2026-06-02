"""Metric analyzers — one KPI card per module.

Each MetricAnalyzer subclass declares which roles it needs (via the same
GroupProfile contract used by Findings). The pipeline runs every applicable
metric against the currently loaded context. Adding a new dataset later
means writing a profile — every existing metric auto-fires against it.
"""
from __future__ import annotations

from .total_arrivals    import TotalArrivalsMetric
from .mean_per_day      import MeanPerDayMetric
from .post_covid_shift  import PostCovidShiftMetric
from .post_covid_days   import PostCovidDaysMetric
from .category_count    import CategoryCountMetric
from .zero_day_count    import ZeroDayCountMetric
from .date_span         import DateSpanMetric


DEFAULT_METRICS = [
    TotalArrivalsMetric(),
    MeanPerDayMetric(),
    PostCovidShiftMetric(),
    PostCovidDaysMetric(),
    CategoryCountMetric(),
    ZeroDayCountMetric(),
    DateSpanMetric(),
]
