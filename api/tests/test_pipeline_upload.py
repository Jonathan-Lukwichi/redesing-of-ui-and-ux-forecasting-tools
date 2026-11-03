"""Raw register upload, staging and transformed-table download (Task 7).

Uses the synthetic workbook builder only: no real register is read here.
"""
import inspect

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import core.pipeline
from core import auth, datasets, registry, security
from core.pipeline import staging
from routers import pipeline as pipeline_router
from tests.fixtures.register_workbook import FAKE_IDENTIFIERS, FAKE_NAME, build_register

PASSWORD = "a-long-enough-test-password"
NAME = "Casualty_Daily_Register_2024_03.xlsx"
URL = f"/api/pipeline/registers?filename={NAME}"


@pytest.fixture()
def client(monkeypatch):
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"adm:admin:{h};viv:viewer:{h}")
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    staging.clear()
    saved = registry.get("daily_arrival")
    registry.clear("daily_arrival")
    import main
    c = TestClient(main.app, base_url="https://testserver")
    yield c
    staging.clear()
    registry.clear("daily_arrival")
    if saved is not None:
        registry.put("daily_arrival", saved.df, saved.metadata)


def _login(c, who="adm"):
    r = c.post("/api/auth/login", json={"username": who, "password": PASSWORD})
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def march():
    return build_register(2024, 3, days=2)


@pytest.fixture(scope="module")
def march_longer():
    return build_register(2024, 3, days=3)


def test_upload_returns_a_receipt(client, march):
    _login(client)
    r = client.post(URL, content=march)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["file"] == NAME and body["month"] == "2024-03"
    assert body["status"] == "added"
    assert body["days"] > 0 and body["arrivals"] > 0
    assert [m["month"] for m in client.get("/api/pipeline/staged").json()["months"]] == ["2024-03"]
    # The response carries aggregates only, never a fake patient identifier.
    for fake in (*FAKE_IDENTIFIERS, FAKE_NAME):
        assert str(fake) not in r.text


def test_month_is_replaced_not_doubled(client, march, march_longer):
    _login(client)
    client.post(URL, content=march)
    first = staging.months()[0].sha256
    r = client.post(URL, content=march_longer)
    assert r.status_code == 200 and r.json()["status"] == "replaced"
    assert len(staging.months()) == 1
    assert staging.months()[0].sha256 != first


def test_identical_reupload_is_a_noop_receipt(client, march):
    _login(client)
    client.post(URL, content=march)
    staging.mark_applied()
    kept = staging.months()[0]
    r = client.post(URL, content=march)
    assert r.status_code == 200 and r.json()["status"] == "unchanged"
    assert staging.months()[0] is kept
    assert staging.unapplied() == []


def test_bad_file_returns_422_with_safe_message(client):
    _login(client)
    r = client.post(URL, content=b"this is not a workbook " + FAKE_NAME.encode())
    assert r.status_code == 422
    assert NAME in r.json()["detail"]
    assert FAKE_NAME not in r.text
    assert staging.months() == []


def test_bad_filename_returns_422(client, march):
    _login(client)
    r = client.post("/api/pipeline/registers?filename=Dec-24.xlsx", content=march)
    assert r.status_code == 422


def test_oversize_body_returns_413(client, monkeypatch):
    _login(client)
    monkeypatch.setattr(pipeline_router, "MAX_BODY_BYTES", 1024)
    r = client.post(URL, content=b"x" * 2048)
    assert r.status_code == 413
    assert staging.months() == []


def test_oversize_chunked_body_returns_413(client, monkeypatch):
    """No Content-Length (chunked body): the streaming cap still applies."""
    _login(client)
    monkeypatch.setattr(pipeline_router, "MAX_BODY_BYTES", 1024)
    r = client.post(URL, content=(b"x" * 512 for _ in range(10)))
    assert r.status_code == 413
    assert staging.months() == []


def test_requires_data_write(client, march):
    assert client.post(URL, content=march).status_code == 401
    _login(client, "viv")
    assert client.post(URL, content=march).status_code == 403
    assert client.delete("/api/pipeline/staged").status_code == 403
    assert staging.months() == []


def test_multipart_is_not_used():
    src = inspect.getsource(pipeline_router)
    assert "request.stream()" in src
    assert "UploadFile" not in src and "File(" not in src and "Form(" not in src


def test_download_gives_transformed_csv(client):
    _login(client)
    cols = list(datasets.DAILY_ARRIVAL.expected_columns)
    df = pd.DataFrame([["2024-03-01", 10, 5, 15]], columns=cols)
    registry.put("daily_arrival", df, {})
    r = client.get("/api/pipeline/transformed/daily_arrival.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.text.splitlines()[0] == ",".join(cols)
    assert r.text.splitlines()[1].startswith("2024-03-01")


def test_download_unknown_table_404(client):
    _login(client)
    assert client.get("/api/pipeline/transformed/nope.csv").status_code == 404
    # A known slot with nothing in it is also a 404.
    assert client.get("/api/pipeline/transformed/daily_arrival.csv").status_code == 404


def test_clear_empties_staging(client, march):
    _login(client)
    client.post(URL, content=march)
    r = client.delete("/api/pipeline/staged")
    assert r.status_code == 200 and r.json() == {"cleared": 1}
    assert client.get("/api/pipeline/staged").json() == {"months": [], "unapplied": []}


def test_unapplied_tracks_new_months(client, march):
    _login(client)
    client.post(URL, content=march)
    assert staging.unapplied() == ["2024-03"]
    staging.mark_applied()
    assert staging.unapplied() == []


def test_rejected_while_a_run_is_active(client, march, monkeypatch):
    _login(client)
    monkeypatch.setattr(core.pipeline, "is_running", lambda: True)
    assert client.post(URL, content=march).status_code == 409
    assert client.delete("/api/pipeline/staged").status_code == 409
    assert staging.months() == []
