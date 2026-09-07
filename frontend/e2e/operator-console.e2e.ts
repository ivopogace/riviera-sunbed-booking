import { expect, test } from '@playwright/test';

import { mockOwnedVenues } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import { expectPhoneRailFits, openMoreSheet, openOperatorAccountMenu } from './support/shell';

/**
 * Real-render CI-safe e2e for the operator console shell. Drives
 * the sign-in gate → porcelain shell → tab switching → sign-out lifecycle, the reload-survival of the
 * session, the always-porcelain theme override, and a narrow-viewport responsive tab row — with the
 * API mocked via `page.route` (no backend, like the sibling a11y specs). Axe runs on the signed-out
 * gate and the signed-in shell (real colour contrast over the porcelain surfaces).
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

function seat(id: number, availability: 'FREE' | 'TAKEN', pool: 'ONLINE' | 'WALK_IN' = 'ONLINE') {
  return {
    id,
    rowLabel: 'A',
    positionNo: id,
    tier: 'STANDARD',
    pool,
    price: { minorUnits: 4000, currency: 'EUR' },
    gridX: id,
    gridY: 0,
    availability,
  };
}

const VENUE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  ratingTenths: 48,
  reviewsCount: 12,
  bookingMode: 'INSTANT',
  fromPrice: null,
  // 5 sets, 2 free / 3 taken — the stats strip's "Free today 2 / 5" tile.
  sets: [
    seat(1, 'FREE'),
    seat(2, 'FREE'),
    seat(3, 'TAKEN'),
    seat(4, 'TAKEN'),
    seat(5, 'TAKEN', 'WALK_IN'),
  ],
};

/** The operator's own venues as `GET /api/venues/mine` lists them: one by default, so the header
 *  renders the name as plain text; two for the switcher cases. */
const OWNED_ONE = [{ id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' }];
const OWNED_TWO = [...OWNED_ONE, { id: 2, name: 'Sereno', beach: 'Jal' }];

/** Venue 2 — 3 sets, 1 free — so every venue-scoped surface reads differently from venue 1. */
const SECOND_VENUE_MAP = {
  ...VENUE_MAP,
  id: 2,
  name: 'Sereno',
  beach: 'Jal',
  sets: [seat(1, 'FREE'), seat(2, 'TAKEN'), seat(3, 'TAKEN')],
};

// The daily online-takings figure the strip renders (gross + server-computed net after commission).
const TAKINGS = {
  gross: { minorUnits: 11000, currency: 'EUR' },
  net: { minorUnits: 9350, currency: 'EUR' },
  commissionBps: 1500,
  date: '2026-07-08',
};

// Pin the OS scheme to dark so the tourist shell boots the dark theme deterministically —
// letting the porcelain-override assertion be meaningful (headless defaults to light → porcelain).
test.use({ colorScheme: 'dark' });

/**
 * Mock the console's endpoints with a stateful session: GET /me is 401 until a login POST flips it,
 * so a reload after signing in restores the session (as the real HttpOnly cookie would); logout flips
 * it back. The venue-title + Requests-badge reads are stubbed too.
 */
async function mockConsole(
  page: import('@playwright/test').Page,
  pending = 0,
  booked = 0,
  heldStates: { setId: number; state: string }[] = [],
): Promise<void> {
  let sessionLive = false;
  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: PRINCIPAL });
  });
  await page.route(/\/api\/auth\/logout$/, (route) => {
    sessionLive = false;
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) => route.fulfill({ json: VENUE_MAP }));
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: Array.from({ length: pending }, (_, i) => ({ bookingId: i + 1 })) }),
  );
  // The stats strip's three reads: confirmed bookings, takings, availability states.
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) =>
    route.fulfill({
      json: Array.from({ length: booked }, (_, i) => ({ setId: i + 1, code: 'X' })),
    }),
  );
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({ json: TAKINGS }),
  );
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: heldStates }),
  );
  await mockOwnedVenues(page, OWNED_ONE);
}

/** Venue 2's five console reads, for the switch case: one pending request, nothing booked. */
async function mockSecondVenue(page: import('@playwright/test').Page): Promise<void> {
  await page.route(/\/api\/venues\/2(\?.*)?$/, (route) =>
    route.fulfill({ json: SECOND_VENUE_MAP }),
  );
  await page.route(/\/api\/venues\/2\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [{ bookingId: 21 }] }),
  );
  await page.route(/\/api\/venues\/2\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/2\/takings(\?.*)?$/, (route) =>
    route.fulfill({ json: TAKINGS }),
  );
  await page.route(/\/api\/venues\/2\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
}

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
}

test('signs in, renders the console, switches tabs, and signs out (+ axe)', async ({ page }) => {
  await mockConsole(page, 3);
  await page.goto('/operator/1');

  // Signed out: the guard redirects to the unified auth card's operator tab, never the shell.
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator&returnUrl=/);
  await expect(page.getByTestId('auth-form')).toBeVisible();
  await expect(page.getByTestId('oc-header')).toHaveCount(0);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'unified auth card (operator redirect)');

  // Sign in → the porcelain shell, with the venue title and a Requests badge of 3.
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('oc-venue-title')).toContainText('Miramar Beach Club');
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('3');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console shell');

  // Default tab is Beach map; the layout editor renders (not a placeholder). It reads :venueId
  // from the PARENT route (child routes don't inherit it) — a real browser exercises that
  // inheritance, which a mocked ActivatedRoute unit spec can't; the editor loads the
  // venue map for that id and seeds its grid.
  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // Switching to Daily view updates the URL and the active tab, rendering the daily view tab
  // (not a placeholder). It reads :venueId from the PARENT route (child routes don't inherit it) —
  // a real browser exercises that inheritance, which a mocked ActivatedRoute unit spec can't.
  const tabs = page.getByTestId('oc-tabs');
  await tabs.getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(tabs.getByRole('link', { name: 'Daily view' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();

  // Sign out → the console leaves for the unified auth card (the guard gates on activation).
  await openOperatorAccountMenu(page);
  await page.getByTestId('oc-signout').click();
  await expect(page).toHaveURL(/\/account\/sign-in\?audience=operator$/);
  await expect(page.getByTestId('auth-form')).toBeVisible();
  await expect(page.getByTestId('oc-header')).toHaveCount(0);
});

test('shows the stats strip with live free/total, walk-ins and takings, across a tab switch (#171)', async ({
  page,
}) => {
  await mockConsole(page, 0, 2, [
    { setId: 3, state: 'BOOKED_ONLINE' },
    { setId: 4, state: 'BOOKED_ONLINE' },
    { setId: 5, state: 'STAFF_MARKED' },
  ]); // 2 confirmed online bookings today
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  // Four live tiles: 5 sets (2 free), 2 booked, 1 STAFF_MARKED, €110 gross / €93.50 net.
  await expect(page.getByTestId('oc-stat-free')).toHaveText(/2\s*\/\s*5/);
  await expect(page.getByTestId('oc-stat-booked')).toHaveText('2');
  await expect(page.getByTestId('oc-stat-walkins')).toHaveText('1');
  await expect(page.getByTestId('oc-stat-takings')).toHaveText('€110');
  await expect(page.getByTestId('oc-stat-net')).toContainText('€93.50 after 15% commission');

  // The strip lives in the shell, not a tab — it survives a tab switch.
  await page.getByTestId('oc-tabs').getByRole('link', { name: 'Daily view' }).click();
  await expect(page).toHaveURL(/\/operator\/1\/daily/);
  await expect(page.getByTestId('oc-stat-takings')).toHaveText('€110');

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with stats strip');
});

test('keeps the operator signed in across a reload (session restored from /me)', async ({
  page,
}) => {
  await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  await page.reload();
  // /me returns the principal → the guard awaits the restore instead of bouncing us to sign-in.
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page).toHaveURL(/\/operator\/1/);
});

/**
 * Below `sm` the text rail gives way to the phone rail: Daily · Requests · Beach map and a More
 * slot that names the current secondary and carries its `aria-current`, so the current page is
 * never hidden inside a closed menu. The console stays porcelain over a dark tourist theme there
 * too. From `sm` up the six-tab rail returns (its scrolling-row shape is pinned at 640px in
 * `admin-console-tabs.e2e.ts`, the same rail primitive).
 */
test('below sm the phone rail replaces the tab rail: four slots on one row, More reads the current secondary (#1012)', async ({
  page,
}) => {
  await mockConsole(page, 2);

  // Establish the dark tourist theme first.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1/daily');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();

  // The console is always porcelain (the app shell pins its host); the document theme stays dark.
  await expect(page.locator('app-root')).toHaveAttribute('data-riv-theme', 'porcelain');
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

  await expectPhoneRailFits(page, 'Operator console sections (phone)');
  const rail = page.getByRole('navigation', { name: 'Operator console sections (phone)' });
  await expect(page.getByTestId('oc-tabs')).toBeHidden();
  await expect(rail.getByRole('link')).toHaveText([/^Daily$/, /^Requests/, /^Beach map$/]);
  await expect(rail.getByRole('link', { name: 'Daily' })).toHaveAttribute('aria-current', 'page');
  await expect(rail.getByRole('link', { name: /Requests/ })).toContainText('2');
  await expect(page.getByTestId('oc-phone-requests-badge')).toHaveText('2');
  const more = page.getByTestId('oc-more');
  await expect(more).toHaveAccessibleName('More');
  await expect(more).not.toHaveAttribute('aria-current', 'page');
  await expect(more).toHaveCSS('position', 'relative');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with the phone rail');

  // A secondary page: the fourth slot wears its glyph, label and the current mark.
  await page.goto('/operator/1/payouts');
  await expect(page.getByTestId('payouts-tab')).toBeVisible();
  await expect(more).toHaveAccessibleName('Payouts');
  await expect(more).toHaveAttribute('aria-current', 'page');
  await expect(rail.getByRole('link', { name: 'Daily' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );

  // The sheet: the secondaries grouped, the current row marked, no cross-console row for a non-admin.
  await openMoreSheet(page);
  const sheet = page.getByTestId('oc-more-sheet');
  await expect(sheet.locator('p')).toHaveText(['Set-up', 'Money']);
  await expect(sheet.getByRole('link')).toHaveCount(3);
  await expect(sheet.getByRole('link', { name: /^Payouts/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(sheet.getByRole('link', { name: /Admin console/ })).toHaveCount(0);
  await expect(sheet.getByRole('link').first()).toBeFocused();
  const sheetBox = (await sheet.boundingBox())!;
  expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(780);
  expect(sheetBox.x).toBeGreaterThanOrEqual(0);
  expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(390);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with the More sheet open');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();

  // From sm up the reverse: the six-tab rail, no phone rail.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(rail).toBeHidden();
  await expect(page.getByTestId('oc-tabs')).toBeVisible();
  await expect(page.getByTestId('oc-tabs').getByRole('link')).toHaveCount(6);
  await expect(page.getByTestId('oc-tabs').getByRole('link', { name: 'Payouts' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('Ctrl-K: typing a venue name leaves its row, Enter opens that venue on the current tab (#1013)', async ({
  page,
}) => {
  await mockConsole(page, 2);
  await mockSecondVenue(page);
  await mockOwnedVenues(page, [...OWNED_ONE, { id: 2, name: 'Aurora Bay', beach: 'Dhërmi' }]);
  await page.goto('/operator/1/daily');
  await signIn(page);
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Go to' });
  await expect(dialog).toBeVisible();
  const field = page.getByTestId('oc-palette-search');
  await expect(field).toBeFocused();
  // The Requests row carries the live count; the venue rows keep the open tab.
  await expect(dialog.getByRole('link', { name: /^Requests/ })).toContainText('2');
  await expect(dialog.getByRole('link', { name: /Aurora Bay/ })).toHaveAttribute(
    'href',
    '/operator/2/daily',
  );

  await field.fill('aurora');
  const rows = dialog.getByRole('link');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Aurora Bay');
  await expect(rows.first()).toContainText('Open Dhërmi');
  await expect(rows.first()).toHaveAttribute('data-hit', '');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/operator\/2\/daily/);
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();
});

test('the account chip opens a popover on the console — axe clean, one header row on a phone (#1008)', async ({
  page,
}) => {
  await mockConsole(page, 0);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1/daily');
  await signIn(page);
  await expect(page.getByTestId('oc-header')).toBeVisible();

  // One row: the brand and the chip share it, and nothing in the bar reads "Signed in as".
  const brand = (await page.getByTestId('oc-venue-title').boundingBox())!;
  const chip = page.getByTestId('oc-account');
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.y).toBeLessThan(brand.y + brand.height);
  expect(chipBox.y + chipBox.height).toBeGreaterThan(brand.y);
  // A second row would add at least the chip's 44px floor; one row with its padding stays under 80.
  const header = (await page.getByTestId('oc-header').boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(80);
  await expect(page.getByTestId('oc-header')).not.toContainText('Signed in as');
  await expect(chip).toHaveAccessibleName('Account: operator');

  await openOperatorAccountMenu(page);
  await expect(page.getByTestId('oc-account-identity')).toContainText('Signed in as operator');
  await expect(page.getByTestId('oc-account-menu').getByRole('link')).toHaveText([
    'Change password',
  ]);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with the account popover open');

  // Escape closes it and hands focus back to the chip.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('oc-account-menu')).toHaveCount(0);
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await expect(chip).toBeFocused();

  // A click on the page below the header closes it too — the backdrop covers the header only.
  await openOperatorAccountMenu(page);
  await page.getByTestId('daily-view-tab').click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('oc-account-menu')).toHaveCount(0);
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
});

/**
 * One shell, one sticky row: the section row is the only `position: sticky` chrome — the rail and
 * the stats strip scroll with the page — and below `sm` it slides away on scroll-down past 64px
 * and returns on scroll-up, with no transition under reduced motion; from `sm` up it never moves.
 */
test('only the section row is sticky; below sm it slides away on scroll-down and returns on scroll-up (#1011)', async ({
  page,
}) => {
  await mockConsole(page, 3);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1/daily');
  await signIn(page);
  const header = page.getByTestId('oc-header');
  await expect(header).toBeVisible();
  await expect(page.getByTestId('daily-view-tab')).toBeVisible();

  await expect(header).toHaveCSS('position', 'sticky');
  // The slide animates the `translate` property the utility sets — a transition on `transform` would never fire.
  await expect(header).toHaveCSS('transition-property', 'translate');
  await expect(page.getByTestId('oc-phone-rail')).toHaveCSS('position', 'static');
  await expect(page.getByTestId('oc-stats')).toHaveCSS('position', 'static');

  // A page tall enough to scroll, whatever the tab renders.
  await page.evaluate(() => (document.body.style.minHeight = '3000px'));
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect
    .poll(async () => {
      const box = (await header.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 150));
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);

  // Under reduced motion the row still hides and shows, only without the slide.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(header).toHaveCSS('transition-property', 'none');
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(async () => (await header.boundingBox())!.y).toBeLessThan(0);
  await page.emulateMedia({ reducedMotion: null });

  // From sm up the row stays put on scroll-down.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
});

/**
 * The venue switcher over the real routes: a deep-linked console loads the owned list
 * itself (the landing is never visited, and the sign-in page skips the read when a `returnUrl` is
 * set), the name is the control for a
 * two-venue operator, a switch keeps the open tab and re-reads every venue-scoped surface for the
 * new venue (invariant #13 — nothing of venue 1 stays on screen), the popover closes with focus
 * back on the name, and at a Fold cover width the open popover never pushes the page wider.
 */
test('switches venue from the header, keeping the tab and leaving nothing of the old venue (#1009)', async ({
  page,
}) => {
  await mockConsole(page, 3);
  await mockOwnedVenues(page, OWNED_TWO);
  await mockSecondVenue(page);

  // Deep link: the guard's returnUrl round trip lands straight on the console.
  await page.goto('/operator/1/daily');
  await signIn(page);
  await expect(page).toHaveURL(/\/operator\/1\/daily$/);
  const name = page.getByTestId('oc-venue-title');
  await expect(name).toHaveText(/Miramar Beach Club/);
  await expect(name).toHaveAttribute('aria-haspopup', 'true');
  await expect(name).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('3');
  await expect(page.getByTestId('oc-stat-free')).toHaveText(/2\s*\/\s*5/);
  await expect(page.getByTestId('daily-tile')).toHaveCount(5);

  // The popover: Your venues, the current row marked, every row on the SAME tab, the foot row.
  await name.click();
  await expect(name).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByTestId('oc-venue-menu');
  await expect(menu).toContainText('Your venues');
  const rows = menu.getByRole('link');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('href', '/operator/1/daily');
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'page');
  await expect(rows.nth(1)).toHaveAttribute('href', '/operator/2/daily');
  await expect(rows.nth(1)).not.toHaveAttribute('aria-current', 'page');
  await expect(rows.nth(1)).toContainText('Sereno');
  await expect(rows.nth(1)).toContainText('Jal');
  await expect(page.getByTestId('oc-venue-add')).toHaveAttribute('href', '/operator?create=1');
  // Anchored to the header row: its left edge is the brand's, not the name's, and it hangs under the row.
  await settle(page);
  const brand = (await page.locator('.oc-wordmark').boundingBox())!;
  const headerBox = (await page.getByTestId('oc-header').boundingBox())!;
  const popover = (await menu.boundingBox())!;
  expect(Math.abs(popover.x - brand.x)).toBeLessThanOrEqual(2);
  expect(popover.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(popover.y).toBeLessThanOrEqual(headerBox.y + headerBox.height + 12);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'operator console with the venue popover open');

  // Escape closes it and hands focus back to the name.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(name).toHaveAttribute('aria-expanded', 'false');
  await expect(name).toBeFocused();

  // Choose venue 2: same tab, the shell re-reads title, strip, badge and the tab's own grid.
  await name.click();
  await rows.nth(1).click();
  await expect(page).toHaveURL(/\/operator\/2\/daily$/);
  await expect(menu).toHaveCount(0);
  await expect(name).toHaveText(/Sereno/);
  await expect(name).toBeFocused();
  await expect(page.getByTestId('oc-requests-badge')).toHaveText('1');
  await expect(page.getByTestId('oc-stat-free')).toHaveText(/1\s*\/\s*3/);
  await expect(page.getByTestId('daily-tile')).toHaveCount(3);
  const tabs = page.getByTestId('oc-tabs');
  await expect(tabs.getByRole('link', { name: 'Daily view' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(tabs.locator('a[href^="/operator/1/"]')).toHaveCount(0);
  await expect(tabs.locator('a[href^="/operator/2/"]')).toHaveCount(6);
  await name.click();
  await expect(menu.locator('[aria-current="page"]')).toHaveAttribute('href', '/operator/2/daily');
  await page.keyboard.press('Escape');

  // A reload on the deep link: the restored session populates the switcher again.
  await page.reload();
  await expect(page.getByTestId('oc-header')).toBeVisible();
  await expect(name).toHaveAttribute('aria-haspopup', 'true');
  await name.click();
  await expect(rows).toHaveCount(3);
  await page.keyboard.press('Escape');

  // Galaxy Z Fold 5 cover width: the open popover stays inside the viewport.
  await page.setViewportSize({ width: 344, height: 780 });
  await name.click();
  await expect(menu).toBeVisible();
  const narrow = (await menu.boundingBox())!;
  expect(narrow.x).toBeGreaterThanOrEqual(0);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(344);
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);
});
