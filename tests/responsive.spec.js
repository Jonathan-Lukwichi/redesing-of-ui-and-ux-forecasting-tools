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

// ---- Data Hub mocks ---------------------------------------------------------
// Data Hub needs data:write, so without a backend it renders the sign-in card
// only. The upload route's layout checks run against a mocked admin session
// and a pipeline mid-run, so they cover the checklist and the stage tracker.
const DH_SLOTS = [
  ['daily_arrival', 'Daily arrivals', 'hospital', 'pure_daily_arrival.csv', ['date']],
  ['hourly_arrival', 'Hourly arrivals', 'hospital', 'pure_hourly_arrival.csv', ['date', 'hour']],
  ['clinical_daily', 'Clinical daily', 'hospital', 'pure_clinical_arrival.csv', ['date']],
  ['clinical_hourly', 'Clinical hourly', 'hospital', 'pure_hourly_clinical_arrival.csv', ['date', 'hour']],
  ['calendar', 'Calendar features', 'external', 'calendar_features_2019_2026.csv', ['date']],
  ['weather_daily', 'Weather daily', 'external', 'pretoria_weather_daily_2019_2026.csv', ['date']],
  ['weather_hourly', 'Weather hourly', 'external', 'pretoria_weather_hourly_2019_2026.csv', ['date', 'hour']],
  ['inventory_items', 'Inventory items', 'inventory', 'inventory_items.csv', ['item_id']],
  ['inventory_movements', 'Inventory movements', 'inventory', 'inventory_movements.csv', ['date', 'item_id']],
  ['staff_list', 'Staff list', 'scheduling', 'staff_list.csv', ['staff_id']],
  ['shift_log', 'Shift log', 'scheduling', 'shift_log.csv', ['date', 'shift']],
  ['staffing_daily', 'Staffing daily', 'scheduling', 'staffing_daily.csv', ['date']],
].map(([id, label, category, hint, keys]) => ({
  id, label, category, source_filename_hint: hint, key_columns: keys,
  description: `${label} source file`, grain: 'daily', expected_rows_hint: 2000,
  required_columns: keys, expected_columns: keys,
}));
const DH_STAGES = [['check', 'Check'], ['transform', 'Transform'], ['operations', 'Operations'],
  ['consolidate', 'Consolidate'], ['analyse', 'Analyse'], ['forecast', 'Forecast'],
  ['optimise', 'Optimise'], ['recommend', 'Recommend']];

function dhInventory(loadedIds = []) {
  return {
    items: DH_SLOTS.map((schema) => ({
      schema,
      loaded: loadedIds.includes(schema.id),
      metadata: loadedIds.includes(schema.id)
        ? { filename: schema.source_filename_hint, rows: 2580, schema_valid: true,
            date_range: { start: '2019-01-01', end: '2026-01-31' }, columns: schema.key_columns }
        : null,
    })),
    loaded_count: loadedIds.length, total: 7,
  };
}

// done: how many stages finished; running: whether stage `done` is running.
function dhStatus({ done = 0, running = false, failed = false } = {}) {
  const stages = DH_STAGES.map(([id, label], i) => {
    let status = 'pending';
    if (i < done) status = 'done';
    else if (i === done && running) status = 'running';
    else if (i === done && failed) status = 'failed';
    else if (i > done && failed) status = 'skipped';
    return {
      id, label, status, peak_mb: null,
      seconds: i < done ? 3.25 + i : null,
      receipt: i < done
        ? (id === 'transform'
          ? '80 months, 138,287 arrivals, no patient identifiers kept; pure_hourly_clinical_arrival.csv rebuilt'
          : `${label} finished`)
        : (status === 'failed' ? 'The files are not ready. inventory_items.csv: Missing file.' : null),
      warnings: id === 'transform' && i < done
        ? ['Hourly clinical figures are each day\'s values repeated across its 24 hours, not counts measured hour by hour.']
        : [],
    };
  });
  return {
    data_version: 3, running,
    started_at: done || running || failed ? '2026-11-02T12:05:00+00:00' : null,
    finished_at: !running && (done === DH_STAGES.length || failed) ? '2026-11-02T12:25:00+00:00' : null,
    stages, source: { mode: 'default' }, origin: 'simulated',
  };
}

const DH_PREFLIGHT_MISSING = {
  ok: false,
  issues: [
    { level: 'error', file: 'pure_daily_arrival.csv', message: 'No arrivals found. Upload the monthly registers or the daily arrivals file.' },
    { level: 'error', file: 'inventory_items.csv', message: 'Missing file. Upload it before running.' },
    { level: 'warning', file: 'calendar_features_2019_2026.csv', message: 'Daily arrivals cover 31 days past the end of the calendar (2026-01-31).' },
  ],
  replaced_months: [], arrivals_source: null,
};
const DH_STAGED = {
  months: [
    { file: 'Casualty_Daily_Register_2025_01.xlsx', month: '2025-01', days: 31, arrivals: 4102, hourly_rows: 744, clinical_columns: 40, sha256: 'a' },
    { file: 'Casualty_Daily_Register_2025_02.xlsx', month: '2025-02', days: 28, arrivals: 3811, hourly_rows: 672, clinical_columns: 40, sha256: 'b' },
  ],
  unapplied: ['2025-02'],
};

// Mocks every Data Hub GET. Returns a counter of /api/pipeline/* calls by
// "METHOD path" so tests can assert what was (and was not) requested.
async function mockDataHub(page, {
  status = dhStatus(), preflight = DH_PREFLIGHT_MISSING, staged = DH_STAGED, loaded = [],
} = {}) {
  const calls = {};
  const count = (r) => {
    const u = new URL(r.url());
    const key = `${r.method()} ${u.pathname}`;
    calls[key] = (calls[key] || 0) + 1;
  };
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: {
    user: { username: 'admin', role: 'admin', scopes: ['data:write', 'data:read', 'forecast:read'], action_categories: [] },
    auth_mode: 'protected', auth_configured: true,
  } }));
  // Any of status, preflight and loaded may be a function, read on each request.
  const now = (v) => (typeof v === 'function' ? v() : v);
  await page.route('**/api/datasets/inventory', (r) => r.fulfill({ json: dhInventory(now(loaded)) }));
  await page.route('**/api/datasets/source/status', (r) => r.fulfill({ json: { configured: false } }));
  await page.route('**/api/pipeline/status', (r) => { count(r.request()); return r.fulfill({ json: now(status) }); });
  await page.route('**/api/pipeline/staged', (r) => { count(r.request()); return r.fulfill({ json: staged }); });
  await page.route('**/api/pipeline/preflight', (r) => { count(r.request()); return r.fulfill({ json: now(preflight) }); });
  return calls;
}

async function prepareRoute(page, route) {
  // The layout checks see the upload page mid-run: three stages done, one running.
  if (route === 'upload') await mockDataHub(page, { status: dhStatus({ done: 3, running: true }) });
}

async function openRoute(page, route, width) {
  await prepareRoute(page, route);
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
      await prepareRoute(page, route);
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
        // Page banners must never be vertically compressed by the flex column
        document.querySelectorAll('.page-hero').forEach((el) => {
          if (el.scrollHeight > el.clientHeight + 1) clipped.push(`page-hero vertically clipped: ${el.scrollHeight}px content in ${el.clientHeight}px box`);
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
    await prepareRoute(page, route);
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

// Plan C rule: NOTHING computes on Dashboard, Optimization or Data Hub page load. Only light state
// reads (GET /policy, /last-style lookups the user explicitly presses) are
// allowed; any POST or heavy evidence/compare/tune/run call on load fails.
for (const route of ['dashboard', 'optimize', 'upload']) {
test(`${route} @ 390px — no heavy compute on page load`, async ({ page }) => {
  const heavy = [];
  page.on('request', (r) => {
    const url = r.url();
    const isApi = url.includes('/api/');
    if (!isApi) return;
    const banned = r.method() === 'POST'
      || /forecast-options|compare-demo|sweep-demo|strategy-compare|policy\/tune(?!\/last)/.test(url);
    if (banned) heavy.push(`${r.method()} ${url}`);
  });
  await prepareRoute(page, route);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#${route}`);
  await page.waitForTimeout(2000);
  expect(heavy, `heavy calls on load: ${heavy.join(' | ')}`).toHaveLength(0);
});
}

// The Dashboard shows total-ED KPIs; a last run of kind "specialty" must not feed it.
test('dashboard @ 390px — a specialty last-run shows the empty state', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('**/api/forecast/last', (r) => r.fulfill({
    json: { available: true, kind: 'specialty', ran_at: 'x', result: { history: [], forecast: [] } },
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#dashboard');
  await expect(page.getByText('No forecast has been run yet')).toBeVisible();
});

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

// ---- Data Hub: upload everything, run the pipeline (Task 13) -----------------
const DH_GROUPS = ['Patient registers', 'External factors', 'Inventory', 'Scheduling'];

test('upload @ 390px — checklist shows the four groups and Run is disabled while files are missing', async ({ page }) => {
  const calls = await mockDataHub(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const checklist = page.locator('.pl-checklist');
  for (const g of DH_GROUPS) await expect(checklist.getByText(g, { exact: true })).toBeVisible();
  // A missing file and a problem are each named on the file's own row.
  await expect(checklist.getByText('Missing file. Upload it before running.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run full pipeline' })).toBeDisabled();
  // The staged panel says where staged files live.
  await expect(page.getByText(/held in memory until you clear them or the server restarts/)).toBeVisible();
  // Load reads status, staged and preflight, with GETs only.
  expect(Object.keys(calls).sort()).toEqual(
    ['GET /api/pipeline/preflight', 'GET /api/pipeline/staged', 'GET /api/pipeline/status']);
  // The per-slot tiles live in a collapsed Advanced section.
  const advanced = page.locator('details.pl-advanced');
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(page.getByText('Section C · Operations')).toBeHidden();
  await advanced.locator('summary').click();
  await expect(page.getByText('Section C · Operations')).toBeVisible();
});

test('upload @ 390px — a running pipeline shows all eight stages and polls status', async ({ page }) => {
  const calls = await mockDataHub(page, { status: dhStatus({ done: 3, running: true }) });
  const posts = [];
  page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') posts.push(r.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const tracker = page.locator('.pl-stages');
  await expect(tracker.locator('.pl-stage')).toHaveCount(8);
  for (const [, label] of DH_STAGES) await expect(tracker.getByText(label, { exact: true })).toBeVisible();
  await expect(tracker.getByText(/80 months, 138,287 arrivals/)).toBeVisible();
  await expect(tracker.locator('.pl-stage[data-status="running"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Run full pipeline' })).toBeDisabled();
  // No pipeline card may be squashed by the page's flex column.
  const squashed = await page.evaluate(() => [...document.querySelectorAll('.content > .ui-card, .content .ui-cardgrid > .ui-card')]
    .filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.className));
  expect(squashed, `vertically clipped cards: ${squashed.join('; ')}`).toHaveLength(0);
  await page.waitForTimeout(4500);
  expect(calls['GET /api/pipeline/status']).toBeGreaterThanOrEqual(3);
  expect(posts).toHaveLength(0);
});

test('upload @ 390px — a finished run links to every results page', async ({ page }) => {
  const calls = await mockDataHub(page, { status: dhStatus({ done: 8 }) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const summary = page.locator('.pl-summary');
  for (const name of ['Explore', 'Forecast', 'Staffing', 'Supply', 'Optimization', 'Action Center']) {
    await expect(summary.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.waitForTimeout(2500);
  expect(calls['GET /api/pipeline/status']).toBe(1); // no polling once finished
  await summary.getByRole('button', { name: 'Supply', exact: true }).click();
  await expect(page).toHaveURL(/#supply$/);
});

test('upload — files are classified by name', async () => {
  const { classify } = await import('../src/components/pipeline/classify.js');
  expect(classify('Casualty_Daily_Register_2025_03.xlsx', DH_SLOTS)).toEqual({ kind: 'register' });
  expect(classify('pure_daily_arrival.csv', DH_SLOTS)).toEqual({ kind: 'slot', id: 'daily_arrival' });
  expect(classify('staff_list.csv', DH_SLOTS)).toEqual({ kind: 'slot', id: 'staff_list' });
  expect(classify('Casualty Register March.xlsx', DH_SLOTS)).toEqual({ kind: 'unknown' });
  expect(classify('staff_list (1).csv', DH_SLOTS)).toEqual({ kind: 'unknown' });
  expect(classify('notes.txt', DH_SLOTS)).toEqual({ kind: 'unknown' });
  expect(classify('pure_daily_arrival.csv', [])).toEqual({ kind: 'unknown' });
});

test('upload @ 390px — dropped files upload one at a time with receipts; unknown files are refused', async ({ page }) => {
  await mockDataHub(page);
  let inFlight = 0;
  let maxInFlight = 0;
  const registerNames = [];
  const contentTypes = [];
  await page.route(/\/api\/pipeline\/registers/, async (r) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const name = new URL(r.request().url()).searchParams.get('filename');
    registerNames.push(name);
    contentTypes.push(r.request().headers()['content-type'] || '');
    await new Promise((res) => setTimeout(res, 150));
    inFlight -= 1;
    if (name.endsWith('2025_02.xlsx')) {
      return r.fulfill({ status: 422, json: { detail: `${name}: could not read the daily section` } });
    }
    return r.fulfill({ json: { file: name, month: '2025-01', days: 31, arrivals: 4102, hourly_rows: 744, clinical_columns: 40, status: 'added' } });
  });
  const slotUploads = [];
  await page.route(/\/api\/datasets\/[a-z_]+\/upload/, (r) => {
    slotUploads.push(new URL(r.request().url()).pathname);
    return r.fulfill({ status: 400, json: { detail: {
      error: 'missing_required_columns', target_id: 'daily_arrival', target_label: 'Daily arrivals',
      filename: 'pure_daily_arrival.csv', missing_required: ['total_daily_arrivals'],
      message: "This file is missing required columns for Daily arrivals: ['total_daily_arrivals']. It looks like the 'Hourly arrivals' dataset (confidence 92%).",
      best_fit: { id: 'hourly_arrival', label: 'Hourly arrivals', confidence: 0.92 },
    } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  // The zone opens once the file list it sorts by has loaded.
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  await page.locator('.pl-drop input[type="file"]').setInputFiles([
    { name: 'Casualty_Daily_Register_2025_01.xlsx', mimeType: xlsx, buffer: Buffer.from('x') },
    { name: 'Casualty_Daily_Register_2025_02.xlsx', mimeType: xlsx, buffer: Buffer.from('y') },
    { name: 'pure_daily_arrival.csv', mimeType: 'text/csv', buffer: Buffer.from('date\n2025-01-01\n') },
    { name: 'March register.xlsx', mimeType: xlsx, buffer: Buffer.from('z') },
  ]);
  const results = page.locator('.pl-results');
  await expect(results.getByText(/2025-01: 31 days, 4,102 arrivals/)).toBeVisible();
  await expect(results.getByText(/could not read the daily section/)).toBeVisible();
  await expect(results.getByText(/It looks like the 'Hourly arrivals' dataset/)).toBeVisible();
  await expect(results.getByRole('button', { name: /Upload there/ })).toBeVisible();
  await expect(results.getByText(/Casualty_Daily_Register_YYYY_MM\.xlsx/)).toBeVisible();
  await expect(page.locator('.pl-progress')).toContainText('3 of 3');
  expect(maxInFlight).toBe(1);
  expect(registerNames).toEqual(['Casualty_Daily_Register_2025_01.xlsx', 'Casualty_Daily_Register_2025_02.xlsx']);
  expect(contentTypes.some((t) => /multipart/.test(t))).toBe(false);
  expect(slotUploads).toEqual(['/api/datasets/daily_arrival/upload']);
});

test('upload @ 390px — Run asks before replacing months, and a busy server says a run is in progress', async ({ page }) => {
  let running = false;
  const calls = await mockDataHub(page, {
    preflight: { ok: true, issues: [], replaced_months: ['2025-01', '2025-02'], arrivals_source: 'both' },
    loaded: DH_SLOTS.map((s) => s.id),
    status: () => dhStatus(running ? { done: 1, running: true } : {}),
  });
  let runPosts = 0;
  await page.route('**/api/pipeline/run', (r) => {
    runPosts += 1;
    running = true;
    return r.fulfill({ status: 409, json: { error: 'already_running', message: 'A pipeline run is in progress. Wait for it to finish.' } });
  });
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs += 1; d.dismiss(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const run = page.getByRole('button', { name: 'Run full pipeline' });
  await expect(run).toBeEnabled();
  await run.click();
  const confirm = page.locator('.pl-confirm');
  await expect(confirm).toContainText('2025-01');
  await expect(confirm).toContainText('2025-02');
  expect(runPosts).toBe(0);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await run.click();
  await page.locator('.pl-confirm').getByRole('button', { name: /Replace and run/ }).click();
  await expect(page.getByText('A run is already in progress')).toBeVisible();
  expect(runPosts).toBe(1);
  const before = calls['GET /api/pipeline/status'];
  await page.waitForTimeout(2500);
  expect(calls['GET /api/pipeline/status']).toBeGreaterThan(before);
  await expect(page.locator('.pl-stage[data-status="running"]')).toHaveCount(1);
  expect(dialogs).toBe(0);
});

test('upload @ 390px — a refused download says so plainly', async ({ page }) => {
  await mockDataHub(page);
  await page.route(/\/api\/pipeline\/transformed\//, (r) => r.fulfill({ status: 403, json: { detail: {
    error: 'out_of_scope', scope: 'data:write', message: 'Your role (viewer) cannot upload or prepare data.' } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  await page.getByRole('button', { name: 'Download transformed CSVs' }).click();
  await expect(page.locator('.pl-staged')).toContainText('cannot upload or prepare data');
});

test('upload @ 390px — an Advanced tile upload re-reads preflight and the checklist row updates', async ({ page }) => {
  let itemsLoaded = false;
  const preflightNow = () => ({
    ...DH_PREFLIGHT_MISSING,
    issues: DH_PREFLIGHT_MISSING.issues.filter((i) => !(itemsLoaded && i.file === 'inventory_items.csv')),
  });
  const calls = await mockDataHub(page, {
    preflight: preflightNow,
    loaded: () => (itemsLoaded ? ['inventory_items'] : []),
  });
  await page.route('**/api/datasets/inventory_items/upload', (r) => {
    itemsLoaded = true;
    return r.fulfill({ json: { filename: 'inventory_items.csv', rows: 30, columns: ['item_id'], preview: [], schema_valid: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const row = page.locator('.pl-check-row', { has: page.locator('.ui-card-file', { hasText: /^inventory_items\.csv$/ }) });
  await expect(row).toHaveAttribute('data-state', 'problem');
  const before = calls['GET /api/pipeline/preflight'];
  await page.locator('details.pl-advanced summary').click();
  const tile = page.locator('.pl-advanced .ui-card', { has: page.locator('.ui-card-title', { hasText: /^Inventory items$/ }) });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    tile.getByRole('button', { name: 'Upload CSV' }).click(),
  ]);
  await chooser.setFiles({ name: 'inventory_items.csv', mimeType: 'text/csv', buffer: Buffer.from('item_id\nA\n') });
  await expect(row).toHaveAttribute('data-state', 'present');
  await expect(row).not.toContainText('Missing file');
  expect(calls['GET /api/pipeline/preflight']).toBeGreaterThan(before);
});

test('upload @ 390px — the drop zone waits for the file list it sorts by', async ({ page }) => {
  await mockDataHub(page);
  let release;
  const held = new Promise((res) => { release = res; });
  await page.route('**/api/datasets/inventory', async (r) => { await held; return r.fulfill({ json: dhInventory([]) }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const choose = page.getByRole('button', { name: 'Choose files' });
  await expect(choose).toBeDisabled();
  await expect(page.locator('.pl-drop')).toContainText('Loading the file list');
  release();
  await expect(choose).toBeEnabled();
});

test('upload @ 390px — "Upload there" is disabled while uploading and while running', async ({ page }) => {
  let running = false;
  await mockDataHub(page, {
    preflight: { ok: true, issues: [], replaced_months: [], arrivals_source: 'both' },
    loaded: DH_SLOTS.map((s) => s.id),
    status: () => dhStatus(running ? { done: 0, running: true } : {}),
  });
  let release;
  const held = new Promise((res) => { release = res; });
  await page.route(/\/api\/pipeline\/registers/, async (r) => {
    await held;
    return r.fulfill({ json: { file: 'x', month: '2025-01', days: 31, arrivals: 4102, hourly_rows: 744, clinical_columns: 40, status: 'added' } });
  });
  await page.route(/\/api\/datasets\/[a-z_]+\/upload/, (r) => r.fulfill({ status: 400, json: { detail: {
    error: 'missing_required_columns', message: "It looks like the 'Hourly arrivals' dataset (confidence 92%).",
    best_fit: { id: 'hourly_arrival', label: 'Hourly arrivals', confidence: 0.92 },
  } } }));
  await page.route('**/api/pipeline/run', (r) => { running = true; return r.fulfill({ json: dhStatus({ done: 0, running: true }) }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  await page.locator('.pl-drop input[type="file"]').setInputFiles([
    { name: 'pure_daily_arrival.csv', mimeType: 'text/csv', buffer: Buffer.from('date\n') },
    { name: 'Casualty_Daily_Register_2025_01.xlsx', mimeType: xlsx, buffer: Buffer.from('x') },
  ]);
  const uploadThere = page.locator('.pl-results').getByRole('button', { name: /Upload there/ });
  // The CSV failed with a best fit while the register is still in flight.
  await expect(uploadThere).toBeVisible();
  await expect(uploadThere).toBeDisabled();
  release();
  await expect(page.locator('.pl-progress')).toContainText('Finished');
  await expect(uploadThere).toBeEnabled();
  await page.getByRole('button', { name: 'Run full pipeline' }).click();
  await expect(page.locator('.pl-stage[data-status="running"]')).toHaveCount(1);
  await expect(uploadThere).toBeDisabled();
});
