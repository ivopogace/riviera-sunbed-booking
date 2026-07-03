import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DeviceLocalBookings } from '../core/device-local-bookings';
import { formatBookingDate } from '../shared/booking-date-label';
import { metaFor } from '../shared/booking-status';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { BookingDetail } from './booking.model';
import { BookingService } from './booking.service';

/** One list row: still fetching, loaded from the server, or a transient fetch failure (retryable). */
type Row =
  | { readonly code: string; readonly state: 'loading' }
  | { readonly code: string; readonly state: 'loaded'; readonly detail: BookingDetail }
  | { readonly code: string; readonly state: 'failed' };

/** A booking gone from the backend (deleted / never existed) — its code is dropped from the device. */
function isGone(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

/**
 * The guest's device-local "My bookings" list (issue #139, epic #133; design v3 *My bookings* list
 * card). A guest has no account (#114 unshipped), so the only key to a booking is its unguessable
 * code (invariant #7): {@link DeviceLocalBookings} holds the codes this browser created, and this
 * screen fetches each one live from `GET /api/bookings/{code}` so every row shows the **current**
 * server status (a request accepted/declined/expired elsewhere is reflected on the next load) —
 * there is deliberately no guest list endpoint.
 *
 * <p>Each row loads independently: a `404` silently drops the code from the device; a transient
 * failure keeps it and offers Retry. Rows are links to the T5 `/booking/:code` detail view. Money
 * renders from integer minor units via {@link formatMoney} (invariant #5); the PENDING_REQUEST
 * deadline via the shared {@link formatDeadline} (Europe/Tirane, invariant #6) — the component does
 * no `Date`/cutoff arithmetic. `AWAITING_PAYMENT` has no server pay-by field, so its sub-label is
 * the "Payment needed" fallback. Codes are treated as secrets — never logged.
 */
@Component({
  selector: 'app-my-bookings',
  imports: [RouterLink],
  template: `
    <section class="my-bookings" aria-labelledby="mb-title">
      <a routerLink="/" class="back-link">← All beaches</a>
      <h1 id="mb-title">Your bookings</h1>

      @if (rows().length === 0) {
        <section class="empty-card" aria-labelledby="mb-empty-title" data-testid="my-bookings-empty">
          <h2 id="mb-empty-title">No booking yet</h2>
          <p class="empty-lead">
            Pick a beach, choose your exact set on the map, and your booking code will live here.
          </p>
          <a routerLink="/" class="btn-cta" data-testid="browse-beaches">Browse beaches</a>
        </section>
      } @else {
        <ul class="rows" role="list">
          @for (row of rows(); track row.code) {
            <li>
              @switch (row.state) {
                @case ('loaded') {
                  <a
                    [routerLink]="['/booking', row.detail.code]"
                    class="row"
                    data-testid="booking-row"
                  >
                    <span class="row-main">
                      <span class="venue">{{ row.detail.venueName }}</span>
                      <span class="meta"
                        >{{ row.detail.rowLabel }}&ngsp;· spot {{ row.detail.positionNo }}</span
                      >
                      <span class="meta">{{ dateLabel(row.detail.bookingDate) }}</span>
                      @if (subLine(row.detail); as sub) {
                        <span class="subline" data-testid="row-subline">{{ sub }}</span>
                      }
                      <span class="code">{{ row.detail.code }}</span>
                    </span>
                    <span class="row-side">
                      <!-- Status conveyed in text (the chip label), never colour alone (WCAG AA). -->
                      <span class="chip {{ chipClass(row.detail.status) }}" data-testid="row-status">{{
                        statusLabel(row.detail.status)
                      }}</span>
                      <span class="amount">{{ formatMoney(row.detail.amount) }}</span>
                    </span>
                  </a>
                }
                @case ('failed') {
                  <div class="row row--failed" data-testid="booking-row-failed">
                    <span class="row-main">
                      <span class="venue">Couldn’t load this booking</span>
                      <span class="meta">Check your connection and try again.</span>
                    </span>
                    <button
                      type="button"
                      class="btn-retry"
                      (click)="retry(row.code)"
                      data-testid="row-retry"
                    >
                      Retry
                    </button>
                  </div>
                }
                @default {
                  <div class="row row--loading" aria-busy="true" data-testid="booking-row-loading">
                    <span class="row-main">
                      <span class="skeleton skeleton-line"></span>
                      <span class="skeleton skeleton-line short"></span>
                    </span>
                  </div>
                }
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './my-bookings.scss',
})
export class MyBookings {
  private readonly store = inject(DeviceLocalBookings);
  private readonly bookings = inject(BookingService);

  protected readonly rows = signal<readonly Row[]>([]);

  /** Money formatter (shared, minor units — invariant #5), exposed to the template. */
  protected readonly formatMoney = formatMoney;

  constructor() {
    // Snapshot the remembered codes once and fetch each live. Placeholder loading rows first so the
    // list keeps the device's newest-first order as the async fetches resolve into it.
    const codes = this.store.codes();
    this.rows.set(codes.map((code) => ({ code, state: 'loading' as const })));
    codes.forEach((code) => this.load(code));
  }

  protected retry(code: string): void {
    this.load(code);
  }

  private load(code: string): void {
    this.setRow({ code, state: 'loading' });
    this.bookings.getByCode(code).subscribe({
      next: (detail) => this.setRow({ code, state: 'loaded', detail }),
      error: (e: unknown) => {
        if (isGone(e)) {
          // The backend no longer recognizes this code: forget it and drop the row silently.
          this.store.forget(code);
          this.rows.update((rows) => rows.filter((r) => r.code !== code));
        } else {
          // Transient (offline / 5xx): keep the code, offer Retry — never lose a valid booking.
          this.setRow({ code, state: 'failed' });
        }
      },
    });
  }

  private setRow(row: Row): void {
    this.rows.update((rows) => rows.map((r) => (r.code === row.code ? row : r)));
  }

  /** The design's per-status sub-label (server-truth-adjacent); '' for CONFIRMED (no sub-label). */
  protected subLine(b: BookingDetail): string {
    switch (b.status) {
      case 'AWAITING_PAYMENT':
        // No server pay-by deadline exists (only requestExpiresAt, the venue response deadline) →
        // fall back rather than invent a cutoff (invariants #4/#6; epic forbids a backend change).
        return 'Payment needed';
      case 'PENDING_REQUEST':
        return b.requestExpiresAt
          ? `Awaiting host · by ${formatDeadline(b.requestExpiresAt)}`
          : 'Awaiting host reply';
      case 'DECLINED':
        return 'Host could not accept';
      case 'EXPIRED':
        return 'Request expired unanswered';
      case 'CANCELLED':
        return 'Booking cancelled';
      case 'COMPLETED':
        return 'Enjoyed · thanks for visiting';
      case 'NO_SHOW':
        return 'Marked as no-show';
      default:
        return '';
    }
  }

  /** The design label for a status (drives the chip; shared source of truth). */
  protected statusLabel(status: string): string {
    return metaFor(status).label;
  }

  /** The chip CSS-modifier class for a status. */
  protected chipClass(status: string): string {
    return metaFor(status).chip;
  }

  /** The booking date as a friendly civil-date label (UTC-parsed, invariant #6). */
  protected dateLabel(iso: string): string {
    return formatBookingDate(iso, { withYear: true });
  }
}
