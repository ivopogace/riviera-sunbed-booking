import { expect, test } from '@playwright/test';

import { ChallengeCode, mockCustomerRecoveryApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * The proof-of-work fence on the reset-request page, real-rendered against the mocked API
 * (`support/auth-mocks.ts` mints low-cost challenges the widget REALLY solves in Chromium's Web
 * Workers). What is proven here and nowhere else in CI: the widget appears and starts solving when
 * the form is focused, the forgot-password POST carries the solved payload, each of the edge's three
 * refusals renders its message and fetches a fresh challenge so the retry succeeds without a reload,
 * and the kill switch hides the widget while the request keeps working. The real verifier is
 * `e2e/real-backend/auth-challenge.e2e.ts`'s job.
 */

const EMAIL = 'ana@example.com';

const MESSAGES: Readonly<Record<ChallengeCode, RegExp>> = {
  CHALLENGE_REQUIRED: /hasn’t finished yet/,
  CHALLENGE_INVALID: /didn’t verify/,
  CHALLENGE_EXPIRED: /expired/,
};

test('the widget solves on focus and the reset request carries the solution', async ({ page }) => {
  const fence = await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: 'old-pw-1234',
  });

  await page.goto('/account/forgot');
  const widget = page.getByTestId('challenge-widget');
  const status = page.getByTestId('challenge-status');
  await expect(widget).toBeVisible();
  await expect(widget).toContainText('Protected by');

  await page.getByTestId('forgot-email').focus();
  await expect(status).toHaveText(/Security check passed/, { timeout: 15_000 });
  await expectNoSeriousAxeViolations(page, 'forgot-password page with the solved widget');

  await page.getByTestId('forgot-email').fill(EMAIL);
  await page.getByTestId('forgot-submit').click();

  await expect(page.getByTestId('forgot-sent')).toContainText('If an account exists');
  expect(fence.lastSolvedCounter()).toEqual(expect.any(Number));
});

for (const code of Object.keys(MESSAGES) as ChallengeCode[]) {
  test(`a ${code} refusal names the reason, fetches a fresh challenge, and the retry succeeds`, async ({
    page,
  }) => {
    const fence = await mockCustomerRecoveryApi(page, {
      email: EMAIL,
      initialPassword: 'old-pw-1234',
    });

    await page.goto('/account/forgot');
    const status = page.getByTestId('challenge-status');
    await page.getByTestId('forgot-email').focus();
    await expect(status).toHaveText(/Security check passed/, { timeout: 15_000 });
    const fetchesBeforeSubmit = fence.fetches();

    fence.refuseNextWith(code);
    await page.getByTestId('forgot-email').fill(EMAIL);
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-error')).toHaveText(MESSAGES[code]);
    await expect(page.getByTestId('forgot-sent')).toHaveCount(0);
    await expectNoSeriousAxeViolations(page, `forgot-password refused with ${code}`);

    // The refusal restarted the widget: a fresh challenge, solved again, and the retry goes through.
    await expect(status).toHaveText(/Security check passed/, { timeout: 15_000 });
    expect(fence.fetches()).toBeGreaterThan(fetchesBeforeSubmit);
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-sent')).toContainText('If an account exists');
  });
}

test('the kill switch hides the widget and the request still works', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: EMAIL,
    initialPassword: 'old-pw-1234',
    challenge: 'off',
  });

  await page.goto('/account/forgot');
  await expect(page.getByTestId('forgot-email')).toBeVisible();
  await expect(page.getByTestId('challenge-widget')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'forgot-password page with the fence off');

  await page.getByTestId('forgot-email').fill(EMAIL);
  await page.getByTestId('forgot-submit').click();
  await expect(page.getByTestId('forgot-sent')).toContainText('If an account exists');
});
