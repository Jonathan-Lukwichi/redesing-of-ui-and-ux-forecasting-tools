"""Daily clinical reason-of-visit aggregates for one month.

Copied from healthforecast_pipeline/scripts/extract_clinical_reasons.py (v2,
audited). Changes from the source, and only these:
  - extract_clinical_data takes (sheet, year, month, label, logger) instead of
    a path, and does not read the file itself;
  - its error log no longer embeds the exception message or a traceback, which
    could carry a register cell value; the exception type name is logged.
Only aggregate counts leave this module: no names, no IDs.
"""
import calendar
from datetime import datetime

import pandas as pd

# =============================================================================
# TEMPLATE VERSION DETECTION
# =============================================================================
# The hospital changed its Excel template over time. We detect the version
# by checking key header cells (row index 1).
#
# Version A (2019): col 5 = "Arrival Time", col 31 = "Medicine"
# Version B (2021-Mar2023): col 5 = "Arrival Time", col 33 = "Medicine"
# Version C (Apr2023+): col 5 = "Death on Arrival", col 35 = "Medicine"

def detect_template_version(df):
    """Detect which template version a file uses based on header row."""
    col5 = str(df.iloc[1, 5]).strip() if pd.notna(df.iloc[1, 5]) else ""

    if "Death" in col5:
        return "C"  # Apr 2023+ (new format)

    # Old format — distinguish A_EARLY vs A vs B by where Medicine is
    def _h(c):
        return str(df.iloc[1, c]).strip() if c < len(df.columns) and pd.notna(df.iloc[1, c]) else ""
    col26, col31, col33 = _h(26), _h(31), _h(33)

    if "Medicine" in col26 and "Nucleur" not in col26:
        # June 2019 variant: no separate NH/AH P1-P3 columns, everything shifted -5
        return "A_EARLY"
    if "Medicine" in col31:
        return "A"  # Standard 2019 format (May, Jul, Aug, ...)
    if "Medicine" in col33:
        return "B"  # 2021-Mar2023 format
    return "B"      # Default to B if unclear


# =============================================================================
# COLUMN MAPPINGS PER TEMPLATE VERSION
# =============================================================================
# Each mapping: variable_name -> column_index
# Only includes clinical reason-of-visit columns

def _shift(mapping, offset):
    """Shift every column index in a mapping by a fixed offset."""
    out = {}
    for k, v in mapping.items():
        if isinstance(v, list):
            out[k] = [c + offset for c in v]
        else:
            out[k] = v + offset
    return out


MAPPING_A = {  # 2019 format (May 2019 - ~2020)
    # Specialties
    "spec_medicine": 31, "spec_orthopaedics": 34, "spec_surgery": 36,
    "spec_gynae": 39, "spec_maternity": 40, "spec_paediatrics": 41, "spec_psychiatry": 44,
    # Demographics
    "age_0_5": 92, "age_5_12": 93, "age_12_plus": 94,
    "gender_male": 96, "gender_female": 97,
    # Accidents
    "accident_mva": 108, "accident_pva": 109, "accident_train": 110, "accident_mba": 111,
    # Violence (old format uses race breakdown: Black/Coloured/White — we sum all)
    "gunshot_all": [116, 117, 118],  # Black + Coloured + White
    "human_bite_all": [119, 120, 121],
    "common_assault_all": [122, 123, 124],
    "stab_wound_all": [125, 126, 127],
    # Animal bites
    "bee_sting": 128, "insect_bite": 129, "snake_bite": 130,
    "spider_bite": 131, "scorpion_bite": 132, "dog_bite": 133,
    # Substance abuse
    "substance_heroin": 134, "substance_tablets": 135, "substance_nyaope": 136,
    "substance_flakka": 137, "substance_unknown": 138,
    "poisoning_accidental": 139, "poisoning_malicious": 140,
    # Transport
    "transport_car": 156, "transport_ambulance": 157, "transport_helicopter": 158,
    # Occupational
    "needle_prick": 159, "blood_splash": 160, "body_fluid_exposure": 161,
    # Gynae / Surgical
    "gynae_emergency": 165, "ectopic_pregnancy": 166, "miscarriage": 167, "vaginal_bleeding": 168,
    "blocked_catheter": 169, "peg_tube_out": 170, "vp_shunt_blocked": 171,
    "to_theatre": 172, "from_theatre": 173,
    # Infectious disease
    "tb": 174, "malaria": 175, "jaundice_adult": 176, "measles": 177, "meningitis": 178,
}

MAPPING_A_EARLY = _shift(MAPPING_A, -5)  # June 2019 variant (no NH/AH P-split; everything shifted -5)

MAPPING_B = {  # 2021-Mar2023 format
    # Specialties
    "spec_medicine": 33, "spec_orthopaedics": 36, "spec_surgery": 38,
    "spec_gynae": 41, "spec_maternity": 42, "spec_paediatrics": 43, "spec_psychiatry": 46,
    # Demographics
    "age_0_5": 94, "age_5_12": 95, "age_12_plus": 96,
    "gender_male": 98, "gender_female": 99,
    # Accidents
    "accident_mva": 110, "accident_pva": 111, "accident_train": 112, "accident_mba": 113,
    # Violence (race breakdown — sum all)
    "gunshot_all": [118, 119, 120],
    "sexual_assault_all": [121, 122, 123],
    "domestic_violence_all": [124, 125, 126],
    "human_bite_all": [127, 128, 129],
    "common_assault_all": [130, 131, 132],
    "stab_wound_all": [133, 134, 135],
    "mob_justice_all": [136, 137, 138],
    # Animal bites
    "bee_sting": 139, "insect_bite": 140, "snake_bite": 141,
    "spider_bite": 142, "scorpion_bite": 143, "dog_bite": 144,
    # Substance abuse
    "substance_heroin": 145, "substance_tablets": 146, "substance_nyaope": 147,
    "substance_flakka": 148, "substance_unknown": 149,
    "poisoning_accidental": 150, "poisoning_malicious": 151,
    # Transport
    "transport_car": 167, "transport_ambulance": 168, "transport_helicopter": 169,
    # Occupational
    "needle_prick": 170, "blood_splash": 171, "body_fluid_exposure": 172,
    # Gynae / Surgical
    "gynae_emergency": 176, "ectopic_pregnancy": 177, "miscarriage": 178, "vaginal_bleeding": 179,
    "blocked_catheter": 180, "peg_tube_out": 181, "vp_shunt_blocked": 182,
    "to_theatre": 183, "from_theatre": 184,
    # Infectious disease
    "tb": 185, "malaria": 186, "jaundice_adult": 187, "measles": 188, "meningitis": 189,
}

MAPPING_C = {  # Apr 2023+ format (new)
    # Death on arrival
    "death_on_arrival": 5,
    # Specialties
    "spec_medicine": 35, "spec_orthopaedics": 36, "spec_surgery": 37,
    "spec_gynae": 38, "spec_maternity": 39, "spec_paediatrics": 40, "spec_psychiatry": 41,
    # Demographics
    "age_0_5": 98, "age_5_12": 99, "age_12_plus": 100,
    "gender_male": 102, "gender_female": 103,
    # Accidents
    "accident_mva": 118, "accident_pva": 119, "accident_train": 120, "accident_mba": 121,
    # Violence (gender breakdown: Male/Female/Child)
    "gunshot_male": 122, "gunshot_female": 123, "gunshot_child": 124,
    "sexual_assault_male": 125, "sexual_assault_female": 126, "sexual_assault_child": 127,
    "domestic_violence_male": 128, "domestic_violence_female": 129, "domestic_violence_child": 130,
    "human_bite_male": 131, "human_bite_female": 132, "human_bite_child": 133,
    "common_assault_male": 134, "common_assault_female": 135, "common_assault_child": 136,
    "stab_wound_male": 137, "stab_wound_female": 138, "stab_wound_child": 139,
    "falls_male": 140, "falls_female": 141, "falls_child": 142,
    "mob_justice_male": 143, "mob_justice_female": 144, "mob_justice_child": 145,
    # Health screening
    "hypertension_screen_45plus": 146, "hypertension_screen_18_44": 147,
    "hypertension_requiring_treatment": 148,
    "diabetes_screen_18_44": 149, "diabetes_screen_45plus": 150,
    # Mental health
    "suicide_attempt_18plus": 153, "suicide_attempt_under18": 154,
    # Obstetric
    "born_alive_before_arrival": 155, "maternal_death_in_facility": 156,
    "sexual_assault_case_seen": 157, "sexual_assault_pep_issued": 158,
    # Animal bites
    "bee_sting": 162, "insect_bite": 163, "snake_bite": 164,
    "spider_bite": 165, "scorpion_bite": 166, "dog_bite": 167,
    # Substance abuse
    "substance_heroin": 168, "substance_tablets": 169, "substance_nyaope": 170,
    "substance_flakka": 171, "substance_unknown": 172,
    "poisoning_accidental": 173, "poisoning_malicious": 174,
    # Transport
    "transport_car": 193, "transport_ambulance": 194, "transport_helicopter": 195,
    # Occupational
    "needle_prick": 196, "blood_splash": 197, "body_fluid_exposure": 198,
    # Gynae / Surgical
    "gynae_emergency": 202, "ectopic_pregnancy": 203, "miscarriage": 204, "vaginal_bleeding": 205,
    "blocked_catheter": 206, "peg_tube_out": 207, "vp_shunt_blocked": 208,
    "to_theatre": 209, "from_theatre": 210,
    # Infectious disease
    "tb": 211, "malaria": 212, "jaundice_adult": 213, "measles": 214, "meningitis": 215,
}

# Unified output columns — all possible fields (missing ones filled with 0)
ALL_CLINICAL_FIELDS = sorted(set(
    [k for k in MAPPING_A if not isinstance(MAPPING_A[k], list)] +
    [k for k in MAPPING_B if not isinstance(MAPPING_B[k], list)] +
    [k for k in MAPPING_C if not isinstance(MAPPING_C[k], list)] +
    # Aggregated violence fields (from old format race-based -> unified names)
    ["gunshot_all", "sexual_assault_all", "domestic_violence_all",
     "human_bite_all", "common_assault_all", "stab_wound_all", "mob_justice_all",
     "falls_all"]
))


def extract_column(day_data, col_spec, max_col):
    """Extract and sum a column or list of columns (for race-aggregated fields)."""
    if isinstance(col_spec, list):
        total = 0
        for idx in col_spec:
            if idx < max_col:
                vals = pd.to_numeric(day_data.iloc[:, idx], errors='coerce')
                total += int(vals.sum()) if not vals.isna().all() else 0
        return total
    else:
        if col_spec < max_col:
            vals = pd.to_numeric(day_data.iloc[:, col_spec], errors='coerce')
            return int(vals.sum()) if not vals.isna().all() else 0
        return 0


def extract_clinical_data(sheet, year, month, label, logger):
    """Extract daily clinical aggregates from one Excel file."""
    filename = label

    try:
        df = sheet

        # Detect template version
        version = detect_template_version(df)
        if version == "A_EARLY":
            mapping = MAPPING_A_EARLY
        elif version == "A":
            mapping = MAPPING_A
        elif version == "B":
            mapping = MAPPING_B
        else:
            mapping = MAPPING_C

        logger.info("    Template version: {} ({} clinical columns)".format(version, len(mapping)))

        # Find TOTALS row
        totals_idx = None
        for idx in range(min(10, len(df))):
            if str(df.iloc[idx, 0]).strip().upper() == 'TOTALS':
                totals_idx = idx
                break

        if totals_idx is None:
            logger.warning("  TOTALS row not found in: {}".format(filename))
            return pd.DataFrame()

        data_start_idx = totals_idx + 1
        if data_start_idx >= len(df):
            return pd.DataFrame()

        patient_df = df.iloc[data_start_idx:].copy()
        patient_df.reset_index(drop=True, inplace=True)

        # Forward-fill day numbers
        patient_df[0] = pd.to_numeric(patient_df[0], errors='coerce')
        patient_df[0] = patient_df[0].ffill()
        patient_df = patient_df.dropna(subset=[0])
        patient_df[0] = patient_df[0].astype(int)

        days_in_month = calendar.monthrange(year, month)[1]
        max_col = len(patient_df.columns)

        # Determine which columns to use for subtotal row detection
        # Specialties + demographics columns are good indicators
        if version == "C":
            detect_cols = [35, 36, 37, 38, 39, 40, 41, 98, 99, 100, 102, 103]
        elif version == "B":
            detect_cols = [33, 36, 38, 41, 42, 43, 46, 94, 95, 96, 98, 99]
        elif version == "A_EARLY":  # June 2019: standard A detect_cols shifted -5
            detect_cols = [26, 29, 31, 34, 35, 36, 39, 87, 88, 89, 91, 92]
        else:  # A
            detect_cols = [31, 34, 36, 39, 40, 41, 44, 92, 93, 94, 96, 97]

        daily_records = []
        for day in range(1, days_in_month + 1):
            day_data = patient_df[patient_df[0] == day]

            record = {
                'date': datetime(year, month, day),
                'year': year,
                'month': month,
                'day': day,
                'source_file': filename,
            }

            if len(day_data) == 0:
                for field_name in mapping:
                    record[field_name] = 0
            else:
                # FIX: Find the daily subtotal row by detecting the row with
                # high sum across clinical indicator columns (> 10).
                # Individual patient rows have NaN/0/1 in these columns;
                # subtotal rows have aggregated counts (typically > 50).
                subtotal_row = None
                for i in range(len(day_data)):
                    row = day_data.iloc[i]
                    csum = 0
                    for c in detect_cols:
                        if c < max_col:
                            v = pd.to_numeric(row.iloc[c], errors='coerce')
                            if pd.notna(v):
                                csum += abs(v)
                    if csum > 10:
                        subtotal_row = day_data.iloc[i:i+1]
                        break

                if subtotal_row is not None:
                    # Use the subtotal row directly (most accurate)
                    for field_name, col_spec in mapping.items():
                        record[field_name] = extract_column(subtotal_row, col_spec, max_col)
                else:
                    # No subtotal row found — sum all patient rows
                    for field_name, col_spec in mapping.items():
                        record[field_name] = extract_column(day_data, col_spec, max_col)

            daily_records.append(record)

        return pd.DataFrame(daily_records)

    except Exception as e:
        logger.error("  Error extracting {}: {}".format(filename, type(e).__name__))
        return pd.DataFrame()


# =============================================================================
# UNIFY VIOLENCE COLUMNS ACROSS VERSIONS
# =============================================================================

def unify_violence_columns(df):
    """
    Old format (A/B) has race-based violence columns (gunshot_all, etc.)
    New format (C) has gender-based columns (gunshot_male/female/child).
    Create unified 'total' columns that work across all versions.
    """
    violence_types = ['gunshot', 'sexual_assault', 'domestic_violence', 'human_bite',
                      'common_assault', 'stab_wound', 'mob_justice', 'falls']

    for vtype in violence_types:
        all_col = "{}_all".format(vtype)
        male_col = "{}_male".format(vtype)
        female_col = "{}_female".format(vtype)
        child_col = "{}_child".format(vtype)

        # Ensure all columns exist (fill missing with 0)
        for c in [all_col, male_col, female_col, child_col]:
            if c not in df.columns:
                df[c] = 0

        # Unified total: use _all if non-zero (old format), else sum male+female+child (new format)
        df["total_{}".format(vtype)] = df.apply(
            lambda row: row[all_col] if row[all_col] > 0
            else row.get(male_col, 0) + row.get(female_col, 0) + row.get(child_col, 0),
            axis=1
        )

    return df


# =============================================================================
# AGGREGATE COLUMNS
# =============================================================================

def add_aggregate_columns(df):
    """Add useful aggregate totals."""
    # Total accidents
    acc_cols = ['accident_mva', 'accident_pva', 'accident_train', 'accident_mba']
    df['total_accidents'] = df[[c for c in acc_cols if c in df.columns]].fillna(0).sum(axis=1).astype(int)

    # Total substance abuse
    sub_cols = ['substance_heroin', 'substance_tablets', 'substance_nyaope',
                'substance_flakka', 'substance_unknown']
    df['total_substance_abuse'] = df[[c for c in sub_cols if c in df.columns]].fillna(0).sum(axis=1).astype(int)

    # Total animal bites
    bite_cols = ['bee_sting', 'insect_bite', 'snake_bite', 'spider_bite',
                 'scorpion_bite', 'dog_bite']
    df['total_animal_bites'] = df[[c for c in bite_cols if c in df.columns]].fillna(0).sum(axis=1).astype(int)

    # Total poisoning
    df['total_poisoning'] = df[['poisoning_accidental', 'poisoning_malicious']].fillna(0).sum(axis=1).astype(int)

    # Total infectious disease
    inf_cols = ['tb', 'malaria', 'jaundice_adult', 'measles', 'meningitis']
    df['total_infectious_disease'] = df[[c for c in inf_cols if c in df.columns]].fillna(0).sum(axis=1).astype(int)

    # Total violence (from unified columns)
    violence_totals = [c for c in df.columns if c.startswith('total_') and any(
        v in c for v in ['gunshot', 'sexual_assault', 'domestic_violence', 'human_bite',
                         'common_assault', 'stab_wound', 'mob_justice'])]
    if violence_totals:
        df['total_violence'] = df[violence_totals].fillna(0).sum(axis=1).astype(int)

    # Total falls
    if 'total_falls' in df.columns:
        pass  # Already created by unify
    else:
        df['total_falls'] = 0

    # Total trauma
    df['total_trauma'] = df[['total_accidents', 'total_violence', 'total_falls']].fillna(0).sum(axis=1).astype(int)

    # Total suicide attempts
    sui_cols = ['suicide_attempt_18plus', 'suicide_attempt_under18']
    df['total_suicide_attempts'] = df[[c for c in sui_cols if c in df.columns]].fillna(0).sum(axis=1).astype(int)

    # Total gynae
    gyn_cols = ['gynae_emergency', 'ectopic_pregnancy', 'miscarriage', 'vaginal_bleeding']
    df['total_gynae'] = df[[c for c in gyn_cols if c in df.columns]].fillna(0).sum(axis=1).astype(int)

    return df
