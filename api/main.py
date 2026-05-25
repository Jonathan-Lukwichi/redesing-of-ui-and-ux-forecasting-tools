from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import forecast, staff, supply, kpis, upload, actions

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


@app.get("/")
def root():
    return {
        "status": "running",
        "docs":   "/docs",
        "endpoints": [
            "GET  /api/forecast/demo",
            "POST /api/forecast",
            "GET  /api/staff/demo",
            "POST /api/staff/optimize",
            "GET  /api/supply/demo",
            "POST /api/supply/optimize",
            "GET  /api/kpis/demo",
            "GET  /api/actions/demo",
            "POST /api/actions",
            "POST /api/upload/patient",
            "POST /api/upload/inventory",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
