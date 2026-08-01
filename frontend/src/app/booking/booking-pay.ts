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

import { CardGlass } from '../shared/card-glass';
import { formatBookingDate } from '../shared/booking-date-label';
import { formatMoney } from '../shared/money';
import { PanelGlass } from '../shared/panel-glass';
import { WithheldEmailNotice } from './withheld-email-notice';
import { BookingService } from './booking.service';
import { StripeCheckout, StripePaymentGateway } from './stripe-payment.gateway';

/** Poll cadence and budget for awaiting the webhook-driven CONFIRMED transition. */
const POLL_MS = 1500;
const POLL_WINDOW_MS = 30_000;

type PayState = 'mounting' | 'ready' | 'processing' | 'confirmed' | 'awaiting' | 'error' | 'missing';

/**
 * Liquid Glass payment page for the `stripe` profile (U4-FE #50; restyle #137), reached on a
 * `202 AWAITING_PAYMENT` booking-create. It mounts the Stripe Payment Element on the booking's
 * `clientSecret`, confirms the card, then **polls `GET /api/bookings/{code}` for `CONFIRMED`** — the
 * booking is confirmed only by the signature-verified webhook (invariant #8), **never** from the
 * Stripe.js result. Restyle only: the state machine, poll, and every `data-testid` are unchanged.
 *
 * <p>When the confirming poll reports `emailWithheld` (#390 — the address is on the do-not-mail
 * list, so the confirmation mail was suppressed), the done panel adds a save-your-code notice and
 * the page's one persistent live region announces it. The notice deliberately gets no live region of
 * its own: it is created together with the done panel, and a region only announces content that
 * mutates after it is already in the DOM.
 *
 * <p>States: `mounting` → `ready` (card form) → on pay: `error` (declined/failed — retry in place,
 * the element stays mounted; one status re-check decides retryable vs terminal, #126 — see
 * {@link failCardStep}) or `processing` (polling, "Confirming your booking…") →
 * `confirmed` (backend said so) or `awaiting` (webhook hasn't landed within ~30s — "payment
 * received", never "confirmed"). A cold load with no hand-off shows `missing`. A terminal server
 * CANCELLED shows an honest failure (invariant #2/#8 — the design's "someone just booked" pay state
 * isn't reproduced: the backend collapses race + decline into CANCELLED, which can't disambiguate).
 */
@Component({
  selector: 'app-booking-pay',
  imports: [RouterLink, CardGlass, PanelGlass, WithheldEmailNotice],
  template: `
    <!-- One persistent live region announces every state change. A live region only announces
         content that MUTATES after it is in the DOM — a region re-created together with the
         confirmed/awaiting section would never announce its initial text (a11y). -->
    <p class="sr-status" role="status" aria-live="polite" data-testid="pay-status">{{ liveStatus() }}</p>
    @if (state() === 'missing') {
      <section class="pay-standalone" appCardGlass aria-labelledby="pay-title">
        <h1 id="pay-title">No payment in progress</h1>
        <p class="lead">Your payment session isn’t available here anymore. Please start a new booking.</p>
        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else if (state() === 'confirmed' || state() === 'awaiting') {
      <section class="pay-done" appCardGlass aria-labelledby="pay-title">
        <div class="done-badge" [class.warn]="state() === 'awaiting'" aria-hidden="true">
          {{ state() === 'confirmed' ? '✓' : '⏳' }}
        </div>
        @if (state() === 'confirmed') {
          <h1 id="pay-title">You’re booked.</h1>
          <p class="lead">Your payment is complete. Show this code to staff when you arrive.</p>
        } @else {
          <h1 id="pay-title">Payment received</h1>
          <p class="lead">
            We’ve received your payment and are waiting for final confirmation. This can take a
            moment — your booking is saved under the code below, and you can check it any time.
          </p>
        }

        <dl class="summary">
          <div class="sum-row"><dt>Venue</dt><dd>{{ booking!.venueName }}</dd></div>
          <div class="sum-row"><dt>Set</dt><dd>{{ booking!.rowLabel }} · spot {{ booking!.positionNo }}</dd></div>
          <div class="sum-row"><dt>Date</dt><dd>{{ dateLabel }}</dd></div>
          <div class="sum-row total"><dt>{{ state() === 'confirmed' ? 'Paid' : 'Total' }}</dt><dd>{{ formatMoney(booking!.amount) }}</dd></div>
        </dl>

        <p class="code" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <strong>{{ code }}</strong>
        </p>

        @if (emailWithheld()) {
          <app-withheld-email-notice />
        }

        <a [routerLink]="['/booking', code]" class="btn-primary" data-testid="manage-link">
          View or manage this booking
        </a>
        <a routerLink="/" class="link">Back to the beach</a>
      </section>
    } @else {
      <section class="pay-checkout" aria-labelledby="pay-title">
        @if (state() !== 'processing') {
          <a routerLink="/" class="cancel-link" appPanelGlass data-testid="pay-cancel">Cancel</a>
        }
        <div class="pay-grid">
          <div class="pay-card" appCardGlass>
            @switch (state()) {
              @case ('processing') {
                <div class="confirming">
                  <span class="spinner" aria-hidden="true"></span>
                  <h1 id="pay-title">Confirming your booking…</h1>
                  <p class="lead">
                    Your payment went through. We’re waiting for the confirmation from our payment
                    provider — this takes just a moment. Please don’t close this page.
                  </p>
                </div>
              }
              @case ('error') {
                @if (terminalError()) {
                  <div class="fail-badge" aria-hidden="true">✕</div>
                  <h1 id="pay-title">Payment couldn’t be completed</h1>
                } @else {
                  <h1 id="pay-title">Complete your payment</h1>
                  <p class="lead">Your card wasn’t charged. Check the details and try again below.</p>
                }
              }
              @default {
                <h1 id="pay-title">Complete your payment</h1>
                <p class="lead">
                  Enter your card to confirm the booking. Payments are processed securely by Stripe —
                  Riviera never sees your card number.
                </p>
              }
            }

            <!-- Payment Element host. Kept in the DOM across mounting/ready/error so the Stripe
                 iframe survives a retry; hidden (not removed) once the card step is done. -->
            <div #peHost class="pe-host" [hidden]="!showElement()" data-testid="pe-host"></div>

            @if (showElement()) {
              <p class="trust"><span aria-hidden="true">🔒</span> Encrypted &amp; PCI-compliant · powered by Stripe</p>
            }

            @if (state() === 'mounting') {
              <p class="status">Loading the secure payment form…</p>
            }

            @if (errorMessage(); as msg) {
              <p class="form-error" role="alert" data-testid="pay-error">{{ msg }}</p>
            }

            @if (state() === 'error' && terminalError()) {
              <a [routerLink]="['/booking', code]" class="link" data-testid="booking-status-link">
                View booking status
              </a>
              <a routerLink="/" class="link" data-testid="startover-link">Start a new booking</a>
            }
          </div>

          <aside class="pay-summary" appCardGlass>
            <span class="summary-label">Order summary</span>
            <dl>
              <div class="sum-row"><dt>Venue</dt><dd>{{ booking!.venueName }}</dd></div>
              <div class="sum-row"><dt>Set</dt><dd>{{ booking!.rowLabel }} · spot {{ booking!.positionNo }}</dd></div>
              <div class="sum-row"><dt>Date</dt><dd>{{ dateLabel }}</dd></div>
              <div class="sum-row"><dt>Includes</dt><dd>2 loungers + umbrella</dd></div>
              <div class="sum-row total"><dt>Total</dt><dd>{{ formatMoney(booking!.amount) }}</dd></div>
            </dl>

            @if (showPayButton()) {
              <!-- New tab (not routerLink) so the mounted Payment Element survives reading the document. -->
              <p class="mt-[10px] text-[12px] leading-[1.5] text-(--riv-card-ink-soft)" data-testid="legal-agreement">
                By paying you agree to our
                <a class="underline" data-testid="legal-terms-link" href="/legal/terms" target="_blank" rel="noopener">Terms of Service</a>
                and acknowledge our
                <a class="underline" data-testid="legal-privacy-link" href="/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
              </p>
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
            @if (state() === 'processing') {
              <p class="finalising" role="status">Finalising… hang tight.</p>
            }
          </aside>
        </div>
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
  /** A terminal failure — the poll saw a server-side CANCELLED, or the failure re-check (#126)
   *  found the booking no longer payable: retrying the same PaymentIntent is futile, so the page
   *  offers the booking-status link and "start over" instead of "Pay". */
  protected readonly terminalError = signal(false);
  /** The confirmed booking's mail was suppressed (#390) — read from the poll, never assumed. */
  protected readonly emailWithheld = signal(false);

  /** The awaiting-payment summary handed off by the 202 POST; absent on a cold load. */
  protected readonly booking = this.bookings.lastAwaitingPayment();

  private checkout?: StripeCheckout;
  private pollSub?: Subscription;
  private polls = 0;

  protected readonly showElement = computed(
    () =>
      this.state() === 'mounting' ||
      this.state() === 'ready' ||
      (this.state() === 'error' && !this.terminalError()),
  );
  protected readonly showPayButton = computed(
    () => this.state() === 'ready' || (this.state() === 'error' && !this.terminalError()),
  );
  /** The single announcement for the persistent live region — mutates as the state advances so a
   *  screen reader hears each transition (loading → confirming → confirmed/awaiting). Reads two
   *  signals; `computed` is lazy and memoized, so the order the poll writes them in is irrelevant —
   *  no intermediate value is ever rendered. */
  protected readonly liveStatus = computed(() => {
    switch (this.state()) {
      case 'mounting':
        return 'Loading the secure payment form…';
      case 'processing':
        return 'Confirming your booking — please don’t close this page…';
      case 'confirmed':
        return this.emailWithheld()
          ? 'Your booking is confirmed. We could not email you — save your booking code.'
          : 'Your booking is confirmed.';
      case 'awaiting':
        return 'Payment received — awaiting confirmation.';
      default:
        return '';
    }
  });

  /** The booking total, formatted once (the awaiting summary is fixed for the page's lifetime). */
  private readonly priceText = this.booking ? formatMoney(this.booking.amount) : '';
  protected readonly payLabel = computed(() =>
    this.state() === 'error' ? 'Try again' : `Pay ${this.priceText}`,
  );

  /** Exposed for the template (currency formatting helper). */
  protected readonly formatMoney = formatMoney;
  /** The booking date as a friendly label (fixed for the page lifetime). */
  protected readonly dateLabel = this.booking ? formatBookingDate(this.booking.bookingDate) : '';

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
        this.failCardStep(
          error instanceof Error ? error.message : 'Could not load the payment form. Please try again.',
        );
      }
    });
  }

  /**
   * A card-step failure (mount or confirm) is only retryable while the booking is still payable:
   * the pay-window sweep may have cancelled the intent while this page was open, and retrying a
   * dead intent loops forever (#126). So the error state re-reads the booking once — server truth,
   * invariant #8 intact: the answer can only escalate to the terminal state (or adopt a booking the
   * verified webhook already confirmed), never report a payment the backend hasn't. A failed
   * re-check changes nothing — the retry-in-place state stays.
   */
  private failCardStep(message: string): void {
    // One-way past the card step: a late failure must never write backwards over a newer state.
    const s = this.state();
    if (this.terminalError() || s === 'processing' || s === 'confirmed' || s === 'awaiting') {
      return;
    }
    this.errorMessage.set(message);
    this.state.set('error');
    this.bookings
      .getByCode(this.code)
      .pipe(
        catchError(() => of(undefined)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((detail) => {
        // Apply only while still showing THIS failure: a late answer must not write under a retry
        // that has since moved the page on (processing/confirmed), nor under an earlier terminal.
        if (this.state() !== 'error' || this.terminalError()) {
          return;
        }
        if (detail === undefined || detail.status === 'AWAITING_PAYMENT') {
          return;
        }
        if (detail.status === 'CONFIRMED') {
          // The webhook beat the client's error report — the booking is genuinely paid.
          this.errorMessage.set(undefined);
          this.emailWithheld.set(detail.emailWithheld);
          this.state.set('confirmed');
          return;
        }
        this.errorMessage.set(
          'This booking can no longer be paid — its status changed while this page was open.',
        );
        this.terminalError.set(true);
      });
  }

  protected async pay(): Promise<void> {
    // Guard re-entrancy: ignore a second tap once the card step is under way or done.
    if (!this.checkout || this.state() === 'processing' || this.terminalError()) {
      return;
    }
    this.errorMessage.set(undefined);
    this.paying.set(true);
    const { error } = await this.checkout.confirm();
    this.paying.set(false);
    if (error) {
      // A client-side failure (decline / 3DS) is NOT a confirmation — show retry, do not poll.
      this.failCardStep(error);
      return;
    }
    // The card step finished. Confirmation is the backend's call (invariant #8) — start polling.
    this.state.set('processing');
    this.startPolling();
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe(); // never run two polls at once
    const maxPolls = Math.ceil(POLL_WINDOW_MS / POLL_MS);
    this.polls = 0;
    this.pollSub = timer(0, POLL_MS)
      .pipe(
        switchMap(() => this.bookings.getByCode(this.code).pipe(catchError(() => of(undefined)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((detail) => {
        if (detail?.status === 'CONFIRMED') {
          this.emailWithheld.set(detail.emailWithheld);
          this.state.set('confirmed');
          this.pollSub?.unsubscribe();
        } else if (detail?.status === 'CANCELLED') {
          // The payment failed server-side (verified PaymentCanceled webhook → booking CANCELLED).
          // Surface it honestly — do NOT let it fall through to the "payment received" message.
          this.errorMessage.set(
            'Your payment didn’t go through, so the booking was cancelled. Please try booking again.',
          );
          this.terminalError.set(true);
          this.state.set('error');
          this.pollSub?.unsubscribe();
        } else if (++this.polls >= maxPolls) {
          // The webhook hasn't landed in time. Never claim "confirmed" — the booking is saved and
          // the user can re-check it by code.
          this.state.set('awaiting');
          this.pollSub?.unsubscribe();
        }
      });
  }
}
