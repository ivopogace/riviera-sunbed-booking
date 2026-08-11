import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Email tab: an admin sees what the
 * Event Publication Registry still owes, presses Resubmit, and is told what happened — including when
 * the answer is "nothing, the lever is cooling down", which is a `200` and must not read as a failure.
 *
 * The outbox API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that the re-drive is scoped away from the money
 * path — is proven against a real registry by `MailOutboxScopeIT`; this spec proves the console drives
 * the endpoint correctly and stays accessible while doing it.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

/**
 * The mail-outbox endpoints, stateful: the first press hands everything back and empties the outbox,
 * and every later press inside the window is refused — the backend's own behaviour, so the spec can
 * exercise both answers without a clock.
 */
async function mockMailOutbox(page: Page, options: { outstanding: number }): Promise<void> {
  let outstanding = options.outstanding;
  let swept = false;

  await page.route(/\/api\/admin\/mail-outbox$/, (route) =>
    route.fulfill({
      json: { outstanding, cooldownRemainingSeconds: swept ? 60 : 0 },
    }),
  );

  await page.route(/\/api\/admin\/mail-outbox\/resubmit$/, (route) => {
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

/** Sign in as the platform admin and open the Email tab. */
async function openEmailTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/email');
}

test('an admin resubmits the outstanding mail and is told how much was handed back', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailOutbox(page, { outstanding: 3 });
  await openEmailTab(page);

  // The count is on screen before anything is pressed — the lever is never a blind one.
  await expect(page.getByTestId('admin-outbox-outstanding')).toContainText('3');
  await expectNoSeriousAxeViolations(page, 'admin mail outbox with mail outstanding');

  await page.getByTestId('admin-outbox-resubmit').click();

  await expect(page.getByTestId('admin-outbox-notice')).toHaveText('Handed 3 back for delivery.');
  // The card reconciles from the server rather than assuming — the outbox is now empty.
  await expect(page.getByTestId('admin-outbox-empty')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin mail outbox after resubmitting');
});

test('a press inside the cooldown reads as a refusal, not as a failure', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailOutbox(page, { outstanding: 2 });
  await openEmailTab(page);

  await page.getByTestId('admin-outbox-resubmit').click();
  await expect(page.getByTestId('admin-outbox-notice')).toContainText('Handed 2 back');

  await page.getByTestId('admin-outbox-resubmit').click();

  const notice = page.getByTestId('admin-outbox-notice');
  await expect(notice).toContainText('ran recently');
  await expect(notice).toContainText('41s');
  await expect(notice).not.toContainText('wrong');
  await expectNoSeriousAxeViolations(page, 'admin mail outbox cooling down');
});

test('the tab strip marks the open tab and moves between the console sections', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailOutbox(page, { outstanding: 0 });
  await openEmailTab(page);

  const email = page.getByTestId('admin-tab-email');
  const operators = page.getByTestId('admin-tab-operators');
  await expect(email).toHaveAttribute('aria-current', 'page');
  await expect(operators).not.toHaveAttribute('aria-current', 'page');

  await operators.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('admin-tab-operators')).toHaveAttribute('aria-current', 'page');
  await expectNoSeriousAxeViolations(page, 'admin console operators tab');
});

test('a signed-out visitor is shown no outbox and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailOutbox(page, { outstanding: 5 });

  await page.goto('/admin/email');

  await expect(page.getByTestId('admin-outbox-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-outbox-resubmit')).toHaveCount(0);
  await expect(page.getByTestId('admin-tab-email')).toHaveCount(0);
});
