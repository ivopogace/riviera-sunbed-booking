import { expect, test, type Page, type Request } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';
import {
  CARD_INK,
  PREMIUM_INK,
  SELECT_TINT,
  consoleThemeOf,
  expectConsoleTheme,
  expectInsetFill,
  tintPaint,
} from './support/console-theme';

/**
 * Real-render CI-safe e2e for the layout editor. Drives the actual generate → confirm →
 * paint → save flow on the beach-map tab, deep-linked (the console lands on the Daily view — the
 * returnUrl carries the tab back through sign-in), asserting the single bulk PUT payload, the
 * set-scoped refusal (`409 SETS_IN_USE` marks the named sets), and the stale-write conflict (409 STALE_WRITE keeps the
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

/** The dry run's answer when a save disturbs nobody: the editor then saves without a dialog. */
const EMPTY_PREVIEW = {
  moves: [],
  refunds: [],
  releases: [],
  staffHolds: [],
  blocks: [],
  keep: [],
};

test.use({ colorScheme: 'dark' });

/** What the owner's read pins and what a refusal names: one lock, with the reason's dates. */
interface MockLock {
  setId: number;
  bookedOn: string | null;
  heldOn: string | null;
}

/**
 * Session + reads mock; `puts` collects the layout PUT payloads; a non-empty `refusing` makes that PUT
 * 409 SETS_IN_USE naming those sets. STATEFUL on the `setVersion`: the owner's beach-map GET hands out
 * the current token, the PUT enforces it (a mismatch is 409 STALE_WRITE) and bumps it on success.
 * `bump()` simulates a concurrent writer moving the layout on behind the tab's back, so a subsequent
 * stale save is genuinely rejected. `locks` is what that GET names as pinned.
 */
async function mockEditor(
  page: Page,
  refusing: (MockLock & { rowLabel: string; positionNo: number })[] = [],
  seededSets: typeof VENUE_MAP.sets = [],
  locks: MockLock[] = [],
  preview: object = EMPTY_PREVIEW,
): Promise<{
  previews: Request[];
  puts: Request[];
  renames: Request[];
  bump: () => void;
  holdMap: () => void;
  releaseMap: () => void;
}> {
  const puts: Request[] = [];
  const previews: Request[] = [];
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
  // The remodel dry run a save that drops a loaded set asks first: answers `preview`, writes nothing.
  await page.route(/\/api\/venues\/1\/beach-map\/preview$/, (route) => {
    previews.push(route.request());
    return route.fulfill({ json: preview });
  });

  // GET: the owner's map read, parked by the gate too. PUT: locked → 409, stale token → 409, else 204 + bump.
  await page.route(/\/api\/venues\/1\/beach-map$/, async (route) => {
    if (route.request().method() === 'GET') {
      await mapGate;
      return route.fulfill({
        json: { map: { ...VENUE_MAP, sets: seededSets, setVersion: serverSetVersion }, locks },
      });
    }
    puts.push(route.request());
    if (refusing.length > 0) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        // A sentinel detail absent from the client copy, so the assertions prove the CLIENT built the message.
        json: { code: 'SETS_IN_USE', detail: 'in use', sets: refusing },
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
  return { previews, puts, renames, bump, holdMap, releaseMap };
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
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  // The deep link came back through sign-in; the empty venue shows the empty state until we generate.
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

  /**
   * The mirror, made real (#879). This swatch called itself a mirror of the cell variant while
   * painting 35%/12% against the cell's 30%/12%; both now resolve one `--riv-walkin-hatch`. Compared
   * as COMPUTED values, not as the token's text — `bg-(image:--riv-walkin-hatch)` would read equal on
   * both even if the cascade handed one of them a different declaration. Arming Standard is what
   * re-renders the walk-in tool's swatch, since the armed tool shows a selection ring instead.
   */
  await page.getByTestId('layout-tool-standard').click();
  const paintedCell = page.getByTestId('layout-cell').first();
  const walkinSwatch = page.getByTestId('layout-tool-walkin').locator('span[aria-hidden="true"]');
  const [cellHatch, swatchHatch] = await Promise.all([
    paintedCell.evaluate((el) => getComputedStyle(el).backgroundImage),
    walkinSwatch.evaluate((el) => getComputedStyle(el).backgroundImage),
  ]);
  expect(cellHatch).toContain('repeating-linear-gradient');
  expect(swatchHatch).toBe(cellHatch);

  // The tool rail's swatches are the legend now (#711); the canvas's tourist-only slot stays empty.
  await expect(page.getByRole('list', { name: 'Legend' })).toHaveCount(0);
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

test('paints the console theme: the tool rail and the tiles under porcelain and dark console (#1010, + axe)', async ({
  page,
}, testInfo) => {
  const theme = consoleThemeOf(testInfo);
  await mockEditor(page);
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // The console host wears the console theme while the document stays the tourist's dark.
  await expectConsoleTheme(page, theme);
  await expect(page.locator('html')).toHaveAttribute('data-riv-theme', 'dark');

  await page.getByTestId('layout-gen-rows').fill('2');
  await page.getByTestId('layout-gen-cols').fill('3');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(6);

  // Row A is priced front row: a premium cell under its own ink; row B standard on the inset.
  const cells = page.getByTestId('layout-cell');
  await expect(cells.first()).toHaveAttribute('data-state', 'premium');
  await expect(cells.first()).toHaveCSS('color', PREMIUM_INK[theme]);
  await expect(cells.nth(3)).toHaveAttribute('data-state', 'standard');
  await expectInsetFill(page, cells.nth(3), 85, theme);
  await expect(cells.nth(3)).toHaveCSS('color', CARD_INK[theme]);

  // The tool rail: an idle chip on the inset, the armed one on the selection tint.
  await page.getByTestId('layout-tool-standard').click();
  await expectInsetFill(page, page.getByTestId('layout-tool-walkin'), 45, theme);
  await expect(page.getByTestId('layout-tool-standard')).toHaveCSS(
    'background-color',
    await tintPaint(page, SELECT_TINT[theme], 20),
  );

  await settle(page);
  await expectNoSeriousAxeViolations(page, `layout editor in the ${theme} console`);
});

test('names a row, saves the venue’s words, and blocks duplicate names before any PUT (#723)', async ({
  page,
}) => {
  const { puts } = await mockEditor(page);
  await page.goto('/operator/1/beach-map');
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

/** Set 2 (row B, position 1) as a refusal names it: booked, so a save that removes it is refused. */
const REFUSED_B1 = { setId: 2, rowLabel: 'B', positionNo: 1, bookedOn: '2026-09-12', heldOn: null };

/** The remodel preview of a save that drops B1 with claims in every group — the blocked shape. */
const BLOCKED_PREVIEW = {
  moves: [
    {
      bookingId: 7,
      bookingDate: '2026-09-20',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      to: { setId: 1, rowLabel: 'A', positionNo: 1 },
      rowsAway: 1,
      positionsAway: 0,
    },
  ],
  refunds: [
    {
      bookingId: 8,
      bookingDate: '2026-09-22',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      fee: { minorUnits: 500, currency: 'EUR' },
    },
  ],
  releases: [
    {
      bookingId: 9,
      bookingDate: '2026-09-23',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      kind: 'DECLINE',
    },
  ],
  staffHolds: [{ set: { setId: 2, rowLabel: 'B', positionNo: 1 }, dates: ['2026-09-15'] }],
  blocks: [
    {
      bookingId: 10,
      bookingDate: '2026-09-11',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      reason: 'FROZEN',
    },
  ],
  keep: [{ setId: 2, rowLabel: 'B', positionNo: 1 }],
  previewToken: 'v1.blocked',
  feeTotal: { minorUnits: 500, currency: 'EUR' },
};

/** The same save when only a move results — the one picture the commit applies. */
const MOVES_ONLY_PREVIEW = {
  ...BLOCKED_PREVIEW,
  refunds: [],
  releases: [],
  staffHolds: [],
  blocks: [],
  keep: [],
  previewToken: 'v1.moves',
  feeTotal: { minorUnits: 0, currency: 'EUR' },
};

/** The receipt the commit of {@link MOVES_ONLY_PREVIEW} answers. */
const RECEIPT = {
  receiptId: 41,
  committedAt: '2026-09-09T13:00:00Z',
  moves: [
    {
      bookingId: 7,
      bookingDate: '2026-09-20',
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      to: { setId: 1, rowLabel: 'A', positionNo: 1 },
      rowsAway: 1,
      positionsAway: 0,
    },
  ],
  refunds: [],
  releases: [],
  refundReason: '',
  refundedTotal: null,
  feeTotal: null,
};

/** The same save when a claim must be refunded too — the picture that needs the typed confirmation. */
const REFUNDING_PREVIEW = {
  ...BLOCKED_PREVIEW,
  staffHolds: [],
  blocks: [],
  keep: [],
  previewToken: 'v1.refunds',
  feeTotal: { minorUnits: 500, currency: 'EUR' },
};

/** The receipt the commit of {@link REFUNDING_PREVIEW} answers. */
const REFUNDING_RECEIPT = {
  ...RECEIPT,
  receiptId: 42,
  refunds: [
    {
      bookingId: 8,
      bookingDate: '2026-09-22',
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      amount: { minorUnits: 2000, currency: 'EUR' },
      fee: { minorUnits: 500, currency: 'EUR' },
    },
  ],
  releases: [
    {
      bookingId: 9,
      bookingDate: '2026-09-23',
      from: { setId: 2, rowLabel: 'B', positionNo: 1 },
      amount: { minorUnits: 2000, currency: 'EUR' },
      kind: 'DECLINE',
    },
  ],
  refundReason: 'Re-laying row B for the season',
  refundedTotal: { minorUnits: 2000, currency: 'EUR' },
  feeTotal: { minorUnits: 500, currency: 'EUR' },
};

test('holds both surfaces until the map read settles (#721)', async ({ page }) => {
  const { holdMap, releaseMap } = await mockEditor(page, [], SEEDED_SETS);
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await expect(page.getByTestId('set-editor')).toBeVisible();

  // Leave and re-enter the tab with its map GET parked: every mount pays an uncached read.
  const tabs = page.getByTestId('oc-tabs');
  await tabs.getByRole('link', { name: 'Daily view' }).click();
  await expect(page.getByTestId('layout-editor')).toHaveCount(0);
  holdMap();
  await tabs.getByRole('link', { name: 'Beach map' }).click();

  // Generate lives on the rail regardless of the armed tool, so it's already visible during the window.
  const generate = page.getByTestId('layout-generate');
  // aria-disabled, never [disabled] — a disabled button blurs to <body> the instant it flips (#616).
  await expect(generate).toHaveAttribute('aria-disabled', 'true');
  expect(await generate.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);
  await expect(generate).toHaveText(/Loading the current layout/);

  // The bulk surface is the default while sets are unknown: it skeletons too, not just Select (#744).
  await expect(page.getByTestId('layout-loading')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.getByTestId('layout-skeleton-tile').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('layout-empty')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'layout editor, bulk read in flight');

  await page.getByTestId('layout-tool-select').click();
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
  await page.getByTestId('layout-tool-premium').click();
  await expect(generate).not.toHaveAttribute('aria-disabled', 'true');
  await generate.click();
  await expect(page.getByTestId('layout-confirm-regen')).toBeVisible();
});

test('renames a row on its own PUT while the bulk save is refused (#726)', async ({ page }) => {
  const { puts, renames } = await mockEditor(page, [REFUSED_B1], SEEDED_SETS);
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  // A saved venue opens armed on Select; reaching the bulk surface is free, only its SAVE is refused.
  await page.getByTestId('layout-tool-premium').click();
  await expect(page.getByTestId('layout-row-name')).toHaveCount(2);

  // The whole-layout save really is refused, which is the situation #726 exists for.
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
  await page.goto('/operator/1/beach-map');
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

test('fills a row via a drag-sweep across rail chips in one PUT (#713)', async ({ page }) => {
  const { puts } = await mockEditor(page);
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  await page.getByTestId('layout-gen-rows').fill('3');
  await page.getByTestId('layout-gen-cols').fill('2');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(6);

  await page.getByTestId('layout-tool-gap').click();
  const rails = page.getByTestId('row-code-fill');
  await expect(rails).toHaveCount(3);
  await rails.nth(0).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const from = (await rails.nth(0).boundingBox())!;
  const to = (await rails.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
  await page.mouse.up();

  // Rows A and B (the swept band) are gap; row C (not swept) keeps its generated tier.
  for (const i of [0, 1, 2, 3]) {
    await expect(page.getByTestId('layout-cell').nth(i)).toHaveAttribute('data-state', 'gap');
  }
  await expect(page.getByTestId('layout-cell').nth(4)).toHaveAttribute('data-state', 'standard');

  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();
  expect(puts).toHaveLength(1); // one bulk PUT for the whole swept fill
});

test('at 100% zoom, a plain drag paints and never pans; Space-drag pans and never paints (#713)', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('20');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(20);
  await page.getByTestId('zoom-100').click();
  await expect
    .poll(() => page.getByTestId('layout-grid').evaluate((el) => el.scrollWidth > el.clientWidth))
    .toBe(true);

  await page.getByTestId('layout-tool-walkin').click();
  await page
    .getByTestId('layout-cell')
    .nth(0)
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const from = (await page.getByTestId('layout-cell').nth(0).boundingBox())!;
  const to = (await page.getByTestId('layout-cell').nth(2).boundingBox())!;

  // A plain drag still paints, never pans, at 100% zoom too.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  for (const i of [0, 1, 2]) {
    await expect(page.getByTestId('layout-cell').nth(i)).toHaveAttribute('data-state', 'walkin');
  }
  expect(await page.getByTestId('layout-grid').evaluate((el) => el.scrollLeft)).toBe(0);

  // Blur the button the prior click focused — R-3 only withholds Space while focus sits on a control.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page
    .getByTestId('layout-cell')
    .nth(5)
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const from2 = (await page.getByTestId('layout-cell').nth(5).boundingBox())!;
  const to2 = (await page.getByTestId('layout-cell').nth(3).boundingBox())!;
  await page.keyboard.down('Space');
  await page.mouse.move(from2.x + from2.width / 2, from2.y + from2.height / 2);
  await page.mouse.down();
  await page.mouse.move(to2.x + to2.width / 2, to2.y + to2.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');

  await expect
    .poll(() => page.getByTestId('layout-grid').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  // Neither cell the pan swept over painted — row A (single-row generate) is all premium.
  await expect(page.getByTestId('layout-cell').nth(5)).toHaveAttribute('data-state', 'premium');
  await expect(page.getByTestId('layout-cell').nth(3)).toHaveAttribute('data-state', 'premium');
});

test('regenerating over a grid confirms first and moves focus with the confirmation (#604, + axe)', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto('/operator/1/beach-map');
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
    'rgb(10, 110, 133)', // --riv-solid-fill-brand, #0a6e85 since the #861 merge
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

test('adds a row on a trading venue in one PUT that keeps every seeded cell (#1032, + axe)', async ({
  page,
}) => {
  const { puts } = await mockEditor(page, [], SEEDED_SETS, [
    { setId: 2, bookedOn: '2026-09-12', heldOn: '2026-09-12' },
  ]);
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  // The bulk surface on a venue that has sold: the booked cell is pinned, the grid is still editable.
  await page.getByTestId('layout-tool-premium').click();
  await expect(page.getByTestId('layout-locked-legend')).toContainText('1 set is booked or held');
  await expect(page.getByTestId('layout-cell')).toHaveCount(2);

  // Regenerate one row taller: the two seeded cells stay at their coordinates, row C is new.
  await page.getByTestId('layout-gen-rows').fill('3');
  await page.getByTestId('layout-gen-cols').fill('1');
  await page.getByTestId('layout-generate').click();
  await page.getByTestId('layout-confirm-yes').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(3);
  await expect(page.locator('[data-testid="layout-cell"][data-locked="true"]')).toHaveCount(1);
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-saved')).toBeVisible();

  expect(puts).toHaveLength(1);
  const body = puts[0].postDataJSON() as {
    sets: { gridX: number; gridY: number; rowLabel: string }[];
    expectedVersion: number;
  };
  expect(body.expectedVersion).toBe(0);
  expect(body.sets.map((set) => [set.rowLabel, set.gridX, set.gridY])).toEqual([
    ['A', 1, 1],
    ['B', 1, 2],
    ['C', 1, 3],
  ]);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, row added on a trading venue');
});

test('a refused save marks the sets it names with the lock decoration and lists them (409 SETS_IN_USE, + axe)', async ({
  page,
}) => {
  // A booking landed after the load: the tab knows no lock, so the gap brush paints B1 out.
  const { puts } = await mockEditor(page, [REFUSED_B1], SEEDED_SETS);
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await page.getByTestId('layout-tool-gap').click();
  const b1 = page.locator('[data-testid="layout-cell"][data-grid-row="1"][data-grid-col="0"]');
  await b1.click();
  await expect(b1).toHaveAttribute('data-state', 'gap');
  await page.getByTestId('layout-save').click();

  // The refusal: the named cell wears the #1031 lock, the legend counts it, the alert names it.
  await expect(b1).toHaveAttribute('data-locked', 'true');
  await expect(b1.locator('svg')).toBeVisible();
  await expect(b1).toHaveAccessibleDescription(/booked Sat 12 Sept 2026/);
  await expect(page.getByTestId('layout-locked-legend')).toContainText('1 set is booked or held');
  await expect(page.getByTestId('layout-error')).toContainText(
    /Row B · position 1 \(booked Sat 12 Sept 2026\)/,
  );
  await expect(page.getByTestId('layout-error')).not.toContainText(/in use/);
  expect(puts).toHaveLength(1);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, save refused by set');

  // The way out: the tier brush paints it back; gapping it again is allowed, and says the save will preview the move.
  await page.getByTestId('layout-tool-standard').click();
  await b1.click();
  await expect(b1).toHaveAttribute('data-state', 'standard');
  await page.getByTestId('layout-tool-gap').click();
  await b1.click();
  await expect(b1).toHaveAttribute('data-state', 'gap');
  await expect(page.getByTestId('layout-lock-notice')).toContainText(
    /saving will first show where its bookings would move/,
  );
});

test('previews the remodel instead of a save that drops a held set: five groups, an inert Save, Back restores focus (#1033, + axe)', async ({
  page,
}) => {
  const { previews, puts } = await mockEditor(page, [], SEEDED_SETS, [], BLOCKED_PREVIEW);
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await page.getByTestId('layout-tool-gap').click();
  const b1 = page.locator('[data-testid="layout-cell"][data-grid-row="1"][data-grid-col="0"]');
  await b1.click();
  await expect(b1).toHaveAttribute('data-state', 'gap');
  await page.getByTestId('layout-save').click();

  // The dry run first, then the dialog: every group, the set to keep, no PUT, the save inert.
  const dialog = page.getByTestId('layout-remodel-preview');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'alertdialog');
  await expect(dialog).toHaveAttribute('aria-label', 'Confirm remodel');
  expect(previews).toHaveLength(1);
  expect(puts).toHaveLength(0);
  await expect(page.getByTestId('layout-remodel-moves')).toContainText(
    'Row B · position 1 → Row A · position 1 · 1 row over · Sun 20 Sept 2026 · €20',
  );
  await expect(page.getByTestId('layout-remodel-refunds')).toContainText('refunded in full');
  await expect(page.getByTestId('layout-remodel-releases')).toContainText(
    'pending request declined',
  );
  await expect(page.getByTestId('layout-remodel-holds')).toContainText(
    'held by staff Tue 15 Sept 2026',
  );
  await expect(page.getByTestId('layout-remodel-blocks')).toContainText(
    'arrives within the freeze window',
  );
  await expect(page.getByTestId('layout-remodel-keep')).toContainText(
    'Keep Row B · position 1 on the map to save.',
  );
  await expect(dialog.getByRole('button')).toHaveCount(1);
  await expect(page.getByTestId('layout-remodel-back')).toBeFocused();
  await expect(page.getByTestId('layout-save')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('layout-remodel-bookings')).toHaveAttribute(
    'href',
    '/operator/1/daily',
  );

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, remodel preview open');
  // The amber warn skin, by computed style: the fixed fill and its ink, whichever console theme.
  await expect(dialog).toHaveCSS('background-color', 'rgb(255, 244, 224)');
  await expect(dialog).toHaveCSS('color', 'rgb(122, 74, 8)');
  await expect(page.getByTestId('layout-remodel-back')).toHaveCSS('min-height', '44px');

  // Backing out leaves the grid as painted and hands focus back to Save; still no PUT.
  await page.getByTestId('layout-remodel-back').click();
  await expect(dialog).toBeHidden();
  await expect(b1).toHaveAttribute('data-state', 'gap');
  await expect(page.getByTestId('layout-save')).toBeFocused();
  await expect(page.getByTestId('layout-save')).not.toHaveAttribute('aria-disabled', 'true');
  expect(puts).toHaveLength(0);
});

test('a moves-only preview commits: Save and move POSTs the token, the receipt replaces the dialog, past remodels list it (#1034, + axe)', async ({
  page,
}) => {
  const { previews, puts } = await mockEditor(page, [], SEEDED_SETS, [], MOVES_ONLY_PREVIEW);
  const commits: Request[] = [];
  await page.route(/\/api\/venues\/1\/beach-map\/commit$/, (route) => {
    commits.push(route.request());
    return route.fulfill({ json: RECEIPT });
  });
  await page.route(/\/api\/venues\/1\/remodels$/, (route) =>
    route.fulfill({
      json: [{ receiptId: 41, committedAt: '2026-09-09T13:00:00Z', moveCount: 1, refundCount: 0 }],
    }),
  );
  await page.route(/\/api\/venues\/1\/remodels\/41$/, (route) => route.fulfill({ json: RECEIPT }));
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await page.getByTestId('layout-tool-gap').click();
  const b1 = page.locator('[data-testid="layout-cell"][data-grid-row="1"][data-grid-col="0"]');
  await b1.click();
  await page.getByTestId('layout-save').click();

  // The committable shape: Save first and focused, Back beside it, no keep sentence.
  const dialog = page.getByTestId('layout-remodel-preview');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('layout-remodel-keep')).toHaveCount(0);
  await expect(dialog).toContainText('cancel for a full refund');
  await expect(dialog.getByRole('button')).toHaveCount(2);
  const save = page.getByTestId('layout-remodel-commit');
  await expect(save).toHaveText('Save and move 1 booking');
  await expect(save).toBeFocused();
  await expect(save).toHaveCSS('min-height', '44px');
  // White on the solid warn fill, by computed style.
  await expect(save).toHaveCSS('background-color', 'rgb(154, 100, 16)');
  await expect(save).toHaveCSS('color', 'rgb(255, 255, 255)');
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, committable remodel preview');

  await save.click();
  const receipt = page.getByTestId('layout-remodel-receipt');
  await expect(receipt).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(previews).toHaveLength(1);
  expect(puts).toHaveLength(0);
  expect(commits).toHaveLength(1);
  const body = commits[0].postDataJSON() as {
    sets: { gridX: number; gridY: number }[];
    expectedVersion: number;
    previewToken: string;
  };
  expect(body.previewToken).toBe('v1.moves');
  expect(body.expectedVersion).toBe(0);
  expect(body.sets.map((set) => [set.gridX, set.gridY])).toEqual([[1, 1]]);
  await expect(page.getByTestId('layout-remodel-receipt-title')).toHaveText(
    'Remodel saved · receipt #41',
  );
  await expect(page.getByTestId('layout-remodel-receipt-title')).toBeFocused();
  await expect(page.getByTestId('layout-remodel-receipt-moves')).toContainText(
    'Row B · position 1 → Row A · position 1 · 1 row over · Sun 20 Sept 2026',
  );
  await expect(page.getByTestId('layout-saved')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, remodel receipt');

  // Done returns focus to Save; the past remodels disclosure reads the list and reopens the receipt.
  await page.getByTestId('layout-remodel-receipt-close').click();
  await expect(receipt).toBeHidden();
  await expect(page.getByTestId('layout-save')).toBeFocused();
  await page.getByTestId('layout-remodels-toggle').click();
  const row = page.getByTestId('layout-remodels-open');
  await expect(row).toHaveText('Wed, 9 Sept, 15:00 · 1 booking moved');
  await expect(row).toHaveCSS('min-height', '44px');
  await row.click();
  await expect(page.getByTestId('layout-remodel-receipt-title')).toHaveText(
    'Remodel saved · receipt #41',
  );
  await expect(page.getByTestId('layout-remodel-receipt-title')).toBeFocused();
});

test('a picture with refunds commits once the count and reason are typed, and the receipt lists them (#1035, + axe)', async ({
  page,
}) => {
  await mockEditor(page, [], SEEDED_SETS, [], REFUNDING_PREVIEW);
  const commits: Request[] = [];
  await page.route(/\/api\/venues\/1\/beach-map\/commit$/, (route) => {
    commits.push(route.request());
    return route.fulfill({ json: REFUNDING_RECEIPT });
  });
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await page.getByTestId('layout-tool-gap').click();
  await page.locator('[data-testid="layout-cell"][data-grid-row="1"][data-grid-col="0"]').click();
  await page.getByTestId('layout-save').click();

  const dialog = page.getByTestId('layout-remodel-preview');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('is ended');
  const save = page.getByTestId('layout-remodel-commit');
  await expect(save).toHaveText('Save and move 1, refund 1, release 1 bookings');
  await expect(save).toBeDisabled();

  // What the refunds will cost the venue, before it confirms them.
  await expect(page.getByTestId('layout-remodel-fee')).toContainText(
    '€5 per refunded booking — €5 in total',
  );

  // The count field, not Save, takes focus while there is something to fill in.
  const count = page.getByTestId('layout-remodel-refund-count');
  await expect(count).toBeFocused();
  await expect(count).toHaveCSS('min-height', '44px');
  // The fixed warn family, by computed style: a themed field skin would drift on this ground.
  await expect(count).toHaveCSS('color', 'rgb(122, 74, 8)');
  await expect(count).toHaveCSS('background-color', 'rgb(255, 244, 224)');

  await count.fill('3');
  await count.blur();
  await expect(page.getByTestId('layout-remodel-refund-count-error')).toHaveText(
    'Type 1 to confirm the refunds.',
  );
  await expect(save).toBeDisabled();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, remodel refund confirmation');

  await count.fill('1');
  await page.getByTestId('layout-remodel-reason').fill('Re-laying row B for the season');
  await expect(save).toBeEnabled();
  await save.click();

  const body = commits[0].postDataJSON() as { refundCount: number; refundReason: string };
  expect(body.refundCount).toBe(1);
  expect(body.refundReason).toBe('Re-laying row B for the season');

  const receipt = page.getByTestId('layout-remodel-receipt');
  await expect(receipt).toBeVisible();
  await expect(page.getByTestId('layout-remodel-receipt-refunds')).toContainText(
    'Row B · position 1 · Tue 22 Sept 2026 · €20',
  );
  await expect(receipt).toContainText('Refunded (1) · €20 returned');
  await expect(page.getByTestId('layout-remodel-receipt-fee')).toHaveText(
    'Venue-change fee: €5 per refunded booking, €5 in total',
  );
  await expect(page.getByTestId('layout-remodel-receipt-reason')).toHaveText(
    'Reason: Re-laying row B for the season',
  );
  await expect(page.getByTestId('layout-remodel-receipt-releases')).toContainText(
    'pending request declined',
  );
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, remodel receipt with refunds');
});

test('a commit that finds the bookings changed re-renders the fresh picture stale, and the next Save carries its token (#1034)', async ({
  page,
}) => {
  const { puts } = await mockEditor(page, [], SEEDED_SETS, [], MOVES_ONLY_PREVIEW);
  const tokens: string[] = [];
  await page.route(/\/api\/venues\/1\/beach-map\/commit$/, (route) => {
    const body = route.request().postDataJSON() as { previewToken: string };
    tokens.push(body.previewToken);
    if (body.previewToken === 'v1.fresh') {
      return route.fulfill({ json: RECEIPT });
    }
    return route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: {
        code: 'STALE_PREVIEW',
        detail: 'stale',
        preview: { ...BLOCKED_PREVIEW, previewToken: 'v1.fresh' },
      },
    });
  });
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await page.getByTestId('layout-tool-gap').click();
  await page.locator('[data-testid="layout-cell"][data-grid-row="1"][data-grid-col="0"]').click();
  await page.getByTestId('layout-save').click();
  await page.getByTestId('layout-remodel-commit').click();

  // The fresh picture is the blocked shape: flagged stale, every group, Back alone, no error bar.
  const stale = page.getByTestId('layout-remodel-stale');
  await expect(stale).toContainText('bookings changed since you previewed');
  expect(await stale.evaluate((node) => node.tagName)).toBe('OUTPUT');
  await expect(page.getByTestId('layout-remodel-blocks')).toContainText(
    'arrives within the freeze window',
  );
  await expect(page.getByTestId('layout-remodel-preview').getByRole('button')).toHaveCount(1);
  await expect(page.getByTestId('layout-remodel-back')).toBeFocused();
  await expect(page.getByTestId('layout-error')).toHaveCount(0);
  expect(tokens).toEqual(['v1.moves']);
  expect(puts).toHaveLength(0);

  // Back, then a second Save: the new preview is moves-only again but carries the fresh token.
  await page.getByTestId('layout-remodel-back').click();
  await page.unroute(/\/api\/venues\/1\/beach-map\/preview$/);
  await page.route(/\/api\/venues\/1\/beach-map\/preview$/, (route) =>
    route.fulfill({ json: { ...MOVES_ONLY_PREVIEW, previewToken: 'v1.fresh' } }),
  );
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-remodel-stale')).toBeEmpty();
  await page.getByTestId('layout-remodel-commit').click();
  await expect(page.getByTestId('layout-remodel-receipt')).toBeVisible();
  expect(tokens).toEqual(['v1.moves', 'v1.fresh']);
});

test('a stale-tab save is rejected 409, keeps the painted grid, and Reload recovers (#226, + axe)', async ({
  page,
}) => {
  const { bump } = await mockEditor(page);
  await page.goto('/operator/1/beach-map');
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
  await page.goto('/operator/1/beach-map');
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
    'Scroll, or drag the scrollbar, to see the whole beach.',
  );

  // The reserved-gutter variant silently narrowed the grid; the tile row must still fit its box.
  expect(
    await viewport.evaluate((el) => {
      const row = el.querySelector('[data-map-row]')!;
      return row.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom;
    }),
  ).toBe(true);
});

/**
 * Supersedes the pre-#714 "a drag-pannable map keeps its hidden scrollbar" test: Select's own
 * drag gesture is now the batch-select rectangle sweep (#714), so its canvas — like the bulk
 * paint grid's — is no longer drag-pannable and shows the same slim scrollbar affordance instead.
 */
/** Two rows of twelve — the widest layout the console's 1300px page box must show whole at 1280px. */
const TWELVE_COLUMNS = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  rowLabel: i < 12 ? 'A' : 'B',
  positionNo: (i % 12) + 1,
  tier: 'STANDARD',
  pool: 'ONLINE',
  price: { minorUnits: 3000, currency: 'EUR' },
  gridX: (i % 12) + 1,
  gridY: i < 12 ? 1 : 2,
  available: true,
}));

test('fits a twelve-column layout to width at 1280px under the shell (#1011)', async ({ page }) => {
  await mockEditor(page, [], TWELVE_COLUMNS);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  // A seeded layout opens in per-set mode, on the same fit-to-width canvas.
  await expect(page.getByTestId('set-cell')).toHaveCount(24);

  // Every column fits the frame: nothing to scroll sideways, and the last column's tile ends inside it.
  const viewport = page.getByTestId('set-grid');
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(0);
  const frame = (await viewport.boundingBox())!;
  const last = (await page.getByTestId('set-cell').last().boundingBox())!;
  expect(last.x + last.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
});

test('Select’s own drag gesture (the sweep) leaves its grid not drag-pannable either', async ({
  page,
}) => {
  await mockEditor(page, [], SEEDED_SETS);
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await page.getByTestId('layout-tool-select').click();
  const viewport = page.getByTestId('set-grid');
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveCSS('scrollbar-width', 'thin');
  await expect(viewport).toHaveCSS('scrollbar-color', 'rgb(8, 90, 110) rgba(0, 0, 0, 0)');
  await expect(viewport).toHaveCSS('cursor', 'auto');
});

test('at a phone width the tool rail is one scrolling row, the armed chip stays in view (#715)', async ({
  page,
}) => {
  await mockEditor(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/operator/1/beach-map');
  await signIn(page);
  await expect(page.getByTestId('layout-tool-select')).toBeVisible();

  // Every chip shares one `top` (one row) and the rail overflows horizontally — it scrolls, not wraps.
  const rail = page.getByLabel('Tools');
  const chips = rail.getByRole('button');
  const tops = await chips.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1);
  const [scrollWidth, clientWidth] = await rail.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  // Arming the last chip (off the initial scroll) brings it into view automatically.
  const gap = page.getByTestId('layout-tool-gap');
  await gap.click();
  await expect(gap).toBeInViewport();
});

test('every paint cell declares touch-action: none, so a paint drag never fights page scroll (#715)', async ({
  page,
}) => {
  await mockEditor(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  await page.getByTestId('layout-gen-rows').fill('1');
  await page.getByTestId('layout-gen-cols').fill('3');
  await page.getByTestId('layout-generate').click();
  await expect(page.getByTestId('layout-cell')).toHaveCount(3);

  const cells = page.getByTestId('layout-cell');
  for (let i = 0; i < 3; i++) {
    await expect(cells.nth(i)).toHaveCSS('touch-action', 'none');
  }
});

test('a staff-held cell repaints its tier but never gaps, and the per-set surface disables Move and Remove (#1031, + axe)', async ({
  page,
}) => {
  // Set 2 (row B, position 1) is marked for a walk-in: the owner's map read names it, so the editor knows before any click.
  await mockEditor(page, [], SEEDED_SETS, [{ setId: 2, bookedOn: null, heldOn: '2026-09-12' }]);
  await page.goto('/operator/1/beach-map');
  await signIn(page);

  // The per-set surface opens first on a venue with sets: the locked cell carries the glyph + reason.
  const lockedSetCell = page.locator('[data-testid="set-cell"][data-set-id="2"]');
  await expect(lockedSetCell).toHaveAttribute('data-locked', 'true');
  await expect(lockedSetCell.locator('svg')).toBeVisible();
  await expect(lockedSetCell).toHaveAccessibleDescription(/held by staff Sat 12 Sept 2026/);
  await lockedSetCell.click();
  await expect(page.getByTestId('set-move')).toBeDisabled();
  await expect(page.getByTestId('set-remove')).toBeDisabled();
  await expect(page.getByTestId('set-locked-reason')).toContainText(
    /held by staff Sat 12 Sept 2026/,
  );
  await expect(page.getByTestId('set-price')).toBeEnabled();
  await expect(page.getByTestId('set-pool-WALK_IN')).toBeEnabled();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'set editor, locked set selected');

  // The bulk canvas: the rail counts the lock, the cell wears it, the tier brush still repaints it.
  await page.getByTestId('layout-tool-premium').click();
  await expect(page.getByTestId('layout-locked-legend')).toContainText('1 set is booked or held');
  const lockedCell = page.locator('[data-testid="layout-cell"][data-locked="true"]');
  await expect(lockedCell).toHaveCount(1);
  await expect(lockedCell).toHaveAttribute('data-state', 'standard');
  await expect(lockedCell).toHaveAccessibleDescription(/held by staff Sat 12 Sept 2026/);
  await lockedCell.click();
  await expect(lockedCell).toHaveAttribute('data-state', 'premium');
  await expect(page.getByTestId('layout-dirty-count')).toHaveText(/1 unsaved change/);

  // The gap brush is refused on it, with the reason, and the dirty count counts only the repaint.
  await page.getByTestId('layout-tool-gap').click();
  await lockedCell.click();
  await expect(lockedCell).toHaveAttribute('data-state', 'premium');
  await expect(page.getByTestId('layout-lock-notice')).toContainText(
    /Row B · position 1 is held by staff Sat 12 Sept 2026 — it can’t become a gap/,
  );
  await expect(page.getByTestId('layout-dirty-count')).toHaveText(/1 unsaved change/);
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'layout editor, gap refused on a locked cell');
});
