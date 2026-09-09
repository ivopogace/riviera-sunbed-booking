import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for closing a venue for the season: sign in → Venue tab → close
 * with a reopen day and the advance-sales opt-in → the owner-asserted PUT carries both and the card
 * shows what still stands → the Discover list badges the venue "Closed for season · reopens 15 May"
 * and lists it after the open venue → the beach map wears the chip and the season notice → reopen
 * → the DELETE clears it and the badge is gone. Plus the refused reopen date. API mocked via
 * `page.route` (no backend); axe over the tab and the list.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

const PROFILE = {
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  bookingMode: 'INSTANT',
  bookingCutoff: '18:00',
  salesClose: '16:00',
  commissionBps: 1500,
  payoutCurrency: 'EUR',
  amenities: ['WIFI'],
  distanceToWaterM: 20,
  version: 7,
  photos: { cover: { previewUrl: null }, sunbeds: { previewUrl: null }, bar: { previewUrl: null } },
};

interface Closure {
  closed: boolean;
  reopenOn: string | null;
  advanceSales: boolean;
}

function summary(id: number, name: string, closure: Closure) {
  return {
    id,
    name,
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: id === 1 ? 48 : 41,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2000, currency: 'EUR' },
    amenities: ['WIFI'],
    distanceToWaterM: 20,
    availability: { free: 10, total: 12 },
    salesOpen: !closure.closed,
    closedForSeason: closure.closed,
    reopensOn: closure.closed ? closure.reopenOn : null,
  };
}

function venueMap(closure: Closure) {
  return {
    ...summary(1, 'Miramar Beach Club', closure),
    description: 'Loungers on the shore.',
    setVersion: 0,
    salesClose: '16:00',
    sets: [
      {
        id: 10,
        rowLabel: 'A',
        positionNo: 1,
        tier: 'STANDARD',
        pool: 'ONLINE',
        price: { minorUnits: 2000, currency: 'EUR' },
        gridX: 1,
        gridY: 1,
        availability: 'FREE',
      },
    ],
  };
}

test.use({ colorScheme: 'dark' });

/**
 * Session + shell + tab reads mocked. The closure is STATEFUL: the PUT/DELETE move it, and the
 * profile, list and map reads reflect it — the list sorts the closed venue last, as the server does.
 * `refuseDate` makes the PUT answer 422 REOPEN_DATE_PASSED.
 */
async function mockSeason(page: Page, refuseDate = false): Promise<{ writes: Request[] }> {
  const writes: Request[] = [];
  let sessionLive = false;
  const closure: Closure = { closed: false, reopenOn: null, advanceSales: false };

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

  await page.route(/\/api\/venues\/1\/profile$/, (route) =>
    route.fulfill({ json: { ...PROFILE, seasonClosure: { ...closure } } }),
  );
  await page.route(/\/api\/venues\/1\/season-closure$/, (route) => {
    writes.push(route.request());
    if (route.request().method() === 'DELETE') {
      Object.assign(closure, { closed: false, reopenOn: null, advanceSales: false });
      return route.fulfill({ status: 204, body: '' });
    }
    if (refuseDate) {
      return route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        json: { code: 'REOPEN_DATE_PASSED', detail: 'The reopen date is not after today.' },
      });
    }
    const body = route.request().postDataJSON() as {
      reopenOn: string | null;
      advanceSales: boolean;
    };
    Object.assign(closure, {
      closed: true,
      reopenOn: body.reopenOn,
      advanceSales: body.advanceSales,
    });
    return route.fulfill({
      json: {
        closedForSeason: true,
        reopenOn: body.reopenOn,
        advanceSales: body.advanceSales,
        futureBookings: 3,
        pendingRequests: 1,
      },
    });
  });
  // The map read (`?date=`) and the list read are disjoint paths; the list sorts closed venues last.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: venueMap(closure) }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, (route) => {
    const miramar = summary(1, 'Miramar Beach Club', closure);
    const aurora = summary(2, 'Aurora Bay', { closed: false, reopenOn: null, advanceSales: false });
    return route.fulfill({ json: closure.closed ? [aurora, miramar] : [miramar, aurora] });
  });

  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
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
  await page.route(/\/api\/venues\/1\/availability-calendar(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/venues\/1\/reviews(\?.*)?$/, (route) =>
    route.fulfill({ json: { reviews: [], nextCursor: null } }),
  );

  return { writes };
}

async function signInAndOpenVenue(page: Page): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Venue & commodities' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/venue/);
  await expect(page.getByTestId('venue-tab')).toBeVisible();
}

test('close for the season → the Discover badge and the map notice → reopen clears it (+ axe)', async ({
  page,
}) => {
  const { writes } = await mockSeason(page);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  // Open venue: the season card offers the close; the form is two-step.
  await page.getByTestId('venue-season-close').click();
  await expect(page.getByTestId('venue-season-reopen-on')).toBeFocused();
  await expect(page.getByTestId('venue-season-advance-sales')).toHaveCount(0);
  await page.getByTestId('venue-season-reopen-on').fill('2027-05-15');
  await page.getByTestId('venue-season-advance-sales').check();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab season form');
  await page.getByTestId('venue-season-confirm').click();

  // The owner-asserted PUT carries the day and the opt-in; the card shows what still stands.
  const status = page.getByTestId('venue-season-status');
  await expect(status).toContainText('Closed for season');
  await expect(status).toContainText('Sat 15 May 2027');
  await expect(status).toContainText('Dates from the reopen date can be booked now');
  await expect(page.getByTestId('venue-season-counts')).toContainText(
    '3 future bookings and 1 pending request still stand',
  );
  await expect(status).toBeFocused();
  expect(writes).toHaveLength(1);
  expect(writes[0].method()).toBe('PUT');
  expect(writes[0].postDataJSON()).toEqual({ reopenOn: '2027-05-15', advanceSales: true });
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab closed for season');

  // Discover: the closed venue is badged with its reopen day and listed after the open one.
  await page.goto('/');
  const cards = page.getByTestId('venue-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Aurora Bay');
  const closedCard = cards.nth(1);
  await expect(closedCard.locator('.closed-for-season-chip')).toContainText(
    'Closed for season · reopens 15 May',
  );
  await expect(closedCard).toHaveAccessibleName(/closed for season, reopens 15 May/);
  await expect(page.locator('.sales-closed-chip')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'discover list with a closed venue');

  // The map stays browsable: the chip in the header, the season notice, no selectable tile.
  await page.goto('/venues/1');
  await expect(page.locator('.closed-for-season-chip')).toContainText('reopens 15 May');
  await expect(page.getByTestId('map-closed-for-season')).toContainText('closed for the season');
  await expect(page.getByTestId('map-closed-for-season')).toContainText('Sat 15 May 2027');
  await expect(page.getByTestId('map-sales-closed')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Select to book/ })).toHaveCount(0);

  // Reopen by hand: the DELETE clears the closure and the badge is gone.
  await page.goto('/operator/1/venue');
  await expect(page.getByTestId('venue-season-status')).toBeVisible();
  await page.getByTestId('venue-season-reopen').click();
  await expect(page.getByTestId('venue-season-close')).toBeVisible();
  await expect(page.getByTestId('venue-season-close')).toBeFocused();
  expect(writes).toHaveLength(2);
  expect(writes[1].method()).toBe('DELETE');

  await page.goto('/');
  await expect(page.getByTestId('venue-card').nth(0)).toContainText('Miramar Beach Club');
  await expect(page.locator('.closed-for-season-chip')).toHaveCount(0);
});

test('a reopen date the server refuses stays on the form as a field error', async ({ page }) => {
  await mockSeason(page, true);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await page.getByTestId('venue-season-close').click();
  await page.getByTestId('venue-season-reopen-on').fill('2020-01-01');
  await page.getByTestId('venue-season-confirm').click();

  await expect(page.getByTestId('venue-season-date-error')).toContainText('after today');
  await expect(page.getByTestId('venue-season-form')).toBeVisible();
  await expect(page.getByTestId('venue-season-status')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab refused reopen date');
});
