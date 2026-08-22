import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for the layout editor. Drives the actual generate → confirm →
 * paint → save flow on the default beach-map tab, asserting the single bulk PUT payload, the
 * server-locked (`LAYOUT_IN_USE`) path, and the stale-write conflict (409 STALE_WRITE keeps the
 * painted grid + offers Reload — co-located here as the venue tab does in operator-venue.e2e.ts). It
 * also parks the map GET open to drive the tab's in-flight window on both surfaces, the one state
 * jsdom cannot show as a real mount. API mocked via `page.route` (no backend), axe over the editor —
 * never over the skeleton, whose `animate-pulse` never finishes and would hang the suite's
 * `getAnimations().finished` wait.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

// An empty venue so the editor starts from the empty state — the operator generates the grid (no
// seed→fill race), then regenerates over it to reach the confirm.
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
  sets: [],
};

test.use({ colorScheme: 'dark' });

/**
 * Session + reads mock; `puts` collects the layout PUT payloads; `lock` makes that PUT 409 LAYOUT_IN_USE.
 * STATEFUL on the `setVersion`: the map GET hands out the current token, the PUT enforces it (a
 * mismatch is 409 STALE_WRITE) and bumps it on success. `bump()` simulates a concurrent writer moving the
 * layout on behind the tab's back, so a subsequent stale save is genuinely rejected.
 */
async function mockEditor(
  page: Page,
  lock = false,
  seededSets: typeof VENUE_MAP.sets = [],
): Promise<{
  puts: Request[];
  renames: Request[];
  bump: () => void;
  holdMap: () => void;
  releaseMap: () => void;
}> {
  const puts: Request[] = [];
  const renames: Request[] = [];
  let sessionLive = false;
  let serverSetVersion = 0;
  const bump = () => {
    serverSetVersion += 1;
  };
  // The map GET, parked open on demand — the in-flight window #721 is about, held until released.
  let mapGate: Promise<void> | undefined;
  let openMapGate: (() => void) | undefined;
  const holdMap = () => {
    mapGate = new Promise<void>((resolve) => (openMapGate = resolve));
  };
  const releaseMap = () => {
    openMapGate?.();
    mapGate = undefined;
  };
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
  // Captures the PUT; locked → 409 LAYOUT_IN_USE; stale expectedVersion → 409 STALE_WRITE; match → 204 + bump.
  await page.route(/\/api\/venues\/1\/beach-map$/, (route) => {
    puts.push(route.request());
    if (lock) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        // A sentinel absent from the client copy, so the assertions prove the CLIENT mapped the code.
        json: { code: 'LAYOUT_IN_USE', detail: 'in use' },
      });
    }
    const body = route.request().postDataJSON() as { expectedVersion?: number };
    if (body.expectedVersion !== serverSetVersion) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'STALE_WRITE', detail: '' },
      });
    }
    serverSetVersion += 1;
    return route.fulfill({ status: 204, body: '' });
  });
  // The venue map (editor seed + shell header/stats) — carries the current setVersion; GET only, kept
  // below the PUT route.
  await page.route(/\/api\/venues\/1(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fallback();
    }
    await mapGate;
    return route.fulfill({
      json: { ...VENUE_MAP, sets: seededSets, setVersion: serverSetVersion },
    });
  });
  // The per-row rename: enforces the same setVersion token the bulk PUT does, and bumps it on success.
  await page.route(/\/api\/venues\/1\/rows\/[^/]+\/name$/, (route) => {
    renames.push(route.request());
    const body = route.request().postDataJSON() as { expectedVersion?: number };
    if (body.expectedVersion !== serverSetVersion) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'STALE_WRITE', detail: '' },
      });
    }
    serverSetVersion += 1;
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        gross: { minorUnits: 0, currency: 'EUR' },
        net: { minorUnits: 0, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-08',
      },
    }),
  );
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  return { puts, renames, bump, holdMap, releaseMap };
}

async function signIn(page: Page): Promise<void> {
  // The guard sends us to the unified card's operator tab; returnUrl brings us back.
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
}

test('generates a grid, paints a walk-in set, and saves the whole layout in one PUT (+ axe)', async ({
  page,
}) => {
  const { puts } = await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page);

  // Default tab is the layout editor; the empty venue shows the empty state until we generate.
  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  await expect(page.getByTestId('layout-editor')).toBeVisible();
  await expect(page.getByTestId('layout-empty')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor');

  // Generate a 2×3 grid in one action (no confirm — the venue has no layout yet).
  await page.getByTestId('layout-gen-rows').fill('2');
  await page.getByTestId('layout-gen-cols').fill('3');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(6);

  // Paint the first cell walk-in (select the tool, then click the cell — the keyboard/click path).
  await page.getByTestId('layout-tool-walkin').click();
  await page.getByTestId('layout-cell').first().click();
  await expect(page.getByTestId('layout-cell').first()).toHaveAttribute('data-state', 'walkin');
  await expect(page.getByTestId('layout-count-walkin')).toHaveText('1');

  // #701's legend slot is empty here, so `:empty` must give its band no box at all.
  await expect(page.getByRole('list', { name: 'Legend' })).toHaveCount(1); // the editor's own
  const bandDisplay = await page
    .getByTestId('legend-band')
    .evaluate((el) => getComputedStyle(el).display);
  expect(bandDisplay).toBe('none');
  const banner = (await page.locator('.sea-banner').boundingBox())!;
  const wash = (await page.locator('[data-riv-scroller]').first().boundingBox())!;
  expect(wash.y).toBeCloseTo(banner.y + banner.height, 0);

  // Save → exactly one PUT carrying all six sets, one of them WALK_IN, plus the loaded setVersion token.
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
  expect(puts).toHaveLength(1);
  const body = puts[0].postDataJSON() as { sets: { pool: string }[]; expectedVersion: number };
  expect(body.sets).toHaveLength(6);
  expect(body.sets.filter((s) => s.pool === 'WALK_IN')).toHaveLength(1);
  expect(body.expectedVersion).toBe(0); // the setVersion loaded from the map read
});

test('names a row, saves the venue’s words, and blocks duplicate names before any PUT (#723)', async ({
  page,
}) => {
  const { puts } = await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page);

  await page.getByTestId('layout-gen-rows').fill('2');
  await page.getByTestId('layout-gen-cols').fill('2');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(4);

  // One input per row, defaulting to the derived grid letter.
  const names = page.getByTestId('layout-row-name');
  await expect(names).toHaveCount(2);
  await expect(names.first()).toHaveValue('A');

  // Two rows sharing a (trimmed) name surface the clash and hold the save — no PUT leaves the tab.
  await names.first().fill('Under the pines');
  await names.nth(1).fill(' Under the pines ');
  await expect(page.getByTestId('layout-row-name-error')).toBeVisible();
  await page.getByTestId('layout-save').click();
  expect(puts).toHaveLength(0);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor row names');

  // Blanking the second row clears the clash (it falls back to its letter) and the save goes through.
  await names.nth(1).fill('');
  await expect(page.getByTestId('layout-row-name-error')).toHaveCount(0);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
  expect(puts).toHaveLength(1);
  const body = puts[0].postDataJSON() as { sets: { rowLabel: string }[] };
  expect(body.sets.map((s) => s.rowLabel)).toEqual([
    'Under the pines',
    'Under the pines',
    'B',
    'B',
  ]);
});

/** Two saved rows on a trading venue — the shape the bulk save can no longer touch. */
const SEEDED_SETS = [
  {
    id: 1,
    rowLabel: 'A',
    positionNo: 1,
    tier: 'PREMIUM',
    pool: 'ONLINE',
    price: { minorUnits: 3500, currency: 'EUR' },
    gridX: 1,
    gridY: 1,
    available: true,
  },
  {
    id: 2,
    rowLabel: 'B',
    positionNo: 1,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 2000, currency: 'EUR' },
    gridX: 1,
    gridY: 2,
    available: true,
  },
];

test('holds both surfaces until the map read settles (#721)', async ({ page }) => {
  const { holdMap, releaseMap } = await mockEditor(page, false, SEEDED_SETS);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('set-editor')).toBeVisible();

  // Leave and re-enter the tab with its map GET parked: every mount pays an uncached read.
  const tabs = page.getByTestId('oc-tabs');
  await tabs.getByRole('link', { name: 'Daily view' }).click();
  await expect(page.getByTestId('layout-editor')).toHaveCount(0);
  holdMap();
  await tabs.getByRole('link', { name: 'Beach map' }).click();

  // Bulk is the mode the tab opens in during the window, so Generate is one click from the layout.
  const generate = page.getByTestId('layout-generate');
  // aria-disabled, never [disabled] — a disabled button blurs to <body> the instant it flips (#616).
  await expect(generate).toHaveAttribute('aria-disabled', 'true');
  expect(await generate.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);
  await expect(generate).toHaveText(/Loading the current layout/);

  await page.getByTestId('layout-mode-sets').click();
  // The words live in the persistent announcer now; the skeleton beside it is decoration (#741).
  await expect(page.getByTestId('load-announcer')).toHaveText('Loading this venue’s sets…');
  await expect(page.getByTestId('set-loading')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.getByTestId('set-skeleton-tile').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('set-cell')).toHaveCount(0);
  await expect(page.getByTestId('set-panel-no-sets')).toHaveCount(0);

  releaseMap();

  // The venue's real map arrives with no further interaction, and the skeleton leaves with it.
  await expect(page.getByTestId('set-cell')).toHaveCount(2);
  await expect(page.getByTestId('set-skeleton-tile')).toHaveCount(0);
  await expect(page.getByTestId('set-loading')).toHaveCount(0);

  // And the destructive path the window bypassed now asks first.
  await page.getByTestId('layout-mode-bulk').click();
  await expect(generate).not.toHaveAttribute('aria-disabled', 'true');
  await generate.click();
  await expect(page.getByTestId('layout-confirm-regen')).toBeVisible();
});

test('renames a row on a venue whose bulk save is locked (#726)', async ({ page }) => {
  const { puts, renames } = await mockEditor(page, true, SEEDED_SETS);
  await page.goto('/operator/1');
  await signIn(page);

  // A saved venue opens in per-set mode; reaching the bulk surface is free, only its SAVE is refused.
  await page.getByTestId('layout-mode-bulk').click();
  await expect(page.getByTestId('layout-row-name')).toHaveCount(2);

  // The whole-layout save really is locked, which is the situation #726 exists for.
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-error')).toBeVisible();
  expect(puts).toHaveLength(1);

  // The per-row rename still goes through, on its own PUT.
  await page.getByTestId('layout-row-name').nth(1).fill('Back row');
  await page.getByTestId('layout-row-name-save').nth(1).click();
  await expect(page.getByTestId('layout-row-name-saved')).toBeVisible();

  expect(renames).toHaveLength(1);
  expect(new URL(renames[0].url()).pathname).toBe('/api/venues/1/rows/B/name');
  expect(renames[0].postDataJSON()).toEqual({ newLabel: 'Back row', expectedVersion: 0 });
  expect(puts).toHaveLength(1); // the bulk layout PUT was not re-sent

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor row rename');
});

test('drag-painting across cells paints them and never pans the overflowing grid (#672 slice 2)', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page);

  // 20 columns overflow the console viewport, so a pan WOULD move if drag-pan were on.
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('20');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(20);
  await expect
    .poll(() => page.getByTestId('layout-grid').evaluate((el) => el.scrollWidth > el.clientWidth))
    .toBe(true);

  // Raw mouse primitives don't auto-scroll like click() — center the grid clear of the sticky header.
  await page.getByTestId('layout-tool-walkin').click();
  await page
    .getByTestId('layout-cell')
    .nth(0)
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const from = (await page.getByTestId('layout-cell').nth(0).boundingBox())!;
  const to = (await page.getByTestId('layout-cell').nth(2).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();

  for (const i of [0, 1, 2]) {
    await expect(page.getByTestId('layout-cell').nth(i)).toHaveAttribute('data-state', 'walkin');
  }
  // The editor's drag gesture is paint, not pan: the canvas viewport never scrolled.
  expect(await page.getByTestId('layout-grid').evaluate((el) => el.scrollLeft)).toBe(0);
});

test('regenerating over a grid confirms first and moves focus with the confirmation (#604, + axe)', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // Draw a grid first, so the NEXT Generate is a destructive replace rather than a first draw.
  await page.getByTestId('layout-gen-rows').fill('2');
  await page.getByTestId('layout-gen-cols').fill('2');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(4);

  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();

  const confirm = page.getByTestId('layout-confirm-regen');
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAttribute('role', 'alertdialog');
  await expect(confirm).toHaveAttribute('aria-label', 'Confirm regenerate');
  await expect(page.getByTestId('layout-cell')).toHaveCount(4); // nothing replaced until confirmed
  await expect(page.getByTestId('layout-confirm-yes')).toBeFocused();

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'regenerate confirmation');

  // Computed styles, not the class list — the only way to see drift from the extraction.
  await expect(confirm).toHaveCSS('background-color', 'rgb(255, 244, 224)');
  await expect(page.getByTestId('layout-confirm-yes')).toHaveCSS(
    'background-color',
    'rgb(10, 95, 116)',
  );
  await expect(page.getByTestId('layout-confirm-yes')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.getByTestId('layout-confirm-yes')).toHaveCSS('min-height', '44px');
  await expect(page.getByTestId('layout-confirm-no')).toHaveCSS('min-height', '44px');

  // Backing out leaves the grid alone and hands focus back to the button the confirm replaced.
  await page.getByTestId('layout-confirm-no').click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId('layout-cell')).toHaveCount(4);
  await expect(page.getByTestId('layout-generate')).toBeFocused();

  // Confirming replaces the grid; Generate survives it, so focus lands there and not on <body>.
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-confirm-yes')).toBeFocused();
  await page.getByTestId('layout-confirm-yes').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(1);
  await expect(page.getByTestId('layout-generate')).toBeFocused();
});

test('shows the layout-locked message when the venue has bookings (409 LAYOUT_IN_USE)', async ({
  page,
}) => {
  await mockEditor(page, true);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // Generate a minimal grid, then save — the server rejects it as in-use (the venue has bookings).
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(1);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-error')).toContainText(/locked/i);
  await expect(page.getByTestId('layout-error')).toContainText(/booked at least once/i);
  await expect(page.getByTestId('layout-error')).toContainText(/still held/i);
});

test('a stale-tab save is rejected 409, keeps the painted grid, and Reload recovers (#226, + axe)', async ({
  page,
}) => {
  const { bump } = await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page); // the editor loads the map at setVersion 0

  // A concurrent writer moves the layout on (→ setVersion 1) behind this still-open tab.
  bump();

  // The operator generates + paints, then saves off the now-stale setVersion 0 → 409 STALE_WRITE.
  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('2');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(2);
  await page.getByTestId('layout-tool-walkin').click();
  await page.getByTestId('layout-cell').first().click();
  await page.getByTestId('layout-save').click();

  // The conflict banner + Reload is shown; the painted grid is PRESERVED (never discarded), and neither
  // the generic error nor the saved notice fires.
  await expect(page.getByTestId('layout-stale-banner')).toBeVisible();
  await expect(page.getByTestId('layout-stale-reload')).toBeVisible();
  await expect(page.getByTestId('layout-cell')).toHaveCount(2);
  await expect(page.getByTestId('layout-cell').first()).toHaveAttribute('data-state', 'walkin');
  await expect(page.getByTestId('layout-error')).toBeHidden();
  await expect(page.getByTestId('layout-saved')).toBeHidden();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor stale-write banner');

  // Reload pulls the latest server layout (setVersion 1, an empty venue → the empty state) and clears
  // the banner; re-generating and saving now succeeds against the fresh token.
  await page.getByTestId('layout-stale-reload').click();
  await expect(page.getByTestId('layout-stale-banner')).toBeHidden();
  await expect(page.getByTestId('layout-empty')).toBeVisible();

  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
});

test('the paint grid, which cannot be drag-panned, still offers a pointer route to its off-screen columns', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto('/operator/1');
  await signIn(page);

  // 20 columns overflow the console viewport: over half the layout starts off-screen.
  await page.getByTestId('layout-gen-rows').fill('2');
  await page.getByTestId('layout-gen-cols').fill('20');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(40);
  const viewport = page.getByTestId('layout-grid');
  await expect.poll(() => viewport.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // Drag pans nothing here (the gesture paints), so the scrollbar is the affordance that remains.
  await expect(viewport).toHaveCSS('scrollbar-width', 'thin');
  await expect(viewport).toHaveCSS('scrollbar-color', 'rgb(8, 90, 110) rgba(0, 0, 0, 0)');
  await expect(viewport).toHaveCSS('scrollbar-gutter', 'auto');
  await expect(page.getByTestId('scroll-hint')).toHaveText(
    'Scroll, or drag the bar below, to see the whole beach.',
  );

  // The reserved-gutter variant silently narrowed the grid; the tile row must still fit its box.
  expect(
    await viewport.evaluate((el) => {
      const row = el.querySelector('[data-map-row]')!;
      return row.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom;
    }),
  ).toBe(true);
});

test('a drag-pannable map keeps its hidden scrollbar and its own hint wording', async ({
  page,
}) => {
  await mockEditor(page, false, SEEDED_SETS);
  await page.goto('/operator/1');
  await signIn(page);
  await page.getByTestId('layout-mode-sets').click();
  const viewport = page.getByTestId('set-grid');
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveCSS('scrollbar-width', 'none');
  await expect(viewport).toHaveCSS('cursor', 'grab');
});
