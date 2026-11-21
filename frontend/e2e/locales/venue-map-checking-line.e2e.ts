import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { paintedText } from '../support/painted-text';
import { mockTourist } from '../support/tourist.mocks';

/**
 * The venue page's availability line while newly picked days load, in the Albanian build on a
 * phone (#1847): its copy is the longest of the four locales, so it is where the whole "Checking
 * availability for <days>…" sentence used to wrap to a line more than the count, or re-wrap when
 * the progress mark arrived, and move the map. Below `sm` the line shows the short copy and still
 * announces the whole sentence. The production build, because `ng serve` builds English only.
 */

const XLF = readFileSync(path.resolve(__dirname, '../../src/locale/messages.sq.xlf'), 'utf8');

/** The Albanian target of the unit whose source starts with `english`, its placeholder as `days`. */
function sq(english: string, days = ''): string {
  for (const [, source, target] of XLF.matchAll(
    /<source>([\s\S]*?)<\/source>\s*<target[^>]*>([\s\S]*?)<\/target>/g,
  )) {
    if (source.replace(/<x [^>]*\/>/g, '{}') === english) {
      return target.replace(/<x [^>]*\/>/g, days);
    }
  }
  throw new Error(`messages.sq.xlf has no translation of "${english}"`);
}

function set(id: number, availability: 'FREE' | 'TAKEN') {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'PREMIUM',
    pool: 'ONLINE',
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: id,
    gridY: 1,
    availability,
    freeDays: availability === 'FREE' ? 3 : 0,
    takenDates: [],
  };
}

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'KSAMIL',
  region: 'SARANDE',
  description: 'Loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  salesOpen: true,
  sets: [set(1, 'FREE'), set(2, 'FREE'), set(3, 'TAKEN')],
};

const mapCard = (page: Page) => page.locator('app-beach-map-canvas, app-beach-row-lens');

/** How far the map card sits under the overview card's top: the header above both names the days, so it may re-wrap. */
const mapUnderCard = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      document.querySelector('app-beach-map-canvas, app-beach-row-lens')!.getBoundingClientRect()
        .top - document.querySelector('[data-testid="map-overview"]')!.getBoundingClientRect().top,
  );

const CASES = [
  // The sentence took a line more than this stay's count.
  { width: 390, from: 'date=2026-08-25&lastDate=2026-08-27', pick: ['2026-08-18', '2026-08-21'] },
  // The sentence fitted the count's two lines until the mark took 22px of their width.
  { width: 344, from: 'date=2026-08-25', pick: ['2026-08-20'] },
];

for (const { width, from, pick } of CASES) {
  test(`at ${width}px the map stays put from the pick to the answer, the progress mark included`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-08-15T10:00:00Z'));
    await mockTourist(page);
    await page.route(/\/api\/venues\/1\/itinerary\?.*$/, (route) =>
      route.fulfill({ json: { maxMoves: 3, anchor: null, plan: null } }),
    );
    await page.route(/\/api\/venues\/1\/availability-calendar\?.*$/, (route) =>
      route.fulfill({ json: [] }),
    );
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
      reads += 1;
      if (reads > 1) {
        await held;
      }
      return route.fulfill({ json: VENUE });
    });
    await page.goto(`/sq/venues/1?${from}`);
    await expect(page.getByTestId('availability-bar')).toBeVisible();
    const rest = await mapUnderCard(page);

    await page.getByTestId('map-date').click();
    const calendar = page.getByTestId('availability-calendar');
    await calendar
      .getByTestId(pick.length > 1 ? 'calendar-mode-stay' : 'calendar-mode-day')
      .click();
    for (const day of pick) {
      await calendar.locator(`button[data-date="${day}"]`).click();
    }
    if (pick.length > 1) {
      await calendar.getByTestId('calendar-apply').click();
    }
    await expect(mapCard(page)).toHaveAttribute('inert', '');

    const days = (await page.getByTestId('map-date').innerText()).trim();
    await expect(page.getByTestId('availability')).toMatchAriaSnapshot(
      `- paragraph: ${sq('Checking availability for {}…', days)}`,
    );
    expect(await paintedText(page.getByTestId('availability'))).toBe(sq('Checking availability…'));
    expect(await mapUnderCard(page)).toBe(rest);
    await expect(page.getByTestId('availability-wait')).toBeVisible();
    expect(await mapUnderCard(page)).toBe(rest);
    release();
    await expect(mapCard(page)).not.toHaveAttribute('inert');
    await expect(page.getByTestId('availability-wait')).toHaveCount(0);
    expect(await mapUnderCard(page)).toBe(rest);
  });
}
