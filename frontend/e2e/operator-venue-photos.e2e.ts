import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the venue photo slots. Drives sign-in → the Venue &
 * commodities tab → pick a real file in the cover slot (pick = upload = replace: one multipart
 * POST) → the returned PREVIEW variant renders and the control flips to Replace → Remove DELETEs
 * the slot and the empty state returns. Also the server-side validation rejection copy and the
 * cross-venue 403 (invariant #13). API mocked via `page.route` (no backend); axe over the slots.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

/** A 1×1 PNG — enough for the picked file's bytes AND the mocked serving endpoint's response. */
const TINY_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const PROFILE = {
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  bookingMode: 'INSTANT',
  bookingCutoff: '18:00',
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

const UPLOADED_COVER = {
  slot: 'cover',
  variants: [
    { surface: 'card', url: '/api/venues/1/photos/aa01', width: 640, height: 384 },
    { surface: 'banner', url: '/api/venues/1/photos/bb02', width: 1280, height: 480 },
    { surface: 'preview', url: '/api/venues/1/photos/cc03', width: 480, height: 360 },
  ],
};

test.use({ colorScheme: 'dark' });

/**
 * Session + shell + tab reads mocked; the photo POST/DELETE are captured. `reject` makes the POST
 * a 400 UNSUPPORTED_FORMAT (the server-side magic-byte validation); `deny` a 403 NOT_VENUE_OWNER.
 * The content-addressed serving GET answers real image bytes so the preview `<img>` loads.
 */
async function mockVenuePhotos(
  page: Page,
  { reject = false, deny = false } = {},
): Promise<{ uploads: Request[]; deletes: Request[] }> {
  const uploads: Request[] = [];
  const deletes: Request[] = [];
  let sessionLive = false;

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

  await page.route(/\/api\/venues\/1\/profile$/, (route) => route.fulfill({ json: PROFILE }));

  // The slot write endpoints: POST = upload/replace, DELETE = remove. Registered BEFORE the
  // serving GET below, but they never collide — a slot name is not a hex hash.
  await page.route(/\/api\/venues\/1\/photos\/(cover|sunbeds|bar)$/, (route) => {
    if (route.request().method() === 'POST') {
      uploads.push(route.request());
      if (deny) {
        return route.fulfill({
          status: 403,
          contentType: 'application/problem+json',
          json: { code: 'NOT_VENUE_OWNER', detail: '' },
        });
      }
      if (reject) {
        return route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          json: { code: 'UNSUPPORTED_FORMAT', detail: '' },
        });
      }
      return route.fulfill({ json: UPLOADED_COVER });
    }
    deletes.push(route.request());
    return route.fulfill({ status: 204, body: '' });
  });

  // The public content-addressed serving GET (hex hash) — real bytes, so the preview <img> loads.
  await page.route(/\/api\/venues\/1\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({ body: TINY_IMAGE, contentType: 'image/jpeg' }),
  );

  // Shell reads (header/stats) — kept minimal; this spec exercises only the photo slots.
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: PROFILE.name,
        beach: PROFILE.beach,
        region: PROFILE.region,
        description: PROFILE.description,
        ratingTenths: 48,
        reviewsCount: 12,
        bookingMode: PROFILE.bookingMode,
        fromPrice: { minorUnits: 2000, currency: 'EUR' },
        amenities: ['WIFI'],
        distanceToWaterM: 20,
        sets: [],
        coverPhoto: null,
      },
    }),
  );
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
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) => route.fulfill({ json: [] }));

  return { uploads, deletes };
}

async function signInAndOpenVenue(page: Page): Promise<void> {
  await page.goto('/operator/1');
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Venue & commodities' }).click();
  await expect(page.getByTestId('venue-tab')).toBeVisible();
}

function pickCover(page: Page): Promise<void> {
  return page.getByTestId('photo-input-cover').setInputFiles({
    name: 'beach.png',
    mimeType: 'image/png',
    buffer: TINY_IMAGE,
  });
}

test('picks a file → one multipart upload → preview + Replace, then Remove deletes and the empty slot returns (+ axe)', async ({
  page,
}) => {
  const { uploads, deletes } = await mockVenuePhotos(page);
  await signInAndOpenVenue(page);

  // Empty slot: Add photo, no preview, no Remove.
  await expect(page.getByTestId('photo-pick-cover')).toHaveText(/Add photo/);
  await expect(page.getByTestId('photo-preview-cover')).toBeHidden();
  await expect(page.getByTestId('photo-remove-cover')).toBeHidden();

  // Pick = upload = replace: exactly one multipart POST to the slot path.
  await pickCover(page);
  await expect(page.getByTestId('photo-preview-cover')).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0].headers()['content-type']).toContain('multipart/form-data');

  // The tab previews the returned PREVIEW variant's content-addressed URL (resolved against the
  // API origin), no profile re-fetch.
  await expect(page.getByTestId('photo-preview-cover')).toHaveAttribute(
    'src',
    /\/api\/venues\/1\/photos\/cc03$/,
  );
  await expect(page.getByTestId('photo-pick-cover')).toHaveText(/Replace/);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'venue tab with an uploaded cover photo');

  // Remove erases the slot (single-transaction server-side) and the empty state returns.
  await page.getByTestId('photo-remove-cover').click();
  await expect(page.getByTestId('photo-preview-cover')).toBeHidden();
  await expect(page.getByTestId('photo-pick-cover')).toHaveText(/Add photo/);
  expect(deletes).toHaveLength(1);
});

test('shows the server-side validation copy when the image is rejected (AC-5)', async ({
  page,
}) => {
  await mockVenuePhotos(page, { reject: true });
  await signInAndOpenVenue(page);

  await pickCover(page);

  // The processor's magic-byte rejection (the client never trusts its own pre-checks) → slot copy.
  await expect(page.getByTestId('photo-error-cover')).toContainText(/JPEG, PNG, or WebP/);
  await expect(page.getByTestId('photo-preview-cover')).toBeHidden();
});

test('shows the not-owner message when the upload is denied 403 (invariant #13)', async ({
  page,
}) => {
  await mockVenuePhotos(page, { deny: true });
  await signInAndOpenVenue(page);

  await pickCover(page);

  await expect(page.getByTestId('photo-error-cover')).toContainText(/manage/i);
});
