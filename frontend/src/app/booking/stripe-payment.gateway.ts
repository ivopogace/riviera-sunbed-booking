import { Injectable } from '@angular/core';
import type { Stripe, StripeElementLocale, StripeElements, StripeError } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';

import { environment } from '../../environments/environment';
import { buildLocale } from '../shared/display-locale';
import { CheckoutSession, EmbeddedCheckoutGateway } from './checkout.gateway';
import { PaymentFailure, paymentFailureMessage } from './payment-failure';

const STRIPE_LOCALES: Readonly<Record<string, StripeElementLocale>> = {
  en: 'en',
  it: 'it',
  de: 'de',
};

/**
 * The Elements locale for a build: its own language where Stripe has it, else English. Never
 * `'auto'`, which follows the browser rather than the guest's chosen build; Albanian (`sq`) is not
 * a Stripe locale.
 */
export function stripeElementsLocale(locale: string): StripeElementLocale {
  return STRIPE_LOCALES[locale] ?? 'en';
}

const FAILURES_BY_CODE: Readonly<Record<string, PaymentFailure>> = {
  card_declined: 'declined',
  insufficient_funds: 'insufficient-funds',
  expired_card: 'expired-card',
  incorrect_cvc: 'incorrect-cvc',
  authentication_required: 'authentication-required',
  payment_intent_authentication_failure: 'authentication-failed',
};

/**
 * Reads a Stripe error as a {@link PaymentFailure}: a known `decline_code` first, then the `code`,
 * so an unlisted decline (`stolen_card`, `fraudulent`) stays a plain `card_declined`, as Stripe
 * asks; a client-side `validation_error` is the guest's input.
 */
export function stripeFailure(error: Partial<StripeError>): PaymentFailure {
  const known = (code: string | undefined) => (code ? FAILURES_BY_CODE[code] : undefined);
  return (
    known(error.decline_code) ??
    known(error.code) ??
    (error.type === 'validation_error' ? 'invalid-details' : 'unknown')
  );
}

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
 * Real adapter: loads Stripe.js from js.stripe.com (PCI: never bundled) via the `pure` entry, so the
 * script is fetched only on mount, never at boot (ADR-0022); mounts a Payment Element in the build's
 * locale and confirms with `redirect: 'if_required'`, so a card stays on the page. A failure shows
 * our own {@link PaymentFailure} copy, never Stripe's message. Takes the **publishable** key from
 * {@link environment}; the secret key never reaches the browser.
 */
@Injectable()
export class StripeJsPaymentGateway extends EmbeddedCheckoutGateway {
  override async mount(host: HTMLElement, clientSecret: string): Promise<CheckoutSession> {
    const stripe = await this.load();
    if (!stripe) {
      throw new Error($localize`Stripe.js failed to load.`);
    }
    const elements: StripeElements = stripe.elements({
      clientSecret,
      locale: stripeElementsLocale(buildLocale()),
    });
    elements.create('payment').mount(host);

    return {
      confirm: async () => {
        const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
        return error ? { error: paymentFailureMessage(stripeFailure(error)) } : {};
      },
    };
  }

  /** The one Stripe.js touchpoint, so a spec can stand in for js.stripe.com. */
  protected load(): Promise<Stripe | null> {
    const key = environment.stripePublishableKey;
    assertPublishableKey(key);
    return loadStripe(key);
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
      return Promise.reject(new Error($localize`Stripe.js failed to load.`));
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
            ? { error: $localize`This PaymentIntent has been canceled.` }
            : {},
        ),
    });
  }
}
