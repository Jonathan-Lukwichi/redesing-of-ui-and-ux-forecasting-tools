"""Transform one month's register workbook into its aggregate tables.

The workbook is read once, in memory, and the same grid feeds the daily,
hourly and clinical extractors. Only numeric aggregates are returned. The
bytes and the grid are dropped before this returns; on failure the error
names only the file and the phase, and carries no chained exception.
"""
import hashlib
import logging
from dataclasses import dataclass

import pandas as pd

from core.transform import TransformError, clinical, extract, reader

log = logging.getLogger("healthforecast.transform")


@dataclass
class MonthTables:
    year: int
    month: int
    sha256: str
    daily: pd.DataFrame      # cleaned, then reconciled, one row per day
    hourly: pd.DataFrame     # days x 24 grid of arrival_count
    clinical: pd.DataFrame   # per-day clinical counts, before unify/aggregate
    receipt: dict


def _nonempty(df: pd.DataFrame) -> pd.DataFrame:
    # The offline pipeline rejects a file whose extraction yields no rows; a
    # failed clinical extraction (an empty frame) fails the month, never zeros.
    if df.empty:
        raise ValueError("no records extracted")
    return df


def transform_month(raw: bytes, filename: str) -> MonthTables:
    sha256 = hashlib.sha256(raw).hexdigest()
    year, month = reader.parse_filename(filename)

    phase = "workbook"
    failed = None
    sheet = None
    try:
        sheet = reader.read_sheet(raw)
        phase = "daily totals"
        daily = _nonempty(extract.extract_daily_data(sheet, year, month, filename, log))
        phase = "hourly arrivals"
        hourly = _nonempty(extract.extract_hourly_data(sheet, year, month, filename, log))
        phase = "clinical reasons"
        clin = _nonempty(clinical.extract_clinical_data(sheet, year, month, filename, log))
        # The offline pipeline's order: clean (phase 2), then reconcile (2b).
        phase = "cleaning"
        daily = extract.clean_data(daily, log)
        phase = "reconciliation"
        daily = extract.reconcile_daily_with_hourly(daily, hourly, log)
    except Exception as e:
        failed = phase
        # The type name only: the message may quote a register cell.
        failed_type = type(e).__name__
    finally:
        # The grid holds patient rows: drop it, and this frame's reference to
        # the bytes, before returning or raising.
        del sheet, raw
    # Raised outside the except block so neither __cause__ nor __context__
    # holds the original exception, whose text may quote a cell value.
    if failed is not None:
        log.warning("  %s: %s in the %s phase", filename, failed_type, failed)
        raise TransformError(f"{filename}: could not read the {failed} section")

    receipt = {
        "file": filename,
        "month": f"{year:04d}-{month:02d}",
        "days": int(len(daily)),
        "arrivals": int(daily["patient_count"].sum()),
        "hourly_rows": int(len(hourly)),
        "clinical_columns": int(len(clin.columns)),
    }
    log.info("  %s: %d days, %d arrivals", filename, receipt["days"], receipt["arrivals"])
    return MonthTables(year, month, sha256, daily, hourly, clin, receipt)
