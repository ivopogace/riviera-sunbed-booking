import { expect, test, type Page } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';

/**
 * Real-render a11y + behaviour audit of the self-service right-to-erasure journey: a
 * signed-in tourist erases their account from the account page behind a two-step confirm; on success the
 * page shows an erased confirmation and the session is cleared, and a transport failure keeps them signed
 * in with an error. The erasure API is mocked statefully, so this runs in CI (`npm run test:e2e:a11y`).
 *
 * <p>The page is reached through the shell's account menu rather than by URL — the session is
 * still faked at `/api/auth/me`, so the spec lands on Discover first to get a signed-in header to click.
 */

/** Reach the account page the way a tourist does — through the header, not a URL. */
async function gotoAccount(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('nav-user').click();
  await page.getByTestId('nav-account-link').click();
}

const EMAIL = 'ana@example.com';

const unauthorized = {
  status: 401,
  contentType: 'application/problem+json',
  body: JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'UNAUTHENTICATED' }),
};

test('a signed-in tourist erases their account behind a confirm', async ({ page }) => {
  let signedIn = true;
  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: { username: EMAIL, principalType: 'CUSTOMER', emailVerified: true } })
      : route.fulfill(unauthorized),
  );
  await page.route(/\/api\/me\/erasure$/, (route) => {
    signedIn = false; // the backend revokes every session as part of the scrub
    return route.fulfill({ status: 204 });
  });
  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });

  await gotoAccount(page);
  await expect(page.getByTestId('setpw-email')).toBeVisible();
  await expectNoSeriousAxeViolations(page, 'account page with danger zone');

  // The trigger only reveals the confirm; nothing is erased until the explicit confirm.
  await page.getByTestId('erase-account').click();
  await expect(page.getByTestId('erase-warning')).toBeVisible();

  await page.getByTestId('erase-confirm').click();
  await expect(page.getByTestId('erase-done')).toBeVisible();
  await expect(page.getByTestId('setpw-email')).toBeHidden();
  await expectNoSeriousAxeViolations(page, 'account erased confirmation');
});

test('a failed erasure keeps the tourist signed in with an error', async ({ page }) => {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ json: { username: EMAIL, principalType: 'CUSTOMER', emailVerified: true } }),
  );
  await page.route(/\/api\/me\/erasure$/, (route) => route.fulfill({ status: 500 }));

  await gotoAccount(page);
  await page.getByTestId('erase-account').click();
  await page.getByTestId('erase-confirm').click();

  await expect(page.getByTestId('erase-error')).toBeVisible();
  await expect(page.getByTestId('erase-done')).toBeHidden();
  await expect(page.getByTestId('setpw-email')).toBeVisible();
});

/**
 * The in-flight window, which only a real browser shows: it runs the unfocusing steps the instant a
 * focused element is disabled, and jsdom does not. The erasure is held open so the assertion lands
 * mid-request rather than after it, because that whole window is what used to sit on `<body>`.
 */
test('a failed erasure never strands focus while the request is in flight', async ({ page }) => {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ json: { username: EMAIL, principalType: 'CUSTOMER', emailVerified: true } }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/me\/erasure$/, async (route) => {
    await held;
    return route.fulfill({ status: 500 });
  });

  await gotoAccount(page);
  await page.getByTestId('erase-account').click();
  await expect(page.getByTestId('erase-confirm')).toBeFocused();

  await page.getByTestId('erase-confirm').click();

  // Mid-request: announced as unavailable, still holding focus.
  await expect(page.getByTestId('erase-confirm')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('erase-confirm')).toBeFocused();

  release();
  await expect(page.getByTestId('erase-error')).toBeVisible();
  await expect(page.getByTestId('erase-confirm')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'account page after a failed erasure');
});

test('the erase confirmation returns focus to the trigger when the tourist backs out', async ({
  page,
}) => {
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ json: { username: EMAIL, principalType: 'CUSTOMER', emailVerified: true } }),
  );

  await gotoAccount(page);
  await page.getByTestId('erase-account').click();
  await expect(page.getByTestId('erase-confirm')).toBeFocused();

  await page.getByTestId('erase-cancel').click();

  await expect(page.getByTestId('erase-account')).toBeFocused();
});
