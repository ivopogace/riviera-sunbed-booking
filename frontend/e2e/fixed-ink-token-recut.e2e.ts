import { expect, test, type Page } from '@playwright/test';

import { settle } from './support/booking-dialog';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * Real-render proof for the fixed-ink families, and for the availability calendar that left them.
 * Two failures live here and nowhere else: a token declared without its `@theme inline` row
 * generates no utility at all — the class stays in the markup and the paint silently does not
 * change — and the cascade under a real document theme is not something the unit guard, which
 * reads `tailwind.css` as text, can see.
 *
 * <p>The banner is asserted under BOTH themes against the same expected value: that the value does
 * not move is the test. The two console families sit under a porcelain-pinned host, so their dark
 * branch is proven at the document root instead.
 *
 * <p>The calendar is asserted under both themes against each theme's OWN value — the inverse claim
 * on the same box. It was the fourth fixed family here until #888 made it a `--riv-pop-*` consumer
 * with a themed, still-opaque day-cell palette; it stays in this file because this is the file that
 * already renders it under both document themes.
 *
 * <p>The console button's hover fill (#887) joined the border family here rather than in a file of
 * its own, because the family's render proof is where the family lives. It is also the sharpest
 * case for this file's whole reason to exist: a hover fill has no bare class selector at all, so
 * the hovered box is the ONLY place its `@theme inline` row can be observed.
 *
 * <p>Rationale: `docs/design/colour-literal-token-audit.md` (class T-3, class R for #887, and the
 * calendar verdict for #888).
 */

const VENUE_ID = 4;
const CODE = 'RIV7K2QX';

/** The authored value of every theme-invariant token the re-cut registered, as `getPropertyValue` returns it. */
const REGISTRY = {
  '--riv-banner-body-ink': '#334a52',
  '--riv-banner-strong-ink': '#0a2a33',
  '--riv-console-card-border': 'rgba(12, 42, 51, 0.1)',
  '--riv-console-btn-border': 'rgba(12, 42, 51, 0.14)',
  '--riv-console-btn-hover': '#eef1f2',
} as const;

/**
 * The calendar's themed tokens and the popover chrome it consumes, per document theme: the authored
 * value at the document root, and the computed form Chromium reports on the rendered box.
 */
const CALENDAR = {
  porcelain: {
    registry: {
      '--riv-calendar-free-fill': '#dff0e4',
      '--riv-calendar-low-fill': '#fdeecc',
      '--riv-calendar-full-fill': '#fae9e9',
      '--riv-calendar-unknown-fill': '#ffffff',
      '--riv-calendar-accent': '#0a3f4e',
      '--riv-calendar-selected-ring': '#085a6e',
      '--riv-calendar-bar-fill': '#0a3f4e',
      '--riv-calendar-bar-track': '#6f8a91',
      '--riv-pop-ink-disabled': 'rgba(12, 42, 51, 0.4)',
    },
    surface: 'rgba(255, 255, 255, 0.92)',
    ink: 'rgb(10, 42, 51)',
    inkSoft: 'rgba(12, 42, 51, 0.7)',
    inkDisabled: 'rgba(12, 42, 51, 0.4)',
    hover: 'rgba(12, 42, 51, 0.06)',
    freeFill: 'rgb(223, 240, 228)',
    accent: 'rgb(10, 63, 78)',
    selectedRing: 'rgb(8, 90, 110)',
    barFill: 'rgb(10, 63, 78)',
    barTrack: 'rgb(111, 138, 145)',
  },
  dark: {
    registry: {
      '--riv-calendar-free-fill': '#1f3f30',
      '--riv-calendar-low-fill': '#4a3a16',
      '--riv-calendar-full-fill': '#4d2429',
      '--riv-calendar-unknown-fill': '#1c2740',
      '--riv-calendar-accent': '#9adde8',
      '--riv-calendar-selected-ring': '#7cd7e8',
      '--riv-calendar-bar-fill': '#e6f4f8',
      '--riv-calendar-bar-track': '#758a9a',
      '--riv-pop-ink-disabled': 'rgba(242, 247, 250, 0.32)',
    },
    surface: 'rgba(16, 26, 46, 0.96)',
    ink: 'rgb(242, 247, 250)',
    inkSoft: 'rgba(242, 247, 250, 0.75)',
    inkDisabled: 'rgba(242, 247, 250, 0.32)',
    hover: 'rgba(255, 255, 255, 0.08)',
    freeFill: 'rgb(31, 63, 48)',
    accent: 'rgb(154, 221, 232)',
    selectedRing: 'rgb(124, 215, 232)',
    barFill: 'rgb(230, 244, 248)',
    barTrack: 'rgb(117, 138, 154)',
  },
} as const;

/**
 * The utility each token is consumed through, which exists only if its `@theme inline` row does.
 *
 * <p>Some tokens are absent, all for the same reason: they are consumed through a VARIANT, so the
 * rule that actually paints them is a compound selector this sweep cannot match. (A bare `.class`
 * may exist beside it — Tailwind's extractor reads the undecorated candidate out of the same class
 * string — but it wears nothing and paints no state, so matching it would prove nothing.) —
 * `--riv-console-btn-hover` as `.hover\:bg-…:hover`, `--riv-pop-ink-disabled` as
 * `.aria-disabled\:text-…[aria-disabled="true"]`, `--riv-calendar-accent`'s ring half as
 * `.focus-visible\:outline-…:focus-visible`, `--riv-calendar-selected-ring` through a `var()`
 * inside an arbitrary shadow, and `--riv-banner-strong-ink` as `.\[\&_strong\]\:text-… strong`.
 * Each is instead proven on the rendered box further down — the hovered sign-out button, the past
 * day cell, the chosen day's ring, and the banner's `<strong>` — which is the stronger proof
 * anyway, since it exercises the variant as well as the `@theme inline` row.
 */
const UTILITIES = [
  'text-riv-banner-body-ink',
  'border-riv-console-card-border',
  'border-riv-console-btn-border',
  'bg-riv-calendar-free-fill',
  'bg-riv-calendar-bar-fill',
  'bg-riv-calendar-bar-track',
  'text-riv-calendar-accent',
];

/** The computed forms of the authored values above, as Chromium reports them. */
const INK = 'rgb(10, 42, 51)';
const BANNER_BODY = 'rgb(51, 74, 82)';
const CONSOLE_BTN_HOVER = 'rgb(238, 241, 242)';

const THEMES = ['porcelain', 'dark'] as const;

/** Matches a computed `box-shadow` whose colour is `rgb`, whatever Chromium does with the rest. */
function shadowIn(rgb: string): RegExp {
  return new RegExp(rgb.replaceAll(/[()]/g, String.raw`\$&`));
}

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

    const themed = CALENDAR[theme].registry;
    const resolved = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return names.map((name) => [name, style.getPropertyValue(name).trim()] as const);
    }, Object.keys(themed));

    for (const [name, value] of resolved) {
      expect(value, `${name} resolves under ${theme}`).toBe(themed[name as keyof typeof themed]);
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

  test(`the calendar popover follows the theme under ${theme} (#888)`, async ({ page }) => {
    await forceTheme(page, theme);
    const dialog = await openCalendar(page);
    const expected = CALENDAR[theme];

    await expect(dialog).toHaveCSS('background-color', expected.surface);
    await expect(page.getByTestId('calendar-month')).toHaveCSS('color', expected.ink);
    await expect(dialog.locator('th').first()).toHaveCSS('color', expected.inkSoft);
    await expect(dialog.locator('p.text-riv-pop-ink-soft')).toHaveCSS('color', expected.inkSoft);

    // Skips this month's past cells, which wear the disabled ink the test below asserts.
    const free = dialog
      .locator('button[data-date][data-state="free"]:not([aria-disabled="true"])')
      .first();
    await expect(free).toHaveCSS('color', expected.ink);
    await expect(free).toHaveCSS('background-color', expected.freeFill);
    const bar = free.getByTestId('day-bar');
    await expect(bar).toHaveCSS('background-color', expected.barFill);
    await expect(bar.locator('..')).toHaveCSS('background-color', expected.barTrack);

    const chosen = dialog.locator('[role="gridcell"][aria-selected="true"] button');
    await expect(chosen).toHaveCSS('box-shadow', shadowIn(expected.selectedRing));

    // `next`, not `prev`: at the earliest month `prev` is aria-disabled, where the wash is off.
    const next = page.getByTestId('calendar-next');
    await expect(next).toHaveCSS('color', expected.accent);
    await next.hover();
    await expect(next).toHaveCSS('background-color', expected.hover);
  });

  /**
   * The calendar's disabled day ink: it needs a month whose earlier days are already past, which
   * the fixed clock above supplies, and the value is the theme's own.
   */
  test(`the calendar disables past days in the theme's weakened ink under ${theme} (#888)`, async ({
    page,
  }) => {
    await forceTheme(page, theme);
    const dialog = await openCalendar(page);
    const disabled = dialog.locator('button[data-date][aria-disabled="true"]').first();

    await expect(disabled).toBeVisible();
    await expect(disabled).toHaveCSS('color', CALENDAR[theme].inkDisabled);
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
 * The pointer-only reach of this state, made mechanical rather than asserted. `non-text-contrast.md`
 * rests part of the hover fill's 1.4.11 exemption on hover being unavailable to keyboard and touch
 * users, and in Tailwind v4 that is not a claim about pointer semantics but a compiled fact: the
 * variant emits `@media (hover: hover) { .hover\:bg-…:hover }`, so where the device reports no
 * hover capability the rule that paints this state never enters the cascade at all. The stylesheet
 * is the only place that is observable — the hovered box below runs in a desktop Chromium, which
 * reports `hover: hover` and therefore exercises the other branch.
 *
 * <p>Scoped to the `:hover` rule deliberately. A BARE `.bg-riv-console-btn-hover` rule also exists
 * and is not gated: Tailwind's extractor reads `bg-riv-console-btn-hover` out of the class string as
 * a candidate in its own right, so the utility is generated alongside the variant one. Nothing wears
 * it, and it paints no state — asserting over every rule mentioning the token would fail on that
 * artifact and prove nothing.
 */
test('compiles the state it paints behind a hover-capability query, which its 1.4.11 ground rests on (#887)', async ({
  page,
}) => {
  await page.goto('/');

  const conditions = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList, condition: string): void => {
      for (const rule of rules) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText.endsWith('bg-riv-console-btn-hover:hover')
        ) {
          found.push(condition);
        }
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested) walk(nested, rule instanceof CSSMediaRule ? rule.conditionText : condition);
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules, '');
    return found;
  });

  expect(conditions.length, 'the hover-variant rule is generated at all').toBe(1);
  expect(conditions[0].replaceAll(' ', '')).toContain('hover:hover');
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
