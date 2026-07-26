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
const HEIGHT = { 320: 693, 360: 800, 390: 844, 393: 852, 414: 896, 640: 800, 768: 1024, 1024: 1366, 1440: 900, 1920: 1080 };
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

// Chart/SVG runtime failures worth failing the build over (skill Phase 3
// acceptance: console clean at 320px). Network noise from the absent backend
// is not a layout failure and is ignored.
const BAD_CONSOLE = /NaN|Expected (length|number|moveto)|Invalid value|attribute [dxy012]/i;
const IGNORED_CONSOLE = /Failed to load resource|net::ERR|favicon|load failed/i;
const CONSOLE_WIDTHS = [320, 393];

for (const route of ROUTES) {
  for (const width of CONSOLE_WIDTHS) {
    test(`${route} @ ${width}px — console clean (no chart/SVG errors)`, async ({ page }) => {
      const errors = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text())) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.setViewportSize({ width, height: width === 320 ? 693 : 852 });
      await page.goto(`/#${route}`);
      await page.waitForTimeout(1500);
      const bad = errors.filter((e) => BAD_CONSOLE.test(e));
      const crashes = errors.filter((e) => /^Error|^TypeError|^RangeError/.test(e));
      expect([...bad, ...crashes], `console: ${[...bad, ...crashes].join(' | ')}`).toHaveLength(0);
    });
  }
}

// Card-system contract: no clipped card text, no overlapping clickables,
// every interactive element meets the 24px WCAG 2.5.8 AA floor. Elements
// between 24 and 44px are reported, not failed (44 is the AAA/touch goal,
// applied via pointer:coarse media query).
const CARD_ROUTES = ROUTES.filter((r) => !['landing', 'welcome'].includes(r));
for (const route of CARD_ROUTES) {
  for (const width of [320, 393]) {
    test(`${route} @ ${width}px — card text unclipped, hit areas sane`, async ({ page }) => {
      await openRoute(page, route, width);
      const r = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const visible = (b) => b.width > 0 && b.height > 0 && b.right > 0 && b.left < vw && b.bottom > 0 && b.top < vh;
        const clipped = [];
        document.querySelectorAll('.ui-card-title, .ui-card-desc, .ui-card-file, .ui-card-metric-label, .card-title, .card-sub, .kpi-label').forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.className}: ${(el.textContent || '').trim().slice(0, 40)}`);
        });
        const small = [];
        let under44 = 0;
        const boxes = [];
        document.querySelectorAll('button, [role="button"]').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (!visible(b) || el.offsetParent === null) return;
          if (b.width < 24 || b.height < 24) small.push(`${(el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 24)} ${Math.round(b.width)}x${Math.round(b.height)}`);
          else if (b.width < 44 || b.height < 44) under44 += 1;
          boxes.push([b, el]);
        });
        let overlaps = 0;
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            if (boxes[i][1].contains(boxes[j][1]) || boxes[j][1].contains(boxes[i][1])) continue;
            const a = boxes[i][0], b = boxes[j][0];
            const xo = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const yo = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (xo > 2 && yo > 2) overlaps += 1;
          }
        }
        return { clipped, small, overlaps, under44 };
      });
      expect(r.clipped, `clipped card text: ${r.clipped.join('; ')}`).toHaveLength(0);
      expect(r.small, `hit areas under the 24px AA floor: ${r.small.join('; ')}`).toHaveLength(0);
      expect(r.overlaps, 'overlapping clickable bounding boxes').toBe(0);
      console.log(`${route}@${width}px: ${r.under44} interactive element(s) between 24 and 44px (reported, not failed)`);
    });
  }
}

// 200% browser zoom approximation: a 640px viewport lays out like 1280px at
// 200% zoom. True browser-zoom behaviour on a real device stays UNVERIFIED.
for (const route of ['dashboard', 'upload', 'prepare', 'landing']) {
  test(`${route} @ 640px (zoom 200% approximation) — no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await page.goto(`/#${route}`);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
  });
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
