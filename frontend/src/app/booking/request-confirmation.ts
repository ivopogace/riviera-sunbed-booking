import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatBookingDate } from '../shared/booking-date-label';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';

/**
 * Screen shown after a Request-to-Book submission (issue #98; Liquid Glass restyle #137, route
 * `booking/requested`). Renders the `PENDING_REQUEST` hand-off as the "Request sent" glass card: the
 * code prominently (the guest's only key to the booking — a bearer credential, invariant #7), the
 * venue's response deadline (Europe/Tirane, invariant #6), and the amount charged only if the venue
 * accepts. On a cold load with no request in memory it shows a "start over" message. State is
 * conveyed in text, never colour alone.
 */
@Component({
  selector: 'app-request-confirmation',
  imports: [RouterLink],
  template: `
    @if (requested(); as r) {
      <section class="confirmation" aria-labelledby="request-title">
        <div class="badge warn" aria-hidden="true">✉</div>
        <h1 id="request-title">Request sent</h1>
        <p class="lead">
          {{ r.rowLabel }} · spot {{ r.positionNo }} at {{ r.venueName }} on
          {{ dateLabel() }} is a <strong>Request to Book</strong> venue. The host
          needs to accept before you pay — <strong>you haven’t been charged</strong>.
        </p>

        <div class="info-box">
          <span class="info-icon" aria-hidden="true">⏳</span>
          <p>
            We’ll notify you by email as soon as the venue responds — expected by
            <strong data-testid="request-deadline">{{ deadline(r.requestExpiresAt) }}</strong>. If
            accepted, you’ll get a link to pay <strong>{{ formatMoney(r.amount) }}</strong> and lock in
            the set.
          </p>
        </div>

        <div class="code-card" data-testid="booking-code">
          <span class="code-label">Request reference</span>
          <div class="code">{{ r.code }}</div>
        </div>

        <p class="status" data-testid="request-status">Pending — waiting for the venue to respond</p>

        <a [routerLink]="['/booking', r.code]" class="btn-primary" data-testid="status-link">
          Track this request
        </a>
        <a routerLink="/" class="link">Back to the beach</a>
      </section>
    } @else {
      <section class="confirmation" aria-labelledby="request-title">
        <h1 id="request-title">No request to show</h1>
        <p class="lead">Your booking request isn’t available here anymore.</p>
        <a routerLink="/" class="link">Start a new booking</a>
      </section>
    }
  `,
  styleUrl: './request-confirmation.scss',
})
export class RequestConfirmation {
  private readonly bookings = inject(BookingService);

  // Only render the request card for an actually-PENDING_REQUEST hand-off (belt-and-braces,
  // mirroring the confirmation screen's CONFIRMED guard).
  protected readonly requested = computed(() => {
    const r = this.bookings.lastRequested();
    return r?.status === 'PENDING_REQUEST' ? r : undefined;
  });

  protected readonly formatMoney = formatMoney;
  /** The booking date, formatted once per request (memoized like the dialog/pay siblings). */
  protected readonly dateLabel = computed(() => {
    const r = this.requested();
    return r ? formatBookingDate(r.bookingDate) : '';
  });

  /** The venue's response deadline rendered in Europe/Tirane wall-clock time (invariant #6). */
  protected deadline(iso: string): string {
    return formatDeadline(iso);
  }
}
