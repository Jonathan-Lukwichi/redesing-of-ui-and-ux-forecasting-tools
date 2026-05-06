from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
import io
from typing import Dict, Any

router = APIRouter(prefix="/api/upload", tags=["upload"])

def _detect_date_col(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        low = col.lower()
        if any(k in low for k in ["date", "datetime", "timestamp", "time"]):
            try:
                pd.to_datetime(df[col].dropna().iloc[:3])
                return col
            except Exception:
                pass
    for col in df.columns:
        try:
            pd.to_datetime(df[col].dropna().iloc[:3])
            return col
        except Exception:
            pass
    return None

def _detect_arrivals_col(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        low = col.lower()
        if any(k in low for k in ["arrival", "patient", "ed", "count", "visit", "admit", "total"]):
            if pd.api.types.is_numeric_dtype(df[col]):
                return col
    # fallback: first numeric column that isn't the date
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            return col
    return None


@router.post("/patient")
async def upload_patient_data(file: UploadFile = File(...)) -> Dict[str, Any]:
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Could not parse CSV: {e}")

    date_col = _detect_date_col(df)
    arr_col  = _detect_arrivals_col(df)

    if not date_col or not arr_col:
        raise HTTPException(400, "Could not detect date or arrivals column. "
                               "Ensure your CSV has a date column and a numeric arrivals column.")

    df[date_col] = pd.to_datetime(df[date_col])
    df = df.sort_values(date_col).dropna(subset=[date_col, arr_col])
    df[arr_col]  = pd.to_numeric(df[arr_col], errors="coerce").fillna(0)

    records = df[[date_col, arr_col]].rename(
        columns={date_col: "date", arr_col: "arrivals"}
    )
    records["date"] = records["date"].dt.strftime("%Y-%m-%d")

    return {
        "success":   True,
        "rows":      len(records),
        "date_col":  date_col,
        "arr_col":   arr_col,
        "date_range": {
            "start": records["date"].iloc[0],
            "end":   records["date"].iloc[-1],
        },
        "preview":   records.tail(10).to_dict(orient="records"),
        "data":      records.to_dict(orient="records"),
    }


@router.post("/inventory")
async def upload_inventory_data(file: UploadFile = File(...)) -> Dict[str, Any]:
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Could not parse CSV: {e}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    return {
        "success": True,
        "rows":    len(df),
        "columns": list(df.columns),
        "preview": df.head(10).to_dict(orient="records"),
        "data":    df.to_dict(orient="records"),
    }
