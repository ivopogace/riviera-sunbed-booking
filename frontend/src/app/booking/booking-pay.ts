import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, Subscription, switchMap, timer } from 'rxjs';

import { MoneyView } from '../venue/venue.model';
import { BookingService } from './booking.service';
import { StripeCheckout, StripePaymentGateway } from './stripe-payment.gateway';

/** Poll cadence and budget for awaiting the webhook-driven CONFIRMED transition. */
const POLL_MS = 1500;
const POLL_WINDOW_MS = 30_000;

type PayState = 'mounting' | 'ready' | 'processing' | 'confirmed' | 'awaiting' | 'error' | 'missing';

/**
 * Payment page for the `stripe` profile (U4-FE, issue #50), reached on a `202 AWAITING_PAYMENT`
 * booking-create. It mounts the Stripe Payment Element on the booking's `clientSecret`, confirms
 * the card, then **polls `GET /api/bookings/{code}` for `CONFIRMED`** — the booking is confirmed
 * only by the signature-verified webhook (invariant #8), **never** from the Stripe.js result.
 *
 * <p>States: `mounting` → `ready` (card form shown) → on pay: `error` (declined/failed — retry in
 * place, the element stays mounted, no polling) or `processing` (polling) → `confirmed` (backend
 * said so) or `awaiting` (webhook hasn't landed within ~30s — "payment received, awaiting
 * confirmation", never claims "confirmed"). A cold load with no hand-off shows `missing`.
 *
 * <p>The booking summary comes from {@link BookingService#lastAwaitingPayment} (set by the 202
 * POST), mirroring the confirmation screen's in-memory hand-off.
 */
@Component({
  selector: 'app-booking-pay',
  imports: [RouterLink],
  template: `
    @if (state() === 'missing') {
      <section class="pay" aria-labelledby="pay-title">
        <h1 id="pay-title">No payment in progress</h1>
        <p class="lead">Your payment session isn’t available here anymore. Please start a new booking.</p>
        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else {
      <section class="pay" aria-labelledby="pay-title">
        @switch (state()) {
          @case ('confirmed') {
            <h1 id="pay-title">Booking confirmed</h1>
            <p class="lead">Your payment is complete. Show this code to staff when you arrive.</p>
          }
          @case ('awaiting') {
            <h1 id="pay-title">Payment received</h1>
            <p class="lead">
              We’ve received your payment and are waiting for final confirmation. This can take a
              moment — your booking is saved under the code below, and you can check it any time.
            </p>
          }
          @default {
            <h1 id="pay-title">Complete your payment</h1>
            <p class="lead">Enter your card details to confirm your sunbed booking.</p>
          }
        }

        <dl class="summary">
          <dt>Venue</dt>
          <dd>{{ booking!.venueName }}</dd>
          <dt>Set</dt>
          <dd>{{ booking!.rowLabel }} · spot {{ booking!.positionNo }}</dd>
          <dt>Date</dt>
          <dd>{{ booking!.bookingDate }}</dd>
          <dt>Total</dt>
          <dd>{{ money(booking!.amount) }}</dd>
        </dl>

        @if (state() === 'confirmed' || state() === 'awaiting') {
          <p class="code" data-testid="booking-code">
            <span class="code-label">Booking code</span>
            <strong>{{ code }}</strong>
          </p>
        }

        <!-- Status of the payment/confirmation, announced to assistive tech. -->
        <p class="status" role="status" aria-live="polite" data-testid="pay-status">
          @switch (state()) {
            @case ('mounting') { Loading the secure payment form… }
            @case ('processing') { Processing your payment — please wait… }
            @case ('confirmed') { Your booking is confirmed. }
            @case ('awaiting') { Payment received — awaiting confirmation. }
          }
        </p>

        @if (errorMessage(); as msg) {
          <p class="form-error" role="alert" data-testid="pay-error">{{ msg }}</p>
        }

        <!-- Payment Element host. Kept in the DOM across mounting/ready/error so the Stripe iframe
             survives a retry; hidden (not removed) once the card step is done. -->
        <div #peHost class="pe-host" [hidden]="!showElement()" data-testid="pe-host"></div>

        @if (showPayButton()) {
          <button
            type="button"
            class="btn-primary"
            (click)="pay()"
            [disabled]="paying()"
            data-testid="pay-button"
          >
            {{ paying() ? 'Processing…' : payLabel() }}
          </button>
        }

        @if (state() === 'confirmed' || state() === 'awaiting') {
          <a [routerLink]="['/booking', code]" class="link" data-testid="manage-link">
            View or manage this booking
          </a>
          <a routerLink="/" class="link">Back to home</a>
        }
      </section>
    }
  `,
  styleUrl: './booking-pay.scss',
})
export class BookingPay {
  private readonly bookings = inject(BookingService);
  private readonly gateway = inject(StripePaymentGateway);
  private readonly destroyRef = inject(DestroyRef);
  private readonly peHost = viewChild<ElementRef<HTMLElement>>('peHost');

  protected readonly state = signal<PayState>('mounting');
  protected readonly errorMessage = signal<string | undefined>(undefined);
  protected readonly paying = signal(false);

  /** The awaiting-payment summary handed off by the 202 POST; absent on a cold load. */
  protected readonly booking = this.bookings.lastAwaitingPayment();

  private checkout?: StripeCheckout;
  private pollSub?: Subscription;
  private polls = 0;

  protected readonly showElement = computed(
    () => this.state() === 'mounting' || this.state() === 'ready' || this.state() === 'error',
  );
  protected readonly showPayButton = computed(
    () => this.state() === 'ready' || this.state() === 'error',
  );
  protected readonly payLabel = computed(() =>
    this.state() === 'error' ? 'Try again' : `Pay ${this.booking ? this.money(this.booking.amount) : ''}`,
  );

  protected get code(): string {
    return this.booking?.code ?? '';
  }

  constructor() {
    if (!this.booking) {
      this.state.set('missing');
      return;
    }
    // Mount once the host element is in the DOM. The real gateway loads Stripe.js here.
    afterNextRender(async () => {
      try {
        this.checkout = await this.gateway.mountPaymentElement(
          this.peHost()!.nativeElement,
          this.booking!.clientSecret,
        );
        this.state.set('ready');
      } catch (error) {
        this.errorMessage.set(
          error instanceof Error ? error.message : 'Could not load the payment form. Please try again.',
        );
        this.state.set('error');
      }
    });
  }

  protected async pay(): Promise<void> {
    if (!this.checkout) {
      return;
    }
    this.errorMessage.set(undefined);
    this.paying.set(true);
    const { error } = await this.checkout.confirm();
    this.paying.set(false);
    if (error) {
      // A client-side failure (decline / 3DS) is NOT a confirmation — show retry, do not poll.
      this.errorMessage.set(error);
      this.state.set('error');
      return;
    }
    // The card step finished. Confirmation is the backend's call (invariant #8) — start polling.
    this.state.set('processing');
    this.startPolling();
  }

  private startPolling(): void {
    const maxPolls = Math.ceil(POLL_WINDOW_MS / POLL_MS);
    this.polls = 0;
    this.pollSub = timer(0, POLL_MS)
      .pipe(
        switchMap(() => this.bookings.getByCode(this.code).pipe(catchError(() => of(undefined)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((detail) => {
        if (detail?.status === 'CONFIRMED') {
          this.state.set('confirmed');
          this.pollSub?.unsubscribe();
        } else if (++this.polls >= maxPolls) {
          // The webhook hasn't landed in time. Never claim "confirmed" — the booking is saved and
          // the user can re-check it by code.
          this.state.set('awaiting');
          this.pollSub?.unsubscribe();
        }
      });
  }

  /** Render integer minor units as a currency string (display only — no float stored). */
  protected money(amount: MoneyView): string {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: amount.currency,
      minimumFractionDigits: amount.minorUnits % 100 === 0 ? 0 : 2,
    }).format(amount.minorUnits / 100);
  }
}
