import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the O8 Venue & commodities tab (#177). Drives sign-in → open the tab →
 * the details form pre-fills from the owner profile (with read-only commission % + payout currency) →
 * edit the name + toggle an amenity + flip booking mode → assert the widened owner-asserted profile
 * PATCH (body carries the edits, NEVER commission/payout currency) and the saved notice → then the
 * tourist beach-map reflects the new name (the re-render AC). Also the cross-venue (403) copy and the
 * photo placeholders. API mocked via `page.route` (no backend); axe over the tab.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

const INITIAL_PROFILE = {
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  bookingMode: 'INSTANT',
  bookingCutoff: '18:00',
  commissionBps: 1500,
  payoutCurrency: 'EUR',
  amenities: ['WIFI', 'BEACH_BAR'],
  distanceToWaterM: 20,
  version: 7, // the optimistic-concurrency token the tab loads and echoes back (#224)
  // The per-slot photo map (#142) — empty here; the photo flows live in operator-venue-photos.e2e.ts.
  photos: {
    cover: { previewUrl: null },
    sunbeds: { previewUrl: null },
    bar: { previewUrl: null },
  },
};

function venueMap(name: string, bookingMode: string) {
  return {
    id: 1,
    name,
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode,
    fromPrice: { minorUnits: 2000, currency: 'EUR' },
    amenities: ['BEACH_BAR', 'WIFI'],
    distanceToWaterM: 20,
    sets: [],
  };
}

test.use({ colorScheme: 'dark' });

/**
 * Session + shell + tab reads mocked. The profile GET + tourist map GET are STATEFUL: a successful
 * PATCH updates them, so a later navigation to the tourist beach-map genuinely reflects the edit
 * (the re-render AC). `patches` collects the profile writes; `deny` makes the PATCH 403.
 */
async function mockVenue(
  page: Page,
  deny = false,
): Promise<{ patches: Request[]; bump: () => void }> {
  const patches: Request[] = [];
  let sessionLive = false;
  const profile = { ...INITIAL_PROFILE };
  // The server-side version (#224). The profile GET hands it out; the PATCH enforces it (a mismatch is
  // 409 STALE_WRITE) and bumps it on success. `bump()` simulates a concurrent writer moving the row on
  // behind the tab's back, so a subsequent stale save is genuinely rejected.
  let serverVersion = INITIAL_PROFILE.version;
  const bump = () => {
    serverVersion += 1;
  };
  let currentMap = venueMap(profile.name, profile.bookingMode);

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

  // The owner profile read (tab source). Reflects prior successful PATCHes + the current version (stateful).
  await page.route(/\/api\/venues\/1\/profile$/, (route) =>
    route.fulfill({ json: { ...profile, version: serverVersion } }),
  );

  // The widened profile PATCH (no query) AND the shell/tourist map GET (`?date=`) share the
  // `/api/venues/1` path — one handler, branched on method. PATCH is captured (204, or 403 when
  // denied); on success the edit is folded into the stateful profile + map so the tourist re-render
  // assertion is genuine. The `(\?.*)?$` tail matches the dated GET too (it never matches `/1/profile`).
  await page.route(
    /\/api\/venues\/1(\?.*)?$/,
    (route) => {
      if (route.request().method() === 'PATCH') {
        patches.push(route.request());
        if (deny) {
          return route.fulfill({
            status: 403,
            contentType: 'application/problem+json',
            json: { code: 'NOT_VENUE_OWNER', detail: '' },
          });
        }
        const body = route.request().postDataJSON() as Partial<typeof INITIAL_PROFILE> & {
          expectedVersion?: number;
        };
        // Optimistic-concurrency guard (#224): a write whose token no longer matches the row is a
        // 409 STALE_WRITE — never a silent clobber. A match bumps the row's version by one.
        if (body.expectedVersion !== serverVersion) {
          return route.fulfill({
            status: 409,
            contentType: 'application/problem+json',
            json: { code: 'STALE_WRITE', detail: '' },
          });
        }
        serverVersion += 1;
        const fields = { ...body };
        delete fields.expectedVersion; // the token is not a profile field — don't fold it into state
        Object.assign(profile, fields);
        currentMap = venueMap(profile.name, profile.bookingMode);
        return route.fulfill({ status: 204, body: '' });
      }
      // GET /api/venues/1 (shell header/stats + tourist map) — the current (possibly edited) map.
      return route.fulfill({ json: currentMap });
    },
  );

  // Shell stats-strip reads (kept simple/empty — the tab under test doesn't need real values).
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) => route.fulfill({ json: [] }));
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

  return { patches, bump };
}

async function signInAndOpenVenue(page: Page): Promise<void> {
  await page.getByTestId('oc-user').fill('operator');
  await page.getByTestId('oc-pass').fill('pw');
  await page.getByTestId('oc-signin-submit').click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Venue & commodities' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/venue/);
  await expect(page.getByTestId('venue-tab')).toBeVisible();
}

test('pre-fills the form, saves the widened profile without commission/currency, and the tourist map re-renders (+ axe)', async ({
  page,
}) => {
  const { patches } = await mockVenue(page);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  // The form pre-fills from the owner profile; commission is a read-only %, payout currency read-only.
  await expect(page.getByTestId('venue-name')).toHaveValue('Miramar Beach Club');
  await expect(page.getByTestId('venue-booking-mode')).toHaveValue('INSTANT');
  await expect(page.getByTestId('venue-commission')).toHaveText('15%');
  await expect(page.getByTestId('venue-payout-currency')).toHaveText('EUR');
  await expect(page.getByTestId('amenity-toggle-WIFI')).toHaveAttribute('aria-pressed', 'true');
  // The three photo slots are real upload controls now (#142) — all empty here, so each offers
  // Add photo; the full pick → upload → preview → remove flows live in operator-venue-photos.e2e.ts.
  await expect(page.getByTestId('photo-slot')).toHaveCount(3);
  await expect(page.getByTestId('photo-pick-cover')).toHaveText(/Add photo/);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab');

  // Edit: rename, flip mode to REQUEST, toggle an amenity, then save.
  await page.getByTestId('venue-name').fill('Miramar Renamed');
  await page.getByTestId('venue-booking-mode').selectOption('REQUEST');
  await page.getByTestId('amenity-toggle-RESTAURANT').click();
  await page.getByTestId('venue-save').click();

  await expect(page.getByTestId('venue-saved')).toBeVisible();
  expect(patches).toHaveLength(1);
  const body = patches[0].postDataJSON();
  expect(body.name).toBe('Miramar Renamed');
  expect(body.bookingMode).toBe('REQUEST'); // flips the tourist Instant→Request flow server-side
  expect(body.amenities).toEqual(expect.arrayContaining(['WIFI', 'BEACH_BAR', 'RESTAURANT']));
  // Read-only fields are NEVER on the wire (invariant #9).
  expect(body.commissionBps).toBeUndefined();
  expect(body.payoutCurrency).toBeUndefined();

  // The re-render AC: the tourist beach-map page now shows the edited name.
  await page.goto('/venues/1');
  await expect(page.getByText('Miramar Renamed').first()).toBeVisible();
});

test('shows the not-owner message when the save is 403', async ({ page }) => {
  await mockVenue(page, true);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await page.getByTestId('venue-name').fill('Hijack Attempt');
  await page.getByTestId('venue-save').click();

  await expect(page.getByTestId('venue-error')).toContainText(/manage/i);
});

test('a stale-tab save is rejected 409, keeps the edits, and Reload recovers (#224, + axe)', async ({
  page,
}) => {
  const { bump } = await mockVenue(page);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page); // the tab loads the profile at version 7

  // A concurrent writer moves the venue on (→ version 8) behind this still-open tab.
  bump();

  // The operator edits and saves off the now-stale version 7 → 409 STALE_WRITE.
  await page.getByTestId('venue-name').fill('Stale Local Edit');
  await page.getByTestId('venue-save').click();

  // The conflict banner + Reload action is shown; the operator's edit is PRESERVED (never discarded),
  // and neither the generic error nor the saved notice fires.
  await expect(page.getByTestId('venue-stale-banner')).toBeVisible();
  await expect(page.getByTestId('venue-stale-reload')).toBeVisible();
  await expect(page.getByTestId('venue-name')).toHaveValue('Stale Local Edit');
  await expect(page.getByTestId('venue-error')).toBeHidden();
  await expect(page.getByTestId('venue-saved')).toBeHidden();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab stale-write banner');

  // Reload pulls the latest server state (version 8) and clears the banner.
  await page.getByTestId('venue-stale-reload').click();
  await expect(page.getByTestId('venue-stale-banner')).toBeHidden();

  // Re-applying and saving now succeeds against the fresh version.
  await page.getByTestId('venue-name').fill('After Reload');
  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
});
