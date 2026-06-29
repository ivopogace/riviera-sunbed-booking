import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the real-render a11y e2e (U3, issue #6). Drives the booking flow in a
 * real Chromium and runs @axe-core/playwright — the layer jsdom can't provide (keyboard
 * focus, modal focus management, true colour contrast over gradients). The app is served by
 * `ng serve`; the API is mocked in-test via `page.route`, so no backend is needed.
 *
 * Browser resolution: locally the pre-installed Chromium is found via
 * `PLAYWRIGHT_BROWSERS_PATH`; CI runs `npx playwright install chromium` first.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
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
