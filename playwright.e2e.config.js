import { defineConfig } from '@playwright/test';

// End-to-end run of the full pipeline against REAL dev servers (see the header
// of tests/e2e/pipeline.e2e.spec.js for the exact commands). Separate from the
// default config so `npx playwright test` never starts a 45-minute run.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /pipeline\.e2e\.spec\.js/,
  timeout: 45 * 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
});
