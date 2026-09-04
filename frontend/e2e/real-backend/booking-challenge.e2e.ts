import { expect, test } from '@playwright/test';

import { uniqueSuffix } from './support/operator';

/**
 * Widget-against-verifier on booking create: a guest reserves a real set on the seeded demo venue's
 * map by solving a REAL challenge in Chromium — the endpoint mints it with the platform's HMAC
 * secret at the shipped `cost`, the widget's Web Workers brute-force it, and the edge verifies the
 * solution and claims its nonce in Postgres before the reservation transaction runs. Nothing is
 * mocked, so this is the one place the browser's solver and the server's verifier meet.
 *
 * <p>Local-only (`npm run test:e2e`); the auth forms' equivalent is `auth-challenge.e2e.ts`.
 */

/** A day far enough out that no earlier run of this spec has taken the set. */
function farFutureDate(): string {
  const day = new Date();
  day.setUTCFullYear(day.getUTCFullYear() + 1);
  day.setUTCDate(day.getUTCDate() + (Date.now() % 300));
  return day.toISOString().slice(0, 10);
}

test('a guest books a real set by solving a real proof-of-work challenge', async ({ page }) => {
  const date = farFutureDate();
  await page.goto(`/venues/1?date=${date}`);

  const bookable = page.getByRole('button', { name: /Select to book/ }).first();
  await expect(bookable).toBeVisible({ timeout: 30_000 });
  await bookable.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill(`e2e-booking-${uniqueSuffix()}@example.com`);
  await dialog.getByLabel('Phone').fill('+355699000111');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  // On the submitting step, solving at the SHIPPED cost — far slower than the mocked suite's.
  await expect(page.getByTestId('challenge-widget')).toBeVisible();
  await expect(page.getByTestId('challenge-status')).toHaveText(/Security check passed/, {
    timeout: 60_000,
  });

  await dialog.getByTestId('dialog-primary').click();

  // The edge verified the solution and claimed its nonce, so the set is really reserved.
  await expect(page).toHaveURL(/\/booking\/(confirmation|pay)/, { timeout: 30_000 });
  await expect(dialog.getByTestId('dialog-error')).toHaveCount(0);
});
