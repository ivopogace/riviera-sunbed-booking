import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { settle } from './support/booking-dialog';

/**
 * Real-render CI-safe e2e for per-set beach-map editing (#600) — the surface that makes a **trading**
 * venue's map editable at all. The mock is deliberately STATEFUL: it holds the venue's sets and
 * applies the three U7 writes to them, so add → edit → move → remove round-trips the way it would
 * against the real API instead of asserting one request in isolation. One set is pinned as
 * booked-or-held, so the `409 SET_IN_USE` guard is driven for real rather than described.
 * API mocked via `page.route` (no backend), axe over the per-set surface.
 */

const PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

interface MockSet {
  id: number;
  rowLabel: string;
  positionNo: number;
  tier: 'PREMIUM' | 'STANDARD';
  pool: 'ONLINE' | 'WALK_IN';
  price: { minorUnits: number; currency: string };
  gridX: number;
  gridY: number;
  availability: 'FREE' | 'TAKEN';
}

function seedSets(): MockSet[] {
  return [
    {
      id: 10,
      rowLabel: 'A',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 3500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
    },
    {
      id: 11,
      rowLabel: 'A',
      positionNo: 2,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 3500, currency: 'EUR' },
      gridX: 2,
      gridY: 1,
      availability: 'FREE',
    },
    {
      id: 12,
      rowLabel: 'B',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 1,
      gridY: 2,
      availability: 'FREE',
    },
    {
      id: 13,
      rowLabel: 'B',
      positionNo: 2,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 2,
      gridY: 2,
      availability: 'TAKEN',
    },
  ];
}

/** Set 13 stands in for a set someone is still owed: every guarded write against it answers 409. */
const CLAIMED_SET_ID = 13;

test.use({ colorScheme: 'dark' });

/**
 * Session + a stateful venue map. The map GET serves the current sets; POST appends one, PATCH
 * replaces one in place, DELETE drops one — except against {@link CLAIMED_SET_ID}, whose repool,
 * reposition and removal are refused `409 SET_IN_USE` exactly as the server's claim guard would.
 */
interface MockConsole {
  sets: () => MockSet[];
  setVersion: () => number;
}

async function mockConsole(page: Page, seed = seedSets()): Promise<MockConsole> {
  let sessionLive = false;
  let sets = seed;
  let nextId = 20;
  let setVersion = 0;

  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: PRINCIPAL });
  });

  const conflict = (route: Parameters<Parameters<Page['route']>[1]>[0]) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      // A sentinel, not the server's prose: the assertions must prove the CLIENT mapped the code.
      json: { code: 'SET_IN_USE', detail: 'in use' },
    });

  // Keep the per-set route ABOVE the venue GET so it wins the match.
  await page.route(/\/api\/venues\/1\/sets(\/(\d+))?$/, (route) => {
    const request = route.request();
    const setId = Number(/\/sets\/(\d+)$/.exec(request.url())?.[1] ?? 0);
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Omit<MockSet, 'id' | 'availability'>;
      sets = [...sets, { ...body, id: nextId++, availability: 'FREE' }];
      return route.fulfill({ status: 201, json: { id: nextId - 1 } });
    }
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Omit<MockSet, 'id' | 'availability'>;
      const current = sets.find((s) => s.id === setId)!;
      const repooledOrMoved =
        body.pool !== current.pool || body.gridX !== current.gridX || body.gridY !== current.gridY;
      if (setId === CLAIMED_SET_ID && repooledOrMoved) {
        return conflict(route);
      }
      sets = sets.map((s) => (s.id === setId ? { ...s, ...body } : s));
      return route.fulfill({ status: 204, body: '' });
    }
    if (request.method() === 'DELETE') {
      if (setId === CLAIMED_SET_ID) {
        return conflict(route);
      }
      sets = sets.filter((s) => s.id !== setId);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });

  interface LayoutCellBody {
    rowLabel: string;
    positionNo: number;
    tier: 'PREMIUM' | 'STANDARD';
    pool: 'ONLINE' | 'WALK_IN';
    price: { minorUnits: number; currency: string };
    gridX: number;
    gridY: number;
  }

  // The batch editor's own PUT — the same expectedVersion-guarded snapshot write as bulk save (#714).
  await page.route(/\/api\/venues\/1\/beach-map$/, (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const body = route.request().postDataJSON() as {
      sets: readonly LayoutCellBody[];
      expectedVersion: number;
    };
    if (body.expectedVersion !== setVersion) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'STALE_WRITE', detail: 'stale' },
      });
    }
    sets = sets.map((s) => {
      const match = body.sets.find((c) => c.gridX === s.gridX && c.gridY === s.gridY);
      return match ? { ...s, tier: match.tier, pool: match.pool, price: match.price } : s;
    });
    setVersion += 1;
    return route.fulfill({ status: 204, body: '' });
  });

  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            id: 1,
            name: 'Miramar Beach Club',
            beach: 'Ksamil',
            region: 'Albanian Riviera',
            description: '',
            ratingTenths: 48,
            reviewsCount: 12,
            bookingMode: 'INSTANT',
            fromPrice: null,
            sets,
            setVersion,
          },
        })
      : route.fallback(),
  );
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

  return { sets: () => sets, setVersion: () => setVersion };
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('oc-header')).toBeVisible();
}

function cell(page: Page, gridX: number, gridY: number) {
  return page.locator(`[data-testid="set-cell"][data-grid-x="${gridX}"][data-grid-y="${gridY}"]`);
}

test('a venue with sets opens in per-set editing, and one set’s pool + price save (+ axe)', async ({
  page,
}) => {
  const mock = await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);

  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  await expect(page.getByTestId('set-editor')).toBeVisible();
  await expect(page.getByTestId('layout-tool-select')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('set-panel-empty')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'per-set beach map editor');

  await cell(page, 1, 2).click();
  await expect(page.getByTestId('set-selected')).toHaveText(/Row B · position 1/);

  await page.getByTestId('set-pool-WALK_IN').click();
  await page.getByTestId('set-price').fill('25');
  await page.getByTestId('set-save').click();

  await expect(page.getByTestId('set-saved')).toBeVisible();
  const set12 = mock.sets().find((s) => s.id === 12)!;
  expect(set12.pool).toBe('WALK_IN');
  expect(set12.price.minorUnits).toBe(2500);
  // The re-read landed, so the map now paints the set as walk-in.
  await expect(cell(page, 1, 2)).toHaveAttribute('data-state', 'walkin');
});

test('a booked set cannot be repooled or removed, and says so instead of failing silently', async ({
  page,
}) => {
  const mock = await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);

  await cell(page, 2, 2).click(); // the claimed set
  await page.getByTestId('set-pool-WALK_IN').click();
  await page.getByTestId('set-save').click();

  await expect(page.getByTestId('set-error')).toContainText(/pool and position can’t change/i);
  // Nothing moved: the server still has it online, and the map agrees.
  expect(mock.sets().find((s) => s.id === 13)!.pool).toBe('ONLINE');
  await expect(cell(page, 2, 2)).toHaveAttribute('data-state', 'standard');

  await page.getByTestId('set-remove').click();
  await page.getByTestId('set-remove-yes').click();
  // The remove guard is the wider one, and the copy is the panel's, not an echo of the mock's detail.
  await expect(page.getByTestId('set-error')).toContainText(/can’t be removed/i);
  await expect(page.getByTestId('set-error')).toContainText(/booked at least once/i);
  expect(mock.sets()).toHaveLength(4);
});

test('grows the grid to add a lounger, moves it, then removes it', async ({ page }) => {
  const mock = await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);

  // The 2×2 grid is full — growing is the only way to add, which is the ordinary case.
  await expect(page.getByTestId('set-cell')).toHaveCount(4);
  await page.getByTestId('set-add-col').click();
  await expect(page.getByTestId('set-cell')).toHaveCount(6);

  await cell(page, 3, 1).click();
  await page.getByTestId('set-add').click();
  await expect(page.getByTestId('set-saved')).toBeVisible();

  const added = mock.sets().find((s) => s.gridX === 3 && s.gridY === 1)!;
  expect(added).toMatchObject({ rowLabel: 'A', positionNo: 3, tier: 'PREMIUM', pool: 'ONLINE' });
  await expect(cell(page, 3, 1)).toHaveAttribute('data-set-id', String(added.id));

  // Move it down a row: grow, arm, pick the empty spot.
  await page.getByTestId('set-add-col').click();
  await cell(page, 3, 1).click();
  await page.getByTestId('set-move').click();
  await expect(page.getByTestId('set-move-armed')).toBeVisible();
  await cell(page, 4, 2).click();

  await expect(page.getByTestId('set-saved')).toBeVisible();
  expect(mock.sets().find((s) => s.id === added.id)).toMatchObject({
    rowLabel: 'B',
    positionNo: 4,
    gridX: 4,
    gridY: 2,
  });

  // Remove it again — a set nobody is owed comes straight off the map.
  await cell(page, 4, 2).click();
  await page.getByTestId('set-remove').click();
  await page.getByTestId('set-remove-yes').click();
  await expect(page.getByTestId('set-panel-empty')).toBeVisible();
  expect(mock.sets().find((s) => s.id === added.id)).toBeUndefined();
});

/**
 * Supersedes the pre-#714 "a mostly-vertical drag pans the map" test: Select's own drag gesture
 * is now the batch-select rectangle sweep (dragPan is off while it is armed, mirroring the bulk
 * paint grid), so a vertical drag sweeps a column of sets instead of panning.
 */
test('a mostly-vertical drag sweeps a column of sets instead of panning the map (#714)', async ({
  page,
}) => {
  await mockConsole(page);
  // A 12-row map, so the wash scroller overflows its 532px cap.
  const tallSets: MockSet[] = [];
  let id = 100;
  for (let r = 1; r <= 12; r++) {
    for (let c = 1; c <= 2; c++) {
      tallSets.push({
        id: id++,
        rowLabel: String.fromCharCode(64 + r),
        positionNo: c,
        tier: 'STANDARD',
        pool: 'ONLINE',
        price: { minorUnits: 2000, currency: 'EUR' },
        gridX: c,
        gridY: r,
        availability: 'FREE',
      });
    }
  }
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            id: 1,
            name: 'Miramar Beach Club',
            beach: 'Ksamil',
            region: 'Albanian Riviera',
            description: '',
            ratingTenths: 48,
            reviewsCount: 12,
            bookingMode: 'INSTANT',
            fromPrice: null,
            sets: tallSets,
            setVersion: 0,
          },
        })
      : route.fallback(),
  );

  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('set-editor')).toBeVisible();

  const wash = page.locator('[data-riv-scroller]').first();
  await expect.poll(() => wash.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);

  const from = cell(page, 1, 6);
  await from.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const scrollBefore = await wash.evaluate((el) => el.scrollTop);
  const fromBox = (await from.boundingBox())!;
  const toBox = (await cell(page, 1, 4).boundingBox())!;
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
  await page.mouse.up();

  // dragPan is off while Select is armed — the drag swept instead of scrolling.
  expect(await wash.evaluate((el) => el.scrollTop)).toBe(scrollBefore);
  await expect(page.getByTestId('batch-panel')).toBeVisible();
  await expect(page.getByTestId('batch-count')).toHaveText(/3 sets selected/);
  await expect(page.getByTestId('batch-range')).toHaveText(/Rows D–F/);

  // A genuine tap elsewhere still selects one set, unchanged (AC-6).
  await cell(page, 1, 1).click();
  await expect(page.getByTestId('set-selected')).toHaveText(/Row A · position 1/);
});

test('sweeps a block, applies a price change to all of them in one PUT (#714)', async ({
  page,
}) => {
  const mock = await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('set-editor')).toBeVisible();
  await settle(page);
  await expectNoSeriousAxeViolations(page, 'batch select');

  const from = cell(page, 1, 1);
  const to = cell(page, 2, 1); // row A: sets 10 and 11
  const fromBox = (await from.boundingBox())!;
  const toBox = (await to.boundingBox())!;
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId('batch-count')).toHaveText(/2 sets selected/);

  let putCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/beach-map')) {
      putCount += 1;
    }
  });

  await page.getByTestId('batch-price').fill('40');
  await page.getByTestId('batch-apply').click();

  await expect(page.getByTestId('batch-saved')).toBeVisible();
  expect(putCount).toBe(1);
  const set10 = mock.sets().find((s) => s.id === 10)!;
  const set11 = mock.sets().find((s) => s.id === 11)!;
  const set12 = mock.sets().find((s) => s.id === 12)!;
  expect(set10.price.minorUnits).toBe(4000);
  expect(set11.price.minorUnits).toBe(4000);
  expect(set10.tier).toBe('PREMIUM'); // untouched field kept, per set (AC-2)
  expect(set12.price.minorUnits).toBe(2000); // outside the sweep — never touched
});

test('a STALE_WRITE batch apply keeps the selection and Reload recovers it (#714)', async ({
  page,
}) => {
  await mockConsole(page);
  await page.goto('/operator/1');
  await signIn(page);

  const from = cell(page, 1, 1);
  const to = cell(page, 1, 2);
  const fromBox = (await from.boundingBox())!;
  const toBox = (await to.boundingBox())!;
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 5 });
  await page.mouse.up();

  // A second tab's PUT lands first: the version this tab loaded no longer matches.
  await page.route(
    /\/api\/venues\/1\/beach-map$/,
    (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'STALE_WRITE', detail: 'stale' },
      }),
    { times: 1 },
  );

  await page.getByTestId('batch-tier-STANDARD').click();
  await page.getByTestId('batch-apply').click();

  await expect(page.getByTestId('layout-stale-banner')).toBeVisible();
  // The selection survives the conflict — the operator doesn't have to re-sweep to retry.
  await expect(page.getByTestId('batch-panel')).toBeVisible();
  await expect(page.getByTestId('batch-count')).toHaveText(/2 sets selected/);

  await page.getByTestId('layout-stale-reload').click();
  await expect(page.getByTestId('layout-stale-banner')).toHaveCount(0);
});

test('the locked bulk save points at per-set editing instead of claiming it is impossible', async ({
  page,
}) => {
  await mockConsole(page);
  await page.route(/\/api\/venues\/1\/beach-map$/, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: { code: 'LAYOUT_IN_USE', detail: 'locked' },
    }),
  );
  await page.goto('/operator/1');
  await signIn(page);

  await page.getByTestId('layout-tool-premium').click();
  await page.getByTestId('layout-save').click();

  const message = page.getByTestId('layout-error');
  await expect(message).toContainText(/Select/i);
  await expect(message).not.toContainText(/not possible/i);
  // The advice must not offer a per-set remove that the same lock can itself refuse.
  await expect(message).not.toContainText(/or remove sets/i);
});

test('stays inside its own scroll at a phone width, with tappable controls (+ axe)', async ({
  page,
}) => {
  await mockConsole(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1');
  await signIn(page);

  await cell(page, 1, 2).click();
  await expect(page.getByTestId('set-panel')).toBeVisible();

  // A wide map scrolls inside the grid frame; the page itself never scrolls sideways.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);

  for (const id of ['set-save', 'set-move', 'set-remove', 'set-add-row', 'set-add-col']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box!.height, `${id} touch target`).toBeGreaterThanOrEqual(44);
  }

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'per-set beach map editor at 390px');
});

/** #715: the docked panel becomes a bottom sheet at phone widths, overlapping the lower canvas
 *  instead of pushing it off-screen, so the tapped tile and the sheet are on screen together. */
test('opens the inspector as a bottom sheet on mobile, tile still visible, dismissible three ways (#715)', async ({
  page,
}) => {
  await mockConsole(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/operator/1');
  await signIn(page);

  const tile = cell(page, 1, 1);
  await tile.click();
  const sheet = page.getByTestId('set-panel');
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();

  // scrollCellIntoView moved the tile clear of the sheet's own room — its bottom lands at/above the sheet's top.
  expect(await sheet.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  const tileBox = (await tile.boundingBox())!;
  const sheetBox = (await sheet.boundingBox())!;
  expect(tileBox.y + tileBox.height).toBeLessThanOrEqual(sheetBox.y);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'per-set bottom sheet open at 390px');

  // Dismiss 1: the backdrop.
  await page.getByTestId('sheet-backdrop').click();
  await expect(sheet).toBeHidden();
  await expect(tile).toBeFocused();

  // Dismiss 2: Escape, scoped to the surface.
  await tile.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(tile).toBeFocused();

  // Dismiss 3: a swipe-down past the threshold on the sheet's own handle.
  await tile.click();
  await expect(sheet).toBeVisible();
  const handle = page.getByTestId('sheet-handle');
  const handleBox = (await handle.boundingBox())!;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await handle.dispatchEvent('pointerdown', { pointerId: 1, clientX: startX, clientY: startY });
  await handle.dispatchEvent('pointermove', {
    pointerId: 1,
    clientX: startX,
    clientY: startY + 120,
  });
  await handle.dispatchEvent('pointerup', { pointerId: 1, clientX: startX, clientY: startY + 120 });
  await expect(sheet).toBeHidden();
  await expect(tile).toBeFocused();
});

/**
 * The busy posture swapped `[disabled]` for `aria-disabled` so a busy control keeps focus. That is
 * a rename of the styling variant, not a restyle, and the project's no-drift rule says a class-list
 * assertion cannot prove it — only the computed style can. The save is held open so the busy state
 * is on screen while it is measured.
 */
test('a busy action dims exactly as the disabled state did', async ({ page }) => {
  await mockConsole(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/venues\/1\/sets\/12$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await held;
    return route.fallback();
  });

  await page.goto('/operator/1');
  await signIn(page);
  await expect(page.getByTestId('set-editor')).toBeVisible();
  await cell(page, 1, 2).click();

  const save = page.getByTestId('set-save');
  const idleOpacity = await save.evaluate((el) => getComputedStyle(el).opacity);
  expect(idleOpacity).toBe('1');

  await page.getByTestId('set-price').fill('25');
  await save.click();

  await expect(save).toHaveAttribute('aria-disabled', 'true');
  // 0.5 is `aria-disabled:opacity-50`, byte-identical to the `disabled:opacity-50` it replaced.
  expect(await save.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.5');
  await expect(save).toBeFocused();

  release();
  await expect(page.getByTestId('set-saved')).toBeVisible();
  expect(await save.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

/**
 * A venue with no sets opens the tab in BULK mode, so per-set editing here is a deliberate override
 * — and the panel used to answer it with "Pick a set on the map", naming nothing that exists.
 * The map is never empty on this surface (the extent clamps to at least 1x1), so the one spot on it
 * is the way to the venue's first set; the copy names that and the generator one toggle above.
 */
test('a set-less venue is pointed at the bulk generator, and adds its first set from the one spot (#718)', async ({
  page,
}) => {
  const mock = await mockConsole(page, []);
  await page.goto('/operator/1');
  await signIn(page);

  await expect(page).toHaveURL(/\/operator\/1\/beach-map/);
  await expect(page.getByTestId('layout-tool-premium')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('layout-tool-select').click();

  await expect(page.getByTestId('set-panel-no-sets')).toBeVisible();
  await expect(page.getByTestId('set-panel-empty')).toHaveCount(0);
  await expect(page.getByTestId('set-cell')).toHaveCount(1);

  await settle(page);
  await expectNoSeriousAxeViolations(page, 'per-set editor with no sets');

  await cell(page, 1, 1).click();
  await page.getByTestId('set-add').click();

  // The first set landed and stays selected, so the no-sets copy has nothing left to answer.
  await expect(page.getByTestId('set-selected')).toHaveText(/Row A · position 1/);
  await expect(page.getByTestId('set-panel-no-sets')).toHaveCount(0);
  expect(mock.sets()).toHaveLength(1);
});
