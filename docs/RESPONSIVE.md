# Responsive contract: the card system

This file records the rules every new or migrated piece of UI must follow.
The canonical primitives live in `src/components/ui/Card.jsx` with their CSS
in the CARD SYSTEM section of `src/styles.css`. New cards use the primitives,
never bespoke markup. If a card needs a slot that does not exist, add the
slot to the primitive.

## CardGrid pattern

- Default is intrinsic: `repeat(auto-fit, minmax(min(var(--card-min), 100%), 1fr))`.
  The `min(..., 100%)` wrapper is mandatory: without it any viewport narrower
  than the track minimum overflows sideways.
- `minItemWidth` tunes density per usage (dense metrics 200, detail 360).
- `columns={2|3|4}` is the fixed-count opt-in and always resolves to a
  single-column mobile base (1 col, 2 at 640px, N at 1100px). Never write a
  bare fixed-count grid.

## Clamp ratio rule (WCAG 1.4.4)

Every `clamp()` preferred value is a `rem + vw` expression, never bare `vw`
(bare vw blocks browser-zoom text scaling). The max must stay within 2.5x
the min; write the computed ratio in a comment above the token
(see `src/styles/tokens.css`).

## min-width: 0 discipline

Flex and grid items default to `min-width: auto`, a content-based minimum,
so a child refuses to shrink below its widest content. Therefore:

- every direct child of a flex or grid container that contains text gets
  `min-width: 0`
- anything with `white-space: nowrap` also gets `flex-shrink: 0` AND lives
  inside a wrapping parent
- filenames and other unbreakable strings use `Card.FileLabel`
  (`overflow-wrap: anywhere`, monospace)
- numbers use `.tnum` (tabular, never wraps mid-figure)
- no fixed pixel widths on cards or their internals, no `100vw` (use `100%`)

## Touch targets

- WCAG 2.2 SC 2.5.8 (AA, 24px) is the enforced floor: the test suite fails
  below it.
- 44px (AAA / Apple HIG; Android Material wants 48) is the touch goal,
  applied to card actions via `@media (pointer: coarse)` so desktop visuals
  do not change. Elements between 24 and 44px are reported by the suite,
  not failed.

## Viewport height

`vh` fallback first, then `svh` for content that must be visible on load
(`.lp-page`). `dvh` only where live toolbar tracking is wanted (the app
shell). Interior scrolling pages prefer plain `min-height`.

## Verification gate

`npx playwright test` runs on every push via `.github/workflows/responsive.yml`
and fails the build on: horizontal overflow (320 to 1920), chart or SVG
console errors at phone widths, clipped card text, sub-24px hit areas, or
overlapping clickable elements. A UI change that fails the suite is not done.
