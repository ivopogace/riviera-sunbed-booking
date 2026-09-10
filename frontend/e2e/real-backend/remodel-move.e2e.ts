import { expect, Browser, Page, test } from '@playwright/test';

import { createVenue, signInOperator, uniqueSuffix, venueName } from './support/operator';

/**
 * Real-backend e2e for the remodel commit, end to end across both actors. A real Chromium drives the
 * REAL Spring Boot backend against the REAL Flyway-migrated Postgres — nothing is mocked: the guest
 * books by solving a real proof-of-work challenge, the payment leg runs on the in-process
 * `StubPaymentGateway` (`@Profile("!stripe")`) so the booking is `CONFIRMED`, the operator paints the
 * booked set out and previews, the commit moves the booking and the layout in one transaction under
 * the venue-wide set lock (invariant #2), the "your spot changed" mail lands in the recording mailer's
 * outbox (read over the operator-gated mock-mail endpoint), and the guest takes the free exit for a
 * full refund — the refund tier the move overrides (invariant #10). The second run takes the other
 * branch: with nowhere same-or-better to go, the commit refunds the guest under the typed
 * confirmation and mails them a link to book again.
 *
 * The tourist runs in its OWN browser context: the booking legs are session-free, and sharing the
 * operator's cookie would test a signed-in operator booking a sunbed instead. Local-only suite (never
 * CI); run with `npm run test:e2e`.
 */

const API = 'http://localhost:8080';

/** A day far enough out that the free exit is `movedAt + 24h`, never clipped by the service day. */
function farFutureDate(): string {
  const day = new Date();
  day.setUTCFullYear(day.getUTCFullYear() + 1);
  day.setUTCDate(day.getUTCDate() + (Date.now() % 200));
  return day.toISOString().slice(0, 10);
}

/** Lay out one sea-facing row of three: generated cells are ONLINE and, in row A, premium. */
async function layOutRowOfThree(page: Page, venueId: number): Promise<void> {
  await page.goto(`/operator/${venueId}/beach-map`);
  await expect(page.getByTestId('layout-editor')).toBeVisible();
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('3');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(3);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
}

/** Book A · spot 1 on `date` as an anonymous guest through the real challenge; returns the code. */
async function bookSpotOne(
  tourist: Page,
  venueId: number,
  date: string,
  email: string,
): Promise<string> {
  await tourist.goto(`/venues/${venueId}?date=${date}`);
  const spotOne = tourist.getByRole('button', { name: /^A · spot 1,.*Select to book/ });
  await expect(spotOne).toBeVisible({ timeout: 30_000 });
  await spotOne.click();

  const dialog = tourist.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Full name').fill('Moved Guest');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Phone').fill('+355699000222');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(tourist.getByTestId('challenge-status')).toHaveText(/Security check passed/, {
    timeout: 60_000,
  });
  await dialog.getByTestId('dialog-primary').click();

  await expect(tourist).toHaveURL(/\/booking\/confirmation/, { timeout: 30_000 });
  const code = (
    (await tourist.getByTestId('booking-code').locator('div').first().textContent()) ?? ''
  ).trim();
  expect(code).toMatch(/^[A-Z0-9]{8,}$/);
  return code;
}

interface BookingMail {
  kind: string;
  from: string | null;
  to: string | null;
  rowsAway: number | null;
  positionsAway: number | null;
  freeExitUntil: string | null;
  rebookLink: string | null;
}

/** Poll the recording mailer's outbox until the guest's mail of `kind` has landed. */
async function awaitMail(page: Page, email: string, kind: string): Promise<BookingMail> {
  let found: BookingMail | undefined;
  await expect(async () => {
    const response = await page.request.get(
      `${API}/api/mock-mail/booking-mails?to=${encodeURIComponent(email)}`,
    );
    expect(response.ok()).toBe(true);
    const mails = (await response.json()) as BookingMail[];
    found = mails.find((mail) => mail.kind === kind);
    expect(found).toBeDefined();
  }).toPass({ timeout: 20_000 });
  return found!;
}

test.describe('remodel commit — real backend, real Postgres', () => {
  test('the operator moves a booked set; the guest is mailed, sees the change and takes the free exit', async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    await page.goto('/operator?create=1');
    await signInOperator(page);
    await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
    const venueId = await createVenue(page, venueName('remodel'));
    await layOutRowOfThree(page, venueId);

    const touristContext = await browser.newContext();
    const tourist = await touristContext.newPage();
    try {
      const email = `e2e-moved-${uniqueSuffix()}@example.com`;
      const code = await bookSpotOne(tourist, venueId, farFutureDate(), email);

      // The operator paints the booked set out: the dry run answers a moves-only picture.
      await page.goto(`/operator/${venueId}/beach-map`);
      await expect(page.getByTestId('layout-editor')).toBeVisible();
      await page.getByTestId('layout-tool-gap').click();
      const a1 = page.locator('[data-testid="layout-cell"][data-grid-row="0"][data-grid-col="0"]');
      await expect(a1).toHaveAttribute('data-locked', 'true');
      await a1.click();
      await expect(a1).toHaveAttribute('data-state', 'gap');
      await page.getByTestId('layout-save').click();

      const dialog = page.getByTestId('layout-remodel-preview');
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('layout-remodel-moves')).toContainText(
        'Row A · position 1 → Row A · position 2 · 1 position along the row',
      );
      await expect(page.getByTestId('layout-remodel-keep')).toHaveCount(0);

      // Save and move: one transaction writes the layout, re-seats the booking and answers a receipt.
      await page.getByTestId('layout-remodel-commit').click();
      await expect(page.getByTestId('layout-remodel-receipt')).toBeVisible();
      await expect(page.getByTestId('layout-remodel-receipt-title')).toContainText('receipt #');
      await expect(page.getByTestId('layout-remodel-receipt-moves')).toContainText(
        'Row A · position 1 → Row A · position 2',
      );
      await expect(page.getByTestId('layout-saved')).toBeVisible();

      // The "your spot changed" mail rides an AFTER_COMMIT event, so the outbox is polled, not assumed.
      const moved = await awaitMail(page, email, 'BOOKING_MOVED');
      expect(moved).toMatchObject({ from: 'A1', to: 'A2', rowsAway: 0, positionsAway: 1 });
      expect(moved.freeExitUntil).toBeTruthy();

      // The guest reads the change on the booking they hold, with the same deadline the mail named.
      await tourist.goto(`/booking/${code}`);
      await expect(tourist.getByTestId('booking-code')).toContainText(code);
      await expect(tourist.getByTestId('booking-moved')).toContainText(
        'your set moved from A · spot 1 to A · spot 2 (1 position along the row)',
      );
      await expect(tourist.getByTestId('booking-free-exit')).toContainText('full refund until');
      await expect(tourist.getByTestId('refund-terms')).toContainText(
        'Because the venue moved your spot, you can cancel for a full refund until',
      );

      // The free exit: the guest cancels and the server refunds in full, reason VENUE_CHANGE.
      await tourist.getByTestId('start-cancel').click();
      await tourist.getByTestId('confirm-cancel').click();
      await expect(tourist.getByTestId('cancel-result')).toContainText(
        'will be refunded to your card.',
      );
      await expect(tourist.getByTestId('booking-status')).toHaveText('Cancelled');
      await expect(tourist.getByTestId('booking-cancelled')).toContainText(
        'You cancelled this booking after the venue moved your spot.',
      );
      await tourist.reload();
      await expect(tourist.getByTestId('booking-cancelled')).toContainText(
        'You cancelled this booking after the venue moved your spot.',
      );
      await expect(tourist.getByTestId('refunded-amount')).toBeVisible();
    } finally {
      await touristContext.close();
    }
  });

  test('with nowhere same-or-better free, the commit refunds the guest under the typed confirmation', async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    await page.goto('/operator?create=1');
    await signInOperator(page);
    await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
    const venueId = await createVenue(page, venueName('refund'));
    await layOutRowOfThree(page, venueId);

    const touristContext = await browser.newContext();
    const tourist = await touristContext.newPage();
    try {
      const email = `e2e-refunded-${uniqueSuffix()}@example.com`;
      const date = farFutureDate();
      const code = await bookSpotOne(tourist, venueId, date, email);

      // Take the other two sets off the online pool first, so the booked one has no candidate left.
      await page.goto(`/operator/${venueId}/beach-map`);
      await expect(page.getByTestId('layout-editor')).toBeVisible();
      await page.getByTestId('layout-tool-walkin').click();
      await page
        .locator('[data-testid="layout-cell"][data-grid-row="0"][data-grid-col="1"]')
        .click();
      await page
        .locator('[data-testid="layout-cell"][data-grid-row="0"][data-grid-col="2"]')
        .click();
      await page.getByTestId('layout-save').click();
      await expect(page.getByTestId('layout-saved')).toBeVisible();

      // Now paint the booked set out: the dry run answers a refund, not a move.
      await page.getByTestId('layout-tool-gap').click();
      const a1 = page.locator('[data-testid="layout-cell"][data-grid-row="0"][data-grid-col="0"]');
      await a1.click();
      await page.getByTestId('layout-save').click();

      await expect(page.getByTestId('layout-remodel-preview')).toBeVisible();
      await expect(page.getByTestId('layout-remodel-refunds')).toContainText('refunded in full');
      await expect(page.getByTestId('layout-remodel-moves')).toHaveCount(0);
      const save = page.getByTestId('layout-remodel-commit');
      await expect(save).toBeDisabled();

      await page.getByTestId('layout-remodel-refund-count').fill('1');
      await page.getByTestId('layout-remodel-reason').fill('Re-laying row A for the season');
      await expect(save).toBeEnabled();
      await save.click();

      await expect(page.getByTestId('layout-remodel-receipt')).toBeVisible();
      await expect(page.getByTestId('layout-remodel-receipt-refunds')).toContainText(
        'Row A · position 1',
      );
      await expect(page.getByTestId('layout-remodel-receipt-reason')).toHaveText(
        'Reason: Re-laying row A for the season',
      );
      await expect(page.getByTestId('layout-saved')).toBeVisible();

      // The cancellation mail carries the way back: the venue's own map for the day it can still sell.
      const cancelled = await awaitMail(page, email, 'BOOKING_CANCELLATION');
      expect(cancelled.rebookLink).toContain(`/venues/${venueId}?date=${date}`);

      // The guest reads the cancellation on the booking they hold, refunded in full.
      await tourist.goto(`/booking/${code}`);
      await expect(tourist.getByTestId('booking-status')).toHaveText('Cancelled');
      await expect(tourist.getByTestId('refunded-amount')).toBeVisible();
    } finally {
      await touristContext.close();
    }
  });
});
