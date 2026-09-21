import { expect, Page, test } from '@playwright/test';

/**
 * The panel-surface token pair, asserted against a real render in the theme that is the
 * reason it exists.
 *
 * <p>`home.contrast.spec.ts` computes its ratios from the mirrors in `testing/glass-tokens.ts` and
 * pins the declarations by reading `tailwind.css` as text. Neither can see a *template*, and
 * neither can see the one failure mode that leaves both of them green: a token declared without its
 * `@theme inline` row generates no utility at all, so the class stays in the markup and the paint
 * silently does not change (`accent-token-inks.e2e.ts` names the same trap). Only the cascade
 * decides that, so only a browser can answer it — hence the generation check below, before any
 * colour is read.
 *
 * <p>The last test is the no-drift half: `--riv-accent-ink` is the token the pair forks FROM, and
 * the whole argument for a second token is that riviera's card consumers must not move. The card
 * price sits a few lines from the row price in the same page, in the same theme, and must still
 * compute the card accent.
 */

/** riviera `--riv-panel-accent-ink` (rationale for the value: its declaration in `tailwind.css`). */
const PANEL_ACCENT = 'rgb(168, 232, 242)';
/** riviera `--riv-panel-wash-hover` — a second coat of its own header tint, not a lightening wash. */
const PANEL_WASH_HOVER = 'rgba(10, 44, 63, 0.45)';
/** riviera `--riv-accent-ink`, the CARD accent, which the panel pair must leave where it is. */
const CARD_ACCENT = 'rgb(8, 90, 110)';

/** A tourist standing on Dhërmi, so the beach groups carry a distance at all. */
const ON_DHERMI = { latitude: 40.15, longitude: 19.64 };

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };

const VENUES = [
  venue(1, 'Aurora Bay', 'DHERMI', 40.1573, 19.6401, 3000),
  venue(2, 'Jalë Loungers', 'JALE', 40.117, 19.7, 2200),
];

function venue(
  id: number,
  name: string,
  beach: string,
  latitude: number,
  longitude: number,
  minorUnits: number,
): Record<string, unknown> {
  return {
    id,
    name,
    beach,
    region: 'HIMARE',
    ratingTenths: 46,
    reviewsCount: 143,
    bookingMode: 'INSTANT',
    amenities: ['BEACH_BAR'],
    fromPrice: { minorUnits, currency: 'EUR' },
    availability: { free: 11, total: 26 },
    salesOpen: true,
    location: { latitude, longitude },
  };
}

async function openInRiviera(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    localStorage.setItem('riviera-theme', 'riviera');
  });
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));
  await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'riviera');
}

/** The distance inside a group head — located by what it says, not by the class under assertion. */
function distanceIn(page: Page, groupTestId: string) {
  return page.getByTestId(groupTestId).first().getByText(/km$/);
}

test.describe('the panel-surface tokens paint the Discover sheet (riviera)', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(ON_DHERMI);
  });

  test('both tokens are declared and each generates the utility it is consumed through', async ({
    page,
  }) => {
    await openInRiviera(page, PHONE);

    const declared = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        accent: style.getPropertyValue('--riv-panel-accent-ink').trim(),
        wash: style.getPropertyValue('--riv-panel-wash-hover').trim(),
      };
    });
    expect(declared.accent).toBe('#a8e8f2');
    expect(declared.wash).toBe('rgba(10, 44, 63, 0.45)');

    /**
     * A token without its `@theme inline` row emits no rule at all — the class would survive every
     * other check here. The wash is only ever consumed under `hover:`, so its rule carries a
     * variant selector rather than the bare class; both are matched by substring for that reason.
     */
    const generated = await page.evaluate(
      (classes) => {
        const selectors: string[] = [];
        const walk = (rules: CSSRuleList): void => {
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) selectors.push(rule.selectorText);
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) walk(nested);
          }
        };
        for (const sheet of document.styleSheets) walk(sheet.cssRules);
        return classes.filter((name) => selectors.some((selector) => selector.includes(name)));
      },
      ['text-riv-panel-accent-ink', 'bg-riv-panel-wash-hover'],
    );

    expect(generated.sort()).toEqual(['bg-riv-panel-wash-hover', 'text-riv-panel-accent-ink']);
  });

  test('the sheet’s beach-group distance wears the panel accent', async ({ page }) => {
    await openInRiviera(page, PHONE);
    await page.getByTestId('sheet-near-me').click();
    await expect(page.getByTestId('sheet-near-me')).toHaveText(/You are here/);

    await expect(distanceIn(page, 'sheet-group')).toHaveCSS('color', PANEL_ACCENT);
  });

  test('the located glyph in the head wears it too', async ({ page }) => {
    await openInRiviera(page, PHONE);
    await page.getByTestId('sheet-near-me').click();

    await expect(page.getByTestId('head-located')).toHaveCSS('color', PANEL_ACCENT);
  });
});

test.describe('the panel-surface tokens paint the desktop panel (riviera)', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(ON_DHERMI);
  });

  test('the group-head distance and the row price wear the panel accent', async ({ page }) => {
    await openInRiviera(page, WIDE);
    await page.getByTestId('desk-near-me').click();
    await expect(page.getByTestId('desk-near-me')).toHaveText(/You are here/);

    await expect(distanceIn(page, 'desk-group')).toHaveCSS('color', PANEL_ACCENT);
    await expect(page.getByTestId('row-price').first()).toHaveCSS('color', PANEL_ACCENT);
  });

  test('a hovered row deepens the panel glass instead of washing it out', async ({ page }) => {
    await openInRiviera(page, WIDE);

    const row = page.getByTestId('venue-row').first();
    await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await row.hover();
    await expect(row).toHaveCSS('background-color', PANEL_WASH_HOVER);
  });
});

test.describe('the card family the pair forks from does not move', () => {
  test('the card price still wears --riv-accent-ink in riviera', async ({ page }) => {
    await openInRiviera(page, WIDE);
    // The plain list, where the cards live: the same page, the same theme, the card surface.
    await page.goto('/?map=off');

    await expect(page.getByTestId('venue-card').first()).toBeVisible();
    await expect(page.locator('strong.text-riv-accent-ink').first()).toHaveCSS(
      'color',
      CARD_ACCENT,
    );
  });
});
