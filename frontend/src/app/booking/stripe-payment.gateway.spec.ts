import {
  assertPublishableKey,
  FakeStripePaymentGateway,
  StripeJsPaymentGateway,
} from './stripe-payment.gateway';

interface FailFlagWindow {
  __RIVIERA_FAKE_STRIPE_FAIL__?: boolean;
}

/**
 * The real gateway loads Stripe.js from js.stripe.com, which cannot run under jsdom — so the
 * unit-testable behavior is the **config guard**: an unconfigured publishable key fails fast with
 * a clear error, before any network/Stripe.js call. The mount/confirm happy path is exercised
 * through a fake gateway in the component specs and the Playwright e2e (Stripe mocked).
 *
 * `environment.stripePublishableKey` is `''` in the dev/test environment (no fileReplacements in
 * test), so this asserts the empty-key path.
 */
describe('StripeJsPaymentGateway', () => {
  it('rejects with a clear error when the publishable key is not configured', async () => {
    const gateway = new StripeJsPaymentGateway();
    const host = document.createElement('div');

    await expect(gateway.mountPaymentElement(host, 'pi_1_secret_x')).rejects.toThrow(
      /publishable key/i,
    );
  });
});

/**
 * The fake the Playwright e2e swaps in. Its contract is small but load-bearing, and the half that
 * matters is *when* the failure flag is read: a spec arms `__RIVIERA_FAKE_STRIPE_FAIL__` after the
 * element has mounted, so a confirm that captured the flag at mount time would silently succeed.
 */
describe('FakeStripePaymentGateway', () => {
  afterEach(() => {
    delete (window as FailFlagWindow).__RIVIERA_FAKE_STRIPE_FAIL__;
  });

  it('mounts a labelled stand-in for the card field, so the page stays auditable', async () => {
    const host = document.createElement('div');

    await new FakeStripePaymentGateway().mountPaymentElement(host);

    const input = host.querySelector<HTMLInputElement>('[data-testid="fake-card-input"]')!;
    expect(input.getAttribute('aria-label')).toBe('Card number (test mode)');
  });

  it('confirms successfully while the failure flag is unset', async () => {
    const checkout = await new FakeStripePaymentGateway().mountPaymentElement(
      document.createElement('div'),
    );

    await expect(checkout.confirm()).resolves.toEqual({});
  });

  it('reads the failure flag at confirm time, not at mount time', async () => {
    const checkout = await new FakeStripePaymentGateway().mountPaymentElement(
      document.createElement('div'),
    );

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

  it('accepts a publishable key (pk_…)', () => {
    expect(() => assertPublishableKey('pk_test_123')).not.toThrow();
  });
});
