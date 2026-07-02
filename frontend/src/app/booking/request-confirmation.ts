import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';

/**
 * Screen shown after a Request-to-Book submission (issue #98, route `booking/requested`).
 * Renders the `PENDING_REQUEST` hand-off from {@link BookingService}: the code prominently (it is
 * the guest's only key to the booking — a bearer credential, invariant #7 — so they must keep
 * it), the venue's response deadline, and the amount that is only charged if the venue accepts.
 * On a cold load with no request in memory it shows a "start over" message rather than a blank
 * screen, mirroring the confirmation screen. State is conveyed in text, never colour alone.
 */
@Component({
  selector: 'app-request-confirmation',
  imports: [RouterLink],
  template: `
    @if (requested(); as r) {
      <section class="confirmation" aria-labelledby="request-title">
        <h1 id="request-title">Request sent</h1>
        <p class="lead">
          {{ r.venueName }} reviews each booking. Your spot is held while they respond — you
          haven’t paid anything yet.
        </p>

        <p class="code" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <strong>{{ r.code }}</strong>
        </p>
        <p class="keep-note">Keep this code — it’s the only way to check on your request.</p>

        <dl class="summary">
          <dt>Status</dt>
          <dd data-testid="request-status">Pending — waiting for the venue to respond</dd>
          <dt>Venue</dt>
          <dd>{{ r.venueName }}</dd>
          <dt>Set</dt>
          <dd>{{ r.rowLabel }} · spot {{ r.positionNo }}</dd>
          <dt>Date</dt>
          <dd>{{ r.bookingDate }}</dd>
          <dt>Amount</dt>
          <dd>{{ formatMoney(r.amount) }} — you’ll only pay if the venue accepts</dd>
          <dt>Respond by</dt>
          <dd data-testid="request-deadline">{{ deadline(r.requestExpiresAt) }}</dd>
        </dl>

        <a [routerLink]="['/booking', r.code]" class="home-link" data-testid="status-link">
          Check the status of this request
        </a>
        <a routerLink="/" class="home-link">Back to home</a>
      </section>
    } @else {
      <section class="confirmation" aria-labelledby="request-title">
        <h1 id="request-title">No request to show</h1>
        <p class="lead">Your booking request isn’t available here anymore.</p>
        <a routerLink="/" class="home-link">Start a new booking</a>
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

  /** The venue's response deadline rendered in Europe/Tirane wall-clock time (invariant #6). */
  protected deadline(iso: string): string {
    return formatDeadline(iso);
  }
}
