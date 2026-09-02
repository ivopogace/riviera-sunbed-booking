import { expect, test, type Page } from '@playwright/test';

import { settle } from './support/booking-dialog';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * Real-render proof for the four fixed-ink families. Two failures live here and nowhere else: a
 * token declared without its `@theme inline` row generates no utility at all — the class stays in
 * the markup and the paint silently does not change — and the cascade under a real document theme
 * is not something the unit guard, which reads `tailwind.css` as text, can see.
 *
 * <p>The calendar and the banner are asserted under BOTH themes against the same expected value:
 * that the value does not move is the test. The two console families sit under a porcelain-pinned
 * host, so their dark branch is proven at the document root instead.
 *
 * <p>The console button's hover fill (#887) joined the border family here rather than in a file of
 * its own, because the family's render proof is where the family lives. It is also the sharpest
 * case for this file's whole reason to exist: a hover fill has no bare class selector at all, so
 * the hovered box is the ONLY place its `@theme inline` row can be observed.
 *
 * <p>Rationale: `docs/design/colour-literal-token-audit.md` (class T-3, and class R for #887).
 */

const VENUE_ID = 4;
const CODE = 'RIV7K2QX';

/** The authored value of every token the re-cut registered, as `getPropertyValue` returns it. */
const REGISTRY = {
  '--riv-calendar-glass': 'rgba(255, 255, 255, 0.97)',
  '--riv-calendar-ink': '#0a2a33',
  '--riv-calendar-ink-soft': 'rgba(12, 42, 51, 0.78)',
  '--riv-calendar-ink-faint': 'rgba(12, 42, 51, 0.72)',
  '--riv-calendar-ink-disabled': 'rgba(12, 42, 51, 0.4)',
  '--riv-calendar-hover': 'rgba(12, 42, 51, 0.07)',
  '--riv-banner-body-ink': '#334a52',
  '--riv-banner-strong-ink': '#0a2a33',
  '--riv-console-card-border': 'rgba(12, 42, 51, 0.1)',
  '--riv-console-btn-border': 'rgba(12, 42, 51, 0.14)',
  '--riv-console-btn-hover': '#eef1f2',
} as const;

/**
 * The utility each token is consumed through, which exists only if its `@theme inline` row does.
 *
 * <p>Four of the eleven are absent, all for the same reason: they are consumed through a VARIANT, so
 * Tailwind compiles them to a compound selector rather than a bare `.class` this sweep can match —
 * `--riv-calendar-hover` and `--riv-console-btn-hover` as `.hover\:bg-…:hover`,
 * `--riv-calendar-ink-disabled` as `.aria-disabled\:text-…[aria-disabled="true"]`, and
 * `--riv-banner-strong-ink` as `.\[\&_strong\]\:text-… strong`. Each is instead proven on the
 * rendered box further down — the hovered month-step button, the hovered sign-out button, the past
 * day cell, and the banner's `<strong>` — which is the stronger proof anyway, since it exercises
 * the variant as well as the `@theme inline` row.
 */
const UTILITIES = [
  'bg-riv-calendar-glass',
  'text-riv-calendar-ink',
  'text-riv-calendar-ink-soft',
  'text-riv-calendar-ink-faint',
  'text-riv-banner-body-ink',
  'border-riv-console-card-border',
  'border-riv-console-btn-border',
];

/** The computed forms of the authored values above, as Chromium reports them. */
const INK = 'rgb(10, 42, 51)';
const INK_SOFT = 'rgba(12, 42, 51, 0.78)';
const INK_FAINT = 'rgba(12, 42, 51, 0.72)';
const INK_DISABLED = 'rgba(12, 42, 51, 0.4)';
const GLASS = 'rgba(255, 255, 255, 0.97)';
const BANNER_BODY = 'rgb(51, 74, 82)';
const CONSOLE_BTN_HOVER = 'rgb(238, 241, 242)';

const THEMES = ['porcelain', 'dark'] as const;

async function forceTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('riviera-theme', value), theme);
}

function venue() {
  const sets = Array.from({ length: 6 }, (_unused, index) => ({
    id: index + 1,
    rowLabel: 'Row 1',
    positionNo: index + 1,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 3000, currency: 'EUR' },
    gridX: index + 1,
    gridY: 1,
    availability: 'FREE',
  }));
  return {
    id: VENUE_ID,
    name: 'Token Cove',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    description: 'A venue that exists so the calendar popover can be rendered and measured.',
    ratingTenths: 45,
    reviewsCount: 88,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets,
  };
}

function calendarDays(from: string, to: string) {
  const days: { date: string; free: number; total: number }[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    days.push({ date: iso, free: 30, total: 30 });
    if (iso === to) break;
  }
  return days;
}

/** A request awaiting the venue, the one status whose banner renders body prose AND a `<strong>`. */
const PENDING_BOOKING = {
  code: CODE,
  status: 'PENDING_REQUEST',
  venueId: VENUE_ID,
  venueName: 'Token Cove',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: false,
  beforeCutoff: true,
  refundIfCancelledNow: null,
  refundedAmount: null,
  requestExpiresAt: '2026-11-30T16:00:00Z',
  withdrawable: true,
  payment: null,
  cancellationWindowAtBirth: 'FREE',
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

async function openCalendar(page: Page) {
  await page.clock.setFixedTime(new Date('2026-08-12T10:00:00Z'));
  await page.route(/\/api\/venues\/\d+\/availability-calendar\?.*$/, (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: calendarDays(url.searchParams.get('from')!, url.searchParams.get('to')!),
    });
  });
  await page.route(/\/api\/venues\/\d+(\?.*)?$/, (route) => route.fulfill({ json: venue() }));

  await page.goto(`/venues/${VENUE_ID}`);
  await expect(page.getByRole('heading', { name: 'Token Cove' })).toBeVisible();
  await page.getByTestId('map-date').click();

  const dialog = page.getByTestId('availability-calendar');
  await expect(dialog).toBeVisible();
  await settle(page);
  return dialog;
}

for (const theme of THEMES) {
  test(`every re-cut token is declared and generates its utility under ${theme} (#849)`, async ({
    page,
  }) => {
    await forceTheme(page, theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-riv-theme', theme);

    const declared = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return names.map((name) => [name, style.getPropertyValue(name).trim()] as const);
    }, Object.keys(REGISTRY));

    for (const [name, value] of declared) {
      expect(value, `${name} declared under ${theme}`).toBe(
        REGISTRY[name as keyof typeof REGISTRY],
      );
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

  test(`the calendar popover paints the same fixed ramp under ${theme} (#849)`, async ({
    page,
  }) => {
    await forceTheme(page, theme);
    const dialog = await openCalendar(page);

    await expect(dialog).toHaveCSS('background-color', GLASS);
    await expect(page.getByTestId('calendar-month')).toHaveCSS('color', INK);
    await expect(dialog.locator('th').first()).toHaveCSS('color', INK_FAINT);
    await expect(dialog.locator('p.text-riv-calendar-ink-soft')).toHaveCSS('color', INK_SOFT);
    // Skips this month's past cells, which wear the disabled ink the test below asserts.
    await expect(dialog.locator('button[data-date]:not([aria-disabled="true"])').first()).toHaveCSS(
      'color',
      INK,
    );

    // `next`, not `prev`: at the earliest month `prev` is aria-disabled, where the wash is off.
    const next = page.getByTestId('calendar-next');
    await next.hover();
    await expect(next).toHaveCSS('background-color', 'rgba(12, 42, 51, 0.07)');
  });

  test(`the pending banner paints the same fixed pair under ${theme} (#849)`, async ({ page }) => {
    await forceTheme(page, theme);
    await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (route) =>
      route.fulfill({ json: PENDING_BOOKING }),
    );

    await page.goto(`/booking/${CODE}`);
    const banner = page.getByTestId('request-pending');
    await expect(banner).toBeVisible();

    await expect(banner.locator('p').first()).toHaveCSS('color', BANNER_BODY);
    await expect(banner.locator('strong').first()).toHaveCSS('color', INK);
  });
}

/**
 * The calendar's disabled day ink, asserted once rather than per theme: it needs a month whose
 * earlier days are already past, which the fixed clock above supplies, and the value is
 * theme-invariant for the same reason as everything else in the family.
 */
test('the calendar disables past days in the fixed ramp, not a themed one (#849)', async ({
  page,
}) => {
  const dialog = await openCalendar(page);
  const disabled = dialog.locator('button[data-date][aria-disabled="true"]').first();

  await expect(disabled).toBeVisible();
  await expect(disabled).toHaveCSS('color', INK_DISABLED);
});

test("the console paints both hairlines, and the button's hover fill, from their own tokens (#849, #887)", async ({
  page,
}) => {
  await mockWholeConsole(page);
  await page.goto('/operator/1/beach-map');
  await signInAsOperator(page);

  const activeTab = page.locator('a[aria-current="page"]');
  await expect(activeTab).toBeVisible();
  await expect(activeTab).toHaveCSS('border-color', 'rgba(12, 42, 51, 0.1)');

  const signOut = page.getByTestId('oc-signout');
  await expect(signOut).toBeVisible();
  await expect(signOut).toHaveCSS('border-color', 'rgba(12, 42, 51, 0.14)');

  // The resting fill is the named colour the skin deliberately kept; only the hover state is a token.
  await expect(signOut).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await signOut.hover();
  await expect(signOut).toHaveCSS('background-color', CONSOLE_BTN_HOVER);
});
