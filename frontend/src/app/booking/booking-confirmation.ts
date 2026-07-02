import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatBookingDate } from '../shared/booking-date-label';
import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';

/**
 * Confirmation screen shown after a successful booking (U3 #6; Liquid Glass restyle #137). Renders
 * the "You're booked." glass card — the booking code (a bearer credential, invariant #7, confined
 * to this surface and the `/booking/:code` link) and a summary from {@link BookingService}'s last
 * confirmation. On a cold load with no confirmation in memory (e.g. a hard refresh) it shows a
 * "start over" message rather than a blank screen. No Guest row — the server confirmation carries
 * no guest name (the dialog's Review step shows it, where the form knows it).
 */
@Component({
  selector: 'app-booking-confirmation',
  imports: [RouterLink],
  template: `
    @if (confirmation(); as c) {
      <section class="confirmation" aria-labelledby="confirmation-title">
        <div class="badge" aria-hidden="true">✓</div>
        <h1 id="confirmation-title">You’re booked.</h1>
        <p class="lead">
          {{ c.rowLabel }} · spot {{ c.positionNo }} at {{ c.venueName }}<br />on
          {{ dateLabel() }}.
        </p>

        <dl class="summary">
          <div class="sum-row"><dt>Includes</dt><dd>2 loungers + umbrella · full day</dd></div>
          <div class="sum-row total"><dt>Paid</dt><dd>{{ formatMoney(c.amount) }}</dd></div>
        </dl>

        <div class="code-card" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <div class="code">{{ c.code }}</div>
          <p class="code-note">Show this code to staff when you arrive. We’ve also emailed it to you.</p>
        </div>

        <a routerLink="/" class="btn-primary">Back to the beach</a>
        <a [routerLink]="['/booking', c.code]" class="link" data-testid="manage-link">
          View or manage this booking
        </a>
      </section>
    } @else {
      <section class="confirmation" aria-labelledby="confirmation-title">
        <h1 id="confirmation-title">No booking to show</h1>
        <p class="lead">Your booking details aren’t available here anymore.</p>
        <a routerLink="/" class="link">Start a new booking</a>
      </section>
    }
  `,
  styleUrl: './booking-confirmation.scss',
})
export class BookingConfirmation {
  private readonly bookings = inject(BookingService);

  // Only render the "You're booked. / Paid" card for an actually-CONFIRMED booking. An
  // AWAITING_PAYMENT booking (stripe profile) is routed to /booking/pay and confirmed via the
  // webhook (invariant #8) — it must never surface here as paid. Defensive belt-and-braces.
  protected readonly confirmation = computed(() => {
    const c = this.bookings.lastConfirmation();
    return c?.status === 'CONFIRMED' ? c : undefined;
  });

  protected readonly formatMoney = formatMoney;
  /** The booking date, formatted once per confirmation (memoized like the dialog/pay siblings). */
  protected readonly dateLabel = computed(() => {
    const c = this.confirmation();
    return c ? formatBookingDate(c.bookingDate) : '';
  });
}
