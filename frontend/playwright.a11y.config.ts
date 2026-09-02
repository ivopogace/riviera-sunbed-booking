import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the real-render a11y e2e (U3, issue #6). Drives the booking flow in a
 * real Chromium and runs @axe-core/playwright — the layer jsdom can't provide (keyboard
 * focus, modal focus management, true colour contrast over gradients). The app is served by
 * `ng serve`; the API is mocked in-test via `page.route`, so NO backend is needed — which is why
 * this is the suite CI runs (`npm run test:e2e:a11y`; the CI frontend job has no JDK/Docker).
 *
 * The real-backend U7 editor suite lives under `e2e/real-backend/` with its own
 * `playwright.config.ts` (it boots the backend + Postgres); `testIgnore` keeps it out of here.
 *
 * Browser resolution: locally the pre-installed Chromium is found via
 * `PLAYWRIGHT_BROWSERS_PATH`; CI runs `npx playwright install chromium` first.
 *
 * Parallelism: every spec mocks its API per page and shares nothing, so files run on 2 parallel
 * workers everywhere. Measured on both 4-vCPU environments the suite runs in (PR #891): the
 * `ubuntu-latest` runner took 8.7 min on 1 worker, 7.0 on 4 and 6.8 on 2; the Claude Code cloud
 * sandbox took 571s on 1, 330–357s on 4 and 314s on 2 — and on 2 the per-test median stayed at
 * 1.3s against 2.8s on 4, so the extra Chromiums only add contention and shrink the timeout
 * headroom. Pinned rather than left to Playwright's half-the-cores default so a machine with more
 * cores does not silently re-create the 4-worker case; `--workers` overrides for a local
 * experiment. Tests within one file stay in order (`fullyParallel: false`): the suite was authored
 * under a single worker, and the intra-file split adds ~2% for a wider timing surface.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // The real-backend U7 suite has its own config/servers — never run it under the mocked, backend-less one.
  testIgnore: '**/real-backend/**',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: 'http://localhost:4200',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI installs the matching browser via `npx playwright install chromium`. For
        // environments with a pre-installed Chromium of a different revision, point at it
        // with PW_CHROMIUM_EXECUTABLE instead of re-downloading.
        launchOptions: process.env.PW_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
