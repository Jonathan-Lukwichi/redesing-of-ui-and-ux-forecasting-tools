"""Monthly Casualty Daily Register transformation, ported from the offline
healthforecast_pipeline (run_pipeline.py, scripts/extract_clinical_reasons.py).

The extraction logic is copied, not rewritten. Only input and output changed:
each extractor takes an already-loaded sheet, year, month and a label (the file
name) instead of a path, and nothing touches the filesystem. Error and log text
never carries a cell value from the register, which holds patient names.
"""


class TransformError(Exception):
    """A month could not be transformed. ``public_message`` is safe to show:
    it names only the file and the phase, never a cell value."""

    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message
