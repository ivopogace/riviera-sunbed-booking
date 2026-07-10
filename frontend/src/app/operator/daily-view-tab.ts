import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatMoney } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { parseIsoDate, todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView, VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { BeachGridFrame } from './beach-grid-frame';
import { ConsoleDailyBooking, MarkErrorCode, ReleaseErrorCode } from './operator-console.model';
import { OperatorConsoleService, markErrorOf, releaseErrorOf } from './operator-console.service';

/**
 * A set's state on the chosen day: `FREE` → tap to mark a walk-in; `STAFF_MARKED` → tap to release;
 * `BOOKED_ONLINE` → locked (held by a confirmed online booking — staff cannot release it here).
 */
type DailyTileState = 'FREE' | 'STAFF_MARKED' | 'BOOKED_ONLINE';

/** Sets grouped into a beach-map row (read order preserved). */
interface MapRow {
  readonly label: string;
  readonly sets: readonly SetView[];
}

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
  private readonly overrides = signal<ReadonlyMap<number, DailyTileState>>(new Map());
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
  protected readonly rows = computed<readonly MapRow[]>(() => {
    const byRow = new Map<string, SetView[]>();
    for (const set of this.venue()?.sets ?? []) {
      const row = byRow.get(set.rowLabel) ?? [];
      row.push(set);
      byRow.set(set.rowLabel, row);
    }
    return [...byRow].map(([label, sets]) => ({ label, sets }));
  });

  /** The effective tile state per set id: optimistic override, else derived from server truth. */
  private readonly tileState = computed<ReadonlyMap<number, DailyTileState>>(() => {
    const onlineHeld = new Set(this.bookings().map((b) => b.setId));
    const overrides = this.overrides();
    const state = new Map<number, DailyTileState>();
    for (const set of this.venue()?.sets ?? []) {
      const override = overrides.get(set.id);
      if (override) {
        state.set(set.id, override);
      } else if (set.availability === 'FREE') {
        state.set(set.id, 'FREE');
      } else {
        // A TAKEN set is online-held when a confirmed booking holds it, otherwise it is a staff mark.
        state.set(set.id, onlineHeld.has(set.id) ? 'BOOKED_ONLINE' : 'STAFF_MARKED');
      }
    }
    return state;
  });

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
  protected columns(row: MapRow): string {
    return `repeat(${row.sets.length}, minmax(0, 1fr))`;
  }

  /** State of one tile (defaults to FREE before the map loads). */
  protected stateOf(set: SetView): DailyTileState {
    return this.tileState().get(set.id) ?? 'FREE';
  }

  protected isPending(set: SetView): boolean {
    return this.pendingSets().has(set.id);
  }

  /** A tile is actionable when free (→ mark) or staff-marked (→ release); online-held is locked. */
  protected isActionable(set: SetView): boolean {
    const state = this.stateOf(set);
    return state === 'FREE' || state === 'STAFF_MARKED';
  }

  /** Tap a tile: mark a free set, or release a staff-marked one. Online-held tiles do nothing. */
  protected onTile(set: SetView): void {
    if (this.venueId === undefined || this.isPending(set)) {
      return;
    }
    switch (this.stateOf(set)) {
      case 'FREE':
        this.mark(set);
        break;
      case 'STAFF_MARKED':
        this.release(set);
        break;
      default:
        break; // BOOKED_ONLINE — not staff-actionable
    }
  }

  private mark(set: SetView): void {
    this.applyOverride(set.id, 'STAFF_MARKED');
    this.console.markSet(this.venueId!, set.id, this.selectedDate()).subscribe({
      next: () => this.reconcile(),
      error: (e: unknown) => {
        const reason = markErrorOf(e);
        this.onWriteError(markFailureNotice(reason), reason === 'UNAUTHORIZED');
      },
    });
  }

  private release(set: SetView): void {
    this.applyOverride(set.id, 'FREE');
    this.console.releaseSet(this.venueId!, set.id, this.selectedDate()).subscribe({
      next: () => this.reconcile(),
      error: (e: unknown) => {
        const reason = releaseErrorOf(e);
        this.onWriteError(releaseFailureNotice(reason), reason === 'UNAUTHORIZED');
      },
    });
  }

  /** Shared mark/release failure path: surface the notice, drop the lost session on 401, reconcile. */
  private onWriteError(message: string, unauthorized: boolean): void {
    this.notice.set(message);
    if (unauthorized) {
      // The server already rejected the session — clear local state without a logout round-trip.
      this.operator.sessionLost();
    }
    this.reconcile();
  }

  protected onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value || value === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(value);
    this.overrides.set(new Map());
    this.notice.set(undefined);
    this.load();
  }

  /** Optimistically flip a tile and mark it pending. */
  private applyOverride(setId: number, state: DailyTileState): void {
    this.notice.set(undefined);
    this.overrides.update((m) => new Map(m).set(setId, state));
    this.pendingSets.update((s) => new Set(s).add(setId));
  }

  /** Re-read the map + bookings for the current date, then clear settled overrides (server truth wins). */
  private reconcile(): void {
    this.load(() => {
      this.overrides.set(new Map());
      this.pendingSets.set(new Set());
    });
  }

  /** Fetch the map + bookings for the selected date; `onSettled` runs after both resolve. */
  private load(onSettled?: () => void): void {
    if (this.venueId === undefined) {
      return;
    }
    const requested = this.selectedDate();
    let remaining = 2;
    const settle = () => {
      this.loaded.set(true);
      if (--remaining === 0) {
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
        if (this.selectedDate() === requested) {
          // A transient read failure must NOT read as "no sets" (a dead-end) — show an error.
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
      this.notice.set('Your operator session has expired. Please sign in again.');
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

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026"). */
  protected dateLabel(): string {
    return new Intl.DateTimeFormat('en-IE', {
      // parseIsoDate anchors the civil day at midnight UTC, so format in UTC too (invariant #6).
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parseIsoDate(this.selectedDate()));
  }

  /** Accessible name so tile state is not conveyed by colour alone (WCAG AA). */
  protected tileLabel(set: SetView): string {
    const tier = set.tier === 'PREMIUM' ? 'front row' : 'standard';
    return `Set ${set.rowLabel} ${set.positionNo}, ${tier}, ${this.money(set.price)}, ${tileAction(this.stateOf(set))}`;
  }
}

/** The session-expired notice, shared by the mark and release failure paths. */
const SESSION_EXPIRED = 'Your operator session has expired. Please sign in again.';

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
      return SESSION_EXPIRED;
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
      return SESSION_EXPIRED;
    default:
      return 'Could not release that set. The map has been refreshed.';
  }
}

/** The accessibility action phrase for a tile's state. */
function tileAction(state: DailyTileState): string {
  switch (state) {
    case 'FREE':
      return 'free — tap to mark a walk-in';
    case 'STAFF_MARKED':
      return 'walk-in marked — tap to release';
    default:
      return 'booked online';
  }
}
