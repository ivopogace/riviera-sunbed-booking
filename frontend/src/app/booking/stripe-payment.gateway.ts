import { Injectable } from '@angular/core';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';

import { environment } from '../../environments/environment';

/**
 * A mounted Stripe Payment Element the caller can confirm.
 *
 * <p>{@link confirm} returns a **UX-level** result only — `{ error }` ⇒ show the message and let
 * the user retry; otherwise the card step finished and the caller begins polling the backend.
 * It is **never** treated as proof the booking is confirmed: confirmation comes only from the
 * signature-verified webhook, observed via `GET /api/bookings/{code}` (invariant #8). No redirect
 * is used for cards (`redirect: 'if_required'`), so the user stays on the payment page.
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
 * be shipped to the browser (invariant #8), and accepting one would only fail opaquely later.
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
 * Real adapter: loads Stripe.js from js.stripe.com (PCI — never bundled or self-hosted), mounts a
 * Payment Element bound to the booking's PaymentIntent `clientSecret`, and confirms the card with
 * `redirect: 'if_required'`. Uses the **publishable** key from {@link environment} (a `pk_…`,
 * which is safe in the client bundle — the secret key never reaches the browser, invariant #8).
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
 * Deterministic fake for end-to-end a11y runs (Playwright): real Stripe.js is non-deterministic
 * and must load from js.stripe.com, which would make CI flaky. Activated **only** when the test
 * harness sets `window.__RIVIERA_FAKE_STRIPE__` (see app.config) — it is inert in production,
 * which never sets that flag. It renders a labelled stand-in for the card field (so the page's
 * a11y is audited honestly) and confirms successfully, after which the page polls the mocked
 * backend exactly as in production.
 */
@Injectable()
export class FakeStripePaymentGateway extends StripePaymentGateway {
  override async mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '4242 4242 4242 4242';
    input.setAttribute('aria-label', 'Card number (test mode)');
    input.dataset['testid'] = 'fake-card-input';
    host.appendChild(input);
    return { confirm: async () => ({}) };
  }
}
