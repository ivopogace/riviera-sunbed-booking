import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { DeviceLocalBookings } from '../core/device-local-bookings';
import { formatBookingDate } from '../shared/booking-date-label';
import { metaFor } from '../shared/booking-status';
import { CardGlass } from '../shared/card-glass';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { MyBookingSummary } from './booking.model';
import { BookingService } from './booking.service';

/** The design's per-status sub-label (server-truth-adjacent); '' for CONFIRMED (no sub-label). */
function subLineOf(b: MyBookingSummary): string {
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

function buildView(b: MyBookingSummary): RowView {
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
 * The tourist's "My bookings" list (issue #139 device-local base; S3 #114 signed-in merge).
 *
 * <p><strong>Signed out (guest):</strong> the only key to a booking is its unguessable code
 * (invariant #7) — {@link DeviceLocalBookings} holds the codes this browser created, and this screen
 * fetches each live from `GET /api/bookings/{code}` so every row shows the current server status;
 * there is deliberately no guest list endpoint.
 *
 * <p><strong>Signed in (S3 #114):</strong> the screen also loads the customer's account-linked
 * bookings from `GET /api/me/bookings` (a single, already-enriched call) and MERGES them with the
 * device-local codes, deduped by code — nothing the user could already see disappears, and
 * account-linked bookings show on any device they sign in on. Back-linking past guest bookings by
 * email is a later, #113-gated step (design D-6), so a pre-sign-in guest booking made elsewhere is
 * not yet listed here. The merge is display-only — no booking codes are handed to the account.
 *
 * <p>Each row loads independently into a precomputed {@link RowView}. Rows link to the T5
 * `/booking/:code` detail view. Money renders from integer minor units via {@link formatMoney}
 * (invariant #5); the PENDING_REQUEST deadline via {@link formatDeadline} (Europe/Tirane, invariant
 * #6). On a `404` a device-local row is dropped from view but the code is kept (invariant #7 — a 404
 * can be transient); a transient/offline failure shows Retry. Codes are treated as secrets — never logged.
 */
@Component({
  selector: 'app-my-bookings',
  imports: [RouterLink, CardGlass],
  template: `
    <section class="my-bookings" aria-labelledby="mb-title">
      <a routerLink="/" class="back-link">← All beaches</a>
      <h1 id="mb-title">Your bookings</h1>

      @if (loading()) {
        <div class="rows" aria-busy="true" data-testid="my-bookings-loading">
          <div class="row row--loading" appCardGlass>
            <span class="row-main">
              <span class="skeleton skeleton-line"></span>
              <span class="skeleton skeleton-line short"></span>
            </span>
          </div>
        </div>
      } @else if (rows().length === 0) {
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
  private readonly auth = inject(CustomerAuth);

  protected readonly rows = signal<readonly Row[]>([]);
  /**
   * True until the initial list is decided (the session restore has settled AND the first rows are
   * set). Gates the empty card so a signed-in account fetch in flight never flashes "No booking yet".
   */
  protected readonly loading = signal(true);

  constructor() {
    // Load ONCE the session restore has settled — signed-in vs guest is only known then. untracked()
    // so reading the auth/store signals inside the load never re-triggers this effect (restoring
    // flips true→false exactly once, so the body runs a single time).
    effect(() => {
      if (this.auth.restoring()) {
        return;
      }
      untracked(() => this.loadAll());
    });
  }

  private loadAll(): void {
    const codes = this.store.codes();
    if (this.auth.signedIn()) {
      this.loadSignedIn(codes);
    } else {
      this.loadDeviceLocal(codes);
    }
  }

  /** Guest / signed-out: the device-local codes only (issue #139), each fetched live by code. */
  private loadDeviceLocal(codes: readonly string[]): void {
    this.rows.set(codes.map((code) => ({ code, state: 'loading' as const })));
    this.loading.set(false);
    codes.forEach((code) => this.load(code));
  }

  /**
   * Signed in (S3 #114): MERGE the account's server list with this device's remembered codes, deduped
   * by code. Account rows arrive fully loaded from the one list call; device-local codes the account
   * list doesn't cover (e.g. a guest booking made here before signing in) are still shown, fetched
   * per-code as in guest mode — nothing the user could already see disappears. A failed list call
   * falls back to the device-local view, so a signed-in user keeps at least this device's bookings.
   */
  private loadSignedIn(deviceCodes: readonly string[]): void {
    this.bookings.myBookings().subscribe({
      next: (account) => {
        const accountCodes = new Set(account.map((b) => b.code));
        const accountRows: Row[] = account.map((b) => ({ code: b.code, state: 'loaded', view: buildView(b) }));
        const extra = deviceCodes.filter((code) => !accountCodes.has(code));
        this.rows.set([...accountRows, ...extra.map((code) => ({ code, state: 'loading' as const }))]);
        this.loading.set(false);
        extra.forEach((code) => this.load(code));
      },
      error: () => this.loadDeviceLocal(deviceCodes),
    });
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
