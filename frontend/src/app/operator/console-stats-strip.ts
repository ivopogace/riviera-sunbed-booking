import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { formatCommissionPercent } from '../shared/commission-rate';
import { formatMoney, MoneyView } from '../shared/money';
import { StatTile } from '../shared/stat-tile';
import { VenueMapView } from '../shared/venue-views';
import { todayBookingDate } from '../shared/booking-date';
import { AvailabilityChanges } from './availability-changes';
import { SetDayState, TakingsView } from './operator-console.model';
import { OperatorConsoleService } from './operator-console.service';
import { ConsolePageRow } from '../shared/console-page-box';

/**
 * The operator console's stats strip, live for the venue today (Europe/Tirane, #6): Free today from
 * the page's shared map ({@link venue}), Booked online as the server's count (re-read on a
 * claim-releasing day refund), Walk-ins as the exact `STAFF_MARKED` count (re-read on a walk-in;
 * both via {@link AvailabilityChanges}), and Online takings today (net server-side, #9; formatted, #5).
 * Reads are best-effort: a failed read renders that tile's dash, never a count that may be stale.
 */
@Component({
  selector: 'app-console-stats-strip',
  imports: [ConsolePageRow, StatTile],
  templateUrl: './console-stats-strip.html',
})
export class ConsoleStatsStrip {
  private readonly console = inject(OperatorConsoleService);
  private readonly changes = inject(AvailabilityChanges);

  /** The venue this strip summarizes — required (the strip only renders inside the signed-in shell). */
  readonly venueId = input.required<number>();
  /** The venue map the console page loads per venue and shares — the source of free/total (undefined until loaded). */
  readonly venue = input<VenueMapView | undefined>(undefined);

  /**
   * Online bookings holding a set at the venue today (the "Booked online" tile), or `undefined` until
   * the read resolves — a failed read stays `undefined` (rendered "—"), distinct from a real 0, so a
   * blip never shows a misleading count nor inflates the walk-ins remainder below.
   */
  protected readonly bookedOnline = signal<number | undefined>(undefined);
  /** Gross + net-after-commission takings for today, or undefined until the read resolves. */
  protected readonly takings = signal<TakingsView | undefined>(undefined);
  /**
   * Today's held sets with their server state tokens, or `undefined` until the read resolves —
   * a failed read stays `undefined` (walk-ins render "—"), distinct from a real all-free day (`[]`).
   */
  private readonly held = signal<readonly SetDayState[] | undefined>(undefined);
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;
  /** Bumped per states read: only the latest read may land, so an older, slower answer (or its
   *  failure) never overwrites a newer count. */
  private heldRead = 0;
  /** Bumped per bookings read, the same latest-wins guard for Booked online. */
  private bookedRead = 0;

  /** Total sets across both pools; renders as "Free today {free}/{total}". */
  protected readonly total = computed(() => this.venue()?.sets.length ?? 0);
  /** Free sets today, from the shared venue map's per-set availability. */
  protected readonly free = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'FREE').length ?? 0,
  );
  /**
   * Walk-ins marked — the exact count of `STAFF_MARKED` states from the owner availability read;
   * `undefined` (rendered "—") until it resolves, so a failed read is never shown as a
   * phantom count. An unpaid online hold carries `BOOKED_ONLINE` and is therefore never counted.
   */
  protected readonly walkIns = computed(() => {
    const held = this.held();
    return held === undefined ? undefined : held.filter((s) => s.state === 'STAFF_MARKED').length;
  });

  /**
   * The net-after-commission line under today's gross, or `undefined` (tile omits the sub-caption)
   * until the takings read lands. Rate is the server's basis points as a percent; the net is
   * computed server-side (invariant #9) and only formatted here.
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
    // A change for this venue today moved one count: a walk-in the states, a day refund the bookings.
    this.changes
      .todayAt(this.venueId)
      .pipe(takeUntilDestroyed())
      .subscribe((change) =>
        change.cause === 'DAY_REFUND'
          ? this.loadBooked(change.venueId, change.date)
          : this.loadHeld(change.venueId, change.date),
      );
  }

  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  private load(venueId: number): void {
    const epoch = ++this.epoch;
    // Re-derived per load, once for all three reads: the strip outlives Tirane midnight (invariant #6).
    const date = todayBookingDate(new Date());
    // A venue switch reuses this strip — reset to dash defaults while the new reads run.
    this.bookedOnline.set(undefined);
    this.takings.set(undefined);
    this.held.set(undefined);
    this.loadBooked(venueId, date);
    // The continuation re-checks the venue so a superseded venue's takings never land here.
    this.console.dailyTakings(venueId, date).subscribe({
      next: (value) => {
        if (this.epoch === epoch) {
          this.takings.set(value);
        }
      },
      error: () => {
        // best-effort — the takings tile shows a dash
      },
    });
    this.loadHeld(venueId, date);
  }

  /** The count read behind Booked online, latest-wins like {@link loadHeld}. */
  private loadBooked(venueId: number, date: string): void {
    const read = ++this.bookedRead;
    this.console.dailyBookingCount(venueId, date).subscribe({
      next: (count) => {
        if (this.bookedRead === read) {
          this.bookedOnline.set(count);
        }
      },
      error: () => {
        // best-effort — the tile renders "—", never a pre-refund count
        if (this.bookedRead === read) {
          this.bookedOnline.set(undefined);
        }
      },
    });
  }

  /** The states read behind the walk-ins tile: the shown count stands until this read lands, a
   *  failure clears it to "—", and only the latest read may do either. */
  private loadHeld(venueId: number, date: string): void {
    const read = ++this.heldRead;
    this.console.dailyAvailability(venueId, date).subscribe({
      next: (states) => {
        if (this.heldRead === read) {
          this.held.set(states);
        }
      },
      error: () => {
        // best-effort — walk-ins render "—", never a phantom (or pre-write) count
        if (this.heldRead === read) {
          this.held.set(undefined);
        }
      },
    });
  }
}
