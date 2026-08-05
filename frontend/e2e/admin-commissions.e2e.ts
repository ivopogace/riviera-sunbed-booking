import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Commissions tab (A8, epic #348): an
 * admin sees every venue's rate, corrects one through a percent editor that shows the exact basis
 * points it will store, and offers grounds that ride the audit trail.
 *
 * Run at **360px**, the project's small-screen bar, because the design canvas's phone layout is
 * exactly what this tab renders at every width — one labelled card per venue — so the narrow
 * viewport is the honest place to prove it fits and stays accessible.
 *
 * The rate API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that the schedule is genuinely forward-only and
 * that a plain operator gets `403` — is A7's, proven against a real Postgres by its own tests; this
 * spec proves the console sends basis points and never a percent, splices the answer, and never
 * scrolls sideways.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

test.use({ viewport: { width: 360, height: 740 } });

/**
 * The admin venue-commission endpoints, stateful: a write moves the stored rate, so a later read
 * reflects it — the backend's own behaviour, which is what makes "the new rate stuck" an honest
 * assertion rather than a local-UI artefact.
 */
async function mockCommissions(page: Page): Promise<void> {
  const venues = [
    { venueId: 7, name: 'Bora Bora Beach', beach: 'Dhërmi', commissionBps: 1500, payoutCurrency: 'EUR' },
    { venueId: 9, name: 'Folie Marine', beach: 'Gjipe', commissionBps: 1000, payoutCurrency: 'EUR' },
  ];
  /** The bps + grounds of each accepted write, so the spec can assert what actually went on the wire. */
  const writes: { venueId: number; commissionBps: unknown; reason: string | null }[] = [];

  await page.route(/\/api\/admin\/venues$/, (route) => route.fulfill({ json: { venues } }));

  await page.route(/\/api\/admin\/venues\/(\d+)\/commission$/, (route) => {
    const venueId = Number(/venues\/(\d+)\/commission/.exec(route.request().url())![1]);
    const body = route.request().postDataJSON() as { commissionBps: number };
    const venue = venues.find((each) => each.venueId === venueId);
    if (venue === undefined) {
      return route.fulfill({
        status: 404,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 404, title: 'Not Found', code: 'NO_SUCH_VENUE' }),
      });
    }
    writes.push({
      venueId,
      commissionBps: body.commissionBps,
      reason: route.request().headers()['x-audit-reason'] ?? null,
    });
    venue.commissionBps = body.commissionBps;
    return route.fulfill({ json: venue });
  });

  await page.exposeFunction('__rivieraCommissionWrites', () => writes);
}

/** One accepted write, as the mock recorded it — `commissionBps` is `unknown` so a percent would show. */
interface CommissionWrite {
  readonly venueId: number;
  readonly commissionBps: unknown;
  readonly reason: string | null;
}

/** What the page actually sent, in order. */
function writesSoFar(page: Page): Promise<CommissionWrite[]> {
  return page.evaluate(() =>
    (
      window as unknown as { __rivieraCommissionWrites: () => Promise<CommissionWrite[]> }
    ).__rivieraCommissionWrites(),
  );
}

/** Sign in as the platform admin and open the Commissions tab. */
async function openCommissionsTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/commissions');
  await page.getByTestId('admin-commission-row-7').waitFor();
}

test('an admin corrects a rate, sending basis points and never a percent', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockCommissions(page);
  await openCommissionsTab(page);

  await expect(page.getByTestId('admin-commission-rate-7')).toHaveText('15%');
  await expect(page.getByTestId('admin-commission-bps-7')).toHaveText('1500 bps');
  await expectNoSeriousAxeViolations(page, 'admin commissions tab at 360px');

  await page.getByTestId('admin-commission-edit-7').click();
  await page.getByTestId('admin-commission-percent-7').fill('12.5');

  // The exact integer that will be stored is on screen before anything is sent.
  await expect(page.getByTestId('admin-commission-preview-7')).toContainText('1250 bps');
  await expect(page.getByTestId('admin-commission-rate-7')).toHaveText('15%');
  await expectNoSeriousAxeViolations(page, 'admin commissions tab with an editor open');

  await page.getByTestId('admin-commission-reason-7').fill('renegotiated for the 2026 season');
  await page.getByTestId('admin-commission-save-7').click();

  await expect(page.getByTestId('admin-commission-rate-7')).toHaveText('12.5%');
  await expect(page.getByTestId('admin-commission-bps-7')).toHaveText('1250 bps');
  await expect(page.getByTestId('admin-commissions-notice')).toContainText('Bora Bora Beach');
  // The neighbour is untouched.
  await expect(page.getByTestId('admin-commission-rate-9')).toHaveText('10%');

  expect(await writesSoFar(page)).toEqual([
    { venueId: 7, commissionBps: 1250, reason: 'renegotiated for the 2026 season' },
  ]);
  await expectNoSeriousAxeViolations(page, 'admin commissions tab after a rate change');
});

test('the new rate survives a re-read — the server really took it', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockCommissions(page);
  await openCommissionsTab(page);

  await page.getByTestId('admin-commission-edit-7').click();
  await page.getByTestId('admin-commission-percent-7').fill('20');
  await page.getByTestId('admin-commission-save-7').click();
  await expect(page.getByTestId('admin-commission-rate-7')).toHaveText('20%');

  // Away and back: the list is read afresh, so 20% is the server's answer and not a local edit.
  await page.getByTestId('admin-tab-audit').click();
  await page.getByTestId('admin-tab-commissions').click();

  await expect(page.getByTestId('admin-commission-rate-7')).toHaveText('20%');
  await expect(page.getByTestId('admin-commission-bps-7')).toHaveText('2000 bps');
});

test('no grounds are sent when the reason is left blank', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockCommissions(page);
  await openCommissionsTab(page);

  await page.getByTestId('admin-commission-edit-7').click();
  await page.getByTestId('admin-commission-percent-7').fill('9');
  await page.getByTestId('admin-commission-save-7').click();
  await expect(page.getByTestId('admin-commission-rate-7')).toHaveText('9%');

  expect(await writesSoFar(page)).toEqual([{ venueId: 7, commissionBps: 900, reason: null }]);
});

test('the tab strip marks Commissions in slot 2 and never scrolls sideways at 360px', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockCommissions(page);
  await openCommissionsTab(page);

  const commissions = page.getByTestId('admin-tab-commissions');
  await expect(commissions).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin-tab-operators')).not.toHaveAttribute('aria-current', 'page');

  // Q1 (#348) put Commissions immediately after Operators; the strip is where that is visible.
  const labels = await page
    .getByRole('navigation', { name: 'Admin console sections' })
    .getByRole('link')
    .allInnerTexts();
  expect(labels.slice(0, 2)).toEqual(['Operators', 'Commissions']);

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrollsSideways).toBe(false);
});

test('a signed-out visitor is shown no rates and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockCommissions(page);

  await page.goto('/admin/commissions');

  await expect(page.getByTestId('admin-commissions-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-commission-row-7')).toBeHidden();
  await expect(page.getByTestId('admin-tab-commissions')).toBeHidden();
});
