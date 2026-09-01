import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../shared/card-glass';
import { formatBookingDate } from '../shared/booking-date-label';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { BookingService } from './booking.service';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'mx-auto my-8 max-w-[410px] rounded-[30px] px-7.5 pt-8.5 pb-7 text-center shadow-[0_18px_50px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-[30px] backdrop-saturate-[1.8]',
  // The only badge rendered here is the amber "waiting" variant — the design's plain badge is unused.
  badge:
    'mx-auto mb-4.5 flex size-16 items-center justify-center rounded-full border border-[rgba(255,255,255,0.6)] bg-riv-medallion-waiting-fill text-[29px] text-riv-medallion-waiting-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  h1: 'm-0 mb-2 text-[27px] font-bold tracking-[-0.02em] text-riv-card-ink',
  lead: 'm-0 mb-4.5 text-[14.5px] leading-[1.5] text-riv-card-ink-soft',
  strong: 'text-riv-card-ink',
  infoBox:
    'mb-3.5 flex items-start gap-2.5 rounded-[18px] border border-riv-accent-border bg-riv-accent-fill px-4 py-3.5 text-left',
  infoIcon: 'text-[16px] leading-[1.3]',
  infoText: 'm-0 text-[13px] leading-[1.5] text-riv-card-ink-soft',
  codeCard:
    'mb-4 rounded-[18px] border border-dashed border-riv-field-border bg-riv-inset-fill p-3.5',
  codeLabel: 'block text-[11px] tracking-[0.16em] uppercase text-riv-card-ink-soft',
  code: 'mt-1.25 text-[26px] font-bold tracking-[0.12em] text-riv-accent-ink',
  status: 'm-0 mb-4.5 text-[13px] font-semibold text-riv-card-ink-soft',
  primary:
    'block w-full rounded-2xl border border-riv-cta-border bg-(image:--riv-cta-grad) p-3.5 text-[15px] font-bold text-white no-underline shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink',
  link: 'mt-3 inline-block text-[14.5px] font-semibold text-riv-accent-ink focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink',
} as const;

/**
 * Screen shown after a Request-to-Book submission (route
 * `booking/requested`). Renders the `PENDING_REQUEST` hand-off as the "Request sent" glass card: the
 * code prominently (the guest's only key to the booking — a bearer credential, invariant #7), the
 * venue's response deadline (Europe/Tirane, invariant #6), and the amount charged only if the venue
 * accepts. On a cold load with no request in memory it shows a "start over" message. State is
 * conveyed in text, never colour alone.
 */
@Component({
  selector: 'app-request-confirmation',
  imports: [RouterLink, CardGlass],
  template: `
    @if (requested(); as r) {
      <section [class]="cls.card" appCardGlass aria-labelledby="request-title">
        <div [class]="cls.badge" aria-hidden="true">✉</div>
        <h1 id="request-title" [class]="cls.h1">Request sent</h1>
        <p [class]="cls.lead">
          {{ r.rowLabel }} · spot {{ r.positionNo }} at {{ r.venueName }} on {{ dateLabel() }} is a
          <strong [class]="cls.strong">Request to Book</strong> venue. The host needs to accept
          before you pay — <strong [class]="cls.strong">you haven’t been charged</strong>.
        </p>

        <div [class]="cls.infoBox">
          <span [class]="cls.infoIcon" aria-hidden="true">⏳</span>
          <p [class]="cls.infoText">
            We’ll notify you by email as soon as the venue responds — expected by
            <strong [class]="cls.strong" data-testid="request-deadline">{{
              deadline(r.requestExpiresAt)
            }}</strong
            >. If accepted, you’ll get a link to pay
            <strong [class]="cls.strong">{{ formatMoney(r.amount) }}</strong> and lock in the set.
          </p>
        </div>

        <div [class]="cls.codeCard" data-testid="booking-code">
          <span [class]="cls.codeLabel">Request reference</span>
          <div [class]="cls.code">{{ r.code }}</div>
        </div>

        <p [class]="cls.status" data-testid="request-status">
          Pending — waiting for the venue to respond
        </p>

        <a [routerLink]="['/booking', r.code]" [class]="cls.primary" data-testid="status-link">
          Track this request
        </a>
        <a routerLink="/" [class]="cls.link">Back to the beach</a>
      </section>
    } @else {
      <section [class]="cls.card" appCardGlass aria-labelledby="request-title">
        <h1 id="request-title" [class]="cls.h1">No request to show</h1>
        <p [class]="cls.lead">Your booking request isn’t available here anymore.</p>
        <a routerLink="/" [class]="cls.link">Start a new booking</a>
      </section>
    }
  `,
})
export class RequestConfirmation {
  private readonly bookings = inject(BookingService);

  protected readonly cls = CLS;

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
