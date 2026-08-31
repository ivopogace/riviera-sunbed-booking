import { expect, type Page, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render audit of the availability calendar (#761) — the custom date picker that replaced the
 * venue page's native `<input type="date">`. The API is mocked via `page.route`, so this belongs to
 * the CI-safe suite (`playwright.a11y.config.ts`) alongside `venue-map-pan.e2e.ts`.
 *
 * <p>What only a real browser can prove, and so is what this spec is for: that the popover's
 * keyboard contract works against a real focus model (jsdom has none), that the day cells actually
 * measure 44px (a class list is not a box — `riviera-tailwind` rule 4), that the tints paint as
 * computed styles rather than as class names, and that axe is clean over the rendered surface once
 * its entrance animation has settled.
 */

const VENUE_ID = 4;

function venue(setCount = 12) {
  const sets = Array.from({ length: setCount }, (_unused, index) => ({
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
    name: 'Calendar Cove',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    description: 'A venue whose days differ, so the calendar has something to say.',
    ratingTenths: 45,
    reviewsCount: 88,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    sets,
  };
}

/**
 * Every day of the requested window, cycling free → low → full so all three tints are on screen.
 *
 * <p>The cycle is keyed to the **day of the month**, not to the day's position in the window, and
 * the tint assertions run on a month the spec has navigated **forward** to — where every day is
 * bookable. Keyed to window position and read on the opening month, the three states are only all
 * reachable while three or more selectable days remain: on the 29th/30th of any month one residue
 * has no bookable day left and the assertions fail. This suite runs on the real clock, so that is
 * a red CI on two days of every month rather than a flake.
 */
function calendarDays(from: string, to: string) {
  const cycle = [30, 4, 0];
  const days: { date: string; free: number; total: number }[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    days.push({ date: iso, free: cycle[(day.getUTCDate() - 1) % cycle.length], total: 30 });
    if (iso === to) break;
  }
  return days;
}

/** Every calendar window the page asked for, newest last — the re-fetch proof. */
const windows: string[] = [];

test.beforeEach(async ({ page }) => {
  windows.length = 0;
  // Pinned like the unit suite's clock, on the 30th — the shape that made this spec date-fragile.
  await page.clock.setFixedTime(new Date('2026-08-30T10:00:00Z'));
  await page.route(/\/api\/venues\/\d+\/availability-calendar\?.*$/, (route) => {
    const url = new URL(route.request().url());
    const from = url.searchParams.get('from')!;
    const to = url.searchParams.get('to')!;
    windows.push(`${from}..${to}`);
    return route.fulfill({ json: calendarDays(from, to) });
  });
  await page.route(/\/api\/venues\/\d+(\?.*)?$/, (route) => route.fulfill({ json: venue() }));
});

/** The picker trigger, and the day cell the roving tabindex currently sits on. */
function trigger(page: Page) {
  return page.getByTestId('map-date');
}

/**
 * Day cells, scoped to the popover on purpose: the trigger carries a `data-date` too, so an
 * unscoped `button[data-date="…"]` is a strict-mode violation whenever the two dates coincide.
 */
function dayCells(page: Page) {
  return page.locator('[data-testid="availability-calendar"] button[data-date]');
}

async function focusedDay(page: Page): Promise<string | null> {
  return dayCells(page).and(page.locator('[tabindex="0"]')).getAttribute('data-date');
}

async function openCalendar(page: Page) {
  await page.goto(`/venues/${VENUE_ID}`);
  await expect(page.getByRole('heading', { name: 'Calendar Cove' })).toBeVisible();
  await trigger(page).click();
  const dialog = page.getByTestId('availability-calendar');
  await expect(dialog).toBeVisible();
  await settle(page);
  return dialog;
}

test('opens on the map’s day, tints the month, and is clean to axe', async ({ page }) => {
  const dialog = await openCalendar(page);

  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  // A native <dialog> carries the role implicitly; assert through the role, not the attribute.
  await expect(dialog).toHaveJSProperty('tagName', 'DIALOG');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // A month with no past days: on the opening month the unbookable ones carry no tint.
  await page.getByTestId('calendar-next').click();
  await expect(page.locator('button[data-state="free"]').first()).toBeVisible();
  await settle(page);

  // The counts reach the accessible name as integers, which is what a screen reader gets (#761).
  await expect(page.locator('button[data-state="free"]').first()).toHaveAttribute(
    'aria-label',
    /, 30 of 30 sets free$/,
  );
  await expect(page.locator('button[data-state="low"]').first()).toHaveAttribute(
    'aria-label',
    /, 4 of 30 sets free$/,
  );
  await expect(page.locator('button[data-state="full"]').first()).toHaveAttribute(
    'aria-label',
    /, no sets free$/,
  );

  // Computed styles, not class lists — the tints must actually paint, and differ from each other.
  const fills = await Promise.all(
    ['free', 'low', 'full'].map((state) =>
      page
        .locator(`button[data-state="${state}"]`)
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ),
  );
  expect(new Set(fills).size).toBe(3);
  for (const fill of fills) {
    expect(fill).not.toBe('rgba(0, 0, 0, 0)');
  }

  await expectNoSeriousAxeViolations(page, 'venue map with the availability calendar open');
});

/**
 * The popover is `position: fixed`, and the venue header it is triggered from carries
 * `backdrop-filter` + `overflow: hidden` — which would make that header its containing block and
 * clip it (Filter Effects L2). The repo has shipped this bug once already, in #134, where the same
 * property on the site header trapped the shell menus' fixed backdrops. So the pin is a measurement,
 * not a class check: the overlay must cover the viewport, and a click on the map far below the
 * header must reach the backdrop and dismiss.
 */
test('the overlay escapes the glass header — it covers the viewport and dismisses from anywhere', async ({
  page,
}) => {
  await openCalendar(page);

  const viewport = page.viewportSize()!;
  const host = (await page.locator('app-availability-calendar').boundingBox())!;
  expect(host.x).toBe(0);
  expect(host.y).toBe(0);
  expect(host.width).toBe(viewport.width);
  expect(host.height).toBe(viewport.height);

  // And the PANEL is centred: a host-only assertion passed while the panel sat at the left edge.
  const panel = (await page.getByTestId('availability-calendar').boundingBox())!;
  expect(panel.x).toBeCloseTo((viewport.width - panel.width) / 2, 0);
  expect(panel.x).toBeGreaterThan(16);

  // Bottom-left of the viewport is well outside the header; the backdrop has to own that point.
  await page.mouse.click(8, viewport.height - 8);
  await expect(page.getByTestId('availability-calendar')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});

test('navigating a month refetches, and every window stays inside the 62-day cap', async ({
  page,
}) => {
  await openCalendar(page);
  const opened = windows.length;

  await page.getByTestId('calendar-next').click();
  await expect.poll(() => windows.length).toBe(opened + 1);

  await page.getByTestId('calendar-prev').click();
  await expect.poll(() => windows.length).toBe(opened + 2);

  for (const window of windows) {
    const [from, to] = window.split('..');
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThanOrEqual(62);
  }
});

test('choosing a day closes the calendar and re-fetches the map for it', async ({ page }) => {
  await openCalendar(page);
  await page.getByTestId('calendar-next').click();
  await expect
    .poll(async () => (await focusedDay(page))?.slice(0, 7))
    .not.toBe((await trigger(page).getAttribute('data-date'))?.slice(0, 7));

  const chosen = (await focusedDay(page))!;
  const mapRequest = page.waitForRequest(
    (request) =>
      request.url().includes(`/api/venues/${VENUE_ID}?`) && request.url().includes(chosen),
  );
  await dayCells(page)
    .and(page.locator(`[data-date="${chosen}"]`))
    .click();

  await mapRequest;
  await expect(page.getByTestId('availability-calendar')).toHaveCount(0);
  await expect(trigger(page)).toHaveAttribute('data-date', chosen);
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger(page)).toBeFocused();
});

test('keeps focus on the month-nav button so a second press steps a second month', async ({
  page,
}) => {
  await openCalendar(page);
  const next = page.getByTestId('calendar-next');
  await next.focus();
  const first = (await page.getByTestId('calendar-month').textContent())!;

  await next.press('Enter');
  await expect.poll(() => page.getByTestId('calendar-month').textContent()).not.toBe(first);
  await expect(next).toBeFocused();

  const second = (await page.getByTestId('calendar-month').textContent())!;
  await next.press('Enter');
  await expect.poll(() => page.getByTestId('calendar-month').textContent()).not.toBe(second);
  await expect(next).toBeFocused();
});

test('is fully operable from the keyboard, and Escape returns focus to the trigger', async ({
  page,
}) => {
  await openCalendar(page);
  const start = (await focusedDay(page))!;

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => focusedDay(page)).toBe(shift(start, 1));

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focusedDay(page)).toBe(shift(start, 8));

  await page.keyboard.press('Home');
  await expect
    .poll(async () => new Date(`${await focusedDay(page)}T00:00:00Z`).getUTCDay())
    .toBe(1); // Monday, the week's first day

  const beforePageDown = (await focusedDay(page))!;
  await page.keyboard.press('PageDown');
  await expect
    .poll(async () => (await focusedDay(page))!.slice(0, 7))
    .not.toBe(beforePageDown.slice(0, 7));

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('availability-calendar')).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});

test('keeps focus inside the popover when Tab reaches its end', async ({ page }) => {
  await openCalendar(page);

  for (let press = 0; press < 6; press++) {
    await page.keyboard.press('Tab');
    // Boolean(), not `!== null`: the optional chain yields undefined when focus is nowhere.
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="availability-calendar"]')),
    );
    expect(inside, `focus escaped the dialog after ${press + 1} Tab press(es)`).toBe(true);
  }
});

test('every day cell meets the 44px touch-target floor at a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendar(page);

  const cells = dayCells(page);
  const count = await cells.count();
  expect(count).toBeGreaterThan(27);

  for (let index = 0; index < count; index++) {
    const box = (await cells.nth(index).boundingBox())!;
    expect(box.width, `day cell ${index} is too narrow`).toBeGreaterThanOrEqual(44);
    expect(box.height, `day cell ${index} is too short`).toBeGreaterThanOrEqual(44);
  }

  // The popover must not force the page to scroll sideways on a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('stays a usable picker when the counts cannot be loaded', async ({ page }) => {
  await page.route(/\/api\/venues\/\d+\/availability-calendar\?.*$/, (route) =>
    route.fulfill({ status: 500, body: 'boom' }),
  );
  await page.goto(`/venues/${VENUE_ID}`);
  await expect(page.getByRole('heading', { name: 'Calendar Cove' })).toBeVisible();
  await trigger(page).click();

  await expect(page.getByTestId('calendar-counts-failed')).toBeVisible();
  const chosen = (await focusedDay(page))!;
  await dayCells(page)
    .and(page.locator(`[data-date="${chosen}"]`))
    .click();

  await expect(page.getByTestId('availability-calendar')).toHaveCount(0);
  await expect(trigger(page)).toHaveAttribute('data-date', chosen);
});

/** Shift an ISO civil day by `days`, mirroring `shared/booking-date.ts` without importing it. */
function shift(isoDate: string, days: number): string {
  const day = new Date(`${isoDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
