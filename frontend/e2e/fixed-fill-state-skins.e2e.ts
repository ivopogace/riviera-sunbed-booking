import { expect, test, type Page } from '@playwright/test';

import { completeDialog } from './support/booking-dialog';

/**
 * The three fixed-fill state skins paint from the token registry, asserted against a real render
 * (#858) — the class-F-3 counterpart to `form-error-token-skin.e2e.ts` and `console-negative-ink.e2e.ts`.
 *
 * <p>Two failures live here and nowhere else. **A token declared without its `@theme inline` row**
 * generates no utility at all: the class stays in the markup, the paint silently does not change,
 * and no unit spec can tell that from a working token — the first test asks the CSSOM whether
 * Tailwind actually emitted each rule. And **the cascade under a real theme**: the unit guard
 * (`shared/fixed-fill-token-skins.contrast.spec.ts`) proves invariance by reading `tailwind.css` as
 * text, which is a regex over a stylesheet; here `data-riv-theme="dark"` is live on the document and
 * the cascade decides.
 *
 * <p>The dark leg is what the slice exists for. All three skins sit on hosts that DO theme — no
 * medallion, chip or step badge is inside a porcelain-pinned subtree — and `shared/amenity-chip.ts`
 * and `shared/failure-panel.ts` are mounted by hosts of differing themes, so this is the check that
 * matters. Every assertion runs twice, once per theme, against the same expected value: a skin that
 * moved between the two legs is precisely the drift the tokens forbid.
 *
 * <p>`shared/outcome-card.ts`'s two tone glyphs are proven here too, via the auth page's two landed
 * states. They are the legs where the both-themes loop carries the whole assertion rather than
 * corroborating it: every other site's paint was already invariant before it was tokenised.
 *
 * <p>Six surfaces, because the family has to be proven where it actually renders: the amenity chip's
 * two variants, the step badge's two states, and the medallion's three — positive via the booking
 * confirmation, negative via `shared/`'s own `appFailureIcon`, and **waiting** via
 * `request-confirmation`'s REQUEST-mode `202` — whose badge glyph is the envelope, not the
 * hourglass its neighbouring info box carries. That last leg exists because #858 never enumerated
 * the waiting state; it was found by sweeping the medallion FORM rather than the ticket's value
 * list, and without a rendered assertion its pair would be declared and mapped but never proven to
 * reach an element.
 */

/** Every token the slice registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-medallion-positive-fill': '#d9f2f7',
  '--riv-medallion-positive-ink': '#0a5f74',
  '--riv-medallion-waiting-fill': '#fcf0d9',
  '--riv-medallion-waiting-ink': '#8a5410',
  '--riv-medallion-negative-fill': '#f7e8e4',
  '--riv-medallion-negative-ink': '#a3372a',
  '--riv-medallion-negative-border': '#eecdc4',
  '--riv-amenity-tag-ink': '#2f4a54',
  '--riv-amenity-tag-fill': '#eef2f4',
  '--riv-amenity-tag-border': '#dbe4e7',
  '--riv-amenity-water-ink': '#0a5f74',
  '--riv-amenity-water-fill': '#d7eef4',
  '--riv-amenity-water-border': '#b9e0ea',
  '--riv-step-active-ink': '#0a5f74',
  '--riv-step-idle-fill': '#2c7789',
} as const;

/** The utility each token is consumed through — which exists only if its `@theme inline` row does. */
const UTILITIES = [
  'bg-riv-medallion-positive-fill',
  'text-riv-medallion-positive-ink',
  'bg-riv-medallion-waiting-fill',
  'text-riv-medallion-waiting-ink',
  'bg-riv-medallion-negative-fill',
  'text-riv-medallion-negative-ink',
  'border-riv-medallion-negative-border',
  'text-riv-amenity-tag-ink',
  'bg-riv-amenity-tag-fill',
  'border-riv-amenity-tag-border',
  'text-riv-amenity-water-ink',
  'bg-riv-amenity-water-fill',
  'border-riv-amenity-water-border',
  'text-riv-step-active-ink',
  'bg-riv-step-idle-fill',
];

/** The computed `rgb()` forms the skins must paint, in every theme. */
const RGB = {
  positiveFill: 'rgb(217, 242, 247)',
  positiveInk: 'rgb(10, 95, 116)',
  waitingFill: 'rgb(252, 240, 217)',
  waitingInk: 'rgb(138, 84, 16)',
  negativeFill: 'rgb(247, 232, 228)',
  negativeInk: 'rgb(163, 55, 42)',
  negativeBorder: 'rgb(238, 205, 196)',
  waterFill: 'rgb(215, 238, 244)',
  waterBorder: 'rgb(185, 224, 234)',
  waterInk: 'rgb(10, 95, 116)',
  tagFill: 'rgb(238, 242, 244)',
  tagInk: 'rgb(47, 74, 84)',
  stepActiveInk: 'rgb(10, 95, 116)',
  stepIdleFill: 'rgb(44, 119, 137)',
} as const;

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 4500, currency: 'EUR' },
  amenities: ['SHOWERS', 'BEACH_BAR'],
  distanceToWaterM: 15,
  sets: [
    {
      id: 2,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 2,
      gridY: 1,
      availability: 'FREE',
    },
  ],
};

/** The REQUEST-mode twin — its `202 PENDING_REQUEST` lands on the waiting medallion. */
const REQUEST_VENUE = { ...VENUE, bookingMode: 'REQUEST' };

const PENDING_REQUEST = {
  code: 'WXYZ345678',
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  requestExpiresAt: '2026-11-30T15:00:00Z',
};

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
};

/** Pins the document theme before Angular boots, so the seed in `index.html` resolves it too. */
async function forceTheme(page: Page, theme: 'porcelain' | 'dark'): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('riviera-theme', value), theme);
}

async function mockVenue(page: Page): Promise<void> {
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE }));
  await page.route('**/api/bookings', (route) =>
    route.fulfill({ status: 201, json: CONFIRMATION }),
  );
}

for (const theme of ['porcelain', 'dark'] as const) {
  test.describe(`the fixed-fill state skins under the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await forceTheme(page, theme);
    });

    test('every registered token is declared and generates its utility', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);

      const declared = await page.evaluate((names) => {
        const style = getComputedStyle(document.documentElement);
        return names.map((name) => [name, style.getPropertyValue(name).trim()] as const);
      }, Object.keys(REGISTRY));

      for (const [name, value] of declared) {
        expect(value, `${name} declared`).toBe(REGISTRY[name as keyof typeof REGISTRY]);
      }

      const generated = await page.evaluate((classes) => {
        const selectors = new Set<string>();
        const walk = (rules: CSSRuleList): void => {
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) selectors.add(rule.selectorText);
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) walk(nested);
          }
        };
        for (const sheet of document.styleSheets) walk(sheet.cssRules);
        return classes.filter((name) => selectors.has(`.${name}`));
      }, UTILITIES);

      expect(generated.sort()).toEqual([...UTILITIES].sort());
    });

    test('the amenity chip paints both registered variants', async ({ page }) => {
      await mockVenue(page);
      await page.goto('/venues/1');

      const water = page.locator('.amenity-chip--water').first();
      await expect(water).toBeVisible();
      await expect(water).toHaveCSS('background-color', RGB.waterFill);
      await expect(water).toHaveCSS('color', RGB.waterInk);
      await expect(water).toHaveCSS('border-color', RGB.waterBorder);

      // The neutral sibling: the half that proves the ternary moved whole, not one branch at a time.
      const tag = page.locator('.amenity-chip:not(.amenity-chip--water)').first();
      await expect(tag).toBeVisible();
      await expect(tag).toHaveCSS('background-color', RGB.tagFill);
      await expect(tag).toHaveCSS('color', RGB.tagInk);
    });

    test('the dialog step badge paints both registered states', async ({ page }) => {
      await mockVenue(page);
      await page.goto('/venues/1');
      await page
        .getByRole('button', { name: /Select to book/ })
        .first()
        .click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const badges = dialog.locator('.step-num');
      await expect(badges.first()).toHaveCSS('color', RGB.stepActiveInk);
      await expect(badges.first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(badges.nth(1)).toHaveCSS('background-color', RGB.stepIdleFill);
      await expect(badges.nth(1)).toHaveCSS('color', 'rgb(255, 255, 255)');
    });

    test('the confirmation medallion paints the registered positive state', async ({ page }) => {
      await mockVenue(page);
      await page.goto('/venues/1');
      await page
        .getByRole('button', { name: /Select to book/ })
        .first()
        .click();
      await completeDialog(page.getByRole('dialog'), 'Continue to payment');

      await expect(page).toHaveURL(/\/booking\/confirmation/);
      const medallion = page.locator('[aria-hidden="true"]').filter({ hasText: '✓' }).first();
      await expect(medallion).toHaveCSS('background-color', RGB.positiveFill);
      await expect(medallion).toHaveCSS('color', RGB.positiveInk);
    });

    test('the request medallion paints the registered waiting state', async ({ page }) => {
      // Without this leg the waiting pair is declared and mapped, but never proven to reach a render.
      await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
        route.fulfill({ json: REQUEST_VENUE }),
      );
      await page.route('**/api/bookings', (route) =>
        route.fulfill({ status: 202, json: PENDING_REQUEST }),
      );

      await page.goto('/venues/1');
      await page
        .getByRole('button', { name: /Select to book/ })
        .first()
        .click();
      await completeDialog(page.getByRole('dialog'), 'Send request');

      await expect(page).toHaveURL(/\/booking\/requested/);
      // `hasText: '⏳'` would match the info box's hourglass; the badge's own glyph is the envelope.
      const medallion = page.locator('[aria-hidden="true"]').filter({ hasText: '✉' }).first();
      await expect(medallion).toHaveCSS('background-color', RGB.waitingFill);
      await expect(medallion).toHaveCSS('color', RGB.waitingInk);
    });

    test('the signed-in outcome card paints the registered positive state', async ({ page }) => {
      /** Already-signed-in + a visit to the sign-in route is the whole precondition: `stage()`
       *  reads the restored session and swaps in the landed card (auth-page.ts). */
      await page.route(/\/api\/auth\/me$/, (route) =>
        route.fulfill({ json: { username: 'tourist@example.com', principalType: 'CUSTOMER' } }),
      );

      await page.goto('/account/sign-in');
      const card = page.getByTestId('auth-signed-in');
      await expect(card).toBeVisible();

      const glyph = card.locator('[data-riv-outcome-glyph]');
      await expect(glyph).toHaveCSS('background-color', RGB.positiveFill);
      await expect(glyph).toHaveCSS('color', RGB.positiveInk);
    });

    test('the submitted-for-approval outcome card paints the registered waiting state', async ({
      page,
    }) => {
      /** The narrow path to this card (auth-page.ts): the D-8 202 is session-less, so the page
       *  follows up with a normal sign-in — and only a failure that is NEITHER 401 nor 429 falls
       *  through to the submitted card rather than to an error message. */
      await page.route(/\/api\/auth\/me$/, (route) =>
        route.fulfill({
          status: 401,
          json: { title: 'Unauthorized', status: 401, code: 'UNAUTHENTICATED' },
        }),
      );
      await page.route(/\/api\/auth\/operator\/register$/, (route) =>
        route.fulfill({ status: 202, json: { status: 'PENDING' } }),
      );
      await page.route(/\/api\/auth\/operator\/login$/, (route) => route.fulfill({ status: 500 }));

      await page.goto('/operator/register');
      await page.getByLabel('Username', { exact: true }).fill('newop');
      await page.getByLabel('Contact email', { exact: true }).fill('newop@venue.example');
      await page.getByLabel('Password', { exact: true }).fill('newop-pw-123');
      await page.getByRole('button', { name: /^(Request account|Submitting)/ }).click();

      const card = page.getByTestId('auth-pending');
      await expect(card).toBeVisible();

      const glyph = card.locator('[data-riv-outcome-glyph]');
      await expect(glyph).toHaveCSS('background-color', RGB.waitingFill);
      await expect(glyph).toHaveCSS('color', RGB.waitingInk);
    });

    test('the failure icon paints the registered negative state', async ({ page }) => {
      // `appFailureIcon` is this state worn by a directive Discover and the beach map both mount.
      await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ status: 500 }));
      await page.goto('/venues/1');

      const icon = page.locator('.failure-icon');
      await expect(icon).toBeVisible();
      await expect(icon).toHaveCSS('background-color', RGB.negativeFill);
      await expect(icon).toHaveCSS('color', RGB.negativeInk);
      await expect(icon).toHaveCSS('border-color', RGB.negativeBorder);
    });
  });
}
