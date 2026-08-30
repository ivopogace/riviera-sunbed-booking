import { expect, Browser, Page, test } from '@playwright/test';

import { completeDialog } from '../support/booking-dialog';
import { createVenue, signInOperator, venueName } from './support/operator';

/**
 * Real-backend e2e for the whole review loop. A real Chromium drives the REAL Spring Boot
 * backend against the REAL Flyway-migrated Postgres — nothing is mocked, and the payment leg runs on
 * the in-process `StubPaymentGateway` (`@Profile("!stripe")`), which confirms synchronously, so the
 * booking reaches `CONFIRMED` without Stripe.
 *
 * It proves the one thing the backend ITs and the mocked suite can each only prove in halves: the
 * whole chain, in order — operator lays out a venue and opens same-day sales, a tourist books today,
 * the operator checks the code in, the guest reviews the stay in words, changes it, removes it, and
 * the venue's public header follows every one of those through a real recompute. Every fence in
 * between is the server's.
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

/** Poll the venue header until the AFTER_COMMIT recompute has landed the expected score. */
async function expectVenueScore(tourist: Page, venueId: number, score: string): Promise<void> {
  await expect(async () => {
    await tourist.goto(`/venues/${venueId}`);
    const header = tourist.locator('.map-head');
    await expect(header.getByTestId('new-chip')).toHaveCount(0);
    await expect(header).toContainText(score);
    await expect(header).toContainText('1 review');
    // "1 review" is a substring of "1 reviews", so the singular needs its own assertion.
    await expect(header).not.toContainText('1 reviews');
  }).toPass({ timeout: 20_000 });
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

      // Not yet delivered: the server's panel says why there is no form, and offers none.
      await tourist.goto(`/booking/${code}`);
      await expect(tourist.getByTestId('booking-code')).toContainText(code);
      await expect(tourist.getByTestId('review-not-completed-note')).toBeVisible();
      await expect(tourist.getByTestId('submit-review')).toHaveCount(0);

      // The operator checks the code in from the daily view — the real guarded transition.
      await page.goto(`/operator/${venueId}/daily`);
      await expect(page.getByTestId('daily-view-tab')).toBeVisible();
      await page.getByTestId('checkin-code-input').fill(code);
      await page.getByTestId('checkin-submit').click();
      await expect(page.getByTestId('checkin-result')).toContainText('Checked in');

      // Now the form appears — from the server's panel, on a re-read of the same page.
      await tourist.reload();
      await expect(tourist.getByTestId('review-panel')).toBeVisible();
      await tourist.getByTestId('star-5').click();
      await tourist.getByTestId('review-comment').fill('Best sunbeds on the bay.');
      await tourist.getByTestId('submit-review').click();
      await expect(tourist.getByTestId('review-result')).toContainText('Thanks for reviewing');

      // The stored review reads back from the server, words and all — no local patch.
      await expect(tourist.getByTestId('own-review-comment')).toContainText('Best sunbeds');
      await tourist.reload();
      await expect(tourist.getByTestId('own-review-comment')).toContainText('Best sunbeds');
      await expect(tourist.getByTestId('submit-review')).toHaveCount(0);

      // The aggregate recompute rides an AFTER_COMMIT event, so the header is polled, not assumed.
      await expectVenueScore(tourist, venueId, '5.0');

      // An edit rewrites the row and moves the score with it.
      await tourist.goto(`/booking/${code}`);
      await tourist.getByTestId('edit-review').click();
      await expect(tourist.getByTestId('review-comment')).toHaveValue('Best sunbeds on the bay.');
      await tourist.getByTestId('star-3').click();
      await tourist.getByTestId('submit-review').click();
      await expect(tourist.getByTestId('review-result')).toContainText('has been updated');
      await expectVenueScore(tourist, venueId, '3.0');

      // A delete takes the venue back to "New" — the recompute is a full re-read, never a decrement.
      await tourist.goto(`/booking/${code}`);
      await tourist.getByTestId('start-delete-review').click();
      await tourist.getByTestId('confirm-delete-review').click();
      await expect(tourist.getByTestId('review-result')).toContainText('has been removed');
      // The stay is reviewable again: a delete frees the slot while the window is still open.
      await expect(tourist.getByTestId('submit-review')).toBeVisible();
      await expect(async () => {
        await tourist.goto(`/venues/${venueId}`);
        await expect(tourist.locator('.map-head').getByTestId('new-chip')).toBeVisible();
      }).toPass({ timeout: 20_000 });
    } finally {
      await touristContext.close();
    }
  });
});
