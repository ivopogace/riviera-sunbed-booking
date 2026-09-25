import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, defer, finalize, from, mergeMap, tap } from 'rxjs';

import { CustomerAuth } from '../core/customer-auth';
import { DeviceLocalBookings } from '../core/device-local-bookings';
import { formatStay } from '../shared/booking-date-label';
import { amountLabelFor, metaFor } from '../shared/booking-status';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { focusMover } from '../shared/focus-after-render';
import { LoadAnnouncer } from '../shared/load-announcer';
import { SkeletonBlock } from '../shared/skeleton-block';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { StatusChip } from '../shared/status-chip';
import { BookingQr } from './booking-qr';
import { BookingDetail, MyBookingSummary } from './booking.model';
import { BookingService } from './booking.service';

import { TouchTarget } from '../shared/touch-target';
import { ArrowLeftIcon } from '../shared/arrow-left-icon';

/**
 * What a row is built from: the account list's summary, or the per-code detail a device-local row
 * fetches. The detail carries the move inside {@link BookingDetail#move}; the summary as `movedAt`.
 */
type RowSource = MyBookingSummary | BookingDetail;

function movedAtOf(b: RowSource): string | null {
  return 'move' in b ? (b.move?.movedAt ?? null) : b.movedAt;
}

/** The per-status sub-label (server-truth-adjacent); '' for CONFIRMED unless a remodel moved it. */
function subLineOf(b: RowSource): string {
  switch (b.status) {
    case 'CONFIRMED':
      return movedAtOf(b) ? 'Spot changed by the venue · see details' : '';
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

function buildView(b: RowSource): RowView {
  const meta = metaFor(b.status);
  return {
    code: b.code,
    venueName: b.venueName,
    setLabel: `${b.rowLabel} · spot ${b.positionNo}`,
    dateLabel: formatStay(b.bookingDate, b.lastDate ?? b.bookingDate, { withYear: true }),
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
 * Display order: newest booking date first (as the backend's `booking_date DESC`), undated rows
 * last. Ties fall back to `rankOf` (first-seen order), so re-sorting on each resolution never bakes
 * the network's completion order into the list.
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
 * The tourist's "My bookings": device-local codes (bearer credentials, invariant #7 — never logged)
 * each fetched live, merged when signed in with `GET /api/me/bookings`, deduped by code; the merge
 * is display-only — no code is ever handed to the account. Lookups queue lazily behind
 * {@link DEVICE_FETCH_CONCURRENCY}: one the account list answers first is never fetched, yet the
 * list is no barrier; once given its answer is authoritative (a later lookup failure never retracts
 * a row). A 404 hides a device row but keeps its code, as it can be transient.
 */
/** The card-glass row chrome (v4 translate utilities animate `translate`, so the transition lists it). */
const ROW =
  'flex w-full items-center gap-3.5 rounded-[22px] px-[18px] py-4 shadow-[0_10px_30px_rgba(7,42,58,0.22),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[24px] backdrop-saturate-[1.7] [transition:translate_0.15s_ease,box-shadow_0.15s_ease] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(7,42,58,0.3),inset_0_1px_0_rgba(255,255,255,0.9)] motion-reduce:transition-none motion-reduce:hover:translate-y-0';
const SKELETON = 'skeleton block rounded-[6px] bg-riv-card-track';
const EMPTY_CARD =
  'rounded-[28px] px-[30px] py-10 text-center shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[1.7]';

/** The `[appBusy]` control's own aria-disabled skin (`shared/busy-action.ts`), shared by both retry buttons. */
const BUSY_SKIN = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-60';
const CTA =
  'inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-riv-cta-border bg-(image:--riv-cta-grad) px-[26px] py-[13px] text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  row: `${ROW} focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink`,
  rowPlaceholder: `${ROW} justify-between`,
  rowMain: 'flex min-w-0 flex-1 flex-col gap-[3px]',
  meta: 'text-[13px] text-riv-card-ink-soft',
  skeletonTitle: `${SKELETON} h-[14px] w-2/5`,
  skeletonLine: `${SKELETON} h-[12px] w-3/5`,
  skeletonLineShort: `${SKELETON} h-[12px] w-2/5`,
  skeletonLineTiny: `${SKELETON} mt-[2px] h-[11px] w-1/4`,
  skeletonChip: `${SKELETON} h-[22px] w-16 rounded-full`,
  skeletonAmount: `${SKELETON} h-[16px] w-11`,
  emptyCard: EMPTY_CARD,
  emptyLead: 'mb-5 text-[14.5px] leading-[1.5] text-riv-card-ink-soft',
  cta: CTA,
  ctaBusy: `${CTA} ${BUSY_SKIN}`,
  rowRetry: `shrink-0 cursor-pointer rounded-[14px] border-[1.5px] border-riv-solid-btn-border bg-riv-solid-btn-fill px-3.5 py-2 text-[13px] font-semibold text-riv-solid-btn-ink [transition:background_0.15s_ease] hover:bg-riv-solid-btn-hover focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink motion-reduce:transition-none ${BUSY_SKIN}`,
} as const;

@Component({
  selector: 'app-my-bookings',
  imports: [
    RouterLink,
    BusyAction,
    CardGlass,
    LoadAnnouncer,
    SkeletonBlock,
    StatusChip,
    BookingQr,
    TouchTarget,
    ArrowLeftIcon,
  ],
  template: `
    <section class="mx-auto w-full max-w-[560px] px-5 pt-6 pb-20" aria-labelledby="mb-title">
      <a
        routerLink="/"
        class="mb-3.5 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-riv-accent-ink hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
        ><app-arrow-left-icon class="[&_svg]:size-[14px]" />All beaches</a
      >
      <h1
        class="mb-[18px] text-[clamp(28px,4vw,34px)] font-bold tracking-[-0.02em]"
        id="mb-title"
        data-testid="mb-title"
      >
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
              <span appSkeletonBlock [class]="cls.skeletonTitle"></span>
              <span appSkeletonBlock [class]="cls.skeletonLine"></span>
              <span appSkeletonBlock [class]="cls.skeletonLineShort"></span>
              <span appSkeletonBlock [class]="cls.skeletonLineTiny"></span>
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1.5">
              <span appSkeletonBlock [class]="cls.skeletonChip"></span>
              <span appSkeletonBlock [class]="cls.skeletonAmount"></span>
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
          <section [class]="cls.emptyCard" appCardGlass role="alert" data-testid="account-error">
            <p [class]="cls.emptyLead">
              We couldn’t load your account bookings just now — any made on other devices may be
              missing.
            </p>
            <button
              appTouchTarget
              type="button"
              [class]="cls.ctaBusy"
              [appBusy]="accountPending()"
              (click)="retryAccount()"
              data-testid="account-retry"
            >
              {{ accountPending() ? 'Retrying…' : 'Retry' }}
            </button>
          </section>
        }
        @if (anyRowFailed()) {
          <!-- Page-level, once — never per row: role="alert" announces on insertion (#745). -->
          <p
            class="mb-3 rounded-xl bg-riv-form-error-fill px-3.5 py-[11px] text-[13px] font-semibold text-riv-form-error-ink"
            role="alert"
            data-testid="rows-failed-alert"
          >
            Some bookings couldn’t load. Retry the ones marked below.
          </p>
        }
        <ul class="flex flex-col gap-3" role="list">
          @for (row of rows(); track row.code) {
            <li [attr.data-row-code]="row.code">
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
                          class="text-[12px] font-semibold text-riv-card-ink-soft"
                          data-testid="row-subline"
                          >{{ row.view.subLine }}</span
                        >
                      }
                      <span
                        class="code mt-[2px] text-[12px] font-bold tracking-[0.08em] text-riv-accent-ink"
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
                          class="text-[10px] font-bold tracking-[0.08em] uppercase text-riv-card-ink-soft"
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
                      [class]="cls.rowRetry"
                      [appBusy]="retryingCodes().has(row.code)"
                      (click)="retry(row.code)"
                      data-testid="row-retry"
                    >
                      {{ retryingCodes().has(row.code) ? 'Retrying…' : 'Retry' }}
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
                      <span appSkeletonBlock [class]="cls.skeletonTitle"></span>
                      <span appSkeletonBlock [class]="cls.skeletonLine"></span>
                      <span appSkeletonBlock [class]="cls.skeletonLineShort"></span>
                      <span appSkeletonBlock [class]="cls.skeletonLineTiny"></span>
                    </span>
                    <span class="flex shrink-0 flex-col items-end gap-1.5">
                      <span appSkeletonBlock [class]="cls.skeletonChip"></span>
                      <span appSkeletonBlock [class]="cls.skeletonAmount"></span>
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
  host: { class: 'block text-riv-card-ink' },
})
export class MyBookings {
  protected readonly cls = CLS;

  private readonly store = inject(DeviceLocalBookings);
  private readonly bookings = inject(BookingService);
  private readonly auth = inject(CustomerAuth);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly Row[]>([]);
  /**
   * True until the initial list is decided (restore settled AND first rows set). The DEVICE rows
   * clear it as they render, so it cannot gate the empty card alone — {@link showSkeleton} does.
   */
  private readonly loading = signal(true);
  /**
   * The account list (signed-in) failed to load — surface a Retry rather than silently hiding the
   * account bookings behind the device-local ones.
   */
  protected readonly accountError = signal(false);

  /**
   * The account list is out (never for a guest). Distinct from {@link loading}, which the device
   * rows clear on render — else the announcer would call the gap before the account list loaded.
   * Also drives the `account-retry` button's `[appBusy]` state (RV-FE-9).
   */
  protected readonly accountPending = signal(false);

  /**
   * Nothing to draw yet: the page skeleton, and also the announcer's `loading`, so drawn and
   * announced agree. Not just {@link loading}: a signed-in customer with only server bookings would
   * otherwise see zero rows and no skeleton for the whole account round trip.
   */
  protected readonly showSkeleton = computed(
    () => this.loading() || (this.accountPending() && this.rows().length === 0),
  );

  /**
   * Every page-level read settled with every row `'loaded'`: a `'failed'` row's retry card must
   * never be announced as success. A per-row Retry keeps its row `'failed'` throughout, so a guest
   * hears silence → "loaded" exactly once.
   */
  protected readonly announceReady = computed(
    () =>
      !this.loading() &&
      !this.accountPending() &&
      !this.accountError() &&
      this.rows().every((row) => row.state === 'loaded'),
  );
  /**
   * At least one row failed a per-code lookup — the page-level `role="alert"` panel's gate. Not a
   * per-row alert: `@for … track`'s detach+insert re-sort would re-announce it; this element is
   * never re-sorted, so a failure is announced exactly once.
   */
  protected readonly anyRowFailed = computed(() => this.rows().some((r) => r.state === 'failed'));

  /**
   * Codes a manual {@link retry} has in flight — the `row-retry` button's `[appBusy]` gate (RV-FE-9).
   * Separate from `'loading'` so the row stays on the SAME `'failed'` node and the pressed button
   * never strands focus on `<body>` (WCAG 2.4.3).
   */
  protected readonly retryingCodes = signal<ReadonlySet<string>>(new Set());

  /**
   * Codes the account list has already answered for. Consulted when a queued per-code lookup
   * is DEQUEUED — never as a barrier, so device rows are still issued immediately.
   */
  private readonly accountResolved = new Set<string>();
  /** Each code's first-seen position — the {@link inDisplayOrder} tie-break for same-date rows. */
  private readonly displayRank = new Map<string, number>();

  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** Moves focus to the page heading once the account-error card it was on is torn down. */
  private readonly focusAfterAccountRetry = focusMover();

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
   * Signed in: merge the account list over the device rows (codes marked account-resolved); a
   * failure, 401 included, keeps them and shows Retry. Never clear {@link accountError} up front: it
   * would destroy the focused `account-retry` button mid-request (WCAG 2.4.3).
   */
  private loadAccount(): void {
    const wasErrored = this.accountError();
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
          this.accountError.set(false);
          this.accountPending.set(false);
          if (wasErrored) {
            this.focusAfterAccountRetry('mb-title');
          }
        },
        error: () => {
          this.accountError.set(true);
          this.accountPending.set(false);
        },
      });
  }

  /**
   * Merge server rows in: replace a listed code's row (one still queued), append the rest (one a
   * transient 404 removed), then re-sort ({@link inDisplayOrder}).
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

  /**
   * A manual retry bypasses the queue, and never via {@link fetch}: `'loading'` would destroy the
   * pressed button and strand focus (WCAG 2.4.3). The row stays `'failed'` while
   * {@link retryingCodes} drives `[appBusy]`; only success or a 404 then moves focus.
   */
  protected retry(code: string): void {
    this.retryingCodes.update((codes) => new Set(codes).add(code));
    this.settle(code)
      .pipe(
        finalize(() => {
          this.retryingCodes.update((codes) => {
            const next = new Set(codes);
            next.delete(code);
            return next;
          });
          this.moveFocusAfterRetry(code);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /** The queue's own fetch: renders the row 'loading' immediately, then {@link settle}s it. */
  private fetch(code: string): Observable<unknown> {
    this.setRow({ code, state: 'loading' });
    return this.settle(code);
  }

  /** The per-code lookup's outcome, shared by the queue and the manual {@link retry}. */
  private settle(code: string): Observable<unknown> {
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

  /**
   * A manual retry's settled leg: focus whatever now occupies the row, else the page heading —
   * never nothing (WCAG 2.4.3). `code` is base32 (invariant #7), so safe in the attribute selector.
   */
  private moveFocusAfterRetry(code: string): void {
    afterNextRender(
      {
        // Read before write (angular.dev's afterNextRender guidance), matching focusMover()'s shape.
        earlyRead: () =>
          this.hostEl.nativeElement.querySelector<HTMLElement>(
            `[data-row-code="${code}"] [data-testid="booking-row"], [data-row-code="${code}"] [data-testid="row-retry"]`,
          ) ?? this.hostEl.nativeElement.querySelector<HTMLElement>('[data-testid="mb-title"]'),
        write: (target) => {
          if (!target) {
            return;
          }
          if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
            target.tabIndex = -1;
          }
          target.focus();
        },
      },
      { injector: this.injector },
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
