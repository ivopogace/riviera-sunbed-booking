import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

import { OPERATOR_PASSWORD } from './e2e/real-backend/support/operator';

/**
 * Real-backend e2e for the U7 venue onboarding + beach-map editor (issue #7). Unlike the
 * API-mocked a11y suite (`playwright.a11y.config.ts`), these specs drive a real Chromium against
 * the REAL Spring Boot backend, which persists to a REAL Flyway-migrated Postgres and enforces the
 * real DB constraints — proving the wired system, including the editor-write → public U1-read
 * round-trip. Nothing is mocked.
 *
 * Two servers are started and awaited:
 *  1. Backend — `./gradlew bootRun` from `platform/`. Spring Boot's docker-compose support
 *     (`spring-boot-docker-compose`, a `developmentOnly` dep) auto-starts Postgres from
 *     `platform/compose.yaml` and injects the datasource, so no DB setup is needed here. We pass
 *     `RIVIERA_OPERATOR_PASSWORD` (so the operator login is known) and
 *     `APP_WEB_CORS_ALLOWED_ORIGINS=http://localhost:4200` (the editor calls :8080 cross-origin
 *     from :4200; the default allowlist is the GitHub Pages origin, which would fail CORS).
 *     Readiness = `GET /actuator/health` → 2xx (status UP). The timeout is generous: a cold
 *     gradle build + docker-compose + first-time Postgres image pull can take minutes.
 *  2. Frontend — `npm start` (ng serve, dev config → `apiBaseUrl` is `http://localhost:8080`).
 *
 * This is NOT wired into CI (the CI frontend job has no JDK/Docker); run it locally with
 * `npm run test:e2e`. The mocked a11y suite is what CI runs, via `npm run test:e2e:a11y`.
 *
 * Browser resolution: this suite targets the headless cloud container, where Chromium is
 * pre-installed at `/opt/pw-browsers/chromium` and the process runs as root (so `--no-sandbox`).
 * `PW_CHROMIUM_EXECUTABLE` overrides the path; otherwise Playwright's own resolution is used.
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const chromiumExecutable =
  process.env.PW_CHROMIUM_EXECUTABLE ??
  (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: './e2e/real-backend',
  testMatch: '**/*.e2e.ts',
  // The real backend is the bottleneck and shared mutable state — keep it sequential and patient.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
        launchOptions: {
          // Runs as root in the container — Chromium refuses the sandbox there.
          args: ['--no-sandbox'],
          ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
        },
      },
    },
  ],
  webServer: [
    {
      command: './gradlew bootRun',
      cwd: '../platform',
      url: 'http://localhost:8080/actuator/health',
      // Cold start = gradle build + docker compose + first-time Postgres pull + Flyway migrate.
      timeout: 600_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        // Known operator login for the write API (matches what the specs sign in with).
        RIVIERA_OPERATOR_PASSWORD: OPERATOR_PASSWORD,
        // The editor calls the backend cross-origin from :4200 — allow it, or writes fail CORS.
        APP_WEB_CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
      },
    },
    {
      command: 'npm start',
      url: 'http://localhost:4200',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { ...process.env },
    },
  ],
});
