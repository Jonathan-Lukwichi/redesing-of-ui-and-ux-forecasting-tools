"""The assistant's run tools: check the data, PROPOSE a run, read a run's status.

None of them starts anything. propose_run works out a plan (core/pipeline/
steps.py) and stores it under a confirmation token (ai/proposals.py); the
token goes into the caller's trailer, which the chat router appends after the
model's text, so the model never sees it and cannot forge it. Only the user,
pressing Run or typing yes, sends it back to POST /api/ai/run, which starts the
plan. check_data and get_run_status only read.

Who may propose: a signed-in user holding data:write (everyone as "demo" in
open mode). Every chat-started step uses the pipeline's own settings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ai import proposals
from core.pipeline import job, preflight, steps

TRAILER_MARK = "\x1e"
NAMES = frozenset({"check_data", "propose_run", "get_run_status"})

SIGN_IN = ("Running steps needs a signed-in account. Tell the user plainly: sign in to run "
           "steps. They can still ask questions.")
NO_SCOPE = ("This account cannot run pipeline steps: that needs permission to upload data. "
            "Tell the user, and suggest asking an administrator.")
PROPOSED_NOTE = ("Nothing has started. Tell the user what will run, any step added or re-run "
                 "and why, and the estimate in words; then say they can press Run below or "
                 "reply yes.")
BAD_STEPS = ("Not a valid request ({}). Call propose_run with a list of step ids: prepare, "
             "arrivals, staff, supply, forecast, optimise, recommend, or just full or sample.")

_STEP_WORDS = (
    "The steps to run, by id. prepare: data preparation (check the uploaded files, read "
    "the monthly registers, build the tables). arrivals: the patient-arrivals analysis "
    "(Explore page). staff: the staffing analysis. supply: the supply analysis. "
    "forecast: the prediction of patient arrivals for the week ahead. optimise: the "
    "optimization (the lawful nurse roster and the supply reorder plan). recommend: the "
    "recommendations for the Action Center. full: the whole pipeline on the data held "
    "now. sample: load the stored sample data, then the whole pipeline. 'full' and "
    "'sample' go alone. Steps a request needs, or must re-make, are added by the server.")

SCHEMAS: list[dict] = [
    {
        "name": "check_data",
        "description": ("Check, without running anything, whether the uploaded files are "
                        "ready for the pipeline: which files are missing or inconsistent "
                        "(by file name), warnings, which steps already hold results, "
                        "whether a run is going, and whether this user may run steps. Call "
                        "it first whenever the user asks to run something."),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "propose_run",
        "description": ("PROPOSE pipeline steps for the user to confirm. It starts NOTHING: "
                        "it returns the plan (each step, why it is there: asked, needed "
                        "first, or re-run) and the server's time estimate, and offers the "
                        "user a Run button. The run starts only if the user presses Run or "
                        "replies yes. Refuses, with the reason, when the user may not run "
                        "steps, files are missing, or a run is going."),
        "input_schema": {
            "type": "object",
            "properties": {
                "steps": {
                    "type": "array",
                    "minItems": 1,
                    "items": {"type": "string", "enum": [*steps.STEPS, *steps.RUNS]},
                    "description": _STEP_WORDS,
                },
            },
            "required": ["steps"],
        },
    },
    {
        "name": "get_run_status",
        "description": ("Read the latest pipeline run: whether it is still going, when it "
                        "finished, which steps hold results, and each stage's status and "
                        "plain-English receipt. Use it when the user says a run finished or "
                        "stopped, before summarising with the data tools."),
        "input_schema": {"type": "object", "properties": {}},
    },
]


@dataclass
class Caller:
    """Who is asking, and what the router appends after the model's text."""
    username: str | None
    can_run: bool
    trailer: dict = field(default_factory=dict)


def _issues(report: dict, error: bool) -> list[dict]:
    return [{"file": i.get("file"), "message": i.get("message")}
            for i in report.get("issues", []) if (i.get("level") == "error") == error]


def _check_data(caller: Caller) -> dict[str, Any]:
    # Only reads: it never opens a page. The Data Hub opens when propose_run is
    # refused for missing files, so a sample run never flashes the upload page.
    report = preflight.run_checks()
    st = job.status()
    ok = bool(report.get("ok"))
    return {
        "ok": ok,
        "missing": _issues(report, True),
        "warnings": _issues(report, False),
        "ready_steps": st["ready_steps"],
        "running": st["running"],
        "needs_preparation": steps.needs_preparation(),
        "can_run": caller.can_run,
    }


def _propose(args: dict, caller: Caller) -> dict[str, Any]:
    if caller.username is None:
        return {"error": SIGN_IN, "sign_in_required": True}
    if not caller.can_run:
        return {"error": NO_SCOPE}
    requested = args.get("steps")
    if not isinstance(requested, list) or not all(isinstance(s, str) for s in requested):
        return {"error": BAD_STEPS.format("steps must be a list of step ids")}
    try:
        p = steps.plan(requested)
    except steps.Refused as e:
        if e.code == "files_missing":
            caller.trailer["navigate"] = "upload"
        return {"error": e.message, "refused": e.code}
    except ValueError as e:
        return {"error": BAD_STEPS.format(e)}
    caller.trailer["proposal"] = proposals.issue(caller.username, p)
    return {"proposed": True, **p.public(), "note": PROPOSED_NOTE}


def _run_status() -> dict[str, Any]:
    st = job.status()
    return {
        "running": st["running"],
        "finished_at": st["finished_at"],
        "ready_steps": st["ready_steps"],
        "stages": [{"label": s["label"], "status": s["status"], "receipt": s["receipt"],
                    "warnings": list(s.get("warnings") or [])} for s in st["stages"]],
    }


def execute(name: str, args: dict, caller: Caller) -> dict[str, Any]:
    """Run one run tool. Never starts a run (see the module docstring)."""
    try:
        if name == "check_data":
            return _check_data(caller)
        if name == "propose_run":
            return _propose(args or {}, caller)
        if name == "get_run_status":
            return _run_status()
    except Exception as e:  # noqa: BLE001 - the model gets a reason, never a crash
        return {"error": f"tool failed: {type(e).__name__}"}
    return {"error": f"unknown tool {name}"}
