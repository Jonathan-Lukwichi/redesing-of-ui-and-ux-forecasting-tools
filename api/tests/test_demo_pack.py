"""The simulated demo pack and the upload slots that accept it (Task 3)."""
from pathlib import Path

import pandas as pd
import pytest

from core.datasets import get_schema
from routers.datasets import _validate

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "demo-data"
BUNDLED = REPO / "api" / "data" / "simulation"

ROWS = {
    "inventory_items": 30,
    "inventory_movements": 11880,
    "staff_list": 30,
    "shift_log": 1188,
    "staffing_daily": 396,
}
FORBIDDEN = ("total_stockout_cost_zar", "service_level_achieved", "total_cost_zar")


def _read(name):
    return pd.read_csv(PACK / f"{name}.csv")


@pytest.mark.parametrize("name,rows", ROWS.items())
def test_pack_row_counts(name, rows):
    assert len(_read(name)) == rows


@pytest.mark.parametrize("name", ROWS)
def test_pack_holds_no_simulator_results(name):
    cols = set(_read(name).columns)
    assert not cols & set(FORBIDDEN)


def test_pack_origin_is_simulated():
    for name in ("inventory_items", "staff_list"):
        assert set(_read(name)["data_origin"]) == {"simulated"}


def test_staff_list_has_23_filled_posts():
    staff = _read("staff_list")
    assert len(staff) == 30
    assert int((~staff["is_vacant"].astype(bool)).sum()) == 23


def test_filled_staff_ids_match_bundled_members():
    staff = _read("staff_list")
    filled = set(staff.loc[~staff["is_vacant"].astype(bool), "staff_id"])
    members = set(pd.read_csv(BUNDLED / "staff_members.csv")["staff_id"])
    assert filled == members


def test_every_movement_item_is_in_the_catalogue():
    items = set(_read("inventory_items")["item_id"])
    assert set(_read("inventory_movements")["item_id"]) <= items


@pytest.mark.parametrize("name", ROWS)
def test_new_schemas_accept_the_pack(name):
    schema = get_schema(name)
    assert schema is not None
    assert schema.source_filename_hint == f"{name}.csv"
    assert schema.category in ("inventory", "scheduling")
    assert _validate(_read(name), schema)["schema_valid"] is True


def test_inventory_counts_only_the_seven_source_files():
    import asyncio
    from routers.datasets import inventory

    out = asyncio.run(inventory())
    assert out["total"] == 7
    assert len(out["items"]) == 12
