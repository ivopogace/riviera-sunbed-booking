import { expect, Locator, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's Privacy tab: an admin
 * actions a data-subject erasure request through form → confirm → done, offers grounds that ride the
 * audit trail, and is told an outcome that reveals nothing about whether the address was known.
 *
 * Run at **360px**, the project's small-screen bar, because the canvas's two-column layout has to
 * collapse there and the strip is at seven tabs with Privacy in it — the narrow viewport is the honest
 * place to prove both still fit.
 *
 * The erasure endpoint is mocked below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that the scrub really is pseudonymize-in-place
 * and that a plain operator gets `403` — is the backend's, proven against a real Postgres by
 * `AccountErasureIT`; this spec proves the console sends exactly one request carrying exactly the
 * address, that nothing is sent before the confirmation, and that the two possible realities behind
 * a `204` are indistinguishable on screen.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };

const KNOWN = 'ana@example.com';
/** An address the platform never held — the backend answers `204` for this too (design D-8). */
const UNKNOWN = 'nobody@example.com';

test.use({ viewport: { width: 360, height: 740 } });

/** One erasure request as the mock recorded it — `email` is `unknown` so a wrong shape would show. */
interface ErasureRequest {
  readonly body: unknown;
  readonly reason: string | null;
}

/** The erasure endpoint: always `204`, whatever the address — that is the contract, not a shortcut. */
async function mockErasure(page: Page): Promise<void> {
  const requests: ErasureRequest[] = [];

  await page.route(/\/api\/admin\/erasure$/, (route) => {
    requests.push({
      body: route.request().postDataJSON(),
      reason: route.request().headers()['x-audit-reason'] ?? null,
    });
    return route.fulfill({ status: 204 });
  });

  await page.exposeFunction('__rivieraErasureRequests', () => requests);
}

/** What the page actually sent, in order. */
function requestsSoFar(page: Page): Promise<ErasureRequest[]> {
  return page.evaluate(() =>
    (
      window as unknown as { __rivieraErasureRequests: () => Promise<ErasureRequest[]> }
    ).__rivieraErasureRequests(),
  );
}

/** Sign in as the platform admin and open the Privacy tab. */
async function openPrivacyTab(page: Page): Promise<void> {
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/privacy');
  await page.getByTestId('admin-privacy-email').waitFor();
}

/** Settle the panel's entry animation, so an axe contrast read never lands mid-fade. */
async function settled(panel: Locator): Promise<Locator> {
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return panel;
}

test('an admin erases a subject through arm-then-confirm, sending one request', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);
  await openPrivacyTab(page);

  await expect(page.getByTestId('admin-privacy-survives')).toContainText('overwritten in place');
  await expectNoSeriousAxeViolations(page, 'admin privacy tab at 360px');

  await page.getByTestId('admin-privacy-email').fill(KNOWN);
  await page.getByTestId('admin-privacy-review').click();

  // The review step arms the confirmation and nothing more — the wire is still untouched.
  await expect(await settled(page.getByTestId('admin-privacy-confirm-panel'))).toContainText(KNOWN);
  expect(await requestsSoFar(page)).toEqual([]);
  await expectNoSeriousAxeViolations(page, 'admin privacy tab with a confirmation armed');

  await page.getByTestId('admin-privacy-reason').fill('DSAR-2026-08-04');
  await page.getByTestId('admin-privacy-confirm').click();

  await expect(await settled(page.getByTestId('admin-privacy-done-panel'))).toContainText(KNOWN);
  expect(await requestsSoFar(page)).toEqual([
    { body: { email: KNOWN }, reason: 'DSAR-2026-08-04' },
  ]);
  await expectNoSeriousAxeViolations(page, 'admin privacy tab after an erasure');
});

/**
 * The property the whole screen exists to preserve (design D-8). Both addresses answer `204`; if the
 * console ever grew a "no such person" branch, or a count, these two outcomes would stop matching
 * and this test would say so.
 */
test('the outcome is identical for a known and an unknown address', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);
  await openPrivacyTab(page);

  const eraseAndReadOutcome = async (address: string): Promise<string> => {
    await page.getByTestId('admin-privacy-email').fill(address);
    await page.getByTestId('admin-privacy-review').click();
    await page.getByTestId('admin-privacy-confirm').click();
    const outcome = await page.getByTestId('admin-privacy-done-panel').innerText();
    await page.getByTestId('admin-privacy-another').click();
    await page.getByTestId('admin-privacy-email').waitFor();
    return outcome;
  };

  const known = await eraseAndReadOutcome(KNOWN);
  const unknown = await eraseAndReadOutcome(UNKNOWN);

  expect(known.replace(KNOWN, '<address>')).toEqual(unknown.replace(UNKNOWN, '<address>'));
  expect(known).toContain('whether or not that email was known');
});

test('no grounds are sent when the reason is left blank', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);
  await openPrivacyTab(page);

  await page.getByTestId('admin-privacy-email').fill(KNOWN);
  await page.getByTestId('admin-privacy-review').click();
  await page.getByTestId('admin-privacy-confirm').click();
  await expect(page.getByTestId('admin-privacy-done-panel')).toBeVisible();

  expect(await requestsSoFar(page)).toEqual([{ body: { email: KNOWN }, reason: null }]);
});

test('a malformed address is refused before anything is sent', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);
  await openPrivacyTab(page);

  await page.getByTestId('admin-privacy-email').fill('not-an-email');
  await page.getByTestId('admin-privacy-review').click();

  await expect(page.getByTestId('admin-privacy-email-error')).toHaveText(
    'Enter a valid email address.',
  );
  await expect(page.getByTestId('admin-privacy-confirm-panel')).toBeHidden();
  expect(await requestsSoFar(page)).toEqual([]);
});

/**
 * The focus transition jsdom cannot show. Disabling a focused button blurs it to `<body>` in a real
 * browser but not under jsdom, so the unit spec pins the intended target while this proves the
 * behaviour that made it a bug — a failed erasure leaving a keyboard user with nowhere to go, on the
 * one path where they most need to retry (WCAG 2.4.3).
 */
test('a failed erasure leaves focus on the confirm button, not on the body', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);
  await openPrivacyTab(page);

  await page.getByTestId('admin-privacy-email').fill(KNOWN);
  await page.getByTestId('admin-privacy-review').click();
  await page.route(/\/api\/admin\/erasure$/, (route) => route.fulfill({ status: 500, body: '' }));
  await page.getByTestId('admin-privacy-confirm').click();

  await expect(page.getByTestId('admin-privacy-error')).toContainText('Nothing was erased');
  await expect(page.getByTestId('admin-privacy-confirm')).toBeFocused();
  await expect(page.getByTestId('admin-privacy-done-panel')).toBeHidden();
});

test('the tab strip marks Privacy in slot 7 and never scrolls sideways at 360px', async ({
  page,
}) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);
  await openPrivacyTab(page);

  const privacy = page.getByTestId('admin-tab-privacy');
  await expect(privacy).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('admin-tab-photos')).not.toHaveAttribute('aria-current', 'page');

  // The console's tab-order decision put Privacy after Photos and before Audit; the strip is where that is visible.
  const labels = await page
    .getByRole('navigation', { name: 'Admin console sections' })
    .getByRole('link')
    .allInnerTexts();
  expect(labels.slice(-3)).toEqual(['Photos', 'Privacy', 'Audit']);

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrollsSideways).toBe(false);
});

test('a signed-out visitor is shown no erasure form and no tab strip', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockErasure(page);

  await page.goto('/admin/privacy');

  await expect(page.getByTestId('admin-privacy-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-privacy-email')).toBeHidden();
  await expect(page.getByTestId('admin-tab-privacy')).toBeHidden();
});
