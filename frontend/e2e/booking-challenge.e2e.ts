import { expect, test } from '@playwright/test';

import { ChallengeCode, ChallengeFence, mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { mockFencedBookingCreate, settle } from './support/booking-dialog';

/**
 * The proof-of-work fence on booking create, real-rendered against the mocked API
 * (`support/auth-mocks.ts` mints low-cost challenges the widget REALLY solves in Chromium's Web
 * Workers). What is proven here and nowhere else in CI: the widget rides the checkout step that
 * submits — not Details, whose above-the-fold budget it would blow — and starts solving as soon as
 * that step takes focus; each of the edge's three refusals renders its message, keeps the tourist
 * on Review with nothing booked, and fetches a fresh challenge so the retry succeeds without a
 * reload; and the kill switch hides the widget while booking keeps working. The two journeys that
 * carry the fence end to end are `booking-flow.e2e.ts` and `same-day-booking.e2e.ts`; the real
 * verifier is `e2e/real-backend/booking-challenge.e2e.ts`'s job.
 */

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  sets: [
    {
      id: 2,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 2,
      gridY: 1,
      availability: 'FREE',
    },
  ],
};

const CONFIRMATION = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
};

const MESSAGES: Readonly<Record<ChallengeCode, RegExp>> = {
  CHALLENGE_REQUIRED: /hasn’t finished yet/,
  CHALLENGE_INVALID: /didn’t verify/,
  CHALLENGE_EXPIRED: /expired/,
};

/** Open the map, pick the free online set, and fill Details so the dialog sits on Review. */
async function goToReview(page: import('@playwright/test').Page) {
  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByTestId('dialog-primary')).toHaveText('Continue to payment');
  return dialog;
}

async function setUp(page: import('@playwright/test').Page, mode: 'on' | 'off' = 'on') {
  const fence = await mockChallengeFence(page, mode);
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await mockFencedBookingCreate(page, fence, (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );
  return fence;
}

test('the widget rides the submitting step, solves on focus, and the create carries the solution', async ({
  page,
}) => {
  const fence: ChallengeFence = await setUp(page);

  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Details hosts no widget: it is the step the #188 above-the-fold guard measures.
  await expect(page.getByTestId('challenge-widget')).toHaveCount(0);

  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  // Advancing focuses the primary button inside the widget's form, which starts the solve.
  await expect(page.getByTestId('challenge-widget')).toBeVisible();
  await expect(page.getByTestId('challenge-widget')).toContainText('Protected by');
  await expect(page.getByTestId('challenge-status')).toHaveText(/Security check passed/, {
    timeout: 15_000,
  });

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking Review step with the solved widget');

  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation/);
  expect(fence.lastSolvedCounter()).toEqual(expect.any(Number));
});

for (const code of Object.keys(MESSAGES) as ChallengeCode[]) {
  test(`a ${code} refusal books nothing, names the reason, and the retry succeeds`, async ({
    page,
  }) => {
    const fence = await setUp(page);
    const dialog = await goToReview(page);
    await expect(page.getByTestId('challenge-status')).toHaveText(/Security check passed/, {
      timeout: 15_000,
    });
    const fetchesBeforeSubmit = fence.fetches();

    fence.refuseNextWith(code);
    await dialog.getByRole('button', { name: 'Continue to payment' }).click();

    // Refused ahead of the controller: no booking, no navigation, and the tourist can retry here.
    await expect(dialog.getByTestId('dialog-error')).toHaveText(MESSAGES[code]);
    await expect(page).not.toHaveURL(/\/booking\/confirmation/);
    await expect(page.getByTestId('step-2')).toHaveAttribute('aria-current', 'step');
    await settle(page);
    await expectNoSeriousAxeViolations(page, `booking create refused with ${code}`);

    // The refusal restarted the widget: a fresh challenge, solved again, and the retry goes through.
    await expect(page.getByTestId('challenge-status')).toHaveText(/Security check passed/, {
      timeout: 15_000,
    });
    expect(fence.fetches()).toBeGreaterThan(fetchesBeforeSubmit);
    await dialog.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page).toHaveURL(/\/booking\/confirmation/);
  });
}

test('the kill switch hides the widget and booking still completes', async ({ page }) => {
  await setUp(page, 'off');

  const dialog = await goToReview(page);
  await expect(page.getByTestId('challenge-widget')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'booking Review step with the fence off');

  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('booking-code')).toContainText('ABCD234567');
});
