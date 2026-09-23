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

from core import auth as core_auth, security
from routers import (forecast, staff, supply, upload, datasets, prepare, explore,
                     task1, task2, ai, optimization, reports, auth_routes,
                     action_items)

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

# CORS was allow_origins=["*"] with no authentication, so any page on the
# internet could call this API with a visitor's browser. Production serves the
# built frontend from this same process (same origin, no CORS needed), so the
# default list covers local development only. allow_credentials is required for
# the session cookie to travel in dev, and a wildcard origin is forbidden
# alongside it by the CORS spec — which is exactly the mistake being fixed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=security.allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_routes.router)
app.include_router(forecast.router)
app.include_router(staff.router)
app.include_router(supply.router)
app.include_router(upload.router)
app.include_router(datasets.router)
app.include_router(prepare.router)
app.include_router(explore.router)
app.include_router(task1.router)
app.include_router(task2.router)
app.include_router(ai.router)
app.include_router(optimization.router)
app.include_router(reports.router)
app.include_router(action_items.router)


@app.on_event("startup")
async def _bootstrap_groups() -> None:
    """Best-effort: build the live G1 forecast group in the background so the
    Forecast and Optimization pages share the same real data on first load."""
    import asyncio
    from core import bootstrap
    asyncio.create_task(bootstrap.ensure_g1())


# Strict mode is enforced here rather than by decorating every read route.
# A choke point cannot be forgotten: a route added next month is covered the
# moment it exists, whereas a missed `Depends(require_read)` is an open door
# nobody notices. Write and admin routes keep their own explicit dependencies,
# so they stay closed in every mode regardless of this.
_STRICT_EXEMPT = ("/api/auth/", "/health", "/docs", "/openapi.json", "/redoc")


@app.middleware("http")
async def _enforce_strict_mode(request, call_next):
    if security.auth_mode() == "strict" and request.url.path.startswith("/api/"):
        if not request.url.path.startswith(_STRICT_EXEMPT):
            if security.current_user(request) is None:
                return NumpyJSONResponse(
                    status_code=401,
                    content={"detail": {"error": "not_authenticated",
                                        "message": "Sign in to continue."}},
                )
    return await call_next(request)


@app.middleware("http")
async def _security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.get("/health")
def health():
    """Liveness plus the security posture, so a deployment can be checked from
    outside without reading its environment."""
    return {"status": "ok",
            "auth_mode": security.auth_mode(),
            "auth_configured": core_auth.auth_configured()}


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
            "POST /api/upload/patient",
            "POST /api/upload/inventory",
        ],
    }


# Static assets + SPA fallback — registered LAST so /api/* routes always win.
if _SERVE_FRONTEND:
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    _STATIC_ROOT = _STATIC_DIR.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve a built asset, or the SPA shell.

        The containment check is a RESOLVED-PATH comparison, not a search for
        "..". Filtering the string is not enough: `Path("/app/static") /
        "/etc/passwd"` is `/etc/passwd`, because pathlib discards the left side
        when the right side is absolute — and a request for `//etc/passwd`
        arrives here as the absolute `full_path` `/etc/passwd`, containing no
        "..". This route sits outside /api/, so no amount of AUTH_MODE closed
        it either. Resolving first also collapses symlinks, which a string test
        cannot see through.
        """
        if full_path:
            try:
                candidate = (_STATIC_ROOT / full_path.lstrip("/")).resolve()
            except (OSError, ValueError, RuntimeError):
                candidate = None
            if (candidate is not None
                    and candidate.is_relative_to(_STATIC_ROOT)
                    and candidate.is_file()):
                return FileResponse(candidate)
        return FileResponse(_STATIC_ROOT / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
