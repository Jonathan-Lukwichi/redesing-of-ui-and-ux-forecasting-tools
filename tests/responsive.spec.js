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
  const finishedAt = !running && (done === DH_STAGES.length || failed) ? '2026-11-02T12:25:00+00:00' : null;
  // Results exist only once a whole run has finished (the server's results_ready).
  const ready = !running && !failed && done === DH_STAGES.length;
  return {
    data_version: 3, running, loading: false,
    started_at: done || running || failed ? '2026-11-02T12:05:00+00:00' : null,
    finished_at: finishedAt,
    stages, origin: 'simulated',
    results_ready: ready,
    results_source: ready ? 'sample' : null,
    run_source: done || running || failed ? 'sample' : null,
    source: ready ? { mode: 'sample', run: 3, finished_at: finishedAt } : { mode: 'none' },
  };
}

// Results pages mount only once a run has finished, so their layout checks run
// against a finished (ready) run. The gate itself is covered further down.
const GATED = ['dashboard', 'explore', 'forecast-total', 'forecast-specialty',
  'staff', 'supply', 'optimize', 'actions'];
async function mockReady(page) {
  await page.route('**/api/pipeline/status', (r) => r.fulfill({ json: dhStatus({ done: 8 }) }));
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
  if (GATED.includes(route)) await mockReady(page);
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
  await mockReady(page);
  await page.route('**/api/forecast/last', (r) => r.fulfill({
    json: { available: true, kind: 'specialty', ran_at: 'x', result: { history: [], forecast: [] } },
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#dashboard');
  await expect(page.getByText('No forecast has been run yet')).toBeVisible();
});

// Opening the Action Center reads the stored list; Re-generate rebuilds it.
test('actions @ 390px — Re-generate asks the server to rebuild the list', async ({ page }) => {
  const reads = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await mockReady(page);
  await page.route(/\/api\/ai\/actions(\?.*)?$/, (r) => {
    const u = new URL(r.request().url());
    reads.push(u.search);
    const title = u.searchParams.get('refresh') ? 'Fresh item' : 'Stored item';
    return r.fulfill({ json: { actions: [{ id: 0, title, reason: 'r', category: 'staff', urgency: 'high', status: 'open', action_key: 'k' }],
      built_at: '2026-11-02T12:00:00+00:00', summary: { counts: {} } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#actions');
  await expect(page.getByText('Stored item')).toBeVisible();
  expect(reads).toEqual(['']);
  await page.getByRole('button', { name: 'Re-generate' }).click();
  await expect(page.getByText('Fresh item')).toBeVisible();
  expect(reads).toEqual(['', '?refresh=1']);
});

// With no forecast yet, the heading says what is missing: the forecast when G1
// is built, the arrival history only when G1 really is absent.
const groupsWithG1 = (built) => ({ items: ['g1', 'g2', 'g3', 'g4'].map((id) => ({
  spec: { id, label: id.toUpperCase() }, sources: { all_loaded: built }, can_build: built,
  built: built && id === 'g1', metadata: null,
})) });
for (const built of [true, false]) {
  test(`dashboard @ 390px — no forecast yet, G1 ${built ? 'built' : 'absent'}`, async ({ page }) => {
    const posts = [];
    page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') posts.push(r.url()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await mockReady(page);
    await page.route('**/api/forecast/last', (r) => r.fulfill({ json: { available: false } }));
    await page.route('**/api/prepare/groups', (r) => r.fulfill({ json: groupsWithG1(built) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#dashboard');
    const notice = page.locator('.notice-empty');
    await expect(notice).toBeVisible();
    if (built) {
      await expect(notice.getByText('No forecast has been run yet', { exact: true })).toBeVisible();
      await expect(notice).not.toContainText('No arrival history');
    } else {
      await expect(notice.getByText('No arrival history loaded for this hospital yet')).toBeVisible();
    }
    await expect(notice.getByRole('button', { name: 'Run a forecast' })).toBeVisible();
    expect(posts).toHaveLength(0);
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
  expect(calls['GET /api/pipeline/status']).toBe(2); // the page plus the header data-source note
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
  expect(calls['GET /api/pipeline/status']).toBe(2); // page + header note, no polling once finished
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

test('upload @ 390px — Advanced tiles and Clear all are disabled while a run is active', async ({ page }) => {
  let running = true;
  await mockDataHub(page, {
    loaded: ['calendar'],
    status: () => dhStatus(running ? { done: 1, running: true } : { done: 8 }),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  await expect(page.locator('.pl-stage[data-status="running"]')).toHaveCount(1);
  const clearAll = page.getByRole('button', { name: 'Clear all' });
  await expect(clearAll).toBeDisabled();
  await page.locator('details.pl-advanced summary').click();
  const loadedTile = page.locator('.pl-advanced .ui-card', { has: page.locator('.ui-card-title', { hasText: /^Calendar features$/ }) });
  const emptyTile = page.locator('.pl-advanced .ui-card', { has: page.locator('.ui-card-title', { hasText: /^Inventory items$/ }) });
  for (const name of ['Re-upload', 'Remove']) await expect(loadedTile.getByRole('button', { name })).toBeDisabled();
  await expect(emptyTile.getByRole('button', { name: 'Upload CSV' })).toBeDisabled();
  // The run ends: the next status poll enables them again.
  running = false;
  await expect(clearAll).toBeEnabled({ timeout: 10_000 });
  await expect(loadedTile.getByRole('button', { name: 'Remove' })).toBeEnabled();
  await expect(emptyTile.getByRole('button', { name: 'Upload CSV' })).toBeEnabled();
});

test('upload @ 390px — a run whose start time is not known yet says Running.', async ({ page }) => {
  await mockDataHub(page, { status: { ...dhStatus({ done: 0, running: true }), started_at: null } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const tracker = page.locator('.pl-tracker');
  await expect(tracker).toContainText('Running. You can leave this page');
  await expect(tracker).not.toContainText('null');
});


// ---- Data-source note, and no origin labels on screen ------------------------
// By Jonathan's decision (2026-11-11) no page labels the inventory and
// scheduling data by origin: the presenter says so in person.
const FORBIDDEN = /simulat|seed \d|representative run|demonstration data/i;
const LADDER = 'Illustrative rates and error, from the thesis.';
const CI = (mean, lo, hi) => ({ mean, lo, hi });
const STAFF_OVERVIEW = {
  kpis: { lawful_coverage_pct: 75, coverage_pct: 97, staffing_shortfall: 7, nurses_needed_legal: 30.5,
    n_active_staff: 23, n_posts: 30, mean_weekly_hours: 57.9, overwork_pct: 129, bcea_per_nurse: 257 },
  ci: { coverage_pct: CI(96.9, 96.7, 97), annual_payroll_zar: CI(12880000, 12800000, 12950000),
    bcea_violations_per_staff: CI(242, 238, 246) },
  daily: [], staff: [], shifts: [], days_covered: 396,
};
const SUPPLY_OVERVIEW = {
  kpis: { items_at_risk: 24, n_items: 30, total_cost_zar: 5880000, stockout_cost_zar: 5680000,
    inventory_value_zar: 483000 },
  ci: { total_annual_cost_zar: CI(5800000, 5600000, 6000000), stockout_incidence_pct: CI(90.4, 87.8, 92.9),
    non_performance_rate: CI(4.1, 3.8, 4.4), lead_time_median_unflagged_days: CI(9, 8, 10) },
  items: [], by_abc: [], items_at_risk: 24,
};

async function mockOrigin(page, status) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: {
    user: { username: 'admin', role: 'admin',
      scopes: ['data:write', 'data:read', 'forecast:read', 'staff:read', 'supply:read', 'actions:read', 'staff:plan', 'supply:plan'],
      action_categories: [] },
    auth_mode: 'protected', auth_configured: true,
  } }));
  if (status === 'fail') await page.route('**/api/pipeline/status', (r) => r.abort());
  else await page.route('**/api/pipeline/status', (r) => r.fulfill({ json: status }));
}

test.describe('data origin', () => {
  test.use({ timezoneId: 'UTC' });

  for (const route of GATED) {
    test(`${route} @ 390px — with results, no page text labels the data by origin`, async ({ page }) => {
      // The status says the stock and staffing came from the demo pack.
      await mockOrigin(page, { ...dhStatus({ done: 8 }), origin: 'simulated' });
      await page.route('**/api/staff/overview', (r) => r.fulfill({ json: STAFF_OVERVIEW }));
      await page.route('**/api/supply/overview', (r) => r.fulfill({ json: SUPPLY_OVERVIEW }));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/#${route}`);
      await expect(page.getByTestId('results-gate')).toHaveCount(0);
      await page.waitForTimeout(1200);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text.match(FORBIDDEN), `origin label on ${route}`).toBeNull();
      if (route === 'staff') {
        await expect(page.locator('.page-hero')).toContainText('Nurse rostering, coverage and payroll · 23 active nurses (of 30 posts) · BCEA logged, not enforced');
        await expect(page.getByText(/95% range: coverage 96\.9% \[96\.7–97\]/)).toBeVisible();
      }
      if (route === 'supply') {
        await expect(page.locator('.page-hero')).toContainText('Inventory, reorder behaviour and stockouts · 30 items');
        await expect(page.getByText(/95% range:/)).toBeVisible();
      }
    });
  }

  test('dashboard @ 390px — a sample run shows its number and time in the header', async ({ page }) => {
    await mockOrigin(page, dhStatus({ done: 8 }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#dashboard');
    await expect(page.locator('.topbar-source')).toHaveText('Run 3, 2 Nov 2026 12:25');
  });

  test('dashboard @ 390px — before any run the header says there is no data yet', async ({ page }) => {
    await mockOrigin(page, dhStatus());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#dashboard');
    await expect(page.locator('.topbar-source')).toHaveText('No data yet');
  });

  test('staff @ 390px — during a run the header says a run is in progress', async ({ page }) => {
    await mockOrigin(page, dhStatus({ done: 2, running: true }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#staff');
    await expect(page.locator('.topbar-source')).toHaveText('Run in progress');
  });

  test('staff @ 390px — a failed status renders no note', async ({ page }) => {
    await mockOrigin(page, 'fail');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#staff');
    await page.waitForTimeout(1500);
    await expect(page.locator('.topbar-source')).toHaveCount(0);
  });

  test('dashboard @ 390px — an uploaded run reads the same as a sample run', async ({ page }) => {
    await mockOrigin(page, { ...dhStatus({ done: 8 }),
      source: { mode: 'uploaded', run: 3, finished_at: '2026-11-02T14:05:00+00:00' } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#dashboard');
    await expect(page.locator('.topbar-source')).toHaveText('Run 3, 2 Nov 2026 14:05');
  });

  test('optimize @ 390px — the ladder label shows only for uploaded data', async ({ page }) => {
    await mockOrigin(page, { ...dhStatus({ done: 8 }),
      source: { mode: 'uploaded', run: 3, finished_at: '2026-11-02T14:05:00+00:00' } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#optimize');
    await expect(page.getByText(LADDER)).toBeVisible();
  });

  test('optimize @ 390px — no ladder label on the sample data', async ({ page }) => {
    await mockOrigin(page, dhStatus({ done: 8 }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#optimize');
    await expect(page.locator('.page-hero')).toBeVisible();
    await expect(page.getByText(LADDER)).toHaveCount(0);
  });

  test('actions @ 390px — a stored list says when it was built', async ({ page }) => {
    await mockOrigin(page, dhStatus({ done: 8 }));
    await page.route('**/api/ai/actions', (r) => r.fulfill({ json: {
      actions: [], summary: null, built_at: '2026-11-02T14:05:00+00:00', data_version: 3 } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#actions');
    await expect(page.getByText('Built 2 Nov 2026 14:05')).toBeVisible();
  });

  test('forecast-specialty @ 390px — Load last run restores a stored forecast without running one', async ({ page }) => {
    await mockOrigin(page, dhStatus({ done: 8 }));
    const posts = [];
    page.on('request', (r) => { if (r.url().includes('/api/') && r.method() === 'POST') posts.push(r.url()); });
    let lastCalls = 0;
    await page.route('**/api/task2/specialties', (r) => r.fulfill({ json: { items: [{ specialty: 'Medicine', resolution: 'daily' }] } }));
    await page.route('**/api/forecast/specialty/last**', (r) => {
      lastCalls += 1; return r.fulfill({ json: { available: false } });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#forecast-specialty');
    await page.waitForTimeout(800);
    expect(lastCalls).toBe(0);
    await page.getByRole('button', { name: 'Load last run' }).click();
    await expect(page.getByText('No previous run for this specialty on the server yet.')).toBeVisible();
    expect(lastCalls).toBe(1);
    expect(posts).toHaveLength(0);
  });
});


// ---- Empty until run: the results gate ---------------------------------------
// Before a pipeline run has finished, every results page is ONE card asking for
// the data: the page component never mounts, so it fetches nothing.
const GATE_TITLE = 'No results yet';
const GATE_TEXT = 'Upload your data on the Data Hub and run the pipeline. Results appear here after the run.';
const ANON = { user: null, auth_mode: 'protected', auth_configured: true,
  anonymous_scopes: ['forecast:read', 'data:read', 'staff:read', 'supply:read', 'actions:read', 'assistant'],
  anonymous_action_categories: ['staff', 'supply', 'capacity'] };

// Records every /api/ request as "METHOD path".
function recordApi(page) {
  const seen = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) seen.push(`${r.method()} ${u.pathname}`);
  });
  return seen;
}

async function mockGate(page, { status = dhStatus(), me = ANON } = {}) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: me }));
  await page.route('**/api/pipeline/status', (r) => r.fulfill({ json: typeof status === 'function' ? status() : status }));
}

for (const route of GATED) {
  test(`${route} — before any run shows only the gate card, at every width, and fetches nothing`, async ({ page }) => {
    const seen = recordApi(page);
    await mockGate(page);
    await page.setViewportSize({ width: WIDTHS[0], height: HEIGHT[WIDTHS[0]] });
    await page.goto(`/#${route}`);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT[width] });
      const gate = page.getByTestId('results-gate');
      await expect(gate).toBeVisible();
      await expect(gate.locator('.ui-card-title')).toHaveText(GATE_TITLE);
      await expect(gate).toContainText(GATE_TEXT);
      await expect(gate.getByRole('button', { name: 'Use the sample data' })).toBeEnabled();
      // A visitor cannot upload, so there is no Data Hub button.
      await expect(gate.getByRole('button', { name: 'Go to the Data Hub' })).toHaveCount(0);
      const r = await page.evaluate(() => ({
        children: document.querySelectorAll('.content > *').length,
        text: document.querySelector('.content')?.textContent || '',
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        badges: document.querySelectorAll('.sidebar-item-badge').length,
      }));
      expect(r.children, 'the gate is the only thing on the page').toBe(1);
      expect(r.text, 'no result numbers before a run').not.toMatch(/\d/);
      expect(r.sw).toBeLessThanOrEqual(r.cw + 1);
      expect(r.badges).toBe(0);
    }
    await page.waitForTimeout(800);
    const other = seen.filter((s) => !['GET /api/auth/me', 'GET /api/pipeline/status'].includes(s));
    expect(other, `requests before a run: ${other.join(' | ')}`).toHaveLength(0);
    await expect(page.locator('.topbar-source')).toHaveText('No data yet');
  });
}

test('staff @ 390px — someone who can upload also gets the Data Hub button', async ({ page }) => {
  await mockGate(page, { me: {
    user: { username: 'admin', role: 'admin', scopes: ['data:write', 'staff:read'], action_categories: [] },
    auth_mode: 'protected', auth_configured: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#staff');
  await page.getByTestId('results-gate').getByRole('button', { name: 'Go to the Data Hub' }).click();
  await expect(page).toHaveURL(/#upload$/);
});

test('staff @ 390px — the sample run shows its progress, then the page appears', async ({ page }) => {
  let phase = 'idle';
  const status = () => ({
    idle: dhStatus(),
    loading: { ...dhStatus({ done: 0, running: true }), loading: true, stages: dhStatus().stages },
    running: dhStatus({ done: 2, running: true }),
    done: dhStatus({ done: 8 }),
  })[phase];
  await mockGate(page, { status });
  const posts = [];
  await page.route('**/api/pipeline/sample**', (r) => {
    posts.push(new URL(r.request().url()).search);
    phase = 'loading';
    return r.fulfill({ json: status() });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#staff');
  const gate = page.getByTestId('results-gate');
  await expect(gate).toBeVisible();
  await page.waitForTimeout(500);
  expect(posts, 'the gate never starts the sample by itself').toHaveLength(0);
  await gate.getByRole('button', { name: 'Use the sample data' }).click();
  await expect(gate).toContainText('Loading the sample data');
  await expect(gate.getByRole('button', { name: 'Use the sample data' })).toBeDisabled();
  phase = 'running';
  await expect(gate).toContainText('Running step 3 of 8: Operations', { timeout: 6000 });
  phase = 'done';
  await expect(gate).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator('.page-hero')).toContainText('Staff Planner');
  await expect(page.locator('.topbar-source')).toHaveText(/^Run 3/);
  expect(posts).toEqual(['']);
});

test('supply @ 390px — replacing uploaded data with the sample is confirmed first', async ({ page }) => {
  let running = false;
  await mockGate(page, { status: () => (running ? dhStatus({ done: 1, running: true }) : dhStatus()) });
  const posts = [];
  await page.route('**/api/pipeline/sample**', (r) => {
    const q = new URL(r.request().url()).search;
    posts.push(q);
    if (!q.includes('replace=true')) {
      return r.fulfill({ status: 409, json: { error: 'replace_uploaded',
        message: 'This replaces the uploaded data and its results with the sample data.' } });
    }
    running = true;
    return r.fulfill({ json: dhStatus({ done: 1, running: true }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#supply');
  const gate = page.getByTestId('results-gate');
  await gate.getByRole('button', { name: 'Use the sample data' }).click();
  const confirm = gate.locator('.pl-confirm');
  await expect(confirm).toContainText('Replace the uploaded data?');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await gate.getByRole('button', { name: 'Use the sample data' }).click();
  await gate.locator('.pl-confirm').getByRole('button', { name: 'Replace with the sample data' }).click();
  await expect(gate).toContainText('Running step 2 of 8: Transform');
  expect(posts).toEqual(['', '', '?replace=true']);
});

test('dashboard @ 390px — a visitor refused over uploaded data reads why', async ({ page }) => {
  await mockGate(page);
  await page.route('**/api/pipeline/sample**', (r) => r.fulfill({ status: 403, json: {
    error: 'uploaded_data',
    message: 'This server holds data uploaded from a hospital, and only someone who can upload data may replace it with the sample data.' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#dashboard');
  await page.getByTestId('results-gate').getByRole('button', { name: 'Use the sample data' }).click();
  await expect(page.getByTestId('results-gate')).toContainText('only someone who can upload data');
});

test('dashboard @ 390px — a failed run says where it stopped', async ({ page }) => {
  const failed = dhStatus({ done: 0, failed: true });
  failed.stages[0].receipt = 'The sample data could not be loaded: the data repository could not be reached.';
  await mockGate(page, { status: failed });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#dashboard');
  await expect(page.getByTestId('results-gate')).toContainText('The last run stopped at Check.');
  await expect(page.getByTestId('results-gate')).toContainText('could not be reached');
});

test('staff @ 1440px — sidebar badges appear only once results are ready', async ({ page }) => {
  let ready = false;
  const seen = recordApi(page);
  await mockGate(page, { status: () => dhStatus(ready ? { done: 8 } : {}) });
  await page.route('**/api/staff/overview', (r) => r.fulfill({ json: { kpis: { staffing_shortfall: 7 } } }));
  await page.route('**/api/supply/overview', (r) => r.fulfill({ json: { items_at_risk: 24 } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#supply');
  await expect(page.getByTestId('results-gate')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator('.sidebar-item-badge')).toHaveCount(0);
  expect(seen.filter((s) => s.includes('overview'))).toHaveLength(0);
  ready = true;
  await page.goto('about:blank');
  await page.goto('/#staff');
  await expect(page.locator('.sidebar-item-badge')).toHaveText(['7', '24']);
});

test('upload @ 390px — the sample button sits beside Run and starts the sample run', async ({ page }) => {
  let running = false;
  await mockDataHub(page, { status: () => dhStatus(running ? { done: 0, running: true } : {}) });
  const posts = [];
  await page.route('**/api/pipeline/sample**', (r) => {
    posts.push(r.request().method());
    running = true;
    return r.fulfill({ json: dhStatus({ done: 0, running: true }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#upload');
  const panel = page.locator('.pl-run');
  await expect(panel.getByRole('button', { name: 'Run full pipeline' })).toBeDisabled();
  const sampleBtn = panel.getByRole('button', { name: 'Use the sample data' });
  await expect(sampleBtn).toBeEnabled();
  await expect(panel).toContainText('Loads the stored hospital, inventory and scheduling files, then runs the same eight steps.');
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(0);
  await sampleBtn.click();
  await expect(page.locator('.pl-stage[data-status="running"]')).toHaveCount(1);
  await expect(sampleBtn).toBeDisabled();
  expect(posts).toEqual(['POST']);
});
