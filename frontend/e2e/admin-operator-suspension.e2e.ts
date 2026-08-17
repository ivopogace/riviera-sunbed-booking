import { expect, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of admin-driven operator suspension: a platform admin
 * suspends an approved operator, that operator can no longer sign in, and reinstating restores it.
 * The lifecycle API is mocked statefully (`support/auth-mocks.ts`) — including the fact that
 * suspension revokes the target's session — so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). The server-side revocation itself is proven against a real session store
 * by `OperatorSuspensionRevocationIT`; this spec proves the console drives it correctly.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const OP = { username: 'zoe', password: 'zoe-pw-12345', contactEmail: 'zoe@venue.example' };

/** Register (auto-signed-in while PENDING) + approve, leaving the admin signed in on /admin. */
async function seedApprovedOperator(page: import('@playwright/test').Page): Promise<void> {
  const signIn = new OperatorSignInPage(page);
  await page.goto('/operator/register');
  await page.getByLabel('Username', { exact: true }).fill(OP.username);
  await page.getByLabel('Contact email', { exact: true }).fill(OP.contactEmail);
  await page.getByLabel('Password', { exact: true }).fill(OP.password);
  await page.getByRole('button', { name: /^(Request account|Submitting)/ }).click();
  await expect(page.getByTestId('pending-approval-banner')).toBeVisible();
  await signIn.signOut();

  await page.goto('/operator');
  await signIn.signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('admin-ops-empty')).toBeVisible();
}

test('an admin suspends an operator, which blocks its sign-in, then reinstates it', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const signIn = new OperatorSignInPage(page);
  await seedApprovedOperator(page);

  // The approved operator is listed as an account, alongside the admin's own row.
  const row = page.getByTestId('admin-account-row').filter({ hasText: OP.username });
  await expect(row).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin account list');

  // Suspension takes a deliberate second click — the first only arms the inline confirmation.
  await row.getByRole('button', { name: 'Suspend' }).click();
  await expect(row.getByText(`Suspend ${OP.username}?`)).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'admin suspend confirmation armed');

  // Typed grounds ride the X-Audit-Reason header into the admin audit trail.
  await row.getByLabel('Reason (optional)').fill('repeated guest reports');
  const suspendRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/suspend'),
  );
  await row.getByRole('button', { name: 'Suspend' }).click();
  expect((await suspendRequest).headers()['x-audit-reason']).toBe('repeated guest reports');

  // The row stays listed and badged (never a one-way door), reconciled from the server.
  await expect(row.getByText('Suspended')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Reinstate' })).toBeVisible();

  // A suspended operator cannot sign in — generic failure, no enumeration (D-8).
  await page.goto('/operator');
  await signIn.signOut();
  await signIn.signIn(OP.username, OP.password);
  await expect(signIn.error).toContainText('Sign-in failed');
  await signIn.expectSignedOut();

  // Reinstating restores access.
  await signIn.signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await row.getByRole('button', { name: 'Reinstate' }).click();
  await expect(row.getByText('Suspended')).toBeHidden();

  await page.goto('/operator');
  await signIn.signOut();
  await signIn.signIn(OP.username, OP.password);
  await signIn.expectSignedInAs(OP.username);
});

test('the admin is offered no way to suspend its own account', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin');

  // The server refuses a self-suspend (409 CANNOT_SUSPEND_SELF); the console doesn't offer the action.
  const ownRow = page.getByTestId('admin-account-row').filter({ hasText: ADMIN.username });
  await expect(ownRow.getByText('This is you')).toBeVisible();
  await expect(ownRow.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
});

test('a sign-out that never reaches the server warns, and the retry clears it', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.goto('/operator');
  const signIn = new OperatorSignInPage(page);
  await signIn.signIn(ADMIN.username, ADMIN.password);

  // Both the logout and the CSRF-rebootstrap retry fail — the server session may still be alive.
  await page.route(/\/api\/auth\/logout$/, (route) => route.abort('failed'));
  await signIn.signOut();

  const warning = page.getByTestId('sign-out-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('may still be signed in on this device');
  await expectNoSeriousAxeViolations(page, 'sign-out warning');

  // With the endpoint working again, the retry confirms the sign-out and the warning goes.
  await page.unroute(/\/api\/auth\/logout$/);
  await page.route(/\/api\/auth\/logout$/, (route) => route.fulfill({ status: 204 }));
  await page.getByTestId('sign-out-retry').click();
  await expect(warning).toBeHidden();
});

/**
 * The settled-action leg. The queue reconciles from the server after every decision, so the
 * confirm button focus was on is gone by the time the suspension returns — a real browser then
 * leaves focus on `<body>` unless it is parked deliberately (WCAG 2.4.3).
 */
test('a settled suspension announces the outcome and lands focus on it', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await seedApprovedOperator(page);

  const row = page.getByTestId('admin-account-row').filter({ hasText: OP.username });
  await row.getByRole('button', { name: 'Suspend' }).click();
  // Armed, the trigger is replaced by the panel, so the only Suspend left is the confirm.
  await expect(row.getByRole('button', { name: 'Suspend' })).toBeFocused();

  await row.getByRole('button', { name: 'Suspend' }).click();

  const notice = page.getByTestId('admin-ops-notice');
  await expect(notice).toHaveText(`Suspended ${OP.username}.`);
  await expect(notice).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'admin operators after a settled suspension');
});
