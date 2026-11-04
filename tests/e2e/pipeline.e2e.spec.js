// Full-pipeline end-to-end test against the real dev servers.
//
// Two tests, pick one with -g:
//   quick  four pure CSVs, calendar + weather, the five demo CSVs, raw months
//          2025_11, 2025_12 and 2026_01 (a few minutes)
//   full   the same, but ALL monthly registers in E2E_RAW_DIR (about 81 files)
//
// Needs a data:write session, so start the backend with the auth gate open,
// in THIS process environment only (api/.env is not touched). PowerShell:
//
//   # terminal 1 (repo root)
//   cd api; .venv\Scripts\Activate.ps1
//   $env:AUTH_MODE = "open"; $env:DEMO_INSECURE = "1"; python main.py
//   # terminal 2 (repo root)
//   npm run dev
//   # terminal 3 (repo root)
//   $env:E2E_RAW_DIR  = "<...>\Casualty_Daily_Register_Dataset"
//   $env:E2E_PURE_DIR = "<...>\output\pure"
//   $env:E2E_EXT_DIR  = "<...>\external_factor_data"
//   npx playwright test -c playwright.e2e.config.js -g quick
//
// Optional: E2E_API (default http://localhost:8000), E2E_BASE_URL
// (default http://localhost:5173), E2E_SCRATCH (where the renamed weather copy
// is written; default the OS temp dir).
//
// Rules this test enforces: every stage is done, or amber for the one known
// reason (recommend, with no AI key or an unreachable provider). Any other
// amber or failed stage fails the test. Register contents are never printed.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = process.env.E2E_API || 'http://localhost:8000';
const RAW = process.env.E2E_RAW_DIR;
const PURE = process.env.E2E_PURE_DIR;
const EXT = process.env.E2E_EXT_DIR;
const DEMO = path.resolve('demo-data');
const SCRATCH = process.env.E2E_SCRATCH || path.join(os.tmpdir(), 'hf-e2e');

const PURE_FILES = ['pure_daily_arrival.csv', 'pure_hourly_arrival.csv',
  'pure_clinical_arrival.csv', 'pure_hourly_clinical_arrival.csv'];
const DEMO_FILES = ['inventory_items.csv', 'inventory_movements.csv',
  'shift_log.csv', 'staff_list.csv', 'staffing_daily.csv'];
const QUICK_MONTHS = ['2025_11', '2025_12', '2026_01'];
const KNOWN_AMBER = new Set(['recommend']);
const PAGES = ['explore', 'forecast-total', 'staff', 'supply', 'optimize', 'actions'];

function need(name, v) {
  if (!v) throw new Error(`Set ${name} (see the header of this file).`);
  if (!fs.existsSync(v)) throw new Error(`${name} does not exist: ${v}`);
  return v;
}

// First existing file among candidates, else a clear failure.
function findFile(dirs, names) {
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`None of ${names.join(', ')} found in ${dirs.join(' or ')}`);
}

// The weather daily file ships as pretoria_weather_2019_2026.csv but the Data
// Hub recognises pretoria_weather_daily_2019_2026.csv: copy it under that name.
function renamedCopy(src, name) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const dst = path.join(SCRATCH, name);
  fs.copyFileSync(src, dst);
  return dst;
}

function collectFiles(months) {
  const raw = need('E2E_RAW_DIR', RAW);
  const pure = need('E2E_PURE_DIR', PURE);
  const ext = need('E2E_EXT_DIR', EXT);
  const files = PURE_FILES.map((n) => path.join(pure, n));
  files.push(findFile([ext, pure], ['calendar_features_2019_2026.csv']));
  files.push(findFile([ext, pure], ['pretoria_weather_hourly_2019_2026.csv']));
  files.push(renamedCopy(
    findFile([ext, pure], ['pretoria_weather_daily_2019_2026.csv', 'pretoria_weather_2019_2026.csv']),
    'pretoria_weather_daily_2019_2026.csv'));
  files.push(...DEMO_FILES.map((n) => path.join(DEMO, n)));
  const registers = fs.readdirSync(raw)
    .filter((n) => /^Casualty_Daily_Register_\d{4}_\d{2}\.xlsx$/.test(n))
    .filter((n) => !months || months.some((m) => n.includes(m)))
    .sort();
  files.push(...registers.map((n) => path.join(raw, n)));
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`Missing input file: ${f}`);
  return { files, registers: registers.length };
}

async function runRoute(page, request, { months, expectRegisters }) {
  const { files, registers } = collectFiles(months);
  if (expectRegisters) expect(registers).toBeGreaterThanOrEqual(expectRegisters);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  await page.goto('/#upload');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled({ timeout: 60_000 });
  const t0 = Date.now();
  await page.locator('.pl-drop input[type="file"]').setInputFiles(files);
  // Receipts appear one per file; wait for the progress line to show all done.
  await expect(page.locator('.pl-progress')).toContainText(`${files.length} of ${files.length}`,
    { timeout: 40 * 60_000 });
  const refused = await page.locator('.pl-result[data-state="error"]').count();
  console.log(`uploaded ${files.length} files in ${((Date.now() - t0) / 1000).toFixed(0)} s; refused: ${refused}`);
  // A register that is out of range (e.g. 2019_04) may legitimately be skipped,
  // but nothing else may be refused.
  expect(refused).toBeLessThanOrEqual(1);

  const run = page.getByRole('button', { name: 'Run full pipeline' });
  await expect(run).toBeEnabled({ timeout: 120_000 });
  const tRun = Date.now();
  await run.click();
  const confirm = page.locator('.pl-confirm');
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole('button', { name: /Replace and run/ }).click();
  }
  // Done when the summary card appears (finished or failed).
  await expect(page.locator('.pl-summary')).toBeVisible({ timeout: 40 * 60_000 });
  const totalS = (Date.now() - tRun) / 1000;

  const status = await (await request.get(`${API}/api/pipeline/status`)).json();
  console.log(`run took ${totalS.toFixed(0)} s; data_version ${status.data_version}`);
  const bad = [];
  for (const s of status.stages) {
    console.log(`  ${s.id.padEnd(14)} ${String(s.status).padEnd(8)} ${String(s.seconds).padStart(8)} s  peak ${s.peak_mb} MB  ${s.receipt || ''}`);
    for (const w of s.warnings || []) console.log(`      warning: ${w}`);
    const ok = s.status === 'done' || (s.status === 'amber' && KNOWN_AMBER.has(s.id));
    if (!ok) bad.push(`${s.id}=${s.status}`);
  }
  expect(bad, `stages not done or knowingly amber: ${bad.join(', ')}`).toEqual([]);
  expect(status.stages.length).toBe(8);

  // Every linked page renders something and throws nothing.
  for (const p of PAGES) {
    await page.goto(`/#${p}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('main, #root').first()).not.toBeEmpty();
    await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
  }
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
}

test('quick: four pure CSVs, externals, demo CSVs and three raw months', async ({ page, request }) => {
  await runRoute(page, request, { months: QUICK_MONTHS });
});

test('full: every monthly register', async ({ page, request }) => {
  await runRoute(page, request, { months: null, expectRegisters: 80 });
});
