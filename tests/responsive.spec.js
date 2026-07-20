// Responsive verification suite (Phase 6 of the remediation).
// 1) No horizontal overflow on any route at any width (portrait first).
// 2) No overlapping text bounding boxes on key pages at phone widths.
// 3) Screenshots for manual review at representative widths.
//
// Note: the API backend is not required — pages render their error/empty
// states, which still exercises the layout system.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const WIDTHS = [320, 360, 390, 414, 768, 1024, 1440, 1920];
// Portrait heights for phone/tablet widths; standard desktop heights above.
const HEIGHT = { 320: 693, 360: 800, 390: 844, 414: 896, 768: 1024, 1024: 1366, 1440: 900, 1920: 1080 };
const SHOT_WIDTHS = [320, 390, 768, 1440]; // screenshot subset (all routes) — full 8-width run kept for assertions

const ROUTES = [
  'landing', 'welcome', 'dashboard', 'upload', 'prepare', 'explore',
  'forecast-total', 'forecast-specialty', 'staff', 'supply',
  'optimize', 'actions', 'admin',
];

const KEY_PAGES = ['dashboard', 'explore', 'forecast-total', 'supply'];
const OVERLAP_WIDTHS = [320, 390];

fs.mkdirSync('screenshots', { recursive: true });

async function openRoute(page, route, width) {
  await page.setViewportSize({ width, height: HEIGHT[width] });
  await page.goto(`/#${route}`);
  // Let failed API fetches settle and ResizeObserver-driven charts re-measure.
  await page.waitForTimeout(1500);
}

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test(`${route} @ ${width}px — no horizontal overflow`, async ({ page }) => {
      await openRoute(page, route, width);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(m.sw, `scrollWidth ${m.sw}px exceeds viewport ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
      if (SHOT_WIDTHS.includes(width)) {
        await page.screenshot({ path: `screenshots/${route}-${width}.png`, fullPage: true });
      }
    });
  }
}

for (const route of KEY_PAGES) {
  for (const width of OVERLAP_WIDTHS) {
    test(`${route} @ ${width}px — no overlapping text blocks`, async ({ page }) => {
      await openRoute(page, route, width);
      const collisions = await page.evaluate(() => {
        const sel = [
          '.content h1', '.content h2', '.content h3', '.content p',
          '.content .kpi-label', '.content .kpi-value', '.content .card-title',
          '.content .card-sub', '.content .page-head-title', '.exp-page .exp-ct',
          '.exp-page .exp-lab', '.exp-page .exp-val',
        ].join(',');
        const els = [...document.querySelectorAll(sel)].filter((e) => {
          const r = e.getBoundingClientRect();
          return e.offsetParent !== null && r.width > 0 && r.height > 0 && (e.textContent || '').trim();
        });
        const bad = [];
        for (let i = 0; i < els.length; i++) {
          for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect();
            const b = els[j].getBoundingClientRect();
            const xOv = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const yOv = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (xOv > 4 && yOv > 4) {
              bad.push(`"${els[i].textContent.trim().slice(0, 30)}" <-> "${els[j].textContent.trim().slice(0, 30)}"`);
            }
          }
        }
        return bad;
      });
      expect(collisions, `overlapping text: ${collisions.join('; ')}`).toHaveLength(0);
    });
  }
}
