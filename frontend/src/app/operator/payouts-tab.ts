import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { focusMover } from '../shared/focus-after-render';
import { formatMoney } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { formatCivilDate, todayBookingDate } from '../shared/booking-date';
import {
  LedgerRow,
  PayoutErrorCode,
  PayoutLedgerEntryView,
  PayoutLedgerView,
  RefundReasonCode,
  WeatherRefundResult,
} from './operator-console.model';
import { OperatorConsoleService, payoutErrorOf } from './operator-console.service';
import { PayoutStatement } from './payout-statement';

/**
 * The Payouts tab — the operator console's payout ledger. Renders the
 * venue's accruals + reversals (per-entry date, a `#<bookingId>` reference, gross / commission / net),
 * an "Owed to you" hero, and a period-total row; refund **reversals** show as negative rows with a
 * reason chip. The weather-refund action + the statement modal live alongside (phase 2).
 *
 * <p><strong>Renders and triggers; the backend decides and moves the money.</strong> Every amount is
 * integer minor units (invariant #5) rendered via {@link formatMoney}; the owed figure is the server's
 * {@link PayoutLedgerView#netOwedMinor}, <em>never</em> a client re-computation (invariant #9). The
 * ledger read is owner-asserted server-side (invariant #13) — a 403 maps to owner copy, a 401 drops the
 * session. The ledger carries only `bookingId`: <strong>no booking code</strong> (a bearer credential,
 * invariant #7) and <strong>no guest identity</strong> (the `payout` module holds none — need-to-know,
 * invariant #11); the console renders a non-credential reference. Reads `:venueId` from the parent route
 * via {@link parentVenueId} (child routes don't inherit it), like its sibling tabs;
 * always porcelain (inherited from the console shell); glass via {@link CardGlass}.
 */
@Component({
  selector: 'app-payouts-tab',
  imports: [CardGlass, PayoutStatement, BusyAction],
  templateUrl: './payouts-tab.html',
})
export class PayoutsTab {
  private readonly route = inject(ActivatedRoute);
  private readonly console = inject(OperatorConsoleService);
  protected readonly operator = inject(OperatorAuth);

  /** Every weather-refund transition destroys the control that was just activated (WCAG 2.4.3). */
  private readonly focusAfterRender = focusMover();

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if
   *  invalid) — reactive to in-place venue switches, which reuse this instance. */
  private readonly venueId = parentVenueId(this.route);

  private readonly ledger = signal<PayoutLedgerView | undefined>(undefined);
  /** True once the initial ledger read settles (success or failure) — drives loading vs content. */
  protected readonly loaded = signal(false);
  /** The load-error message (owner / session / generic), or undefined when the read succeeded. */
  protected readonly loadErrorMsg = signal<string | undefined>(undefined);

  /** The washed-out day a weather refund targets (ISO YYYY-MM-DD); defaults to today Europe/Tirane
   *  (invariant #6). The refund is per-DATE (whole-day, invariant #10) — the design's per-row buttons
   *  don't map to the per-date endpoint, and the ledger carries no service-date. */
  protected readonly selectedDate = signal(todayBookingDate(new Date()));
  /** True while the amber "Issue full weather refund" confirm is open (a two-step, no accidental refund). */
  protected readonly weatherConfirm = signal(false);
  /** True while a weather refund is in flight — disables the confirm button (no double-issue). */
  protected readonly refunding = signal(false);
  /** A transient action notice (weather-refund outcome, or a failure). */
  protected readonly notice = signal<string | undefined>(undefined);
  /** True while the display-only payout-statement modal is open. */
  protected readonly statementOpen = signal(false);
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;
  constructor() {
    // Re-runs on an in-place venue switch: reset to the fresh-mount state, then load.
    effect(() => {
      const id = this.venueId();
      untracked(() => (id === undefined ? this.markInvalid() : this.resetForVenue()));
    });
  }

  private markInvalid(): void {
    this.loaded.set(true);
    this.loadErrorMsg.set(loadFailureNotice('UNKNOWN'));
  }

  /** Drop every venue-scoped signal — ledger, notice, refund/statement state — and load fresh, on
   *  today's date (the same state a full navigation would mount with). */
  private resetForVenue(): void {
    this.epoch++;
    this.ledger.set(undefined);
    this.loaded.set(false);
    this.loadErrorMsg.set(undefined);
    this.selectedDate.set(todayBookingDate(new Date()));
    this.weatherConfirm.set(false);
    this.refunding.set(false);
    this.notice.set(undefined);
    // The statement traps focus, so tearing it down mid-switch would strand it on `<body>`.
    if (this.statementOpen()) {
      this.focusAfterRender('payouts-tab');
    }
    this.statementOpen.set(false);
    this.load();
  }

  private readonly entries = computed<readonly PayoutLedgerEntryView[]>(
    () => this.ledger()?.entries ?? [],
  );
  private readonly currency = computed(() => this.ledger()?.currency ?? 'EUR');

  /** The ledger rows, each pre-formatted; a reversal carries a negative net + a reason chip. */
  protected readonly rows = computed<readonly LedgerRow[]>(() => {
    const currency = this.currency();
    return this.entries().map((e) => {
      const reversal = e.type === 'REVERSAL';
      const sign = reversal ? -1 : 1;
      return {
        bookingId: e.bookingId,
        ref: `#${e.bookingId}`,
        dateLabel: ledgerDateLabel(e.createdAt),
        isReversal: reversal,
        reasonLabel: reversal ? reasonLabel(e.reason) : null,
        grossStr: money(e.grossMinor, currency),
        commissionStr: money(e.commissionMinor, currency),
        netStr: money(sign * e.netMinor, currency),
        netClass: reversal ? 'text-[#a3372a]' : 'text-[#0a6e85]',
      };
    });
  });

  protected readonly isEmpty = computed(() => this.entries().length === 0);

  /** The "Owed to you" figure — the SERVER's net owed, rendered as-is (invariant #9). */
  protected readonly owedStr = computed(() =>
    money(this.ledger()?.netOwedMinor ?? 0, this.currency()),
  );

  /** The ledger's ISO currency, for the statement header/footnote (EUR collection currency, invariant #5). */
  protected readonly statementCurrency = computed(() => this.currency());

  private readonly accrualCount = computed(
    () => this.entries().filter((e) => e.type === 'ACCRUAL').length,
  );
  private readonly reversalCount = computed(
    () => this.entries().filter((e) => e.type === 'REVERSAL').length,
  );

  /** "N bookings, M refunds · paid by bank transfer" — the hero's sub-line. */
  protected readonly countsLabel = computed(
    () =>
      `${plural(this.accrualCount(), 'booking')}, ${plural(this.reversalCount(), 'refund')}` +
      ` · paid by bank transfer`,
  );

  /** Display-only period sums (signed: an accrual adds, a reversal subtracts) — presentation, not the
   *  authoritative owed (that stays {@link owedStr} = the server figure). */
  protected readonly grossTotalStr = computed(() =>
    money(
      signedSum(this.entries(), (e) => e.grossMinor),
      this.currency(),
    ),
  );
  protected readonly commissionTotalStr = computed(() =>
    money(
      signedSum(this.entries(), (e) => e.commissionMinor),
      this.currency(),
    ),
  );

  /** The selected weather-refund date as a human label (e.g. `Sat 5 Jul 2026`) — for the confirm copy. */
  protected readonly selectedDateLabel = computed(() => formatCivilDate(this.selectedDate()));

  /** Change the washed-out date; reset any open confirm + notice so they never apply to the wrong day. */
  protected onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) {
      return;
    }
    this.selectedDate.set(value);
    this.weatherConfirm.set(false);
    this.notice.set(undefined);
  }

  /** Open the amber weather-refund confirm (two-step — the actual refund is server-decided + executed). */
  protected onWeatherRefund(): void {
    this.notice.set(undefined);
    this.weatherConfirm.set(true);
    this.focusAfterRender('weather-confirm-btn');
  }

  protected onCancelWeather(): void {
    this.weatherConfirm.set(false);
    this.focusAfterRender('weather-trigger');
  }

  /**
   * Issue the per-date weather refund. The server cancels + fully refunds every CONFIRMED booking for
   * the day (invariant #10), executes the refund via the Stripe webhook path (invariant #8) and posts
   * the payout reversal (invariant #9) — this only triggers it and re-renders. The reversal is posted by
   * an AFTER_COMMIT listener, so after the outcome lands the ledger is re-read to pull it in
   * (eventually consistent).
   */
  protected onConfirmWeather(): void {
    const venueId = this.venueId();
    if (venueId === undefined || this.refunding()) {
      return;
    }
    const epoch = this.epoch;
    this.refunding.set(true);
    this.notice.set(undefined);
    const date = this.selectedDate();
    const dateLabel = formatCivilDate(date);
    this.console.weatherRefund(venueId, date).subscribe({
      next: (result) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this refund's UI state (#180); the switch reset the flags
        }
        this.refunding.set(false);
        this.weatherConfirm.set(false);
        this.notice.set(weatherSuccessNotice(result, dateLabel));
        this.focusAfterRender('payouts-notice');
        this.reloadLedger();
      },
      error: (e: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this refund's UI state (#180)
        }
        this.refunding.set(false);
        this.weatherConfirm.set(false);
        const reason = payoutErrorOf(e);
        if (reason === 'UNAUTHORIZED') {
          this.operator.sessionLost();
        }
        this.notice.set(weatherFailureNotice(reason));
        this.focusAfterRender('payouts-notice');
      },
    });
  }

  protected openStatement(): void {
    this.statementOpen.set(true);
  }

  protected closeStatement(): void {
    this.statementOpen.set(false);
    this.focusAfterRender('statement-open');
  }

  /** Re-read the ledger after a weather refund so the reversal(s) appear; a re-read failure keeps the
   *  current view (the action notice already reported the outcome). */
  private reloadLedger(): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    const epoch = this.epoch;
    this.console.payoutLedger(venueId).subscribe({
      next: (l) => {
        if (this.epoch === epoch) {
          this.ledger.set(l); // a superseded venue's ledger never overwrites the new one (#180)
        }
      },
      error: () => {
        /* keep the current view; the outcome was already reported */
      },
    });
  }

  private load(): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    const epoch = this.epoch;
    this.console.payoutLedger(venueId).subscribe({
      next: (l) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this load (#180)
        }
        this.ledger.set(l);
        this.loadErrorMsg.set(undefined);
        this.loaded.set(true);
      },
      error: (e: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this load (#180)
        }
        const reason = payoutErrorOf(e);
        if (reason === 'UNAUTHORIZED') {
          // The server already rejected the session — clear local state without a logout round-trip.
          this.operator.sessionLost();
        }
        this.loadErrorMsg.set(loadFailureNotice(reason));
        this.loaded.set(true);
      },
    });
  }
}

/** Format an integer-minor-unit amount in `currency` (display only — never float math, invariant #5). */
function money(minorUnits: number, currency: string): string {
  return formatMoney({ minorUnits, currency });
}

/** Sum a picked minor-unit field across entries, signed by type: accrual adds, reversal subtracts. */
function signedSum(
  entries: readonly PayoutLedgerEntryView[],
  pick: (e: PayoutLedgerEntryView) => number,
): number {
  return entries.reduce((total, e) => total + (e.type === 'REVERSAL' ? -pick(e) : pick(e)), 0);
}

/** A count + singular/plural noun, e.g. `1 booking` / `2 bookings`. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** A reversal's reason as a short human label (mirrors the backend `RefundReason` token set). */
function reasonLabel(reason: RefundReasonCode | null): string {
  switch (reason) {
    case 'WEATHER':
      return 'Weather';
    case 'POLICY':
      return 'Policy';
    case 'CONFLICT':
      return 'Conflict';
    default:
      return 'Refund';
  }
}

/** The operator-facing notice for a successful weather refund — count + total, or a no-op for 0. */
function weatherSuccessNotice(result: WeatherRefundResult, dateLabel: string): string {
  if (result.refundedCount === 0) {
    return `No confirmed bookings for ${dateLabel} — nothing to refund.`;
  }
  const total = money(result.totalRefundedMinor, result.currency);
  return (
    `Weather refund issued for ${dateLabel} — ${plural(result.refundedCount, 'booking')},` +
    ` ${total} returned to guests.`
  );
}

/** Map a weather-refund failure to its operator-facing notice (no nested ternaries). */
function weatherFailureNotice(reason: PayoutErrorCode): string {
  switch (reason) {
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t issue its refunds.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED_MESSAGE;
    default:
      return 'Could not issue the weather refund. Please try again.';
  }
}

/** Map a ledger-read failure to its operator-facing notice (no nested ternaries). */
function loadFailureNotice(reason: PayoutErrorCode): string {
  switch (reason) {
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t see its payouts.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED_MESSAGE;
    default:
      return 'Sorry — we couldn’t load this venue’s payouts. Please try again.';
  }
}

/** Render a UTC instant (a ledger entry's `createdAt`) as a Europe/Tirane date, e.g. `1 Jul 2026`
 *  (invariant #6). Pure given the ISO string; single consumer, kept local (rule of three not met). */
function ledgerDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Tirane',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
