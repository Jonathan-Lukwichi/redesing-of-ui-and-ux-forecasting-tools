"""The step planner: which stages run when someone asks for a step.

A plan is worked out before anything runs, so it can be shown, estimated and
confirmed first. Asking for a step adds:

- its prerequisites, when they hold no result yet ("needed");
- data preparation, only when it is asked for or the data changed since the
  last preparation (needs_preparation). Preparation wipes every result, so
  every step that holds one is re-made ("rerun");
- the steps downstream of a step whose result changes on a re-run
  (RERUN_TRIGGERS), when they hold a result now ("rerun"). The analyses are
  deterministic on unchanged data, so re-running one re-makes nothing after it.

"full" and "sample" are the whole pipeline (the sample loads its data first).
The page opened after a run is the page of the last step asked for.

start() runs a plan through job.start, the same stages and /last results as
the Data Hub's Run, and only while the plan still matches the server: the same
inputs, the same ready steps and the same data version.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence

from core import data_version, prepare_registry, security
from core.pipeline import job, preflight, sample, stages, timings

STEPS: tuple[str, ...] = ("prepare", "arrivals", "staff", "supply", "forecast", "optimise",
                          "recommend")
RUNS: tuple[str, ...] = ("full", "sample")

STEP_STAGES: dict[str, tuple[str, ...]] = {
    "prepare": ("check", "transform", "operations", "consolidate"),
    "arrivals": ("analyse_arrivals",),
    "staff": ("analyse_staff",),
    "supply": ("analyse_supply",),
    "forecast": ("forecast",),
    "optimise": ("optimise",),
    "recommend": ("recommend",),
}

NEEDS: dict[str, tuple[str, ...]] = {
    "arrivals": ("prepare",),
    "staff": ("prepare",),
    "supply": ("prepare",),
    "forecast": ("prepare",),
    "optimise": ("forecast",),
    "recommend": ("optimise", "staff", "supply"),
}

# The steps whose result changes on a re-run, so what depends on them is re-made.
RERUN_TRIGGERS: tuple[str, ...] = ("prepare", "forecast", "optimise")

LABEL: dict[str, str] = {
    "prepare": "Data preparation",
    "arrivals": "Analysis: patient arrivals",
    "staff": "Analysis: staff",
    "supply": "Analysis: supply",
    "forecast": "Prediction",
    "optimise": "Optimization",
    "recommend": "Recommendations",
    "full": "Full pipeline",
    "sample": "Sample data, then the full pipeline",
}

PAGE: dict[str, str] = {
    "prepare": "upload",
    "arrivals": "explore",
    "staff": "staff",
    "supply": "supply",
    "forecast": "forecast-total",
    "optimise": "optimize",
    "recommend": "actions",
    "full": "dashboard",
    "sample": "dashboard",
}

STALE = ("Something changed since this was proposed (new data, or another run). "
         "Ask again and the assistant will re-check.")
SAMPLE_HINT = " The sample data can replace it only from the Data Hub's 'Use the sample data' button."


@dataclass(frozen=True)
class PlannedStep:
    id: str
    label: str
    reason: str      # "asked" | "needed" | "rerun"
    seconds: int


@dataclass(frozen=True)
class Plan:
    kind: str                                   # "steps" | "full" | "sample"
    steps: tuple[PlannedStep, ...]
    stage_ids: tuple[str, ...]                  # the stages job.start runs, in order
    stage_seconds: tuple[tuple[str, int], ...]  # the estimate per stage ("load" first for the sample)
    total_seconds: int
    page: str
    fingerprint: str                            # preflight.inputs_fingerprint() at planning
    ready_at_plan: frozenset[str]
    data_version: int

    def public(self) -> dict:
        return {
            "kind": self.kind,
            "page": self.page,
            "total_seconds": self.total_seconds,
            "steps": [{"id": s.id, "label": s.label, "reason": s.reason, "seconds": s.seconds}
                      for s in self.steps],
            "stages": [{"id": sid, "seconds": sec} for sid, sec in self.stage_seconds],
        }


class Refused(Exception):
    """The plan cannot run now. ``message`` is plain English for the user."""

    def __init__(self, code: str, message: str, missing: list[dict] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.missing = list(missing or [])


def needs_preparation() -> bool:
    """Whether data preparation must run before any other step: nothing was
    prepared since the results were wiped, the inputs changed since, or the
    built groups are gone."""
    prepared = job.prepared_fingerprint()
    return (prepared is None or prepared != preflight.inputs_fingerprint()
            or prepare_registry.get_df("g1") is None)


def _validate(requested: Sequence[str]) -> list[str]:
    if isinstance(requested, str):
        raise ValueError("requested must be a list of step names, not one string")
    asked = list(dict.fromkeys(requested))
    if not asked:
        raise ValueError("no step requested")
    unknown = [s for s in asked if s not in STEPS and s not in RUNS]
    if unknown:
        raise ValueError(f"unknown step(s): {', '.join(map(str, unknown))}")
    if any(s in RUNS for s in asked) and len(asked) > 1:
        raise ValueError("'full' and 'sample' cannot be combined with other steps")
    return asked


def _check_files() -> None:
    r = preflight.run_checks()
    if r["ok"]:
        return
    errors = [{"file": i["file"], "message": i["message"]}
              for i in r["issues"] if i["level"] == "error"]
    raise Refused("files_missing",
                  "Some files are missing or inconsistent, so the data cannot be prepared: "
                  + "; ".join(f"{i['file']}: {i['message']}" for i in errors)
                  + ". Upload them on the Data Hub.", missing=errors)


def _check_sample() -> None:
    """Whether a data writer may load the sample now, never replacing uploaded
    data (replacing uploaded data is not reachable from here). One wording for
    plan and start."""
    r = sample.refusal(True, False)
    if r is not None:
        raise Refused(r[1]["error"], r[1]["message"] + SAMPLE_HINT)


def _choose(asked: list[str], ready: frozenset[str]) -> dict[str, str]:
    """Step id -> reason, following the planner rules in the module docstring."""
    prep = "prepare" in asked or needs_preparation()
    chosen = {s: "asked" for s in asked}
    if prep:   # preparation wipes every result, so each one held now is re-made
        for s in STEPS:
            if s in ready and s not in chosen:
                chosen[s] = "rerun"
    changed = True
    while changed:
        changed = False
        for s in list(chosen):
            for n in NEEDS.get(s, ()):
                if n in chosen:
                    continue
                if (n == "prepare" and prep) or (n != "prepare" and (prep or n not in ready)):
                    chosen[n] = "needed"
                    changed = True
        for s in list(chosen):
            if s not in RERUN_TRIGGERS:
                continue
            for d in STEPS:
                if d not in chosen and d in ready and s in NEEDS.get(d, ()):
                    chosen[d] = "rerun"
                    changed = True
    return chosen


def plan(requested: Sequence[str]) -> Plan:
    """Work out what runs for these steps. Raises ValueError for an unknown
    step, an empty list or a run mixed with steps, and Refused when it cannot
    run now (a run is going, files are missing, the sample is not allowed)."""
    asked = _validate(requested)
    if job.is_running():
        raise Refused("already_running", security.PIPELINE_BUSY["message"])
    fingerprint = preflight.inputs_fingerprint()
    ready = job.ready_steps()
    version = data_version.current()

    if asked[0] in RUNS:
        kind = asked[0]
        if kind == "sample":
            _check_sample()
        else:
            _check_files()
        stage_ids = tuple(sid for sid, _label, _fn in stages.STAGES)
        stage_seconds = tuple((sid, timings.estimate(sid)) for sid in stage_ids)
        if kind == "sample":
            stage_seconds = (("load", timings.estimate("load")),) + stage_seconds
        total = sum(sec for _sid, sec in stage_seconds)
        return Plan(kind, (PlannedStep(kind, LABEL[kind], "asked", total),), stage_ids,
                    stage_seconds, total, PAGE[kind], fingerprint, ready, version)

    chosen = _choose(asked, ready)
    order = [s for s in STEPS if s in chosen]
    stage_ids = tuple(sid for s in order for sid in STEP_STAGES[s])
    stage_seconds = tuple((sid, timings.estimate(sid)) for sid in stage_ids)
    planned = tuple(PlannedStep(s, LABEL[s], chosen[s],
                                sum(timings.estimate(sid) for sid in STEP_STAGES[s]))
                    for s in order)
    total = sum(p.seconds for p in planned)
    page = PAGE[[s for s in order if chosen[s] == "asked"][-1]]
    if "check" in stage_ids:
        _check_files()
    return Plan("steps", planned, stage_ids, stage_seconds, total, page, fingerprint,
                ready, version)


def still_valid(p: Plan) -> bool:
    """Whether the server still matches what the plan was worked out from."""
    return (p.fingerprint == preflight.inputs_fingerprint()
            and p.ready_at_plan == job.ready_steps()
            and p.data_version == data_version.current())


def _source() -> str:
    return "upload" if sample.holds_uploaded_data() else "sample"


def start(p: Plan, on_finish: Callable[[dict], None] | None = None) -> dict:
    """Start the plan through the job and return its status. Raises Refused
    when the plan is stale or the sample is no longer allowed; job.Busy
    propagates when a run is going."""
    if not still_valid(p):
        raise Refused("proposal_stale", STALE)
    if p.kind == "sample":
        _check_sample()
        return job.start(source="sample", prepare=sample.load, on_finish=on_finish)
    if p.kind == "full":
        return job.start(source=_source(), on_finish=on_finish)
    return job.start(source=_source(), plan=list(p.stage_ids), on_finish=on_finish)
