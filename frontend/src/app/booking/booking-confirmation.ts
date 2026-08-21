import { Component, computed, inject } from '@angular/core';
import { ManageBookingLink } from './manage-booking-link';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../shared/card-glass';
import { BookingQr } from './booking-qr';
import { WithheldEmailNotice } from './withheld-email-notice';
import { formatBookingDate } from '../shared/booking-date-label';
import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';

/**
 * Confirmation screen shown after a successful booking. Renders
 * the "You're booked." glass card — the booking code (a bearer credential, invariant #7, confined
 * to this surface and the `/booking/:code` link) and a summary from {@link BookingService}'s last
 * confirmation. On a cold load with no confirmation in memory (e.g. a hard refresh) it shows a
 * "start over" message rather than a blank screen. No Guest row — the server confirmation carries
 * no guest name (the dialog's Review step shows it, where the form knows it).
 *
 * <p>When the server reports `emailWithheld` (the address is on the do-not-mail list, so the
 * confirmation mail was suppressed), the "We've also emailed it to you" half of the code note is
 * dropped and a save-your-code notice takes its place. The claim and the send decision come from the
 * same backend fact, so this surface cannot promise a mail that was never sent. No live region: the
 * notice is present at first render, and a live region only announces content that mutates after it
 * is already in the DOM.
 */
@Component({
  selector: 'app-booking-confirmation',
  imports: [ManageBookingLink, RouterLink, CardGlass, BookingQr, WithheldEmailNotice],
  template: `
    @if (confirmation(); as c) {
      <section class="confirmation" appCardGlass aria-labelledby="confirmation-title">
        <div class="badge" aria-hidden="true">✓</div>
        <h1 id="confirmation-title">You’re booked.</h1>
        <p class="lead">
          {{ c.rowLabel }} · spot {{ c.positionNo }} at {{ c.venueName }}<br />on {{ dateLabel() }}.
        </p>

        <dl class="summary">
          <div class="sum-row">
            <dt>Includes</dt>
            <dd>2 loungers + umbrella · full day</dd>
          </div>
          <div class="sum-row total">
            <dt>Paid</dt>
            <dd>{{ formatMoney(c.amount) }}</dd>
          </div>
        </dl>

        <div class="code-card" data-testid="booking-code">
          <span class="code-label">Booking code</span>
          <div class="code">{{ c.code }}</div>
          <div class="mt-3 flex justify-center">
            <app-booking-qr [code]="c.code" />
          </div>
          <p class="code-note">
            Show this code to staff when you arrive.
            @if (!c.emailWithheld) {
              <span>We’ve also emailed it to you.</span>
            }
          </p>
          @if (c.emailWithheld) {
            <app-withheld-email-notice />
          }
        </div>

        <a routerLink="/" class="btn-primary">Back to the beach</a>
        <a appManageBookingLink [routerLink]="['/booking', c.code]" class="link"></a>
      </section>
    } @else {
      <section class="confirmation" appCardGlass aria-labelledby="confirmation-title">
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
