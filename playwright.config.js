import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // The default run is the responsive suite only. Visual baselines are
  // machine-specific (font rendering, GPU), so they are opt-in via
  // --project=visual and must never fail someone else's CI. The full-pipeline
  // E2E in tests/e2e needs real servers and data, so it has its own config
  // (playwright.e2e.config.js) and is never collected here.
  projects: [
    { name: 'responsive', testIgnore: [/visual\.spec\.js/, /[\\/]e2e[\\/]/] },
    { name: 'visual', testMatch: /visual\.spec\.js/ },
  ],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Honour a pre-installed Chromium when the sandbox has one that does not
    // match this Playwright build's expected revision. Unset in CI, where
    // `npx playwright install chromium` provides the matching binary.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
