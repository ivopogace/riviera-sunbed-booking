import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * CI-safe mocked e2e for the Requests tab. Drives sign-in → the console shell →
 * the Requests tab: the venue-wide pending queue (guest, set + tier, date, price, respond-by, urgency
 * chip — and NO booking code, invariant #7) → Accept sends to payment and decrements the badge (never
 * self-confirms, invariant #8) → confirm-gated Decline empties the queue → a lost sweep race surfaces
 * the dismissible expired-race copy. The API is mocked with a stateful queue via `page.route`, so the
 * suite is CI-safe (no backend) and belongs in the mocked a11y suite (`npm run test:e2e:a11y`). It
 * replaces the retired legacy `staff-requests.e2e.ts` (daily-ops is covered by `operator-daily.e2e.ts`).
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };
const VENUE = 1;

/** An ISO instant `hours` from now — deterministic urgency relative to the browser's load-time clock. */
function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

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

function seedQueue() {
  return [
    {
      bookingId: 11,
      setId: 1,
      bookingDate: '2026-07-03',
      guestName: 'Ana Guest',
      amount: { minorUnits: 4500, currency: 'EUR' },
      requestedAt: '2026-07-01T09:00:00Z',
      requestExpiresAt: inHours(3), // urgent → the ⏰ chip renders
    },
    {
      bookingId: 12,
      setId: 2,
      bookingDate: '2026-07-04',
      guestName: 'Bora Guest',
      amount: { minorUnits: 4500, currency: 'EUR' },
      requestedAt: '2026-07-01T10:00:00Z',
      requestExpiresAt: inHours(30), // not urgent
    },
  ];
}

/**
 * Mock the console + Requests endpoints with a stateful session and a stateful queue. `accept`/`decline`
 * remove the entry (as the backend would); `accept` never returns CONFIRMED here (the guest is asked to
 * pay — the webhook confirms, invariant #8). Pass an `overrides` map to make a specific accept fail.
 */
async function mockRequests(
  page: Page,
  overrides: Record<number, { status: number; code: string }> = {},
): Promise<{ mapReads: () => number }> {
  let sessionLive = false;
  let queue = seedQueue();
  let mapReads = 0;

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

  // The pending queue (shell badge + tab both read this URL).
  await page.route(/\/api\/venues\/1\/booking-requests$/, (route) =>
    route.fulfill({ json: queue }),
  );

  // Accept / decline: fail per `overrides`, else remove the entry.
  await page.route(/\/api\/venues\/1\/booking-requests\/(\d+)\/(accept|decline)$/, (route) => {
    const match = /booking-requests\/(\d+)\/(accept|decline)$/.exec(route.request().url());
    const bookingId = Number(match![1]);
    const action = match![2];
    const override = overrides[bookingId];
    if (override) {
      return route.fulfill({
        status: override.status,
        contentType: 'application/problem+json',
        json: { type: 'about:blank', status: override.status, code: override.code },
      });
    }
    queue = queue.filter((r) => r.bookingId !== bookingId);
    return route.fulfill({
      json: { bookingId, status: action === 'accept' ? 'AWAITING_PAYMENT' : 'DECLINED' },
    });
  });

  // The stats strip's reads + the tab's venue-map read for set labels.
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
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    mapReads += 1;
    return route.fulfill({ json: venueMap() });
  });
  return { mapReads: () => mapReads };
}

async function signInAndOpenRequests(page: Page): Promise<void> {
  await page.goto(`/operator/${VENUE}`);
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Requests' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/requests/);
  await expect(page.getByTestId('requests-tab')).toBeVisible();
}

test('lists the queue, accepts (badge decrements), and declines to empty — no booking code (#7, #8)', async ({
  page,
}) => {
  await mockRequests(page);
  await signInAndOpenRequests(page);

  // Two cards; the badge shows the live pending count.
  const cards = page.getByTestId('request-card');
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('2');
  await expect(cards.first()).toContainText('Ana Guest');
  await expect(cards.first()).toContainText('A · 1'); // set label + tier from the map
  await expect(cards.first()).toContainText('Front row');
  await expect(cards.first()).toContainText('€45');
  await expect(cards.first()).toContainText('Respond by');
  // The urgent card carries the amber time-left chip; the calm one does not.
  await expect(cards.first().getByTestId('urgency-chip')).toBeVisible();
  await expect(cards.nth(1).getByTestId('urgency-chip')).toHaveCount(0);
  // No booking code anywhere in the requests region (invariant #7).
  await expect(page.getByTestId('requests-tab').locator('code')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'requests queue');

  // Accept Ana's request → it leaves the queue, the badge follows the store to 1, and the notice
  // says the guest is asked to pay (accept never self-confirms — invariant #8).
  await page.getByRole('button', { name: /Accept.*from Ana Guest/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('1');
  await expect(page.getByTestId('requests-notice')).toContainText('asked to pay');
  await expectNoSeriousAxeViolations(page, 'after accepting a request');

  // Decline Bora's request — confirm-gated: the confirm appears, then Confirm decline empties the queue.
  await page.getByRole('button', { name: /Decline.*from Bora Guest/ }).click();
  await expect(page.getByTestId('decline-confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm decline' }).click();
  await expect(page.getByTestId('requests-empty')).toBeVisible();
  await expect(page.getByTestId('requests-empty')).toContainText('All caught up');
  await expect(page.getByTestId('oc-requests-badge')).toHaveCount(0); // 0 → the badge disappears
  await expect(page.getByTestId('requests-notice')).toContainText('declined');
  await expectNoSeriousAxeViolations(page, 'all caught up');
});

test('opens the Requests tab on ONE venue-map read, not two (#486)', async ({ page }) => {
  const { mapReads } = await mockRequests(page);

  // Deep-linked so only the shell + tab mount; /operator/1 would add the layout editor's own read.
  await page.goto(`/operator/${VENUE}/requests`);
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();

  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('request-card')).toHaveCount(2);
  // The set label proves the tab really got the map — a cache hit, not a skipped read.
  await expect(page.getByTestId('request-card').first()).toContainText('A · 1');
  await settle(page);

  // The shell (header title + Free-today tile) and the tab (set labels) share one snapshot.
  expect(mapReads()).toBe(1);
});

test('an accept that lost the sweep race shows the dismissible expired-race copy (409 REQUEST_EXPIRED)', async ({
  page,
}) => {
  await mockRequests(page, { 11: { status: 409, code: 'REQUEST_EXPIRED' } });
  await signInAndOpenRequests(page);

  await page.getByRole('button', { name: /Accept.*from Ana Guest/ }).click();

  // The card flips in place to the expired copy; the accept/decline buttons are gone (no double-action).
  const expired = page.getByTestId('expired-race');
  await expect(expired).toBeVisible();
  await expect(expired).toContainText('just expired');
  await expect(page.getByRole('button', { name: /Accept.*from Ana Guest/ })).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'expired-race card');

  // Dismiss removes the card.
  await page.getByTestId('dismiss-expired').click();
  await expect(page.getByTestId('request-card').filter({ hasText: 'Ana Guest' })).toHaveCount(0);
});
