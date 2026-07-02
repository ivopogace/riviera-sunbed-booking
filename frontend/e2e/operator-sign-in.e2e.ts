import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { mockAuthApi } from './support/auth-mocks';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render a11y + behaviour audit of the operator session sign-in (issue #109, AC-8/AC-10):
 * sign in once → session state, generic failure message on wrong credentials (D-8), state
 * SURVIVES a reload (restored from `GET /api/auth/me` — the thing Basic-in-memory never did),
 * sign-out returns to the form. The auth API is mocked statefully (`support/auth-mocks.ts`), so
 * the spec is self-contained and runs in CI (`npm run test:e2e:a11y`); the same flow against the
 * real backend lives in `e2e/real-backend/venue-editor.e2e.ts`. First user of the Page Object
 * convention (issue #120 item 1): selectors live in `support/pages/operator-sign-in.page.ts`.
 */

async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

test('operator signs in, survives a reload, and signs out', async ({ page }) => {
  await mockAuthApi(page, { validPassword: 'good-pw' });
  const signIn = new OperatorSignInPage(page);

  await page.goto('/venue-admin');
  await signIn.expectSignedOut();
  await expectNoSeriousAxeViolations(page, 'signed-out sign-in card');

  // Wrong password: the failure is server-validated NOW, generic (no enumeration), accessible.
  await signIn.signIn('operator', 'wrong-pw');
  await expect(signIn.error).toContainText('Sign-in failed');
  await signIn.expectSignedOut();
  await expectNoSeriousAxeViolations(page, 'generic sign-in failure');

  // Right password: the session is established and the surface flips.
  await signIn.signIn('operator', 'good-pw');
  await signIn.expectSignedInAs('operator');

  // Reload: no credential is held in the browser — the state comes back from GET /api/auth/me.
  await page.reload();
  await signIn.expectSignedInAs('operator');
  await expectNoSeriousAxeViolations(page, 'signed-in after reload');

  // Sign out: the server session dies and the form returns.
  await signIn.signOut();
  await signIn.expectSignedOut();
});
