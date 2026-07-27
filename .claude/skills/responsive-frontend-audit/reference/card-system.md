# The canonical card system: a reproducible framework

Battle-tested on HealthForecast (React + Vite, plain CSS). Portable to any
component framework: the CSS is the system, the components are thin wrappers.
Reference implementation: `src/components/ui/Card.jsx` + the CARD SYSTEM
section of `src/styles.css` in this repo.

## The one rule

Never fix a card page by page. Build ONE primitive set, migrate routes onto
it, and let every fix land in the primitive. If you write the same responsive
fix in a second file, it belongs in the primitive.

## 1. Tokens (with the accessibility ratio rule)

```css
:root {
  /* Every clamp() preferred value is rem + vw, never bare vw
     (bare vw blocks browser-zoom text scaling, WCAG 1.4.4).
     Max must stay within 2.5x min; write the ratio in a comment. */
  /* ratio 2.00 */ --card-gap: clamp(0.75rem, 0.65rem + 0.5vw, 1.5rem);
  /* ratio 1.75 */ --card-pad: clamp(1rem, 0.85rem + 0.75vw, 1.75rem);
  --card-min: 280px;
}
```

## 2. CardGrid

```css
.ui-cardgrid {
  display: grid;
  gap: var(--card-gap);
  /* min(var(--card-min), 100%) is MANDATORY: without it any viewport
     narrower than the track minimum overflows sideways. */
  grid-template-columns: repeat(auto-fit, minmax(min(var(--card-min), 100%), 1fr));
  container-type: inline-size;
  container-name: cardgrid;
}
/* Fixed counts opt in and ALWAYS start single column (mobile-first). */
.ui-cardgrid[data-cols] { grid-template-columns: 1fr; }
@media (min-width: 640px)  { .ui-cardgrid[data-cols] { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (min-width: 1100px) { .ui-cardgrid[data-cols="3"] { grid-template-columns: repeat(3, minmax(0,1fr)); }
                             .ui-cardgrid[data-cols="4"] { grid-template-columns: repeat(4, minmax(0,1fr)); } }
```

## 3. Card slots (map YOUR app's content onto these)

Root: `min-width: 0`, `overflow: hidden`, `container-type: inline-size`,
`container-name: card`, padding `var(--card-pad)`.

- Header: `flex flex-wrap justify-between gap` so the status chip drops to
  its own line instead of squeezing the title.
- Title / Description: `min-width: 0`, `overflow-wrap: break-word`.
- FileLabel (filenames, ids, URLs): monospace + `overflow-wrap: anywhere`.
  These strings have no natural break point and are the number one cause of
  card overflow.
- StatusChip: `white-space: nowrap` + `flex-shrink: 0`, inside a WRAPPING row.
- MetricRow (`Rows 2,440`): `flex justify-between gap`, label `min-width: 0`,
  value `flex-shrink: 0` + tabular numerals + `white-space: nowrap` (numbers
  must never wrap mid-figure).
- SourceRow: same shrink rules as MetricRow.
- Actions: `flex flex-wrap gap`; below ~240px of CONTAINER width the buttons
  go full width and stack:

```css
@supports (container-type: inline-size) {
  @container card (max-width: 240px) {
    .ui-card-actions > * { width: 100%; justify-content: center; }
  }
}
/* Touch targets: 44px only under pointer:coarse so desktop is unchanged.
   24px (WCAG 2.5.8 AA) is the enforced floor everywhere. */
@media (pointer: coarse) { .ui-card-actions > * { min-height: 44px; } }
```

## 4. Universal shrink discipline

- Every direct child of a flex or grid container that contains text gets
  `min-width: 0`. (Flex/grid items default to min-width auto: a content
  minimum, so children refuse to shrink. This is the root cause of most
  card clipping.)
- `white-space: nowrap` requires `flex-shrink: 0` AND a wrapping parent.
- No fixed pixel widths on cards or internals. No `100vw` (scrollbar width).

## 5. Decorative overlays (the KPI sparkline lesson)

Anything absolutely positioned over card content must either RESERVE its
footprint in the flowing content (`:has(.decoration) .label { padding-right: X }`)
or hide below a container width. Decoration never wins against content.

## 6. Migration order (proved effective)

1. Inventory every card and grid: route, file, grid classes, slots (table).
2. Build primitives; commit alone.
3. Migrate the most broken route first, verify at 320 to 1920, commit per route.
4. Delete bespoke markup as you go: no v2 components left behind.
5. Page chrome once, globally: safe-area insets (+ `viewport-fit=cover`),
   svh with vh fallback, accessible drawer (Escape, aria-expanded/controls,
   focus trap and return).

## 7. Verification gates (claims require these)

- No horizontal overflow: `scrollWidth <= clientWidth + 1`, every route,
  320 to 1920.
- CRITICAL: overflow tests pass even when `overflow-x: clip` is MASKING
  clipped text. Also assert per element: title, description, file label
  each have `scrollWidth <= clientWidth`.
- Console clean at 320px: no NaN, bad path or attribute errors, no pageerror.
- Hit areas: fail below 24px, report 24 to 44.
- No overlapping clickable bounding boxes.
- 200% zoom: approximate with a 640px viewport run; true browser zoom needs
  a manual check.
- Wire the suite into CI so the build fails at 320px.

## 7b. The scrollable-flex-column banner trap (field lesson)

A child of a scrollable flex column shrinks by default, and `overflow: hidden`
zeroes its automatic minimum size, so a rounded banner (overflow hidden for
the corners) silently compresses to its min-height and clips its own kicker
and buttons on content-heavy pages. Any flex-column child that must keep its
natural height needs `flex-shrink: 0`. Assert it: for every banner,
`scrollHeight <= clientHeight + 1`.

## 8. Deployment gotchas met in the field

- Git does not track empty directories: deleting a folder's last file breaks
  `COPY folder` in Docker on fresh clones. Keep a real file in copied dirs.
- Machine-load timeouts in Playwright look like failures: re-run isolated
  before believing a red result (cloud-synced folders and antivirus scanning
  screenshot writes are the usual culprits).
