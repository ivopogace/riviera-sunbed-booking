import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatMoney } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import {
  PayoutErrorCode,
  PayoutLedgerEntryView,
  PayoutLedgerView,
  RefundReasonCode,
} from './operator-console.model';
import { OperatorConsoleService, payoutErrorOf } from './operator-console.service';

/** One rendered ledger row — the entry's presentational strings (all money already formatted, #5). */
interface LedgerRow {
  readonly bookingId: number;
  readonly ref: string;
  readonly dateLabel: string;
  readonly isReversal: boolean;
  readonly reasonLabel: string | null;
  readonly grossStr: string;
  readonly commissionStr: string;
  readonly netStr: string;
  /** The net cell's colour class — teal for an accrual, refund-red for a reversal. */
  readonly netClass: string;
}

/**
 * The O7 Payouts tab (issue #173, epic #141) — the operator console's payout ledger. Renders the
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
 * via {@link parentVenueId} (child routes don't inherit it — the O1 finding), like its sibling tabs;
 * always porcelain (inherited from the console shell); glass via {@link CardGlass}.
 */
@Component({
  selector: 'app-payouts-tab',
  imports: [CardGlass],
  templateUrl: './payouts-tab.html',
})
export class PayoutsTab {
  private readonly route = inject(ActivatedRoute);
  private readonly console = inject(OperatorConsoleService);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if invalid). */
  private readonly venueId: number | undefined;

  private readonly ledger = signal<PayoutLedgerView | undefined>(undefined);
  /** True once the initial ledger read settles (success or failure) — drives loading vs content. */
  protected readonly loaded = signal(false);
  /** The load-error message (owner / session / generic), or undefined when the read succeeded. */
  protected readonly loadErrorMsg = signal<string | undefined>(undefined);

  constructor() {
    const id = parentVenueId(this.route);
    if (id !== undefined) {
      this.venueId = id;
      this.load();
    } else {
      this.loaded.set(true);
      this.loadErrorMsg.set(loadFailureNotice('UNKNOWN'));
    }
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

  /** The "Owed to you" figure — the SERVER's net owed, rendered as-is (invariant #9, R-1). */
  protected readonly owedStr = computed(() => money(this.ledger()?.netOwedMinor ?? 0, this.currency()));

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
    money(signedSum(this.entries(), (e) => e.grossMinor), this.currency()),
  );
  protected readonly commissionTotalStr = computed(() =>
    money(signedSum(this.entries(), (e) => e.commissionMinor), this.currency()),
  );

  private load(): void {
    if (this.venueId === undefined) {
      return;
    }
    this.console.payoutLedger(this.venueId).subscribe({
      next: (l) => {
        this.ledger.set(l);
        this.loadErrorMsg.set(undefined);
        this.loaded.set(true);
      },
      error: (e: unknown) => {
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
