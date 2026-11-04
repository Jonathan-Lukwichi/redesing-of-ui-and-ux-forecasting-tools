"""The pipeline run: one background thread working through stages.STAGES.

One job at a time. The state lives in this module, so any client polling
status() sees the same run. Once Check has passed, the run forgets every
computed result (data_version.invalidate_all) before the first stage that
changes anything, so a later failure leaves results cleared, never
half-replaced, while a run refused at Check changes nothing. Error text from an
unexpected exception is never shown: it may quote a cell value.
"""
from __future__ import annotations

import ctypes
import gc
import logging
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from core import data_version, simulation_data
from core.pipeline import stages

log = logging.getLogger("healthforecast.pipeline")


CHECK_ID = "check"
CLEAR_FAILED = "Previous results could not be cleared, so the run stopped."


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


def start() -> dict:
    """Start a run in the background. Raises Busy if one is in progress."""
    with _LOCK:
        if _STATE.running:
            raise Busy()
        plan = list(stages.STAGES)
        _STATE.running = True
        _STATE.started_at = _now()
        _STATE.finished_at = None
        _STATE.stages = [_blank(sid, label) for sid, label, _ in plan]
        _STATE.thread = threading.Thread(target=_run, args=(plan,), daemon=True,
                                         name="pipeline-run")
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


def _run(plan: list) -> None:
    ok = False
    cleared = False
    try:
        for i, (_sid, label, fn) in enumerate(plan):
            _update(i, status="running")
            t0 = time.perf_counter()
            # Results are forgotten only once Check has passed, as the first
            # changing stage starts: a run refused at Check leaves every /last
            # result, the stored actions and the tuned settings as they were.
            if not cleared and _sid != CHECK_ID:
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
        ok = True
    finally:
        with _LOCK:
            _STATE.finished_at = _now()
            if ok:
                _STATE.successful_runs += 1
                _STATE.last_success_at = _STATE.finished_at
            _STATE.running = False


def _peak() -> float:
    return round(peak_mb(), 1)


def _skip_from(first: int, n: int) -> None:
    for j in range(first, n):
        _update(j, status="skipped")


def status() -> dict:
    with _LOCK:
        source = ({"mode": "uploaded", "run": _STATE.successful_runs,
                   "finished_at": _STATE.last_success_at}
                  if _STATE.successful_runs else {"mode": "default"})
        return {
            "data_version": data_version.current(),
            "running": _STATE.running,
            "started_at": _STATE.started_at,
            "finished_at": _STATE.finished_at,
            "stages": ([dict(s, warnings=list(s["warnings"])) for s in _STATE.stages]
                       or [_blank(sid, label) for sid, label, _ in stages.STAGES]),
            "source": source,
            "origin": simulation_data.origin(),
        }
