"""Analyzers — one finding type per module. All registered through DEFAULT."""
from __future__ import annotations

from .regime_shift           import RegimeShiftAnalyzer
from .weekend_effect         import WeekendEffectAnalyzer
from .monthly_index          import MonthlyIndexAnalyzer
from .shift_split            import ShiftSplitAnalyzer
from .category_independence  import CategoryIndependenceAnalyzer
from .subtotal_reconciliation import SubtotalReconciliationAnalyzer
from .growth_trend           import GrowthTrendAnalyzer


DEFAULT = [
    RegimeShiftAnalyzer(),
    WeekendEffectAnalyzer(),
    MonthlyIndexAnalyzer(),
    ShiftSplitAnalyzer(),
    CategoryIndependenceAnalyzer(),
    SubtotalReconciliationAnalyzer(),
    GrowthTrendAnalyzer(),
]
