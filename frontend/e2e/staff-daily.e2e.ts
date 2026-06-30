import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

/**
 * Real-render a11y + behaviour audit of the U8 staff daily view (issue #10): sign in as the
 * operator → see today's bookings + the live map → tap a free set to mark a walk-in. Runs axe at
 * each step in a real browser (keyboard, focus, true colour contrast jsdom can't measure). The API
 * is mocked (`page.route`) with a small stateful availability set, so the test is self-contained and
 * runs in CI (`npm run test:e2e:a11y`). The real-backend staff suite would live under
 * `e2e/real-backend/`; this mocked spec belongs in the CI-safe suite.
 */

const VENUE = 1;

function mapBody(marked: ReadonlySet<number>) {
  const set = (id: number, pool: 'ONLINE' | 'WALK_IN') => ({
    id, rowLabel: 'Front row', positionNo: id, tier: 'PREMIUM', pool,
    price: { minorUnits: 4500, currency: 'EUR' }, gridX: id, gridY: 1,
    availability: marked.has(id) ? 'TAKEN' : 'FREE',
  });
  return {
    id: VENUE, name: 'Miramar Beach Club', beach: 'Ksamil', region: 'Albanian Riviera',
    description: 'Loungers on the shore.', ratingTenths: 48, reviewsCount: 12,
    bookingMode: 'INSTANT', fromPrice: { minorUnits: 4500, currency: 'EUR' },
    sets: [set(1, 'ONLINE'), set(2, 'WALK_IN')],
  };
}

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test('operator signs in, sees bookings, and marks a walk-in', async ({ page }) => {
  // Stateful availability: set 2 is staff-marked once the operator taps it.
  const marked = new Set<number>();

  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ setId: 1, code: 'ARRIVE2345' }] }),
  );
  await page.route(/\/api\/venues\/1\/sets\/2\/availability$/, (route) => {
    if (route.request().method() === 'POST') {
      marked.add(2);
      return route.fulfill({ json: { state: 'STAFF_MARKED' } });
    }
    return route.fallback();
  });
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: mapBody(marked) }));

  await page.goto(`/venue-admin/daily/${VENUE}`);

  // Signed out: the sign-in form is shown and accessible.
  await expect(page.getByRole('heading', { name: 'Staff daily view' })).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'sign-in');

  await page.getByLabel('Operator').fill('operator');
  await page.getByLabel('Password').fill('test-pw');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Signed in: the venue header, the live map, and today's booking code are shown.
  await expect(page.getByRole('heading', { name: 'Miramar Beach Club' })).toBeVisible();
  await expect(page.getByText('ARRIVE2345')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'daily view loaded');

  // Tap the free walk-in set → it marks (optimistic ✓) and reconciles to STAFF_MARKED.
  const tile = page.locator('[data-set-id="2"]');
  await expect(tile).toHaveAttribute('data-state', 'FREE');
  await tile.click();
  await expect(page.locator('[data-set-id="2"]')).toHaveAttribute('data-state', 'STAFF_MARKED');
  await expectNoSeriousAxeViolations(page, 'after marking a walk-in');
});
