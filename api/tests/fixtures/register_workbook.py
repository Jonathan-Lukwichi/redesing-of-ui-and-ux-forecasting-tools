"""A synthetic Casualty Daily Register workbook, built in memory.

Laid out like the April 2023+ template (template "C"), with the header labels
copied from a real register's header rows. No real patient data: every patient
row carries the same fake identifiers, so a test can prove none of them leaves
the transformation.

Every day of the month gets a section (a row carrying the day number, then a
per-day TOTALS row), as in the real registers. Only the first ``days`` days carry
patient rows; the rest are empty sections whose TOTALS are zero.
"""
import calendar
import io
from datetime import datetime, time

from openpyxl import Workbook

FAKE_NAME = "ZZFAKENAME"
FAKE_HOSP_NUMBER = "ZZ123456"
FAKE_ID_NUMBER = "9001015009087"
FAKE_IDENTIFIERS = (FAKE_NAME, FAKE_HOSP_NUMBER, FAKE_ID_NUMBER)

NH_PER_DAY = 3          # normal-hours arrivals per day with patients
AH_PER_DAY = 2          # after-hours arrivals per day with patients
PATIENTS_PER_DAY = NH_PER_DAY + AH_PER_DAY
CARRY_OVER_PER_DAY = 2

HEADER_ROW0 = {
    12: "Attendent", 18: "Seperations", 25: "Carry Over", 26: "Priority",
    29: "Total", 30: "Priority", 33: "Total", 34: "Grand Total",
    35: "Specialities", 42: "Total Specialities", 98: "Age", 102: "Gender",
    193: "Mode of Transport",
}
HEADER_ROW1 = {
    0: "Date", 1: "Inpatients Midnight (Carry Over)", 2: "Pt Name & Surname",
    3: "Hosp Number", 4: "Episode Number", 5: "Death on Arrival",
    6: "Arrival Time", 10: "Sub Total", 12: "Attendant",
    13: "Internal Transfer In From Other Wards (Name of ward)", 14: "ITI Number",
    15: "External Transfer In from other Hospitals (Name of Hospital or Clinic)",
    16: "ETI Number", 17: "Sub Total", 18: "Discharges/RHT & Absconding",
    19: "Deaths (P4)", 20: "Internal Transfer Out To Other Wards (Name of ward)",
    21: "Internal Transfers Out to other Wards",
    22: "External Transfer Out To other Hospitals (Name of Hospital or Clinic)",
    23: "External Transfers Out to other Hospitals", 24: "Sub Total",
    26: "P1", 27: "P2", 28: "P3", 30: "P1", 31: "P2", 32: "P3",
    35: "Medicine", 36: "Orthopaedics", 37: "Surgery", 38: "Gynae",
    39: "Maternity", 40: "Paediatrics", 41: "Psychiatry",
    98: "0 - 5 years", 99: "5 - 12 years", 100: "12  + years",
    102: "Male", 103: "Female",
    # Template C clinical columns reach index 215, so the sheet is that wide.
    211: "TB", 212: "Malaria", 213: "Jaundice Adult", 214: "Measals", 215: "Meningitis",
}
HEADER_ROW2 = {
    6: "Normal Hours (07:00 - 15:59)", 7: "NH Total",
    8: "After Hours (16:00 - 06:59)", 9: "AH Total",
    26: "Normal Hours", 27: "Normal Hours", 28: "Normal Hours",
    30: "After Hours", 31: "After Hours", 32: "After Hours",
    193: "Car", 194: "Ambulance", 195: "Helicopter",
}

# Count columns each patient adds 1 to, and the per-day TOTALS row sums.
_EVERY_PATIENT = (10, 18, 24, 35, 100, 193)   # sub total, discharges, separations,
                                              # medicine, age 12+, car


def _patients(day):
    """(row dict, is_normal_hours) for each patient of a day with patients."""
    rows = []
    for k in range(PATIENTS_PER_DAY):
        normal = k < NH_PER_DAY
        row = {2: FAKE_NAME, 3: FAKE_HOSP_NUMBER, 4: FAKE_ID_NUMBER}
        if normal:
            row[6] = time(8 + k, 30)       # 08:30, 09:30, 10:30
            row[7] = 1
            row[27] = 1                    # P2 normal hours
        else:
            row[8] = time(17 + k, 15)      # 20:15, 21:15
            row[9] = 1
            row[31] = 1                    # P2 after hours
        for c in _EVERY_PATIENT:
            row[c] = 1
        row[102 if k % 2 == 0 else 103] = 1
        rows.append(row)
    if rows:
        rows[0][0] = day
    return rows


def _totals(patient_rows):
    totals = {c: 0 for c in (7, 9, 25, 27, 31, 102, 103) + _EVERY_PATIENT}
    for row in patient_rows:
        for c in totals:
            totals[c] += row.get(c, 0)
    totals[25] = CARRY_OVER_PER_DAY
    totals[0] = "TOTALS"
    return totals


def build_register(year, month, days=2):
    """Return the bytes of a synthetic register workbook for one month."""
    n_days = calendar.monthrange(year, month)[1]
    sections = []
    for day in range(1, n_days + 1):
        patients = _patients(day) if day <= days else [{0: day}]
        totals = _totals(patients if day <= days else [])
        sections.append(patients + [totals])

    monthly = {0: "TOTALS"}
    for section in sections:
        for c, v in section[-1].items():
            if c != 0:
                monthly[c] = monthly.get(c, 0) + v

    rows = [{0: datetime(year, month, 1), **HEADER_ROW0}, HEADER_ROW1, HEADER_ROW2, monthly]
    for section in sections:
        rows.extend(section)

    wb = Workbook()
    ws = wb.active
    for r, row in enumerate(rows, start=1):
        for c, value in row.items():
            ws.cell(row=r, column=c + 1, value=value)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
