"""
Reusable finding pipeline.

Three layers:

1. GroupProfile — declares the semantic role of each column in a merged
   group (which column is the date, which is the target, which is the
   weekend flag, what categories exist, …). Profiles travel with the group
   so analyzers never hard-code column names.

2. Analyzer — one finding type (e.g. "regime shift"). Declares which roles
   it needs. The pipeline only runs analyzers whose required roles are
   satisfied by the group's profile, so every analyzer is automatically
   applicable to any new group that publishes the right profile.

3. FindingPipeline — runs a list of registered analyzers against an
   AnalysisContext (the loaded groups + raw datasets). Returns a flat list
   of Finding records ready for the frontend.

Adding a new dataset later means writing a GroupSpec + a GroupProfile;
every existing analyzer immediately runs against it. Adding a new finding
type means writing one Analyzer subclass and registering it.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from typing import Any, Literal

import pandas as pd


# -- profile -------------------------------------------------------------------

@dataclass(frozen=True)
class GroupProfile:
    """Maps semantic roles to the actual column names in a merged group.

    Single-value roles (date, target, hour, weekend, …) hold one column name
    or None. Category roles map a label ("specialty", "violence_event") to
    a list of column names — used by analyzers that aggregate over related
    columns (specialty mix, surge classification, …).
    """
    group_id:        str
    grain:           Literal["daily", "hourly"]
    date:            str | None = None
    hour:            str | None = None
    target:          str | None = None
    weekend_flag:    str | None = None
    holiday_flag:    str | None = None
    month:           str | None = None
    day_of_week:     str | None = None
    regime_label:    str | None = None
    era_label:       str | None = None
    zero_day_flag:   str | None = None
    weather_temp:    str | None = None
    weather_precip:  str | None = None
    categories:      dict[str, list[str]] = field(default_factory=dict)

    def has(self, *roles: str) -> bool:
        for r in roles:
            if r == "categories":
                if not self.categories:
                    return False
                continue
            if getattr(self, r, None) in (None, ""):
                return False
        return True

    def category(self, name: str) -> list[str] | None:
        return self.categories.get(name)


# -- finding -------------------------------------------------------------------

Category = Literal["risk", "watch", "stable", "trend"]


@dataclass
class Finding:
    """One headline card on the Explore page."""
    id:        str
    code:      str                # F1, F2, … — kept stable across changes
    category:  Category
    headline:  str                # the big number (e.g. "+7.9%", "41/41/18")
    title:     str                # plain-English label
    summary:   str                # one-sentence context
    mechanism: str                # why this happens, plain English
    action:    str                # what the hospital should do about it
    source_group: str             # which merged group it was computed from
    section:   str                # which Explore tab the deep-dive lives in
    detail:    dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# -- context -------------------------------------------------------------------

# -- metric (KPI strip cards) -------------------------------------------------

@dataclass
class Metric:
    """One KPI card on the Headlines strip. Same pipeline contract as Finding
    but tuned for at-a-glance numbers rather than narrative cards."""
    id:           str
    code:         str              # M1, M2, … — stable across releases
    label:        str              # short uppercase header, e.g. "TOTAL ARRIVALS"
    value:        float | int | str
    unit:         str | None = None      # "/day", "%", "days", "depts"
    delta_pct:    float | None = None    # for the green/red pill
    delta_label:  str | None = None      # "vs pre-COVID", "vs annual mean", …
    sparkline:    list[float] | None = None
    accent:       Category = "stable"    # colour of the delta pill
    section:      str = "headlines"
    source_group: str = ""
    detail:       dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# -- analyzer ABCs ------------------------------------------------------------


@dataclass
class AnalysisContext:
    """Everything the pipeline can see at run time."""
    groups: dict[str, tuple[pd.DataFrame, GroupProfile]]
    raw_datasets: dict[str, pd.DataFrame]

    def group(self, group_id: str) -> tuple[pd.DataFrame, GroupProfile] | None:
        return self.groups.get(group_id)

    def raw(self, dataset_id: str) -> pd.DataFrame | None:
        return self.raw_datasets.get(dataset_id)


# -- analyzer ------------------------------------------------------------------

class Analyzer(ABC):
    """Subclass once per finding type. Declares which group profile roles it
    needs (so the pipeline can decide applicability without running) and
    implements run() to produce zero or one Finding."""

    code:                str = ""        # e.g. "F1"
    section:             str = ""        # which Explore tab covers the deep-dive
    required_group_grain: Literal["daily", "hourly"] | None = None
    required_roles:      tuple[str, ...] = ()
    requires_categories: tuple[str, ...] = ()
    requires_raw_datasets: tuple[str, ...] = ()
    preferred_group_ids: tuple[str, ...] = ()

    def applicable(self, group_id: str, profile: GroupProfile, ctx: AnalysisContext) -> bool:
        if self.preferred_group_ids and group_id not in self.preferred_group_ids:
            return False
        if self.required_group_grain and profile.grain != self.required_group_grain:
            return False
        if not profile.has(*self.required_roles):
            return False
        for cat in self.requires_categories:
            if not profile.category(cat):
                return False
        for d in self.requires_raw_datasets:
            if ctx.raw(d) is None:
                return False
        return True

    @abstractmethod
    def run(self, group_id: str, df: pd.DataFrame, profile: GroupProfile,
            ctx: AnalysisContext) -> Finding | None:
        ...


class MetricAnalyzer(ABC):
    """Same applicability contract as Analyzer but emits a Metric (KPI card)
    instead of a Finding. Subclass once per metric. Pipeline runs every metric
    analyzer whose required roles are satisfied — adding a new dataset just
    needs a profile and metrics auto-light-up."""

    code:                str = ""
    required_group_grain: Literal["daily", "hourly"] | None = None
    required_roles:      tuple[str, ...] = ()
    requires_categories: tuple[str, ...] = ()
    requires_raw_datasets: tuple[str, ...] = ()
    preferred_group_ids: tuple[str, ...] = ()

    def applicable(self, group_id: str, profile: GroupProfile, ctx: AnalysisContext) -> bool:
        if self.preferred_group_ids and group_id not in self.preferred_group_ids:
            return False
        if self.required_group_grain and profile.grain != self.required_group_grain:
            return False
        if not profile.has(*self.required_roles):
            return False
        for cat in self.requires_categories:
            if not profile.category(cat):
                return False
        for d in self.requires_raw_datasets:
            if ctx.raw(d) is None:
                return False
        return True

    @abstractmethod
    def run(self, group_id: str, df: pd.DataFrame, profile: GroupProfile,
            ctx: AnalysisContext) -> Metric | None:
        ...


# -- pipeline ------------------------------------------------------------------

class FindingPipeline:
    def __init__(self, analyzers: list[Analyzer]):
        self.analyzers = list(analyzers)

    def applicable_against(self, ctx: AnalysisContext) -> list[tuple[Analyzer, str]]:
        """Return (analyzer, group_id) pairs that *would* run if asked. Useful
        for the /findings/index endpoint so the UI can show what's coverable."""
        out: list[tuple[Analyzer, str]] = []
        for a in self.analyzers:
            chosen = False
            for gid, (_, prof) in ctx.groups.items():
                if a.applicable(gid, prof, ctx):
                    out.append((a, gid))
                    chosen = True
                    if a.preferred_group_ids:
                        break
            if not chosen:
                out.append((a, ""))
        return out

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        findings: list[Finding] = []
        for a in self.analyzers:
            target_groups: list[str]
            if a.preferred_group_ids:
                target_groups = [gid for gid in a.preferred_group_ids if gid in ctx.groups]
            else:
                target_groups = list(ctx.groups.keys())
            for gid in target_groups:
                df, prof = ctx.groups[gid]
                if not a.applicable(gid, prof, ctx):
                    continue
                try:
                    f = a.run(gid, df, prof, ctx)
                except Exception as e:  # one bad analyzer should not break the page
                    f = None
                    _record_failure(a, gid, e)
                if f is not None:
                    findings.append(f)
                    if a.preferred_group_ids:
                        break
        return findings


class MetricPipeline:
    """Same shape as FindingPipeline but emits Metric records."""
    def __init__(self, analyzers: list[MetricAnalyzer]):
        self.analyzers = list(analyzers)

    def run(self, ctx: AnalysisContext) -> list[Metric]:
        out: list[Metric] = []
        for a in self.analyzers:
            target_groups: list[str]
            if a.preferred_group_ids:
                target_groups = [gid for gid in a.preferred_group_ids if gid in ctx.groups]
            else:
                target_groups = list(ctx.groups.keys())
            for gid in target_groups:
                df, prof = ctx.groups[gid]
                if not a.applicable(gid, prof, ctx):
                    continue
                try:
                    m = a.run(gid, df, prof, ctx)
                except Exception as e:
                    m = None
                    _record_failure(a, gid, e)
                if m is not None:
                    out.append(m)
                    if a.preferred_group_ids:
                        break
        return out


# -- diagnostic ----------------------------------------------------------------

_FAILURES: list[dict[str, Any]] = []


def _record_failure(analyzer: Analyzer, group_id: str, exc: Exception) -> None:
    _FAILURES.append({
        "analyzer": analyzer.__class__.__name__,
        "code": analyzer.code,
        "group_id": group_id,
        "error": f"{type(exc).__name__}: {exc}",
    })
    # Keep at most the last 50 to avoid unbounded growth.
    if len(_FAILURES) > 50:
        del _FAILURES[: len(_FAILURES) - 50]


def recent_failures() -> list[dict[str, Any]]:
    return list(_FAILURES)
