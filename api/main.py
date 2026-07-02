from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import forecast, staff, supply, kpis, upload, actions, datasets, prepare, explore, task1, task2, ai, optimization

app = FastAPI(
    title="HealthForecast AI — Backend API",
    description="Forecasting, staff scheduling, and supply optimization for hospital operations.",
    version="1.0.0",
)

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


@app.on_event("startup")
async def _bootstrap_groups() -> None:
    """Best-effort: build the live G1 forecast group in the background so the
    Forecast and Optimization pages share the same real data on first load."""
    import asyncio
    from core import bootstrap
    asyncio.create_task(bootstrap.ensure_g1())


@app.get("/")
def root():
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
            "GET  /api/staff/demo",
            "POST /api/staff/optimize",
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
