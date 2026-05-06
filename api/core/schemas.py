from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ForecastRequest(BaseModel):
    horizon: int = 7
    model: str = "auto"  # auto | arima | sarimax | ml
    use_weather: bool = False
    use_calendar: bool = True

class ForecastDay(BaseModel):
    date: str
    predicted: float
    lower: float
    upper: float
    label: str  # low | med | high | peak
    categories: Dict[str, float]

class ForecastResponse(BaseModel):
    success: bool
    model_used: str
    mape: float
    mae: float
    horizon: int
    forecast: List[ForecastDay]
    history: List[Dict[str, Any]]
    message: str = ""

class StaffOptRequest(BaseModel):
    forecast: List[float]           # daily patient counts (7 days)
    dates: List[str]
    doctor_hourly: float = 85.0
    nurse_hourly: float = 45.0
    support_hourly: float = 25.0
    overtime_multiplier: float = 1.5
    max_overtime_hrs: float = 4.0
    nurse_doctor_ratio: float = 3.0
    budget_weekly: Optional[float] = None

class StaffDay(BaseModel):
    date: str
    patients: float
    doctors: int
    nurses: int
    support: int
    total_staff: int
    cost: float
    overtime_hrs: float

class StaffOptResponse(BaseModel):
    success: bool
    method: str
    total_cost: float
    weekly_savings: float
    avg_opt_doctors: float
    avg_opt_nurses: float
    avg_opt_support: float
    coverage_pct: float
    schedules: List[StaffDay]
    message: str = ""

class SupplyItem(BaseModel):
    sku: str
    name: str
    category: str
    on_hand: int
    unit_cost: float
    ordering_cost: float = 50.0
    holding_rate: float = 0.25
    lead_time_days: int = 5
    daily_demand_avg: float
    daily_demand_std: float

class SupplyOptRequest(BaseModel):
    items: List[SupplyItem]
    forecast_total_7d: float
    service_level: float = 0.95   # 0.90 – 0.999

class SupplyOptResponse(BaseModel):
    success: bool
    service_level: float
    z_score: float
    items: List[Dict[str, Any]]
    total_order_cost: float
    total_holding_cost: float
    weekly_savings: float
    message: str = ""

class KPIResponse(BaseModel):
    forecast_today: Optional[float]
    forecast_7d_total: Optional[float]
    forecast_peak_day: Optional[str]
    forecast_peak_value: Optional[float]
    model_mape: Optional[float]
    staff_coverage_pct: Optional[float]
    staff_weekly_cost: Optional[float]
    staff_overtime_hrs: Optional[float]
    supply_service_level: Optional[float]
    supply_items_at_rop: Optional[int]
    supply_stockout_risk: Optional[int]
    actions_critical: int = 0
    actions_high: int = 0
    estimated_savings: Optional[float]
