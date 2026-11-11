"""Shared test setup.

Results are served only after a pipeline run has finished (core/pipeline/job.py
and the readiness guard in core/security.py). Almost every test describes the
app after a run, so each starts with results marked ready. A test about the
empty state replaces the job's state with a fresh one (see
test_empty_until_run.py), which starts not ready, as a real server does.
"""
import pytest

from core.pipeline import job


@pytest.fixture(autouse=True)
def results_ready_by_default(monkeypatch):
    monkeypatch.setattr(job._STATE, "results_ok", True, raising=False)
    yield
