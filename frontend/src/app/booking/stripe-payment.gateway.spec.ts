import type { Stripe, StripeError } from '@stripe/stripe-js';

import {
  assertPublishableKey,
  FakeStripePaymentGateway,
  StripeJsPaymentGateway,
  stripeElementsLocale,
  stripeFailure,
} from './stripe-payment.gateway';

interface FailFlagWindow {
  __RIVIERA_FAKE_STRIPE_FAIL__?: boolean;
  __RIVIERA_FAKE_STRIPE_MOUNT_FAIL__?: boolean;
}

/**
 * The real gateway loads Stripe.js from js.stripe.com, which cannot run under jsdom. With the
 * loader untouched, the unit-testable behavior is the **config guard**: `environment.stripePublishableKey`
 * is `''` in the test environment, so the empty-key path fails fast before any network call. The
 * Elements options and the error mapping run against a stubbed loader below.
 */
describe('StripeJsPaymentGateway', () => {
  it('rejects with a clear error when the publishable key is not configured', async () => {
    const gateway = new StripeJsPaymentGateway();
    const host = document.createElement('div');

    await expect(gateway.mount(host, 'pi_1_secret_x')).rejects.toThrow(/publishable key/i);
  });
});

/** Stands in for Stripe.js: records the Elements options and answers confirm with a set error. */
class StubbedStripeGateway extends StripeJsPaymentGateway {
  elementsOptions: unknown;
  confirmError: Partial<StripeError> | undefined;

  protected override load(): Promise<Stripe | null> {
    const stripe = {
      elements: (options: unknown) => {
        this.elementsOptions = options;
        return { create: () => ({ mount: () => undefined }) };
      },
      confirmPayment: () => Promise.resolve(this.confirmError ? { error: this.confirmError } : {}),
    };
    return Promise.resolve(stripe as unknown as Stripe);
  }
}

describe('StripeJsPaymentGateway with Stripe.js stubbed', () => {
  const localize = (globalThis as unknown as { $localize: { locale?: string } }).$localize;
  const sourceLocale = localize.locale;

  afterEach(() => {
    localize.locale = sourceLocale;
  });

  it("passes the build's Stripe locale to Elements, so its labels follow the chosen language", async () => {
    localize.locale = 'it';
    const gateway = new StubbedStripeGateway();

    await gateway.mount(document.createElement('div'), 'pi_1_secret_x');

    expect(gateway.elementsOptions).toEqual({ clientSecret: 'pi_1_secret_x', locale: 'it' });
  });

  it("shows our own copy for a decline, never Stripe's message", async () => {
    const gateway = new StubbedStripeGateway();
    gateway.confirmError = {
      type: 'card_error',
      code: 'card_declined',
      decline_code: 'insufficient_funds',
      message: 'Your card has insufficient funds.',
    };
    const checkout = await gateway.mount(document.createElement('div'), 'pi_1_secret_x');

    const step = await checkout.confirm();

    expect(step.error).toMatch(/not enough funds/);
    expect(step.error).not.toBe('Your card has insufficient funds.');
  });

  it('confirms with no error when Stripe reports none', async () => {
    const checkout = await new StubbedStripeGateway().mount(
      document.createElement('div'),
      'pi_1_secret_x',
    );

    await expect(checkout.confirm()).resolves.toEqual({});
  });
});

describe('stripeElementsLocale', () => {
  it.each([
    ['en', 'en'],
    ['it', 'it'],
    ['de', 'de'],
    ['sq', 'en'],
    ['fr', 'en'],
  ])(
    'maps the %s build to Stripe locale %s, never auto (the browser language)',
    (build, stripe) => {
      expect(stripeElementsLocale(build)).toBe(stripe);
    },
  );
});

describe('stripeFailure', () => {
  it.each<[Partial<StripeError>, string]>([
    [{ type: 'card_error', code: 'card_declined', decline_code: 'generic_decline' }, 'declined'],
    [
      { type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds' },
      'insufficient-funds',
    ],
    [{ type: 'card_error', code: 'expired_card' }, 'expired-card'],
    [{ type: 'card_error', code: 'card_declined', decline_code: 'expired_card' }, 'expired-card'],
    [{ type: 'card_error', code: 'incorrect_cvc' }, 'incorrect-cvc'],
    [{ type: 'card_error', code: 'card_declined', decline_code: 'incorrect_cvc' }, 'incorrect-cvc'],
    [
      { type: 'card_error', code: 'card_declined', decline_code: 'authentication_required' },
      'authentication-required',
    ],
    [
      { type: 'invalid_request_error', code: 'payment_intent_authentication_failure' },
      'authentication-failed',
    ],
    [{ type: 'validation_error', code: 'incomplete_number' }, 'invalid-details'],
    [{ type: 'invalid_request_error', code: 'payment_intent_unexpected_state' }, 'unknown'],
    [{ type: 'api_error' }, 'unknown'],
  ])('reads %o as %s', (error, failure) => {
    expect(stripeFailure(error)).toBe(failure);
  });

  it.each(['stolen_card', 'lost_card', 'fraudulent', 'merchant_blacklist'])(
    'reads the fraud-flagged decline %s as a plain decline, so the guest learns nothing more',
    (declineCode) => {
      expect(
        stripeFailure({ type: 'card_error', code: 'card_declined', decline_code: declineCode }),
      ).toBe('declined');
    },
  );
});

/**
 * The fake the Playwright e2e swaps in. Its contract is small but load-bearing, and the half that
 * matters is *when* the failure flag is read: a spec arms `__RIVIERA_FAKE_STRIPE_FAIL__` after the
 * element has mounted, so a confirm that captured the flag at mount time would silently succeed.
 */
describe('FakeStripePaymentGateway', () => {
  afterEach(() => {
    delete (window as FailFlagWindow).__RIVIERA_FAKE_STRIPE_FAIL__;
    delete (window as FailFlagWindow).__RIVIERA_FAKE_STRIPE_MOUNT_FAIL__;
  });

  it('fails the mount while the mount-failure flag is set, and mounts once it is cleared', async () => {
    const gateway = new FakeStripePaymentGateway();
    const host = document.createElement('div');

    (window as FailFlagWindow).__RIVIERA_FAKE_STRIPE_MOUNT_FAIL__ = true;
    await expect(gateway.mount(host)).rejects.toThrow(/failed to load/);
    expect(host.childElementCount).toBe(0);

    delete (window as FailFlagWindow).__RIVIERA_FAKE_STRIPE_MOUNT_FAIL__;
    await gateway.mount(host);
    expect(host.querySelector('[data-testid="fake-card-input"]')).not.toBeNull();
  });

  it('mounts a labelled stand-in for the card field, so the page stays auditable', async () => {
    const host = document.createElement('div');

    await new FakeStripePaymentGateway().mount(host);

    const input = host.querySelector<HTMLInputElement>('[data-testid="fake-card-input"]')!;
    expect(input.getAttribute('aria-label')).toBe('Card number (test mode)');
  });

  it('confirms successfully while the failure flag is unset', async () => {
    const checkout = await new FakeStripePaymentGateway().mount(document.createElement('div'));

    await expect(checkout.confirm()).resolves.toEqual({});
  });

  it('reads the failure flag at confirm time, not at mount time', async () => {
    const checkout = await new FakeStripePaymentGateway().mount(document.createElement('div'));

    (window as FailFlagWindow).__RIVIERA_FAKE_STRIPE_FAIL__ = true;

    await expect(checkout.confirm()).resolves.toEqual({
      error: 'This PaymentIntent has been canceled.',
    });
  });
});

describe('assertPublishableKey', () => {
  it('throws on an empty key', () => {
    expect(() => assertPublishableKey('')).toThrow(/not configured/i);
  });

  it('refuses a secret key (sk_…) — never ship a secret to the browser (invariant #8)', () => {
    expect(() => assertPublishableKey('sk_test_deadbeef')).toThrow(/secret key/i);
  });

  it.each(['pk_live_abc123', 'rk_live_abc123', 'rk_test_abc123', ' pk_live_abc123'])(
    'refuses %s — the Stripe path is sandbox-only (ADR-0029), and never echoes the key',
    (key) => {
      expect(() => assertPublishableKey(key)).toThrow(/sandbox-only/i);
      expect(() => assertPublishableKey(key)).not.toThrow(key.trim());
    },
  );

  it('accepts a test publishable key (pk_test_…)', () => {
    expect(() => assertPublishableKey('pk_test_123')).not.toThrow();
  });
});
