"""AI assistant router (Phase 1). Cheap, grounded, streaming, budget-capped.

  GET  /api/ai/health            â€” liveness + which models + remaining budget
  POST /api/ai/explain/forecast  â€” stream a plain-English forecast narrative
  GET  /api/ai/usage             â€” token/cost tile for the admin view
"""
from __future__ import annotations
import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from ai import config, client as ai_client, context, prompts, telemetry, chat as ai_chat, actions as ai_actions, redact, audit
from ai import proposals, run_tools

from core import action_store, security
from core.pipeline import job as pipeline_job

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Starlette's signature is JSONResponse(content, status_code=...) â€” always go
# through this helper so a guard can never crash with swapped arguments again.
def _err(status: int, error: str, message: str) -> JSONResponse:
    return JSONResponse(content={"error": error, "message": message}, status_code=status)


# Streaming responses must not be buffered by proxies (nginx) or cached.
_STREAM_HEADERS = {"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "configured":      config.configured(),
        "model_fast":      config.model_fast(),
        "model_reasoning": config.model_reasoning(),
        "budget":          telemetry.summary(),
    }


@router.get("/usage")
async def usage(_user=security.AdminAccess) -> dict[str, Any]:
    return telemetry.summary()


class ExplainForecastRequest(BaseModel):
    # The frontend hands back the forecast result it already has on screen, so we
    # explain exactly what the user is looking at (no recompute, fully grounded).
    forecast: dict[str, Any]


def _stream(surface: str, system: str, content: str):
    """Yield plain-text chunks (scrubbed of any hospital identifier); record usage."""
    used = {"model": config.pick_model(surface)}
    usage = {"in": 0, "out": 0}

    def _raw():
        try:
            for kind, payload in ai_client.stream_text(system, content, model=used["model"]):
                if kind == "delta":
                    yield payload
                elif kind == "model":
                    used["model"] = payload
                elif kind == "usage":
                    usage["in"], usage["out"] = payload["in"], payload["out"]
        except Exception as e:  # no provider / API hiccup â€” fail gracefully, don't 500 the stream
            yield ai_client.friendly(e)

    parts: list[str] = []
    try:
        for chunk in redact.scrub_stream(_raw()):
            parts.append(chunk)
            yield chunk
    finally:
        if usage["in"] or usage["out"]:
            telemetry.record(surface, used["model"], usage["in"], usage["out"])
        audit.log_event(surface, used["model"], content, "".join(parts), usage["in"], usage["out"])


@router.post("/explain/forecast")
async def explain_forecast(req: ExplainForecastRequest,
                           _rl=Depends(security.rate_limit("ai")),
                           _user=security.ReadAccess):
    return _explain("forecast", req.forecast)


# Generic explain â€” one panel component, any page.
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
        return _err(503, "ai_not_configured",
                    "Set ANTHROPIC_API_KEY or GEMINI_API_KEY in api/.env to enable the assistant.")
    if telemetry.over_budget():
        return _err(429, "budget_exhausted",
                    "The assistant's daily budget cap is reached. It will resume tomorrow.")
    builder = _EXPLAIN.get(surface)
    if builder is None:
        return _err(400, "unknown_surface", f"No explainer for '{surface}'.")
    system_fn, ctx_fn = builder
    return StreamingResponse(_stream(f"explain_{surface}", system_fn(), ctx_fn(data)),
                             media_type="text/plain; charset=utf-8", headers=_STREAM_HEADERS)


@router.post("/explain")
async def explain(req: ExplainRequest,
                  _rl=Depends(security.rate_limit("ai")),
                  _user=security.ReadAccess):
    return _explain(req.surface, req.context)


class BriefingRequest(BaseModel):
    context: dict[str, Any]  # the dashboard forecast result (history + next-7)


@router.post("/briefing")
async def briefing(req: BriefingRequest,
                   _rl=Depends(security.rate_limit("ai")),
                   _user=security.ReadAccess):
    if not config.configured():
        return _err(503, "ai_not_configured",
                    "Set ANTHROPIC_API_KEY or GEMINI_API_KEY in api/.env to enable the assistant.")
    if telemetry.over_budget():
        return _err(429, "budget_exhausted", "Daily budget reached.")
    system = prompts.dashboard_briefing()
    content = context.build_forecast_context(req.context)
    return StreamingResponse(_stream("briefing", system, content),
                             media_type="text/plain; charset=utf-8", headers=_STREAM_HEADERS)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
async def chat(request: Request,
               req: ChatRequest,
               _rl=Depends(security.rate_limit("ai")),
               _user=security.ReadAccess):
    if not config.configured():
        return _err(503, "ai_not_configured",
                    "Set ANTHROPIC_API_KEY or GEMINI_API_KEY in api/.env to enable the assistant.")
    if telemetry.over_budget():
        return _err(429, "budget_exhausted", "Daily budget reached.")

    # The assistant answers on every page for every role, but its LIVE-DATA
    # tools are filtered to the caller's territory: a role gate you can walk
    # around by typing a question into the chat box is not a gate. Teaching
    # content stays universal.
    user = security.current_user(request)
    acting = security.acting_username(request)
    runner = run_tools.Caller(username=acting,
                              can_run=acting is not None
                              and security.caller_can(request, "data:write"))
    # Defence in depth: the chat sends back only visible text, but anything
    # from the trailer mark on is cut here too, so a token or a forged trailer
    # in the history never reaches the model or the audit row.
    msgs = [{"role": m.role, "content": m.content.split(run_tools.TRAILER_MARK, 1)[0]}
            for m in req.messages]
    last_user = next((m["content"] for m in reversed(msgs) if m["role"] == "user"), "")

    def gen():
        in_tok = out_tok = 0
        model = config.model_reasoning()
        parts: list[str] = []
        trailer: dict = {}
        try:
            for kind, payload in ai_chat.stream_chat(msgs, user=user, caller=runner):
                if kind == "delta":
                    # The trailer mark is the server's alone: stripped from the
                    # model's text, so the model can never forge a proposal.
                    payload = payload.replace(run_tools.TRAILER_MARK, "")
                    if payload:
                        parts.append(payload)
                        yield payload
                elif kind == "trailer":
                    trailer = payload
                elif kind == "model":
                    model = payload
                elif kind == "usage":
                    in_tok, out_tok = payload["in"], payload["out"]
            if trailer:
                # Last chunk: the proposal (with its token) and any page to open.
                yield run_tools.TRAILER_MARK + json.dumps(trailer)
        except Exception as e:
            yield ai_client.friendly(e)
        finally:
            if in_tok or out_tok:
                telemetry.record("chat", model, in_tok, out_tok)
            audit.log_event("chat", model, last_user, "".join(parts), in_tok, out_tok)

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8", headers=_STREAM_HEADERS)


class RunRequest(BaseModel):
    token: str = Field(min_length=8, max_length=64)
    via: Literal["button", "typed"] = "button"
    model_config = ConfigDict(extra="forbid")


async def _idle_or_audited(request: Request, user=security.DataWriteAccess) -> None:
    """PipelineIdle for /run, with the refusal audited. It refuses before the
    token is looked at, so a busy pipeline keeps the token for a later try.
    The body is read only to name the proposal (by hash) and the way it was
    confirmed; an invalid body is refused as busy too, as PipelineIdle did."""
    try:
        security.require_pipeline_idle()
    except security.PipelineBusy:
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 - not JSON: nothing to name
            body = None
        body = body if isinstance(body, dict) else {}
        token, via = body.get("token"), body.get("via", "button")
        proposals.audit_busy_refusal(
            user.username,
            token if isinstance(token, str) and 8 <= len(token) <= 64 else None,
            via if via in ("button", "typed") else None)
        raise


@router.post("/run")
async def run(req: RunRequest,
              user=security.DataWriteAccess,
              _idle=Depends(_idle_or_audited),
              _rl=Depends(security.rate_limit("heavy"))):
    """Start the run the assistant proposed, once the user confirmed it. Only
    the browser calls this, with the token from the chat trailer; the token
    must be this user's, unexpired, unused, and its plan still valid."""
    try:
        return proposals.start_confirmed(req.token, user.username, req.via)
    except proposals.ProposalError as e:
        return _err(e.status, e.code, e.message)


@router.get("/actions")
async def actions(request: Request, refresh: bool = False,
                  _rl=Depends(security.rate_limit("ai")),
                  _user=security.ReadAccess):
    # Before any pipeline run there is nothing to recommend from, so the AI is
    # never asked: an empty list and the flag, which the page reads as "no
    # results yet" (refresh included, so Re-generate cannot spend a call either).
    if not pipeline_job.step_ready("recommend"):
        return {"actions": [], "results_ready": False, "built_at": None,
                "summary": action_store.summary()}
    # A stored list with items needs no AI, so it is served before any AI
    # configuration check. refresh=1 (Re-generate) rebuilds it, and so does an
    # empty one: "nothing to do" is never served as if it were final.
    out = None if refresh else ai_actions.stored()
    if out is None or not out.get("actions"):
        if not config.configured():
            return _err(503, "ai_not_configured",
                        "Set ANTHROPIC_API_KEY or GEMINI_API_KEY in api/.env to enable the assistant.")
        if telemetry.over_budget():
            return _err(429, "budget_exhausted", "Daily budget reached.")
        try:
            # Runs in a threadpool so its self-calls don't deadlock the event loop.
            # Telemetry and audit happen inside, once, when the list is made.
            out = await run_in_threadpool(ai_actions.build_and_store)
        except Exception as e:
            return _err(503, "ai_error", ai_client.friendly(e).strip("\n[]"))

    # The list is served as stored and the generator gives items no
    # stable id, so each one is matched back to its stored decision by content.
    # Without this the page would keep re-raising something already dismissed.
    out["actions"] = action_store.apply_decisions(out.get("actions", []))

    # Territory filter. A stock manager gets supply and capacity items; a
    # staffing manager gets staff and capacity. Done server-side, so hiding a
    # row is not something the browser is trusted to do.
    caller = security.current_user(request)
    if caller is not None:
        allowed = caller.action_categories
        if allowed:
            hidden = [a for a in out["actions"] if a.get("category") not in allowed]
            out["actions"] = [a for a in out["actions"] if a.get("category") in allowed]
            out["hidden_by_role"] = len(hidden)
        out["can_decide"] = caller.can("actions:decide")
        out["categories"] = sorted(allowed)
    out["summary"] = action_store.summary()
    out["results_ready"] = True
    return out


@router.get("/audit")
async def audit_log(n: int = 50, _user=security.AdminAccess) -> dict[str, Any]:
    """Durable AI audit trail (most-recent-first) for the admin/governance view."""
    return {"events": audit.recent(n), "stats": audit.stats()}


@router.get("/audit/stats")
async def audit_stats(_user=security.AdminAccess) -> dict[str, Any]:
    return audit.stats()
