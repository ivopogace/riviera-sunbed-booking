import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's day-refund card (ADR-0027 decision 1): an
 * admin looks a tourist up by the address they booked with, picks an open day of a stay, confirms with
 * grounds, and reads what the server did — including a refusal, which is an answer, not a failure.
 *
 * The admin bookings API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — the stamps, the release, the audit row — is proven
 * against real Postgres by `AdminDayRefundControllerIT`; this spec proves the console drives the
 * endpoints correctly, sends the grounds, never shows a code, and stays accessible doing it.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const TOURIST_EMAIL = 'tourist@example.com';
const ARRIVAL_CODE = 'ABCD2345';

type DayState = 'OPEN' | 'ATTENDED' | 'REFUNDED' | 'RELEASED';

interface DayJson {
  date: string;
  state: DayState;
}

/**
 * The lookup and refund endpoints, stateful: a `200` refund flips the day to `RELEASED`, so the card's
 * post-action re-read has something new to show — the backend's own behaviour, without a clock.
 * `refusal` makes the refund answer that RFC-7807 problem instead.
 */
async function mockAdminBookings(
  page: Page,
  options: { refusal?: { status: number; code: string } } = {},
): Promise<{ readonly reasons: string[] }> {
  const reasons: string[] = [];
  const days: DayJson[] = [
    { date: '2026-08-01', state: 'ATTENDED' },
    { date: '2026-08-02', state: 'OPEN' },
    { date: '2026-08-03', state: 'OPEN' },
  ];

  await page.route(/\/api\/admin\/bookings\/lookup$/, (route) =>
    route.fulfill({
      json: {
        bookings: [
          {
            bookingId: 42,
            venueName: 'Vala Beach',
            firstDate: '2026-08-01',
            lastDate: '2026-08-03',
            status: 'CONFIRMED',
            refundable: true,
            days,
          },
          {
            bookingId: 43,
            venueName: 'Vala Beach',
            firstDate: '2026-07-04',
            lastDate: '2026-07-04',
            status: 'AWAITING_PAYMENT',
            refundable: false,
            days: [],
          },
        ],
      },
    }),
  );

  await page.route(/\/api\/admin\/bookings\/\d+\/days\/[\d-]+\/refund$/, (route) => {
    reasons.push(route.request().headers()['x-audit-reason'] ?? '');
    if (options.refusal) {
      return route.fulfill({
        status: options.refusal.status,
        contentType: 'application/problem+json',
        json: { code: options.refusal.code, detail: 'refused' },
      });
    }
    const date = /days\/([\d-]+)\/refund$/.exec(route.request().url())![1];
    const day = days.find((d) => d.date === date)!;
    day.state = 'RELEASED';
    return route.fulfill({
      json: {
        kind: 'DAY_REFUNDED',
        serviceDate: date,
        refundMinor: 4500,
        currency: 'EUR',
        released: true,
      },
    });
  });

  return { reasons };
}

/** The outbox status the Refunds tab loads first; without it the tab shows its own load error above the card. */
async function mockEmptyOutbox(page: Page): Promise<void> {
  await page.route(/\/api\/admin\/refund-outbox$/, (route) =>
    route.fulfill({ json: { outstanding: 0, cooldownRemainingSeconds: 0 } }),
  );
}

/** Sign in as the platform admin and open the Refunds tab. */
async function openRefundsTab(page: Page): Promise<void> {
  await mockEmptyOutbox(page);
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/refunds');
}

async function lookUp(page: Page, email = TOURIST_EMAIL): Promise<void> {
  await page.getByTestId('admin-day-refund-email').fill(email);
  await page.getByTestId('admin-day-refund-lookup').click();
}

test('an admin refunds an open day of a stay with grounds and sees the day released', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const api = await mockAdminBookings(page);
  await openRefundsTab(page);

  await lookUp(page);

  const stay = page.getByTestId('admin-day-refund-booking-42');
  await expect(stay).toContainText('Vala Beach');
  await expect(stay).toContainText('Confirmed');
  await expect(page.getByTestId('admin-day-refund-state-42-2026-08-01')).toContainText(
    'Checked in',
  );
  await expect(page.getByTestId('admin-day-refund-not-refundable-43')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin day refund with results');

  await page.getByTestId('admin-day-refund-open-42-2026-08-02').click();

  const panel = page.getByTestId('admin-day-refund-confirm-panel-42');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('admin-day-refund-confirm-42')).toBeFocused();
  await expect(panel).toContainText('Sun 2 Aug 2026');
  await expectNoSeriousAxeViolations(page, 'admin day refund confirm open');

  await page.getByTestId('admin-day-refund-reason-42').fill('pool closed for repair');
  await page.getByTestId('admin-day-refund-confirm-42').click();

  const notice = page.getByTestId('admin-day-refund-notice');
  await expect(notice).toContainText('Sun 2 Aug 2026 refunded');
  await expect(notice).toContainText('€45');
  await expect(notice).toContainText('free again');
  // The settled leg: the confirm is gone, so focus parks on the notice (WCAG 2.4.3).
  await expect(notice).toBeFocused();
  expect(api.reasons).toEqual(['pool closed for repair']);
  // The card re-reads rather than assuming — the released state is the server's, not the client's.
  await expect(page.getByTestId('admin-day-refund-state-42-2026-08-02')).toContainText('released');
  await expect(page.getByTestId('admin-day-refund-open-42-2026-08-02')).toHaveCount(0);
  await expect(page.getByTestId('admin-day-refund-open-42-2026-08-03')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin day refund after a refund');
});

test('cancelling the confirm refunds nothing and returns focus to the day', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const api = await mockAdminBookings(page);
  await openRefundsTab(page);
  await lookUp(page);

  await page.getByTestId('admin-day-refund-open-42-2026-08-03').click();
  await page.getByTestId('admin-day-refund-cancel-42').click();

  await expect(page.getByTestId('admin-day-refund-confirm-panel-42')).toHaveCount(0);
  await expect(page.getByTestId('admin-day-refund-open-42-2026-08-03')).toBeFocused();
  expect(api.reasons).toEqual([]);
});

test('a refused refund reads as an answer, not as a failure', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAdminBookings(page, { refusal: { status: 409, code: 'DAY_ATTENDED' } });
  await openRefundsTab(page);
  await lookUp(page);

  await page.getByTestId('admin-day-refund-open-42-2026-08-02').click();
  await page.getByTestId('admin-day-refund-confirm-42').click();

  const notice = page.getByTestId('admin-day-refund-notice');
  await expect(notice).toContainText('checked in');
  await expect(notice).toBeFocused();
  await expect(page.getByTestId('admin-day-refund-error')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'admin day refund refused');
});

test('switching to another day of the same booking recreates the confirm and moves focus onto it', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAdminBookings(page);
  await openRefundsTab(page);
  await lookUp(page);

  await page.getByTestId('admin-day-refund-open-42-2026-08-02').click();
  await expect(page.getByTestId('admin-day-refund-confirm-42')).toBeFocused();

  await page.getByTestId('admin-day-refund-open-42-2026-08-03').click();

  const panel = page.getByTestId('admin-day-refund-confirm-panel-42');
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText('Mon 3 Aug 2026');
  await expect(page.getByTestId('admin-day-refund-confirm-42')).toBeFocused();
  // Every open day names its date, so the buttons never read alike (WCAG 2.5.3).
  await expect(page.getByTestId('admin-day-refund-open-42-2026-08-02')).toHaveAccessibleName(
    'Refund this day — Sun 2 Aug 2026',
  );
});

test('an address with no bookings is an empty result, not an error', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.route(/\/api\/admin\/bookings\/lookup$/, (route) =>
    route.fulfill({ json: { bookings: [] } }),
  );
  await openRefundsTab(page);

  await lookUp(page, 'nobody@example.com');

  await expect(page.getByTestId('admin-day-refund-empty')).toBeVisible();
  await expect(page.getByTestId('admin-day-refund-error')).toHaveCount(0);
});

/** Invariant #7: the arrival code is the tourist's credential and this console never shows it. */
test('the console never renders an arrival code', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAdminBookings(page);
  await openRefundsTab(page);

  await lookUp(page);

  await expect(page.getByTestId('admin-day-refund-results')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(ARRIVAL_CODE);
});

test('a signed-out visitor is shown no day-refund card', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockAdminBookings(page);
  await mockEmptyOutbox(page);

  await page.goto('/admin/refunds');

  await expect(page.getByTestId('admin-refunds-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-day-refund-card')).toHaveCount(0);
});
