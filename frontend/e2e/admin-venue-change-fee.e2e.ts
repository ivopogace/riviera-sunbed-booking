import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Venue changes tab: an admin reads the
 * fee the platform charges for a venue-caused refund, changes it through an editor that shows the
 * exact minor units it will store, and offers grounds that ride the audit trail.
 *
 * Run at **360px**, the project's small-screen bar, because the fee card and the report table share
 * the narrowest layout the tab has — the table scrolls inside its own region, and the page itself
 * must not.
 *
 * The fee API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that a change reaches the ledger, that posted
 * fees are never repriced, and that a plain operator gets `403` — is the backend's, proven against a
 * real Postgres by its own tests; this spec proves the console sends minor units and never euros,
 * splices the answer, and refuses an amount the server would reject without asking it.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

test.use({ viewport: { width: 360, height: 740 } });

/** One accepted write, as the mock recorded it — `amountMinor` is `unknown` so euros would show. */
interface FeeWrite {
  readonly amountMinor: unknown;
  readonly reason: string | null;
}

/**
 * The tab's three endpoints, with the fee stateful: a write moves the stored amount, so a later read
 * reflects it — the backend's own behaviour, which is what makes "the new fee stuck" an honest
 * assertion rather than a local-UI artefact.
 */
async function mockVenueChanges(page: Page): Promise<void> {
  const fee = { amountMinor: 500, currency: 'EUR' };
  const writes: FeeWrite[] = [];

  await page.route(/\/api\/admin\/venues$/, (route) =>
    route.fulfill({
      json: {
        venues: [
          {
            venueId: 3,
            name: 'Miramar Beach Club',
            beach: 'Ksamil',
            commissionBps: 1500,
            payoutCurrency: 'EUR',
          },
        ],
      },
    }),
  );

  await page.route(/\/api\/admin\/venue-change-refunds$/, (route) =>
    route.fulfill({
      json: {
        venues: [
          { venueId: 3, refundCount: 2, refundedMinor: 14000, feeMinor: 1000, currency: 'EUR' },
        ],
      },
    }),
  );

  await page.route(/\/api\/admin\/venue-change-fee$/, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: fee });
    }
    const body = route.request().postDataJSON() as { amountMinor: number };
    writes.push({
      amountMinor: body.amountMinor,
      reason: route.request().headers()['x-audit-reason'] ?? null,
    });
    fee.amountMinor = body.amountMinor;
    return route.fulfill({ json: fee });
  });

  await page.exposeFunction('__rivieraFeeWrites', () => writes);
}

/** What the page actually sent, in order. */
function writesSoFar(page: Page): Promise<FeeWrite[]> {
  return page.evaluate(() =>
    (window as unknown as { __rivieraFeeWrites: () => Promise<FeeWrite[]> }).__rivieraFeeWrites(),
  );
}

/** Sign in as the platform admin and open the Venue changes tab. */
async function openVenueChangesTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/venue-changes');
  await page.getByTestId('admin-venue-change-fee-card').waitFor();
}

test('an admin changes the fee, sending minor units and never euros', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockVenueChanges(page);
  await openVenueChangesTab(page);

  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€5');
  await expectNoSeriousAxeViolations(page, 'admin venue changes tab at 360px');

  await page.getByTestId('admin-venue-change-fee-edit').click();
  await page.getByTestId('admin-venue-change-fee-input').fill('7.5');

  // The exact integer that will be stored is on screen before anything is sent.
  await expect(page.getByTestId('admin-venue-change-fee-preview')).toContainText('750');
  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€5');
  await expectNoSeriousAxeViolations(page, 'admin venue changes tab with the fee editor open');

  await page.getByTestId('admin-venue-change-fee-reason').fill('raised for the 2027 season');
  await page.getByTestId('admin-venue-change-fee-save').click();

  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€7.50');
  await expect(page.getByTestId('admin-venue-change-fee-notice')).toContainText('€7.50');

  expect(await writesSoFar(page)).toEqual([
    { amountMinor: 750, reason: 'raised for the 2027 season' },
  ]);
  await expectNoSeriousAxeViolations(page, 'admin venue changes tab after a fee change');
});

test('the new fee survives a re-read — the server really took it', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockVenueChanges(page);
  await openVenueChangesTab(page);

  await page.getByTestId('admin-venue-change-fee-edit').click();
  await page.getByTestId('admin-venue-change-fee-input').fill('9');
  await page.getByTestId('admin-venue-change-fee-save').click();
  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€9');

  await page.reload();
  await page.getByTestId('admin-venue-change-fee-card').waitFor();

  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€9');
});

test('no grounds are sent when the reason is left blank', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockVenueChanges(page);
  await openVenueChangesTab(page);

  await page.getByTestId('admin-venue-change-fee-edit').click();
  await page.getByTestId('admin-venue-change-fee-input').fill('3');
  await page.getByTestId('admin-venue-change-fee-save').click();
  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€3');

  expect(await writesSoFar(page)).toEqual([{ amountMinor: 300, reason: null }]);
});

/**
 * The association, in a real browser. jsdom cannot prove the reference RESOLVES — axe reports a
 * dangling `aria-describedby` as `incomplete`, and `expectNoSeriousAxeViolations` reads
 * `violations` only, so nothing in CI would see a rotted association except an assertion that
 * dereferences it. The refusal never reaches the wire, so no extra network mock is needed.
 *
 * <p>The negative is checked here and not only in jsdom because the shared euros parser clamps a
 * negative to zero: were the refusal to stop happening ahead of it, a typo would silently make
 * venue changes free rather than fail.
 *
 * <p>Both refusals are settled on by their own copy before the association is dereferenced.
 * Comparing the described element against text read a moment earlier races the re-render that
 * swaps one message for the other, and fails only when the whole file runs.
 */
test('an out-of-range fee names the field it blames, and lets go when corrected', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockVenueChanges(page);
  await openVenueChangesTab(page);

  await page.getByTestId('admin-venue-change-fee-edit').click();

  await page.getByTestId('admin-venue-change-fee-input').fill('-5');
  await page.getByTestId('admin-venue-change-fee-save').click();
  await expect(page.getByTestId('admin-venue-change-fee-input-error')).toContainText('negative');
  expect(await writesSoFar(page)).toEqual([]);

  await page.getByTestId('admin-venue-change-fee-input').fill('2000');
  await page.getByTestId('admin-venue-change-fee-save').click();

  const error = page.getByTestId('admin-venue-change-fee-input-error');
  await expect(error).toContainText('cannot exceed');
  const describedBy = await page
    .getByTestId('admin-venue-change-fee-input')
    .getAttribute('aria-describedby');
  await expect(page.locator(`#${describedBy}`)).toContainText('cannot exceed');
  expect(await writesSoFar(page)).toEqual([]);

  await page.getByTestId('admin-venue-change-fee-input').fill('6');
  await expect(page.getByTestId('admin-venue-change-fee-input-error')).toBeHidden();
  await expect(page.getByTestId('admin-venue-change-fee-input')).not.toHaveAttribute(
    'aria-describedby',
  );

  await page.getByTestId('admin-venue-change-fee-save').click();

  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€6');
  expect(await writesSoFar(page)).toEqual([{ amountMinor: 600, reason: null }]);
});

/** The page never scrolls sideways at the small-screen bar; only the report table's own region does. */
test('the tab fits the small-screen bar', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockVenueChanges(page);
  await openVenueChangesTab(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/**
 * The failure leg, in a real browser. The editor deliberately stays open holding what was typed, so
 * focus must land back on the control that started the write — jsdom does not blur a focused element
 * the way a browser does, which is why this leg is pinned here and not only in the unit spec.
 */
test('a failed save keeps the editor open, reports it, and moves focus back to Save', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockVenueChanges(page);
  await openVenueChangesTab(page);

  await page.getByTestId('admin-venue-change-fee-edit').click();
  await page.getByTestId('admin-venue-change-fee-input').fill('8');
  await page.route(/\/api\/admin\/venue-change-fee$/, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, body: '' })
      : route.fulfill({ json: { amountMinor: 500, currency: 'EUR' } }),
  );
  await page.getByTestId('admin-venue-change-fee-save').click();

  await expect(page.getByTestId('admin-venue-change-fee-error')).toContainText(
    'Nothing was changed',
  );
  await expect(page.getByTestId('admin-venue-change-fee-save')).toBeFocused();
  await expect(page.getByTestId('admin-venue-change-fee-amount')).toHaveText('€5');
});
