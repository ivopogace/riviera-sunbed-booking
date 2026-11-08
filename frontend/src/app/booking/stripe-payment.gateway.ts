import { Injectable } from '@angular/core';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';

import { environment } from '../../environments/environment';
import { CheckoutSession, EmbeddedCheckoutGateway } from './checkout.gateway';

/**
 * Validate the configured Stripe key before it reaches Stripe.js: empty fails loudly, a secret key
 * (`sk_…`) must never ship to the browser, and anything but a test publishable key is refused, the
 * Stripe path being sandbox-only (ADR-0029). The page shows these messages, so none echoes the key.
 */
export function assertPublishableKey(key: string): void {
  if (!key) {
    throw new Error('Stripe publishable key is not configured (environment.stripePublishableKey).');
  }
  if (key.startsWith('sk_')) {
    throw new Error(
      'Refusing a Stripe secret key (sk_…) in the browser — configure a publishable key (pk_…).',
    );
  }
  if (!key.startsWith('pk_test_')) {
    throw new Error(
      'Refusing this Stripe key: payments here are sandbox-only (ADR-0029) — configure a test publishable key (pk_test_…).',
    );
  }
}

/**
 * Real adapter: loads Stripe.js from js.stripe.com (PCI — never bundled or self-hosted) — through
 * the package's `pure` entry, so the script is fetched only when a Payment Element is mounted and
 * never as a side effect of the app booting (the tourist surfaces make no third-party request,
 * ADR-0022) — mounts a Payment Element bound to the PaymentIntent's client secret, and confirms
 * with `redirect: 'if_required'`, so a card stays on the payment page. Uses the **publishable** key
 * from {@link environment} (a `pk_…`, safe in the client bundle; the secret key never reaches the browser).
 */
@Injectable()
export class StripeJsPaymentGateway extends EmbeddedCheckoutGateway {
  override async mount(host: HTMLElement, clientSecret: string): Promise<CheckoutSession> {
    const key = environment.stripePublishableKey;
    assertPublishableKey(key);
    const stripe: Stripe | null = await loadStripe(key);
    if (!stripe) {
      throw new Error('Stripe.js failed to load.');
    }
    const elements: StripeElements = stripe.elements({ clientSecret });
    elements.create('payment').mount(host);

    return {
      confirm: async () => {
        const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
        return error
          ? { error: error.message ?? 'Your payment could not be completed. Please try again.' }
          : {};
      },
    };
  }
}

/**
 * Deterministic fake for the Playwright a11y runs (real Stripe.js loads from js.stripe.com and would
 * make CI flaky), active **only** when the harness sets `window.__RIVIERA_FAKE_STRIPE__`. Renders a
 * labelled stand-in card field and confirms; the page then polls the mocked backend.
 * `__RIVIERA_FAKE_STRIPE_FAIL__` fails confirm like a dead PaymentIntent and
 * `__RIVIERA_FAKE_STRIPE_MOUNT_FAIL__` fails the mount like a blocked js.stripe.com; each is read
 * when called, so a test can flip it mid-page.
 */
@Injectable()
export class FakeStripePaymentGateway extends EmbeddedCheckoutGateway {
  override mount(host: HTMLElement): Promise<CheckoutSession> {
    if (
      (window as unknown as { __RIVIERA_FAKE_STRIPE_MOUNT_FAIL__?: boolean })
        .__RIVIERA_FAKE_STRIPE_MOUNT_FAIL__
    ) {
      return Promise.reject(new Error('Stripe.js failed to load.'));
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '4242 4242 4242 4242';
    input.setAttribute('aria-label', 'Card number (test mode)');
    input.dataset['testid'] = 'fake-card-input';
    input.dataset['touchExempt'] = 'stands in for the Stripe Element, which renders in an iframe';
    host.appendChild(input);
    return Promise.resolve({
      confirm: () =>
        Promise.resolve(
          (window as unknown as { __RIVIERA_FAKE_STRIPE_FAIL__?: boolean })
            .__RIVIERA_FAKE_STRIPE_FAIL__
            ? { error: 'This PaymentIntent has been canceled.' }
            : {},
        ),
    });
  }
}
