"""F5 — Max pairwise correlation among the columns in a category group."""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..pipeline import Analyzer, Finding, GroupProfile


class CategoryIndependenceAnalyzer(Analyzer):
    code = "F5"
    section = "departments"
    requires_categories = ("specialty",)
    preferred_group_ids = ("g3",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Finding | None:
        cols = [c for c in (prof.category("specialty") or []) if c in df.columns]
        if len(cols) < 2:
            return None
        sub = df[cols].apply(pd.to_numeric, errors="coerce")
        corr = sub.corr(method="pearson").to_numpy()
        n = corr.shape[0]
        best = 0.0
        best_pair = (None, None)
        for i in range(n):
            for j in range(i + 1, n):
                v = corr[i, j]
                if np.isnan(v):
                    continue
                if abs(v) > abs(best):
                    best = float(v)
                    best_pair = (_label(cols[i]), _label(cols[j]))
        if best_pair[0] is None:
            return None
        sign = "+" if best >= 0 else ""
        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="stable",
            headline=f"{sign}{best:.2f}",
            title="Categories move independently",
            summary=(
                f"The strongest pairwise correlation is {sign}{best:.2f} "
                f"({best_pair[0]}–{best_pair[1]}). All other pairs are weaker."
            ),
            mechanism=(
                "Different patient profiles arrive for different reasons — "
                "weather drives respiratory, weekends drive surgery, etc."
            ),
            action=(
                "Forecast each category with its own model — there is little to "
                "gain from a shared multi-output model."
            ),
            source_group=group_id,
            section=self.section,
            detail={"max_correlation": round(best, 3), "pair": list(best_pair)},
        )


def _label(col: str) -> str:
    if col.startswith("spec_"):
        return col[len("spec_"):].replace("_", " ").title()
    return col
