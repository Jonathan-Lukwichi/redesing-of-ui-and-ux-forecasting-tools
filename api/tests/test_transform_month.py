"""The monthly register transformation, ported into core/transform (Task 5).

Runs on a synthetic workbook carrying fake identifiers: no real register is
read here. The equivalence proof against the offline pipeline's pure CSVs is
the gated golden test of Task 6.
"""
import logging

import pandas as pd
import pytest

from core.transform import TransformError, clinical, month, reader
from core.transform.month import MonthTables, transform_month
from tests.fixtures.register_workbook import (
    AH_PER_DAY, FAKE_IDENTIFIERS, FAKE_NAME, NH_PER_DAY, PATIENTS_PER_DAY,
    build_register,
)

NAME = "Casualty_Daily_Register_2024_03.xlsx"


@pytest.fixture(scope="module")
def march():
    return build_register(2024, 3, days=2)


def test_parse_filename_ok():
    assert reader.parse_filename(NAME) == (2024, 3)


def test_parse_filename_rejects_others():
    with pytest.raises(TransformError) as e:
        reader.parse_filename("Dec-24.xlsx")
    assert "Casualty_Daily_Register_YYYY_MM.xlsx" in e.value.public_message


def test_skip_template_month_is_rejected():
    with pytest.raises(TransformError) as e:
        reader.parse_filename("Casualty_Daily_Register_2019_04.xlsx")
    assert "skipped template" in e.value.public_message


def test_transform_month_counts(march):
    out = transform_month(march, NAME)
    assert isinstance(out, MonthTables)
    assert (out.year, out.month) == (2024, 3)
    assert len(out.daily) == 31
    daily = out.daily.set_index("day")
    assert daily.loc[1, "patient_count"] == PATIENTS_PER_DAY
    assert daily.loc[2, "patient_count"] == PATIENTS_PER_DAY
    assert daily.loc[3:, "patient_count"].sum() == 0
    assert daily.loc[1, "arrival_normal_hours"] == NH_PER_DAY
    assert daily.loc[1, "arrival_after_hours"] == AH_PER_DAY
    assert daily.loc[1, "patient_count_totals_raw"] == PATIENTS_PER_DAY
    assert len(out.hourly) == 31 * 24
    assert out.hourly["arrival_count"].sum() == 2 * PATIENTS_PER_DAY
    assert len(out.clinical) == 31
    assert out.clinical.set_index("day").loc[1, "spec_medicine"] == PATIENTS_PER_DAY
    assert len(out.sha256) == 64
    assert out.receipt["arrivals"] == 2 * PATIENTS_PER_DAY


def _all_text(out):
    frames = (out.daily, out.hourly, out.clinical)
    return "".join(f.to_csv(index=False) for f in frames) + repr(out.receipt)


def test_no_identifier_leaves_the_transform(march, caplog):
    caplog.set_level(logging.DEBUG)
    out = transform_month(march, NAME)
    text = _all_text(out)
    logs = "".join(r.getMessage() + str(r.exc_text or "") for r in caplog.records)
    for ident in FAKE_IDENTIFIERS:
        assert ident not in text
        assert ident not in logs
    # The only text column that leaves is the file name.
    for frame in (out.daily, out.hourly, out.clinical):
        text_cols = [c for c in frame.columns
                     if frame[c].map(lambda v: isinstance(v, str)).any()]
        assert text_cols == ["source_file"]
        assert set(frame["source_file"]) == {NAME}


def _assert_clean_failure(err, *forbidden):
    msg = err.public_message
    assert str(err) == msg
    for text in forbidden:
        assert text not in msg
    assert err.__cause__ is None
    assert err.__context__ is None


def test_corrupt_file_fails_cleanly(caplog):
    caplog.set_level(logging.DEBUG)
    with pytest.raises(TransformError) as e:
        transform_month(b"not a workbook", NAME)
    _assert_clean_failure(e.value, "not a workbook")
    assert NAME in e.value.public_message


def _headerless_workbook():
    import io
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    for r in range(1, 8):
        ws.cell(row=r, column=1, value=FAKE_NAME)
        ws.cell(row=r, column=3, value=FAKE_NAME)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_valid_xlsx_unknown_layout_fails_cleanly(caplog):
    caplog.set_level(logging.DEBUG)
    with pytest.raises(TransformError) as e:
        transform_month(_headerless_workbook(), NAME)
    _assert_clean_failure(e.value, FAKE_NAME)
    logs = "".join(r.getMessage() + str(r.exc_text or "") for r in caplog.records)
    assert FAKE_NAME not in logs


def test_failed_clinical_extraction_fails_the_month(march, monkeypatch):
    def boom(*a, **k):
        raise ValueError(f"cell said {FAKE_NAME}")

    monkeypatch.setattr(clinical, "extract_clinical_data", boom)
    with pytest.raises(TransformError) as e:
        transform_month(march, NAME)
    _assert_clean_failure(e.value, FAKE_NAME)
    assert "clinical" in e.value.public_message


def test_empty_clinical_extraction_fails_the_month(march, monkeypatch):
    monkeypatch.setattr(clinical, "extract_clinical_data", lambda *a, **k: pd.DataFrame())
    with pytest.raises(TransformError):
        transform_month(march, NAME)


def test_each_workbook_is_read_once(march, monkeypatch):
    calls = []
    real = pd.read_excel

    def counting(*a, **k):
        calls.append(1)
        return real(*a, **k)

    monkeypatch.setattr(pd, "read_excel", counting)
    transform_month(march, NAME)
    assert len(calls) == 1
