import gc
from pathlib import Path

import orjson
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()


class NumpyJSONResponse(ORJSONResponse):
    """orjson with native numpy support — float32/int32 registry dtypes
    serialize everywhere without per-endpoint casting."""
    def render(self, content) -> bytes:
        return orjson.dumps(content, option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS)

# In production (Docker) the built frontend is copied to api/static and served
# by this same process — one service, same origin, no CORS. In dev the folder
# doesn't exist and Vite serves the frontend on :5173 as before.
_STATIC_DIR = Path(__file__).resolve().parent / "static"
_SERVE_FRONTEND = _STATIC_DIR.is_dir()

from routers import forecast, staff, supply, kpis, upload, actions, datasets, prepare, explore, task1, task2, ai, optimization, reports

app = FastAPI(
    title="HealthForecast AI — Backend API",
    description="Forecasting, staff scheduling, and supply optimization for hospital operations.",
    version="1.0.0",
    default_response_class=NumpyJSONResponse,
)


# Heavy endpoints train models / run Monte-Carlo sims that allocate large
# temporaries; collect right after so the 512MB instance stays under its cap.
_HEAVY_PREFIXES = (
    "/api/forecast", "/api/optimization", "/api/supply/compare",
    "/api/supply/sweep", "/api/staff/strategy", "/api/task1", "/api/task2",
)


@app.middleware("http")
async def _trim_after_heavy(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(_HEAVY_PREFIXES):
        gc.collect()
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast.router)
app.include_router(staff.router)
app.include_router(supply.router)
app.include_router(kpis.router)
app.include_router(upload.router)
app.include_router(actions.router)
app.include_router(datasets.router)
app.include_router(prepare.router)
app.include_router(explore.router)
app.include_router(task1.router)
app.include_router(task2.router)
app.include_router(ai.router)
app.include_router(optimization.router)
app.include_router(reports.router)


@app.on_event("startup")
async def _bootstrap_groups() -> None:
    """Best-effort: build the live G1 forecast group in the background so the
    Forecast and Optimization pages share the same real data on first load."""
    import asyncio
    from core import bootstrap
    asyncio.create_task(bootstrap.ensure_g1())


@app.get("/")
def root():
    if _SERVE_FRONTEND:
        return FileResponse(_STATIC_DIR / "index.html")
    return {
        "status": "running",
        "docs":   "/docs",
        "endpoints": [
            "GET  /api/datasets/inventory",
            "POST /api/datasets/{id}/upload",
            "GET  /api/datasets/{id}",
            "GET  /api/datasets/{id}/preview",
            "DELETE /api/datasets/{id}",
            "GET  /api/prepare/groups",
            "POST /api/prepare/build",
            "GET  /api/prepare/{group_id}",
            "GET  /api/prepare/{group_id}/preview",
            "GET  /api/prepare/{group_id}/quality",
            "DELETE /api/prepare/{group_id}",
            "GET  /api/forecast/demo",
            "POST /api/forecast",
            "GET  /api/staff/overview",
            "GET  /api/staff/strategy-compare-demo",
            "GET  /api/supply/overview",
            "GET  /api/supply/item/{item_id}",
            "POST /api/supply/compare",
            "POST /api/supply/sweep",
            "GET  /api/supply/compare-demo",
            "GET  /api/supply/sweep-demo",
            "GET  /api/kpis/demo",
            "GET  /api/actions/demo",
            "POST /api/actions",
            "POST /api/upload/patient",
            "POST /api/upload/inventory",
        ],
    }


# Static assets + SPA fallback — registered LAST so /api/* routes always win.
if _SERVE_FRONTEND:
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        candidate = _STATIC_DIR / full_path
        if full_path and ".." not in full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
