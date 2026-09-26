import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { openThemePicker } from './support/shell';

/**
 * Real-render a11y audit of the venue-discovery landing page (design §4.1 steps 1–2):
 * land on `/` → see venue cards → filter by beach → open a venue's beach map. Runs axe at each step
 * in a real browser — catching keyboard, focus and true colour-contrast issues jsdom can't. The API
 * is mocked (`page.route`), so the test is self-contained and runs in CI (`npm run test:e2e:a11y`).
 */

/**
 * The semantic chips' rendered pair as `getComputedStyle` reports it — opaque, so theme- and
 * surface-invariant. Deliberately a second copy of `src/testing/chip-fills.ts`'s hexes rather than
 * an import: this suite drives the built app as a black box and takes nothing from app source, so
 * a value that drifted here would still be caught, by this suite going red against the real page.
 * Change both together — `#0a6e85` / `#ffffff` there are these two triples.
 */
/** The sheet is the arm below `lg`; the panel from `lg` lists rows and renders no card. */
const PHONE = { width: 390, height: 844 };

const SEMANTIC_FILL = 'rgb(10, 110, 133)';
const SEMANTIC_INK = 'rgb(255, 255, 255)';

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'PALASE',
    region: 'HIMARE',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    // Four amenities (out of catalogue order) + a distance. The card caps at 3 in
    // catalogue order (Beach bar, Free parking, Showers) — WiFi is dropped; the map shows all four.
    amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
    distanceToWaterM: 15,
    availability: { free: 18, total: 24 },
    salesOpen: true,
  },
  {
    id: 2,
    name: 'Aurora Bay',
    beach: 'DHERMI',
    region: 'HIMARE',
    ratingTenths: 41,
    reviewsCount: 88,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen: true,
  },
];

const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'PALASE',
  region: 'HIMARE',
  description: 'Premium loungers on the Palasë shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
  distanceToWaterM: 15,
  sets: [
    {
      id: 1,
      rowLabel: 'Front row · Sea view',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
    },
    {
      id: 2,
      rowLabel: 'Row 4 · Back',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'WALK_IN',
      price: { minorUnits: 2500, currency: 'EUR' },
      gridX: 1,
      gridY: 2,
      availability: 'FREE',
    },
  ],
  salesOpen: true,
  salesClose: '16:00',
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
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.getByTestId('sheet-rows')).toBeVisible();

  // The region's venues are listed as cards; the live count sits in the head's own outcome region.
  const cards = page.getByTestId('venue-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Miramar Beach Club');
  await expect(cards.first()).toContainText('18 of 24 free');

  // The generic lead-time note is retired (#804): Discover carries no cutoff explainer.
  await expect(page.getByTestId('cutoff-note')).toHaveCount(0);
  await expect(page.getByTestId('sales-close-note')).toHaveCount(0);
  // Invariant #4 as the head's light: the server's per-date verdict, not a local clock read.
  await expect(page.getByTestId('sheet-outcome')).toContainText('2 of 2 selling today');

  // The card shows the to-water chip + the first 3 amenities (catalogue order); the
  // fourth (WiFi) is capped off on the card — but appears on the map header below.
  const cardChips = cards.first().getByTestId('card-chips');
  await expect(cardChips.locator('.amenity-chip')).toHaveCount(4); // to-water + 3
  await expect(cardChips).toContainText('15m to water');
  await expect(cardChips).toContainText('Beach bar');
  await expect(cardChips).toContainText('Showers');
  await expect(cardChips).not.toContainText('WiFi');
  await expectNoSeriousAxeViolations(page, 'discovery sheet');

  // The rail is floored at today: it leads with it and offers nothing earlier, so no past day.
  await expect(page.getByTestId('head-day')).toHaveText(/Today/);
  await page.getByTestId('head-day').click();
  const days = page.locator('[role="group"][aria-label="Day"] button');
  await expect(days.first()).toHaveText('Today');
  await expect(days.first()).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('head-day').click();

  // Narrow to one beach: the region's cards are loaded, so this narrows in place, with no refetch.
  await page.getByTestId('head-beaches').click();
  await page.locator('[role="group"][aria-label="Beach"] button', { hasText: 'Dhërmi' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Aurora Bay');
  await expect(page.getByTestId('sheet-outcome')).toContainText('1 of 1 selling today');
  await expect(page.getByTestId('head-beaches')).toHaveAttribute('aria-current', 'true');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'discovery sheet (narrowed to one beach)');

  // The chip is the way back too: All restores the region.
  await page.getByTestId('head-beaches').click();
  await page.locator('[role="group"][aria-label="Beach"] button', { hasText: 'All' }).click();
  await expect(cards).toHaveCount(2);
  await cards.first().click();
  await expect(page).toHaveURL(/\/venues\/1/);
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();

  // The map header shows the FULL amenity row (no ≤3 cap) + to-water — so WiFi, capped
  // off the Discover card above, is present here.
  const headerChips = page.getByTestId('venue-chips');
  await expect(headerChips.locator('.amenity-chip')).toHaveCount(5); // to-water + all 4
  await expect(headerChips).toContainText('15m to water');
  await expect(headerChips).toContainText('WiFi');

  // Clause-level: the full sentence per branch is pinned once, in venue-map.spec.ts.
  const salesCloseNote = page.getByTestId('sales-close-note');
  await expect(salesCloseNote).toContainText('close at 4 PM at this venue');
  // The glyph's rendered box at its presentation-attribute default — jsdom can't prove this (ICON-4).
  const noteGlyph = salesCloseNote.locator('svg');
  await expect(noteGlyph).toHaveCSS('width', '13px');
  await expect(noteGlyph).toHaveCSS('height', '13px');
  await expectNoSeriousAxeViolations(page, 'venue beach map');
});

test('the date chosen on discovery carries into the venue map (#294)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.getByTestId('sheet-rows')).toBeVisible();

  // The card's own link carries the selected day, so it is the clock-free source for both reads.
  const linkDate = async () =>
    new URL(
      (await page.getByTestId('venue-card').first().getAttribute('href'))!,
      page.url(),
    ).searchParams.get('date')!;
  const today = await linkDate();

  // The rail's last day: never today, so seeing it on the map proves the carry, not a fallback.
  await page.getByTestId('head-day').click();
  await page
    .locator('[role="group"][aria-label="Day"] button:not([data-testid="head-stay"])')
    .last()
    .click();
  await expect(page.getByTestId('head-day')).not.toHaveText(/Today/);
  const chosen = await linkDate();
  expect(chosen).not.toBe(today);

  // A future date is open at every venue (#793): the refetched list carries no closed badge.
  await expect(page.getByTestId('venue-card')).toHaveCount(2);
  await expect(page.locator('.sales-closed-chip')).toHaveCount(0);

  // Open the first venue → the map opens on the carried date (URL + picker), not today.
  await page.getByTestId('venue-card').first().click();
  await expect(page).toHaveURL(new RegExp(`/venues/1\\?date=${chosen}`));
  // Since #761 the map's date field is the calendar's trigger, not a native input.
  await expect(page.getByTestId('map-date')).toHaveAttribute('data-date', chosen);
  await expect(page.getByTestId('map-sales-closed')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'venue map (date carried from discovery)');
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

  await page.setViewportSize(PHONE);
  await page.goto('/');

  // The designed failure panel appears with alert semantics (announced to AT).
  const panel = page.getByTestId('error');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'alert');
  await expect(panel.getByRole('heading', { name: /couldn.t load the beaches/ })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'discovery load-failure panel');

  // Retry refetches → the panel is replaced by the venue list.
  await page.getByTestId('retry').click();
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('venue-card')).toHaveCount(2);
  await expectNoSeriousAxeViolations(page, 'discovery list after retry');
});

test('an unrated venue shows a "New" state (no ★ 0.0) on the card and map, accessibly (#154)', async ({
  page,
}) => {
  // A brand-new venue: ratingTenths/reviewsCount both 0. It must read as "New", never "rated 0.0".
  const unrated = {
    id: 2,
    name: 'Miramare',
    beach: 'BORSH',
    region: 'HIMARE',
    ratingTenths: 0,
    reviewsCount: 0,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2000, currency: 'EUR' },
    availability: { free: 10, total: 10 },
  };
  await page.route(/\/api\/venues\/2(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        ...unrated,
        description: 'Newly listed on the Borsh shoreline.',
        sets: VENUE_MAP.sets,
      },
    }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [unrated] }));

  await page.setViewportSize(PHONE);
  await page.goto('/');
  const card = page.getByTestId('venue-card').first();
  await expect(card.getByTestId('new-chip')).toHaveText('New');
  await expect(card).not.toContainText('0.0');
  await expect(card).not.toContainText('0 reviews');
  await expectNoSeriousAxeViolations(page, 'discovery list (unrated venue)');

  // #705: both semantic chips wear the inverted accent pill. A contrast spec is pure maths and cannot see a colour that is wrong but still AA, so the rendered pair is pinned here.
  await expect(card.locator('.mode-chip')).toHaveCSS('background-color', SEMANTIC_FILL);
  await expect(card.locator('.mode-chip')).toHaveCSS('color', SEMANTIC_INK);
  await expect(card.getByTestId('new-chip')).toHaveCSS('background-color', SEMANTIC_FILL);
  await expect(card.getByTestId('new-chip')).toHaveCSS('color', SEMANTIC_INK);

  // The map header carries the same "New" treatment with a descriptive accessible name.
  await card.click();
  await expect(page).toHaveURL(/\/venues\/2/);
  const mapHeader = page.locator('.map-head');
  await expect(mapHeader.getByTestId('new-chip')).toHaveText('New');
  await expect(mapHeader.getByTestId('new-chip')).toHaveAttribute('aria-label', 'No reviews yet');
  await expect(mapHeader).not.toContainText('0.0');
  await expectNoSeriousAxeViolations(page, 'venue map (unrated venue)');

  // The same pill on the second surface — "the same treatment on Discover cards and the beach-map header" is the whole point of #705, and identical computed values are what makes it checkable.
  const headerSemantic = mapHeader.locator('.semantic-chip');
  await expect(headerSemantic).toHaveCount(2);
  await expect(headerSemantic.first()).toHaveText('Instant Book');
  await expect(headerSemantic.first()).toHaveCSS('background-color', SEMANTIC_FILL);
  await expect(headerSemantic.last()).toHaveCSS('background-color', SEMANTIC_FILL);
  await expect(headerSemantic.last()).toHaveCSS('color', SEMANTIC_INK);

  // Theme-invariant on purpose: the fill is an opaque literal, not a --riv-* token, so a theme flip must not move it.
  await openThemePicker(page);
  await page.getByTestId('theme-option-porcelain').click();
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'porcelain');
  await expect(headerSemantic.first()).toHaveCSS('background-color', SEMANTIC_FILL);
  await expect(headerSemantic.first()).toHaveCSS('color', SEMANTIC_INK);
  await expectNoSeriousAxeViolations(page, 'venue map (unrated venue, porcelain)');
});

test('discovery shows an accessible empty state when no venues match', async ({ page }) => {
  // Override the list route to return nothing for this run.
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.getByTestId('empty')).toBeVisible();
  await expect(page.getByTestId('venue-card')).toHaveCount(0);
  // The outcome region still speaks the count in the empty state, as it does for a landed list.
  await expect(page.getByTestId('sheet-outcome')).toContainText('0 of 0 selling today');
  await expectNoSeriousAxeViolations(page, 'discovery empty state');
});

test('a hidden venue answers a not-available state with a way back, not a retry loop (#693)', async ({
  page,
}) => {
  // A venue whose owning operator is not ACTIVE 404s on the map read (#693's fence).
  await page.route(/\/api\/venues\/9(\?.*)?$/, (route) =>
    route.fulfill({ status: 404, json: { title: 'Not Found', status: 404 } }),
  );
  await page.goto('/venues/9');

  const panel = page.getByTestId('map-not-found');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('isn’t available');
  await expect(page.getByTestId('map-retry')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'venue map not-available state');

  await panel.getByTestId('map-back-home').click();
  await expect(page).toHaveURL(/\/$/);
  // The way back carries no query, so it lands on the riviera map, not the page this spec left.
  await expect(
    page.locator('[data-testid="venue-card"], [data-testid="venue-row"]').first(),
  ).toBeVisible();
});

test('a venue with no published map explains itself and points back to Discover (#717)', async ({
  page,
}) => {
  // Tourist-visible (#693: its operator is ACTIVE) but its layout was never drawn — so 0 sets.
  await page.route(/\/api\/venues\/8(\?.*)?$/, (route) =>
    route.fulfill({
      json: { ...VENUE_MAP, id: 8, name: 'Unmapped Cove', fromPrice: null, sets: [] },
    }),
  );
  await page.goto('/venues/8');

  const empty = page.getByTestId('map-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('heading', { name: 'No sunbeds mapped yet' })).toBeVisible();
  // Sets come from the layout, not the day — the copy must not send the tourist to the picker.
  await expect(empty).toContainText('on any date');

  // Nothing that promises tiles outlives them: no grid, no legend, no pan viewport, no ratio.
  await expect(page.getByTestId('set-tile')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Legend' })).toHaveCount(0);
  await expect(page.getByTestId('map-pan')).toHaveCount(0);
  await expect(page.getByTestId('availability')).toHaveText('No sets to book yet');
  await expect(page.getByTestId('availability-bar')).toHaveCount(0);

  await expectNoSeriousAxeViolations(page, 'venue map (no published layout)');

  await empty.getByRole('button', { name: 'Back to Discover' }).click();
  await expect(page).toHaveURL(/\/$/);
  // The way back carries no query, so it lands on the riviera map, not the page this spec left.
  await expect(
    page.locator('[data-testid="venue-card"], [data-testid="venue-row"]').first(),
  ).toBeVisible();
});
