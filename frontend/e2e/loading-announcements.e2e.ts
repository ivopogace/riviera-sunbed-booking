import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * The loading-announcement contract in a real browser: a loading surface announces through a live
 * region that is **already in the DOM when its text changes**.
 *
 * <p>The unit specs assert the same mechanism in jsdom, where change detection is driven by hand.
 * This one holds the announcer's element handle across a genuine network round trip in Chromium —
 * if any surface ever rebuilds its region on load, the handle goes stale and this fails, which is
 * exactly the regression the unit specs cannot see through a fake scheduler.
 *
 * <p>What no automated test can assert is that a screen reader spoke. The falsifiable half is the
 * mechanism, and that is deliberately all this claims.
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
    amenities: ['SHOWERS'],
    availability: { free: 18, total: 24 },
  },
];

test('Discover announces through a region that outlives the load (#741)', async ({ page }) => {
  // Hold the response open so the loading state is observable rather than raced past.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/venues*', async (route) => {
    await held;
    await route.fulfill({ json: VENUES });
  });

  await page.goto('/');

  const announcer = page.getByTestId('load-announcer');
  await expect(announcer).toHaveText('Loading venues…');
  // The skeleton is decoration — it must not also be speaking.
  await expect(page.getByTestId('loading')).toHaveAttribute('aria-hidden', 'true');

  // A rebuilt region would be a fresh element, and a fresh element cannot carry this mark.
  await announcer.evaluate((el) => el.setAttribute('data-identity-probe', 'same-node'));

  release();
  await expect(page.getByTestId('venue-card')).toHaveCount(1);

  await expect(announcer).toHaveAttribute('data-identity-probe', 'same-node');
  // Empty by design: the persistent results-count region already spoke the outcome.
  await expect(announcer).toHaveText('');
  await expect(page.getByTestId('results')).toContainText('1');

  await expectNoSeriousAxeViolations(page, 'Discover, loaded');
});
