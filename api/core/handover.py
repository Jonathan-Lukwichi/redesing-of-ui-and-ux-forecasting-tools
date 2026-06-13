"""Read-only access to the modeling-repo handover package.

The msc-modelling repo is mounted as a git submodule at
``api/external/msc-modelling`` and the curated handover lives at
``artefacts/handover_to_webapp/``.

This module exposes pure-stdlib readers for the cards / metrics / catalogue
JSON files. It does NOT load any .pkl bundles — those require pmdarima /
xgboost / torch which conflict with the web-app's numpy/pandas versions,
so model inference will run in a separate venv (or subprocess) once the
feature_builder.py from the modeling team lands.
"""
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from typing import Any


# --- Resolve the handover root ----------------------------------------------

# api/core/handover.py -> api/ -> api/external/msc-modelling/artefacts/handover_to_webapp
HANDOVER_ROOT: Path = (
    Path(__file__).resolve().parent.parent
    / "external" / "msc-modelling" / "artefacts" / "handover_to_webapp"
)

TASK1_ROOT: Path = HANDOVER_ROOT / "task1_daily_arrivals"
TASK2_ROOT: Path = HANDOVER_ROOT / "task2_specialties"


class HandoverMissing(RuntimeError):
    """Raised when the submodule isn't initialised or an expected file is absent."""
    pass


def _require(p: Path) -> Path:
    if not p.exists():
        raise HandoverMissing(
            f"Handover artefact missing: {p}\n"
            "Run: git submodule update --init --recursive"
        )
    return p


def _read_json(p: Path) -> Any:
    return json.loads(_require(p).read_text(encoding="utf-8"))


# --- Task 1 -----------------------------------------------------------------

TASK1_ALIASES = ("Stat 1", "Stat 2", "ML 1", "ML 2", "Hybrid 1", "Hybrid 2")
TASK1_ALIAS_TO_FILE = {
    "Stat 1":   "stat1",
    "Stat 2":   "stat2",
    "ML 1":     "ml1",
    "ML 2":     "ml2",
    "Hybrid 1": "hybrid1",
    "Hybrid 2": "hybrid2",
}


@lru_cache(maxsize=1)
def task1_headline() -> list[dict[str, Any]]:
    """List of 6 ModelSummary objects with val_MAPE / val_RMSE / badge."""
    return _read_json(TASK1_ROOT / "metrics" / "headline.json")


@lru_cache(maxsize=1)
def task1_per_horizon() -> list[dict[str, Any]]:
    """Per-model per-horizon errors (daily MAPE + weekly/monthly/yearly pct_error_avg)."""
    return _read_json(TASK1_ROOT / "metrics" / "per_horizon.json")


@lru_cache(maxsize=None)
def task1_card(alias: str) -> dict[str, Any]:
    if alias not in TASK1_ALIAS_TO_FILE:
        raise ValueError(f"Unknown Task 1 alias: {alias!r}")
    return _read_json(TASK1_ROOT / "cards" / f"{TASK1_ALIAS_TO_FILE[alias]}.json")


def task1_card_public(alias: str) -> dict[str, Any]:
    """Card with internal_only.scientific_name redacted — for non-admin endpoints."""
    card = dict(task1_card(alias))
    card.pop("internal_only", None)
    return card


# --- Task 2 -----------------------------------------------------------------

TASK2_SPECIALTY_TO_DIR = {
    "Medicine":    "medicine",
    "Orthopaedics":"orthopaedics",
    "Surgery":     "surgery",
    "Gynaecology": "gynaecology",
    "Paediatrics": "paediatrics",
    "Maternity":   "maternity_weekly",
    "Psychiatry":  "psychiatry_weekly",
}


@lru_cache(maxsize=1)
def task2_catalogue() -> list[dict[str, Any]]:
    """Per-specialty list of available models + resolution."""
    return _read_json(TASK2_ROOT / "catalogue.json")


@lru_cache(maxsize=1)
def task2_headline_all() -> list[dict[str, Any]]:
    """Flat list of every (specialty, alias) pair with val_MAPE + badge."""
    return _read_json(TASK2_ROOT / "headline_all.json")


@lru_cache(maxsize=None)
def task2_card(specialty: str, alias: str) -> dict[str, Any]:
    if specialty not in TASK2_SPECIALTY_TO_DIR:
        raise ValueError(f"Unknown Task 2 specialty: {specialty!r}")
    if alias not in TASK1_ALIAS_TO_FILE:
        raise ValueError(f"Unknown alias: {alias!r}")
    p = TASK2_ROOT / TASK2_SPECIALTY_TO_DIR[specialty] / "cards" / f"{TASK1_ALIAS_TO_FILE[alias]}.json"
    return _read_json(p)


# --- Mapping (admin-only) ---------------------------------------------------

@lru_cache(maxsize=1)
def alias_scientific_mapping() -> dict[str, Any]:
    return _read_json(HANDOVER_ROOT / "_internal_only" / "alias_scientific_mapping.json")


# --- Sanity check at import time --------------------------------------------

def available() -> bool:
    """Returns True if the submodule appears initialised."""
    return HANDOVER_ROOT.exists() and (TASK1_ROOT / "metrics" / "headline.json").exists()
