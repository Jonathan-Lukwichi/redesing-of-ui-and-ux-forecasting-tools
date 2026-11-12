"""The pipeline run: one background thread working through a plan of stages.

One job at a time. The state lives in this module, so any client polling
status() sees the same run. A run's plan is the whole pipeline (stages.STAGES)
or a list of stage ids, each resolved with stages.stage_entry before the thread
starts. Error text from an unexpected exception is never shown: it may quote a
cell value.

Readiness is per step (core.pipeline.READY_STEPS). A step is ready once a stage
that produces it (stages.PRODUCES) has finished in this server process. A
restart starts with none, like the RAM-only data the results come from.

What a run forgets. A run that prepares data (the whole pipeline, a loader, or
a plan holding a preparation stage) wipes every result and re-makes every step.
Any other plan forgets only the steps it re-makes and the caches its stages own
(stages.CLEARS); every other step stays ready throughout. Forgetting happens
once Check has passed, as the first stage that changes anything starts (or
before a loader runs), so a later failure leaves those results cleared, never
half-replaced, while a run refused at Check changes nothing.

Who sees what while a run is going. The server (the readiness guard, the
assistant's tools) sees a step the run re-makes once the stage that makes it
has finished, because later stages read it (Recommend reads the plan). The
pages (status()) see the steps a run re-makes only once the whole run has
ended. Steps the run does not touch stay visible to both throughout.

A run has a source: "upload" (the Data Hub's Run) or "sample" (the sample
button, whose loader runs first in the same thread; see core/pipeline/sample.py).
The results take the source of the run that prepared their data: a partial run
adds to them under the source they already have.

Each stage that ends done or amber, and a loader that succeeds, records how
long it took (core/pipeline/timings.py), so later estimates follow this server.
"""
from __future__ import annotations

import ctypes
import gc
import logging
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Sequence
from datetime import datetime, timezone

from core import data_version, simulation_data
from core.pipeline import READY_STEPS, preflight, stages, timings

log = logging.getLogger("healthforecast.pipeline")


CHECK_ID = "check"
CONSOLIDATE_ID = "consolidate"
CLEAR_FAILED = "Previous results could not be cleared, so the run stopped."
LOAD_FAILED = "The sample data could not be loaded, so the run stopped."
SOURCES = ("upload", "sample")
_MODE = {"upload": "uploaded", "sample": "sample"}


class Busy(Exception):
    """A run is already in progress."""


@dataclass
class _State:
    running: bool = False
    started_at: str | None = None
    finished_at: str | None = None
    stages: list[dict] = field(default_factory=list)
    successful_runs: int = 0
    last_success_at: str | None = None
    thread: threading.Thread | None = None
    source: str | None = None           # the current or latest run's source
    loading: bool = False               # the sample loader is running
    ready: set[str] = field(default_factory=set)   # steps with results (server side)
    producing: frozenset[str] = frozenset()        # steps the current run re-makes
    cleared: bool = False               # the current run has forgotten them already
    results_source: str | None = None   # the source of the run that made them
    prepared_fingerprint: str | None = None   # the inputs the last preparation used


_LOCK = threading.Lock()
_STATE = _State()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _blank(stage_id: str, label: str) -> dict:
    return {"id": stage_id, "label": label, "status": "pending", "seconds": None,
            "receipt": None, "warnings": [], "peak_mb": None}


def peak_mb() -> float:
    """The process's peak resident memory so far, in MB. A high-water mark,
    so it can only rise during a run."""
    if sys.platform == "win32":
        from ctypes import wintypes

        class _Counters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                        ("PeakWorkingSetSize", ctypes.c_size_t),
                        ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t),
                        ("PeakPagefileUsage", ctypes.c_size_t)]

        kernel32, psapi = ctypes.WinDLL("kernel32"), ctypes.WinDLL("psapi")
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(_Counters),
                                               wintypes.DWORD]
        counters = _Counters()
        counters.cb = ctypes.sizeof(_Counters)
        if not psapi.GetProcessMemoryInfo(kernel32.GetCurrentProcess(),
                                          ctypes.byref(counters), counters.cb):
            return 0.0
        return counters.PeakWorkingSetSize / (1024 * 1024)
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Linux reports kilobytes, macOS bytes.
    return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024


def is_running() -> bool:
    with _LOCK:
        return _STATE.running


def _server_ready() -> set[str]:
    """The steps the server may serve now. Call with _LOCK held. Until the
    current run has forgotten the steps it re-makes, they already count as
    gone: they are about to be replaced, and they come back unchanged if the
    run is refused at Check."""
    if _STATE.running and not _STATE.cleared:
        return _STATE.ready - _STATE.producing
    return set(_STATE.ready)


def ready_steps() -> frozenset[str]:
    """The steps whose results the server may serve now (see the docstring)."""
    with _LOCK:
        return frozenset(_server_ready())


def step_ready(step: str) -> bool:
    """Whether the server may serve this step's results now."""
    with _LOCK:
        return step in _server_ready()


def prepared_fingerprint() -> str | None:
    """preflight.inputs_fingerprint() as the last data preparation (Consolidate)
    found it, or None when nothing has been prepared since results were wiped."""
    with _LOCK:
        return _STATE.prepared_fingerprint


def results_available() -> bool:
    """Whether any step's results exist for the server to serve."""
    with _LOCK:
        return bool(_server_ready())


def results_source() -> str | None:
    """"upload" or "sample": the source of the results held now, or None."""
    with _LOCK:
        return _STATE.results_source if _server_ready() else None


@dataclass(frozen=True)
class _Plan:
    entries: list                 # (id, label, function) per stage, in run order
    full: bool                    # the whole pipeline (plan=None)
    wipes: bool                   # forgets every result and re-makes every step
    producing: frozenset[str]     # the steps the run re-makes
    clears: tuple[str, ...]       # the clearers to run when it does not wipe


def _make_plan(plan: Sequence[str] | None, prepare: Callable[[], None] | None) -> _Plan:
    """Resolve the stage ids. An unknown id raises ValueError."""
    entries = (list(stages.STAGES) if plan is None
               else [stages.stage_entry(sid) for sid in plan])
    ids = [sid for sid, _, _ in entries]
    wipes = plan is None or prepare is not None or any(s in stages.PREP_STAGE_IDS for s in ids)
    producing = (frozenset(READY_STEPS) if wipes
                 else frozenset(s for sid in ids for s in stages.PRODUCES.get(sid, ())))
    # In plan order, once each, so the clearers run in a predictable order.
    clears = tuple(dict.fromkeys(n for sid in ids for n in stages.CLEARS.get(sid, ())))
    return _Plan(entries, plan is None, wipes, producing, clears)


def start(source: str = "upload", prepare: Callable[[], None] | None = None,
          plan: Sequence[str] | None = None,
          on_finish: Callable[[dict], None] | None = None) -> dict:
    """Start a run in the background. Raises Busy if one is in progress, and
    ValueError, changing nothing, for an unknown source or stage id.

    ``plan`` lists the stage ids to run, in order (see stages.stage_entry);
    None runs the whole pipeline. ``prepare`` runs first, in the run's thread,
    once the previous results are forgotten. It raises stages.StageFailed with a
    plain-English reason to stop the run at Check. ``on_finish`` is called once,
    in the run's thread, with the final status() after the run has ended."""
    if source not in SOURCES:
        raise ValueError(f"unknown run source {source!r}")
    run = _make_plan(plan, prepare)
    with _LOCK:
        if _STATE.running:
            raise Busy()
        _STATE.running = True
        _STATE.source = source
        _STATE.loading = prepare is not None
        _STATE.producing = run.producing
        _STATE.cleared = False
        _STATE.started_at = _now()
        _STATE.finished_at = None
        _STATE.stages = [_blank(sid, label) for sid, label, _ in run.entries]
        # Where the results came from changes only when the data is prepared
        # again: a partial run keeps the label of the results it adds to.
        relabel = run.wipes or not _STATE.ready
        _STATE.thread = threading.Thread(target=_run,
                                         args=(run, source, prepare, on_finish, relabel),
                                         daemon=True, name="pipeline-run")
        _STATE.thread.start()
    return status()


def wait(timeout: float | None = None) -> bool:
    """Block until the current run (if any) ends. True when nothing is running."""
    with _LOCK:
        thread = _STATE.thread
    if thread is not None:
        thread.join(timeout)
    return not is_running()


def _update(i: int, **fields) -> None:
    with _LOCK:
        _STATE.stages[i].update(fields)


def _forget(run: _Plan) -> None:
    """Forget what the run re-makes: the steps first, then the caches. Raises
    when a clearer fails; the steps stay forgotten."""
    with _LOCK:
        _STATE.ready -= run.producing
        _STATE.cleared = True
        if run.wipes:
            _STATE.prepared_fingerprint = None
    if run.wipes:
        data_version.invalidate_all()
    elif run.clears:
        data_version.invalidate(run.clears)


def _made(stage_id: str, source: str, relabel: bool) -> None:
    """A stage ended done or amber: the steps it produces are ready. With
    ``relabel`` (a run that wipes, or one onto no results) they take the run's
    source; otherwise the results keep the source they already had."""
    fingerprint = preflight.inputs_fingerprint() if stage_id == CONSOLIDATE_ID else None
    with _LOCK:
        _STATE.ready |= set(stages.PRODUCES.get(stage_id, ()))
        if relabel:
            _STATE.results_source = source
        if stage_id == CONSOLIDATE_ID:
            _STATE.prepared_fingerprint = fingerprint


def _prepare(prepare: Callable[[], None], run: _Plan) -> bool:
    """Forget the old results, then run the loader. On failure stage 0 fails
    with a plain reason, the rest are skipped, and False is returned."""
    t0 = time.perf_counter()
    try:
        # The loader replaces the data, so results made from the old data go first.
        try:
            _forget(run)
        except Exception as e:  # noqa: BLE001
            log.warning("pipeline: clearing results failed (%s)", type(e).__name__)
            receipt = CLEAR_FAILED
        else:
            try:
                scale = timings.scale_for("load")
                prepare()
                timings.record("load", time.perf_counter() - t0, scale)
                return True
            except stages.StageFailed as e:
                receipt = e.message
            except Exception as e:  # noqa: BLE001 - the text may quote a URL or a cell
                log.warning("pipeline: loading the sample failed (%s)", type(e).__name__)
                receipt = LOAD_FAILED
        _update(0, status="failed", receipt=receipt,
                seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
        _skip_from(1, len(run.entries))
        return False
    finally:
        with _LOCK:
            _STATE.loading = False
        gc.collect()


def _run(run: _Plan, source: str = "upload",
         prepare: Callable[[], None] | None = None,
         on_finish: Callable[[dict], None] | None = None, relabel: bool = True) -> None:
    ok = False
    cleared = False
    plan = run.entries
    try:
        if prepare is not None:
            if not _prepare(prepare, run):
                return
            cleared = True
        for i, (_sid, label, fn) in enumerate(plan):
            _update(i, status="running")
            t0 = time.perf_counter()
            # Results are forgotten only once Check has passed, as the first
            # changing stage starts: a run refused at Check leaves every /last
            # result, the stored actions and the tuned settings as they were.
            if not cleared and _sid != CHECK_ID:
                try:
                    _forget(run)
                except Exception as e:  # noqa: BLE001
                    log.warning("pipeline: clearing results failed (%s)", type(e).__name__)
                    _update(i, status="failed", receipt=CLEAR_FAILED,
                            seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
                    _skip_from(i + 1, len(plan))
                    return
                cleared = True
            try:
                scale = timings.scale_for(_sid)   # the data size this stage starts on
                result = fn()
            except stages.StageFailed as e:
                _update(i, status="failed", receipt=e.message,
                        seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
                _skip_from(i + 1, len(plan))
                return
            except Exception as e:  # noqa: BLE001 - the text may quote a cell
                log.warning("pipeline: stage %s failed (%s)", _sid, type(e).__name__)
                _update(i, status="failed",
                        receipt=f"{label} failed unexpectedly ({type(e).__name__}).",
                        seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
                _skip_from(i + 1, len(plan))
                return
            finally:
                gc.collect()
            seconds = time.perf_counter() - t0
            _update(i, status=result.status, receipt=result.receipt,
                    warnings=list(result.warnings),
                    seconds=round(seconds, 2), peak_mb=_peak())
            if result.status in ("done", "amber"):
                # Recording the time and marking the step ready can raise too
                # (the fingerprint reads the data): then the stage fails, like
                # one that raised, so a half-run never ends looking finished.
                try:
                    timings.record(_sid, seconds, scale)
                    _made(_sid, source, relabel)
                except Exception as e:  # noqa: BLE001 - the text may quote a cell
                    log.warning("pipeline: stage %s could not be recorded (%s)",
                                _sid, type(e).__name__)
                    _update(i, status="failed",
                            receipt=f"{label} failed unexpectedly ({type(e).__name__}).")
                    _skip_from(i + 1, len(plan))
                    return
        ok = True
    finally:
        with _LOCK:
            _STATE.finished_at = _now()
            if ok:
                _STATE.successful_runs += 1
                _STATE.last_success_at = _STATE.finished_at
                if run.full:   # the whole pipeline ran: every step is ready
                    _STATE.ready = set(READY_STEPS)
                    _STATE.results_source = source
            _STATE.producing = frozenset()
            _STATE.cleared = False
            _STATE.running = False
        if on_finish is not None:
            try:
                on_finish(status())
            except Exception as e:  # noqa: BLE001 - the run itself has ended
                log.warning("pipeline: the end-of-run callback failed (%s)",
                            type(e).__name__)


def _peak() -> float:
    return round(peak_mb(), 1)


def _skip_from(first: int, n: int) -> None:
    for j in range(first, n):
        _update(j, status="skipped")


def status() -> dict:
    with _LOCK:
        held = _STATE.results_source if _server_ready() else None
        source = ({"mode": _MODE[held], "run": _STATE.successful_runs,
                   "finished_at": _STATE.last_success_at}
                  if held and _STATE.successful_runs else {"mode": "none"})
        # Pages see the steps a run re-makes only once it has ended (see the
        # docstring), so a run refused at Check leaves the earlier ones visible.
        visible = _STATE.ready - _STATE.producing if _STATE.running else _STATE.ready
        steps = [s for s in READY_STEPS if s in visible]
        return {
            "data_version": data_version.current(),
            "running": _STATE.running,
            "results_ready": bool(steps),
            "ready_steps": steps,
            "results_source": held,
            "run_source": _STATE.source,
            "loading": _STATE.loading,
            "started_at": _STATE.started_at,
            "finished_at": _STATE.finished_at,
            "stages": ([dict(s, warnings=list(s["warnings"])) for s in _STATE.stages]
                       or [_blank(sid, label) for sid, label, _ in stages.STAGES]),
            "source": source,
            "origin": simulation_data.origin(),
        }
