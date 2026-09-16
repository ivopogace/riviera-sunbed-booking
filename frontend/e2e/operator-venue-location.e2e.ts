import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { CARD_INK, consoleThemeOf, expectConsoleTheme } from './support/console-theme';

/**
 * Real-render CI-safe e2e for the venue-location pin placer. Drives sign-in → open the Venue tab →
 * drop a pin on the riviera map → save → reload and find it where it was left → clear it → save →
 * reload and find none. API mocked via `page.route`, stateful over the profile's optimistic-
 * concurrency token; the map runs the fake engine (`__RIVIERA_FAKE_MAP__`), so a click on the map
 * surface is a genuine gesture with no tiles and no WebGL.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

/** A whole, in-range pin off Dhërmi, at the six decimals the server stores. */
const DHERMI = { latitude: 40.1468, longitude: 19.6482 };

const INITIAL_PROFILE = {
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
  photos: {
    cover: { previewUrl: null },
    sunbeds: { previewUrl: null },
    bar: { previewUrl: null },
  },
};

test.use({ colorScheme: 'dark' });

/**
 * The console reads this mock survives a reload, so "save, reload, the pin is still there" is a
 * genuine round-trip rather than a component that kept its own signal. `patches` collects the
 * profile writes; the PATCH enforces the version token exactly as the server does.
 */
async function mockVenue(
  page: Page,
  location: { latitude: number; longitude: number } | null = null,
): Promise<{ patches: Request[] }> {
  const patches: Request[] = [];
  let sessionLive = false;
  const profile = { ...INITIAL_PROFILE, location };
  let serverVersion = INITIAL_PROFILE.version;

  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
  });

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
    route.fulfill({ json: { ...profile, version: serverVersion } }),
  );

  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => {
    if (route.request().method() !== 'PATCH') {
      return route.fulfill({ json: { id: 1, name: profile.name, sets: [] } });
    }
    patches.push(route.request());
    const body = route.request().postDataJSON() as Partial<typeof INITIAL_PROFILE> & {
      expectedVersion?: number;
    };
    if (body.expectedVersion !== serverVersion) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'STALE_WRITE', detail: '' },
      });
    }
    serverVersion += 1;
    const fields = { ...body };
    delete fields.expectedVersion; // the token is not a profile field
    Object.assign(profile, fields);
    return route.fulfill({ status: 204, body: '' });
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

  return { patches };
}

async function signInAndOpenVenue(page: Page): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Venue & commodities' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/venue/);
  await expect(page.getByTestId('venue-tab')).toBeVisible();
  await expect(page.getByTestId('venue-location-map')).toHaveAttribute('data-status', 'ready');
}

/** Click the map's own surface — the fake engine turns it into a map click at a real position. */
async function dropPin(page: Page): Promise<void> {
  await page.getByTestId('venue-location-map').getByTestId('riviera-map-fake').click();
}

test('drops a pin, saves it, and finds it where it was left after a reload (+ axe)', async ({
  page,
}) => {
  const { patches } = await mockVenue(page);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await expect(page.getByTestId('venue-location-readout')).toContainText('No pin');
  await expect(page.getByTestId('map-pin')).toHaveCount(0);

  await dropPin(page);
  await expect(page.getByTestId('map-pin')).toBeVisible();
  const placed = await page.getByTestId('venue-location-readout').textContent();
  expect(placed).toMatch(/Latitude -?\d+\.\d{6}, longitude -?\d+\.\d{6}/);

  // The pin is a real control on the map, so it meets the 44 px floor like every other one.
  const box = await page.getByTestId('map-pin').boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab with a pin');

  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
  expect(patches).toHaveLength(1);
  const sent = patches[0].postDataJSON() as { location: { latitude: number; longitude: number } };
  expect(sent.location).not.toBeNull();

  await page.reload();
  await expect(page.getByTestId('venue-tab')).toBeVisible();
  await expect(page.getByTestId('venue-location-map')).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('map-pin')).toBeVisible();
  await expect(page.getByTestId('venue-location-readout')).toHaveText(placed ?? '');
});

test('clears the pin, saves, and reloads with the venue unpinned', async ({ page }) => {
  const { patches } = await mockVenue(page, DHERMI);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await expect(page.getByTestId('map-pin')).toBeVisible();
  await expect(page.getByTestId('venue-location-readout')).toContainText('40.146800');

  await page.getByTestId('venue-location-clear').click();
  await expect(page.getByTestId('map-pin')).toHaveCount(0);
  await expect(page.getByTestId('venue-location-readout')).toContainText('No pin');

  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
  const sent = patches[0].postDataJSON() as { location: unknown };
  expect(sent.location).toBeNull();

  await page.reload();
  await expect(page.getByTestId('venue-tab')).toBeVisible();
  await expect(page.getByTestId('venue-location-map')).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('map-pin')).toHaveCount(0);
  await expect(page.getByTestId('venue-location-readout')).toContainText('No pin');
});

test('paints the pin placer under porcelain and the dark console (#1099, + axe)', async ({
  page,
}, testInfo) => {
  const theme = consoleThemeOf(testInfo);
  await mockVenue(page);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  // The console host wears the console theme while the document stays the tourist's dark.
  await expectConsoleTheme(page, theme);
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');
  await expect(page.getByTestId('venue-location-readout')).toBeVisible();

  await dropPin(page);
  await expect(page.getByTestId('map-pin')).toBeVisible();
  // The pin wears the theme-invariant solid-button skin: it sits on imagery, which never themes.
  await expect(page.getByTestId('map-pin')).toHaveCSS('color', 'rgb(10, 79, 94)');
  await expect(page.getByTestId('map-pin')).toHaveCSS('background-color', 'rgb(244, 246, 247)');
  // Its label beside the map is console ink, and follows the console theme.
  await expect(page.getByTestId('venue-location-clear')).toHaveCSS('color', CARD_INK[theme]);

  await settle(page);
  await expectNoSeriousAxeViolations(page, `venue location placer (${theme})`);
});
