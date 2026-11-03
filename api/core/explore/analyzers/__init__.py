"""Analyzers — one finding type per module. All registered through DEFAULT."""
from __future__ import annotations

from .regime_shift            import RegimeShiftAnalyzer
from .weekend_effect          import WeekendEffectAnalyzer
from .monthly_index           import MonthlyIndexAnalyzer
from .shift_split             import ShiftSplitAnalyzer
from .category_independence   import CategoryIndependenceAnalyzer
from .subtotal_reconciliation import SubtotalReconciliationAnalyzer
from .growth_trend            import GrowthTrendAnalyzer
from .busy_day_threshold      import BusyDayThresholdAnalyzer
from .ops_links               import ArrivalsVsConsumption, ArrivalsVsNurses, StockoutsOnBusyDays
from .seasonality_test        import KruskalWallisAnalyzer


DEFAULT = [
    BusyDayThresholdAnalyzer(),   # F8 — leads with the operational baseline
    RegimeShiftAnalyzer(),
    WeekendEffectAnalyzer(),
    MonthlyIndexAnalyzer(),
    ShiftSplitAnalyzer(),
    CategoryIndependenceAnalyzer(),
    SubtotalReconciliationAnalyzer(),
    GrowthTrendAnalyzer(),
    ArrivalsVsConsumption(),      # F9  — arrivals vs stock use
    ArrivalsVsNurses(),           # F10 — arrivals vs nurses required
    StockoutsOnBusyDays(),        # F11 — stockouts on busy days
    KruskalWallisAnalyzer(),      # F12 — weekday / month differences
]
