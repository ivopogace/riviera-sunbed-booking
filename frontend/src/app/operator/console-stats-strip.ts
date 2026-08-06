import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { formatCommissionPercent } from '../shared/commission-rate';
import { formatMoney, MoneyView } from '../shared/money';
import { StatTile } from '../shared/stat-tile';
import { VenueMapView } from '../shared/venue-views';
import { todayBookingDate } from '../shared/booking-date';
import { SetDayState, TakingsView } from './operator-console.model';
import { OperatorConsoleService } from './operator-console.service';

/**
 * The operator console's stats strip (issue #171, O2) — four glass tiles above the tab nav, live for
 * the operator's venue today (Europe/Tirane, invariant #6): Free today `{free}/{total}`, Booked
 * online, Walk-ins marked, and Online takings today (gross + net after commission).
 *
 * <p>Each tile names its source: free/total come from the venue map the shell already loads (passed
 * in via {@link venue}, the #486 shared snapshot), booked-online from the day's CONFIRMED bookings,
 * and walk-ins from the owner availability-states read (#207) — an exact `STAFF_MARKED` count, which
 * replaced the `taken − booked` remainder that transiently mislabeled an unpaid online hold as a
 * walk-in. Net-after-commission is computed server-side (invariant #9) and merely rendered via
 * {@link formatMoney} (invariant #5 — no money math on the client). All three reads are
 * best-effort: a failure leaves that tile at its zero/dash default and never poisons the others.
 */
@Component({
  selector: 'app-console-stats-strip',
  imports: [StatTile],
  templateUrl: './console-stats-strip.html',
})
export class ConsoleStatsStrip {
  private readonly console = inject(OperatorConsoleService);

  /** The venue this strip summarizes — required (the strip only renders inside the signed-in shell). */
  readonly venueId = input.required<number>();
  /** The venue map the shell loads per venue and shares — the source of free/total (undefined until loaded). */
  readonly venue = input<VenueMapView | undefined>(undefined);

  /** Today in Europe/Tirane — the civil day all tiles report on (invariant #6). */
  private readonly date = todayBookingDate(new Date());

  /**
   * Confirmed online bookings for the venue today (the "Booked online" tile), or `undefined` until
   * the read resolves — a failed read stays `undefined` (rendered "—"), distinct from a real 0, so a
   * blip never shows a misleading count nor inflates the walk-ins remainder below.
   */
  protected readonly bookedOnline = signal<number | undefined>(undefined);
  /** Gross + net-after-commission takings for today, or undefined until the read resolves. */
  protected readonly takings = signal<TakingsView | undefined>(undefined);
  /**
   * Today's held sets with their server state tokens (#207), or `undefined` until the read resolves —
   * a failed read stays `undefined` (walk-ins render "—"), distinct from a real all-free day (`[]`).
   */
  private readonly held = signal<readonly SetDayState[] | undefined>(undefined);
  /** Bumped per venue context (#180): an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead (the #487 precedent). */
  private epoch = 0;


  /** Total sets across both pools (design "Free today {free}/{total}"). */
  protected readonly total = computed(() => this.venue()?.sets.length ?? 0);
  /** Free sets today, from the shared venue map's per-set availability. */
  protected readonly free = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'FREE').length ?? 0,
  );
  /**
   * Walk-ins marked — the exact count of `STAFF_MARKED` states from the owner availability read
   * (#207); `undefined` (rendered "—") until it resolves, so a failed read is never shown as a
   * phantom count. An unpaid online hold carries `BOOKED_ONLINE` and is therefore never counted.
   */
  protected readonly walkIns = computed(() => {
    const held = this.held();
    return held === undefined
      ? undefined
      : held.filter((s) => s.state === 'STAFF_MARKED').length;
  });

  /**
   * The net-after-commission line under today's gross, or `undefined` until the takings read lands —
   * which is what makes the tile omit the sub-caption element rather than render an empty one. The
   * rate is a percent rendering of the server's basis points; the net itself is computed server-side
   * (invariant #9) and merely formatted here.
   */
  protected readonly netCaption = computed(() => {
    const takings = this.takings();
    return takings === undefined
      ? undefined
      : `${formatMoney(takings.net)} after ${formatCommissionPercent(takings.commissionBps)} commission`;
  });

  constructor() {
    // Load the booked-online count + takings once the venue id is known; both best-effort so a failed
    // read leaves the tile at its zero/dash default and never blocks the console (mirrors the shell).
    effect(() => {
      const id = this.venueId();
      untracked(() => this.load(id));
    });
  }

  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  private load(venueId: number): void {
    const epoch = ++this.epoch;
    // A venue switch reuses this strip (#180) — reset to dash defaults while the new reads run.
    this.bookedOnline.set(undefined);
    this.takings.set(undefined);
    this.held.set(undefined);
    // Continuations re-check the venue so a superseded venue's reads never land here (#180).
    this.console.dailyBookingCount(venueId, this.date).subscribe({
      next: (count) => {
        if (this.epoch === epoch) {
          this.bookedOnline.set(count);
        }
      },
      error: () => {
        // best-effort — leave bookedOnline undefined so the tile (and walk-ins) render "—", not 0
      },
    });
    this.console.dailyTakings(venueId, this.date).subscribe({
      next: (value) => {
        if (this.epoch === epoch) {
          this.takings.set(value);
        }
      },
      error: () => {
        // best-effort — the takings tile shows a dash
      },
    });
    this.console.dailyAvailability(venueId, this.date).subscribe({
      next: (states) => {
        if (this.epoch === epoch) {
          this.held.set(states);
        }
      },
      error: () => {
        // best-effort — walk-ins render "—", never a phantom count (#207)
      },
    });
  }
}
