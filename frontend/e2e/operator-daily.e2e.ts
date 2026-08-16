import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the Daily view tab. Drives sign-in → open the Daily view tab
 * → see the three tile states (free / booked-online-locked) + the arrivals code chips → tap a free
 * set to mark a walk-in → assert the owner-asserted mark POST and that the tile flips to walk-in
 * marked after the reconcile. API mocked via `page.route` (no backend); axe over the tab.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

// A1 free, A2 held by a CONFIRMED booking, A3 free, A4 an UNPAID online hold.
const BOOKINGS = [{ setId: 2, code: 'ABC12345', status: 'CONFIRMED' }];

function seat(
  id: number,
  positionNo: number,
  pool: 'ONLINE' | 'WALK_IN',
  availability: 'FREE' | 'TAKEN',
) {
  return {
    id,
    rowLabel: 'A',
    positionNo,
    tier: 'PREMIUM' as const,
    pool,
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability,
  };
}

/** The map is only a scrolling region if it actually overflows — both grid tests rest on that. */
async function expectGridScrolls(page: Page): Promise<void> {
  const overflows = await page
    .getByTestId('daily-grid')
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows, 'the grid scrolls inside its frame').toBe(true);
}

/** A twelve-set single row — wide enough that a 44px tile per column cannot fit a 390px viewport. */
function wideVenue(name: string, availability: 'FREE' | 'TAKEN') {
  return {
    id: 1,
    name,
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: '',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets: Array.from({ length: 12 }, (_, i) => seat(i + 1, i + 1, 'ONLINE', availability)),
  };
}

/** Session + shell reads mocked; a `marked` set makes the mark/release round-trip survive reconcile. */
async function mockDaily(page: Page): Promise<void> {
  const marked = new Set<number>();
  let sessionLive = false;
  let guestArrived = false;
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
  // Mark / release a walk-in — mutate `marked`, 204. (POST marks, DELETE releases.)
  await page.route(/\/api\/venues\/1\/sets\/(\d+)\/availability(\?.*)?$/, (route) => {
    const id = Number(/\/sets\/(\d+)\//.exec(route.request().url())![1]);
    if (route.request().method() === 'POST') {
      marked.add(id);
    } else {
      marked.delete(id);
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ ...BOOKINGS[0], status: guestArrived ? 'COMPLETED' : 'CONFIRMED' }] }),
  );
  // Check-in (#583): first scan completes, any further scan answers the single-use 409.
  await page.route(/\/api\/venues\/1\/bookings\/[A-Z0-9]+\/check-in$/, (route) => {
    if (guestArrived) {
      return route.fulfill({ status: 409, json: { code: 'ALREADY_CHECKED_IN' } });
    }
    guestArrived = true;
    return route.fulfill({ json: { setId: 2, bookingDate: '2026-07-08' } });
  });
  // The per-set states read: sets 2 + 4 are online holds (4 unpaid, so absent from the bookings read).
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        { setId: 2, state: 'BOOKED_ONLINE' },
        { setId: 4, state: 'BOOKED_ONLINE' },
        ...[...marked].map((setId) => ({ setId, state: 'STAFF_MARKED' })),
      ],
    }),
  );
  // The venue map: sets 2 + 4 are always TAKEN (online-held); a marked set reads TAKEN too.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Miramar Beach Club',
        beach: 'Ksamil',
        region: 'Albanian Riviera',
        description: 'Loungers on the shore.',
        ratingTenths: 48,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: { minorUnits: 3000, currency: 'EUR' },
        sets: [1, 2, 3, 4].map((id) =>
          seat(
            id,
            id,
            id === 3 ? 'WALK_IN' : 'ONLINE',
            id === 2 || id === 4 || marked.has(id) ? 'TAKEN' : 'FREE',
          ),
        ),
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
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
}

test.use({ colorScheme: 'dark' });

async function signInAndOpenDaily(page: Page): Promise<void> {
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();
}

test('shows tile states + arrival codes, and marks a walk-in that survives the reconcile (+ axe)', async ({
  page,
}) => {
  await mockDaily(page);
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  // Tile states: set 1 free, set 2 booked online (locked), set 3 free.
  await expect(page.locator('[data-set-id="1"]')).toHaveAttribute('data-state', 'FREE');
  await expect(page.locator('[data-set-id="2"]')).toHaveAttribute('data-state', 'BOOKED_ONLINE');

  // Every tile shows its position number beside the state glyph — the walk-in affordance (#686).
  const visibleTileText = (setId: number) =>
    page.locator(`[data-set-id="${setId}"] > [aria-hidden="true"]`);
  await expect(visibleTileText(1)).toHaveText(['1']);
  await expect(visibleTileText(2)).toHaveText(['●', '2']);

  // The UNPAID hold (set 4, no confirmed booking) is locked — never a tappable walk-in ✓.
  await expect(page.locator('[data-set-id="4"]')).toHaveAttribute('data-state', 'BOOKED_ONLINE');

  // Only STAFF_MARKED states count — the old taken−confirmed remainder showed a phantom 1.
  await expect(page.getByTestId('oc-stat-walkins')).toHaveText('0');

  // Arrivals: one row with the display-only booking code chip.
  await expect(page.getByTestId('daily-arrival-row')).toHaveCount(1);
  await expect(page.getByTestId('daily-arrival-code')).toHaveText('ABC12345');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'daily view tab');

  // Tap the free set 1 → mark walk-in; after the reconcile it stays walk-in marked.
  await page.locator('[data-set-id="1"]').click();
  await expect(page.locator('[data-set-id="1"]')).toHaveAttribute('data-state', 'STAFF_MARKED');
  await expect(visibleTileText(1)).toHaveText(['✓', '1']);
});

test('checks a guest in by QR scan — single-use, announced, and the row stays flagged (#583)', async ({
  page,
}) => {
  // Arm the deterministic scanner: first a foreign QR, then the tourist QR URL, then a re-scan.
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__ = [
      'https://example.com/not-a-booking',
      'http://localhost:4200/booking/ABC12345',
      'ABC12345',
    ];
  });
  await mockDaily(page);
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  // A non-booking QR is rejected client-side; nothing is posted.
  await page.getByTestId('checkin-scan-toggle').click();
  await expect(page.getByTestId('checkin-result')).toContainText('isn’t a booking');

  // The tourist QR (the /booking/{code} URL) checks the guest in; the row gains the chip.
  await page.getByTestId('checkin-scan-toggle').click();
  await expect(page.getByTestId('checkin-result')).toContainText('Checked in');
  await expect(page.getByTestId('arrival-checked-in')).toBeVisible();
  await expect(page.getByTestId('daily-arrival-row')).toHaveCount(1);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'daily view tab after check-in');

  // Scanning the same code again is refused distinctly — the QR is single-use.
  await page.getByTestId('checkin-scan-toggle').click();
  await expect(page.getByTestId('checkin-result')).toContainText('Already checked in');
});

test('a swept no-show still lists, badged, so a past day is not an empty page', async ({
  page,
}) => {
  await mockDaily(page);
  // The sweep has already run on this day: the booking is terminal, not awaited.
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ setId: 2, code: 'ABC12345', status: 'NO_SHOW' }] }),
  );
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  await expect(page.getByTestId('daily-arrival-row')).toHaveCount(1);
  await expect(page.getByTestId('arrival-no-show')).toHaveText('No-show');
  await expect(page.getByTestId('arrival-checked-in')).toHaveCount(0);
  await expect(page.getByTestId('daily-arrivals-empty')).toHaveCount(0);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'daily view tab with a swept no-show');
});

test('checks a guest in by typed code — the keyboard path needs no camera (#583)', async ({
  page,
}) => {
  await mockDaily(page);
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  await page.getByTestId('checkin-code-input').fill('abc-123 45');
  await page.getByTestId('checkin-code-input').press('Enter');
  await expect(page.getByTestId('checkin-result')).toContainText('Checked in');
  await expect(page.getByTestId('arrival-checked-in')).toBeVisible();
});

/**
 * A wide venue is where the 44 px touch-target floor (#605) and the map's shape collide: twelve
 * sets cannot each be 44 px across a 390 px phone, so the grid has to scroll inside its own frame
 * rather than squeeze the tiles or push the page sideways.
 */
test('a wide venue keeps every tile tappable and scrolls inside its frame (#605)', async ({
  page,
}) => {
  await mockDaily(page);
  // Registered after mockDaily's, so this wide-venue payload wins the route match.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: wideVenue('Wide Bay', 'FREE') }),
  );
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  await expect(page.getByTestId('daily-tile')).toHaveCount(12);
  // Only a set the staff can act on renders a button; the held ones render inert tile content.
  const tiles = page.getByTestId('daily-tile').locator('button');
  await expect(tiles).toHaveCount(10);
  for (const tile of await tiles.all()) {
    const box = (await tile.boundingBox())!;
    expect(box.width, 'tile width').toBeGreaterThanOrEqual(44);
    expect(box.height, 'tile height').toBeGreaterThanOrEqual(44);
  }

  // The map scrolls inside the frame; the page itself never scrolls sideways.
  await expectGridScrolls(page);
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(pageOverflows, 'the page must not scroll sideways').toBe(false);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'daily view, wide venue at 390px');
});

/**
 * A fully-sold day renders every tile as an inert `<span>`, so the scrolling map contains no
 * focusable descendant at all. That is the one state where the scroller's own tab stop is the only
 * way a keyboard user can reach the far columns — and axe's `scrollable-region-focusable` is what
 * says so. No spec seeded this state before, which is how removing that tab stop went unnoticed.
 */
test('a fully-sold day keeps the scrolling map keyboard-reachable (#605)', async ({ page }) => {
  await mockDaily(page);
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: wideVenue('Sold Out Bay', 'TAKEN') }),
  );
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({
      json: Array.from({ length: 12 }, (_, i) => ({ setId: i + 1, state: 'BOOKED_ONLINE' })),
    }),
  );
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1');
  await signInAndOpenDaily(page);

  await expect(page.getByTestId('daily-tile')).toHaveCount(12);
  await expect(page.getByTestId('daily-tile').locator('button')).toHaveCount(0);

  // The fixture must really overflow, or the axe check below proves nothing.
  await expectGridScrolls(page);
  await expect(page.getByTestId('daily-grid')).toHaveAttribute('tabindex', '0');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'daily view, fully sold at 390px');
});
