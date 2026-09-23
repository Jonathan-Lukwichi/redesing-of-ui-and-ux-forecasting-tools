// Visual regression baselines.
//
// Phase 3 rewrites how colour and type are expressed across every page (873
// hardcoded hex values, 969 inline style blocks). The refactor is supposed to
// be INVISIBLE: the same pixels, expressed through tokens instead of literals.
// This suite is what makes "supposed to be" checkable — a baseline captured
// before the change, compared after it. A diff means either a real bug or an
// intentional change that has to be justified and re-baselined on purpose.
//
// Deliberately NOT part of the default run. Screenshot comparison is sensitive
// to font rendering and GPU, so baselines captured on one machine will not
// match another. Run it locally around a styling change:
//
//   VISUAL=1 npx playwright test --project=visual                    # compare
//   VISUAL=1 npx playwright test --project=visual --update-snapshots  # re-baseline
//
// The backend is not needed: pages render their error/empty states, which is
// exactly what we want here — deterministic output with no data variance.
import { test, expect } from '@playwright/test';

// Hard guard, not just a project filter. Baselines are machine-specific (font
// rendering, GPU), so this suite must never run somewhere it did not capture
// them — including when someone types a bare `npx playwright test`. Opting in
// is explicit:  VISUAL=1 npx playwright test --project=visual
test.skip(!process.env.VISUAL,
  'Visual baselines are machine-specific. Run with VISUAL=1 --project=visual.');

const ROUTES = [
  'landing', 'welcome', 'dashboard', 'upload', 'prepare', 'explore',
  'forecast-total', 'forecast-specialty', 'staff', 'supply',
  'optimize', 'actions', 'admin',
];

// One phone, one tablet, one desktop. Enough to catch a layout regression
// without a baseline set so large nobody reviews the diffs.
const VIEWPORTS = [
  { name: 'phone',   width: 390,  height: 844 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`${route} @ ${vp.name} — unchanged`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/#${route}`);

      // Let failed API calls settle and ResizeObserver-driven charts measure.
      await page.waitForTimeout(1500);

      // Freeze anything that would differ run to run for reasons unrelated to
      // styling: animation, caret blink, and any rendered clock.
      await page.addStyleTag({ content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
      `});

      await page.waitForTimeout(150);

      await expect(page).toHaveScreenshot(`${route}-${vp.name}.png`, {
        fullPage: true,
        // Tuned against a canary: a 40px border added to <body> must fail
        // EVERY page. A ratio threshold does not do that — on a tall full-page
        // screenshot even an obvious change is a tiny fraction of total pixels,
        // and 0.002 let 37 of 39 pages through. An absolute pixel budget is the
        // right shape: font antialiasing moves a handful of pixels, any real
        // colour or layout change moves thousands.
        maxDiffPixels: 120,
        threshold: 0.1,
        // Landing and Welcome carry an animated backdrop (HeroMotion): a
        // looping <video>, with an animated <canvas> — drifting grid, breathing
        // uncertainty band, pulsing marker — as the fallback while the video
        // loads. Both paint a different frame on every capture, and WHICH of
        // the two is showing is itself a load race, so those six screenshots
        // failed against their own unchanged baseline.
        //
        // Nothing about the backdrop is changed, hidden or removed: it plays
        // for a visitor exactly as it always did. It is masked out of the pixel
        // COMPARISON only, because a moving picture cannot serve as a baseline.
        // Everything layered over and around it is still compared normally.
        //
        // Masking <canvas> is safe here: every chart in this app is inline SVG,
        // so HeroMotion is the only canvas on any page.
        mask: [page.locator('video'), page.locator('canvas')],
        maskColor: '#000000',
        animations: 'disabled',
scale: 'css',
      });
    });
  }
}
