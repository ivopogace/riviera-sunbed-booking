import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Payouts tab: an admin reads a week's
 * per-venue batches, reports a draft at the total on screen and settles it once paid via BKT.
 *
 * The batch API is mocked statefully, with the server's own guard: a `REPORTED` write carries the
 * total the admin reviewed and is refused `409 TOTAL_CHANGED` when the batch holds another total
 * (#1320). The backend's ITs prove the guard against real Postgres; this spec proves the console
 * sends the displayed total, re-reads on the refusal, and only freezes a figure the admin has seen.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

test.use({ viewport: { width: 360, height: 740 } });

interface Batch {
  id: number;
  venueId: number;
  periodKey: string;
  totalNetMinor: number;
  currency: string;
  status: 'DRAFT' | 'REPORTED' | 'SETTLED';
}

/** The batch store the mock serves, and every PATCH body the page sent, in order. */
interface PayoutServer {
  readonly batches: Batch[];
  readonly patches: unknown[];
  readonly periods: string[];
}

async function mockPayouts(page: Page): Promise<PayoutServer> {
  const server: PayoutServer = {
    batches: [
      { id: 41, venueId: 3, periodKey: '', totalNetMinor: 9350, currency: 'EUR', status: 'DRAFT' },
    ],
    patches: [],
    periods: [],
  };

  await page.route(/\/api\/admin\/venues$/, (route) =>
    route.fulfill({
      json: {
        venues: [
          {
            venueId: 3,
            name: 'Miramar Beach Club',
            beach: 'KSAMIL',
            commissionBps: 1500,
            payoutCurrency: 'EUR',
          },
        ],
      },
    }),
  );

  await page.route(/\/api\/admin\/payout-batches(\?.*)?$/, (route) => {
    const period = new URL(route.request().url()).searchParams.get('period') ?? '';
    server.periods.push(period);
    return route.fulfill({
      json: server.batches.map((batch) => ({ ...batch, periodKey: period })),
    });
  });

  await page.route(/\/api\/admin\/payout-batches\/(\d+)$/, (route) => {
    const body = route.request().postDataJSON() as {
      status: Batch['status'];
      expectedTotalNetMinor?: number;
    };
    server.patches.push(body);
    const batch = server.batches.find((b) => route.request().url().endsWith(`/${b.id}`))!;
    if (body.status === 'REPORTED' && body.expectedTotalNetMinor !== batch.totalNetMinor) {
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { code: 'TOTAL_CHANGED', detail: 'The batch total is not the one reviewed.' },
      });
    }
    batch.status = body.status;
    return route.fulfill({ json: batch });
  });

  return server;
}

async function openPayoutsTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/payouts');
  await page.getByTestId('admin-payouts-card').waitFor();
}

test('a refresh between the read and the click is refused, and the admin reports the new total', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const server = await mockPayouts(page);
  await openPayoutsTab(page);

  const report = page.getByTestId('payout-batch-report-41');
  await expect(report).toContainText('Report at €93.50');
  await expectNoSeriousAxeViolations(page, 'admin payouts tab at 360px');

  // A generate elsewhere refreshes the draft after this page read it.
  server.batches[0].totalNetMinor = 7000;
  await report.click();

  const notice = page.getByTestId('admin-payouts-notice');
  await expect(notice).toContainText('now nets €70, not €93.50');
  await expect(notice).toBeFocused();
  await expect(page.getByTestId('payout-batch-status')).toHaveText('Draft');
  await expect(report).toContainText('Report at €70');

  await report.click();
  await expect(notice).toHaveText('Miramar Beach Club is reported at €70.');
  await expect(page.getByTestId('payout-batch-status')).toHaveText('Reported');
  expect(server.patches).toEqual([
    { status: 'REPORTED', expectedTotalNetMinor: 9350 },
    { status: 'REPORTED', expectedTotalNetMinor: 7000 },
  ]);

  await page.getByTestId('payout-batch-settle-41').click();
  await expect(page.getByTestId('payout-batch-status')).toHaveText('Settled');
  expect(server.patches.at(-1)).toEqual({ status: 'SETTLED' });
  await expectNoSeriousAxeViolations(page, 'admin payouts tab after settling');
});

test('the admin picks another week and generates it', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const server = await mockPayouts(page);
  await openPayoutsTab(page);

  await page.getByTestId('admin-payouts-period').fill('2026-W24');
  await page.getByTestId('admin-payouts-generate').click();

  await expect(page.getByTestId('admin-payouts-notice')).toHaveText(
    'Generated 1 batch for 2026-W24.',
  );
  await expect(page.getByTestId('admin-payouts-card')).toContainText('Batches for 2026-W24');
  expect(server.periods.at(-1)).toBe('2026-W24');

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrollsSideways).toBe(false);
});
