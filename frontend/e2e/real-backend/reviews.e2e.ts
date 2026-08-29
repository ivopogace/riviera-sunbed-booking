import { expect, Browser, Page, test } from '@playwright/test';

import { completeDialog } from '../support/booking-dialog';
import { createVenue, signInOperator, venueName } from './support/operator';

/**
 * Real-backend e2e for the rate-a-stay loop (#811). A real Chromium drives the REAL Spring Boot
 * backend against the REAL Flyway-migrated Postgres — nothing is mocked, and the payment leg runs on
 * the in-process `StubPaymentGateway` (`@Profile("!stripe")`), which confirms synchronously, so the
 * booking reaches `CONFIRMED` without Stripe.
 *
 * It proves the one thing the backend ITs and the mocked suite can each only prove in halves: the
 * whole chain, in order — operator lays out a venue and opens same-day sales, a tourist books today,
 * the operator checks the code in, the guest rates five stars, and the venue's public header shows
 * the recomputed score. Every fence in between is the server's.
 *
 * The tourist runs in its OWN browser context: the booking legs are deliberately session-free, and
 * sharing the operator's cookie would test a signed-in operator booking a sunbed instead.
 * Local-only suite (never CI); run with `npm run test:e2e`.
 */

/** Sales close 23:59 — the venue opts into same-day sales, so booking TODAY is legal (invariant #4). */
const LATE_SALES_CLOSE = 'venue-sales-close-23:59';

async function openSameDaySales(page: Page, venueId: number): Promise<void> {
  await page.goto(`/operator/${venueId}/venue`);
  await expect(page.getByTestId('venue-tab')).toBeVisible();
  await page.getByTestId(LATE_SALES_CLOSE).click();
  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
}

/**
 * Lay out one sea-facing set on the console's beach-map tab. A 1×1 generate is the whole gesture:
 * generated cells are ONLINE by default (the walk-in tool is what makes one WALK_IN), so this is the
 * shortest real layout a tourist can book against.
 */
async function addOnlineSet(page: Page, venueId: number): Promise<void> {
  await page.goto(`/operator/${venueId}/beach-map`);
  await expect(page.getByTestId('layout-editor')).toBeVisible();
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(1);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
}

/** Book the venue's only free set for TODAY as an anonymous guest; returns the booking code. */
async function bookToday(tourist: Page, venueId: number): Promise<string> {
  await tourist.goto(`/venues/${venueId}`);
  await tourist
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = tourist.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await completeDialog(dialog, 'Continue to payment');

  await expect(tourist).toHaveURL(/\/booking\/confirmation/);
  // The testid wraps the label and helper copy; the code itself is the second child element.
  const code = (
    (await tourist.getByTestId('booking-code').locator('div').first().textContent()) ?? ''
  ).trim();
  expect(code).toMatch(/^[A-Z0-9]{8,}$/);
  return code;
}

test.describe('reviews — real backend, real Postgres', () => {
  test('a checked-in guest rates their stay and the venue header shows the score', async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    // signInOperator only submits: awaiting the heading is what settles the session round-trip.
    await page.goto('/operator?create=1');
    await signInOperator(page);
    await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
    const venueId = await createVenue(page, venueName('reviews'));
    await addOnlineSet(page, venueId);
    await openSameDaySales(page, venueId);

    const touristContext = await browser.newContext();
    const tourist = await touristContext.newPage();
    try {
      const code = await bookToday(tourist, venueId);

      // Not yet delivered: the server refuses to offer a rating for a stay nobody checked in.
      await tourist.goto(`/booking/${code}`);
      await expect(tourist.getByTestId('booking-code')).toContainText(code);
      await expect(tourist.getByTestId('review-panel')).toHaveCount(0);

      // The operator checks the code in from the daily view — the real guarded transition.
      await page.goto(`/operator/${venueId}/daily`);
      await expect(page.getByTestId('daily-view-tab')).toBeVisible();
      await page.getByTestId('checkin-code-input').fill(code);
      await page.getByTestId('checkin-submit').click();
      await expect(page.getByTestId('checkin-result')).toContainText('Checked in');

      // Now the panel appears — from the server's flag, on a re-read of the same page.
      await tourist.reload();
      await expect(tourist.getByTestId('review-panel')).toBeVisible();
      await tourist.getByTestId('star-5').click();
      await tourist.getByTestId('submit-review').click();
      await expect(tourist.getByTestId('review-result')).toContainText('Thanks for rating');
      await expect(tourist.getByTestId('review-panel')).toHaveCount(0);

      // The aggregate recompute rides an AFTER_COMMIT event, so the header is polled, not assumed.
      await expect(async () => {
        await tourist.goto(`/venues/${venueId}`);
        const header = tourist.locator('.map-head');
        await expect(header.getByTestId('new-chip')).toHaveCount(0);
        await expect(header).toContainText('5.0');
        await expect(header).toContainText('1 review');
      }).toPass({ timeout: 20_000 });

      // One review per booking, ever — the second attempt is refused by the DB-backed claim.
      await tourist.goto(`/booking/${code}`);
      await expect(tourist.getByTestId('review-panel')).toHaveCount(0);
    } finally {
      await touristContext.close();
    }
  });
});
