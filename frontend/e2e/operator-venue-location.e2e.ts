import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { CARD_INK, consoleThemeOf, expectConsoleTheme } from './support/console-theme';
import { mockMapResources } from './support/map-resources';

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

/** Where the operator is standing, for the near-me leg — on the coast, inside the map's fence. */
const AT_THE_VENUE = { latitude: 39.874231, longitude: 20.007412 };

const INITIAL_PROFILE = {
  name: 'Miramar Beach Club',
  beach: 'KSAMIL',
  region: 'SARANDE',
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
  map: { coastLng?: number; real?: boolean } = {},
): Promise<{ patches: Request[] }> {
  const patches: Request[] = [];
  let sessionLive = false;
  const profile = { ...INITIAL_PROFILE, location };
  let serverVersion = INITIAL_PROFILE.version;

  if (map.real) {
    await mockMapResources(page);
  } else {
    await page.addInitScript((coastLng: number | null) => {
      const armed = window as unknown as {
        __RIVIERA_FAKE_MAP__?: boolean;
        __RIVIERA_FAKE_MAP_COAST__?: number;
      };
      armed.__RIVIERA_FAKE_MAP__ = true;
      if (coastLng !== null) {
        armed.__RIVIERA_FAKE_MAP_COAST__ = coastLng;
      }
    }, map.coastLng ?? null);
  }

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

test('places and clears the pin from the keyboard alone, and saves it', async ({ page }) => {
  const { patches } = await mockVenue(page);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  // No coordinate input is offered, so this button is the whole keyboard path (WCAG 2.1.1).
  await page.getByTestId('venue-location-place').focus();
  await expect(page.getByTestId('venue-location-place')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('map-pin')).toBeVisible();
  await expect(page.getByTestId('venue-location-readout')).toContainText('Latitude');

  await page.getByTestId('venue-location-clear').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('map-pin')).toHaveCount(0);
  // Clearing must not disable the control it was pressed on, or focus lands on <body> (WCAG 2.4.3).
  await expect(page.getByTestId('venue-location-clear')).toBeFocused();
  await expect(page.getByTestId('venue-location-clear')).toHaveAttribute('aria-disabled', 'true');

  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
  expect((patches[0].postDataJSON() as { location: unknown }).location).toBeNull();
});

test('does not move the venue when the pin itself is tapped', async ({ page }) => {
  await mockVenue(page, DHERMI);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);
  await expect(page.getByTestId('map-pin')).toBeVisible();
  const before = await page.getByTestId('venue-location-readout').textContent();

  // Tapping the pin is a grab, not a new position: it must not reach the map-click handler.
  await page.getByTestId('map-pin').click();

  await expect(page.getByTestId('venue-location-readout')).toHaveText(before ?? '');
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

/**
 * The operator standing on their own beach: the map's own near-me control centres on them, and the
 * placer's keyboard twin commits it — no coordinates typed, no map tapped, and the pin that reaches
 * the server is where they are.
 */
test('centres on the operator and pins the venue where they stand', async ({ page, context }) => {
  const { patches } = await mockVenue(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(AT_THE_VENUE);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await page.getByRole('button', { name: 'Near me' }).click();
  await expect(page.getByTestId('map-here')).toBeVisible();
  await expect(page.getByTestId('map-near-me-message')).toHaveCount(0);

  await page.getByTestId('venue-location-place').click();

  await expect(page.getByTestId('venue-location-readout')).toContainText('39.874231');
  await expect(page.getByTestId('venue-location-readout')).toContainText('20.007412');

  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
  const sent = patches[0].postDataJSON() as { location: { latitude: number; longitude: number } };
  expect(sent.location).toEqual(AT_THE_VENUE);
});

test('tells the operator when their browser declines, leaving the map and the pin alone', async ({
  page,
}) => {
  await mockVenue(page, DHERMI);
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);
  const before = await page.getByTestId('venue-location-readout').textContent();

  await page.getByRole('button', { name: 'Near me' }).click();

  await expect(page.getByTestId('map-near-me-message')).toHaveText(
    'Location permission was declined. The map hasn\u2019t moved.',
  );
  await expect(page.getByTestId('map-here')).toHaveCount(0);
  await expect(page.getByTestId('venue-location-readout')).toHaveText(before ?? '');
  await expectNoSeriousAxeViolations(page, 'venue tab with a declined near-me');
});

/**
 * Both markers can end up on the same spot — a pinned venue whose operator then presses Near me
 * while standing at it. The pin is the draggable one, so it has to stay the one a pointer reaches:
 * a decorative dot over its middle would swallow the drag and pan the map instead.
 */
test('keeps the venue pin on top when the you-are-here dot lands on it', async ({
  page,
  context,
}) => {
  await mockVenue(page, DHERMI);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: DHERMI.latitude, longitude: DHERMI.longitude });
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);
  await expect(page.getByTestId('map-pin')).toBeVisible();

  await page.getByRole('button', { name: 'Near me' }).click();
  await expect(page.getByTestId('map-here')).toBeVisible();

  const owner = await page.getByTestId('map-pin').evaluate((pin) => {
    const box = pin.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return (top as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid');
  });

  expect(owner).toBe('map-pin');
});

/**
 * The shoreline offer. Water west of {@link COAST_LNG}, land east of it: the map opens centred at
 * (19.75, 40.05), so its own centre is about 28 px inland — past the shore band, and an offer.
 */
const COAST_LNG = 19.7;

/** `Latitude 40.050000, longitude 19.750000` → the two numbers, as the field stores them. */
async function readout(page: Page): Promise<{ latitude: number; longitude: number }> {
  const text = (await page.getByTestId('venue-location-readout').textContent()) ?? '';
  const found = /Latitude (-?\d+\.\d+), longitude (-?\d+\.\d+)/.exec(text);
  expect(found, `no coordinates in "${text}"`).not.toBeNull();
  return { latitude: Number(found![1]), longitude: Number(found![2]) };
}

function savedLocation(patches: Request[]): { latitude: number; longitude: number } {
  const body = patches.at(-1)!.postDataJSON() as {
    location: { latitude: number; longitude: number };
  };
  return body.location;
}

test('offers the shoreline for a pin dropped inland and saves the snapped point', async ({
  page,
}) => {
  const { patches } = await mockVenue(page, null, { coastLng: COAST_LNG });
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await dropPin(page);

  // The operator's own point is stored the moment they drop it; the shore is only offered.
  const own = await readout(page);
  expect(own.longitude).toBeCloseTo(19.75, 4);
  await expect(page.getByTestId('venue-location-proposal')).toContainText('inland');
  await expect(page.getByTestId('venue-location-proposal')).toContainText(/\d+(\.\d)? ?(m|km)\b/);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab with the shoreline offer open');

  await page.getByTestId('venue-location-snap-accept').click();
  await expect(page.getByTestId('venue-location-proposal')).toHaveCount(0);
  // Accepting destroys the button just pressed, so focus is moved rather than stranded.
  await expect(page.getByTestId('venue-location-place')).toBeFocused();

  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();

  const saved = savedLocation(patches);
  expect(saved.longitude).toBeLessThan(own.longitude);
  expect(saved.longitude).toBeGreaterThan(COAST_LNG);
  expect(saved.longitude).toBe(Number(saved.longitude.toFixed(6)));
});

test('saves the operator’s own point when the shoreline offer is declined', async ({ page }) => {
  const { patches } = await mockVenue(page, null, { coastLng: COAST_LNG });
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await dropPin(page);
  const own = await readout(page);
  await expect(page.getByTestId('venue-location-proposal')).toBeVisible();

  // Reached and pressed from the keyboard alone: no gesture in this field is pointer-only.
  await page.getByTestId('venue-location-snap-keep').focus();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('venue-location-proposal')).toHaveCount(0);
  await expect(page.getByTestId('venue-location-place')).toBeFocused();
  expect(await readout(page)).toEqual(own);

  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
  expect(savedLocation(patches)).toEqual(own);
});

/** A coast 0.005° west of the map's centre — about 3 px, inside the shore band a drop is left in. */
const SHORE_UNDER_THE_CENTRE_LNG = 19.745;

test('says nothing about a pin dropped on the shore itself', async ({ page }) => {
  await mockVenue(page, null, { coastLng: SHORE_UNDER_THE_CENTRE_LNG });
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await dropPin(page);

  await expect(page.getByTestId('map-pin')).toBeVisible();
  await expect(page.getByTestId('venue-location-proposal')).toHaveCount(0);
});

/**
 * The one leg that proves the decision the slice made: the sample runs against the LIVE map's
 * rendered canvas. Real MapLibre, the committed style, and the fixture archive's own straight
 * coastline at 19.58 — with the fake, nothing is ever read back from WebGL and the route this
 * feature rests on would go untested. Retried as a whole because a canvas has nothing in it until
 * its tiles have drawn, and no engine event says when that is.
 */
test('finds the shore in the real map’s own rendered pixels', async ({ page }) => {
  const FIXTURE_COAST_LNG = 19.58;
  await mockVenue(page, null, { real: true });
  await page.goto('/operator/1');
  await signInAndOpenVenue(page);

  await expect(async () => {
    await page.getByTestId('venue-location-place').click();
    await expect(page.getByTestId('venue-location-proposal')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });

  const own = await readout(page);
  await expect(page.getByTestId('venue-location-proposal')).toContainText('inland');

  await page.getByTestId('venue-location-snap-accept').click();
  await expect(page.getByTestId('venue-location-proposal')).toHaveCount(0);
  const snapped = await readout(page);

  expect(snapped.longitude).toBeLessThan(own.longitude);
  expect(snapped.longitude).toBeGreaterThan(FIXTURE_COAST_LNG);
});
