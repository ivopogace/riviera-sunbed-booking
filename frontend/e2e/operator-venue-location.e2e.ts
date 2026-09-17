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

/** Where the operator is standing, for the near-me leg — on the coast, inside the map's fence. */
const AT_THE_VENUE = { latitude: 39.874231, longitude: 20.007412 };

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
