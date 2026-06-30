import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { OPERATOR_PASSWORD, OPERATOR_USERNAME } from './support/operator';

/**
 * Real-backend e2e for the U7 venue onboarding + beach-map editor (issue #7). A real Chromium
 * drives the editor, which calls the REAL Spring Boot backend, which persists to a REAL
 * Flyway-migrated Postgres and enforces the real DB constraints — nothing is mocked. The
 * unit/integration layers are covered elsewhere; this suite proves the wired system, including the
 * cross-feature round-trip (editor write → public U1 read render).
 *
 * Each test creates its OWN venue (the DB persists across the run) so the tests are independent and
 * order-free; cell/position uniqueness is per-venue, so fresh venues never collide with each other.
 */

/** A unique-enough venue name per test, so a re-run never reads back a stale neighbour's venue. */
function venueName(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Capture the operator credential (the InMemoryUserDetailsManager only accepts this exact login). */
async function signIn(page: Page, password: string = OPERATOR_PASSWORD): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill(OPERATOR_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Fill the "1 · Create venue" form (defaults stand for commission/currency/cutoff) and submit. */
async function createVenue(page: Page, name: string): Promise<number> {
  await expect(page.getByRole('heading', { name: '1 · Create venue' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
  await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
  await page.getByRole('button', { name: 'Create venue' }).click();

  // The real 201 flips the editor to Step 2 with a "Venue #{id} created" status — capture the id.
  const created = page.getByText(/Venue #\d+ created/);
  await expect(created).toBeVisible();
  const id = Number((await created.textContent())?.match(/#(\d+)/)?.[1]);
  expect(Number.isInteger(id)).toBe(true);
  return id;
}

interface SetInput {
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly priceMinor: number;
  readonly gridX: number;
  readonly gridY: number;
  readonly pool?: 'ONLINE' | 'WALK_IN';
  readonly tier?: 'PREMIUM' | 'STANDARD';
}

/** Fill the "2 · Add a set position" form (without submitting). */
async function fillSet(page: Page, set: SetInput): Promise<void> {
  await page.getByLabel('Row label').fill(set.rowLabel);
  await page.getByLabel('Position number').fill(String(set.positionNo));
  // The <select>s sit inside wrapping <label>s whose accessible name folds in the option text
  // ("PoolOnlineWalk-in"), and "Pool" also collides with the Remove button's aria-label — so target
  // them by a stable test id rather than getByLabel.
  if (set.tier) {
    await page.getByTestId('set-tier').selectOption(set.tier);
  }
  if (set.pool) {
    await page.getByTestId('set-pool').selectOption(set.pool);
  }
  await page.getByLabel('Price (minor units)').fill(String(set.priceMinor));
  await page.getByLabel('Grid column (X)').fill(String(set.gridX));
  await page.getByLabel('Grid row (Y)').fill(String(set.gridY));
}

/** Add a set and wait for the read-back layout to render it (the round-trip). */
async function addSet(page: Page, set: SetInput): Promise<void> {
  const before = await page.getByTestId('layout-row').count();
  await fillSet(page, set);
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  // The write succeeds, the form resets, and the layout re-reads through the U1 API — the new row
  // shows only once that read-back returns it. Auto-waits, so it proves persistence, not local state.
  await expect(page.getByTestId('layout-row')).toHaveCount(before + 1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/venue-admin');
});

test.describe('U7 venue editor — real backend, real Postgres', () => {
  test('gates the write surface behind operator sign-in', async ({ page }) => {
    // Signed out: the sign-in card shows and the create form is hidden.
    await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1 · Create venue' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create venue' })).toHaveCount(0);

    // Signing in (client-side credential capture) reveals the create form.
    await signIn(page);
    await expect(page.getByRole('heading', { name: '1 · Create venue' })).toBeVisible();
  });

  test('a wrong operator password yields a real 401 and a sign-in-rejected message', async ({
    page,
  }) => {
    await signIn(page, 'definitely-not-the-password');
    // Sign-in is local; the credential is only tested when the create POST hits the real backend.
    await page.getByLabel('Name', { exact: true }).fill(venueName('unauthorized'));
    await page.getByLabel('Beach', { exact: true }).fill('Ksamil');
    await page.getByLabel('Region', { exact: true }).fill('Albanian Riviera');
    await page.getByRole('button', { name: 'Create venue' }).click();

    await expect(page.getByRole('alert')).toContainText('sign-in was rejected');
    // The 401 left us on the create step — no venue was created.
    await expect(page.getByText(/Venue #\d+ created/)).toHaveCount(0);
  });

  test('creates a venue (real 201) and reads it back through the public API', async ({ page }) => {
    await signIn(page);
    const id = await createVenue(page, venueName('create'));

    await expect(page.getByText(`Venue #${id} created`)).toBeVisible();
    // The empty layout is the read-back of a just-created, set-less venue.
    await expect(page.getByRole('heading', { name: /Layout \(0\)/ })).toBeVisible();
    await expect(page.getByText('No sets yet. Add one above.')).toBeVisible();
  });

  test('adds set positions that render from the read-back (write → read round-trip)', async ({
    page,
  }) => {
    await signIn(page);
    await createVenue(page, venueName('layout'));

    await addSet(page, {
      rowLabel: 'Front row · Sea view',
      positionNo: 1,
      priceMinor: 4500,
      gridX: 1,
      gridY: 1,
      pool: 'ONLINE',
      tier: 'PREMIUM',
    });
    await addSet(page, {
      rowLabel: 'Back row',
      positionNo: 1,
      priceMinor: 2500,
      gridX: 1,
      gridY: 2,
      pool: 'WALK_IN',
      tier: 'STANDARD',
    });

    await expect(page.getByRole('heading', { name: /Layout \(2\)/ })).toBeVisible();
    // setLabel() is built from the re-read SetView — assert the persisted fields, incl. the cell.
    await expect(
      page.getByText(/Front row · Sea view position 1, premium, online pool, .*, cell 1×1/),
    ).toBeVisible();
    await expect(
      page.getByText(/Back row position 1, standard, walk-in pool, .*, cell 1×2/),
    ).toBeVisible();
  });

  test('moves a set between pools (real PATCH) and reads back the new pool', async ({ page }) => {
    await signIn(page);
    await createVenue(page, venueName('pool'));
    await addSet(page, {
      rowLabel: 'Front row',
      positionNo: 1,
      priceMinor: 4000,
      gridX: 2,
      gridY: 1,
      pool: 'ONLINE',
    });

    await expect(page.getByText(/online pool/)).toBeVisible();
    await page.getByRole('button', { name: 'Move to walk-in' }).click();

    // After the PATCH + read-back the set is in the walk-in pool and the button offers the reverse.
    await expect(page.getByText(/walk-in pool/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move to online' })).toBeVisible();
    await expect(page.getByText(/online pool/)).toHaveCount(0);
  });

  test('enforces the real DB layout constraints (CELL_TAKEN, DUPLICATE_POSITION)', async ({
    page,
  }) => {
    await signIn(page);
    await createVenue(page, venueName('conflicts'));
    await addSet(page, {
      rowLabel: 'Front row',
      positionNo: 1,
      priceMinor: 4500,
      gridX: 3,
      gridY: 3,
      pool: 'ONLINE',
    });

    // Same (gridX, gridY), different row/position → the grid-cell uniqueness rule (the server's
    // pre-check, backed by the V12 UNIQUE constraint) rejects it → 409 CELL_TAKEN.
    await fillSet(page, {
      rowLabel: 'Back row',
      positionNo: 2,
      priceMinor: 3000,
      gridX: 3,
      gridY: 3,
    });
    await page.getByRole('button', { name: 'Add set', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('already occupies that grid cell');
    // The rejected add did not persist — still one row.
    await expect(page.getByTestId('layout-row')).toHaveCount(1);

    // Same (rowLabel, positionNo) as the first set, different cell → the (row_label, position_no)
    // uniqueness rule (the server's pre-check, backed by the V2 UNIQUE constraint) → 409 DUPLICATE_POSITION.
    await fillSet(page, {
      rowLabel: 'Front row',
      positionNo: 1,
      priceMinor: 3000,
      gridX: 4,
      gridY: 4,
    });
    await page.getByRole('button', { name: 'Add set', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'already has that row label and position number',
    );
    await expect(page.getByTestId('layout-row')).toHaveCount(1);
  });

  test('round-trips a laid-out map to the public U1 beach-map view', async ({ page }) => {
    await signIn(page);
    const id = await createVenue(page, venueName('roundtrip'));
    await addSet(page, {
      rowLabel: 'Front row · Sea view',
      positionNo: 1,
      priceMinor: 4500,
      gridX: 1,
      gridY: 1,
      pool: 'ONLINE',
      tier: 'PREMIUM',
    });
    await addSet(page, {
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      priceMinor: 4500,
      gridX: 2,
      gridY: 1,
      pool: 'WALK_IN',
      tier: 'PREMIUM',
    });

    // Navigate to the public read view (U1) — a different component, served by the same real API.
    await page.goto(`/venues/${id}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The two sets the editor wrote render as read-only tiles in the public map.
    await expect(page.getByTestId('set-tile')).toHaveCount(2);
    await expect(page.getByText('Front row · Sea view').first()).toBeVisible();
    // It is the public read view, not the editor — no write controls are present.
    await expect(page.getByRole('button', { name: 'Add set', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toHaveCount(0);
  });

  test('the editor layout state has no serious axe violations (real render)', async ({ page }) => {
    await signIn(page);
    await createVenue(page, venueName('axe'));
    await addSet(page, {
      rowLabel: 'Front row',
      positionNo: 1,
      priceMinor: 4500,
      gridX: 1,
      gridY: 1,
      pool: 'ONLINE',
    });

    // Mirror the a11y suite's bar: WCAG 2 A/AA, gate on serious + critical (real CSS/contrast).
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
