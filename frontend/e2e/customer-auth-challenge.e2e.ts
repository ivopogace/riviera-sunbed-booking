import { expect, test } from '@playwright/test';

import { ChallengeCode, mockCustomerAuthApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { CustomerAuthPage } from './support/pages/customer-auth.page';

/**
 * The proof-of-work fence on the tourist register card, real-rendered against the mocked API
 * (`support/auth-mocks.ts` mints low-cost challenges the widget REALLY solves in Chromium's Web
 * Workers). What is proven here and nowhere else in CI: the widget appears with its attribution and
 * starts solving when the form is focused, the register POST carries the solved payload, each of
 * the edge's three refusals renders its message and fetches a fresh challenge so the retry succeeds
 * without a reload, and the kill switch (`204` from the challenge route) hides the widget while
 * register keeps working. The real verifier is `e2e/real-backend/register.e2e.ts`'s job; the other
 * two fenced auth forms have their own specs alongside this one.
 */

const MESSAGES: Readonly<Record<ChallengeCode, RegExp>> = {
  CHALLENGE_REQUIRED: /hasn’t finished yet/,
  CHALLENGE_INVALID: /didn’t verify/,
  CHALLENGE_EXPIRED: /expired/,
};

test('the widget solves on focus and the register carries the solution', async ({ page }) => {
  const fence = await mockCustomerAuthApi(page, {
    email: 'ana@example.com',
    validPassword: 'passphrase-123',
  });
  const auth = new CustomerAuthPage(page);

  await page.goto('/account/sign-in?mode=register');
  await expect(auth.challengeWidget).toBeVisible();
  await expect(auth.challengeWidget).toContainText('Protected by');
  await expect(auth.challengeWidget.getByRole('link', { name: /altcha/i })).toHaveAttribute(
    'href',
    /altcha\.org/,
  );

  // Focusing the form is what starts the solve; the status line announces both ends of it.
  await auth.email.focus();
  await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 15_000 });
  await expect(auth.challengeWidget.getByRole('checkbox')).toBeChecked();
  await expectNoSeriousAxeViolations(page, 'tourist register card with the solved widget');

  await auth.register('ana@example.com', 'passphrase-123');
  await auth.expectSignedInAs('ana@example.com');
  expect(fence.lastSolvedCounter()).toEqual(expect.any(Number));
});

for (const code of Object.keys(MESSAGES) as ChallengeCode[]) {
  test(`a ${code} refusal names the reason, fetches a fresh challenge, and the retry succeeds`, async ({
    page,
  }) => {
    const fence = await mockCustomerAuthApi(page, {
      email: 'ana@example.com',
      validPassword: 'passphrase-123',
    });
    const auth = new CustomerAuthPage(page);

    await page.goto('/account/sign-in?mode=register');
    await auth.email.focus();
    await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 15_000 });
    const fetchesBeforeSubmit = fence.fetches();

    fence.refuseNextWith(code);
    await auth.register('ana@example.com', 'passphrase-123');
    await expect(auth.error).toHaveText(MESSAGES[code]);
    await expect(page).toHaveURL(/mode=register/);
    await expectNoSeriousAxeViolations(page, `register refused with ${code}`);

    // The refusal restarted the widget: a fresh challenge, solved again, and the retry goes through.
    await expect(auth.challengeStatus).toHaveText(/Security check passed/, { timeout: 15_000 });
    expect(fence.fetches()).toBeGreaterThan(fetchesBeforeSubmit);
    await auth.registerSubmit.click();
    await auth.expectSignedInAs('ana@example.com');
  });
}

test('the kill switch hides the widget and register still works', async ({ page }) => {
  await mockCustomerAuthApi(page, {
    email: 'ana@example.com',
    validPassword: 'passphrase-123',
    challenge: 'off',
  });
  const auth = new CustomerAuthPage(page);

  await page.goto('/account/sign-in?mode=register');
  await expect(auth.email).toBeVisible();
  await expect(auth.challengeWidget).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'tourist register card with the fence off');

  await auth.register('ana@example.com', 'passphrase-123');
  await auth.expectSignedInAs('ana@example.com');
});

test('the checkbox is 24 px and carries its touch-floor exemption', async ({ page }) => {
  await mockCustomerAuthApi(page, { email: 'ana@example.com', validPassword: 'passphrase-123' });
  const auth = new CustomerAuthPage(page);

  await page.goto('/account/sign-in?mode=register');
  await expect(auth.challengeWidget.getByRole('checkbox')).toBeVisible();

  // Measured, not read off the class list: the sweep skips it, so nothing else pins the size.
  const box = await page.evaluate(() => {
    const input = document.querySelector('.altcha-checkbox input');
    const wrap = document.querySelector('.altcha-checkbox');
    if (!input || !wrap) return null;
    const r = input.getBoundingClientRect();
    return {
      size: { width: Math.round(r.width), height: Math.round(r.height) },
      exempt: wrap.getAttribute('data-touch-exempt'),
    };
  });

  expect(box, 'the ALTCHA checkbox internals still exist').not.toBeNull();
  expect(box!.size, 'the deliberate 24 px, WCAG 2.5.8 AA with no headroom').toEqual({
    width: 24,
    height: 24,
  });
  expect(box!.exempt, 'the sweep skips it only because the reason is written down').toContain(
    'maintainer decision',
  );
});
