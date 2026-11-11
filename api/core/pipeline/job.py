"""The pipeline run: one background thread working through stages.STAGES.

One job at a time. The state lives in this module, so any client polling
status() sees the same run. Once Check has passed, the run forgets every
computed result (data_version.invalidate_all) before the first stage that
changes anything, so a later failure leaves results cleared, never
half-replaced, while a run refused at Check changes nothing. Error text from an
unexpected exception is never shown: it may quote a cell value.

Readiness: results exist only once a run has produced them in this server
process. They become available to the server (the readiness guard, the
assistant's tools) as soon as the last result-producing stage, Optimise, has
finished, because Recommend reads them; the pages see them as ready only once
the whole run has ended. Clearing results makes them unavailable again, and a
restart starts with none, like the RAM-only data they come from.

A run has a source: "upload" (the Data Hub's Run) or "sample" (the sample
button, whose loader runs first in the same thread; see core/pipeline/sample.py).
"""
from __future__ import annotations

import ctypes
import gc
import logging
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Callable
from datetime import datetime, timezone

from core import data_version, simulation_data
from core.pipeline import stages

log = logging.getLogger("healthforecast.pipeline")


CHECK_ID = "check"
# The last stage that makes results; Recommend after it only reads them.
RESULTS_STAGE = "optimise"
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
    results_ok: bool = False            # results exist (see the module docstring)
    results_source: str | None = None   # the source of the run that made them


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


def results_available() -> bool:
    """Whether results exist for the server to serve. True from the end of the
    Optimise stage, so Recommend can read them; status() tells the pages."""
    with _LOCK:
        return _STATE.results_ok


def results_source() -> str | None:
    """"upload" or "sample": the source of the results held now, or None."""
    with _LOCK:
        return _STATE.results_source if _STATE.results_ok else None


def start(source: str = "upload", prepare: Callable[[], None] | None = None) -> dict:
    """Start a run in the background. Raises Busy if one is in progress.

    ``prepare`` runs first, in the run's thread, once the previous results are
    forgotten. It raises stages.StageFailed with a plain-English reason to stop
    the run at Check."""
    if source not in SOURCES:
        raise ValueError(f"unknown run source {source!r}")
    with _LOCK:
        if _STATE.running:
            raise Busy()
        plan = list(stages.STAGES)
        _STATE.running = True
        _STATE.source = source
        _STATE.loading = prepare is not None
        _STATE.started_at = _now()
        _STATE.finished_at = None
        _STATE.stages = [_blank(sid, label) for sid, label, _ in plan]
        _STATE.thread = threading.Thread(target=_run, args=(plan, source, prepare),
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


def _forget_results() -> None:
    with _LOCK:
        _STATE.results_ok = False
        _STATE.results_source = None


def _results_made(source: str) -> None:
    with _LOCK:
        _STATE.results_ok = True
        _STATE.results_source = source


def _prepare(prepare: Callable[[], None], n: int) -> bool:
    """Forget the old results, then run the loader. On failure stage 0 fails
    with a plain reason, the rest are skipped, and False is returned."""
    t0 = time.perf_counter()
    try:
        # The loader replaces the data, so results made from the old data go first.
        _forget_results()
        try:
            data_version.invalidate_all()
        except Exception as e:  # noqa: BLE001
            log.warning("pipeline: clearing results failed (%s)", type(e).__name__)
            receipt = CLEAR_FAILED
        else:
            try:
                prepare()
                return True
            except stages.StageFailed as e:
                receipt = e.message
            except Exception as e:  # noqa: BLE001 - the text may quote a URL or a cell
                log.warning("pipeline: loading the sample failed (%s)", type(e).__name__)
                receipt = LOAD_FAILED
        _update(0, status="failed", receipt=receipt,
                seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
        _skip_from(1, n)
        return False
    finally:
        with _LOCK:
            _STATE.loading = False
        gc.collect()


def _run(plan: list, source: str = "upload",
         prepare: Callable[[], None] | None = None) -> None:
    ok = False
    cleared = False
    try:
        if prepare is not None:
            if not _prepare(prepare, len(plan)):
                return
            cleared = True
        for i, (_sid, label, fn) in enumerate(plan):
            _update(i, status="running")
            t0 = time.perf_counter()
            # Results are forgotten only once Check has passed, as the first
            # changing stage starts: a run refused at Check leaves every /last
            # result, the stored actions and the tuned settings as they were.
            if not cleared and _sid != CHECK_ID:
                _forget_results()
                try:
                    data_version.invalidate_all()
                except Exception as e:  # noqa: BLE001
                    log.warning("pipeline: clearing results failed (%s)", type(e).__name__)
                    _update(i, status="failed", receipt=CLEAR_FAILED,
                            seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
                    _skip_from(i + 1, len(plan))
                    return
                cleared = True
            try:
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
            _update(i, status=result.status, receipt=result.receipt,
                    warnings=list(result.warnings),
                    seconds=round(time.perf_counter() - t0, 2), peak_mb=_peak())
            if _sid == RESULTS_STAGE:
                _results_made(source)
        ok = True
    finally:
        with _LOCK:
            _STATE.finished_at = _now()
            if ok:
                _STATE.successful_runs += 1
                _STATE.last_success_at = _STATE.finished_at
                if cleared:   # a plan without an Optimise stage made its results here
                    _STATE.results_ok = True
                    _STATE.results_source = source
            _STATE.running = False


def _peak() -> float:
    return round(peak_mb(), 1)


def _skip_from(first: int, n: int) -> None:
    for j in range(first, n):
        _update(j, status="skipped")


def status() -> dict:
    with _LOCK:
        held = _STATE.results_source if _STATE.results_ok else None
        source = ({"mode": _MODE[held], "run": _STATE.successful_runs,
                   "finished_at": _STATE.last_success_at}
                  if held and _STATE.successful_runs else {"mode": "none"})
        return {
            "data_version": data_version.current(),
            "running": _STATE.running,
            # Pages show results only from a finished run (see the docstring).
            "results_ready": _STATE.results_ok and not _STATE.running,
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
