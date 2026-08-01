import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { CardGlass } from '../shared/card-glass';
import { formatMoney, MoneyView } from '../shared/money';
import { VenueMapView } from '../shared/venue-views';
import { todayBookingDate } from '../shared/booking-date';
import { TakingsView } from './operator-console.model';
import { OperatorConsoleService } from './operator-console.service';

/**
 * The operator console's stats strip (issue #171, O2) — four glass tiles above the tab nav, live for
 * the operator's venue today (Europe/Tirane, invariant #6): Free today `{free}/{total}`, Booked
 * online, Walk-ins marked, and Online takings today (gross + net after commission).
 *
 * <p>Occupancy counts are composed on the client (the seam decision, #171): free/total come from the
 * venue map the shell already loads (passed in via {@link venue}), booked-online from the day's
 * confirmed bookings, and walk-ins are the remainder — the same derivation `staff-daily` ships. Only
 * the takings figure is a dedicated server read; net-after-commission is computed server-side
 * (invariant #9) and merely rendered here via {@link formatMoney} (invariant #5 — no money math on
 * the client). Both reads are best-effort: a failure leaves the tile at its zero/dash default.
 */
@Component({
  selector: 'app-console-stats-strip',
  imports: [CardGlass],
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
   * Walk-ins marked = taken − booked-online (taken = total − free); never negative; `undefined`
   * (rendered "—") until the booked-online count loads, so a failed read isn't shown as walk-ins.
   *
   * Known limitation (#171 follow-up): the map's "taken" is state-agnostic — it counts a set as taken
   * from the moment it is claimed `BOOKED_ONLINE` at reserve (while still `AWAITING_PAYMENT`), but
   * `bookedOnline` counts only `CONFIRMED` bookings, so an unpaid online hold is transiently counted
   * here as a walk-in. Same derivation the shipped `staff-daily` view uses; a precise split needs a
   * server-side `STAFF_MARKED` count (deferred with the Option-B seam) — tracked for both surfaces.
   */
  protected readonly walkIns = computed(() => {
    const booked = this.bookedOnline();
    return booked === undefined ? undefined : Math.max(0, this.total() - this.free() - booked);
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

  /** The venue's commission rate as a percent for the "after {pct} commission" label (rate, not money). */
  protected commissionPct(bps: number): string {
    return `${bps / 100}%`;
  }

  private load(venueId: number): void {
    const epoch = ++this.epoch;
    // A venue switch reuses this strip (#180) — reset to dash defaults while the new reads run.
    this.bookedOnline.set(undefined);
    this.takings.set(undefined);
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
  }
}
