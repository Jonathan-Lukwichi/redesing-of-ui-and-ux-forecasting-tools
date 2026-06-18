"""AI assistant router (Phase 1). Cheap, grounded, streaming, budget-capped.

  GET  /api/ai/health            — liveness + which models + remaining budget
  POST /api/ai/explain/forecast  — stream a plain-English forecast narrative
  GET  /api/ai/usage             — token/cost tile for the admin view
"""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ai import config, client as ai_client, context, prompts, telemetry, chat as ai_chat, actions as ai_actions

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
    return _explain("forecast", req.forecast)


# Generic explain — one panel component, any page.
_EXPLAIN = {
    "forecast":     (prompts.forecast_explainer,     context.build_forecast_context),
    "staff":        (prompts.staff_explainer,        context.build_staff_context),
    "supply":       (prompts.supply_explainer,       context.build_supply_context),
    "explore":      (prompts.explore_explainer,      context.build_explore_context),
    "optimization": (prompts.optimization_explainer, context.build_optimization_context),
}


class ExplainRequest(BaseModel):
    surface: str
    context: dict[str, Any]


def _explain(surface: str, data: dict[str, Any]):
    if not config.configured():
        return JSONResponse(503, {"error": "ai_not_configured",
                                  "message": "Set ANTHROPIC_API_KEY in api/.env to enable the assistant."})
    if telemetry.over_budget():
        return JSONResponse(429, {"error": "budget_exhausted",
                                  "message": "The assistant's daily budget cap is reached. It will resume tomorrow."})
    builder = _EXPLAIN.get(surface)
    if builder is None:
        return JSONResponse(400, {"error": "unknown_surface", "message": f"No explainer for '{surface}'."})
    system_fn, ctx_fn = builder
    return StreamingResponse(_stream(f"explain_{surface}", system_fn(), ctx_fn(data)),
                             media_type="text/plain; charset=utf-8")


@router.post("/explain")
async def explain(req: ExplainRequest):
    return _explain(req.surface, req.context)


class BriefingRequest(BaseModel):
    context: dict[str, Any]  # the dashboard forecast result (history + next-7)


@router.post("/briefing")
async def briefing(req: BriefingRequest):
    if not config.configured():
        return JSONResponse(503, {"error": "ai_not_configured",
                                  "message": "Set ANTHROPIC_API_KEY in api/.env to enable the assistant."})
    if telemetry.over_budget():
        return JSONResponse(429, {"error": "budget_exhausted", "message": "Daily budget reached."})
    system = prompts.dashboard_briefing()
    content = context.build_forecast_context(req.context)
    return StreamingResponse(_stream("briefing", system, content),
                             media_type="text/plain; charset=utf-8")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
async def chat(req: ChatRequest):
    if not config.configured():
        return JSONResponse(503, {"error": "ai_not_configured",
                                  "message": "Set ANTHROPIC_API_KEY in api/.env to enable the assistant."})
    if telemetry.over_budget():
        return JSONResponse(429, {"error": "budget_exhausted", "message": "Daily budget reached."})

    msgs = [{"role": m.role, "content": m.content} for m in req.messages]

    def gen():
        in_tok = out_tok = 0
        try:
            for kind, payload in ai_chat.stream_chat(msgs):
                if kind == "delta":
                    yield payload
                elif kind == "usage":
                    in_tok, out_tok = payload["in"], payload["out"]
        except ai_client.AIError as e:
            yield f"\n[assistant unavailable: {e}]"
        except Exception as e:
            yield f"\n[the assistant is temporarily unavailable: {type(e).__name__}]"
        finally:
            if in_tok or out_tok:
                telemetry.record("chat", config.model_reasoning(), in_tok, out_tok)

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@router.get("/actions")
async def actions():
    if not config.configured():
        return JSONResponse(503, {"error": "ai_not_configured",
                                  "message": "Set ANTHROPIC_API_KEY in api/.env to enable the assistant."})
    if telemetry.over_budget():
        return JSONResponse(429, {"error": "budget_exhausted", "message": "Daily budget reached."})
    try:
        # Runs in a threadpool so its self-calls don't deadlock the event loop.
        out = await run_in_threadpool(ai_actions.generate)
    except ai_client.AIError as e:
        return JSONResponse(503, {"error": "ai_error", "message": str(e)})
    u = out.pop("usage", None)
    if u:
        telemetry.record("actions", config.model_fast(), u["in"], u["out"])
    return out
