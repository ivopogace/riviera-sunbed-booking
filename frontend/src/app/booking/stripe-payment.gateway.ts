import { Injectable } from '@angular/core';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';

import { environment } from '../../environments/environment';

/**
 * A mounted Stripe Payment Element the caller can confirm.
 *
 * <p>{@link confirm} returns a **UX-level** result only: on `{ error }` the caller shows it and
 * re-checks the booking's server status once (retry while payable, terminal when not); otherwise
 * it begins polling. **Never** proof of confirmation: that comes only from the signature-verified
 * webhook, seen via `GET /api/bookings/{code}` (invariant #8). Cards use
 * `redirect: 'if_required'`, so the user stays on the payment page.
 */
export interface StripeCheckout {
  confirm(): Promise<{ readonly error?: string }>;
}

/**
 * Injectable seam over Stripe.js. The abstract class is the DI token: the real
 * {@link StripeJsPaymentGateway} is provided in the browser, while jsdom/vitest specs and the
 * Playwright e2e provide a fake — so Stripe.js (which must load from js.stripe.com and cannot run
 * under jsdom) is only ever touched by the real adapter.
 */
export abstract class StripePaymentGateway {
  abstract mountPaymentElement(host: HTMLElement, clientSecret: string): Promise<StripeCheckout>;
}

/**
 * Validate the configured Stripe key before it reaches Stripe.js. An empty key fails loudly
 * instead of rendering a broken element; a secret key (`sk_…`) is refused outright — it must never
 * be shipped to the browser, and accepting one would only fail opaquely later.
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
}

/**
 * Real adapter: loads Stripe.js from js.stripe.com (PCI — never bundled or self-hosted) — through
 * the package's `pure` entry, so the script is fetched only when a Payment Element is mounted and
 * never as a side effect of the app booting (the tourist surfaces make no third-party request,
 * ADR-0022) — mounts a Payment Element bound to the booking's PaymentIntent `clientSecret`, and
 * confirms the card with `redirect: 'if_required'`. Uses the **publishable** key from {@link environment} (a `pk_…`,
 * which is safe in the client bundle — the secret key never reaches the browser).
 */
@Injectable()
export class StripeJsPaymentGateway extends StripePaymentGateway {
  override async mountPaymentElement(
    host: HTMLElement,
    clientSecret: string,
  ): Promise<StripeCheckout> {
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
 * Deterministic fake for Playwright a11y runs: real Stripe.js is non-deterministic and loads from
 * js.stripe.com, which would make CI flaky. Active **only** when the harness sets
 * `window.__RIVIERA_FAKE_STRIPE__` (see app.config), so inert in production. Renders a labelled
 * stand-in card field (audited honestly) and confirms; the page then polls the mocked backend as in
 * production. `__RIVIERA_FAKE_STRIPE_FAIL__` makes confirm fail like a dead PaymentIntent — read
 * at confirm time, so a test can flip it after mount.
 */
@Injectable()
export class FakeStripePaymentGateway extends StripePaymentGateway {
  override mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
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
