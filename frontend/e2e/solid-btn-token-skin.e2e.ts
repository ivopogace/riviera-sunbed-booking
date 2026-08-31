import { expect, test, type Page } from '@playwright/test';

/**
 * The solid outline-button skin paints from the token registry, asserted against a real render
 * (#851) — the sibling of `form-error-token-skin.e2e.ts`, one entry later in the same audit class.
 *
 * <p>The computed style is what is checked, never the class list. A `--riv-solid-btn-*` declared
 * without its `@theme inline` row generates no utility at all: the class stays in the markup, the
 * paint silently does not change, and nothing but a resolved value separates that from a working
 * token. The first test catches that for the whole family by asking whether Tailwind emitted the rule.
 *
 * <p>The last test is the one this slice exists for. The family is theme-INVARIANT as a whole — the
 * fills do not theme, so a themed ink over them would resolve `#ffa9a1` at 1.69:1 or `#7cd7e8` at
 * 1.52:1, light on light. The unit spec (`booking/solid-btn-tokens.contrast.spec.ts`) proves that by
 * reading `tailwind.css` as text, which is a regex over a stylesheet; here the cascade itself
 * decides, under a real `dark` document theme. Both buttons are asserted, because the neutral and
 * danger variants share the two fills and a drift in either breaks the pair.
 */

const CODE = 'ABCD234567';

const FILL = 'rgb(244, 246, 247)';
const HOVER_FILL = 'rgb(231, 235, 236)';
const INK = 'rgb(10, 79, 94)';
const BORDER = 'rgba(255, 255, 255, 0.7)';
const DANGER_INK = 'rgb(163, 55, 42)';
const DANGER_BORDER = 'rgba(200, 90, 60, 0.5)';

/** Every token the family registers, with the value `tailwind.css` declares for it. */
const REGISTRY = {
  '--riv-solid-btn-ink': '#0a4f5e',
  '--riv-solid-btn-fill': '#f4f6f7',
  '--riv-solid-btn-hover': '#e7ebec',
  '--riv-solid-btn-border': 'rgba(255, 255, 255, 0.7)',
  '--riv-solid-btn-danger-ink': '#a3372a',
  '--riv-solid-btn-danger-border': 'rgba(200, 90, 60, 0.5)',
} as const;

/**
 * The utility each token is consumed through, which only exists if its `@theme inline` row does.
 * The hover fill is deliberately absent: it compiles to `.hover\:bg-…:hover`, not a bare class
 * selector, so it is proven where it actually matters — the hovered box, in the second test.
 */
const UTILITIES = [
  'bg-riv-solid-btn-fill',
  'border-riv-solid-btn-border',
  'text-riv-solid-btn-ink',
  'border-riv-solid-btn-danger-border',
  'text-riv-solid-btn-danger-ink',
];

const DETAIL = {
  code: CODE,
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  requestExpiresAt: null,
  payment: null,
  cancellationWindowAtBirth: 'FREE',
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

/**
 * Opens the booking view on a cancellable booking, where the DANGER outline button ("Cancel
 * booking") renders. Its neutral sibling ("Keep booking") appears one click later, on the confirm
 * prompt — so one page reaches both variants of the skin.
 */
async function openCancellableBooking(page: Page): Promise<void> {
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
    route.fulfill({ json: DETAIL }),
  );

  await page.goto(`/booking/${CODE}`);
  await expect(page.getByTestId('start-cancel')).toBeVisible();
}

test.describe('the solid outline-button skin paints from the token registry', () => {
  test('every registered token is declared and generates its utility', async ({ page }) => {
    await page.goto('/');

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

  test('both outline variants paint the registered family, hover included', async ({ page }) => {
    await openCancellableBooking(page);

    const danger = page.getByTestId('start-cancel');
    await expect(danger).toHaveCSS('background-color', FILL);
    await expect(danger).toHaveCSS('border-color', DANGER_BORDER);
    await expect(danger).toHaveCSS('color', DANGER_INK);

    // The hover fill is shared by both variants, and is the one position no bare class selector proves.
    await danger.hover();
    await expect(danger).toHaveCSS('background-color', HOVER_FILL);

    await danger.click();

    const neutral = page.getByTestId('keep-booking');
    await expect(neutral).toHaveCSS('background-color', FILL);
    await expect(neutral).toHaveCSS('border-color', BORDER);
    await expect(neutral).toHaveCSS('color', INK);

    await neutral.hover();
    await expect(neutral).toHaveCSS('background-color', HOVER_FILL);
  });

  test('the family does not move under a dark document theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('riviera-theme', 'dark'));
    await openCancellableBooking(page);

    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

    const danger = page.getByTestId('start-cancel');
    await expect(danger).toHaveCSS('background-color', FILL);
    await expect(danger).toHaveCSS('border-color', DANGER_BORDER);
    await expect(danger).toHaveCSS('color', DANGER_INK);

    await danger.click();

    const neutral = page.getByTestId('keep-booking');
    await expect(neutral).toHaveCSS('background-color', FILL);
    await expect(neutral).toHaveCSS('border-color', BORDER);
    await expect(neutral).toHaveCSS('color', INK);
  });
});
