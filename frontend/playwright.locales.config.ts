import { defineConfig, devices } from '@playwright/test';

/**
 * The locale e2e (ADR-0030): the CI-safe mocked suite runs the source locale under `ng serve`,
 * which builds one locale only, so the translated builds are smoke-checked here against the
 * production build itself (`npm run build` first), served by `scripts/serve-locales.mjs` with the
 * server's per-locale fallback rules. The API is mocked per test via `page.route`, as in
 * `playwright.a11y.config.ts`. CI runs it in the first a11y e2e shard.
 */
export default defineConfig({
  testDir: './e2e/locales',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4300',
    headless: true,
    trace: 'on-first-retry',
    ...(process.env.PW_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  webServer: {
    command: 'node scripts/serve-locales.mjs',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
