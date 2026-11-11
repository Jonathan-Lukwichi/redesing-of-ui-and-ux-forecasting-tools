"""One-button pipeline: staging of transformed months, and the job that runs
the stages."""


def is_running() -> bool:
    """True while a pipeline run is active. Uploads are refused meanwhile."""
    from core.pipeline import job   # lazily: job imports this package's modules
    return job.is_running()


# The results a step can leave ready. The analysis is three of them, so the
# assistant can run (and the readiness check can report) each area on its own.
READY_STEPS: tuple[str, ...] = ("arrivals", "staff", "supply", "forecast", "optimise", "recommend")
