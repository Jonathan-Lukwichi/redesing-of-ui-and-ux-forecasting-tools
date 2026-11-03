"""Proof of equivalence: the port against the offline pipeline's pure CSVs.

Gated: runs only when RAW_REGISTER_DIR (the Casualty_Daily_Register_Dataset
folder) and PURE_DIR (output/pure) are set. Raw registers are never committed.

RAW_GOLDEN_MONTHS picks the files: a comma list of YYYY_MM, by default one
month per template era, or "all" for every register in the folder. Each file
goes through transform_month, the months are assembled together, and every
month of every table must equal that month of the matching pure CSV: same
columns in the same order, same rows, equal values. A register month absent
from the pure files must be rejected by the port too, as the source rejected
it (the 2019_04 empty template). With "all", every pure month must be covered.

This run is also the proof that the python-calamine reader reads every
register correctly: the offline pipeline read them with openpyxl, so tables
equal to its output, month by month, mean calamine's grid gave the same
extraction on every file checked.

Output names only months, tables, column names and counts; no cell of a raw
register is printed. Run with -s to see the per-month, per-table lines.
"""
import os
import time
from pathlib import Path

import pandas as pd
import pytest

from core.transform import TransformError
from core.transform.assemble import assemble
from core.transform.month import transform_month

RAW_DIR = os.getenv("RAW_REGISTER_DIR")
PURE_DIR = os.getenv("PURE_DIR")
DEFAULT_MONTHS = "2019_06,2021_03,2023_04,2026_01"

PURE_FILES = {
    "daily_arrival": "pure_daily_arrival.csv",
    "hourly_arrival": "pure_hourly_arrival.csv",
    "clinical_daily": "pure_clinical_arrival.csv",
    "clinical_hourly": "pure_hourly_clinical_arrival.csv",
}


def _register_files() -> list[Path]:
    wanted = os.getenv("RAW_GOLDEN_MONTHS", DEFAULT_MONTHS).strip()
    raw_dir = Path(RAW_DIR)
    if wanted.lower() == "all":
        return sorted(raw_dir.glob("Casualty_Daily_Register_*.xlsx"))
    return [raw_dir / f"Casualty_Daily_Register_{ym.strip()}.xlsx"
            for ym in wanted.split(",") if ym.strip()]


def _month_rows(df: pd.DataFrame, ym: str) -> pd.DataFrame:
    return df[df["date"].astype(str).str.startswith(ym)].reset_index(drop=True)


def _compare(got: pd.DataFrame, exp: pd.DataFrame) -> str:
    """'OK', or why the month differs: column names and counts only."""
    if list(got.columns) != list(exp.columns):
        missing = [c for c in exp.columns if c not in got.columns]
        extra = [c for c in got.columns if c not in exp.columns]
        if not missing and not extra:
            return "same columns in a different order"
        return f"columns differ: missing {missing}, extra {extra}"
    keys = ["date", "hour"] if "hour" in exp.columns else ["date"]
    if len(got) != len(exp):
        return f"{len(got)} rows, expected {len(exp)}"
    if not got[keys].astype(str).equals(exp[keys].astype(str)):
        return f"rows differ in {keys}"
    bad = {}
    for col in exp.columns:
        if col in keys:
            continue
        n = int((pd.to_numeric(got[col]).to_numpy() != pd.to_numeric(exp[col]).to_numpy()).sum())
        if n:
            bad[col] = n
    if bad:
        cols = sorted(bad, key=bad.get, reverse=True)
        return (f"{sum(bad.values())} cells differ in {len(bad)} columns, "
                f"most in: {', '.join(f'{c} ({bad[c]})' for c in cols[:8])}")
    return "OK"


@pytest.mark.skipif(not RAW_DIR or not PURE_DIR,
                    reason="needs raw files: set RAW_REGISTER_DIR and PURE_DIR")
def test_month_matches_pure_output():
    start = time.perf_counter()
    expected = {k: pd.read_csv(Path(PURE_DIR) / f) for k, f in PURE_FILES.items()}
    pure_months = set(expected["daily_arrival"]["date"].astype(str).str[:7])

    files = _register_files()
    assert files, "no register files selected"
    lines, problems, months = [], [], []

    for path in files:
        ym = path.stem[-7:]                       # YYYY_MM
        key = ym.replace("_", "-")
        if not path.exists():
            problems.append(f"{ym}: register file not found")
            continue
        raw = path.read_bytes()
        t0 = time.perf_counter()
        try:
            mt = transform_month(raw, path.name)
        except TransformError as e:
            if key in pure_months:
                problems.append(f"{ym}: port rejected it: {e.public_message}")
            else:
                lines.append(f"{ym}: rejected, as the source did")
            continue
        finally:
            del raw
        secs = time.perf_counter() - t0
        if key not in pure_months:
            problems.append(f"{ym}: port kept a month the source rejected")
            continue
        if mt.clinical.empty:
            problems.append(f"{ym}: clinical extract is empty")
        months.append((ym, key, mt, secs))

    if os.getenv("RAW_GOLDEN_MONTHS", "").strip().lower() == "all":
        covered = {key for _, key, _, _ in months}
        for key in sorted(pure_months - covered):
            problems.append(f"{key}: in the pure files but no register produced it")

    if months:
        got = assemble([mt for _, _, mt, _ in months])
        for ym, key, mt, secs in months:
            results = {t: _compare(_month_rows(got[t], key), _month_rows(expected[t], key))
                       for t in PURE_FILES}
            lines.append(f"{ym} ({secs:.1f}s): " + " | ".join(
                f"{t} {r}" for t, r in results.items()))
            problems += [f"{ym} {t}: {r}" for t, r in results.items() if r != "OK"]

    total = time.perf_counter() - start
    lines.append(f"{len(files)} files, {len(months)} months compared, "
                 f"{len(problems)} problems, {total:.0f}s total")
    print("\n" + "\n".join(lines), flush=True)
    assert not problems, "\n".join(problems + ["", "Per month:"] + lines)
