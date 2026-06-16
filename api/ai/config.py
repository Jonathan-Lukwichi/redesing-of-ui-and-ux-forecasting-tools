"""AI assistant configuration — model routing, budget, pricing.

Cost-tiered routing: cheap Haiku for plain-English paraphrase (explanations,
briefings), Sonnet only for reasoning/tool-use surfaces (chat, co-pilot). All
overridable from api/.env.
"""
from __future__ import annotations
import os
from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _env(name: str, default: str = "") -> str:
    if _ENV_PATH.exists():
        load_dotenv(_ENV_PATH, override=True)
    return (os.getenv(name) or default).strip()


# Model tiers (override via .env). Keep IDs current — see the claude-api skill.
def model_reasoning() -> str:
    return _env("AI_MODEL", "claude-sonnet-4-6")


def model_fast() -> str:
    return _env("AI_MODEL_FAST", "claude-haiku-4-5")


# Which surfaces need real reasoning / tool use vs. cheap paraphrase.
_REASONING_SURFACES = {"chat", "copilot"}


def pick_model(surface: str) -> str:
    """Cheapest model that's good enough for this surface."""
    return model_reasoning() if surface in _REASONING_SURFACES else model_fast()


# Approx prices (USD per 1M tokens) for cost telemetry. Update if pricing moves.
PRICES = {
    "claude-haiku-4-5":  {"in": 1.0,  "out": 5.0},
    "claude-sonnet-4-6": {"in": 3.0,  "out": 15.0},
    "claude-opus-4-8":   {"in": 5.0,  "out": 25.0},
}


def cost_usd(model: str, in_tokens: int, out_tokens: int) -> float:
    p = PRICES.get(model, {"in": 3.0, "out": 15.0})
    return round(in_tokens / 1e6 * p["in"] + out_tokens / 1e6 * p["out"], 6)


def api_key() -> str:
    return _env("ANTHROPIC_API_KEY")


def configured() -> bool:
    return bool(api_key())


def daily_budget_usd() -> float:
    try:
        return float(_env("AI_DAILY_BUDGET_USD", "5") or 5)
    except ValueError:
        return 5.0
