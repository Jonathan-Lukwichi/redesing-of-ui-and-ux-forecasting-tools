"""File name parsing and the one in-memory read of a register workbook."""
import io
import re

import pandas as pd

from core.transform import TransformError

# From pipeline_config.SKIP_FILES: an empty template, never a real month.
SKIP_FILES = [
    "Casualty_Daily_Register_2019_04.xlsx",  # Empty template
]


def parse_filename(name: str) -> tuple[int, int]:
    """(year, month) from Casualty_Daily_Register_YYYY_MM.xlsx.

    Same pattern as run_pipeline.get_month_year_from_filename; a name that does
    not match, or the skipped 2019_04 template, raises TransformError.
    """
    match = re.search(r'(\d{4})_(\d{2})\.xlsx$', name)
    if not match:
        raise TransformError(
            f"{name}: name does not match Casualty_Daily_Register_YYYY_MM.xlsx - "
            f"rename the file to match the convention")
    if name in SKIP_FILES:
        raise TransformError(f"{name}: this month is a skipped template, not a register")
    return int(match.group(1)), int(match.group(2))


def read_sheet(raw: bytes) -> pd.DataFrame:
    """The first sheet as a header-less grid, read from memory only.

    Equivalent to the offline pipeline's pd.read_excel(filepath, header=None),
    which used openpyxl. calamine gave an identical grid (values and dtypes)
    and identical extracted tables on one file per template era (2019_06,
    2021_03, 2023_04, 2026_01), 4.5x to 6.3x faster.
    """
    return pd.read_excel(io.BytesIO(raw), header=None, engine="calamine")
