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
    case 'WITHDRAWN':
      return 'Request withdrawn';
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
      } @else if (rows().length === 0 && !accountError()) {
        <section class="empty-card" appCardGlass aria-labelledby="mb-empty-title" data-testid="my-bookings-empty">
          <h2 id="mb-empty-title">No booking yet</h2>
          <p class="empty-lead">
            Pick a beach, choose your exact set on the map, and your booking code will live here.
          </p>
          <a routerLink="/" class="btn-cta" data-testid="browse-beaches">Browse beaches</a>
        </section>
      } @else {
        @if (accountError()) {
          <section class="empty-card" appCardGlass role="status" data-testid="account-error">
            <p class="empty-lead">
              We couldn’t load your account bookings just now — any made on other devices may be missing.
            </p>
            <button type="button" class="btn-cta" (click)="retryAccount()" data-testid="account-retry">
              Retry
            </button>
          </section>
        }
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
  /**
   * The account list (signed-in) failed to load — surface a Retry rather than silently hiding the
   * account bookings behind the device-local ones (review F1).
   */
  protected readonly accountError = signal(false);

  constructor() {
    // Kick the load once the session restore has settled — signed-in vs guest is only known then.
    // effect() is the appropriate tool per Angular's guidance: this SYNCS settled signal state to an
    // IMPERATIVE, non-signal API — the RxJS orchestration below is a one-shot union of two async
    // sources (the account list + per-code device fetches, each with its own retry/404 state), not a
    // signal→signal derivation (which would be a computed/linkedSignal). untracked() keeps it one-shot:
    // restoring() flips true→false exactly once, and the load's own signal reads never re-trigger this.
    effect(() => {
      if (this.auth.restoring()) {
        return;
      }
      untracked(() => this.loadAll());
    });
  }

  private loadAll(): void {
    const codes = this.store.codes();
    // Device-local rows render IMMEDIATELY in both modes, so a slow or failed account fetch never
    // blocks them (review F2 — pre-S3 the device bookings always showed at once). Signed in, the
    // account list then merges IN the bookings this device doesn't already list.
    this.loadDeviceLocal(codes);
    if (this.auth.signedIn()) {
      this.loadAccount(codes);
    }
  }

  /** Render this device's remembered codes (issue #139), each fetched live by code. */
  private loadDeviceLocal(codes: readonly string[]): void {
    this.rows.set(codes.map((code) => ({ code, state: 'loading' as const })));
    this.loading.set(false);
    codes.forEach((code) => this.load(code));
  }

  /**
   * Signed in (S3 #114): merge the account's server list ON TOP of the already-rendered device rows,
   * adding only the bookings this device does NOT already list (deduped by code — a booking made on
   * another device). A failed or slow list call leaves the device rows intact and surfaces a Retry
   * (review F1) rather than silently hiding the account bookings; a 401 (expired session) surfaces the
   * same way, not as a false "these are all your bookings."
   */
  private loadAccount(deviceCodes: readonly string[]): void {
    this.accountError.set(false);
    const onDevice = new Set(deviceCodes);
    this.bookings.myBookings().subscribe({
      next: (account) => {
        const additions: Row[] = account
          .filter((b) => !onDevice.has(b.code))
          .map((b) => ({ code: b.code, state: 'loaded', view: buildView(b) }));
        if (additions.length > 0) {
          this.rows.update((rows) => [...rows, ...additions]);
        }
      },
      error: () => this.accountError.set(true),
    });
  }

  /** Re-attempt the account list after a failure (review F1); the device rows stay untouched. */
  protected retryAccount(): void {
    this.loadAccount(this.store.codes());
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
