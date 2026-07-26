/* Playwright multi-viewport audit: overflow + console cleanliness.
   Adapt ROUTES and BASE to the project, then: npx playwright test */
import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const ROUTES = ['/']; // add every route

const VIEWPORTS = [
  { name: 'small-android', width: 360, height: 640 },
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-pro', width: 393, height: 852 },
  { name: 'large-android', width: 412, height: 915 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
];

// Chart/SVG runtime failures worth failing the build over.
const BAD_CONSOLE = /NaN|Expected (length|number|moveto)|Invalid value|attribute [dxy]/i;
// Noise from a missing backend in test runs; not layout failures.
const IGNORED = /Failed to load resource|net::ERR|favicon/i;

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${route} @ ${vp.name} (${vp.width}px): no overflow, clean console`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.scrollingElement!.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(scrollW, `horizontal overflow on ${route}`).toBeLessThanOrEqual(clientW + 1);

      const chartErrors = errors.filter((e) => BAD_CONSOLE.test(e));
      expect(chartErrors, `console errors on ${route}: ${chartErrors.join(' | ')}`).toHaveLength(0);
    });
  }
}
