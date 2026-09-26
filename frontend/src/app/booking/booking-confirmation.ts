import { Component, computed, inject } from '@angular/core';
import { ManageBookingLink } from './manage-booking-link';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../shared/card-glass';
import { BookingQr } from './booking-qr';
import { WithheldEmailNotice } from './withheld-email-notice';
import { formatStay } from '../shared/booking-date-label';
import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';
import { CheckIcon } from '../shared/check-icon';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'mx-auto my-8 max-w-[400px] rounded-[30px] px-[30px] pt-9 pb-[30px] text-center shadow-[0_18px_50px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-[30px] backdrop-saturate-[1.8]',
  h1: 'mb-2 text-[30px] font-bold tracking-[-0.02em]',
  lead: 'mb-[18px] text-[15px] leading-[1.45] text-riv-card-ink-soft',
} as const;

/**
 * The "You're booked." screen: the booking code (a bearer credential, invariant #7, confined to
 * this surface and the `/booking/:code` link) and a summary of {@link BookingService}'s last
 * confirmation; a cold load with none in memory shows "start over". No Guest row — the confirmation
 * carries no guest name. On `emailWithheld` (address suppressed) the "We've also emailed it" half
 * gives way to a save-your-code notice, from the same backend fact as the send decision. No live
 * region: the notice is present at first render, and a live region announces only later mutations.
 */
@Component({
  selector: 'app-booking-confirmation',
  imports: [ManageBookingLink, RouterLink, CardGlass, BookingQr, WithheldEmailNotice, CheckIcon],
  template: `
    @if (confirmation(); as c) {
      <section [class]="cls.card" appCardGlass aria-labelledby="confirmation-title">
        <div
          class="mx-auto mb-[18px] flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(255,255,255,0.6)] bg-riv-medallion-positive-fill text-riv-medallion-positive-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] [&_svg]:size-[28px]"
          aria-hidden="true"
        >
          <app-check-icon />
        </div>
        <h1 [class]="cls.h1" id="confirmation-title">You’re booked.</h1>
        <p [class]="cls.lead">
          {{ c.rowLabel }} · spot {{ c.positionNo }} at {{ c.venueName }}<br />on {{ dateLabel() }}.
        </p>

        <dl
          class="mb-3.5 rounded-[18px] border border-[rgba(255,255,255,0.6)] bg-riv-inset-fill px-4 py-3.5 text-left"
        >
          <div class="flex items-center justify-between gap-3 py-[5px] text-[13.5px]">
            <dt class="text-riv-card-ink-soft">Includes</dt>
            <dd class="font-semibold">2 loungers + umbrella · full day</dd>
          </div>
          <div
            class="mt-[5px] flex items-center justify-between gap-3 border-t border-riv-card-track pt-[7px] pb-[5px] text-[13.5px]"
          >
            <dt class="text-riv-card-ink-soft">Paid</dt>
            <dd class="text-[16px] font-bold text-riv-accent-ink">
              {{ formatMoney(c.amount) }}
            </dd>
          </div>
        </dl>

        <div
          class="mb-5 rounded-[18px] border border-dashed border-riv-field-border bg-riv-inset-fill p-[15px]"
          data-testid="booking-code"
        >
          <span class="block text-[11px] tracking-[0.16em] uppercase text-riv-card-ink-soft"
            >Booking code</span
          >
          <div class="mt-[5px] text-[27px] font-bold tracking-[0.12em] text-riv-accent-ink">
            {{ c.code }}
          </div>
          <div class="mt-3 flex justify-center">
            <app-booking-qr [code]="c.code" />
          </div>
          <p class="mt-2 text-[12px] leading-[1.4] text-riv-card-ink-soft">
            Show this code to staff when you arrive.
            @if (!c.emailWithheld) {
              <span>We’ve also emailed it to you.</span>
            }
          </p>
          @if (c.emailWithheld) {
            <app-withheld-email-notice />
          }
        </div>

        <a
          routerLink="/"
          class="block w-full rounded-2xl border border-riv-cta-border bg-(image:--riv-cta-grad) p-3.5 text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
          >Back to the beach</a
        >
        <app-manage-booking-link [code]="c.code" variant="link" />
      </section>
    } @else {
      <section [class]="cls.card" appCardGlass aria-labelledby="confirmation-title">
        <h1 [class]="cls.h1" id="confirmation-title">No booking to show</h1>
        <p [class]="cls.lead">Your booking details aren’t available here anymore.</p>
        <a
          routerLink="/"
          class="mt-3 inline-block text-[14.5px] font-semibold text-riv-accent-ink focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
          >Start a new booking</a
        >
      </section>
    }
  `,
})
export class BookingConfirmation {
  protected readonly cls = CLS;

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
    return c ? formatStay(c.bookingDate, c.lastDate ?? c.bookingDate) : '';
  });
}
