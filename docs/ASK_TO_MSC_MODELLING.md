# Request to `msc-modelling`: `feature_builder.py` for live forecast integration

**Webapp integration status**: handover-package consumer in
[redesing-of-ui-and-ux-forecasting-tools](https://github.com/Jonathan-Lukwichi/redesing-of-ui-and-ux-forecasting-tools).
Submodule mounted at `api/external/msc-modelling`, pinned to branch
`claude/review-dissertation-repos-UQtqT`.

What's already live in the webapp:

| Surface | Status |
|---|---|
| Submodule + handover artefacts (.pkl, cards, metrics, catalogue) | ✅ in place |
| `GET /api/task1/models`  | ✅ wired, returns 6 ModelSummary |
| `GET /api/task1/metrics` | ✅ per-horizon per-model |
| `GET /api/task2/specialties` | ✅ catalogue + filtered models per specialty |
| `GET /api/task2/metrics` | ✅ flat headline metrics |
| Task 1 UI (`/forecasting/total-ed`) — model picker, badges, horizon, About panel | ✅ rendered against real data |
| Task 2 UI (`/forecasting/specialty`) — specialty picker, filtered models, dynamic weekly/daily horizons | ✅ rendered against real data |
| `POST /api/task1/forecast` and `POST /api/task2/forecast` | ⏳ stubbed 501 — feature pipeline pending |

## The blocker

The inference helpers shipped in the handover (`task1_daily_arrivals/inference/forecast.py`
and `task2_specialties/inference/forecast.py`) require:

- **`exog_future`**: the §5.2.5 raw-10 exogenous matrix indexed by **future**
  dates. Needed by Stat 2 / Hybrid 1 / Hybrid 2 (SARIMAX base).
- **`feature_future`**: the engineered + consensus feature matrix indexed by
  **future** dates. Needed by ML 1 / ML 2 (XGBoost / ANN).

Only **Stat 1** (univariate pmdarima ARIMA) doesn't need either.

Without these matrices, calling `forecast()` raises `ValueError: ... requires
exog_future / feature_future` and the prediction can't run.

## What we need

A `feature_builder.py` module in the handover package (or as a sibling repo
function) that exposes:

```python
def build_exog_future(
    start_date: str | pd.Timestamp,
    n_periods: int,
    *,
    calendar_df: pd.DataFrame | None = None,
    weather_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Return the raw-10 exogenous matrix for the requested forward window,
    in the exact column order and scale used during training. The webapp can
    supply calendar_df and weather_df from its operational pipeline (G1)."""
    ...

def build_feature_future(
    start_date: str | pd.Timestamp,
    n_periods: int,
    *,
    history_df: pd.DataFrame,  # past daily arrivals (for lag / rolling features)
    calendar_df: pd.DataFrame | None = None,
    weather_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Return the engineered + consensus feature matrix for the forward
    window, matching `feature_names` of each ML / Hybrid bundle."""
    ...
```

Equivalent helpers per specialty in `task2_specialties/inference/`.

## Notes for the modeling team

- The webapp has G1 (daily totals + merged calendar + weather) available — it
  can pass these in as DataFrames or as paths. Preference is up to you.
- We do **not** need `exog_future` / `feature_future` to be generated inside
  the webapp using copy-pasted training logic. That guarantees drift between
  training and inference feature definitions. The single source of truth has
  to live in `msc-modelling`.
- Once we have `feature_builder.py`, the webapp's `POST /api/task[12]/forecast`
  endpoint will:
  1. Pull G1 from `prepare_registry`.
  2. Call `build_exog_future` / `build_feature_future` for the requested
     horizon.
  3. `load_model(alias)` → `forecast(...)`.
  4. Return the spec's `ForecastResponse`.
- A second Python venv (`api/.venv-handover`) will host the inference deps
  (`pmdarima>=2`, `xgboost>=2`, `torch>=2`, `numpy<2`) so they don't conflict
  with the webapp's numpy 2.x / pandas 3.x stack. Inference runs as a
  short-lived subprocess.

## Stretch ask (lower priority)

- A `cv_folds.json` for Task 1 (referenced in handover README but not shipped
  in the current branch).
- Per-specialty `card.json` for the weekly specialties — Maternity and
  Psychiatry currently have catalogue entries but no readable card; the About
  panel falls back gracefully but a real description would help.
