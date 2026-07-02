import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { formatDeadline } from '../shared/deadline';
import { MoneyView } from '../venue/venue.model';
import { BookingDetail, Cancellation } from './booking.model';
import { BookingService } from './booking.service';

/**
 * View a booking by its code and cancel it (U6, issue #11). Loads the booking and its
 * <strong>server-computed</strong> refund terms (invariant #10) via {@link BookingService}, shows the
 * details, and — when the booking is cancellable — offers a two-step cancel (a confirm prompt stating
 * the refund) so the action is deliberate and accessible. The refund amount is never computed or sent
 * by the client. Money is rendered from integer minor units; status is conveyed in text (WCAG AA).
 *
 * <p>Request-to-Book (issue #98) adds status-aware panels: `PENDING_REQUEST` shows the venue's
 * response deadline; `AWAITING_PAYMENT` with open-intent credentials offers "Pay now" (primes
 * {@link BookingService#beginPayment} and routes to `/booking/pay` — the same flow as the 202
 * create path, so confirmation still only ever comes from the verified webhook, invariant #8);
 * `DECLINED`/`EXPIRED` explain the terminal, no-charge outcome.
 */
@Component({
  selector: 'app-booking-view',
  imports: [RouterLink],
  template: `
    @if (notFound()) {
      <section class="booking" aria-labelledby="bv-title">
        <h1 id="bv-title">Booking not found</h1>
        <p class="lead">We couldn’t find a booking for that code. Check the code and try again.</p>
        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else if (failed()) {
      <section class="booking" aria-labelledby="bv-title">
        <h1 id="bv-title">Couldn’t load your booking</h1>
        <p class="lead">Something went wrong. Please try again in a moment.</p>
        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else if (booking(); as b) {
      <section class="booking" aria-labelledby="bv-title">
        <h1 id="bv-title">Your booking</h1>

        <p class="code" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <strong>{{ b.code }}</strong>
        </p>

        <dl class="summary">
          <dt>Status</dt>
          <dd data-testid="booking-status">{{ statusLabel(b.status) }}</dd>
          <dt>Venue</dt>
          <dd>{{ b.venueName }}</dd>
          <dt>Set</dt>
          <dd>{{ b.rowLabel }} · spot {{ b.positionNo }}</dd>
          <dt>Date</dt>
          <dd>{{ b.bookingDate }}</dd>
          <dt>{{ amountLabel(b.status) }}</dt>
          <dd>{{ money(b.amount) }}</dd>
          @if (b.refundedAmount && b.refundedAmount.minorUnits > 0) {
            <dt>Refunded</dt>
            <dd data-testid="refunded-amount">{{ money(b.refundedAmount) }}</dd>
          }
        </dl>

        @switch (b.status) {
          @case ('PENDING_REQUEST') {
            <section class="request-panel" data-testid="request-pending" aria-labelledby="request-state-title">
              <h2 id="request-state-title">Waiting for the venue</h2>
              <p class="terms">
                {{ b.venueName }} hasn’t responded to your booking request yet. You won’t be
                charged unless they accept.
              </p>
              @if (b.requestExpiresAt; as deadline) {
                <p class="terms">
                  They have until <strong>{{ deadlineLabel(deadline) }}</strong> to respond.
                </p>
              }
            </section>
          }
          @case ('AWAITING_PAYMENT') {
            @if (b.payment) {
              <section class="request-panel" data-testid="request-accepted" aria-labelledby="request-state-title">
                @if (b.requestExpiresAt) {
                  <h2 id="request-state-title">Request accepted — complete your payment</h2>
                  <p class="terms">
                    {{ b.venueName }} accepted your booking request. Pay now to confirm your spot.
                  </p>
                } @else {
                  <!-- An instant booking with an open payment (e.g. an interrupted checkout) was
                       never a request — don't claim the venue "accepted" anything. -->
                  <h2 id="request-state-title">Complete your payment</h2>
                  <p class="terms">
                    This booking is reserved but unpaid. Pay now to confirm your spot.
                  </p>
                }
                <button type="button" class="btn primary" (click)="payNow(b)" data-testid="pay-now">
                  Pay now
                </button>
              </section>
            }
          }
          @case ('DECLINED') {
            <section class="request-panel" data-testid="request-declined" aria-labelledby="request-state-title">
              <h2 id="request-state-title">Request declined</h2>
              <p class="terms">
                {{ b.venueName }} couldn’t take this booking, so it was declined. You haven’t been
                charged — pick another set or date to book again.
              </p>
            </section>
          }
          @case ('EXPIRED') {
            <section class="request-panel" data-testid="request-expired" aria-labelledby="request-state-title">
              <h2 id="request-state-title">Request expired</h2>
              <p class="terms">
                {{ b.venueName }} didn’t respond in time, so this request expired. You haven’t
                been charged — pick another set or date to book again.
              </p>
            </section>
          }
        }

        <!-- Live result of a cancellation, announced to assistive tech. -->
        <p class="result" role="status" aria-live="polite" data-testid="cancel-result">
          @if (cancellation(); as c) {
            Booking cancelled. {{ refundSentence(c.tier, c.refund) }}
          } @else if (cancelFailed()) {
            We couldn’t cancel the booking. Please try again.
          }
        </p>

        @if (b.cancellable && !cancellation()) {
          <section class="cancel" aria-labelledby="cancel-title">
            <h2 id="cancel-title">Cancel this booking</h2>
            <p class="terms" data-testid="refund-terms">{{ refundTerms(b) }}</p>

            @if (confirming()) {
              <p class="confirm-q">Cancel this booking? This can’t be undone.</p>
              <div class="actions">
                <button
                  #confirmBtn
                  type="button"
                  class="btn danger"
                  [disabled]="cancelling()"
                  (click)="confirmCancel()"
                  data-testid="confirm-cancel"
                >
                  {{ cancelling() ? 'Cancelling…' : 'Confirm cancellation' }}
                </button>
                <button type="button" class="btn" [disabled]="cancelling()" (click)="keepBooking()">
                  Keep booking
                </button>
              </div>
            } @else {
              <button type="button" class="btn danger" (click)="startCancel()" data-testid="start-cancel">
                Cancel booking
              </button>
            }
          </section>
        }

        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else {
      <section class="booking" aria-labelledby="bv-title" aria-busy="true">
        <h1 id="bv-title">Loading your booking…</h1>
      </section>
    }
  `,
  styleUrl: './booking-view.scss',
})
export class BookingView {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookings = inject(BookingService);

  protected readonly booking = signal<BookingDetail | undefined>(undefined);
  protected readonly failed = signal(false);
  protected readonly notFound = signal(false);
  protected readonly confirming = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelFailed = signal(false);
  protected readonly cancellation = signal<Cancellation | undefined>(undefined);

  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  private readonly code: string;

  constructor() {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (this.code) {
      this.load();
    } else {
      this.notFound.set(true);
    }
    // Move focus to the destructive confirm button when the prompt appears (a11y).
    effect(() => {
      if (this.confirming()) {
        this.confirmButton()?.nativeElement.focus();
      }
    });
  }

  private load(): void {
    this.bookings.getByCode(this.code).subscribe({
      next: (b) => this.booking.set(b),
      error: (e: unknown) => {
        if (typeof e === 'object' && e !== null && (e as { status?: number }).status === 404) {
          this.notFound.set(true);
        } else {
          this.failed.set(true);
        }
      },
    });
  }

  protected startCancel(): void {
    this.confirming.set(true);
  }

  protected keepBooking(): void {
    this.confirming.set(false);
  }

  protected confirmCancel(): void {
    this.cancelling.set(true);
    this.cancelFailed.set(false);
    this.bookings.cancel(this.code).subscribe({
      next: (c) => {
        this.cancellation.set(c);
        this.confirming.set(false);
        this.cancelling.set(false);
        this.load(); // refresh to the CANCELLED detail (now shows the refunded amount)
      },
      error: () => {
        this.cancelFailed.set(true);
        this.cancelling.set(false);
      },
    });
  }

  protected statusLabel(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');
  }

  /** "Paid" once money has actually moved; "Amount" while the request/payment is still open. */
  protected amountLabel(status: BookingDetail['status']): string {
    switch (status) {
      case 'PENDING_REQUEST':
      case 'AWAITING_PAYMENT':
      case 'DECLINED':
      case 'EXPIRED':
        return 'Amount';
      default:
        return 'Paid';
    }
  }

  /** A response deadline rendered in Europe/Tirane wall-clock time (invariant #6). */
  protected deadlineLabel(iso: string): string {
    return formatDeadline(iso);
  }

  /**
   * Resume payment on an accepted request (issue #98): rebuild the payment hand-off from the
   * fetched detail's open-intent credentials and route to `/booking/pay`. The pay page then polls
   * for the webhook-driven CONFIRMED exactly as after a 202 create (invariant #8).
   */
  protected async payNow(b: BookingDetail): Promise<void> {
    const payment = b.payment;
    if (!payment) {
      return;
    }
    this.bookings.beginPayment({
      code: b.code,
      venueName: b.venueName,
      rowLabel: b.rowLabel,
      positionNo: b.positionNo,
      bookingDate: b.bookingDate,
      amount: b.amount,
      clientSecret: payment.clientSecret,
      paymentIntentId: payment.paymentIntentId,
    });
    await this.router.navigate(['/booking/pay']);
  }

  /** Refund-terms copy for a still-cancellable booking. */
  protected refundTerms(b: BookingDetail): string {
    if (b.beforeCutoff) {
      return `Free cancellation until the evening before — you’ll be refunded ${this.money(b.refundIfCancelledNow)} in full.`;
    }
    if (b.refundIfCancelledNow.minorUnits > 0) {
      return `The free-cancellation cutoff has passed — you’ll be refunded ${this.money(b.refundIfCancelledNow)}.`;
    }
    return 'The free-cancellation cutoff has passed — this cancellation is non-refundable.';
  }

  /** Sentence describing the refund that was issued. */
  protected refundSentence(tier: Cancellation['tier'], refund: MoneyView): string {
    if (tier === 'NONE' || refund.minorUnits === 0) {
      return 'No refund applies under the cancellation policy.';
    }
    return `${this.money(refund)} will be refunded to your card.`;
  }

  protected money(amount: MoneyView): string {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: amount.currency,
      minimumFractionDigits: amount.minorUnits % 100 === 0 ? 0 : 2,
    }).format(amount.minorUnits / 100);
  }
}
