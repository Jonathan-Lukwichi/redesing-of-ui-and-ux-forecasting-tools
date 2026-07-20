# Responsive Audit — HealthForecast AI

Phase 1 of the responsive remediation. Diagnosis only; no fixes in this phase.

## 0. Context (filled in)

| Item | Value |
|---|---|
| Stack | React 18 + Vite SPA (no router — page switch via state), FastAPI backend serves built `dist/` |
| CSS methodology | One plain stylesheet (`src/styles.css`, ~1000 lines, CSS custom properties as a partial token layer) **plus ~467 inline `style={{}}` declarations across 18 JSX files** |
| Charting | Hand-rolled SVG components in `src/components/Charts.jsx` (23 exports) — no library |
| Design tokens | Partial: colors, font stacks, spacing vars (`--space-*`), radii, shadows exist in `:root`. Type sizes are NOT tokenized (52 px font-sizes in CSS + 415 inline) |
| Prior work | A first mobile pass already shipped (commit `927abad`): off-canvas sidebar drawer + hamburger, inline-grid collapse rules ≤820px, table sideways scroll ≤820px, `100dvh`, 16px inputs on touch, chat panel fit |

## 1. Root HTML template

`index.html` — ✅ `<meta name="viewport" content="width=device-width, initial-scale=1" />` present and correct.
✅ No `user-scalable=no`, no `maximum-scale` anywhere. Pinch zoom works. No accessibility violation.

## 2. Anti-pattern findings

### 2.1 Fixed width/min-width > 320px
| File:line | Finding | Severity |
|---|---|---|
| `src/components/AskChat.jsx:64` | `width: 380` — but capped by `maxWidth: calc(100vw - 16px)` (fixed in prior pass) | OK (guarded) |
| `src/styles.css:991-992` | `.tbl { min-width: 520px }`, `.exp-tbl { min-width: 480px }` — intentional (forces sideways scroll inside card, not page overflow); only active ≤820px | OK (by design) |
| `src/pages/Optimization.jsx:331,428` | tables with `maxWidth: 560/620` — max, not min | OK |

### 2.2 `position: absolute/fixed` for layout
13 occurrences, all audited: floating chat button/panel, sidebar drawer (mobile), backdrop, KPI sparkline decorations, badge dots, tooltip. **All are overlays, none are page layout.** ✅ No action needed.

### 2.3 Fixed px heights on text containers
None found on text flow containers. Chart wrappers pass fixed `height` props (see 2.6).

### 2.4 `white-space: nowrap` on body content
| File:line | Context | Risk |
|---|---|---|
| `src/styles.css:372,446,524,844` | breadcrumbs, sign-out btn, `.btn`, `.step` | Low (short labels; crumbs get ellipsis ≤820px) |
| `src/pages/Admin.jsx:130`, `ExploreData.jsx:429` | table cells | Low (inside scrollable tables) |
| `Task1Forecast.jsx:266,859`, `Task2Forecast.jsx:348,361`, `AskChat.jsx:78` | buttons/chips | Low |

No nowrap on paragraphs/body text. ✅

### 2.5 Tables without a scroll wrapper
12 `<table className="tbl">` instances (Admin ×2, PrepareData, Optimization ×4, StaffPlanner, SupplyPlanner ×2, DataHub) + 1 inline-styled table (`ExploreData.jsx:422`).
**None has a dedicated scroll wrapper.** Current protection is the ≤820px rule `.card-body, .exp-card { overflow-x: auto }` — a blanket guard, not the per-table `role="region"` wrapper the brief asks for. ⚠️ **Phase 5 work.**

### 2.6 Charts with hardcoded width/height
`Charts.jsx` — two groups:
- ✅ 13 charts (`RankedBars`, `LineChart`, `BarChart`, `StemPlot`, `BoxPlot`, `StackedArea`, `ScatterPlot`, `DivergingMatrix`, `Heatmap`, `MonthlyIndexBars`, …) render `viewBox` + `width="100%"` + fixed px `height` + `preserveAspectRatio="none"` — fluid width, no overflow; vertical size fixed (acceptable; distortion is by design).
- ⚠️ 4 components render **fixed pixel width attributes**: `ProgressRing` (line 115, ≤56px — harmless), `Sparkline` (368, 80px — harmless), `Donut` (491, `width={size}` = 180), `DonutWithCenter` (317, `width={size}` = 200). The two donuts don't shrink below ~200px containers. **Phase 5: make donuts `width="100%"` with `max-width: size`.**
- Axis-tick thinning for narrow containers does not exist anywhere. **Phase 5.**

### 2.7 Images without `max-width: 100%`
Zero `<img>` elements in the entire app (all visuals are inline SVG). ✅ No CLS risk. Global `img/svg max-width` guard still worth adding as safety net (Phase 3).

### 2.8 Flex children without `min-width: 0`
`min-width: 0` used in only 10 places. Utility `.row` does not protect children (`.grow` does). Risk sites: `.card-header` with long titles + actions, `page-head` (already stacks ≤820px). ⚠️ **Phase 3: add `.row > * { min-width: 0 }` and audit card headers.**

### 2.9 vw-based sizing ignoring scrollbar width
`clamp(...vw...)` used for fluid type/spacing in `styles.css` — safe (never full-width `100vw` sizing). One `calc(100vw - 16px)` in AskChat as a **max** — acceptable. ✅

### 2.10 `100vh` where `100dvh` is needed
| File:line | Status |
|---|---|
| `src/styles.css:178` `.app { height: 100vh }` | ✅ Overridden by `@supports (height:100dvh)` rule (prior pass) |
| `src/pages/Landing.jsx:5` `minHeight: '100vh'` | Low risk (min-height + page scrolls) — Phase 3 tidy |
| `src/pages/Welcome.jsx:3` `minHeight: '100vh'` | Same |
| `src/components/AskChat.jsx:64` | ✅ already `100dvh` |

## 3. Biggest structural finding (honest trade-off)

The brief's Phase 2 constraint — *"Do not hardcode any px font size or margin anywhere else in the codebase; all spacing and type must reference tokens"* — collides with reality: **467 inline px font-sizes/spacings across 18 JSX files**. Migrating all of them IS a rewrite of the presentation layer, which the brief forbids ("Do not rewrite the app").

Proposed scope resolution (needs your sign-off):
- **Do:** create the token file (fluid type + space scales), wire `styles.css` to it, use tokens for all NEW/CHANGED code, add layout primitives (`.stack`, `.container`, `.grid-auto`, `.switcher`, `.prose`), container-queries for the card/chart panels, chart+table fixes (Phase 5), Playwright suite (Phase 6).
- **Don't (this round):** touch the 467 existing inline styles wholesale. They are px-based but small-scale (labels 10–15px) and are not what causes overlap/overflow — the layout containers are, and those are covered above.

## 4. Phase 6 note

No test infrastructure exists (`package.json` has only vite/react deps). Playwright + Chromium (~130MB download) will be added as devDependency; tests will run against `vite preview` + the local FastAPI backend, or against static `dist/` with mocked API where pages hard-depend on data.

## 5. Verdict

The two real portrait-phone failure classes remaining after the prior pass:
1. **Charts**: fixed-height SVGs with dense axis labels become illegible/cramped (no tick thinning, donuts fixed-width) — Phase 5.
2. **Tables**: blanket card-scroll guard instead of accessible per-table scroll regions — Phase 5.
Plus foundation debt: no fluid type scale, no container queries, `.row` overflow trap — Phases 2–4.

**Awaiting confirmation to proceed to Phase 2 with the scope stated in §3.**
