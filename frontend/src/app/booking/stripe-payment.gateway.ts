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
    if (!key) {
      throw new Error(
        'Stripe publishable key is not configured (environment.stripePublishableKey).',
      );
    }
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
