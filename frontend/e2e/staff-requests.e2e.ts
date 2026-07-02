import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

/**
 * Real-render a11y + behaviour audit of the operator pending-requests queue (Request-to-Book,
 * issue #98): sign in as the operator → the venue-wide queue lists open requests (guest, set,
 * date, amount, deadline — and NO booking code, invariant #7) → Accept removes the row and
 * reports the outcome → Decline empties the queue. The API is mocked with a stateful queue
 * (`page.route`), so the spec is CI-safe and belongs in the mocked suite (`npm run test:e2e:a11y`).
 */

const VENUE = 1;

function mapBody() {
  const set = (id: number, pool: 'ONLINE' | 'WALK_IN') => ({
    id, rowLabel: 'Front row', positionNo: id, tier: 'PREMIUM', pool,
    price: { minorUnits: 4500, currency: 'EUR' }, gridX: id, gridY: 1,
    availability: 'FREE',
  });
  return {
    id: VENUE, name: 'Miramar Beach Club', beach: 'Ksamil', region: 'Albanian Riviera',
    description: 'Loungers on the shore.', ratingTenths: 48, reviewsCount: 12,
    bookingMode: 'REQUEST', fromPrice: { minorUnits: 4500, currency: 'EUR' },
    sets: [set(1, 'ONLINE'), set(2, 'ONLINE')],
  };
}

const REQUESTS = [
  {
    bookingId: 11, setId: 1, bookingDate: '2026-07-03', guestName: 'Ana Guest',
    amount: { minorUnits: 4500, currency: 'EUR' },
    requestedAt: '2026-07-01T09:00:00Z', requestExpiresAt: '2026-07-02T16:00:00Z',
  },
  {
    bookingId: 12, setId: 2, bookingDate: '2026-07-04', guestName: 'Bora Guest',
    amount: { minorUnits: 4500, currency: 'EUR' },
    requestedAt: '2026-07-01T10:00:00Z', requestExpiresAt: '2026-07-02T18:00:00Z',
  },
];

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test('operator works the pending-requests queue: list, accept, decline', async ({ page }) => {
  // Stateful queue: accept/decline remove the entry, exactly like the backend sweep would.
  let queue = [...REQUESTS];

  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ setId: 2, code: 'ARRIVE2345' }] }),
  );
  await page.route(/\/api\/venues\/1\/booking-requests$/, (route) =>
    route.fulfill({ json: queue }),
  );
  await page.route(/\/api\/venues\/1\/booking-requests\/11\/accept$/, (route) => {
    queue = queue.filter((r) => r.bookingId !== 11);
    return route.fulfill({ json: { bookingId: 11, status: 'AWAITING_PAYMENT' } });
  });
  await page.route(/\/api\/venues\/1\/booking-requests\/12\/decline$/, (route) => {
    queue = queue.filter((r) => r.bookingId !== 12);
    return route.fulfill({ json: { bookingId: 12, status: 'DECLINED' } });
  });
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: mapBody() }));

  await page.goto(`/venue-admin/daily/${VENUE}`);
  await page.getByLabel('Operator').fill('operator');
  await page.getByLabel('Password').fill('test-pw');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The queue lists both requests with guest, set, date, amount and deadline.
  await expect(page.getByRole('heading', { name: 'Pending requests' })).toBeVisible();
  const rows = page.getByTestId('request-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Ana Guest');
  await expect(rows.first()).toContainText('Front row · 1');
  await expect(rows.first()).toContainText('2026-07-03');
  await expect(rows.first()).toContainText('€45');

  // No booking code is rendered anywhere in the queue (invariant #7): the daily-bookings code
  // exists on the page, but never inside the requests section.
  await expect(page.getByText('ARRIVE2345')).toBeVisible();
  await expect(page.getByTestId('requests-section')).not.toContainText('ARRIVE2345');
  await expect(page.getByTestId('requests-section')).not.toContainText('code', { ignoreCase: true });
  await expectNoSeriousAxeViolations(page, 'pending-requests queue');

  // Accept the first request — the row leaves the queue and the outcome is announced.
  await page.getByRole('button', { name: /Accept booking request from Ana Guest/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('notice')).toContainText('Request accepted');
  await expectNoSeriousAxeViolations(page, 'after accepting a request');

  // Decline the remaining request — the queue empties.
  await page.getByRole('button', { name: /Decline booking request from Bora Guest/ }).click();
  await expect(page.getByTestId('requests-empty')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('Request declined');
  await expectNoSeriousAxeViolations(page, 'after declining the last request');
});
