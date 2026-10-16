import { expect, Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { awaitRoutedPage } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';
import { mockTourist } from './support/tourist.mocks';

/**
 * A lazy route whose chunk fails to load (#1543): a deploy replaced the hashed chunks under an
 * open tab, or the network dropped mid-navigation. The visitor gets one full reload to the target
 * URL; if the chunk still fails, the outlet shows a "Couldn’t load this page" card with a retry,
 * the address bar keeps the target URL and the router raises no uncaught error. The failing
 * chunk is found by its content rather than its hashed name and aborted with `page.route`; the
 * API is mocked, so the spec is CI-safe.
 */

const PRIVACY_PATH = '/legal/privacy';
const PRIVACY_MARKER = 'app-privacy-policy';
const CHUNK_URL = /\/chunk-[^/]+\.js$/;
const FAILED_HEADING = { level: 1, name: 'Couldn’t load this page' };

/** Aborts each load of the chunk carrying `marker` (`times` loads, or every one); returns the abort count. */
async function blockChunk(page: Page, marker: string, times = Infinity): Promise<() => number> {
  let aborted = 0;
  await page.route(CHUNK_URL, async (route) => {
    const response = await route.fetch();
    if (aborted < times && (await response.text()).includes(marker)) {
      aborted += 1;
      await route.abort('failed');
    } else {
      await route.fulfill({ response });
    }
  });
  return () => aborted;
}

/** Uncaught exceptions and console errors, minus Chromium's own line for the aborted chunk. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await mockTourist(page);
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
  });
});

test('a chunk that fails once is recovered by one reload to the target URL', async ({ page }) => {
  const errors = collectErrors(page);
  const abortCount = await blockChunk(page, PRIVACY_MARKER, 1);

  await page.goto(PRIVACY_PATH);

  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expect(page).toHaveURL(PRIVACY_PATH);
  expect(abortCount()).toBe(1);
  expect(errors).toEqual([]);
});

test('a direct load whose chunk keeps failing reloads once, then shows the retry card', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const abortCount = await blockChunk(page, PRIVACY_MARKER);

  await page.goto(PRIVACY_PATH);

  await expect(page.getByRole('heading', FAILED_HEADING)).toBeVisible();
  await expect(page).toHaveURL(PRIVACY_PATH);
  await expect(page).toHaveTitle('Couldn’t load this page — Riviera');
  // The chunk was asked for on the first load and once more after the one automatic reload.
  expect(abortCount()).toBe(2);
  expect(errors).toEqual([]);
});

test('"Try again" reloads the page and lands on it once the chunk loads', async ({ page }) => {
  await blockChunk(page, PRIVACY_MARKER);
  await page.goto(PRIVACY_PATH);
  const retry = page.getByTestId('page-load-failed-retry');
  await expect(retry).toBeVisible();

  await page.unroute(CHUNK_URL);
  await retry.click();

  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expect(page).toHaveURL(PRIVACY_PATH);
});

test('an in-app navigation whose chunk fails shows the retry card under the target URL', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await awaitRoutedPage(page);
  const abortCount = await blockChunk(page, 'app-my-bookings');

  await page.getByRole('link', { name: 'My bookings' }).first().click();

  await expect(page.getByRole('heading', FAILED_HEADING)).toBeVisible();
  await expect(page).toHaveURL('/my-bookings');
  expect(abortCount()).toBe(2);
  expect(errors).toEqual([]);

  // The reload kept the history entry the visitor came from.
  await page.unroute(CHUNK_URL);
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', FAILED_HEADING)).toHaveCount(0);
});

for (const theme of ['porcelain', 'riviera', 'dark']) {
  test(`the retry card is axe-clean in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
    await blockChunk(page, PRIVACY_MARKER);
    await page.goto(PRIVACY_PATH);
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
    await expect(page.getByTestId('page-load-failed-retry')).toBeVisible();
    await expectNoSeriousAxeViolations(page, `page-load-failed (${theme})`);
  });
}

test('at a phone width every control on the retry card meets the touch floor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await blockChunk(page, PRIVACY_MARKER);
  await page.goto(PRIVACY_PATH);
  await expect(page.getByTestId('page-load-failed-retry')).toBeVisible();
  await expectTouchTargets(page, 'page-load-failed');
});
