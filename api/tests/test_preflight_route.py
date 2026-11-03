"""GET /api/pipeline/preflight serves the same result as run_checks."""
from fastapi.testclient import TestClient

from core import registry
from tests.test_preflight import seeded  # noqa: F401  (autouse seeding fixture)


def test_preflight_route(monkeypatch):
    monkeypatch.setenv("DEMO_INSECURE", "1")
    import main
    body = TestClient(main.app).get("/api/pipeline/preflight").json()
    assert body["ok"] is True and body["arrivals_source"] == "pure"
    registry.clear("calendar")
    body = TestClient(main.app).get("/api/pipeline/preflight").json()
    assert body["ok"] is False and body["issues"][0]["file"].startswith("calendar")
