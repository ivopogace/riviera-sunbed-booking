import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, defer, from, mergeMap, tap } from 'rxjs';

import { CustomerAuth } from '../core/customer-auth';
import { DeviceLocalBookings } from '../core/device-local-bookings';
import { formatBookingDate } from '../shared/booking-date-label';
import { amountLabelFor, metaFor } from '../shared/booking-status';
import { CardGlass } from '../shared/card-glass';
import { LoadAnnouncer } from '../shared/load-announcer';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { StatusChip } from '../shared/status-chip';
import { BookingQr } from './booking-qr';
import { MyBookingSummary } from './booking.model';
import { BookingService } from './booking.service';

import { TouchTarget } from '../shared/touch-target';

/** The design's per-status sub-label (server-truth-adjacent); '' for CONFIRMED (no sub-label). */
function subLineOf(b: MyBookingSummary): string {
  switch (b.status) {
    case 'AWAITING_PAYMENT':
      // No server pay-by deadline exists (only requestExpiresAt, the venue response deadline) →
      // fall back rather than invent a cutoff (invariants #4/#6; deliberately not a backend change).
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
  /** 'Paid' once money has moved; 'Amount' while open, or when a cancellation never charged. */
  readonly amountLabel: string;
  readonly amountStr: string;
  /** CONFIRMED only — gates the row's scannable QR; terminal rows show status text alone. */
  readonly showQr: boolean;
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
    amountLabel: amountLabelFor(b.status, b.refundedAmount),
    amountStr: formatMoney(b.amount),
    showQr: b.status === 'CONFIRMED',
  };
}

/**
 * One list row: still fetching, loaded (its view-model ready), or a transient fetch failure. A
 * loaded row carries its raw ISO `bookingDate` — the chronological sort key — separate
 * from the presentation-only {@link RowView}.
 */
type Row =
  | { readonly code: string; readonly state: 'loading' }
  | {
      readonly code: string;
      readonly state: 'loaded';
      readonly view: RowView;
      readonly bookingDate: string;
    }
  | { readonly code: string; readonly state: 'failed' };

/**
 * Display order: loaded rows by booking date, newest first — the same key and direction
 * as the backend account list (`booking_date DESC`) — with still-loading/failed rows (date not yet
 * known) last. Ties (same date, or both undated) fall back to `rankOf`, each code's first-seen
 * position (device-store order, then the account list's own order), so same-date rows keep a
 * DETERMINISTIC order instead of freezing whichever fetch happened to resolve first — sorting is
 * re-applied incrementally on every resolution, so a date-only comparator would bake the network's
 * completion order into the list. The render-first rule is untouched (rows still render
 * immediately, then sort). ISO `YYYY-MM-DD` compares correctly as a string.
 */
function inDisplayOrder(rows: readonly Row[], rankOf: ReadonlyMap<string, number>): readonly Row[] {
  const dateOf = (r: Row): string => (r.state === 'loaded' ? r.bookingDate : '');
  return [...rows].sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da !== db) {
      return da < db ? 1 : -1;
    }
    return (rankOf.get(a.code) ?? 0) - (rankOf.get(b.code) ?? 0);
  });
}

/**
 * How many per-code lookups may be in flight at once. Under the ~6-connections-per-host
 * HTTP/1.1 cap this leaves a slot for the account list; on HTTP/2 it is a deliberate self-limit.
 */
const DEVICE_FETCH_CONCURRENCY = 5;

/** A booking the backend does not return right now — a 404 on the per-code lookup. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: number }).status === 404
  );
}

/**
 * The tourist's "My bookings" list: a device-local code base, merged with the account's own
 * list when signed in.
 *
 * <p><strong>Signed out (guest):</strong> the only key to a booking is its unguessable code
 * (invariant #7) — {@link DeviceLocalBookings} holds the codes this browser created, and this screen
 * fetches each live from `GET /api/bookings/{code}` so every row shows the current server status;
 * there is deliberately no guest list endpoint.
 *
 * <p><strong>Signed in:</strong> the screen also loads the customer's account-linked
 * bookings from `GET /api/me/bookings` (a single, already-enriched call) and MERGES them with the
 * device-local codes, deduped by code — nothing the user could already see disappears, and
 * account-linked bookings show on any device they sign in on. Back-linking past guest bookings by
 * email is a permanent non-goal (design D-6), so a pre-sign-in guest booking made elsewhere is
 * never listed here. The merge is display-only — no booking codes are handed to the account.
 *
 * <p><strong>Fetch scheduling:</strong> the per-code lookups are queued through a bounded
 * {@link DEVICE_FETCH_CONCURRENCY} rather than all issued at once. That bound is also what makes
 * the account list able to answer for a device code: because the queue subscribes to each lookup
 * lazily, a code still waiting its turn when `GET /api/me/bookings` returns is served from that
 * response and never fetched. Crucially this is a dequeue-time skip, **not** a barrier — device
 * rows and their first requests go out immediately, so a slow or failed account list never delays
 * them. Because those first requests are therefore always in flight when the account
 * list lands, the account's answer is also treated as **authoritative once given**: a per-code
 * lookup that fails afterwards leaves the row alone rather than retracting a booking the account
 * just vouched for. The stored code list itself is deliberately uncapped and unpruned — see
 * {@link DeviceLocalBookings#forget}.
 *
 * <p>Each row loads independently into a precomputed {@link RowView}, and the list stays
 * chronologically sorted — newest booking date first, undated (still-loading/failed) rows last —
 * re-sorting as each async row resolves ({@link inDisplayOrder}). Rows link to the
 * `/booking/:code` detail view. Money renders from integer minor units via {@link formatMoney}
 * (invariant #5); the PENDING_REQUEST deadline via {@link formatDeadline} (Europe/Tirane, invariant
 * #6). On a `404` a device-local row is dropped from view but the code is kept (invariant #7 — a 404
 * can be transient); a transient/offline failure shows Retry. Codes are treated as secrets — never logged.
 */
/** The card-glass row chrome (v4 translate utilities animate `translate`, so the transition lists it). */
const ROW =
  'flex w-full items-center gap-3.5 rounded-[22px] px-[18px] py-4 shadow-[0_10px_30px_rgba(7,42,58,0.22),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[24px] backdrop-saturate-[1.7] [transition:translate_0.15s_ease,box-shadow_0.15s_ease] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(7,42,58,0.3),inset_0_1px_0_rgba(255,255,255,0.9)] motion-reduce:transition-none';
const SKELETON =
  'skeleton block animate-pulse rounded-[6px] bg-(--riv-card-track) motion-reduce:animate-none';
const EMPTY_CARD =
  'rounded-[28px] px-[30px] py-10 text-center shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[1.7]';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  row: `${ROW} focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink)`,
  rowPlaceholder: `${ROW} justify-between`,
  rowMain: 'flex min-w-0 flex-1 flex-col gap-[3px]',
  meta: 'text-[13px] text-(--riv-card-ink-soft)',
  skeletonLine: `${SKELETON} h-[12px] w-3/5`,
  skeletonLineShort: `${SKELETON} mt-2 h-[10px] w-[35%]`,
  emptyCard: EMPTY_CARD,
  emptyLead: 'mb-5 text-[14.5px] leading-[1.5] text-(--riv-card-ink-soft)',
  cta: 'inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) px-[26px] py-[13px] text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
} as const;

@Component({
  selector: 'app-my-bookings',
  imports: [RouterLink, CardGlass, LoadAnnouncer, StatusChip, BookingQr, TouchTarget],
  template: `
    <section class="mx-auto w-full max-w-[560px] px-5 pt-6 pb-20" aria-labelledby="mb-title">
      <a
        routerLink="/"
        class="mb-3.5 inline-flex min-h-11 items-center text-[14px] font-semibold text-(--riv-accent-ink) hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink)"
        >← All beaches</a
      >
      <h1 class="mb-[18px] text-[clamp(28px,4vw,34px)] font-bold tracking-[-0.02em]" id="mb-title">
        Your bookings
      </h1>

      <!-- Above the @if on purpose: a live region must outlive the branch it describes (#741). -->
      <app-load-announcer
        [loading]="showSkeleton()"
        [ready]="announceReady()"
        loadingLabel="Loading your bookings…"
        readyLabel="Your bookings loaded."
      />

      @if (showSkeleton()) {
        <!-- Wholly decorative skeleton — the announcer above owns the words (#741). -->
        <div aria-hidden="true" data-testid="my-bookings-loading">
          <div [class]="cls.rowPlaceholder" appCardGlass>
            <span [class]="cls.rowMain">
              <span [class]="cls.skeletonLine"></span>
              <span [class]="cls.skeletonLineShort"></span>
            </span>
          </div>
        </div>
      } @else if (rows().length === 0 && !accountError()) {
        <section
          [class]="cls.emptyCard"
          appCardGlass
          aria-labelledby="mb-empty-title"
          data-testid="my-bookings-empty"
        >
          <h2 class="mb-2 text-[26px] font-bold tracking-[-0.02em]" id="mb-empty-title">
            No booking yet
          </h2>
          <p [class]="cls.emptyLead">
            Pick a beach, choose your exact set on the map, and your booking code will live here.
          </p>
          <a routerLink="/" [class]="cls.cta" data-testid="browse-beaches">Browse beaches</a>
        </section>
      } @else {
        @if (accountError()) {
          <section [class]="cls.emptyCard" appCardGlass role="status" data-testid="account-error">
            <p [class]="cls.emptyLead">
              We couldn’t load your account bookings just now — any made on other devices may be
              missing.
            </p>
            <button
              appTouchTarget
              type="button"
              [class]="cls.cta"
              (click)="retryAccount()"
              data-testid="account-retry"
            >
              Retry
            </button>
          </section>
        }
        <ul class="flex flex-col gap-3" role="list">
          @for (row of rows(); track row.code) {
            <li>
              @switch (row.state) {
                @case ('loaded') {
                  <a
                    [routerLink]="['/booking', row.view.code]"
                    [class]="cls.row"
                    appCardGlass
                    data-testid="booking-row"
                  >
                    <span [class]="cls.rowMain">
                      <span class="text-[16px] font-bold">{{ row.view.venueName }}</span>
                      <span [class]="cls.meta">{{ row.view.setLabel }}</span>
                      <span [class]="cls.meta">{{ row.view.dateLabel }}</span>
                      @if (row.view.subLine) {
                        <span
                          class="text-[12px] font-semibold text-(--riv-card-ink-soft)"
                          data-testid="row-subline"
                          >{{ row.view.subLine }}</span
                        >
                      }
                      <span
                        class="code mt-[2px] text-[12px] font-bold tracking-[0.08em] text-(--riv-accent-ink)"
                        >{{ row.view.code }}</span
                      >
                      @if (row.view.showQr) {
                        <app-booking-qr class="mt-2" [code]="row.view.code" [size]="104" />
                      }
                    </span>
                    <span class="flex shrink-0 flex-col items-end gap-1.5">
                      <!-- Status conveyed in text (the chip label), never colour alone (WCAG AA). -->
                      <span [appStatusChip]="row.view.chipClass" data-testid="row-status">{{
                        row.view.statusLabel
                      }}</span>
                      <span class="flex flex-col items-end gap-[1px]">
                        <span
                          class="text-[10px] font-bold tracking-[0.08em] uppercase text-(--riv-card-ink-soft)"
                          data-testid="row-amount-label"
                          >{{ row.view.amountLabel }}</span
                        >
                        <span class="text-[13.5px] font-bold">{{ row.view.amountStr }}</span>
                      </span>
                    </span>
                  </a>
                }
                @case ('failed') {
                  <div [class]="cls.rowPlaceholder" appCardGlass data-testid="booking-row-failed">
                    <span [class]="cls.rowMain">
                      <span class="text-[16px] font-bold">Couldn’t load this booking</span>
                      <span [class]="cls.meta">Check your connection and try again.</span>
                    </span>
                    <button
                      appTouchTarget
                      type="button"
                      class="shrink-0 cursor-pointer rounded-[14px] border-[1.5px] border-[rgba(255,255,255,0.7)] bg-[#f4f6f7] px-3.5 py-2 text-[13px] font-semibold text-[#0a4f5e] [transition:background_0.15s_ease] hover:bg-[#e7ebec] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink) motion-reduce:transition-none"
                      (click)="retry(row.code)"
                      data-testid="row-retry"
                    >
                      Retry
                    </button>
                  </div>
                }
                @default {
                  <div
                    [class]="cls.rowPlaceholder"
                    appCardGlass
                    aria-busy="true"
                    data-testid="booking-row-loading"
                  >
                    <span [class]="cls.rowMain">
                      <span [class]="cls.skeletonLine"></span>
                      <span [class]="cls.skeletonLineShort"></span>
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
  host: { class: 'block text-(--riv-card-ink)' },
})
export class MyBookings {
  protected readonly cls = CLS;

  private readonly store = inject(DeviceLocalBookings);
  private readonly bookings = inject(BookingService);
  private readonly auth = inject(CustomerAuth);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly Row[]>([]);
  /**
   * True until the initial list is decided (the session restore has settled AND the first rows are
   * set). It is cleared as soon as the DEVICE rows render, so it cannot gate the empty card on its
   * own; {@link showSkeleton} is what does, by keeping the skeleton up while a signed-in account
   * fetch is still out and there is nothing else to draw.
   */
  private readonly loading = signal(true);
  /**
   * The account list (signed-in) failed to load — surface a Retry rather than silently hiding the
   * account bookings behind the device-local ones.
   */
  protected readonly accountError = signal(false);

  /**
   * The account list is out. Distinct from {@link loading}, which the device rows clear the moment
   * they render — so without this there is a window where nothing is "loading" and nothing has
   * failed yet, and the announcer would call that loaded. Never true for a guest:
   * {@link loadAccount} is the only writer. Read by {@link showSkeleton} and
   * {@link announceReady}, never by the template.
   */
  private readonly accountPending = signal(false);

  /**
   * Nothing to draw yet, so the page-level skeleton stands in — and the same signal is the
   * announcer's `loading`, so what is drawn and what is announced cannot disagree. Deliberately
   * NOT just {@link loading}: that is cleared the moment the device rows render, which for a
   * signed-in customer whose bookings all live on the server leaves zero rows and no skeleton
   * for the whole account round trip.
   *
   * <p>Per-code rows resolving behind their own row skeletons are NOT this signal's business —
   * the page has something to draw then. {@link announceReady} is what withholds the
   * announcement until they settle.
   */
  protected readonly showSkeleton = computed(
    () => this.loading() || (this.accountPending() && this.rows().length === 0),
  );

  /**
   * Every page-level read has settled **and produced a booking, or none**. Rows must be `'loaded'`,
   * not merely "not loading": a `'failed'` row renders a "Couldn't load this booking" retry card,
   * and announcing success over it is the same lie the `ready` polarity exists to prevent.
   *
   * <p>That is also what keeps the announcement single. A per-row Retry sends its row back to
   * `'loading'`, which would take this false and true again — but the button only exists inside
   * the `'failed'` case, and a failed row means the page never announced in the first place. So
   * the sequence a guest hears is silence → "loaded", never "loaded" → silence → "loaded".
   */
  protected readonly announceReady = computed(
    () =>
      !this.loading() &&
      !this.accountPending() &&
      !this.accountError() &&
      this.rows().every((row) => row.state === 'loaded'),
  );
  /**
   * Codes the account list has already answered for. Consulted when a queued per-code lookup
   * is DEQUEUED — never as a barrier, so device rows are still issued immediately.
   */
  private readonly accountResolved = new Set<string>();
  /** Each code's first-seen position — the {@link inDisplayOrder} tie-break for same-date rows. */
  private readonly displayRank = new Map<string, number>();

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

  /**
   * Device-local rows render IMMEDIATELY in both modes, so a slow or failed account fetch never
   * blocks them; signed in, the account list then merges IN the bookings this device doesn't
   * already list.
   */
  private loadAll(): void {
    const codes = this.store.codes();
    this.loadDeviceLocal(codes);
    if (this.auth.signedIn()) {
      this.loadAccount();
    }
  }

  /** Render this device's remembered codes, each fetched live by code, K at a time. */
  private loadDeviceLocal(codes: readonly string[]): void {
    codes.forEach((code, i) => this.displayRank.set(code, i));
    this.rows.set(codes.map((code) => ({ code, state: 'loading' as const })));
    this.loading.set(false);
    from(codes)
      .pipe(
        mergeMap((code) => this.queuedFetch(code), DEVICE_FETCH_CONCURRENCY),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /**
   * One queued lookup. `defer` keeps it lazy, so the skip test below runs when the queue REACHES
   * this code — by which time the account list may already have answered for it.
   */
  private queuedFetch(code: string): Observable<unknown> {
    return defer(() => (this.accountResolved.has(code) ? EMPTY : this.fetch(code)));
  }

  /**
   * Signed in: merge the account's server list ON TOP of the already-rendered device rows,
   * deduped by code. A failed or slow list call leaves the device rows intact and surfaces a Retry
   * rather than silently hiding the account bookings; a 401 (expired session) surfaces the
   * same way, not as a false "these are all your bookings."
   *
   * <p>Each returned code is also recorded as account-resolved, so a device code still sitting
   * in the fetch queue is answered from here instead of costing a second request for the same booking.
   */
  private loadAccount(): void {
    this.accountError.set(false);
    this.accountPending.set(true);
    this.bookings
      .myBookings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          account.forEach((b) => this.accountResolved.add(b.code));
          this.merge(
            account.map((b) => ({
              code: b.code,
              state: 'loaded' as const,
              view: buildView(b),
              bookingDate: b.bookingDate,
            })),
          );
          this.accountPending.set(false);
        },
        error: () => {
          this.accountError.set(true);
          this.accountPending.set(false);
        },
      });
  }

  /**
   * Merge server rows in: replace the row for a code already listed, append the rest, then re-sort
   * chronologically ({@link inDisplayOrder}). Both branches earn their keep —
   * <em>replace</em> answers a code still queued (its row is listed, loading), <em>append</em>
   * restores one a transient 404 had removed from the list entirely. Either way the row comes from
   * the same {@link buildView}, so it renders identically to a per-code fetch.
   */
  private merge(incoming: readonly Row[]): void {
    incoming
      .filter((r) => !this.displayRank.has(r.code))
      .forEach((r) => this.displayRank.set(r.code, this.displayRank.size));
    this.rows.update((rows) => {
      const byCode = new Map(incoming.map((r) => [r.code, r]));
      const listed = new Set(rows.map((r) => r.code));
      return inDisplayOrder(
        [
          ...rows.map((r) => byCode.get(r.code) ?? r),
          ...incoming.filter((r) => !listed.has(r.code)),
        ],
        this.displayRank,
      );
    });
  }

  /** Re-attempt the account list after a failure; the device rows stay untouched. */
  protected retryAccount(): void {
    this.loadAccount();
  }

  protected retry(code: string): void {
    // A manual retry bypasses the queue — the user asked for this one now.
    this.fetch(code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  /** The per-code lookup and its row transitions, shared by the queue and the manual Retry. */
  private fetch(code: string): Observable<unknown> {
    this.setRow({ code, state: 'loading' });
    return this.bookings.getByCode(code).pipe(
      tap((detail) =>
        this.setRow({
          code,
          state: 'loaded',
          view: buildView(detail),
          bookingDate: detail.bookingDate,
        }),
      ),
      catchError((e: unknown) => {
        if (this.accountResolved.has(code)) {
          // The account list already vouched for this booking — a failed lookup must not retract it.
          return EMPTY;
        }
        if (isNotFound(e)) {
          // 404: drop the row from view, but keep the code (invariant #7 — see the class doc).
          this.rows.update((rows) => rows.filter((r) => r.code !== code));
        } else {
          // Transient (offline / 5xx): keep the code, offer Retry — never lose a valid booking.
          this.setRow({ code, state: 'failed' });
        }
        return EMPTY;
      }),
    );
  }

  private setRow(row: Row): void {
    this.rows.update((rows) =>
      inDisplayOrder(
        rows.map((r) => (r.code === row.code ? row : r)),
        this.displayRank,
      ),
    );
  }
}
