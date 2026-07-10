import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import { SetRow, TileState, deriveTileStates, groupSetsByRow, tileTapAction } from '../shared/availability-grid';
import { CardGlass } from '../shared/card-glass';
import { formatMoney } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { formatCivilDate, todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView, VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { BeachGridFrame } from './beach-grid-frame';
import { ConsoleDailyBooking, MarkErrorCode, ReleaseErrorCode } from './operator-console.model';
import { OperatorConsoleService, markErrorOf, releaseErrorOf } from './operator-console.service';

/** One arrivals row: the confirmed booking's set label + its display-only arrival code (invariant #7). */
interface ArrivalRow {
  readonly setId: number;
  readonly code: string;
  readonly label: string;
}

/**
 * The O5 Daily view tab (issue #175, epic #141) — the operator console's restyle of the staff
 * daily-operations surface: a sea-facing availability grid (tap a FREE set to mark a walk-in, tap a
 * `STAFF_MARKED` set to release; an online-booked set is locked), a Europe/Tirane date picker, and
 * an Arrivals card listing the day's confirmed bookings with their booking-code chips.
 *
 * <p>A restyle only — <strong>no change to the availability invariants</strong>. It is the second
 * driving adapter onto the existing owner-asserted staff mark/release writes (invariant #13):
 * `availability` stays the single writer per `(set, date)` (invariant #2) and the online/walk-in
 * pools stay separate (invariant #3). Tap state is optimistic-but-reconciled — the tile flips
 * immediately, the write is sent, then the map + bookings are re-read so server truth replaces the
 * guess (the server release deletes only a `STAFF_MARKED` row, so a mis-tap on an online-held tile is
 * a safe no-op). Reads `:venueId` from the parent route via {@link parentVenueId} (child routes don't
 * inherit it — the O1 finding), the same as {@link import('./pricing-tab').PricingTab}. Always
 * porcelain (inherited from the console shell); glass via {@link CardGlass}; the shared sea-facing
 * chrome via {@link BeachGridFrame}. Tile state is conveyed by an accessible name, not colour alone
 * (WCAG AA); codes are bearer credentials (invariant #7), shown for arrival verification, never logged.
 *
 * <p>The Request-to-Book queue and the legacy-page retirement are deliberately out of scope — they are
 * O6 (#176). This tab does daily-ops only.
 */
@Component({
  selector: 'app-daily-view-tab',
  imports: [CardGlass, BeachGridFrame],
  templateUrl: './daily-view-tab.html',
})
export class DailyViewTab {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly console = inject(OperatorConsoleService);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if invalid). */
  private readonly venueId: number | undefined;

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly bookings = signal<readonly ConsoleDailyBooking[]>([]);
  /** True once the initial load settles (success or failure) — drives the loading vs content state. */
  protected readonly loaded = signal(false);
  /** True when the initial venue read failed — shows an error (not a false "no sets" state). */
  protected readonly loadError = signal(false);
  /** A transient notice (e.g. a set was just taken by the other channel, or a write failed). */
  protected readonly notice = signal<string | undefined>(undefined);

  /** The day the view reflects (ISO YYYY-MM-DD); defaults to today in Europe/Tirane (invariant #6). */
  protected readonly selectedDate = signal(todayBookingDate(new Date()));

  /** Optimistic per-set overrides applied on tap, cleared once a reconcile confirms server truth. */
  private readonly overrides = signal<ReadonlyMap<number, TileState>>(new Map());
  /** Sets with an in-flight mark/release — disabled until it settles. */
  protected readonly pendingSets = signal<ReadonlySet<number>>(new Set());

  constructor() {
    const id = parentVenueId(this.route);
    if (id !== undefined) {
      this.venueId = id;
      this.load();
    } else {
      this.loaded.set(true);
      this.loadError.set(true);
    }
  }

  /** Sets grouped into rows (read order preserved) for the grid. */
  protected readonly rows = computed<readonly SetRow[]>(() =>
    groupSetsByRow(this.venue()?.sets ?? []),
  );

  /** The effective tile state per set id: optimistic override, else derived from server truth. */
  private readonly tileState = computed<ReadonlyMap<number, TileState>>(() =>
    deriveTileStates(
      this.venue()?.sets ?? [],
      new Set(this.bookings().map((b) => b.setId)),
      this.overrides(),
    ),
  );

  /** The arrivals rows, each labelled with its set's position (else the raw set id). */
  protected readonly arrivals = computed<readonly ArrivalRow[]>(() => {
    const byId = new Map(this.venue()?.sets.map((s) => [s.id, s]) ?? []);
    return this.bookings().map((b) => {
      const set = byId.get(b.setId);
      const label = set ? `${set.rowLabel} · ${set.positionNo}` : `Set ${b.setId}`;
      return { setId: b.setId, code: b.code, label };
    });
  });

  protected readonly markedCount = computed(
    () => [...this.tileState().values()].filter((s) => s === 'STAFF_MARKED').length,
  );
  protected readonly freeCount = computed(
    () => [...this.tileState().values()].filter((s) => s === 'FREE').length,
  );
  protected readonly totalCount = computed(() => this.venue()?.sets.length ?? 0);

  /** The per-row grid-template-columns value (one equal column per set). */
  protected columns(row: SetRow): string {
    return `repeat(${row.sets.length}, minmax(0, 1fr))`;
  }

  /** State of one tile (defaults to FREE before the map loads). */
  protected stateOf(set: SetView): TileState {
    return this.tileState().get(set.id) ?? 'FREE';
  }

  protected isPending(set: SetView): boolean {
    return this.pendingSets().has(set.id);
  }

  /** A tile is actionable when free (→ mark) or staff-marked (→ release); online-held is locked. */
  protected isActionable(set: SetView): boolean {
    return tileTapAction(this.stateOf(set)) !== undefined;
  }

  /**
   * Tap a tile: mark a free set (optimistic STAFF_MARKED) or release a staff-marked one (optimistic
   * FREE), then reconcile to server truth. Online-held tiles are locked. One write path for both
   * directions — only the endpoint and the error mapper differ.
   */
  protected onTile(set: SetView): void {
    if (this.venueId === undefined || this.isPending(set)) {
      return;
    }
    const action = tileTapAction(this.stateOf(set));
    if (action === undefined) {
      return; // BOOKED_ONLINE — locked
    }
    const marking = action === 'mark';
    this.applyOverride(set.id, marking ? 'STAFF_MARKED' : 'FREE');
    const write = marking
      ? this.console.markSet(this.venueId, set.id, this.selectedDate())
      : this.console.releaseSet(this.venueId, set.id, this.selectedDate());
    write.subscribe({
      next: () => this.reconcile(set.id),
      error: (e: unknown) => {
        if (marking) {
          const reason = markErrorOf(e);
          this.onWriteError(set.id, markFailureNotice(reason), reason === 'UNAUTHORIZED');
        } else {
          const reason = releaseErrorOf(e);
          this.onWriteError(set.id, releaseFailureNotice(reason), reason === 'UNAUTHORIZED');
        }
      },
    });
  }

  /** Shared mark/release failure path: surface the notice, drop the lost session on 401, reconcile. */
  private onWriteError(setId: number, message: string, unauthorized: boolean): void {
    this.notice.set(message);
    if (unauthorized) {
      // The server already rejected the session — clear local state without a logout round-trip.
      this.operator.sessionLost();
    }
    this.reconcile(setId);
  }

  protected onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value || value === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(value);
    // Reset to the new day's loading state: never show the previous day's grid, counts or codes under
    // the new date label, and carry no stale optimistic/pending state across the switch.
    this.overrides.set(new Map());
    this.pendingSets.set(new Set());
    this.notice.set(undefined);
    this.loadError.set(false);
    this.loaded.set(false);
    this.venue.set(undefined);
    this.bookings.set([]);
    this.load();
  }

  /** Optimistically flip a tile and mark it pending. */
  private applyOverride(setId: number, state: TileState): void {
    this.notice.set(undefined);
    this.overrides.update((m) => new Map(m).set(setId, state));
    this.pendingSets.update((s) => new Set(s).add(setId));
  }

  /**
   * Re-read the map + bookings, then clear ONLY this set's settled override/pending — server truth
   * now wins for it. A global clear would wipe the in-flight optimistic state of a DIFFERENT tile the
   * operator tapped while this reload was outstanding (which would re-enable it and duplicate its write).
   */
  private reconcile(setId: number): void {
    this.load(() => {
      this.overrides.update((m) => {
        const next = new Map(m);
        next.delete(setId);
        return next;
      });
      this.pendingSets.update((s) => {
        const next = new Set(s);
        next.delete(setId);
        return next;
      });
    });
  }

  /** Fetch the map + bookings for the selected date; `onSettled` runs after BOTH resolve. */
  private load(onSettled?: () => void): void {
    if (this.venueId === undefined) {
      return;
    }
    const requested = this.selectedDate();
    let remaining = 2;
    const settle = () => {
      // Flip `loaded` only once both reads have settled, so the grid never renders with a resolved
      // bookings list but a still-undefined venue (a "0 of 0 free" flash).
      if (--remaining === 0) {
        this.loaded.set(true);
        onSettled?.();
      }
    };
    this.venues.getVenueMap(this.venueId, requested).subscribe({
      next: (v) => {
        if (this.selectedDate() === requested) {
          this.venue.set(v);
          this.loadError.set(false);
        }
        settle();
      },
      error: (error: unknown) => {
        // Wipe to the error card only when there is no grid to preserve (initial / date-change load).
        // A transient failure of a post-write reconcile keeps the working grid the operator is using.
        if (this.selectedDate() === requested && this.venue() === undefined) {
          this.loadError.set(true);
        }
        this.dropSessionIfUnauthorized(error);
        settle();
      },
    });
    this.console.dailyBookings(this.venueId, requested).subscribe({
      next: (b) => {
        if (this.selectedDate() === requested) {
          this.bookings.set(b);
        }
        settle();
      },
      error: (error: unknown) => {
        this.dropSessionIfUnauthorized(error);
        settle();
      },
    });
  }

  private dropSessionIfUnauthorized(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.notice.set(SESSION_EXPIRED_MESSAGE);
      this.operator.sessionLost();
    }
  }

  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  /** The tile glyph: a check for a staff mark, a dot when locked, else the price. */
  protected tileGlyph(set: SetView): string {
    switch (this.stateOf(set)) {
      case 'STAFF_MARKED':
        return '✓';
      case 'BOOKED_ONLINE':
        return '●';
      default:
        return this.money(set.price);
    }
  }

  /** The Tailwind background/ink classes for a tile of the given state (test-hooks: `.set-tile` + data-state). */
  protected tileClass(set: SetView): string {
    switch (this.stateOf(set)) {
      case 'STAFF_MARKED':
        return 'border-transparent bg-[#0a6e85] text-white';
      case 'BOOKED_ONLINE':
        return 'border-[#0c2a33]/15 bg-[repeating-linear-gradient(45deg,rgba(12,42,51,0.28)_0_3px,rgba(12,42,51,0.1)_3px_6px)] text-(--riv-card-ink)';
      default:
        return 'border-[#0c2a33]/15 bg-white/85 text-(--riv-card-ink)';
    }
  }

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026") — memoized, recomputed per date. */
  protected readonly dateLabel = computed(() => formatCivilDate(this.selectedDate()));

  /** Accessible name so tile state is not conveyed by colour alone (WCAG AA). */
  protected tileLabel(set: SetView): string {
    const tier = set.tier === 'PREMIUM' ? 'front row' : 'standard';
    return `Set ${set.rowLabel} ${set.positionNo}, ${tier}, ${this.money(set.price)}, ${tileAction(this.stateOf(set))}`;
  }
}

/** Map a mark failure to its operator-facing notice (no nested ternaries). */
function markFailureNotice(reason: MarkErrorCode): string {
  switch (reason) {
    case 'ALREADY_TAKEN':
      return 'That set was just taken — the map has been refreshed.';
    case 'DATE_IN_PAST':
      return 'That day is past the booking cutoff — walk-ins can’t be marked for it.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t mark its walk-ins.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED_MESSAGE;
    default:
      return 'Could not mark that set. The map has been refreshed.';
  }
}

/** Map a release failure to its operator-facing notice. */
function releaseFailureNotice(reason: ReleaseErrorCode): string {
  switch (reason) {
    case 'NOT_MARKED':
      return 'That set was not a walk-in mark — the map has been refreshed.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t release its walk-ins.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED_MESSAGE;
    default:
      return 'Could not release that set. The map has been refreshed.';
  }
}

/** The accessibility action phrase for a tile's state. */
function tileAction(state: TileState): string {
  switch (state) {
    case 'FREE':
      return 'free — tap to mark a walk-in';
    case 'STAFF_MARKED':
      return 'walk-in marked — tap to release';
    default:
      return 'booked online';
  }
}
