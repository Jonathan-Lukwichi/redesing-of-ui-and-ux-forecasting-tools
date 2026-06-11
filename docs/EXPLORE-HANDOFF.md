# Explore Dashboard — Build Handoff for Claude Code (VS Code CLI)

This package lets you rebuild the **single-page Exploratory Data Analysis dashboard**
exactly as designed, inside your real repo (`redesing-of-ui-and-ux-forecasting-tools`).

The design source of truth is the file **`explore-reference.html`** (a copy of the
approved `preview.html`). It is fully self-contained — open it in a browser to see
the exact target. Claude Code should treat it as the pixel/interaction spec.

--------------------------------------------------------------------------------
## STEP 1 — Put these two files in your repo
--------------------------------------------------------------------------------
1. Copy `explore-reference.html`  →  `docs/explore-reference.html`
2. Copy this file                 →  `docs/EXPLORE-HANDOFF.md`

(Anywhere works; `docs/` keeps them out of the build.)

--------------------------------------------------------------------------------
## STEP 2 — Open the reference so you can SEE it
--------------------------------------------------------------------------------
Open `docs/explore-reference.html` directly in Chrome (double-click it).
Click **"Start the analysis"** to reach the dashboard. This is the exact target.

--------------------------------------------------------------------------------
## STEP 3 — Run Claude Code with the prompt below
--------------------------------------------------------------------------------
From your repo root:

    claude

Then paste the prompt in the next section verbatim.

KEY RULE for an accurate rebuild: tell Claude Code to **read
`docs/explore-reference.html` first and match it section-by-section.** Do not let it
improvise — the reference already encodes every color, font, chart, toggle, and the
pipeline-gate animation.

================================================================================
## THE PROMPT — paste this into Claude Code
================================================================================

Read `docs/explore-reference.html` end-to-end. It is the approved design for our
Explore page and the single source of truth. Rebuild it as the production
`src/pages/ExploreData.jsx`, replacing the current tabbed version, and matching the
reference's layout, styling, charts, and interactions exactly.

Constraints:
- Stack: React 18 + Vite (already set up). Keep our existing import style and the
  `AppShell` wrapper. Do NOT add new dependencies — all charts in the reference are
  hand-built inline SVG, reproduce them the same way (no Recharts/Chart.js).
- Match the design tokens exactly:
  - Fonts: Inter (400–800) + JetBrains Mono. Add the Google Fonts <link> in index.html
    if not present.
  - Colours: --ink #0f172a, --muted #64748b, --teal #0d9488, --navy #1e6091,
    --red #dc2626, --amber #d97706, line #eef0f3. Background is a vertical
    gradient #f6f8fb → #eef1f6.
  - Cards: white, 1px #e9ecf1 border, 12px radius, soft shadow, hover lift.
  - KPI tiles: 13px radius, 3px coloured top accent bar, big tabular number,
    optional delta pill + mini sparkline.

Build these pieces, in this order, as components inside the page (or in
`src/components/Charts.jsx` if shared):

1. PipelineGate — full-screen dark teal gradient card shown FIRST. Title
   "Exploratory data analysis", 5 animated steps (Ingest → Clean → Merge G1–G4 →
   Run analyzers → Compile findings), a green "▶ Start the analysis" button that
   animates the steps then reveals the dashboard. A progress bar fills while running.
   Generic wording only — no hospital / Steve Biko / casualty references anywhere.

2. Control bar — title "Exploratory Data Analysis", a one-line sub, a date-range
   segmented control (All time / This year / Last 90 / Last 30 / Last 7), a
   specialty filter chip, and a "↻ Re-run" button that returns to the PipelineGate.

3. KPI hero row — 6 tiles: Total arrivals, Avg/day, Daily swing (±14), Categories (5),
   Completeness (99.79%), and a year-on-year growth tile. Coloured accents, sparklines.

4. Hero chart — "Patient arrivals" gridded area-line (horizontal + vertical grid,
   gradient fill, white-stroked dots). It has a 6-way toggle that swaps the series:
   Daily / Weekly / Monthly / Yearly / Hourly / By specialty (multi-line + legend).

5. Card grid (tight, equal-height rows, hover lift):
   - Row: 2 donuts + shift-split donut (year-on-year arrivals bars in slot 1 —
     treat the data as ONE continuous series; do NOT split by COVID regime).
   - Row: weekday bars / hourly area-line / "Surgery rises on weekends" ranked
     diverging bars (category name ABOVE each bar to avoid overlap).
   - Row: specialty-volume bars with a Day/Week/Month/Year toggle; monthly
     seasonality bars; calendar-effect ranked bars.
   - Large row: temperature-impact-by-specialty multi-line chart + calendar-impact
     matrix (rows = events, cols = specialties + Trauma; teal = more, red = fewer,
     with a legend).
   - Row: multi-colour "busy band" hour×weekday heatmap WITH a 5-level legend
     (Very quiet → Peak); critical-events bars with a Day/Week/Month toggle.
   - Findings table — "Five validated findings", each row a coloured severity chip +
     finding text + a "Source →" link. NO recommended-action column (actions live on
     the Recommendation page, not here).

Interactions to preserve exactly:
- Every toggle re-renders its card's chart in place (one card → many views).
- Hover lift on cards and KPI tiles.
- The PipelineGate → dashboard → Re-run loop.

Data wiring:
- The reference uses local mock arrays. Wire each chart to our backend instead, using
  the existing `src/api/client.js` (`api.explore.*`) and the `useAnalysis` hook already
  in the codebase. Where an endpoint is missing, keep the reference's mock array as a
  named fallback constant (e.g. `DAILY_FALLBACK`) and add a `// TODO: wire to
  api.explore.<x>` comment — never leave a chart blank.
- The "Start the analysis" button should call the real pipeline trigger if one exists
  (check `api/routers/explore.py`); otherwise keep it as the animated front-end gate.

When done: run `npm run dev`, open the Explore page, and visually diff against
`docs/explore-reference.html` open in another tab. They should look identical. Fix any
drift in spacing, colour, font-weight, chart grid, or toggle behaviour.

================================================================================
## TIPS FOR AN EXACT MATCH
================================================================================
- If Claude Code's output drifts, tell it: "Open docs/explore-reference.html and the
  running page side by side; list every visual difference, then fix them."
- Build/verify ONE section at a time (gate → control bar → KPIs → hero chart → grid)
  rather than all at once. Smaller diffs = closer match.
- The reference's inline SVG chart functions (Spark, AreaLine, Bars, Donut, Ranked,
  Heatmap, Matrix, Toggle) can be copied almost verbatim into `Charts.jsx` — they are
  plain React + SVG with no dependencies.
- Keep the JetBrains Mono font on all numbers (tabular-nums) — it's a big part of the
  "premium" feel.
