import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';

/**
 * Confirmation screen shown after a successful booking (U3, issue #6). Renders the booking
 * code and a summary from {@link BookingService}'s last confirmation (no `GET by code`
 * endpoint until U6). On a cold load with no confirmation in memory (e.g. a hard refresh) it
 * shows a "start over" message rather than a blank screen.
 */
@Component({
  selector: 'app-booking-confirmation',
  imports: [RouterLink],
  template: `
    @if (confirmation(); as c) {
      <section class="confirmation" aria-labelledby="confirmation-title">
        <h1 id="confirmation-title">Booking confirmed</h1>
        <p class="lead">Show this code to staff when you arrive.</p>

        <p class="code" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <strong>{{ c.code }}</strong>
        </p>

        <dl class="summary">
          <dt>Venue</dt>
          <dd>{{ c.venueName }}</dd>
          <dt>Set</dt>
          <dd>{{ c.rowLabel }} · spot {{ c.positionNo }}</dd>
          <dt>Date</dt>
          <dd>{{ c.bookingDate }}</dd>
          <dt>Paid</dt>
          <dd>{{ formatMoney(c.amount) }}</dd>
        </dl>

        <a [routerLink]="['/booking', c.code]" class="home-link" data-testid="manage-link">
          View or cancel this booking
        </a>
        <a routerLink="/" class="home-link">Back to home</a>
      </section>
    } @else {
      <section class="confirmation" aria-labelledby="confirmation-title">
        <h1 id="confirmation-title">No booking to show</h1>
        <p class="lead">Your booking details aren’t available here anymore.</p>
        <a routerLink="/" class="home-link">Start a new booking</a>
      </section>
    }
  `,
  styleUrl: './booking-confirmation.scss',
})
export class BookingConfirmation {
  private readonly bookings = inject(BookingService);

  // Only render the "confirmed / Paid" card for an actually-CONFIRMED booking. An
  // AWAITING_PAYMENT booking (stripe profile) is routed to /booking/pay and confirmed via the
  // webhook (invariant #8) — it must never surface here as paid. Defensive belt-and-braces.
  protected readonly confirmation = computed(() => {
    const c = this.bookings.lastConfirmation();
    return c?.status === 'CONFIRMED' ? c : undefined;
  });

  protected readonly formatMoney = formatMoney;
}
