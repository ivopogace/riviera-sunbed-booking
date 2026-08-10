import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Photos tab: an admin picks a
 * venue it does not own, sees its photo slots, and removes one — behind a confirmation that names
 * what is about to be destroyed.
 *
 * The moderation API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that the read and the delete are genuinely
 * ownership-free while the venue-scoped twin answers `403 NOT_VENUE_OWNER` — is proven against a
 * real Postgres by `AdminPhotoModerationIT` and `AdminPhotoTakedownIT`; this spec proves the console
 * drives those endpoints correctly, never removes on a single click, and stays accessible
 * throughout.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

const VENUES = [
  { id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' },
  { id: 9, name: 'Folie Marine', beach: 'Gjipe' },
];

/**
 * The catalogue + moderation endpoints, stateful: a takedown empties that slot, so a later read of
 * the same venue reflects it — the backend's own behaviour, which is what makes "the slot stays
 * empty" an honest assertion rather than a local-UI artefact.
 */
async function mockPhotoModeration(page: Page): Promise<void> {
  const slots: Record<number, Record<string, string | null>> = {
    7: { cover: '/api/venues/7/photos/beef01', sunbeds: '/api/venues/7/photos/beef02', bar: null },
    9: { cover: null, sunbeds: null, bar: null },
  };

  await page.route(/\/api\/venues(\?.*)?$/, (route) =>
    route.fulfill({
      json: VENUES.map((venue) => ({
        ...venue,
        region: 'Vlorë',
        ratingTenths: 47,
        reviewsCount: 12,
        bookingMode: 'INSTANT',
        fromPrice: null,
        amenities: [],
        distanceToWaterM: null,
        availability: { free: 4, total: 10 },
        coverPhoto: null,
      })),
    }),
  );

  await page.route(/\/api\/admin\/venues\/(\d+)\/photos$/, (route) => {
    const venueId = Number(/venues\/(\d+)\/photos/.exec(route.request().url())![1]);
    const venue = slots[venueId] ?? { cover: null, sunbeds: null, bar: null };
    return route.fulfill({
      json: {
        venueId,
        photos: {
          cover: { previewUrl: venue.cover },
          sunbeds: { previewUrl: venue.sunbeds },
          bar: { previewUrl: venue.bar },
        },
      },
    });
  });

  await page.route(/\/api\/admin\/venues\/(\d+)\/photos\/(cover|sunbeds|bar)$/, (route) => {
    const [, id, slot] = /venues\/(\d+)\/photos\/(cover|sunbeds|bar)/.exec(route.request().url())!;
    slots[Number(id)][slot] = null;
    return route.fulfill({ status: 204, body: '' });
  });

  // The previews are content-addressed URLs; serve a 1x1 GIF so <img> renders rather than 404s.
  await page.route(/\/api\/venues\/\d+\/photos\/[0-9a-f]+$/, (route) =>
    route.fulfill({
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),
    }),
  );
}

/** Sign in as the platform admin and open the Photos tab. */
async function openPhotosTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/photos');
}

test('an admin picks a venue, sees its slots, and takes one down behind a confirmation', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockPhotoModeration(page);
  await openPhotosTab(page);

  await expectNoSeriousAxeViolations(page, 'admin photos tab before a venue is picked');

  await page.getByTestId('admin-photos-venue').selectOption('7');

  // Every slot renders — two occupied, one empty — so the grid is stable, not a filtered list.
  await expect(page.getByTestId('admin-photo-preview-cover')).toBeVisible();
  await expect(page.getByTestId('admin-photo-preview-sunbeds')).toBeVisible();
  await expect(page.getByTestId('admin-photo-empty-bar')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin photos tab showing a venue’s slots');

  await page.getByTestId('admin-photo-remove-cover').click();

  // The first press only asks — and the question names what it is about to destroy.
  const prompt = page.getByTestId('admin-photo-confirm-prompt-cover');
  await expect(prompt).toContainText('Bora Bora Beach');
  await expect(prompt).toContainText('Cover');
  await expect(page.getByTestId('admin-photo-preview-cover')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin photos tab with the confirmation open');

  // The confirmation is a named alertdialog and holds focus — neither was true before #604.
  const panel = page.getByTestId('admin-photo-confirm-panel-cover');
  await expect(panel).toHaveAttribute('role', 'alertdialog');
  await expect(panel).toHaveAttribute('aria-label', 'Confirm photo removal');
  await expect(page.getByTestId('admin-photo-confirm-cover')).toBeFocused();

  // Computed styles: the shared panel must not have restyled a shipped moderation surface, and its
  // host has to occupy the flow position the markup it replaced did (the mt-3 it now carries).
  await expect(panel).toHaveCSS('display', 'block');
  await expect(panel).toHaveCSS('margin-top', '12px');
  await expect(page.getByTestId('admin-photo-confirm-cover')).toHaveCSS('color', 'rgb(179, 38, 30)');
  await expect(page.getByTestId('admin-photo-reason-cover')).toHaveCSS('font-size', '14px');

  await page.getByTestId('admin-photo-confirm-cover').click();

  await expect(page.getByTestId('admin-photos-notice')).toContainText(
    'Removed the Cover photo from Bora Bora Beach.',
  );
  // The slot empties in place; its neighbour is untouched.
  await expect(page.getByTestId('admin-photo-empty-cover')).toBeVisible();
  await expect(page.getByTestId('admin-photo-preview-sunbeds')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin photos tab after a takedown');
});

test('the removal is abandoned when the confirmation is dismissed', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockPhotoModeration(page);
  await openPhotosTab(page);

  await page.getByTestId('admin-photos-venue').selectOption('7');
  await page.getByTestId('admin-photo-remove-cover').click();
  await page.getByTestId('admin-photo-cancel-cover').click();

  await expect(page.getByTestId('admin-photo-confirm-prompt-cover')).toBeHidden();
  await expect(page.getByTestId('admin-photo-preview-cover')).toBeVisible();
  await expect(page.getByTestId('admin-photos-notice')).toHaveText('');
});

test('the takedown survives re-reading the venue — the server really dropped it', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockPhotoModeration(page);
  await openPhotosTab(page);

  await page.getByTestId('admin-photos-venue').selectOption('7');
  await page.getByTestId('admin-photo-remove-cover').click();
  await page.getByTestId('admin-photo-confirm-cover').click();
  await expect(page.getByTestId('admin-photo-empty-cover')).toBeVisible();

  // Away and back: the emptied slot is the server's answer now, not a local edit.
  await page.getByTestId('admin-photos-venue').selectOption('9');
  await page.getByTestId('admin-photos-venue').selectOption('7');

  await expect(page.getByTestId('admin-photo-empty-cover')).toBeVisible();
  await expect(page.getByTestId('admin-photo-preview-sunbeds')).toBeVisible();
});

test('the tab strip marks Photos and reaches it from the console sections', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockPhotoModeration(page);
  await openPhotosTab(page);

  const photos = page.getByTestId('admin-tab-photos');
  await expect(photos).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin-tab-operators')).not.toHaveAttribute('aria-current', 'page');

  await page.getByTestId('admin-tab-operators').click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('admin-tab-photos')).not.toHaveAttribute('aria-current', 'page');
});

test('a signed-out visitor is shown no picker and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockPhotoModeration(page);

  await page.goto('/admin/photos');

  await expect(page.getByTestId('admin-photos-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-photos-venue')).toBeHidden();
  await expect(page.getByTestId('admin-tab-photos')).toBeHidden();
});
