import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HttpErrorResponse } from '@angular/common/http';

import { problemCodeOf } from '../shared/api-error';
import { formatBookingDate } from '../shared/booking-date-label';
import { amountLabelFor, metaFor } from '../shared/booking-status';
import { CardGlass } from '../shared/card-glass';
import { formatDeadline } from '../shared/deadline';
import { focusMover } from '../shared/focus-after-render';
import { formatMoney, MoneyView } from '../shared/money';
import { StatusChip } from '../shared/status-chip';
import { BookingQr } from './booking-qr';
import { BookingDetail, Cancellation } from './booking.model';
import { BookingService } from './booking.service';

/** The card-glass EXTRAS `appCardGlass` deliberately doesn't carry (radius stays with the consumer). */
const CARD_SURFACE =
  'rounded-[28px] backdrop-blur-[26px] backdrop-saturate-[170%] shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)]';

const BANNER =
  'mx-0 mt-[18px] mb-1 rounded-[20px] border px-[18px] py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]';
const BTN =
  'cursor-pointer rounded-[14px] px-[18px] py-[11px] text-[14px] motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink) disabled:cursor-not-allowed disabled:opacity-65';
const BTN_OUTLINE = `${BTN} border-[1.5px] bg-[#f4f6f7] font-semibold [transition:background_0.15s_ease] hover:bg-[#e7ebec]`;
const LINK =
  'text-[14.5px] font-semibold text-(--riv-accent-ink) underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink)';

/** The neutral terminal-outcome treatment, shared by the expired and cancelled banners. */
const BANNER_NEUTRAL = `${BANNER} border-[#dde1e3] bg-[#f0f2f3]`;
const EYEBROW_NEUTRAL = 'text-[#4f5f67]';

/** The repeated Tailwind recipes of this view — see {@link BookingView} for why they live here. */
const CLS = {
  card: `${CARD_SURFACE} mx-auto my-8 max-w-[560px] px-[26px] pt-[26px] pb-6`,
  stateCard: `${CARD_SURFACE} mx-auto my-8 max-w-[460px] px-[30px] py-10 text-center`,
  title: 'm-0 text-[28px] font-bold tracking-[-0.02em] text-(--riv-card-ink)',
  stateTitle: 'mx-0 mt-0 mb-2 text-[22px] font-bold tracking-[-0.02em] text-(--riv-card-ink)',
  lead: 'mx-0 mt-0 mb-[18px] text-[14.5px] leading-[1.5] text-(--riv-card-ink-soft)',
  link: LINK,
  linkBack: `${LINK} mt-[18px] inline-block`,
  bannerAwaiting: `${BANNER} border-[#bfe6ee] bg-[#ddf4f8]`,
  bannerPending: `${BANNER} border-[#f3e3bf] bg-[#fdf5e6]`,
  bannerDeclined: `${BANNER} border-[#eed6ce] bg-[#faefec]`,
  bannerExpired: BANNER_NEUTRAL,
  bannerWithdrawn: `${BANNER} border-[#ddd8e8] bg-[#f0eef6]`,
  // Cancelled and expired share the neutral terminal treatment — one recipe, so they cannot drift.
  bannerCancelled: BANNER_NEUTRAL,
  eyebrow: 'm-0 text-[11px] font-bold tracking-[0.1em] uppercase',
  // The banner inks are FIXED per banner fill — themed tokens would drift between themes.
  eyebrowAwaiting: 'text-[#0a5e7a]',
  eyebrowPending: 'text-[#8a5410]',
  eyebrowDeclined: 'text-[#8a3a2a]',
  eyebrowExpired: EYEBROW_NEUTRAL,
  eyebrowWithdrawn: 'text-[#5c5470]',
  eyebrowCancelled: EYEBROW_NEUTRAL,
  bannerBody: 'mx-0 mt-1.5 mb-0 text-[14px] leading-[1.5] text-[#334a52] [&_strong]:text-[#0a2a33]',
  row: 'flex items-center justify-between gap-3 border-b border-(--riv-card-track) py-2.5 text-[14.5px] last:border-b-0',
  rowLabel: 'text-(--riv-card-ink-soft)',
  rowValue: 'm-0 text-right font-bold text-(--riv-card-ink)',
  rowAmount: 'm-0 text-right font-bold text-(--riv-accent-ink)',
  // `empty:hidden` is the twin of the retired `.result:empty` — both regions render an empty <p>.
  // The outline shows a keyboard guest where a settled cancel/withdrawal parked their focus.
  result:
    'mx-0 mt-4 mb-0 text-[13.5px] leading-[1.5] font-semibold text-(--riv-accent-ink) empty:hidden focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink)',
  confirmQ: 'mx-0 mt-0 mb-3 text-[14px] font-semibold text-(--riv-card-ink)',
  confirmQOnBanner: 'mx-0 mt-0 mb-3 text-[14px] font-semibold text-[#334a52]',
  actions: 'flex flex-wrap gap-2.5',
  btnDanger: `${BTN} border border-[rgba(200,90,60,0.4)] bg-[linear-gradient(180deg,#c14a2c,#a83c25)] font-bold text-white shadow-[0_8px_20px_rgba(179,67,42,0.4)] [transition:filter_0.15s_ease] hover:brightness-[1.08]`,
  btnOutline: `${BTN_OUTLINE} border-[rgba(255,255,255,0.7)] text-[#0a4f5e]`,
  btnOutlineDanger: `${BTN_OUTLINE} border-[rgba(200,90,60,0.5)] text-[#a3372a]`,
  btnCta:
    'mt-3.5 block w-full cursor-pointer rounded-[16px] border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) p-[15px] text-center text-[15.5px] font-bold text-white shadow-[0_12px_28px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] [transition:filter_0.15s_ease] hover:brightness-[1.06] motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-65',
} as const;

/**
 * View a booking by its code and cancel it. Loads the
 * booking and its <strong>server-computed</strong> refund terms (invariant #10) via
 * {@link BookingService}, renders the glass detail card — a unified status chip for the whole status
 * union, the dashed booking-code card, the detail rows, and status banners — and, when the booking
 * is cancellable, offers a two-step cancel (a confirm prompt stating the refund) so the action is
 * deliberate and accessible. The refund amount is never computed or sent by the client; money is
 * rendered from integer minor units via {@link formatMoney} (invariant #5); status is conveyed in
 * text, not colour alone (WCAG AA).
 *
 * <p>Request-to-Book status panels: `PENDING_REQUEST` shows the venue's response
 * deadline and offers a two-step **Withdraw request** — the same confirm-then-act idiom as
 * cancel, but with no refund to state, because a pending request was never charged; the server's
 * `withdrawable` flag gates it, never a status check here;
 * `AWAITING_PAYMENT` with open-intent credentials offers "Pay now" (primes
 * {@link BookingService#beginPayment} and routes to `/booking/pay` — the same flow as the 202
 * create path, so confirmation still only ever comes from the verified webhook, invariant #8);
 * `DECLINED`/`EXPIRED`/`WITHDRAWN` explain the terminal, no-charge outcome, and `CANCELLED` explains
 * the one terminal outcome that may have moved money — which of the cancellations happened, and
 * whether anything was refunded.
 *
 * <p>Styling is Tailwind-only (the component's SCSS is retired). The recipes live in the
 * module-local {@link CLS} map rather than inline so the shared *bases* stay single-sourced — the
 * banner shell across six banners, the row across five rows, the button chrome across six buttons —
 * which the retired SCSS shared through selectors. Many individual `CLS` entries are then used once;
 * they sit there to name the variant beside its siblings, not because each one repeats.
 * Conflicting utilities are never concatenated onto one element: two competing `border-*` or
 * `text-*` utilities resolve by **stylesheet order, not class order**, so each variant spells out
 * its own colour rather than overriding a base — which is why `bannerPending` and
 * `btnOutlineDanger` are whole recipes and not a base plus an override.
 */
@Component({
  selector: 'app-booking-view',
  imports: [RouterLink, CardGlass, StatusChip, BookingQr],
  template: `
    @if (notFound()) {
      <section [class]="cls.stateCard" appCardGlass aria-labelledby="bv-title">
        <h1 id="bv-title" [class]="cls.stateTitle">Booking not found</h1>
        <p [class]="cls.lead">We couldn’t find a booking for that code. Check the code and try again.</p>
        <a routerLink="/" [class]="cls.link">Back to home</a>
      </section>
    } @else if (failed()) {
      <section [class]="cls.stateCard" appCardGlass aria-labelledby="bv-title">
        <h1 id="bv-title" [class]="cls.stateTitle">Couldn’t load your booking</h1>
        <p [class]="cls.lead">Something went wrong. Please try again in a moment.</p>
        <a routerLink="/" [class]="cls.link">Back to home</a>
      </section>
    } @else if (booking(); as b) {
      <section [class]="cls.card" appCardGlass aria-labelledby="bv-title">
        <div class="flex items-center justify-between gap-3">
          <h1 id="bv-title" [class]="cls.title">Your booking</h1>
          <span>
            <!-- Restores the "Status: X" context the removed dl row gave assistive tech. -->
            <span class="sr-only">Booking status:</span>
            <span [appStatusChip]="chipClass(b.status)" data-testid="booking-status">{{
              statusLabel(b.status)
            }}</span>
          </span>
        </div>

        @switch (b.status) {
          @case ('AWAITING_PAYMENT') {
            @if (b.payment) {
              <section
                [class]="cls.bannerAwaiting"
                data-testid="request-accepted"
                aria-labelledby="request-state-title"
              >
                @if (b.requestExpiresAt) {
                  <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowAwaiting }}">
                    Request accepted&ngsp;<span aria-hidden="true">🎉</span>
                  </h2>
                  <p [class]="cls.bannerBody">
                    {{ b.venueName }} accepted your booking request. Pay now to confirm your spot.
                  </p>
                } @else {
                  <!-- An instant booking with an open payment (e.g. an interrupted checkout) was
                       never a request — don't claim the venue "accepted" anything. -->
                  <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowAwaiting }}">
                    Complete your payment
                  </h2>
                  <p [class]="cls.bannerBody">
                    This booking is reserved but unpaid. Pay now to confirm your spot.
                  </p>
                }
                <button type="button" [class]="cls.btnCta" (click)="payNow(b)" data-testid="pay-now">
                  Pay now
                </button>
              </section>
            } @else if (b.payWindowClosed) {
              <section
                [class]="cls.bannerExpired"
                data-testid="pay-window-closed"
                aria-labelledby="request-state-title"
              >
                <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowExpired }}">
                  Payment window closed
                </h2>
                <p [class]="cls.bannerBody">
                  {{ dateLabel(b.bookingDate) }} has already started, so this booking
                  <strong>can no longer be paid</strong> and stays unconfirmed. If you completed a
                  payment in the last few minutes, reload this page — it may still be confirming.
                </p>
              </section>
            }
          }
          @case ('PENDING_REQUEST') {
            <section
              [class]="cls.bannerPending"
              data-testid="request-pending"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowPending }}">
                Waiting for the venue
              </h2>
              <p [class]="cls.bannerBody">
                {{ b.venueName }} hasn’t responded to your booking request yet. You won’t be
                charged unless they accept.
              </p>
              @if (b.requestExpiresAt; as deadline) {
                <p [class]="cls.bannerBody">
                  They have until <strong>{{ deadlineLabel(deadline) }}</strong> to respond.
                </p>
              }
              @if (b.withdrawable && !withdrawn()) {
                <div class="mt-3.5">
                  @if (confirmingWithdraw()) {
                    <p [class]="cls.confirmQOnBanner">
                      Withdraw this request? This can’t be undone.
                    </p>
                    <div [class]="cls.actions">
                      <button
                        type="button"
                        [class]="cls.btnDanger"
                        [disabled]="withdrawing()"
                        (click)="confirmWithdraw()"
                        data-testid="confirm-withdraw"
                      >
                        {{ withdrawing() ? 'Withdrawing…' : 'Confirm withdrawal' }}
                      </button>
                      <button
                        type="button"
                        [class]="cls.btnOutline"
                        [disabled]="withdrawing()"
                        (click)="keepRequest()"
                        data-testid="keep-request"
                      >
                        Keep request
                      </button>
                    </div>
                  } @else {
                    <button
                      type="button"
                      [class]="cls.btnOutlineDanger"
                      (click)="startWithdraw()"
                      data-testid="withdraw-request"
                    >
                      Withdraw request
                    </button>
                  }
                </div>
              }

            </section>
          }
          @case ('WITHDRAWN') {
            <section
              [class]="cls.bannerWithdrawn"
              data-testid="request-withdrawn"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowWithdrawn }}">
                Request withdrawn
              </h2>
              <p [class]="cls.bannerBody">
                You withdrew this request, so the spot is free for other guests again. You
                haven’t been charged — pick another set or date to book again.
              </p>
            </section>
          }
          @case ('CANCELLED') {
            <section
              [class]="cls.bannerCancelled"
              data-testid="booking-cancelled"
              aria-labelledby="request-state-title"
            >
              @if (b.refundedAmount; as refunded) {
                <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowCancelled }}">
                  {{ b.cancelReason === 'WEATHER' ? 'Cancelled by the venue' : 'Booking cancelled' }}
                </h2>
                <p [class]="cls.bannerBody">
                  {{ cancelledOpener(b) }}&ngsp;
                  @if (b.refundOutstanding) {
                    <strong>{{ processingSentence(refunded) }}</strong>
                  } @else {
                    <strong>{{ refundSentence(tierOf(refunded), refunded) }}</strong>
                  }
                </p>
              } @else {
                <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowCancelled }}">
                  Booking cancelled
                </h2>
                <p [class]="cls.bannerBody">
                  This booking was cancelled because the payment wasn’t completed in time, so the
                  spot was released. <strong>You haven’t been charged.</strong> Pick another set or
                  date to book again.
                </p>
              }
            </section>
          }
          @case ('DECLINED') {
            <section
              [class]="cls.bannerDeclined"
              data-testid="request-declined"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowDeclined }}">
                Request declined
              </h2>
              <p [class]="cls.bannerBody">
                {{ b.venueName }} couldn’t take this booking, so it was declined. You haven’t been
                charged — pick another set or date to book again.
              </p>
            </section>
          }
          @case ('EXPIRED') {
            <section
              [class]="cls.bannerExpired"
              data-testid="request-expired"
              aria-labelledby="request-state-title"
            >
              <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowExpired }}">
                Request expired
              </h2>
              <p [class]="cls.bannerBody">
                {{ b.venueName }} didn’t respond in time, so this request expired. You haven’t been
                charged — pick another set or date to book again.
              </p>
            </section>
          }
        }

        <div
          class="mx-0 mt-[18px] mb-4 rounded-[18px] border border-dashed border-(--riv-field-border) bg-[rgba(255,255,255,0.4)] p-[15px]"
          data-testid="booking-code"
        >
          <span class="block text-[11px] tracking-[0.16em] text-(--riv-card-ink-soft) uppercase">
            Booking code
          </span>
          <div class="mt-[5px] text-[27px] font-bold tracking-[0.12em] text-(--riv-accent-ink)">
            {{ b.code }}
          </div>
          @if (b.status === 'CONFIRMED') {
            <div class="mt-3 flex justify-center">
              <app-booking-qr [code]="b.code" />
            </div>
          }
          <p class="mx-0 mt-2 mb-0 text-[12px] leading-[1.4] text-(--riv-card-ink-soft)">
            Show this code to staff when you arrive to claim your set.
          </p>
        </div>

        <dl class="m-0">
          <div [class]="cls.row">
            <dt [class]="cls.rowLabel">Venue</dt>
            <dd [class]="cls.rowValue">{{ b.venueName }}</dd>
          </div>
          <div [class]="cls.row">
            <dt [class]="cls.rowLabel">Set</dt>
            <dd [class]="cls.rowValue">{{ b.rowLabel }} · spot {{ b.positionNo }}</dd>
          </div>
          <div [class]="cls.row">
            <dt [class]="cls.rowLabel">Date</dt>
            <dd [class]="cls.rowValue">{{ dateLabel(b.bookingDate) }}</dd>
          </div>
          <div [class]="cls.row">
            <dt [class]="cls.rowLabel">{{ amountLabel(b) }}</dt>
            <dd [class]="cls.rowAmount">{{ formatMoney(b.amount) }}</dd>
          </div>
          @if (b.refundedAmount && b.refundedAmount.minorUnits > 0) {
            <div [class]="cls.row">
              <dt [class]="cls.rowLabel">{{ b.refundOutstanding ? 'Refund' : 'Refunded' }}</dt>
              <dd [class]="cls.rowValue" data-testid="refunded-amount">
                {{ formatMoney(b.refundedAmount) }}
              </dd>
            </div>
          }
        </dl>

        <!-- Outside the status switch on purpose: scoped to PENDING_REQUEST it would unmount on success. -->
        <p
          [class]="cls.result"
          role="status"
          aria-live="polite"
          tabindex="-1"
          data-testid="withdraw-result"
        >
          @if (withdrawn()) {
            Request withdrawn. The spot is free for other guests again.
          } @else if (withdrawNotPending()) {
            This request is no longer waiting for the venue, so it can’t be withdrawn.
          } @else if (withdrawFailed()) {
            We couldn’t withdraw the request. Please try again.
          }
        </p>

        <!-- Live result of a cancellation, announced to assistive tech. -->
        <p
          [class]="cls.result"
          role="status"
          aria-live="polite"
          tabindex="-1"
          data-testid="cancel-result"
        >
          @if (cancellation(); as c) {
            Booking cancelled.
            {{
              b.refundOutstanding ? processingSentence(c.refund) : refundSentence(c.tier, c.refund)
            }}
          } @else if (cancelWindowClosed()) {
            This booking can no longer be cancelled — its date has already begun.
          } @else if (cancelFailed()) {
            We couldn’t cancel the booking. Please try again.
          }
        </p>

        @if (b.cancellable && !cancellation()) {
          <section
            class="mt-5 border-t border-(--riv-card-track) pt-[18px]"
            aria-labelledby="cancel-title"
          >
            <h2 id="cancel-title" class="mx-0 mt-0 mb-1.5 text-[16px] font-bold text-(--riv-card-ink)">
              Cancel this booking
            </h2>
            <p
              class="mx-0 mt-0 mb-3.5 text-[13.5px] leading-[1.5] text-(--riv-card-ink-soft)"
              data-testid="refund-terms"
            >
              {{ refundTerms(b) }}
            </p>

            @if (confirming()) {
              <p [class]="cls.confirmQ">Cancel this booking? This can’t be undone.</p>
              <div [class]="cls.actions">
                <button
                  type="button"
                  [class]="cls.btnDanger"
                  [disabled]="cancelling()"
                  (click)="confirmCancel()"
                  data-testid="confirm-cancel"
                >
                  {{ cancelling() ? 'Cancelling…' : 'Confirm cancellation' }}
                </button>
                <button
                  type="button"
                  [class]="cls.btnOutline"
                  [disabled]="cancelling()"
                  (click)="keepBooking()"
                  data-testid="keep-booking"
                >
                  Keep booking
                </button>
              </div>
            } @else {
              <button
                type="button"
                [class]="cls.btnOutlineDanger"
                (click)="startCancel()"
                data-testid="start-cancel"
              >
                Cancel booking
              </button>
            }
          </section>
        }

        <a routerLink="/" [class]="cls.linkBack">Back to home</a>
      </section>
    } @else {
      <section [class]="cls.stateCard" appCardGlass aria-labelledby="bv-title" aria-busy="true">
        <h1 id="bv-title" [class]="cls.stateTitle">Loading your booking…</h1>
      </section>
    }
  `,
  host: { class: 'block text-(--riv-card-ink)' },
})
export class BookingView {
  /** The repeated Tailwind recipes (see {@link CLS}), exposed to the template. */
  protected readonly cls = CLS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookings = inject(BookingService);

  protected readonly booking = signal<BookingDetail | undefined>(undefined);
  protected readonly failed = signal(false);
  protected readonly notFound = signal(false);
  protected readonly confirming = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelFailed = signal(false);
  /** The server refused because the service day has begun — a retry can never succeed. */
  protected readonly cancelWindowClosed = signal(false);
  protected readonly cancellation = signal<Cancellation | undefined>(undefined);
  protected readonly confirmingWithdraw = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawFailed = signal(false);
  /** The server says the venue already answered — a retry can never succeed (the withdraw twin of {@link cancelWindowClosed}). */
  protected readonly withdrawNotPending = signal(false);
  protected readonly withdrawn = signal(false);

  private readonly focusAfterRender = focusMover();

  private code = '';

  /** Money formatter (shared, minor units — invariant #5), exposed to the template. */
  protected readonly formatMoney = formatMoney;

  constructor() {
    // React to route `code`, not the snapshot — the find modal makes booking→booking nav real; the sync emit loads initially.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.code = params.get('code') ?? '';
      // Reset the per-booking view state before (re)loading the new code.
      this.booking.set(undefined);
      this.notFound.set(false);
      this.failed.set(false);
      this.confirming.set(false);
      this.cancelling.set(false);
      this.cancelFailed.set(false);
      this.cancelWindowClosed.set(false);
      this.cancellation.set(undefined);
      this.confirmingWithdraw.set(false);
      this.withdrawing.set(false);
      this.withdrawFailed.set(false);
      this.withdrawNotPending.set(false);
      this.withdrawn.set(false);
      if (this.code) {
        this.load();
      } else {
        this.notFound.set(true);
      }
    });
  }

  /**
   * @param isRefresh a reload triggered by a completed cancellation (not the initial load). A
   *   refresh that fails must NOT flip the page to the not-found/failed card — that would discard
   *   the just-issued cancellation confirmation (the refund the server already actioned). The
   *   stale-but-cancelled detail plus the live result region stay on screen instead.
   */
  private load(isRefresh = false): void {
    // Initial load consumes a matching find-a-booking prefetch instead of a second GET.
    if (!isRefresh) {
      const prefetched = this.bookings.takePrefetched(this.code);
      if (prefetched) {
        this.booking.set(prefetched);
        return;
      }
    }
    this.bookings.getByCode(this.code).subscribe({
      next: (b) => this.booking.set(b),
      error: (e: unknown) => {
        if (isRefresh) {
          return;
        }
        if (typeof e === 'object' && e !== null && (e as { status?: number }).status === 404) {
          this.notFound.set(true);
        } else {
          this.failed.set(true);
        }
      },
    });
  }

  /**
   * Open the cancel confirmation. Every focus move on both confirm surfaces, and why it lands
   * where it does (WCAG 2.4.3): `docs/plans/booking-view-confirm-focus.md`.
   */
  protected startCancel(): void {
    this.confirming.set(true);
    this.focusAfterRender('confirm-cancel');
  }

  protected keepBooking(): void {
    this.confirming.set(false);
    this.focusAfterRender('start-cancel');
  }

  protected confirmCancel(): void {
    this.cancelling.set(true);
    this.cancelFailed.set(false);
    this.bookings.cancel(this.code).subscribe({
      next: (c) => {
        this.cancellation.set(c);
        this.confirming.set(false);
        this.cancelling.set(false);
        // The refresh below is async, so focus aims at the result this write populates synchronously.
        this.focusAfterRender('cancel-result');
        this.load(true); // refresh to the CANCELLED detail (chip flips + refunded row appears, no reload)
      },
      error: (e: unknown) => {
        const closed =
          e instanceof HttpErrorResponse && problemCodeOf(e) === 'CANCELLATION_WINDOW_CLOSED';
        this.cancelWindowClosed.set(closed);
        this.cancelFailed.set(!closed);
        this.cancelling.set(false);
        this.confirming.set(false);
        // Not the trigger: the re-read below can withdraw it, and a refused cancel explains itself here.
        this.focusAfterRender('cancel-result');
        // Re-read: the window may have closed since load, and only the server knows.
        this.load(true);
      },
    });
  }

  protected startWithdraw(): void {
    this.confirmingWithdraw.set(true);
    this.clearWithdrawResult();
    this.focusAfterRender('confirm-withdraw');
  }

  protected keepRequest(): void {
    this.confirmingWithdraw.set(false);
    this.clearWithdrawResult();
    this.focusAfterRender('withdraw-request');
  }

  /** A failure belongs to the attempt that produced it — arming or abandoning a new one retires it. */
  private clearWithdrawResult(): void {
    this.withdrawFailed.set(false);
    this.withdrawNotPending.set(false);
  }

  /**
   * Retract a still-pending request. No refund to report — the venue never accepted, so
   * nothing was charged; the reload flips the chip to `Withdrawn` without a page reload.
   */
  protected confirmWithdraw(): void {
    this.withdrawing.set(true);
    this.clearWithdrawResult();
    this.bookings.withdraw(this.code).subscribe({
      next: () => {
        this.withdrawn.set(true);
        this.confirmingWithdraw.set(false);
        this.withdrawing.set(false);
        this.focusAfterRender('withdraw-result');
        this.load(true);
      },
      error: (e: unknown) => {
        const answered =
          e instanceof HttpErrorResponse && problemCodeOf(e) === 'REQUEST_NOT_PENDING';
        this.withdrawNotPending.set(answered);
        this.withdrawFailed.set(!answered);
        this.withdrawing.set(false);
        this.confirmingWithdraw.set(false);
        this.focusAfterRender('withdraw-result');
        // Re-read for the same reason the cancel leg does: a refusal usually means it moved on.
        this.load(true);
      },
    });
  }

  /** The design label for a status (drives the header chip; matches design v3 `STATUS_META`). */
  protected statusLabel(status: string): string {
    return metaFor(status).label;
  }

  /** The chip CSS-modifier class for a status. */
  protected chipClass(status: string): string {
    return metaFor(status).chip;
  }

  /** "Paid" once money has actually moved; "Amount" while open, or when nothing was ever charged. */
  protected amountLabel(b: BookingDetail): string {
    return amountLabelFor(b.status, b.refundedAmount);
  }

  /**
   * Who cancelled, for the arriving guest's panel. Only `POLICY` is the guest's own act; a weather
   * cancellation is the venue's, and an unknown or absent reason (a row predating the column, the
   * reserved `CONFLICT`) attributes it to nobody rather than guessing.
   */
  protected cancelledOpener(b: BookingDetail): string {
    switch (b.cancelReason) {
      case 'POLICY':
        return 'You cancelled this booking.';
      case 'WEATHER':
        return `${b.venueName} cancelled this booking because of the weather.`;
      default:
        return 'This booking was cancelled.';
    }
  }

  /** The tier a stamped refund implies — the amount is the decision, so it is the only input. */
  protected tierOf(refunded: MoneyView): Cancellation['tier'] {
    return refunded.minorUnits > 0 ? 'PARTIAL' : 'NONE';
  }

  /** The booking date as a friendly civil-date label (UTC-parsed, invariant #6). */
  protected dateLabel(iso: string): string {
    return formatBookingDate(iso, { withYear: true });
  }

  /** A response deadline rendered in Europe/Tirane wall-clock time (invariant #6). */
  protected deadlineLabel(iso: string): string {
    return formatDeadline(iso);
  }

  /**
   * Resume payment on an accepted request: rebuild the payment hand-off from the
   * fetched detail's open-intent credentials and route to `/booking/pay`. The pay page then polls
   * for the webhook-driven CONFIRMED exactly as after a 202 create (invariant #8).
   */
  protected async payNow(b: BookingDetail): Promise<void> {
    const payment = b.payment;
    if (!payment) {
      return;
    }
    this.bookings.beginPayment({
      code: b.code,
      venueName: b.venueName,
      rowLabel: b.rowLabel,
      positionNo: b.positionNo,
      bookingDate: b.bookingDate,
      amount: b.amount,
      clientSecret: payment.clientSecret,
      paymentIntentId: payment.paymentIntentId,
    });
    await this.router.navigate(['/booking/pay']);
  }

  /** Refund-terms copy for a still-cancellable booking (server-computed values, invariant #10). */
  protected refundTerms(b: BookingDetail): string {
    if (b.beforeCutoff) {
      return `Free cancellation until the evening before — you’ll be refunded ${formatMoney(b.refundIfCancelledNow)} in full.`;
    }
    if (b.refundIfCancelledNow.minorUnits > 0) {
      return `The free-cancellation cutoff has passed — you’ll be refunded ${formatMoney(b.refundIfCancelledNow)}.`;
    }
    return 'The free-cancellation cutoff has passed — this cancellation is non-refundable.';
  }

  /**
   * Sentence for a refund the gateway has not accepted yet: states processing, never transit —
   * "on its way to your card" would be a claim the money's state does not support.
   */
  protected processingSentence(refund: MoneyView): string {
    return `Your refund of ${formatMoney(refund)} is being processed.`;
  }

  /** Sentence describing the refund that was issued. */
  protected refundSentence(tier: Cancellation['tier'], refund: MoneyView): string {
    if (tier === 'NONE' || refund.minorUnits === 0) {
      return 'No refund applies under the cancellation policy.';
    }
    return `${formatMoney(refund)} will be refunded to your card.`;
  }
}
