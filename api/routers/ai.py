"""AI assistant router (Phase 1). Cheap, grounded, streaming, budget-capped.

  GET  /api/ai/health            — liveness + which models + remaining budget
  POST /api/ai/explain/forecast  — stream a plain-English forecast narrative
  GET  /api/ai/usage             — token/cost tile for the admin view
"""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from ai import config, client as ai_client, context, prompts, telemetry

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "configured":      config.configured(),
        "model_fast":      config.model_fast(),
        "model_reasoning": config.model_reasoning(),
        "budget":          telemetry.summary(),
    }


@router.get("/usage")
async def usage() -> dict[str, Any]:
    return telemetry.summary()


class ExplainForecastRequest(BaseModel):
    # The frontend hands back the forecast result it already has on screen, so we
    # explain exactly what the user is looking at (no recompute, fully grounded).
    forecast: dict[str, Any]


def _stream(surface: str, system: str, content: str):
    """Yield plain-text chunks; record usage when done."""
    model = config.pick_model(surface)
    in_tok = out_tok = 0
    try:
        for kind, payload in ai_client.stream_text(system, content, model=model):
            if kind == "delta":
                yield payload
            elif kind == "usage":
                in_tok, out_tok = payload["in"], payload["out"]
    except ai_client.AIError as e:
        yield f"\n[assistant unavailable: {e}]"
    except Exception as e:  # network/API hiccup — fail gracefully, don't 500 the stream
        yield f"\n[the assistant is temporarily unavailable: {type(e).__name__}]"
    finally:
        if in_tok or out_tok:
            telemetry.record(surface, model, in_tok, out_tok)


@router.post("/explain/forecast")
async def explain_forecast(req: ExplainForecastRequest):
    if not config.configured():
        return JSONResponse(503, {"error": "ai_not_configured",
                                  "message": "Set ANTHROPIC_API_KEY in api/.env to enable the assistant."})
    if telemetry.over_budget():
        return JSONResponse(429, {"error": "budget_exhausted",
                                  "message": "The assistant's daily budget cap is reached. It will resume tomorrow."})

    system = prompts.forecast_explainer()
    content = context.build_forecast_context(req.forecast)
    return StreamingResponse(_stream("explain_forecast", system, content),
                             media_type="text/plain; charset=utf-8")
