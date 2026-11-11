"""Nurses carry a display name (Jonathan, 2026-11-11). The name lives in the
staff list, flows through the operations publish path to the staff overview and
the roster, and is display only: everything keys on staff_id. A staff list
without a name column shows the ids."""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from core import data_source, ops_derive, registry, security, simulation_data
from core.pipeline import job
from routers.datasets import _validate
from core.datasets import get_schema
from tests import pipeline_fixtures as fx

PACK_STAFF = fx.PACK / "staff_list.csv"


def _pack():
    return pd.read_csv(PACK_STAFF)


def test_every_filled_post_has_a_unique_name_and_vacant_posts_none():
    staff = _pack()
    filled = staff[~staff["is_vacant"].astype(bool)]
    vacant = staff[staff["is_vacant"].astype(bool)]
    assert len(filled) == 23
    assert filled["name"].notna().all() and filled["name"].is_unique
    assert all(len(n.split()) >= 2 for n in filled["name"])
    assert vacant["name"].isna().all()
    assert list(staff.columns[:2]) == ["staff_id", "name"]


def test_the_name_column_is_optional_in_the_staff_list_slot():
    schema = get_schema("staff_list")
    assert "name" not in schema.required_columns
    with_names = _validate(_pack(), schema)
    without = _validate(_pack().drop(columns=["name"]), schema)
    assert with_names["schema_valid"] and without["schema_valid"]
    assert with_names["extra_columns"] == [] and without["missing_expected"] == []


def test_the_pack_generator_holds_the_same_names():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "make_demo_pack", fx.REPO / "scripts" / "make_demo_pack.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    staff = _pack()
    filled = staff[~staff["is_vacant"].astype(bool)]
    assert dict(zip(filled["staff_id"], filled["name"])) == mod.STAFF_NAMES
    assert mod.STAFF_COLS == list(staff.columns)


def test_a_staff_list_without_names_falls_back_to_the_ids():
    staff = _pack().drop(columns=["name"])
    names = ops_derive.display_names(staff)
    assert list(names) == list(staff["staff_id"].astype(str))
    assert ops_derive.display_name({"staff_id": "PN001", "name": float("nan")}) == "PN001"
    assert ops_derive.display_name({"staff_id": "PN001", "name": "  "}) == "PN001"
    assert ops_derive.display_name({"staff_id": "PN001", "name": "Ann Lee"}) == "Ann Lee"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    for limiter in security.LIMITS.values():
        limiter._hits.clear()

    async def offline(filename):
        raise data_source.FetchError("offline in tests", http_status=503)
    monkeypatch.setattr(data_source, "fetch_raw", offline)
    import main
    return TestClient(main.app)


@pytest.fixture()
def finished_run(monkeypatch):
    from ai import config as ai_config
    monkeypatch.setattr(ai_config, "configured", lambda: False)
    monkeypatch.setattr(job, "_STATE", job._State())
    saved_uploaded, saved_meta = dict(simulation_data._UPLOADED), dict(simulation_data._META)
    fx.reset()
    fx.seed_all()
    job.start(source="sample")
    assert job.wait(300)
    yield job.status()
    fx.reset()
    simulation_data._UPLOADED.clear()
    simulation_data._UPLOADED.update(saved_uploaded)
    simulation_data._META.update(saved_meta)


def test_names_reach_the_staff_overview_and_the_roster(client, finished_run):
    assert finished_run["results_ready"] is True
    staff = _pack()
    filled = staff[~staff["is_vacant"].astype(bool)]
    expected = dict(zip(filled["staff_id"], filled["name"]))

    rows = client.get("/api/staff/overview").json()["staff"]
    assert {r["staff_id"]: r["name"] for r in rows} == expected

    plan = client.get("/api/optimization/last").json()
    roster = plan["staff"]["roster"]
    assert roster and all(r["name"] == expected[r["staff_id"]] for r in roster)
    # The optimiser and the plan still key on the id.
    assert {r["staff_id"] for r in roster} == set(expected)

    pool = client.get("/api/optimization/staff-pool").json()["staff"]
    assert {s["staff_id"]: s["name"] for s in pool} == expected
