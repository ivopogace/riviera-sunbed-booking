import { inject, Service } from '@angular/core';

import { PageNavigation } from '../core/page-navigation';
import { CheckoutInstruction } from './booking.model';

/**
 * A started checkout the page can confirm. {@link confirm} is **never** proof of payment: only the
 * verified webhook confirms, seen via `GET /api/bookings/{code}` (invariant #8). `error` is shown and
 * the booking re-checked (a rejection reads as one); `redirecting` means the browser is leaving.
 */
export interface CheckoutSession {
  confirm(): Promise<CheckoutStep>;
}

export interface CheckoutStep {
  readonly error?: string;
  readonly redirecting?: boolean;
}

/**
 * Seam over an in-page payment form. The abstract class is the DI token: Stripe.js in the browser, a
 * fake in jsdom/vitest specs and the Playwright e2e, so the provider's script is only ever touched
 * by the real adapter.
 */
export abstract class EmbeddedCheckoutGateway {
  abstract mount(host: HTMLElement, clientToken: string): Promise<CheckoutSession>;
}

/** Starts the checkout an instruction names: an embedded form, or the provider's own page. */
@Service()
export class CheckoutGateway {
  private readonly embedded = inject(EmbeddedCheckoutGateway);
  private readonly navigation = inject(PageNavigation);

  start(host: HTMLElement, instruction: CheckoutInstruction): Promise<CheckoutSession> {
    switch (instruction.kind) {
      case 'EMBEDDED':
        return this.embedded.mount(host, instruction.clientToken);
      case 'REDIRECT':
        return this.redirectTo(instruction.url);
    }
  }

  /** The browser leaves only on {@link CheckoutSession.confirm}, so the guest sees the summary first. */
  private redirectTo(url: string): Promise<CheckoutSession> {
    if (!URL.canParse(url) || new URL(url).protocol !== 'https:') {
      return Promise.reject(new Error('Could not open the payment page. Please try again.'));
    }
    return Promise.resolve({
      confirm: () => {
        this.navigation.leaveTo(url);
        return Promise.resolve({ redirecting: true });
      },
    });
  }
}
