import { expect, test, type Page } from '@playwright/test';

import { mockChallengeFence } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { completeDialog, settle } from './support/booking-dialog';
import { openThemePicker } from './support/shell';
import { expectTouchTargets } from './support/touch-targets';
import { TOURIST_BOOKING, TOURIST_VENUE, mockTourist } from './support/tourist.mocks';

/**
 * The booked venue's links (#1738): the name opens the venue's beach map on the booked date, and a
 * pinned venue adds a Directions link out to a maps URL — a link, never an embed, so the page loads
 * nothing from a third-party host. An unpinned venue renders no Directions row.
 */

const PIN = { latitude: 39.774531, longitude: 19.998412 };
const DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination=39.774531,19.998412';

const CONFIRMATION = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  emailWithheld: false,
};

async function mockVenuePin(page: Page, location: typeof PIN | null): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: { ...TOURIST_VENUE, location } }),
  );
}

/** Every request the page makes to a host other than the app's own (the dev server and the API). */
function recordThirdPartyRequests(page: Page): string[] {
  const offHost: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.hostname !== 'localhost') {
      offHost.push(request.url());
    }
  });
  return offHost;
}

test.beforeEach(async ({ page }) => {
  await mockTourist(page);
  await mockChallengeFence(page, 'off');
});

test('the booking view links the venue and its directions, loading nothing third-party', async ({
  page,
}) => {
  await mockVenuePin(page, PIN);
  const offHost = recordThirdPartyRequests(page);

  await page.goto(`/booking/${TOURIST_BOOKING.code}`);
  const venue = page.getByTestId('venue-link');
  await expect(venue).toHaveText('Miramar Beach Club');
  await expect(venue).toHaveAttribute('href', '/venues/1?date=2026-12-01');
  const directions = page.getByTestId('venue-directions');
  await expect(directions).toHaveAttribute('href', DIRECTIONS);
  await expect(directions).toHaveAttribute('target', '_blank');
  for (const link of [venue, directions]) {
    expect(await link.getAttribute('href')).not.toContain(TOURIST_BOOKING.code);
  }

  await page.setViewportSize({ width: 390, height: 780 });
  await expectTouchTargets(page, 'booking view with venue links');
  await settle(page);
  expect(offHost).toEqual([]);

  for (const theme of ['porcelain', 'riviera', 'dark'] as const) {
    await openThemePicker(page);
    await page.getByTestId(`theme-option-${theme}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
    await page.keyboard.press('Escape');
    await settle(page);
    await expectNoSeriousAxeViolations(page, `booking view venue links (${theme})`);
  }

  await venue.click();
  await expect(page).toHaveURL(/\/venues\/1\?date=2026-12-01$/);
});

test('an unpinned venue still links by name and renders no Directions row', async ({ page }) => {
  await mockVenuePin(page, null);

  await page.goto(`/booking/${TOURIST_BOOKING.code}`);
  await expect(page.getByTestId('venue-link')).toHaveAttribute('href', '/venues/1?date=2026-12-01');
  await expect(page.getByTestId('directions-row')).toHaveCount(0);
});

test('the confirmation page links the venue and its directions', async ({ page }) => {
  await mockVenuePin(page, PIN);
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );
  const offHost = recordThirdPartyRequests(page);

  await page.goto('/venues/1');
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  await completeDialog(page.getByRole('dialog'), 'Continue to payment');

  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByTestId('venue-link')).toHaveAttribute('href', '/venues/1?date=2026-12-01');
  await expect(page.getByTestId('venue-directions')).toHaveAttribute('href', DIRECTIONS);

  await page.setViewportSize({ width: 390, height: 780 });
  await settle(page);
  await expectTouchTargets(page, 'booking confirmation');
  await settle(page);
  expect(offHost).toEqual([]);

  for (const theme of ['porcelain', 'riviera', 'dark'] as const) {
    await openThemePicker(page);
    await page.getByTestId(`theme-option-${theme}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);
    await page.keyboard.press('Escape');
    await settle(page);
    await expectNoSeriousAxeViolations(page, `confirmation venue links (${theme})`);
  }
});
