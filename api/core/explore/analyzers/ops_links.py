"""F9 to F11 — how patient arrivals relate to stock use, nurse need and stockouts.

All three read the daily operations table (group id "ops"). When the stock and
staffing behind it are simulated, every verdict, including "no clear link",
carries SIMULATED_LABEL: the link was built into the data, so it shows the
pipeline working, not something about the hospital.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from core import simulation_data
from ..pipeline import Analyzer, AnalysisContext, Finding, GroupProfile

# The caveat stays, but in words that do not label the data by origin (Jonathan,
# 2026-11-11: the presenter discloses that in person).
SIMULATED_LABEL = ("Treat this link as a check that the pipeline joins the data, not as a "
                   "tested finding about the hospital.")
LINK_RHO = 0.3          # |Spearman rho| at or above this is a link
LINK_RATE_GAP = 0.10    # busy-day stockout rate this far above other days is a link
BUSY_PERCENTILE = 0.90
MIN_DAYS = 30


def _label_if_simulated(mechanism: str) -> str:
    # Only "real" omits it; the bundled default data (origin None) is simulated too.
    if simulation_data.origin() == "real":
        return mechanism
    return f"{mechanism} {SIMULATED_LABEL}"


class _OpsLink(Analyzer):
    section = "operations"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("ops",)
    column = ""
    other = ""            # plain name of the second series
    mechanism_text = ""
    link_action = ""
    flat_action = ""

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile,
            ctx: AnalysisContext) -> Finding | None:
        if self.column not in df.columns:
            return None
        pair = pd.DataFrame({
            "a": pd.to_numeric(df[prof.target], errors="coerce"),
            "b": pd.to_numeric(df[self.column], errors="coerce")}).dropna()
        if len(pair) < MIN_DAYS or pair["a"].nunique() < 2 or pair["b"].nunique() < 2:
            return None
        rho = float(spearmanr(pair["a"], pair["b"])[0])
        linked = abs(rho) >= LINK_RHO
        direction = "rises" if rho > 0 else "falls"
        title = (f"Arrivals and {self.other} move together" if linked
                 else f"No clear link between arrivals and {self.other}")
        summary = (f"Across {len(pair):,} days, {self.other} {direction} as arrivals rise "
                   f"(rank correlation {rho:+.2f})." if linked else
                   f"Across {len(pair):,} days the rank correlation is {rho:+.2f}, "
                   f"below the {LINK_RHO} needed to call it a link.")
        return Finding(
            id=f"{self.code}:{group_id}", code=self.code,
            category="watch" if linked else "stable",
            headline=f"rho {rho:+.2f}", title=title, summary=summary,
            mechanism=_label_if_simulated(self.mechanism_text),
            action=self.link_action if linked else self.flat_action,
            source_group=group_id, section=self.section,
            detail={"rho": round(rho, 3), "days": int(len(pair)),
                    "threshold": LINK_RHO, "linked": linked})


class ArrivalsVsConsumption(_OpsLink):
    code = "F9"
    column = "consumption_units"
    other = "stock use"
    mechanism_text = ("Spearman rank correlation between daily arrivals and units of "
                      "stock consumed, which ignores the exact size of each day.")
    link_action = "Size reorder levels from forecast arrivals, not from last week's use."
    flat_action = "Keep reorder levels on stock history; arrivals add little."


class ArrivalsVsNurses(_OpsLink):
    code = "F10"
    column = "required_nurses"
    other = "nurses required"
    mechanism_text = ("Spearman rank correlation between daily arrivals and the nurses "
                      "the shift plan calls for.")
    link_action = "Build the roster from the arrivals forecast."
    flat_action = "Do not expect the arrivals forecast to move the roster much."


class StockoutsOnBusyDays(_OpsLink):
    code = "F11"
    column = "stockout_units"
    other = "stockouts"
    mechanism_text = ("Compares the share of days with a stockout on busy days (arrivals "
                      "at or above the 90th percentile) with all other days.")
    link_action = "Hold extra stock ahead of forecast busy days."
    flat_action = "Busy days do not raise stockout risk; look at other causes."

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile,
            ctx: AnalysisContext) -> Finding | None:
        if self.column not in df.columns:
            return None
        pair = pd.DataFrame({
            "a": pd.to_numeric(df[prof.target], errors="coerce"),
            "b": pd.to_numeric(df[self.column], errors="coerce")}).dropna()
        if len(pair) < MIN_DAYS:
            return None
        busy = pair["a"] >= float(np.quantile(pair["a"], BUSY_PERCENTILE))
        out = pair["b"] > 0
        if not busy.any() or busy.all():
            return None
        busy_rate, other_rate = float(out[busy].mean()), float(out[~busy].mean())
        gap = busy_rate - other_rate
        linked = gap >= LINK_RATE_GAP
        return Finding(
            id=f"{self.code}:{group_id}", code=self.code,
            category="watch" if linked else "stable",
            headline=f"{busy_rate * 100:.0f}% vs {other_rate * 100:.0f}%",
            title=("Stockouts cluster on busy days" if linked
                   else "No clear link between busy days and stockouts"),
            summary=(f"A stockout happened on {busy_rate * 100:.0f}% of busy days "
                     f"({int(busy.sum()):,}) against {other_rate * 100:.0f}% of the other "
                     f"{int((~busy).sum()):,}."),
            mechanism=_label_if_simulated(self.mechanism_text),
            action=self.link_action if linked else self.flat_action,
            source_group=group_id, section=self.section,
            detail={"busy_rate": round(busy_rate, 3), "other_rate": round(other_rate, 3),
                    "gap": round(gap, 3), "busy_days": int(busy.sum()),
                    "threshold": LINK_RATE_GAP, "linked": linked})
