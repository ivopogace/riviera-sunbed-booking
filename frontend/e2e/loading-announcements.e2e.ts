import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from './support/axe';
import { mockCustomerRecoveryApi } from './support/auth-mocks';

/**
 * The loading-announcement contract in a real browser: a loading surface announces through a live
 * region that is **already in the DOM when its text changes**.
 *
 * <p>The unit specs assert the same mechanism in jsdom, where change detection is driven by hand.
 * This one holds the announcer's element handle across a genuine network round trip in Chromium —
 * if any surface ever rebuilds its region on load, the handle goes stale and this fails, which is
 * exactly the regression the unit specs cannot see through a fake scheduler.
 *
 * <p>What no automated test can assert is that a screen reader spoke. The falsifiable half is the
 * mechanism, and that is deliberately all this claims.
 */

const VENUES = [
  {
    id: 1,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    ratingTenths: 48,
    reviewsCount: 326,
    bookingMode: 'INSTANT',
    fromPrice: { minorUnits: 2500, currency: 'EUR' },
    amenities: ['SHOWERS'],
    availability: { free: 18, total: 24 },
  },
];

test('Discover announces through a region that outlives the load (#741)', async ({ page }) => {
  // Hold the response open so the loading state is observable rather than raced past.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/venues*', async (route) => {
    await held;
    await route.fulfill({ json: VENUES });
  });

  await page.goto('/');

  const announcer = page.getByTestId('load-announcer');
  await expect(announcer).toHaveText('Loading venues…');
  // The skeleton is decoration — it must not also be speaking.
  await expect(page.getByTestId('loading')).toHaveAttribute('aria-hidden', 'true');

  // A rebuilt region would be a fresh element, and a fresh element cannot carry this mark.
  await announcer.evaluate((el) => el.setAttribute('data-identity-probe', 'same-node'));

  release();
  await expect(page.getByTestId('venue-card')).toHaveCount(1);

  await expect(announcer).toHaveAttribute('data-identity-probe', 'same-node');
  // Empty by design: the persistent results-count region already spoke the outcome.
  await expect(announcer).toHaveText('');
  await expect(page.getByTestId('results')).toContainText('1');

  await expectNoSeriousAxeViolations(page, 'Discover, loaded');
});

/**
 * The same contract on the auth outcome surfaces, in two shapes: verify-email and the account
 * notice keep one region and mutate its text, while forgot and reset move focus onto a
 * confirmation whose trigger the branch destroys — a focused element is announced whatever its
 * live-region semantics, and focus is not left on <body> (WCAG 2.4.3).
 */

const RECOVERY_EMAIL = 'ana@example.com';
const RECOVERY_PASSWORD = 'passphrase-123';
const VERIFY_TOKEN = 'valid-verify-token';

test('verify-email announces through a region that outlives the switch (#1076)', async ({
  page,
}) => {
  await mockCustomerRecoveryApi(page, {
    email: RECOVERY_EMAIL,
    initialPassword: RECOVERY_PASSWORD,
    validToken: VERIFY_TOKEN,
  });
  // Registered last so it wins over the recovery mock's route, holding the POST open.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/auth\/customer\/verify-email$/, async (route) => {
    await held;
    await route.fulfill({ status: 204 });
  });

  await page.goto(`/account/verify?token=${VERIFY_TOKEN}`);

  const announcer = page.getByTestId('load-announcer');
  await expect(announcer).toHaveText('Verifying your email…');
  // The visible copy is decoration — it must not also be speaking.
  await expect(page.getByTestId('verify-pending')).toHaveAttribute('aria-hidden', 'true');

  // A rebuilt region would be a fresh element, and a fresh element cannot carry this mark.
  await announcer.evaluate((el) => el.setAttribute('data-identity-probe', 'same-node'));

  release();
  await expect(page.getByTestId('verify-success')).toBeVisible();

  await expect(announcer).toHaveAttribute('data-identity-probe', 'same-node');
  await expect(announcer).toHaveText('Your email is verified. Thanks!');
  await expect(page.getByTestId('verify-success')).toHaveAttribute('aria-hidden', 'true');

  await expectNoSeriousAxeViolations(page, 'email verified, announced');
});

test('the account notice announces through a region that predates it (#1076)', async ({ page }) => {
  await mockCustomerRecoveryApi(page, {
    email: RECOVERY_EMAIL,
    initialPassword: RECOVERY_PASSWORD,
    signedIn: true,
    emailVerified: false,
  });

  await page.goto('/account/password');

  const notice = page.getByTestId('setpw-notice');
  await expect(notice).toHaveText('');
  await notice.evaluate((el) => el.setAttribute('data-identity-probe', 'same-node'));

  await page.getByTestId('setpw-resend').click();

  await expect(notice).toContainText('Verification email sent');
  await expect(notice).toHaveAttribute('data-identity-probe', 'same-node');
});

test('the forgot and reset confirmations take focus when their form is replaced (#1076)', async ({
  page,
}) => {
  await mockCustomerRecoveryApi(page, {
    email: RECOVERY_EMAIL,
    initialPassword: RECOVERY_PASSWORD,
    validToken: 'valid-reset-token',
    challenge: 'off',
  });

  await page.goto('/account/forgot');
  await page.getByTestId('forgot-email').fill(RECOVERY_EMAIL);
  await page.getByTestId('forgot-submit').click();

  await expect(page.getByTestId('forgot-sent')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'forgot-password confirmation');

  await page.goto('/account/reset?token=valid-reset-token');
  await page.getByTestId('reset-password').fill('brandnewpass2');
  await page.getByTestId('reset-confirm').fill('brandnewpass2');
  await page.getByTestId('reset-submit').click();

  await expect(page.getByTestId('reset-done')).toBeFocused();
  await expectNoSeriousAxeViolations(page, 'reset-password confirmation');
});
