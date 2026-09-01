import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * CI-safe mocked e2e for the Payouts tab. Drives sign-in → the console shell →
 * the Payouts tab: the payout ledger (accruals + a negative refund reversal with a reason chip, the
 * "Owed to you" hero = the server's net owed, and NO booking code / guest identity — invariants
 * #5/#7/#9/#11) → the display-only statement modal (total due + "assigned at settlement" placeholder)
 * → a per-DATE weather refund, confirm-gated, whose reversal appears on the re-read (the server
 * decides + executes it — invariant #10; the tab only triggers) → the 403 owner-assert copy on the
 * money action (invariant #13). The API is mocked with a stateful ledger via `page.route`, so the
 * suite is CI-safe (no backend) and runs in the mocked a11y suite (`npm run test:e2e:a11y`).
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };
const VENUE = 1;

function venueMap() {
  const set = (id: number, rowLabel: string, positionNo: number, tier: 'PREMIUM' | 'STANDARD') => ({
    id,
    rowLabel,
    positionNo,
    tier,
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability: 'FREE',
  });
  return {
    id: VENUE,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 4500, currency: 'EUR' },
    sets: [set(1, 'A', 1, 'PREMIUM'), set(2, 'B', 2, 'STANDARD')],
  };
}

function accrual(bookingId: number, netMinor: number, runningNetMinor: number, createdAt: string) {
  return {
    type: 'ACCRUAL',
    bookingId,
    grossMinor: netMinor + 675,
    commissionMinor: 675,
    netMinor,
    currency: 'EUR',
    reason: null,
    createdAt,
    runningNetMinor,
  };
}
function reversal(
  bookingId: number,
  netMinor: number,
  runningNetMinor: number,
  reason: 'WEATHER' | 'POLICY',
  createdAt: string,
) {
  return {
    type: 'REVERSAL',
    bookingId,
    grossMinor: netMinor + 375,
    commissionMinor: 375,
    netMinor,
    currency: 'EUR',
    reason,
    createdAt,
    runningNetMinor,
  };
}

/** The ledger before a weather refund: two accruals + a prior POLICY reversal → net owed €66.50. */
function seedLedger() {
  return {
    venueId: VENUE,
    currency: 'EUR',
    netOwedMinor: 6650,
    entries: [
      accrual(11, 3825, 3825, '2026-07-01T09:00:00Z'),
      accrual(12, 3825, 7650, '2026-07-02T09:00:00Z'),
      reversal(13, 1000, 6650, 'POLICY', '2026-07-03T09:00:00Z'),
    ],
  };
}

/** The ledger after the weather refund of #11 posts its reversal → net owed €28.25, two reversals. */
function ledgerAfterWeather() {
  const seed = seedLedger();
  return {
    ...seed,
    netOwedMinor: 2825,
    entries: [...seed.entries, reversal(11, 3825, 2825, 'WEATHER', '2026-07-05T09:00:00Z')],
  };
}

/**
 * Mock the console shell + payout endpoints with a stateful session and a stateful ledger. The weather
 * refund flips the ledger to include the WEATHER reversal (as the AFTER_COMMIT payout listener would),
 * so the re-read shows it. Pass `weatherError` to make the refund fail (the owner-assert / failure path).
 */
async function mockPayouts(
  page: Page,
  { weatherError }: { weatherError?: { status: number; code: string } } = {},
): Promise<void> {
  let sessionLive = false;
  let ledger = seedLedger();

  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: PRINCIPAL });
  });
  await page.route(/\/api\/auth\/logout$/, (route) => {
    sessionLive = false;
    return route.fulfill({ status: 204, body: '' });
  });

  // The per-venue payout ledger — the tab re-reads it after a weather refund.
  await page.route(/\/api\/venues\/1\/payout-ledger$/, (route) => route.fulfill({ json: ledger }));

  // The per-date weather refund: fail per `weatherError`, else record the reversal + return the outcome.
  await page.route(/\/api\/venues\/1\/weather-refund(\?.*)?$/, (route) => {
    if (weatherError) {
      return route.fulfill({
        status: weatherError.status,
        contentType: 'application/problem+json',
        json: { type: 'about:blank', status: weatherError.status, code: weatherError.code },
      });
    }
    ledger = ledgerAfterWeather();
    return route.fulfill({ json: { refundedCount: 1, totalRefundedMinor: 4500, currency: 'EUR' } });
  });

  // The shell's own reads on mount (stats strip + requests badge + venue header).
  await page.route(/\/api\/venues\/1\/booking-requests$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        gross: { minorUnits: 0, currency: 'EUR' },
        net: { minorUnits: 0, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-08',
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: venueMap() }));
}

async function signInAndOpenPayouts(page: Page): Promise<void> {
  await page.goto(`/operator/${VENUE}`);
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Payouts' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/payouts/);
  await expect(page.getByTestId('payouts-tab')).toBeVisible();
}

test('renders the ledger + owed, opens the statement, and issues a per-date weather refund (#5/#9/#10)', async ({
  page,
}) => {
  await mockPayouts(page);
  await signInAndOpenPayouts(page);

  // Ledger: two accruals + one prior reversal; the owed hero is the server's net owed; no code/guest.
  await expect(page.getByTestId('ledger-row')).toHaveCount(3);
  await expect(page.getByTestId('payout-owed')).toContainText('€66.50');
  await expect(page.getByTestId('ledger-reason')).toHaveCount(1); // the prior POLICY reversal
  await expect(page.getByTestId('payouts-tab')).toContainText('#11'); // the non-credential reference
  await expect(page.getByTestId('payouts-tab').locator('code')).toHaveCount(0); // no bearer code (#7)
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'payout ledger');

  // Statement modal: display-only — the total due is the server owed, transfer details are placeholders.
  await page.getByTestId('statement-open').click();
  await expect(page.getByTestId('payout-statement')).toBeVisible();
  await expect(page.getByTestId('statement-total')).toContainText('€66.50');
  await expect(page.getByTestId('payout-statement')).toContainText('Assigned at settlement');
  await expectNoSeriousAxeViolations(page, 'payout statement');
  await page.getByTestId('statement-close').click();
  await expect(page.getByTestId('payout-statement')).toHaveCount(0);

  // Weather refund: confirm-gated (no call until confirmed), whole-day, server-decided; the reversal
  // then appears on the re-read (a second reason chip) and the owed follows the server's new figure.
  await page.getByTestId('weather-trigger').click();
  const weatherConfirm = page.getByTestId('weather-confirm');
  await expect(weatherConfirm).toBeVisible();
  // Rendered via shared/confirm-panel (#881): an alertdialog with a non-empty accessible name.
  await expect(weatherConfirm).toHaveAttribute('role', 'alertdialog');
  await expect(weatherConfirm).toHaveAccessibleName(/^Weather refund for .+\?$/);
  await page.getByTestId('weather-confirm-btn').click();
  await expect(page.getByTestId('payouts-notice')).toContainText('refund issued');
  await expect(page.getByTestId('ledger-reason')).toHaveCount(2); // the new WEATHER reversal joined
  await expect(page.getByTestId('payout-owed')).toContainText('€28.25');
  await expectNoSeriousAxeViolations(page, 'after weather refund');
});

test('a cross-venue weather refund shows the owner-assert copy and posts no reversal (#13)', async ({
  page,
}) => {
  await mockPayouts(page, { weatherError: { status: 403, code: 'NOT_VENUE_OWNER' } });
  await signInAndOpenPayouts(page);

  await page.getByTestId('weather-trigger').click();
  await page.getByTestId('weather-confirm-btn').click();

  await expect(page.getByTestId('payouts-notice')).toContainText('manage');
  // The confirm closed and no reversal was added (the ledger is unchanged — still one reason chip).
  await expect(page.getByTestId('weather-confirm')).toHaveCount(0);
  await expect(page.getByTestId('ledger-reason')).toHaveCount(1);
});

test('keeps focus off body across the weather-refund confirm (WCAG 2.4.3)', async ({ page }) => {
  await mockPayouts(page);
  await signInAndOpenPayouts(page);

  // Open: the trigger is removed from the DOM, so focus has to land on the destructive button.
  await page.getByTestId('weather-trigger').click();
  await expect(page.getByTestId('weather-confirm-btn')).toBeFocused();

  // Back out: the confirm is removed, so focus returns to the trigger it replaced.
  await page.getByTestId('weather-cancel-btn').click();
  await expect(page.getByTestId('weather-trigger')).toBeFocused();

  // Settled: neither control survives, so focus parks on the notice carrying the outcome.
  await page.getByTestId('weather-trigger').click();
  await page.getByTestId('weather-confirm-btn').click();
  await expect(page.getByTestId('payouts-notice')).toContainText('refund issued');
  await expect(page.getByTestId('payouts-notice')).toBeFocused();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'weather refund focus legs');
});
