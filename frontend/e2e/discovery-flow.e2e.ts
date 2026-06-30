import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

/**
 * Real-render a11y audit of the venue-discovery landing page (issue #61, design §4.1 steps 1–2):
 * land on `/` → see venue cards → filter by beach → open a venue's beach map. Runs axe at each step
 * in a real browser — catching keyboard, focus and true colour-contrast issues jsdom can't. The API
 * is mocked (`page.route`), so the test is self-contained and runs in CI (`npm run test:e2e:a11y`).
 */

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    availability: { free: 18, total: 24 },
  },
  {
    id: 2,
    name: 'Aurora Bay',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    ratingTenths: 41,
    reviewsCount: 88,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    availability: { free: 5, total: 10 },
  },
];

const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  sets: [
    { id: 1, rowLabel: 'Front row · Sea view', positionNo: 1, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 1, gridY: 1, availability: 'FREE' },
    { id: 2, rowLabel: 'Row 4 · Back', positionNo: 1, tier: 'STANDARD', pool: 'WALK_IN', price: { minorUnits: 2500, currency: 'EUR' }, gridX: 1, gridY: 2, availability: 'FREE' },
  ],
};

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // The single-venue map route (more specific) and the discovery list route are disjoint:
  // the list regex stops at "venues" + optional query, so it never matches "/venues/1".
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues(\?.*)?$/, (route) => {
    const beach = new URL(route.request().url()).searchParams.get('beach');
    const body = beach ? VENUES.filter((v) => v.beach === beach) : VENUES;
    return route.fulfill({ json: body });
  });
});

test('discovery → filter → venue map is accessible end-to-end', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your spot on the Riviera' })).toBeVisible();

  // All venues are listed as cards.
  const cards = page.getByTestId('venue-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Miramar Beach Club');
  await expect(cards.first()).toContainText('18 of 24 free');
  await expectNoSeriousAxeViolations(page, 'discovery list');

  // Filter by beach → the list narrows to the matching venue (server-side filter, mocked).
  await page.getByTestId('filter-beach').selectOption('Dhërmi');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Aurora Bay');
  await expectNoSeriousAxeViolations(page, 'discovery list (filtered)');

  // Open the venue → the beach map for that venue.
  await page.getByTestId('filter-beach').selectOption('');
  await expect(cards).toHaveCount(2);
  await cards.first().click();
  await expect(page).toHaveURL(/\/venues\/1/);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'venue beach map');
});

test('discovery shows an accessible empty state when no venues match', async ({ page }) => {
  // Override the list route to return nothing for this run.
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByTestId('empty')).toBeVisible();
  await expect(page.getByTestId('venue-card')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'discovery empty state');
});
