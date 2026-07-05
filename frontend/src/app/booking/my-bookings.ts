import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DeviceLocalBookings } from '../core/device-local-bookings';
import { formatBookingDate } from '../shared/booking-date-label';
import { metaFor } from '../shared/booking-status';
import { CardGlass } from '../shared/card-glass';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { BookingDetail } from './booking.model';
import { BookingService } from './booking.service';

/** The design's per-status sub-label (server-truth-adjacent); '' for CONFIRMED (no sub-label). */
function subLineOf(b: BookingDetail): string {
  switch (b.status) {
    case 'AWAITING_PAYMENT':
      // No server pay-by deadline exists (only requestExpiresAt, the venue response deadline) →
      // fall back rather than invent a cutoff (invariants #4/#6; the epic forbids a backend change).
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

/** The flattened, presentation-ready row — computed once when the detail loads (not per CD pass). */
interface RowView {
  readonly code: string;
  readonly venueName: string;
  readonly setLabel: string;
  readonly dateLabel: string;
  readonly subLine: string;
  readonly statusLabel: string;
  readonly chipClass: string;
  /** 'Paid' once money has moved; 'Amount' while open / no charge — disambiguates the figure. */
  readonly amountLabel: string;
  readonly amountStr: string;
}

function buildView(b: BookingDetail): RowView {
  const meta = metaFor(b.status);
  return {
    code: b.code,
    venueName: b.venueName,
    setLabel: `${b.rowLabel} · spot ${b.positionNo}`,
    dateLabel: formatBookingDate(b.bookingDate, { withYear: true }),
    subLine: subLineOf(b),
    statusLabel: meta.label,
    chipClass: meta.chip,
    amountLabel: meta.amount,
    amountStr: formatMoney(b.amount),
  };
}

/** One list row: still fetching, loaded (its view-model ready), or a transient fetch failure. */
type Row =
  | { readonly code: string; readonly state: 'loading' }
  | { readonly code: string; readonly state: 'loaded'; readonly view: RowView }
  | { readonly code: string; readonly state: 'failed' };

/** A booking the backend does not return right now — a 404 on the per-code lookup. */
function isNotFound(error: unknown): boolean {
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
 * <p>Each row loads independently into a precomputed {@link RowView}. Rows are links to the T5
 * `/booking/:code` detail view. Money renders from integer minor units via {@link formatMoney}
 * (invariant #5); the PENDING_REQUEST deadline via the shared {@link formatDeadline} (Europe/Tirane,
 * invariant #6) — the component does no `Date`/cutoff arithmetic. On a `404` the row is dropped from
 * view but the code is **kept** (invariant #7: it is the guest's only key and a 404 can be transient
 * — a recovered booking reappears next load); a transient/offline failure shows Retry. Codes are
 * treated as secrets — never logged.
 */
@Component({
  selector: 'app-my-bookings',
  imports: [RouterLink, CardGlass],
  template: `
    <section class="my-bookings" aria-labelledby="mb-title">
      <a routerLink="/" class="back-link">← All beaches</a>
      <h1 id="mb-title">Your bookings</h1>

      @if (rows().length === 0) {
        <section class="empty-card" appCardGlass aria-labelledby="mb-empty-title" data-testid="my-bookings-empty">
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
                  <a [routerLink]="['/booking', row.view.code]" class="row" appCardGlass data-testid="booking-row">
                    <span class="row-main">
                      <span class="venue">{{ row.view.venueName }}</span>
                      <span class="meta">{{ row.view.setLabel }}</span>
                      <span class="meta">{{ row.view.dateLabel }}</span>
                      @if (row.view.subLine) {
                        <span class="subline" data-testid="row-subline">{{ row.view.subLine }}</span>
                      }
                      <span class="code">{{ row.view.code }}</span>
                    </span>
                    <span class="row-side">
                      <!-- Status conveyed in text (the chip label), never colour alone (WCAG AA). -->
                      <span class="chip {{ row.view.chipClass }}" data-testid="row-status">{{
                        row.view.statusLabel
                      }}</span>
                      <span class="amount-wrap">
                        <span class="amount-label" data-testid="row-amount-label">{{
                          row.view.amountLabel
                        }}</span>
                        <span class="amount">{{ row.view.amountStr }}</span>
                      </span>
                    </span>
                  </a>
                }
                @case ('failed') {
                  <div class="row row--failed" appCardGlass data-testid="booking-row-failed">
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
                  <div class="row row--loading" appCardGlass aria-busy="true" data-testid="booking-row-loading">
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
      next: (detail) => this.setRow({ code, state: 'loaded', view: buildView(detail) }),
      error: (e: unknown) => {
        if (isNotFound(e)) {
          // 404: drop the row from view, but keep the code (invariant #7 — see the class doc).
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
}
