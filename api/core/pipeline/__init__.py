"""One-button pipeline: staging of transformed months, and (later) the job."""


def is_running() -> bool:
    """True while a pipeline run is active. Uploads are refused meanwhile.
    Task 9 makes this delegate to the job."""
    return False
