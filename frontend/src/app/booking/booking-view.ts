import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { formatBookingDate } from '../shared/booking-date-label';
import { metaFor } from '../shared/booking-status';
import { CardGlass } from '../shared/card-glass';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { StatusChip } from '../shared/status-chip';
import { MoneyView } from '../venue/venue.model';
import { BookingDetail, Cancellation } from './booking.model';
import { BookingService } from './booking.service';

/**
 * View a booking by its code and cancel it (U6, issue #11; Liquid Glass restyle #138). Loads the
 * booking and its <strong>server-computed</strong> refund terms (invariant #10) via
 * {@link BookingService}, renders the glass detail card — a unified status chip for the whole #98
 * union, the dashed booking-code card, the detail rows, and status banners — and, when the booking
 * is cancellable, offers a two-step cancel (a confirm prompt stating the refund) so the action is
 * deliberate and accessible. The refund amount is never computed or sent by the client; money is
 * rendered from integer minor units via {@link formatMoney} (invariant #5); status is conveyed in
 * text, not colour alone (WCAG AA).
 *
 * <p>Request-to-Book (issue #98) status panels: `PENDING_REQUEST` shows the venue's response
 * deadline and offers a two-step **Withdraw request** (#123) — the same confirm-then-act idiom as
 * cancel, but with no refund to state, because a pending request was never charged; the server's
 * `withdrawable` flag gates it, never a status check here;
 * `AWAITING_PAYMENT` with open-intent credentials offers "Pay now" (primes
 * {@link BookingService#beginPayment} and routes to `/booking/pay` — the same flow as the 202
 * create path, so confirmation still only ever comes from the verified webhook, invariant #8);
 * `DECLINED`/`EXPIRED`/`WITHDRAWN` explain the terminal, no-charge outcome.
 */
@Component({
  selector: 'app-booking-view',
  imports: [RouterLink, CardGlass, StatusChip],
  template: `
    @if (notFound()) {
      <section class="state-card" appCardGlass aria-labelledby="bv-title">
        <h1 id="bv-title">Booking not found</h1>
        <p class="lead">We couldn’t find a booking for that code. Check the code and try again.</p>
        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else if (failed()) {
      <section class="state-card" appCardGlass aria-labelledby="bv-title">
        <h1 id="bv-title">Couldn’t load your booking</h1>
        <p class="lead">Something went wrong. Please try again in a moment.</p>
        <a routerLink="/" class="link">Back to home</a>
      </section>
    } @else if (booking(); as b) {
      <section class="booking-card" appCardGlass aria-labelledby="bv-title">
        <div class="card-head">
          <h1 id="bv-title">Your booking</h1>
          <span class="status-wrap">
            <!-- Restores the "Status: X" context the removed dl row gave assistive tech. -->
            <span class="sr-only">Booking status:</span>
            <span [appStatusChip]="chipClass(b.status)" data-testid="booking-status">{{
              statusLabel(b.status)
            }}</span>
          </span>
        </div>

        @switch (b.status) {
          @case ('AWAITING_PAYMENT') {
            @if (b.payment) {
              <section
                class="banner banner--awaiting"
                data-testid="request-accepted"
                aria-labelledby="request-state-title"
              >
                @if (b.requestExpiresAt) {
                  <h2 id="request-state-title" class="banner-eyebrow">
                    Request accepted&ngsp;<span aria-hidden="true">🎉</span>
                  </h2>
                  <p class="banner-body">
                    {{ b.venueName }} accepted your booking request. Pay now to confirm your spot.
                  </p>
                } @else {
                  <!-- An instant booking with an open payment (e.g. an interrupted checkout) was
                       never a request — don't claim the venue "accepted" anything. -->
                  <h2 id="request-state-title" class="banner-eyebrow">Complete your payment</h2>
                  <p class="banner-body">
                    This booking is reserved but unpaid. Pay now to confirm your spot.
                  </p>
                }
                <button type="button" class="btn-cta" (click)="payNow(b)" data-testid="pay-now">
                  Pay now
                </button>
              </section>
            }
          }
          @case ('PENDING_REQUEST') {
            <section
              class="banner banner--pending"
              data-testid="request-pending"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="banner-eyebrow">Waiting for the venue</h2>
              <p class="banner-body">
                {{ b.venueName }} hasn’t responded to your booking request yet. You won’t be
                charged unless they accept.
              </p>
              @if (b.requestExpiresAt; as deadline) {
                <p class="banner-body">
                  They have until <strong>{{ deadlineLabel(deadline) }}</strong> to respond.
                </p>
              }
              @if (b.withdrawable && !withdrawn()) {
                <div class="withdraw">
                  @if (confirmingWithdraw()) {
                    <p class="confirm-q">Withdraw this request? This can’t be undone.</p>
                    <div class="actions">
                      <button
                        #withdrawConfirmBtn
                        type="button"
                        class="btn-danger"
                        [disabled]="withdrawing()"
                        (click)="confirmWithdraw()"
                        data-testid="confirm-withdraw"
                      >
                        {{ withdrawing() ? 'Withdrawing…' : 'Confirm withdrawal' }}
                      </button>
                      <button
                        type="button"
                        class="btn-outline"
                        [disabled]="withdrawing()"
                        (click)="keepRequest()"
                      >
                        Keep request
                      </button>
                    </div>
                  } @else {
                    <button
                      type="button"
                      class="btn-outline danger"
                      (click)="startWithdraw()"
                      data-testid="withdraw-request"
                    >
                      Withdraw request
                    </button>
                  }
                </div>
              }

            </section>
          }
          @case ('WITHDRAWN') {
            <section
              class="banner banner--withdrawn"
              data-testid="request-withdrawn"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="banner-eyebrow">Request withdrawn</h2>
              <p class="banner-body">
                You withdrew this request, so the spot is free for other guests again. You
                haven’t been charged — pick another set or date to book again.
              </p>
            </section>
          }
          @case ('DECLINED') {
            <section
              class="banner banner--declined"
              data-testid="request-declined"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="banner-eyebrow">Request declined</h2>
              <p class="banner-body">
                {{ b.venueName }} couldn’t take this booking, so it was declined. You haven’t been
                charged — pick another set or date to book again.
              </p>
            </section>
          }
          @case ('EXPIRED') {
            <section
              class="banner banner--expired"
              data-testid="request-expired"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="banner-eyebrow">Request expired</h2>
              <p class="banner-body">
                {{ b.venueName }} didn’t respond in time, so this request expired. You haven’t been
                charged — pick another set or date to book again.
              </p>
            </section>
          }
        }

        <div class="code-card" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <div class="code">{{ b.code }}</div>
          <p class="code-note">Show this code to staff when you arrive to claim your set.</p>
        </div>

        <dl class="details">
          <div class="row"><dt>Venue</dt><dd>{{ b.venueName }}</dd></div>
          <div class="row"><dt>Set</dt><dd>{{ b.rowLabel }} · spot {{ b.positionNo }}</dd></div>
          <div class="row"><dt>Date</dt><dd>{{ dateLabel(b.bookingDate) }}</dd></div>
          <div class="row"><dt>{{ amountLabel(b.status) }}</dt><dd class="amount">{{ formatMoney(b.amount) }}</dd></div>
          @if (b.refundedAmount && b.refundedAmount.minorUnits > 0) {
            <div class="row"><dt>Refunded</dt><dd data-testid="refunded-amount">{{ formatMoney(b.refundedAmount) }}</dd></div>
          }
        </dl>

        <!-- Outside the status switch on purpose: scoped to PENDING_REQUEST it would unmount on success. -->
        <p class="result" role="status" aria-live="polite" data-testid="withdraw-result">
          @if (withdrawn()) {
            Request withdrawn. The spot is free for other guests again.
          } @else if (withdrawFailed()) {
            We couldn’t withdraw the request. Please try again.
          }
        </p>

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
                  class="btn-danger"
                  [disabled]="cancelling()"
                  (click)="confirmCancel()"
                  data-testid="confirm-cancel"
                >
                  {{ cancelling() ? 'Cancelling…' : 'Confirm cancellation' }}
                </button>
                <button type="button" class="btn-outline" [disabled]="cancelling()" (click)="keepBooking()">
                  Keep booking
                </button>
              </div>
            } @else {
              <button type="button" class="btn-outline danger" (click)="startCancel()" data-testid="start-cancel">
                Cancel booking
              </button>
            }
          </section>
        }

        <a routerLink="/" class="link back">Back to home</a>
      </section>
    } @else {
      <section class="state-card" appCardGlass aria-labelledby="bv-title" aria-busy="true">
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
  protected readonly confirmingWithdraw = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawFailed = signal(false);
  protected readonly withdrawn = signal(false);

  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');
  private readonly withdrawConfirmButton =
    viewChild<ElementRef<HTMLButtonElement>>('withdrawConfirmBtn');

  private code = '';

  /** Money formatter (shared, minor units — invariant #5), exposed to the template. */
  protected readonly formatMoney = formatMoney;

  constructor() {
    // React to the route `code` (not just the snapshot) so a booking→booking navigation reloads
    // instead of reusing this instance for a different code — the T8 find modal (#148) is reachable
    // on this page, so that navigation now happens (review finding [0]). `paramMap` emits
    // synchronously on subscribe, so this also performs the initial load.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.code = params.get('code') ?? '';
      // Reset the per-booking view state before (re)loading the new code.
      this.booking.set(undefined);
      this.notFound.set(false);
      this.failed.set(false);
      this.confirming.set(false);
      this.cancelling.set(false);
      this.cancelFailed.set(false);
      this.cancellation.set(undefined);
      this.confirmingWithdraw.set(false);
      this.withdrawing.set(false);
      this.withdrawFailed.set(false);
      this.withdrawn.set(false);
      if (this.code) {
        this.load();
      } else {
        this.notFound.set(true);
      }
    });
    // Move focus to the destructive confirm button when its prompt appears (a11y) — a DOM write.
    afterRenderEffect({
      write: () => {
        if (this.confirming()) {
          this.confirmButton()?.nativeElement.focus();
        }
      },
    });
    afterRenderEffect({
      write: () => {
        if (this.confirmingWithdraw()) {
          this.withdrawConfirmButton()?.nativeElement.focus();
        }
      },
    });
  }

  /**
   * @param isRefresh a reload triggered by a completed cancellation (not the initial load). A
   *   refresh that fails must NOT flip the page to the not-found/failed card — that would discard
   *   the just-issued cancellation confirmation (the refund the server already actioned). The
   *   stale-but-cancelled detail plus the live result region stay on screen instead.
   */
  private load(isRefresh = false): void {
    // Initial load consumes a matching find-a-booking prefetch (#168) instead of a second GET.
    if (!isRefresh) {
      const prefetched = this.bookings.takePrefetched(this.code);
      if (prefetched) {
        this.booking.set(prefetched);
        return;
      }
    }
    this.bookings.getByCode(this.code).subscribe({
      next: (b) => this.booking.set(b),
      error: (e: unknown) => {
        if (isRefresh) {
          return;
        }
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
        this.load(true); // refresh to the CANCELLED detail (chip flips + refunded row appears, no reload)
      },
      error: () => {
        this.cancelFailed.set(true);
        this.cancelling.set(false);
      },
    });
  }

  protected startWithdraw(): void {
    this.confirmingWithdraw.set(true);
  }

  protected keepRequest(): void {
    this.confirmingWithdraw.set(false);
  }

  /**
   * Retract a still-pending request (#123). No refund to report — the venue never accepted, so
   * nothing was charged; the reload flips the chip to `Withdrawn` without a page reload.
   */
  protected confirmWithdraw(): void {
    this.withdrawing.set(true);
    this.withdrawFailed.set(false);
    this.bookings.withdraw(this.code).subscribe({
      next: () => {
        this.withdrawn.set(true);
        this.confirmingWithdraw.set(false);
        this.withdrawing.set(false);
        this.load(true);
      },
      error: () => {
        this.withdrawFailed.set(true);
        this.withdrawing.set(false);
      },
    });
  }

  /** The design label for a status (drives the header chip; matches design v3 `STATUS_META`). */
  protected statusLabel(status: string): string {
    return metaFor(status).label;
  }

  /** The chip CSS-modifier class for a status. */
  protected chipClass(status: string): string {
    return metaFor(status).chip;
  }

  /** "Paid" once money has actually moved; "Amount" while the request/payment is still open. */
  protected amountLabel(status: string): string {
    return metaFor(status).amount;
  }

  /** The booking date as a friendly civil-date label (UTC-parsed, invariant #6). */
  protected dateLabel(iso: string): string {
    return formatBookingDate(iso, { withYear: true });
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

  /** Refund-terms copy for a still-cancellable booking (server-computed values, invariant #10). */
  protected refundTerms(b: BookingDetail): string {
    if (b.beforeCutoff) {
      return `Free cancellation until the evening before — you’ll be refunded ${formatMoney(b.refundIfCancelledNow)} in full.`;
    }
    if (b.refundIfCancelledNow.minorUnits > 0) {
      return `The free-cancellation cutoff has passed — you’ll be refunded ${formatMoney(b.refundIfCancelledNow)}.`;
    }
    return 'The free-cancellation cutoff has passed — this cancellation is non-refundable.';
  }

  /** Sentence describing the refund that was issued. */
  protected refundSentence(tier: Cancellation['tier'], refund: MoneyView): string {
    if (tier === 'NONE' || refund.minorUnits === 0) {
      return 'No refund applies under the cancellation policy.';
    }
    return `${formatMoney(refund)} will be refunded to your card.`;
  }
}
