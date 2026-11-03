"""One-button pipeline: staging of transformed months, and the job that runs
the stages."""


def is_running() -> bool:
    """True while a pipeline run is active. Uploads are refused meanwhile."""
    from core.pipeline import job   # lazily: job imports this package's modules
    return job.is_running()
