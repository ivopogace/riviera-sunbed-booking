import { expect, Page, test } from '@playwright/test';

import { mockOperatorLifecycleApi } from './support/auth-mocks';
import { expectNoSeriousAxeViolations } from './support/axe';
import { OperatorSignInPage } from './support/pages/operator-sign-in.page';

/**
 * Real-render behaviour + a11y audit of the admin console's mail-delivery card: an admin looks
 * a tourist up by the address they booked with, reads what actually happened to each confirmation
 * mail, and presses Resend on the one that never arrived.
 *
 * The delivery API is mocked statefully below so the spec is self-contained and runs in CI
 * (`npm run test:e2e:a11y`). What it cannot prove — that a resend drives no other `BookingConfirmed`
 * consumer — is proven against real Postgres by `AdminMailDeliveryIT`; this spec proves the console
 * drives the endpoints correctly, reports every outcome as an outcome, and stays accessible doing it.
 */

const ADMIN = { username: 'operator', password: 'admin-pw' };
const TOURIST_EMAIL = 'tourist@example.com';
const ARRIVAL_CODE = 'ABCD2345';

interface AttemptJson {
  source: 'AUTOMATIC' | 'ADMIN_RESEND';
  outcome: 'SENT' | 'WITHHELD_SUPPRESSED' | 'TRANSPORT_FAILED' | 'ABANDONED_MISSING_FACTS';
  attemptedAt: string;
}

/**
 * The mail-delivery endpoints, stateful: a successful resend appends an `ADMIN_RESEND` attempt, so the
 * card's post-action re-read has something new to show — the backend's own behaviour, without a clock.
 */
async function mockMailDelivery(
  page: Page,
  options: { attempts: AttemptJson[]; resendOutcome?: string },
): Promise<void> {
  const attempts = [...options.attempts];
  const outcome = options.resendOutcome ?? 'SENT';

  await page.route(/\/api\/admin\/mail-deliveries\/lookup$/, (route) =>
    route.fulfill({
      json: {
        bookings: [
          {
            bookingId: 42,
            venueName: 'Vala Beach',
            bookingDate: '2026-08-01',
            everConfirmed: true,
            attempts,
          },
          {
            bookingId: 43,
            venueName: 'Vala Beach',
            bookingDate: '2026-07-04',
            everConfirmed: false,
            attempts: [],
          },
        ],
      },
    }),
  );

  await page.route(/\/api\/admin\/mail-deliveries\/\d+\/resend$/, (route) => {
    if (outcome === 'SENT') {
      attempts.unshift({
        source: 'ADMIN_RESEND',
        outcome: 'SENT',
        attemptedAt: '2026-07-30T09:31:00Z',
      });
    }
    return route.fulfill({ json: { outcome } });
  });
}

/**
 * The outbox status the page loads before it renders anything else. Mocked here because this
 * card lives on that page: without it the page shows its own load error and no card exists to test.
 */
async function mockEmptyOutbox(page: Page): Promise<void> {
  await page.route(/\/api\/admin\/mail-outbox$/, (route) =>
    route.fulfill({ json: { outstanding: 0, cooldownRemainingSeconds: 0 } }),
  );
}

/** Sign in as the platform admin and open the Email tab. */
async function openEmailTab(page: Page): Promise<void> {
  await mockEmptyOutbox(page);
  await page.goto('/operator');
  await new OperatorSignInPage(page).signIn(ADMIN.username, ADMIN.password);
  await page.goto('/admin/email');
}

async function lookUp(page: Page, email = TOURIST_EMAIL): Promise<void> {
  await page.getByTestId('admin-delivery-email').fill(email);
  await page.getByTestId('admin-delivery-lookup').click();
}

const WITHHELD_AUTOMATIC: AttemptJson = {
  source: 'AUTOMATIC',
  outcome: 'WITHHELD_SUPPRESSED',
  attemptedAt: '2026-07-29T14:02:11Z',
};

test('an admin sees why a confirmation never arrived and sends it again', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailDelivery(page, { attempts: [WITHHELD_AUTOMATIC] });
  await openEmailTab(page);

  await lookUp(page);

  // The answer support actually needs: nothing was sent, and this is why.
  const attempts = page.getByTestId('admin-delivery-attempts').first();
  await expect(attempts).toContainText('Sent automatically');
  await expect(attempts).toContainText('withheld (address suppressed)');
  await expectNoSeriousAxeViolations(page, 'admin mail delivery with a withheld attempt');

  await page.getByTestId('admin-delivery-resend-42').click();

  await expect(page.getByTestId('admin-delivery-notice')).toContainText('sent again');
  // The card re-reads rather than assuming — the new attempt is the server's, not the client's.
  await expect(page.getByTestId('admin-delivery-attempts').first()).toContainText(
    'Resent by admin',
  );
  await expectNoSeriousAxeViolations(page, 'admin mail delivery after a resend');
});

test('a withheld resend reads as an explanation, not as a failure', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailDelivery(page, {
    attempts: [WITHHELD_AUTOMATIC],
    resendOutcome: 'WITHHELD_SUPPRESSED',
  });
  await openEmailTab(page);
  await lookUp(page);

  await page.getByTestId('admin-delivery-resend-42').click();

  const notice = page.getByTestId('admin-delivery-notice');
  await expect(notice).toContainText('suppression list');
  await expect(page.getByTestId('admin-delivery-error')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'admin mail delivery with a withheld resend');
});

test('a booking that was never confirmed says no confirmation was due', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailDelivery(page, { attempts: [WITHHELD_AUTOMATIC] });
  await openEmailTab(page);

  await lookUp(page);

  await expect(page.getByTestId('admin-delivery-not-due')).toContainText(
    'no confirmation email was due',
  );
});

test('an address with no bookings is an empty result, not an error', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await page.route(/\/api\/admin\/mail-deliveries\/lookup$/, (route) =>
    route.fulfill({ json: { bookings: [] } }),
  );
  await openEmailTab(page);

  await lookUp(page, 'nobody@example.com');

  await expect(page.getByTestId('admin-delivery-empty')).toBeVisible();
  await expect(page.getByTestId('admin-delivery-error')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page, 'admin mail delivery with no results');
});

/** Invariant #7: the arrival code is the tourist's credential and this console never shows it. */
test('the console never renders an arrival code', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailDelivery(page, { attempts: [WITHHELD_AUTOMATIC] });
  await openEmailTab(page);

  await lookUp(page);

  await expect(page.getByTestId('admin-delivery-results')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(ARRIVAL_CODE);
});

test('a signed-out visitor is shown no delivery card', async ({ page }) => {
  await mockOperatorLifecycleApi(page, { admin: ADMIN });
  await mockMailDelivery(page, { attempts: [] });
  await mockEmptyOutbox(page);

  await page.goto('/admin/email');

  await expect(page.getByTestId('admin-outbox-signed-out')).toBeVisible();
  await expect(page.getByTestId('admin-delivery-card')).toHaveCount(0);
});
