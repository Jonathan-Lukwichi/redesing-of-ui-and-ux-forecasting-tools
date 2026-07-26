---
name: responsive-frontend-audit
description: Audit and repair a React/Next.js/Vite frontend so it renders correctly on every real device class (360px Android to 1920px+ desktop), fixing layout breakage AND the runtime errors narrow viewports trigger in chart/SVG code. Use when the user says a site is "not responsive", "broken on mobile", "cut off on phone", "doesn't fit", pastes a DevTools device-emulation screenshot, or reports SVG/chart console errors such as "Expected length, NaN" or "Expected moveto path command".
---

# Responsive Frontend Audit

Audit and repair a frontend for every real device class: small Android
(360x640), iPhone SE (375x667), notched iPhone (393x852, home indicator),
large Android (412x915), tablet portrait and landscape, laptop (1280),
wide desktop (1920+). Fix layout breakage AND the runtime errors that
narrow viewports trigger in data-visualisation code.

## Phase 0: Establish ground truth before changing anything

- Detect the stack: package.json, framework (Next App Router / Pages Router /
  Vite SPA), styling system (Tailwind version, CSS Modules, styled-components,
  plain CSS), chart library (Recharts, D3, Chart.js, hand-rolled SVG).
- Read tailwind.config, global CSS, and the root layout or index.html.
- Never assume Tailwind v4 syntax on a v3 project or vice versa.

## Phase 1: Diagnose overflow with a repeatable method, not by eye

- Confirm the viewport meta tag exists and is correct. For safe-area support
  it must include `viewport-fit=cover`.
- Search the codebase for overflow sources in this priority order:
  1. fixed px widths and min-width on layout containers
  2. unclamped display type
  3. nav or button rows with no collapse breakpoint
  4. whitespace-nowrap on long strings
  5. absolutely positioned decorative elements outside a relative parent
     with overflow clipped
  6. wide tables and code blocks
  7. images without max-width
  8. grid-cols-N without a mobile-first base
- Give the user the paste-in console snippet at `reference/overflow-detector.js`
  so culprits are identified rather than guessed at.
- Report findings as a ranked list with file and line references BEFORE editing.

## Phase 2: Fix layout, mobile-first, through a canonical card system

When the breakage involves cards or card grids (it almost always does), do
not patch page by page: build ONE primitive set and migrate routes onto it.
The full reproducible framework, including copy-ready CSS, migration order,
verification gates and field gotchas, is in `reference/card-system.md`.
Summary: fluid tokens with the rem+vw ratio rule, an auto-fit CardGrid with
the mandatory `min(var(--card-min), 100%)` wrapper, slotted Card components
(Header, Title, FileLabel, StatusChip, MetricRow, SourceRow, Actions),
universal `min-width: 0` shrink discipline, container-query action stacking,
and space reservation for decorative overlays.

## Phase 2b: General layout rules

- Base styles target the smallest viewport; every breakpoint is a min-width
  addition, never a max-width patch layered over a desktop design.
- Fluid type via clamp() instead of stepped size chains whose intermediate
  sizes were never checked.
- Replace 100vh with 100dvh (retain a 100vh fallback line above it).
- Add safe-area-inset padding for fixed headers, bottom bars, floating
  buttons and modals on notched iPhones (requires viewport-fit=cover).
- Enforce min 44x44px touch targets on all interactive elements.
- Collapse multi-item navigation into an accessible disclosure menu with
  focus handling and Escape support, not a CSS-only checkbox hack.
- Make tables horizontally scrollable inside a labelled scroll container
  (role="region", tabindex="0", aria-label) rather than widening the page.
- Add overflow-x: clip on the root wrapper only as a final safety net, after
  the real cause is fixed, and say explicitly in the report that it is a net
  and not a fix.

## Phase 3: Fix chart and SVG NaN errors (first-class step, not an afterthought)

- Any geometry derived from a measured container must guard the zero case:
  render nothing (or a skeleton) until width > 0 and height > 0.
- Clamp inner dimensions:
  `innerWidth = Math.max(0, width - marginLeft - marginRight)`; bail out at 0.
- Guard degenerate domains: when max === min, widen the domain or return a
  flat baseline instead of dividing by zero.
- Guard empty data: never call Math.max(...arr) on a possibly empty array;
  never divide by (length - 1) when length can be 1.
- Validate every generated path string starts with M before assigning to d,
  and filter non-finite points before building the string.
- Use ResizeObserver with an initial synchronous measurement in
  useLayoutEffect, not a bare useEffect that misses the first paint.
- Recharts specifically: ResponsiveContainer requires a parent with a
  resolved height; never nest it in a flex child with height auto.
- Acceptance criterion: the browser console must be clean at 320px width.
- Copy-ready safe patterns live in `reference/chart-guards.md`.

## Phase 4: Verify, do not claim

- Produce a device matrix table (template: `reference/device-matrix.md`):
  each viewport, pass or fail, per checked item (no horizontal scroll, text
  legible, nav usable, charts render, console clean, touch targets adequate).
- Where the environment permits, drive the check with Playwright at each
  viewport (suite: `reference/responsive-audit.spec.ts`), asserting
  `document.scrollingElement.scrollWidth <= clientWidth + 1` and capturing
  console errors.
- Where it does not, hand the user an explicit manual checklist and say
  plainly which items are unverified.

## Phase 5: Prevent regression

- Add a lightweight CI Playwright check that fails the build on horizontal
  overflow or chart console errors at 320px.
- Document the project's breakpoint contract in a short CONTRIBUTING note.

## Output style

- No em dashes anywhere in generated output or code comments.
- Diagnose before editing. Show the ranked cause list and wait for
  confirmation on anything architectural.
- Every claim about what is fixed must be tied to a verification step.
  If a fix is unverified, label it unverified.
- Prefer editing existing files over creating parallel "v2" components.
- Be honest when a layout problem needs a design decision rather than a
  code fix, and ask.
