"""
Dataset schemas for the 7 source files of the hospital forecasting
project, plus 5 inventory and scheduling files (the simulated demo pack).
Used by /api/datasets/* routes to validate uploads against the
DATA_DICTIONARY column contracts.

Schemas are intentionally lean:
- `required_columns` MUST be present (the upload is rejected otherwise).
- `expected_columns` is the full known set; missing/extra columns are reported
  as schema drift but do not reject the upload.
- `key_columns` are the join keys used by the Prepare page (G1-G4 joins).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal


Category = Literal["hospital", "external", "inventory", "scheduling"]
Grain = Literal["daily", "hourly"]


@dataclass(frozen=True)
class DatasetSchema:
    id: str
    label: str
    description: str
    category: Category
    grain: Grain
    key_columns: tuple[str, ...]
    required_columns: tuple[str, ...]
    expected_columns: tuple[str, ...]
    expected_rows_hint: int | None = None
    source_filename_hint: str = ""


# --- Hospital data (private — PURE DATASET) -----------------------------------

DAILY_ARRIVAL = DatasetSchema(
    id="daily_arrival",
    label="Daily arrivals",
    description="Total daily patient arrivals split by normal vs after hours (Task 1 target).",
    category="hospital",
    grain="daily",
    key_columns=("date",),
    required_columns=("date", "total_daily_arrivals"),
    expected_columns=(
        "date",
        "arrivals_normal_hours",
        "arrivals_after_hours",
        "total_daily_arrivals",
    ),
    expected_rows_hint=2441,
    source_filename_hint="pure_daily_arrival.csv",
)

HOURLY_ARRIVAL = DatasetSchema(
    id="hourly_arrival",
    label="Hourly arrivals",
    description="Hourly arrival counts (Layer 2 disaggregation target).",
    category="hospital",
    grain="hourly",
    key_columns=("date", "hour"),
    required_columns=("date", "hour", "arrival_count"),
    expected_columns=("date", "hour", "arrival_count"),
    expected_rows_hint=58561,
    source_filename_hint="pure_hourly_arrival.csv",
)

CLINICAL_DAILY = DatasetSchema(
    id="clinical_daily",
    label="Clinical daily",
    description="Daily clinical breakdown by specialty, demographics, accident type, "
    "violence, substance use, infectious disease (Task 2 & 3 features).",
    category="hospital",
    grain="daily",
    key_columns=("date",),
    required_columns=(
        "date",
        "spec_medicine",
        "spec_orthopaedics",
        "spec_surgery",
        "spec_paediatrics",
    ),
    expected_columns=(
        "date",
        "spec_medicine", "spec_orthopaedics", "spec_surgery", "spec_gynae",
        "spec_maternity", "spec_paediatrics", "spec_psychiatry",
        "age_0_5", "age_5_12", "age_12_plus",
        "gender_male", "gender_female",
        "accident_mva", "accident_pva", "accident_train", "accident_mba",
        "bee_sting", "insect_bite", "snake_bite", "spider_bite",
        "scorpion_bite", "dog_bite",
        "substance_heroin", "substance_tablets", "substance_nyaope",
        "substance_flakka", "substance_unknown",
        "poisoning_accidental", "poisoning_malicious",
        "transport_car", "transport_ambulance", "transport_helicopter",
        "needle_prick", "blood_splash", "body_fluid_exposure",
        "gynae_emergency", "ectopic_pregnancy", "miscarriage", "vaginal_bleeding",
        "blocked_catheter", "peg_tube_out", "vp_shunt_blocked",
        "to_theatre", "from_theatre",
        "tb", "malaria", "jaundice_adult", "measles", "meningitis",
        "death_on_arrival",
        "gunshot_male", "gunshot_female", "gunshot_child",
        "sexual_assault_male", "sexual_assault_female", "sexual_assault_child",
        "domestic_violence_male", "domestic_violence_female", "domestic_violence_child",
        "human_bite_male", "human_bite_female", "human_bite_child",
        "common_assault_male", "common_assault_female", "common_assault_child",
        "stab_wound_male", "stab_wound_female", "stab_wound_child",
        "falls_male", "falls_female", "falls_child",
        "mob_justice_male", "mob_justice_female", "mob_justice_child",
        "hypertension_screen_45plus", "hypertension_screen_18_44",
        "hypertension_requiring_treatment",
        "diabetes_screen_18_44", "diabetes_screen_45plus",
        "suicide_attempt_18plus", "suicide_attempt_under18",
        "born_alive_before_arrival", "maternal_death_in_facility",
        "sexual_assault_case_seen", "sexual_assault_pep_issued",
    ),
    expected_rows_hint=2441,
    source_filename_hint="pure_clinical_arrival.csv",
)

CLINICAL_HOURLY = DatasetSchema(
    id="clinical_hourly",
    label="Clinical hourly",
    description="Hourly arrival counts joined with the daily clinical breakdown.",
    category="hospital",
    grain="hourly",
    key_columns=("date", "hour"),
    required_columns=("date", "hour", "arrival_count", "spec_medicine", "spec_surgery"),
    expected_columns=(
        "date", "hour", "arrival_count",
        "accident_mba", "accident_mva", "accident_pva", "accident_train",
        "age_0_5", "age_12_plus", "age_5_12",
        "bee_sting", "blocked_catheter", "blood_splash", "body_fluid_exposure",
        "born_alive_before_arrival",
        "common_assault_child", "common_assault_female", "common_assault_male",
        "death_on_arrival",
        "diabetes_screen_18_44", "diabetes_screen_45plus",
        "dog_bite",
        "domestic_violence_child", "domestic_violence_female", "domestic_violence_male",
        "ectopic_pregnancy",
        "falls_child", "falls_female", "falls_male",
        "from_theatre",
        "gender_female", "gender_male",
        "gunshot_child", "gunshot_female", "gunshot_male",
        "gynae_emergency",
        "human_bite_child", "human_bite_female", "human_bite_male",
        "hypertension_requiring_treatment", "hypertension_screen_18_44",
        "hypertension_screen_45plus",
        "insect_bite", "jaundice_adult", "malaria",
        "maternal_death_in_facility", "measles", "meningitis", "miscarriage",
        "mob_justice_child", "mob_justice_female", "mob_justice_male",
        "needle_prick", "peg_tube_out",
        "poisoning_accidental", "poisoning_malicious",
        "scorpion_bite",
        "sexual_assault_case_seen",
        "sexual_assault_child", "sexual_assault_female", "sexual_assault_male",
        "sexual_assault_pep_issued",
        "snake_bite",
        "spec_gynae", "spec_maternity", "spec_medicine", "spec_orthopaedics",
        "spec_paediatrics", "spec_psychiatry", "spec_surgery",
        "spider_bite",
        "stab_wound_child", "stab_wound_female", "stab_wound_male",
        "substance_flakka", "substance_heroin", "substance_nyaope",
        "substance_tablets", "substance_unknown",
        "suicide_attempt_18plus", "suicide_attempt_under18",
        "tb", "to_theatre",
        "transport_ambulance", "transport_car", "transport_helicopter",
        "vaginal_bleeding", "vp_shunt_blocked",
    ),
    expected_rows_hint=58561,
    source_filename_hint="pure_hourly_clinical_arrival.csv",
)


# --- External factors (public) ------------------------------------------------

CALENDAR = DatasetSchema(
    id="calendar",
    label="Calendar features",
    description="South African calendar + holiday features (32 engineered columns).",
    category="external",
    grain="daily",
    key_columns=("date",),
    required_columns=("date", "is_weekend", "is_public_holiday"),
    expected_columns=(
        "date", "year", "month", "day", "day_of_week", "week_of_year",
        "quarter", "day_of_year",
        "is_weekend", "is_month_start", "is_month_end",
        "is_year_start", "is_year_end",
        "is_public_holiday",
        "days_to_next_holiday", "days_since_last_holiday",
        "is_day_before_holiday", "is_2_days_before_holiday", "is_3_days_before_holiday",
        "is_day_after_holiday", "is_2_days_after_holiday", "is_3_days_after_holiday",
        "is_near_holiday", "is_long_weekend",
        "is_school_holiday", "is_summer_holiday", "is_autumn_holiday",
        "is_winter_holiday", "is_spring_holiday",
        "is_month_end_period", "is_december", "is_festive_season",
    ),
    expected_rows_hint=2589,
    source_filename_hint="calendar_features_2019_2026.csv",
)

WEATHER_DAILY = DatasetSchema(
    id="weather_daily",
    label="Weather daily",
    description="Local daily weather (Open-Meteo ERA5).",
    category="external",
    grain="daily",
    key_columns=("date",),
    required_columns=("date", "temp_mean_C"),
    expected_columns=(
        "date",
        "temp_max_C", "temp_min_C", "temp_mean_C",
        "apparent_temp_max_C", "apparent_temp_min_C",
        "precipitation_mm", "wind_max_kmh", "humidity_mean_pct",
        "temp_range_C", "is_rainy_day",
    ),
    expected_rows_hint=2589,
    source_filename_hint="pretoria_weather_daily_2019_2026.csv",
)

WEATHER_HOURLY = DatasetSchema(
    id="weather_hourly",
    label="Weather hourly",
    description="Local hourly weather (Open-Meteo ERA5).",
    category="external",
    grain="hourly",
    key_columns=("date", "hour"),
    required_columns=("datetime", "temp_C"),
    expected_columns=(
        "datetime", "temp_C", "apparent_temp_C",
        "precipitation_mm", "humidity_pct", "wind_kmh",
        "date", "hour", "is_rainy_hour",
    ),
    expected_rows_hint=62113,
    source_filename_hint="pretoria_weather_hourly_2019_2026.csv",
)


# --- Inventory and scheduling (simulated demo pack, or a hospital's own) -----

def _ops(id, label, description, category, grain, key, cols, rows):
    return DatasetSchema(
        id=id, label=label, description=description, category=category,
        grain=grain, key_columns=key, required_columns=cols,
        expected_columns=cols, expected_rows_hint=rows,
        source_filename_hint=f"{id}.csv",
    )


INVENTORY_ITEMS = _ops(
    "inventory_items", "Inventory items",
    "Supply catalogue: price, lead time, ordering, holding and stockout costs.",
    "inventory", "daily", ("item_id",),
    ("item_id", "item_name", "category", "abc_class", "unit", "unit_price_zar",
     "on_current_tender", "lead_time_mean_days", "ordering_cost_zar",
     "holding_cost_rate_per_year", "stockout_penalty_zar", "shelf_life_months",
     "data_origin"), 30)

INVENTORY_MOVEMENTS = _ops(
    "inventory_movements", "Inventory movements",
    "Daily stock movements per item: consumption, stock, orders, stockouts, expiry.",
    "inventory", "daily", ("date", "item_id"),
    ("date", "item_id", "daily_consumption_units", "recorded_stock_on_hand_units",
     "stock_on_order_units", "order_placed_today", "stockout_today_units",
     "expiry_today_units"), 11880)

STAFF_LIST = _ops(
    "staff_list", "Staff list",
    "Nurse posts with category, skill, salary, hours worked and payroll summary.",
    "scheduling", "daily", ("staff_id",),
    ("staff_id", "category", "skill_level", "annual_salary_zar",
     "standard_shift_length_hours", "max_weekly_hours", "is_vacant",
     "total_days_worked", "total_regular_hours", "total_overtime_hours",
     "total_payroll_cost_zar", "average_weekly_hours",
     "bcea_45hour_violations_count", "max_weekly_hours_observed",
     "total_days_sick", "data_origin"), 30)

SHIFT_LOG = _ops(
    "shift_log", "Shift log",
    "One row per day and shift: arrivals, nurses required and assigned, locum use.",
    "scheduling", "daily", ("date", "shift"),
    ("date", "shift", "arrivals_for_shift", "required_nurses",
     "filled_staff_assigned", "locum_hours_used", "locum_cost_zar",
     "shift_total_cost_zar", "unfilled_positions_after_locum"), 1188)

STAFFING_DAILY = _ops(
    "staffing_daily", "Staffing daily",
    "Daily staffing totals: required vs staffed nurses, hours, payroll, unfilled shifts.",
    "scheduling", "daily", ("date",),
    ("date", "day_of_week", "is_weekend", "is_public_holiday", "total_arrivals",
     "total_required_nurses", "total_staffed_nurses", "total_regular_hours",
     "total_overtime_hours", "total_locum_hours", "total_payroll_cost_zar",
     "total_unfilled_shifts", "bcea_violations_today"), 396)


ALL_SCHEMAS: tuple[DatasetSchema, ...] = (
    DAILY_ARRIVAL, HOURLY_ARRIVAL, CLINICAL_DAILY, CLINICAL_HOURLY,
    CALENDAR, WEATHER_DAILY, WEATHER_HOURLY,
    INVENTORY_ITEMS, INVENTORY_MOVEMENTS, STAFF_LIST, SHIFT_LOG, STAFFING_DAILY,
)

# The seven original source files. The Data Hub counter and the pipeline gates
# count these only; inventory and scheduling slots are separate extras.
CORE_CATEGORIES = ("hospital", "external")

_BY_ID = {s.id: s for s in ALL_SCHEMAS}


def get_schema(dataset_id: str) -> DatasetSchema | None:
    return _BY_ID.get(dataset_id)


def schema_ids() -> list[str]:
    return [s.id for s in ALL_SCHEMAS]
