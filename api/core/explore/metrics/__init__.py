"""Metric analyzers — one KPI card per module.

Two surfaces:

- DEFAULT_FORECAST  → Headlines KPI strip. Signals a forecaster cares about:
                      training window, recent trend, weekly pattern strength,
                      daily volatility, weather lift, calendar drivers,
                      stationarity, dominant cycle.

- DEFAULT_DATA_HEALTH → Data Health deep-dive tab. Descriptive book-keeping
                        numbers (total arrivals, post-COVID shift, zero days,
                        etc.) that don't drive forecast decisions but help
                        validate the source data.

Each MetricAnalyzer carries a `section` attribute; the orchestrator filters
by section so the right strip lights up on the right page.
"""
from __future__ import annotations

# --- Forecasting-relevant metrics (Headlines strip) -------------------------
from .training_window      import TrainingWindowMetric
from .recent_trend         import RecentTrendMetric
from .weekly_pattern       import WeeklyPatternMetric
from .daily_volatility     import DailyVolatilityMetric
from .daily_swing          import DailySwingMetric
from .weather_lift         import WeatherLiftMetric
from .calendar_drivers     import CalendarDriversMetric
from .stationarity         import StationarityMetric
from .dominant_cycle       import DominantCycleMetric
from .completeness         import CompletenessMetric
from .year_over_year_shift import YearOverYearShiftMetric

# --- Data-health metrics (deep-dive tab) ------------------------------------
from .total_arrivals    import TotalArrivalsMetric
from .mean_per_day      import MeanPerDayMetric
from .post_covid_shift  import PostCovidShiftMetric
from .post_covid_days   import PostCovidDaysMetric
from .category_count    import CategoryCountMetric
from .zero_day_count    import ZeroDayCountMetric
from .date_span         import DateSpanMetric


DEFAULT_FORECAST = [
    # Ordered to match the design's KPI strip (left to right).
    TrainingWindowMetric(),       # DATA SPAN
    RecentTrendMetric(),          # RECENT DEMAND
    DailySwingMetric(),           # DAILY SWING  (new)
    CompletenessMetric(),         # COMPLETENESS (new)
    YearOverYearShiftMetric(),    # LATEST YEAR SHIFT (new)
    WeeklyPatternMetric(),        # WEEKLY RHYTHM
    DailyVolatilityMetric(),      # DAY-TO-DAY SWING (% CV)
    WeatherLiftMetric(),          # WARM-DAY LIFT
    CalendarDriversMetric(),      # CALENDAR EFFECTS
    StationarityMetric(),         # DEMAND STABILITY
    DominantCycleMetric(),        # DOMINANT CYCLE
]

DEFAULT_DATA_HEALTH = [
    TotalArrivalsMetric(),
    MeanPerDayMetric(),
    PostCovidShiftMetric(),
    PostCovidDaysMetric(),
    CategoryCountMetric(),
    ZeroDayCountMetric(),
    DateSpanMetric(),
]

# Combined default for code that wants every registered metric.
DEFAULT_METRICS = DEFAULT_FORECAST + DEFAULT_DATA_HEALTH
