import { expect, test, type Page } from '@playwright/test';

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

/**
 * The same contract on the operator console and Discover, in the two shapes #1078 needed beyond a
 * plain hoist: one region for a whole table, whose sentence names the row so consecutive rows still
 * mutate it, and a panel that gives its live semantics up because a persistent sibling already
 * speaks the outcome.
 */

const CONSOLE_PRINCIPAL = { username: 'operator', principalType: 'OPERATOR' };

const CONSOLE_MAP = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Loungers on the shore.',
  ratingTenths: 48,
  reviewsCount: 12,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2000, currency: 'EUR' },
  sets: [seat(1, 'A', 1, 3500, 1, 1), seat(2, 'B', 1, 2000, 1, 2)],
};

function seat(
  id: number,
  rowLabel: string,
  positionNo: number,
  minorUnits: number,
  gridX: number,
  gridY: number,
) {
  return {
    id,
    rowLabel,
    positionNo,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits, currency: 'EUR' },
    gridX,
    gridY,
    availability: 'FREE',
  };
}

async function mockConsoleForPricing(page: Page): Promise<void> {
  let sessionLive = false;
  let setVersion = 0;
  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: CONSOLE_PRINCIPAL })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: CONSOLE_PRINCIPAL });
  });
  await page.route(/\/api\/venues\/1\/rows\/[^/]+\/price$/, (route) => {
    setVersion += 1;
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route(/\/api\/venues\/1(\?.*)?$/, (route) =>
    route.fulfill({ json: { ...CONSOLE_MAP, setVersion } }),
  );
  await page.route(/\/api\/venues\/1\/booking-requests(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/venues\/1\/bookings(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/venues\/1\/availability(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/venues\/1\/takings(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        gross: { minorUnits: 0, currency: 'EUR' },
        net: { minorUnits: 0, currency: 'EUR' },
        commissionBps: 1500,
        date: '2026-07-08',
      },
    }),
  );
}

test('row pricing announces every row through one region that outlives them (#1078)', async ({
  page,
}) => {
  await mockConsoleForPricing(page);
  await page.goto('/operator/1/pricing');
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('pw');
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click();
  await expect(page.getByTestId('pricing-tab')).toBeVisible();

  // One region for the table, mounted before any reprice and costing no layout.
  const announcer = page.getByTestId('pricing-saved-announce');
  await expect(announcer).toHaveText('');
  // A rebuilt region would be a fresh element, and a fresh element cannot carry this mark.
  await announcer.evaluate((el) => el.setAttribute('data-identity-probe', 'same-node'));

  await page.getByTestId('pricing-input-A').fill('42.5');
  await page.getByTestId('pricing-input-A').blur();
  await expect(announcer).toContainText('Row A');
  // The visible per-row copy is decoration; the announcer alone carries the words.
  await expect(page.getByTestId('pricing-saved-A')).toHaveAttribute('aria-hidden', 'true');

  await page.getByTestId('pricing-input-B').fill('30');
  await page.getByTestId('pricing-input-B').blur();

  // Naming the row is what makes a second reprice a mutation rather than the same string again.
  await expect(announcer).toContainText('Row B');
  await expect(announcer).toHaveAttribute('data-identity-probe', 'same-node');

  await expectNoSeriousAxeViolations(page, 'pricing tab, two rows repriced');
});

test('Discover leaves the empty outcome to its count region (#1078)', async ({ page }) => {
  await page.route('**/api/venues*', (route) => route.fulfill({ json: [] }));

  await page.goto('/');

  // Born holding its text, it never announced — and the count region already speaks the outcome.
  const empty = page.getByTestId('empty');
  await expect(empty).toBeVisible();
  expect(await empty.getAttribute('aria-live')).toBeNull();
  expect(await empty.getAttribute('role')).toBeNull();
  await expect(page.getByTestId('results')).toContainText('0');
});
