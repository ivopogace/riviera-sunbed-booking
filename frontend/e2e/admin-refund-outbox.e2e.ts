import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Refunds tab: an admin sees what
 * the Event Publication Registry still owes the cancellation-refund listener, presses Resubmit, and
 * is told what happened — including when the answer is "nothing, the lever is cooling down", which
 * is a `200` and must not read as a failure.
 *
 * The refund-outbox API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that the re-drive is scoped to the refund
 * listener's exact id, away from the payment→confirm spine — is proven against a real registry by
 * `RefundOutboxScopeIT`; this spec proves the console drives the endpoint correctly and
 * stays accessible while doing it.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

/**
 * The refund-outbox endpoints, stateful: the first press hands everything back and empties the
 * outbox, and every later press inside the window is refused — the backend's own behaviour, so the
 * spec can exercise both answers without a clock.
 */
async function mockRefundOutbox(page: Page, options: { outstanding: number }): Promise<void> {
  let outstanding = options.outstanding;
  let swept = false;

  await page.route(/\/api\/admin\/refund-outbox$/, (route) =>
    route.fulfill({
      json: { outstanding, cooldownRemainingSeconds: swept ? 60 : 0 },
    }),
  );

  await page.route(/\/api\/admin\/refund-outbox\/resubmit$/, (route) => {
    if (swept) {
      return route.fulfill({
        json: { outcome: 'COOLING_DOWN', resubmitted: 0, cooldownRemainingSeconds: 41 },
      });
    }
    const resubmitted = outstanding;
    swept = true;
    outstanding = 0;
    return route.fulfill({
      json: { outcome: 'RESUBMITTED', resubmitted, cooldownRemainingSeconds: 60 },
    });
  });
}

/** Sign in as the platform admin and open the Refunds tab. */
async function openRefundsTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/refunds');
}

test('an admin resubmits the outstanding refunds and is told how much was handed back', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockRefundOutbox(page, { outstanding: 3 });
  await openRefundsTab(page);

  // The count is on screen before anything is pressed — the lever is never a blind one.
  await expect(page.getByTestId('admin-refunds-outstanding')).toContainText('3');
  await expectNoSeriousAxeViolations(page, 'admin refund outbox with refunds outstanding');

  await page.getByTestId('admin-refunds-resubmit').click();

  await expect(page.getByTestId('admin-refunds-notice')).toHaveText(
    'Handed 3 back to be retried.',
  );
  // The card reconciles from the server rather than assuming — the outbox is now empty.
  await expect(page.getByTestId('admin-refunds-empty')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin refund outbox after resubmitting');
});

test('a press inside the cooldown reads as a refusal, not as a failure', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockRefundOutbox(page, { outstanding: 2 });
  await openRefundsTab(page);

  await page.getByTestId('admin-refunds-resubmit').click();
  await expect(page.getByTestId('admin-refunds-notice')).toContainText('Handed 2 back');

  await page.getByTestId('admin-refunds-resubmit').click();

  const notice = page.getByTestId('admin-refunds-notice');
  await expect(notice).toContainText('ran recently');
  await expect(notice).toContainText('41s');
  await expect(notice).not.toContainText('wrong');
  await expectNoSeriousAxeViolations(page, 'admin refund outbox cooling down');
});

test('the tab strip marks the Refunds tab and reaches it from the console sections', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockRefundOutbox(page, { outstanding: 0 });
  await openRefundsTab(page);

  const refunds = page.getByTestId('admin-tab-refunds');
  const operators = page.getByTestId('admin-tab-operators');
  const email = page.getByTestId('admin-tab-email');
  await expect(refunds).toHaveAttribute('aria-current', 'page');
  await expect(operators).not.toHaveAttribute('aria-current', 'page');
  await expect(email).not.toHaveAttribute('aria-current', 'page');

  await operators.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('admin-tab-refunds')).not.toHaveAttribute('aria-current', 'page');
});

test('a signed-out visitor is shown no outbox and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockRefundOutbox(page, { outstanding: 5 });

  await page.goto('/admin/refunds');

  await expect(page.getByTestId('admin-refunds-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-refunds-resubmit')).toHaveCount(0);
  await expect(page.getByTestId('admin-tab-refunds')).toHaveCount(0);
});
