import { assertPublishableKey, StripeJsPaymentGateway } from './stripe-payment.gateway';

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
