from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from core.optimization import optimize_staff

router = APIRouter(prefix="/api/staff", tags=["staff"])


class StaffOptRequest(BaseModel):
    forecast: List[float]
    dates: List[str]
    doctor_hourly: float = 85.0
    nurse_hourly: float = 45.0
    support_hourly: float = 25.0
    overtime_multiplier: float = 1.5
    max_overtime_hrs: float = 4.0
    nurse_doctor_ratio: float = 3.0
    shift_hours: float = 12.0
    budget_weekly: Optional[float] = None


@router.post("/optimize")
async def staff_optimize(req: StaffOptRequest) -> Dict[str, Any]:
    if len(req.forecast) < 1:
        raise HTTPException(400, "Provide at least 1 day of forecast.")
    if len(req.forecast) != len(req.dates):
        raise HTTPException(400, "forecast and dates must have the same length.")

    try:
        result = optimize_staff(
            forecast=req.forecast,
            dates=req.dates,
            doctor_hourly=req.doctor_hourly,
            nurse_hourly=req.nurse_hourly,
            support_hourly=req.support_hourly,
            overtime_multiplier=req.overtime_multiplier,
            max_overtime_hrs=req.max_overtime_hrs,
            nurse_doctor_ratio=req.nurse_doctor_ratio,
            shift_hours=req.shift_hours,
            budget_weekly=req.budget_weekly,
        )
    except Exception as e:
        raise HTTPException(500, f"Staff optimization failed: {e}")

    return result


@router.get("/demo")
async def staff_demo() -> Dict[str, Any]:
    """Demo schedule using the 7-day forecast values."""
    forecast = [188.0, 195.0, 218.0, 232.0, 215.0, 188.0, 174.0]
    dates = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07",
             "2026-05-08", "2026-05-09", "2026-05-10"]
    return optimize_staff(forecast, dates)
