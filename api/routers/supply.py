from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel

from core.optimization import optimize_supply

router = APIRouter(prefix="/api/supply", tags=["supply"])


class SupplyItemIn(BaseModel):
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
    items: List[SupplyItemIn]
    forecast_total_7d: float = 1400.0
    service_level: float = 0.95


@router.post("/optimize")
async def supply_optimize(req: SupplyOptRequest) -> Dict[str, Any]:
    if not req.items:
        raise HTTPException(400, "Provide at least one inventory item.")
    if not (0.8 <= req.service_level <= 0.999):
        raise HTTPException(400, "service_level must be between 0.80 and 0.999.")

    try:
        result = optimize_supply(
            items=[i.model_dump() for i in req.items],
            forecast_total_7d=req.forecast_total_7d,
            service_level=req.service_level,
        )
    except Exception as e:
        raise HTTPException(500, f"Supply optimization failed: {e}")

    return result


@router.get("/demo")
async def supply_demo() -> Dict[str, Any]:
    """Demo optimization with sample hospital inventory."""
    items = [
        {"sku": "N95-3M-1860",  "name": "N95 Respirator (3M 1860)", "category": "PPE",
         "on_hand": 78,   "unit_cost": 1.85, "ordering_cost": 45,  "holding_rate": 0.25,
         "lead_time_days": 5, "daily_demand_avg": 24.0, "daily_demand_std": 4.5},
        {"sku": "GLOVE-NIT-M",  "name": "Nitrile gloves (M)",        "category": "PPE",
         "on_hand": 4200, "unit_cost": 0.12, "ordering_cost": 30,  "holding_rate": 0.20,
         "lead_time_days": 3, "daily_demand_avg": 140.0,"daily_demand_std": 18.0},
        {"sku": "IV-SAL-1L",    "name": "IV Saline 1L",              "category": "Fluids",
         "on_hand": 142,  "unit_cost": 2.40, "ordering_cost": 60,  "holding_rate": 0.22,
         "lead_time_days": 4, "daily_demand_avg": 50.0, "daily_demand_std": 9.0},
        {"sku": "SYRG-10ML",    "name": "Syringe 10mL",              "category": "Disposable",
         "on_hand": 1840, "unit_cost": 0.35, "ordering_cost": 35,  "holding_rate": 0.20,
         "lead_time_days": 3, "daily_demand_avg": 80.0, "daily_demand_std": 12.0},
        {"sku": "OXY-MASK-A",   "name": "Oxygen mask (adult)",       "category": "Resp",
         "on_hand": 64,   "unit_cost": 3.20, "ordering_cost": 40,  "holding_rate": 0.25,
         "lead_time_days": 5, "daily_demand_avg": 16.0, "daily_demand_std": 3.5},
        {"sku": "EPI-1MG",      "name": "Epinephrine 1mg",           "category": "Pharm",
         "on_hand": 218,  "unit_cost": 8.50, "ordering_cost": 80,  "holding_rate": 0.30,
         "lead_time_days": 7, "daily_demand_avg": 8.0,  "daily_demand_std": 2.0},
        {"sku": "BAND-EL-4",    "name": "Elastic bandage 4\"",       "category": "Wound",
         "on_hand": 412,  "unit_cost": 1.10, "ordering_cost": 25,  "holding_rate": 0.20,
         "lead_time_days": 2, "daily_demand_avg": 14.0, "daily_demand_std": 3.0},
    ]
    return optimize_supply(items, forecast_total_7d=1400.0, service_level=0.95)
