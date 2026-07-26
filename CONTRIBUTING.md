# Contributing notes

## Responsive breakpoint contract

The frontend is mobile-first. Before merging any UI change:

- Base styles target the smallest viewport (320px). Enhancements are
  min-width additions; never patch desktop styles down with max-width.
- The one layout breakpoint is 820px (`src/styles.css`): below it the
  sidebar becomes a drawer, fixed inline grids collapse, tables scroll
  inside labelled regions, touch targets grow to 44px.
- Fluid type and spacing come from `src/styles/tokens.css` (clamp scales,
  320px to 1240px). Do not hardcode new px font sizes in CSS.
- `100dvh` is used for app height (with a `100vh` fallback line above it).
- Safe-area insets (`env(safe-area-inset-*)`) protect fixed and floating
  UI on notched phones; `index.html` sets `viewport-fit=cover`.
- Charts are hand-rolled SVG (`src/components/Charts.jsx`). Every chart
  measures its own width (`useMeasuredWidth`) and must guard: empty data,
  single-point data, zero totals, and non-finite values. Never call
  `Math.max(...arr)` on a possibly empty array.

## The gate

`npx playwright test` must pass before claiming any UI change works.
The suite asserts, per route: no horizontal overflow at 8 widths
(320 to 1920), no overlapping text at phone widths, and a console free
of chart/SVG errors (NaN, bad path, invalid attribute) at 320px and
393px. A UI change that fails the suite is not done.

Backend rule reminder: `python -c "import main"` must pass from `api/`,
and commits carry only Jonathan's name (see CLAUDE.md).
