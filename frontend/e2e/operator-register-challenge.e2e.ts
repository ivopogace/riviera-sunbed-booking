import { expect, test } from '@playwright/test';

import { ChallengeCode, mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * The proof-of-work fence on the operator register card, real-rendered against the mocked API
 * (`support/auth-mocks.ts` mints low-cost challenges the widget REALLY solves in Chromium's Web
 * Workers). What is proven here and nowhere else in CI: the widget appears on the operator audience
 * and starts solving when the form is focused, the registration POST carries the solved payload,
 * each of the edge's three refusals renders its message and fetches a fresh challenge so the retry
 * succeeds without a reload, the unfenced auto-sign-in still lands the operator, and the kill switch
 * hides the widget while registration keeps working. The real verifier is
 * `e2e/real-backend/auth-challenge.e2e.ts`'s job.
 */

const ADMIN = { username: 'admin', password: 'admin-pw-123456' };
const OPERATOR = { username: 'sereno', password: 'fresh-venue-pw-1', email: 'ops@sereno.al' };

const MESSAGES: Readonly<Record<ChallengeCode, RegExp>> = {
  CHALLENGE_REQUIRED: /hasn’t finished yet/,
  CHALLENGE_INVALID: /didn’t verify/,
  CHALLENGE_EXPIRED: /expired/,
};

test('the widget solves on focus and the registration carries the solution', async ({ page }) => {
  const fence = await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const auth = new OperatorSignInPage(page);

  await auth.gotoRegister();
  await expect(auth.challengeWidget).toBeVisible();
  await expect(auth.challengeWidget).toContainText('Protected by');

  // Focusing the form is what starts the solve; the status line announces both ends of it.
  await auth.username.focus();
  await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 15_000 });
  await expectNoSeriousAxeViolations(page, 'operator register card with the solved widget');

  await auth.register(OPERATOR.username, OPERATOR.password, OPERATOR.email);

  // Registration is fenced; the auto-sign-in that follows it is not — the operator lands anyway.
  await expect(page).toHaveURL(/\/operator/);
  expect(fence.lastSolvedCounter()).toEqual(expect.any(Number));
});

for (const code of Object.keys(MESSAGES) as ChallengeCode[]) {
  test(`a ${code} refusal names the reason, fetches a fresh challenge, and the retry succeeds`, async ({
    page,
  }) => {
    const fence = await mockOperatorLifecycleApi(page, { admin: ADMIN });
    const auth = new OperatorSignInPage(page);

    await auth.gotoRegister();
    await auth.username.focus();
    await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 15_000 });
    const fetchesBeforeSubmit = fence.fetches();

    fence.refuseNextWith(code);
    await auth.register(OPERATOR.username, OPERATOR.password, OPERATOR.email);
    await expect(auth.error).toHaveText(MESSAGES[code]);
    await expect(page).toHaveURL(/mode=register/);
    await expectNoSeriousAxeViolations(page, `operator register refused with ${code}`);

    // The refusal restarted the widget: a fresh challenge, solved again, and the retry goes through.
    await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 15_000 });
    expect(fence.fetches()).toBeGreaterThan(fetchesBeforeSubmit);
    await auth.registerSubmit.click();
    await expect(page).toHaveURL(/\/operator/);
  });
}

test('the kill switch hides the widget and registration still works', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN, challenge: 'off' });
  const auth = new OperatorSignInPage(page);

  await auth.gotoRegister();
  await expect(auth.username).toBeVisible();
  await expect(auth.challengeWidget).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'operator register card with the fence off');

  await auth.register(OPERATOR.username, OPERATOR.password, OPERATOR.email);
  await expect(page).toHaveURL(/\/operator/);
});

test('operator sign-in is not fenced — no widget, and the credentials alone get in', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  const auth = new OperatorSignInPage(page);

  await auth.goto();
  await expect(auth.card).toBeVisible();
  await expect(auth.challengeWidget).toHaveCount(0);

  await auth.signIn(ADMIN.username, ADMIN.password);
  await expect(page).toHaveURL(/\/operator/);
});
