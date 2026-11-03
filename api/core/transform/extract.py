"""Daily and hourly extraction, reconciliation and cleaning of one month.

Copied from healthforecast_pipeline/run_pipeline.py (working tree, v2.1
hardening included). Changes from the source, and only these:
  - extractors take (sheet, year, month, label, logger) instead of a path; the
    file name check moved to reader.parse_filename and `filename` is `label`;
  - no pd.read_excel here: the caller reads the workbook once;
  - log and error text no longer embeds an exception message or traceback,
    which could carry a register cell value (patient names); the exception
    type name is logged instead.
"""
import calendar
import datetime as dt
import re
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

# Arrival fields we expect to find in the daily TOTALS headers. Some Era-1
# files (e.g. June 2019) genuinely lack these headers; that is tolerated with
# a loud warning because the v2.1 reconcile step overwrites all arrival fields
# from the hourly extraction, which is the authoritative source. A file whose
# HOURLY time columns cannot be detected is still hard-rejected.
EXPECTED_ARRIVAL_FIELDS = {'arrival_normal_hours', 'arrival_after_hours'}

# A file missing per-day TOTALS rows for more than this many days is treated
# as a partial (mid-month) upload and rejected unless --allow-partial is set.
MAX_MISSING_TOTALS_DAYS = 3


class ExtractionError(Exception):
    """A file could not be extracted; the file is rejected, the run continues."""


class SchemaDetectionError(ExtractionError):
    """Required columns could not be located in the file's headers."""


class PartialMonthError(ExtractionError):
    """The file covers only part of its month (mid-month upload)."""


def detect_columns(df, logger=None):
    """
    Dynamically detect column positions by reading header labels.
    The Excel schema shifts across years (2019 vs 2021-2023 vs 2025+),
    so fixed column indices cannot be used.
    """
    col_map = {}

    # Scan rows 0-4 for header labels
    header_rows = min(5, len(df))

    for c in range(min(50, len(df.columns))):
        labels = []
        for r in range(header_rows):
            val = df.iloc[r, c]
            if val is not None and str(val).strip():
                labels.append(str(val).strip())
        combined = ' | '.join(labels).lower()

        # Match by header text
        if 'nh total' in combined:
            col_map['arrival_normal_hours'] = c
        elif 'ah total' in combined:
            col_map['arrival_after_hours'] = c
        elif 'attendant' in combined and 'attendant' not in str(col_map):
            col_map['attendant_count'] = c
        elif 'iti number' in combined:
            col_map['internal_transfer_in'] = c
        elif 'eti number' in combined:
            col_map['external_transfer_in'] = c
        elif 'discharges' in combined or 'rht' in combined:
            col_map['discharges_rht_abscond'] = c
        elif 'deaths' in combined and 'p4' in combined:
            col_map['deaths_p4'] = c
        elif 'internal transfer' in combined and 'out' in combined and 'name' not in combined:
            # "Internal Transfers Out to other Wards" (the number column, not the name column)
            if 'internal_transfer_out' not in col_map:
                col_map['internal_transfer_out'] = c
        elif 'external transfer' in combined and 'out' in combined and 'name' not in combined:
            if 'external_transfer_out' not in col_map:
                col_map['external_transfer_out'] = c
        elif 'carry over' in combined and c > 15:
            col_map['carry_over_midnight'] = c
        elif 'inpatients midnight' in combined:
            col_map['inpatients_midnight'] = c

    # Detect triage P1/P2/P3 columns using sub-headers (Normal Hours vs After Hours)
    # P1/P2/P3 appear twice: once for Normal Hours, once for After Hours
    p_nh_cols = []
    p_ah_cols = []
    for c in range(min(50, len(df.columns))):
        h2 = str(df.iloc[1, c]).strip() if df.iloc[1, c] is not None else ''
        h3 = str(df.iloc[2, c]).strip().lower() if df.iloc[2, c] is not None else ''
        if h2 in ('P1', 'P2', 'P3'):
            if 'normal' in h3:
                p_nh_cols.append((h2, c))
            elif 'after' in h3:
                p_ah_cols.append((h2, c))

    for label, c in p_nh_cols:
        col_map[f'{label.lower()}_normal_hours'] = c
    for label, c in p_ah_cols:
        col_map[f'{label.lower()}_after_hours'] = c

    # Detect Sub Total columns by position context
    # There are multiple "Sub Total" columns; identify them by their position
    sub_totals = []
    for c in range(min(50, len(df.columns))):
        h2 = str(df.iloc[1, c]).strip().lower() if df.iloc[1, c] is not None else ''
        if h2 == 'sub total':
            sub_totals.append(c)

    # Assign Sub Totals by position relative to known columns
    for st_col in sub_totals:
        if 'arrival_normal_hours' in col_map and st_col < col_map.get('attendant_count', 999):
            # Sub Total after arrivals, before attendant = arrival subtotal
            if st_col > col_map['arrival_normal_hours']:
                col_map['arrival_subtotal'] = st_col
        elif 'external_transfer_in' in col_map and 'discharges_rht_abscond' in col_map:
            if col_map['external_transfer_in'] < st_col < col_map['discharges_rht_abscond']:
                col_map['transfer_in_subtotal'] = st_col
        elif 'deaths_p4' in col_map:
            if st_col > col_map.get('external_transfer_out', 0) and 'separation_subtotal' not in col_map:
                col_map['separation_subtotal'] = st_col

    # Detect transfer out columns more carefully
    # The "name" columns have text; the "number" columns have numeric data
    # Look for Internal/External Transfer Out where the TOTALS row has a numeric value
    monthly_totals_idx = None
    for idx in range(min(10, len(df))):
        if str(df.iloc[idx, 0]).strip().upper() == 'TOTALS':
            monthly_totals_idx = idx
            break

    if monthly_totals_idx is not None:
        for c in range(min(50, len(df.columns))):
            h2 = str(df.iloc[1, c]).strip().lower() if df.iloc[1, c] is not None else ''
            totals_val = df.iloc[monthly_totals_idx, c]
            has_numeric_total = pd.to_numeric(totals_val, errors='coerce') is not None and pd.notna(pd.to_numeric(totals_val, errors='coerce'))

            if 'internal transfer' in h2 and 'out' in h2 and has_numeric_total:
                col_map['internal_transfer_out'] = c
            elif 'external transfer' in h2 and 'out' in h2 and has_numeric_total:
                col_map['external_transfer_out'] = c

        # Re-detect separation_subtotal: the "Sub Total" column that comes
        # after the last transfer-out column
        for st_col in sub_totals:
            if st_col > col_map.get('external_transfer_out', 0) and st_col > col_map.get('internal_transfer_out', 0):
                tot_val = pd.to_numeric(df.iloc[monthly_totals_idx, st_col], errors='coerce')
                if pd.notna(tot_val) and tot_val > 0:
                    col_map['separation_subtotal'] = st_col
                    break

        # Detect carry_over_midnight: column between separation_subtotal and P1 NH
        if 'separation_subtotal' in col_map and 'p1_normal_hours' in col_map:
            for c in range(col_map['separation_subtotal'] + 1, col_map['p1_normal_hours']):
                tot_val = pd.to_numeric(df.iloc[monthly_totals_idx, c], errors='coerce')
                if pd.notna(tot_val) and tot_val > 0:
                    col_map['carry_over_midnight'] = c
                    break

    if logger:
        logger.info(f"  Detected {len(col_map)} columns dynamically")

    return col_map


def extract_daily_data(sheet: pd.DataFrame, year: int, month: int, label: str, logger,
                       allow_partial: bool = False) -> pd.DataFrame:
    """
    Extract daily aggregate data from an Excel file.

    Strategy: Each file has a monthly TOTALS row (first) followed by per-day
    TOTALS rows (one per day). We read the per-day TOTALS rows directly,
    which avoids double-counting patient rows and padding rows.
    Column positions are detected dynamically from headers since the schema
    shifts across years.

    Raises ExtractionError (or a subclass) when the file cannot be trusted:
    unknown schema, partial month, malformed content. Callers reject the file
    rather than letting bad data enter the dataset.
    """
    filename = label

    try:
        df = sheet

        # Dynamically detect column positions from headers
        col_map = detect_columns(df, logger)

        if not col_map:
            raise SchemaDetectionError(
                f"{filename}: no known columns detected in headers - "
                f"the file may be empty, a new template, or not a casualty register")

        # Arrival headers missing (known Era-1 quirk, e.g. June 2019): warn
        # loudly but continue - the reconcile step derives all arrival fields
        # from the hourly extraction, and hourly failure rejects the file.
        missing_arrival = EXPECTED_ARRIVAL_FIELDS - col_map.keys()
        if missing_arrival:
            logger.warning(
                f"  {filename}: arrival columns not found in headers: "
                f"{sorted(missing_arrival)} (detected: {sorted(col_map)}). "
                f"Arrival fields will be derived from the hourly extraction")

        # Find ALL TOTALS rows
        totals_rows = []
        for idx in range(len(df)):
            val = df.iloc[idx, 0]
            if val is not None and str(val).strip().upper() == 'TOTALS':
                totals_rows.append(idx)

        if len(totals_rows) < 2:
            raise ExtractionError(
                f"{filename}: only {len(totals_rows)} TOTALS row(s) found - "
                f"expected 1 monthly + 1 per day")

        monthly_totals_idx = totals_rows[0]
        daily_totals_indices = totals_rows[1:]

        days_in_month = calendar.monthrange(year, month)[1]

        # Map each daily TOTALS row to its day number.
        # The day number appears in the first data row of each day section,
        # which is the row right after the previous TOTALS row.
        daily_records = []
        for i, dt_idx in enumerate(daily_totals_indices):
            day = None
            # The day's data starts right after the previous TOTALS row
            if i == 0:
                section_start = monthly_totals_idx + 1
            else:
                section_start = daily_totals_indices[i - 1] + 1

            # Look forward from section start for the day number
            for check_idx in range(section_start, dt_idx):
                d = pd.to_numeric(df.iloc[check_idx, 0], errors='coerce')
                if pd.notna(d) and 1 <= d <= 31:
                    day = int(d)
                    break

            if day is None or day > days_in_month:
                continue

            record = {
                'date': datetime(year, month, day),
                'year': year,
                'month': month,
                'day': day,
            }

            # Read values directly from the daily TOTALS row
            for field_name, col_idx in col_map.items():
                if field_name == 'inpatients_midnight':
                    continue
                if col_idx < len(df.columns):
                    val = pd.to_numeric(df.iloc[dt_idx, col_idx], errors='coerce')
                    record[field_name] = int(val) if pd.notna(val) else 0
                else:
                    record[field_name] = 0

            # Compute patient_count as arrival_normal_hours + arrival_after_hours
            nh = record.get('arrival_normal_hours', 0)
            ah = record.get('arrival_after_hours', 0)
            record['patient_count'] = nh + ah

            # Compute arrival_subtotal if not directly available
            if 'arrival_subtotal' not in record or record.get('arrival_subtotal', 0) == 0:
                record['arrival_subtotal'] = nh + ah

            daily_records.append(record)

        # Days with no TOTALS row: a few are tolerated (clerical gaps, recovered
        # later by the hourly reconciliation), but many missing days means a
        # partial/mid-month file - reject it instead of fabricating zero days.
        found_days = {r['day'] for r in daily_records}
        missing_days = [d for d in range(1, days_in_month + 1) if d not in found_days]
        if missing_days:
            if len(missing_days) > MAX_MISSING_TOTALS_DAYS and not allow_partial:
                raise PartialMonthError(
                    f"{filename}: no TOTALS row for {len(missing_days)} of "
                    f"{days_in_month} days (days {missing_days}). This looks like a "
                    f"partial/mid-month file. Upload the complete month, or rerun "
                    f"with --allow-partial to force")
            logger.warning(
                f"  {filename}: filling {len(missing_days)} day(s) with zeros "
                f"(no TOTALS row found): days {missing_days}")
            for day in missing_days:
                record = {
                    'date': datetime(year, month, day),
                    'year': year,
                    'month': month,
                    'day': day,
                    'patient_count': 0,
                }
                for field_name in col_map:
                    if field_name != 'inpatients_midnight':
                        record.setdefault(field_name, 0)
                daily_records.append(record)

        result_df = pd.DataFrame(daily_records)
        result_df = result_df.sort_values('day').reset_index(drop=True)

        # Add source file column
        result_df['source_file'] = filename

        return result_df

    except ExtractionError:
        raise
    except Exception as e:
        logger.error(f"  {filename}: {type(e).__name__} during daily extraction")
        raise ExtractionError(
            f"{filename}: unexpected error during extraction: {type(e).__name__}") from None


def parse_time_to_hour(value):
    """
    Parse various time formats to extract the hour (0-23).
    Handles datetime.time, Timestamp, Excel floats, strings, NaN.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(value, dt.time):
        return value.hour
    if isinstance(value, dt.datetime):
        return value.hour
    if isinstance(value, pd.Timestamp):
        return value.hour
    if isinstance(value, (int, float)):
        if 0 <= value < 1:
            return min(int(value * 24), 23)
        elif 1 <= value <= 24:
            return int(value) % 24
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        for fmt in ["%H:%M", "%H:%M:%S", "%I:%M %p", "%H.%M"]:
            try:
                return dt.datetime.strptime(value, fmt).hour
            except ValueError:
                continue
        m = re.match(r"(\d{1,2})", value)
        if m:
            h = int(m.group(1))
            if 0 <= h <= 23:
                return h
    return None


def detect_time_columns(df):
    """
    Detect the column indices for Normal Hours and After Hours arrival times.
    Returns (normal_hours_time_col, after_hours_time_col, episode_col).
    """
    nh_time_col = None
    ah_time_col = None
    episode_col = 4  # default

    for c in range(min(15, len(df.columns))):
        h2 = str(df.iloc[1, c]).strip().lower() if df.iloc[1, c] is not None else ''
        h3 = str(df.iloc[2, c]).strip().lower() if df.iloc[2, c] is not None else ''

        if 'episode' in h2:
            episode_col = c

        if 'arrival time' in h2:
            # The actual time column is here; the sub-header tells us which shift
            if 'normal' in h3:
                nh_time_col = c
            elif nh_time_col is None:
                # First "Arrival Time" without sub-header = normal hours
                nh_time_col = c

        if 'after hours' in h3 and nh_time_col is not None and ah_time_col is None:
            # After Hours time column is the one with "After Hours" sub-header
            ah_time_col = c

    return nh_time_col, ah_time_col, episode_col


def extract_hourly_data(sheet: pd.DataFrame, year: int, month: int, label: str,
                        logger) -> pd.DataFrame:
    """
    Extract hourly arrival counts from individual patient rows.
    Reads each patient row, parses the arrival time, and counts
    arrivals per (day, hour).
    """
    filename = label

    try:
        df = sheet

        # Detect time columns dynamically
        nh_time_col, ah_time_col, episode_col = detect_time_columns(df)

        if nh_time_col is None and ah_time_col is None:
            raise SchemaDetectionError(
                f"{filename}: could not detect arrival-time columns in headers - "
                f"this looks like a new schema era; update detect_time_columns()")

        # Find ALL TOTALS rows
        totals_rows = []
        for idx in range(len(df)):
            val = df.iloc[idx, 0]
            if val is not None and str(val).strip().upper() == 'TOTALS':
                totals_rows.append(idx)

        if len(totals_rows) < 2:
            raise ExtractionError(
                f"{filename}: only {len(totals_rows)} TOTALS row(s) found - "
                f"not enough for hourly extraction")

        monthly_totals_idx = totals_rows[0]
        daily_totals_indices = totals_rows[1:]

        days_in_month = calendar.monthrange(year, month)[1]

        # Count arrivals by (day, hour)
        hourly_counts = defaultdict(int)
        total_parsed = 0
        total_unparsed = 0

        for i, dt_idx in enumerate(daily_totals_indices):
            # Find day number
            if i == 0:
                section_start = monthly_totals_idx + 1
            else:
                section_start = daily_totals_indices[i - 1] + 1

            day = None
            for check_idx in range(section_start, dt_idx):
                d = pd.to_numeric(df.iloc[check_idx, 0], errors='coerce')
                if pd.notna(d) and 1 <= d <= 31:
                    day = int(d)
                    break

            if day is None or day > days_in_month:
                continue

            # Process patient rows between day marker and TOTALS
            for row_idx in range(section_start, dt_idx):
                # Skip the day marker row itself if it's the first row
                row = df.iloc[row_idx]

                # Skip carry-over patients
                ep_val = row.iloc[episode_col] if episode_col < len(row) else None
                if ep_val is not None and isinstance(ep_val, str) and 'carry over' in ep_val.lower():
                    continue

                # Try to extract arrival hour
                hour = None
                if nh_time_col is not None:
                    hour = parse_time_to_hour(row.iloc[nh_time_col])
                if hour is None and ah_time_col is not None:
                    hour = parse_time_to_hour(row.iloc[ah_time_col])

                if hour is not None:
                    hourly_counts[(day, hour)] += 1
                    total_parsed += 1
                else:
                    # Only count as unparsed if row looks like a real patient row
                    # (has some non-null values in the time columns)
                    has_time = False
                    if nh_time_col is not None and row.iloc[nh_time_col] is not None:
                        try:
                            if not pd.isna(row.iloc[nh_time_col]):
                                has_time = True
                        except (TypeError, ValueError):
                            has_time = True
                    if ah_time_col is not None and row.iloc[ah_time_col] is not None:
                        try:
                            if not pd.isna(row.iloc[ah_time_col]):
                                has_time = True
                        except (TypeError, ValueError):
                            has_time = True
                    if has_time:
                        total_unparsed += 1

        # Build complete grid: days_in_month x 24 hours
        records = []
        for day in range(1, days_in_month + 1):
            for hour in range(24):
                records.append({
                    'date': datetime(year, month, day),
                    'year': year,
                    'month': month,
                    'day': day,
                    'hour': hour,
                    'arrival_count': hourly_counts.get((day, hour), 0),
                    'source_file': filename,
                })

        result_df = pd.DataFrame(records)

        logger.info(f"  {filename}: {total_parsed} arrivals parsed, "
                     f"{total_unparsed} unparsed, "
                     f"NH_col={nh_time_col}, AH_col={ah_time_col}")

        return result_df

    except ExtractionError:
        raise
    except Exception as e:
        logger.error(f"  {filename}: {type(e).__name__} during hourly extraction")
        raise ExtractionError(
            f"{filename}: unexpected error during hourly extraction: {type(e).__name__}") from None


def reconcile_daily_with_hourly(daily_df: pd.DataFrame, hourly_df: pd.DataFrame, logger) -> pd.DataFrame:
    """
    Redefine the daily arrival counts from the hourly extract (authoritative source).

    Rationale (v2.1): the per-day TOTALS rows in raw Excel are inconsistent:
      (a) sometimes include carry-over patients (inflating the count, mostly in 2022-2023),
      (b) sometimes under-count (nursing-clerical arithmetic errors in TOTALS cells),
      (c) sometimes are blank despite recorded patient rows (e.g. June 2019 template).
    The hourly extractor always reads individual patient rows directly, skipping
    carry-overs and untimed rows, which gives a CONSISTENT definition across all files.

    We therefore overwrite the arrival-count fields with hourly-derived values:
      patient_count          = sum of hourly arrival_count for that date
      arrival_normal_hours   = sum of hours 7..15
      arrival_after_hours    = sum of hours 0..6 + 16..23
      arrival_subtotal       = same as patient_count (kept for backward compatibility)

    The daily TOTALS-row value is retained in a new column `patient_count_totals_raw`
    so analyses can compare the two when needed.
    """
    if daily_df.empty or hourly_df.empty:
        return daily_df

    daily = daily_df.copy()
    hourly = hourly_df.copy()
    daily['date'] = pd.to_datetime(daily['date'])
    hourly['date'] = pd.to_datetime(hourly['date'])

    hourly['_is_nh'] = hourly['hour'].between(7, 15)
    agg = hourly.groupby('date').apply(
        lambda g: pd.Series({
            'hourly_total': int(g['arrival_count'].sum()),
            'hourly_nh': int(g.loc[g['_is_nh'], 'arrival_count'].sum()),
            'hourly_ah': int(g.loc[~g['_is_nh'], 'arrival_count'].sum()),
        }),
        include_groups=False,
    ).reset_index()

    merged = daily.merge(agg, on='date', how='left')
    merged[['hourly_total', 'hourly_nh', 'hourly_ah']] = merged[
        ['hourly_total', 'hourly_nh', 'hourly_ah']
    ].fillna(0).astype(int)

    # Keep the raw TOTALS-row value for audit/comparison
    merged['patient_count_totals_raw'] = merged['patient_count']

    # Compare and log
    diff = (merged['patient_count'] - merged['hourly_total'])
    n_equal = int((diff == 0).sum())
    n_daily_gt = int((diff > 0).sum())   # TOTALS > hourly (carry-overs or untimed rows)
    n_hourly_gt = int((diff < 0).sum())  # TOTALS < hourly (nursing arithmetic error)

    # ALWAYS redefine arrival fields from hourly (consistent semantics)
    merged['patient_count'] = merged['hourly_total']
    merged['arrival_normal_hours'] = merged['hourly_nh']
    merged['arrival_after_hours'] = merged['hourly_ah']
    merged['arrival_subtotal'] = merged['hourly_total']

    logger.info(f"  Redefined arrival fields from hourly extract (v2.1 consistent semantics)")
    logger.info(f"    Days where hourly == TOTALS:   {n_equal}")
    logger.info(f"    Days where TOTALS  > hourly:   {n_daily_gt}  (TOTALS inflated by carry-overs/untimed rows)")
    logger.info(f"    Days where TOTALS  < hourly:   {n_hourly_gt}  (TOTALS-row clerical error)")
    logger.info(f"  Total patient_count (hourly):    {int(merged['patient_count'].sum()):,}")
    logger.info(f"  Total TOTALS raw (old):          {int(merged['patient_count_totals_raw'].sum()):,}")

    return merged.drop(columns=['hourly_total', 'hourly_nh', 'hourly_ah'])


def clean_data(df: pd.DataFrame, logger) -> pd.DataFrame:
    """Clean the extracted data."""
    if df.empty:
        return df

    # Convert date
    df['date'] = pd.to_datetime(df['date'])

    # Get numeric columns (exclude non-numeric)
    exclude_cols = ['date', 'year', 'month', 'day', 'source_file']
    numeric_cols = [c for c in df.columns if c not in exclude_cols]

    # Fill NaN with 0 and fix negatives
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        df.loc[df[col] < 0, col] = 0

    # Create triage totals
    if all(c in df.columns for c in ['p1_normal_hours', 'p2_normal_hours', 'p3_normal_hours']):
        df['triage_nh_total'] = df['p1_normal_hours'] + df['p2_normal_hours'] + df['p3_normal_hours']

    if all(c in df.columns for c in ['p1_after_hours', 'p2_after_hours', 'p3_after_hours']):
        df['triage_ah_total'] = df['p1_after_hours'] + df['p2_after_hours'] + df['p3_after_hours']

    return df
