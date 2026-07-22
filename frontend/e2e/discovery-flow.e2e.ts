import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

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
    // T7 (#140): four amenities (out of catalogue order) + a distance. The card caps at 3 in
    // catalogue order (Beach bar, Free parking, Showers) — WiFi is dropped; the map shows all four.
    amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
    distanceToWaterM: 15,
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
  amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
  distanceToWaterM: 15,
  sets: [
    { id: 1, rowLabel: 'Front row · Sea view', positionNo: 1, tier: 'PREMIUM', pool: 'ONLINE', price: { minorUnits: 4500, currency: 'EUR' }, gridX: 1, gridY: 1, availability: 'FREE' },
    { id: 2, rowLabel: 'Row 4 · Back', positionNo: 1, tier: 'STANDARD', pool: 'WALK_IN', price: { minorUnits: 2500, currency: 'EUR' }, gridX: 1, gridY: 2, availability: 'FREE' },
  ],
};

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

  // All venues are listed as cards; the live count sits inside the filter bar (#135).
  const cards = page.getByTestId('venue-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Miramar Beach Club');
  await expect(cards.first()).toContainText('18 of 24 free');
  // One combined assertion: bare toContainText('2') would be vacuously satisfied by the
  // year digits in the date label (review finding).
  await expect(page.getByTestId('results')).toContainText('2 venues');

  // T7 (#140): the card shows the to-water chip + the first 3 amenities (catalogue order); the
  // fourth (WiFi) is capped off on the card — but appears on the map header below.
  const cardChips = cards.first().getByTestId('card-chips');
  await expect(cardChips.locator('.amenity-chip')).toHaveCount(4); // to-water + 3
  await expect(cardChips).toContainText('15m to water');
  await expect(cardChips).toContainText('Beach bar');
  await expect(cardChips).toContainText('Showers');
  await expect(cardChips).not.toContainText('WiFi');
  await expectNoSeriousAxeViolations(page, 'discovery list');

  // #155: the date picker is floored at the earliest bookable day, so past/today can't be picked.
  // Clock-free assertion (no timezone math to flake): a non-empty ISO `min` equal to the default.
  const dateInput = page.getByTestId('filter-date');
  const dateMin = await dateInput.evaluate((el: HTMLInputElement) => el.min);
  expect(dateMin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await dateInput.inputValue()).toBe(dateMin);

  // Filter by beach → the list narrows to the matching venue (server-side filter, mocked);
  // the in-bar count follows, with the singular noun.
  await page.getByTestId('filter-beach').selectOption('Dhërmi');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Aurora Bay');
  await expect(page.getByTestId('results')).toContainText('1 venue');
  await expectNoSeriousAxeViolations(page, 'discovery list (filtered)');

  // Open the venue → the beach map for that venue.
  await page.getByTestId('filter-beach').selectOption('');
  await expect(cards).toHaveCount(2);
  await cards.first().click();
  await expect(page).toHaveURL(/\/venues\/1/);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();

  // T7 (#140): the map header shows the FULL amenity row (no ≤3 cap) + to-water — so WiFi, capped
  // off the Discover card above, is present here.
  const headerChips = page.getByTestId('venue-chips');
  await expect(headerChips.locator('.amenity-chip')).toHaveCount(5); // to-water + all 4
  await expect(headerChips).toContainText('15m to water');
  await expect(headerChips).toContainText('WiFi');
  await expectNoSeriousAxeViolations(page, 'venue beach map');
});

test('the date chosen on discovery carries into the venue map (#294)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your spot on the Riviera' })).toBeVisible();

  // Pick a date a month past the picker floor — clearly NOT the map's own default (tomorrow), so
  // seeing it on the map proves the carry rather than the map's fallback. Clock-free (derived in-page).
  const dateInput = page.getByTestId('filter-date');
  const chosen = await dateInput.evaluate((el: HTMLInputElement) => {
    const d = new Date(`${el.min}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  await dateInput.fill(chosen);

  // Open the first venue → the map opens on the carried date (URL + picker), not tomorrow.
  await page.getByTestId('venue-card').first().click();
  await expect(page).toHaveURL(new RegExp(`/venues/1\\?date=${chosen}`));
  await expect(page.getByTestId('map-date')).toHaveValue(chosen);
  await expectNoSeriousAxeViolations(page, 'venue map (date carried from discovery)');
});

test('hero panel fills the content width, matching the search bar (#153)', async ({ page }) => {
  // The AC is about desktop: at >= 1080px the .discover column is at its max, so the hero and the
  // filter bar directly below it share one content width. Pin the viewport so the measurement is
  // deterministic regardless of the project's default.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your spot on the Riviera' })).toBeVisible();

  const hero = await page.locator('.hero').boundingBox();
  const searchBar = await page.locator('.filter-bar').boundingBox();
  if (!hero || !searchBar) throw new Error('hero / filter-bar not laid out');

  // Same width and same left edge as the search bar below it. Before #153 the hero was capped at
  // max-width: 680px (~63% of the 1080px column) and left-aligned — so the left-edge check already
  // passed while the width check failed; this width assertion is what the fix turns green.
  expect(Math.abs(hero.width - searchBar.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(hero.x - searchBar.x)).toBeLessThanOrEqual(1);
  // ...and genuinely wider than the removed 680px cap — guards against it being re-introduced.
  expect(hero.width).toBeGreaterThan(680);

  // Widening the panel introduced no horizontal overflow (AC-3).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await expectNoSeriousAxeViolations(page, 'discovery hero (full-width)');
});

test('discovery load-failure panel recovers when Retry is pressed (#149)', async ({ page }) => {
  // First list fetch fails, the next succeeds — proving Retry refetches and recovers.
  let listCalls = 0;
  await page.route(/\/api\/venues(\?.*)?$/, (route) => {
    listCalls += 1;
    return listCalls === 1
      ? route.fulfill({ status: 500, json: { error: 'boom' } })
      : route.fulfill({ json: VENUES });
  });

  await page.goto('/');

  // The designed failure panel appears with alert semantics (announced to AT).
  const panel = page.getByTestId('error');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'alert');
  await expect(panel.getByRole('heading', { name: /couldn.t load the beaches/ })).toBeVisible();
  // The cutoff explainer sits under the filter bar in every state, including this one.
  await expect(page.getByTestId('cutoff-note')).toContainText(/book by 6\s+PM the day before/);
  await expectNoSeriousAxeViolations(page, 'discovery load-failure panel');

  // Retry refetches → the panel is replaced by the venue list.
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('venue-card')).toHaveCount(2);
  await expectNoSeriousAxeViolations(page, 'discovery list after retry');
});

test('discovery shows an accessible empty state when no venues match', async ({ page }) => {
  // Override the list route to return nothing for this run.
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByTestId('empty')).toBeVisible();
  await expect(page.getByTestId('venue-card')).toHaveCount(0);
  // The in-bar count stays visible in the empty state (#135): "0 venues · <date>".
  await expect(page.getByTestId('results')).toContainText('0 venues');
  await expectNoSeriousAxeViolations(page, 'discovery empty state');
});
