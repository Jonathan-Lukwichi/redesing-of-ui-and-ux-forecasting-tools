"""The assistant must not be a way around the role gate.

A stock manager who cannot open the Staffing page must not be able to type
"what's our nurse shortfall?" into the chat box and get the number. These tests
pin that, and equally pin the other half of the deal: teaching content is
universal, and the assistant is offered to every role on every page.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai import prompts, tools  # noqa: E402
from core.auth import User  # noqa: E402

ROLES = ("admin", "director", "staff_manager", "stock_manager", "viewer")


def _names(schemas):
    return {s["name"] for s in schemas}


# ── The side door ────────────────────────────────────────────────────────────

def test_a_stock_manager_is_not_offered_the_staffing_tool():
    offered = _names(tools.schemas_for(User("x", "stock_manager")))
    assert "get_staff_status" not in offered
    assert "get_supply_status" in offered


def test_a_staffing_manager_is_not_offered_the_supply_tool():
    offered = _names(tools.schemas_for(User("x", "staff_manager")))
    assert "get_supply_status" not in offered
    assert "get_staff_status" in offered


@pytest.mark.parametrize("role,tool", [
    ("stock_manager", "get_staff_status"),
    ("staff_manager", "get_supply_status"),
])
def test_calling_an_unoffered_tool_is_refused_at_execution(role, tool):
    """Filtering the schema is not enough on its own: a model can name a tool it
    was never offered, so execute() enforces the same rule independently."""
    out = tools.execute(tool, {}, user=User("x", role))
    assert out.get("out_of_scope") is True
    assert "error" in out


def test_the_optimisation_plan_is_split_by_territory():
    """One payload holds both halves; a manager must see only their own."""
    plan = {
        "week_starting": "2026-09-21",
        "staff": {"lawful_coverage_pct": 51.5},
        "staff_by_shift": [{"shift": "Day"}],
        "staff_cost_before_after_saving_zar": [1, 2, 3],
        "supply": {"items_to_order": 4},
        "orders_now": [{"item": "paracetamol"}],
        "supply_cost_before_after_saving_zar": [4, 5, 6],
    }
    staff_view = tools._filter_optimization(dict(plan), User("x", "staff_manager"))
    assert "staff" in staff_view and "supply" not in staff_view
    assert "orders_now" not in staff_view

    stock_view = tools._filter_optimization(dict(plan), User("x", "stock_manager"))
    assert "supply" in stock_view and "staff" not in stock_view
    assert "staff_by_shift" not in stock_view

    both = tools._filter_optimization(dict(plan), User("x", "admin"))
    assert "staff" in both and "supply" in both


# ── The other half of the deal ───────────────────────────────────────────────

@pytest.mark.parametrize("role", ROLES)
def test_teaching_content_is_offered_to_every_role(role):
    """Explaining what safety stock IS leaks no hospital number, so nobody is
    cut off from the teaching cards."""
    assert "lookup_knowledge" in _names(tools.schemas_for(User("x", role)))


@pytest.mark.parametrize("role", ROLES)
def test_every_role_can_use_the_assistant(role):
    assert User("x", role).can("assistant")
    assert _names(tools.schemas_for(User("x", role))), f"{role} was offered no tools at all"


@pytest.mark.parametrize("role", ROLES)
def test_the_forecast_is_shared_ground(role):
    """Arrivals drive both territories, so every role sees the forecast."""
    assert "get_forecast" in _names(tools.schemas_for(User("x", role)))


# ── The prompt tells the model whose desk it is on ───────────────────────────

def test_the_prompt_names_what_is_outside_the_caller_s_area():
    note = prompts.scope_note(User("x", "stock_manager"))
    assert "stock_manager" in note
    assert "staffing manager" in note.lower(), "does not say who to ask instead"
    assert "must not guess" in note.lower()


def test_the_prompt_does_not_invent_limits_for_a_full_access_role():
    note = prompts.scope_note(User("x", "admin"))
    assert "OUTSIDE THEIR AREA" not in note


def test_an_anonymous_caller_is_told_to_sign_in_not_given_numbers():
    note = prompts.scope_note(None)
    assert "NOT SIGNED IN" in note
    assert "sign in" in note.lower()


def test_every_role_is_told_teaching_is_allowed():
    for role in ROLES:
        assert "TEACHING IS ALWAYS ALLOWED" in prompts.scope_note(User("x", role))


# ── Internal callers keep working ────────────────────────────────────────────

def test_no_user_means_no_filtering_for_internal_callers():
    """The Action Center generator calls these tools server-side with no session
    of its own; filtering there would blank its own inputs."""
    assert _names(tools.schemas_for(None)) == _names(tools.TOOL_SCHEMAS)
