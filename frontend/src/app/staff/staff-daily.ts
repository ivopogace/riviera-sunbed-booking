import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { formatMoney } from '../shared/money';
import { parseIsoDate, todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView, VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { DailyBookingItem, StaffMarkError, StaffReleaseError, StaffTileState } from './staff.model';
import { StaffService, staffMarkErrorOf, staffReleaseErrorOf } from './staff.service';

interface MapRow {
  readonly label: string;
  readonly sets: readonly SetView[];
}

interface BookingRow {
  readonly setId: number;
  readonly code: string;
  readonly label: string;
}

/**
 * Operator daily view (U8, issue #10): for a chosen day (default today in Europe/Tirane) an operator
 * sees the venue's confirmed bookings (set + arrival code) and a live beach map, and taps a free set
 * to mark a walk-in (`STAFF_MARKED`) or taps a staff-marked set to release it — the second writer to
 * the availability source of truth (invariant #2).
 *
 * <p>Tap state is <strong>optimistic but reconciled</strong>: the tile flips immediately, the
 * mark/release is sent, then the map + bookings are re-read so the server's authoritative state
 * replaces the guess. The server guards the release (only a `STAFF_MARKED` row is deleted, never an
 * online booking's), so an optimistic mis-tap on an online-held tile resolves to a safe no-op and
 * reconciles back. Tile state is conveyed by an accessible name, not colour alone (WCAG AA). Codes
 * are bearer credentials (invariant #7) — shown for arrival verification, never logged.
 */
@Component({
  selector: 'app-staff-daily',
  imports: [],
  templateUrl: './staff-daily.html',
  styleUrl: './staff-daily.scss',
})
export class StaffDaily {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly staff = inject(StaffService);
  protected readonly operator = inject(OperatorAuth);

  /** Operator sign-in (plain signals — trivial, no per-field validation messaging). */
  protected readonly username = signal('');
  protected readonly password = signal('');

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly bookings = signal<readonly DailyBookingItem[]>([]);
  protected readonly failed = signal(false);
  /** A transient notice shown after a reconcile (e.g. a set was just taken by the other channel). */
  protected readonly notice = signal<string | undefined>(undefined);

  /** The day the view reflects (ISO YYYY-MM-DD); defaults to today in Europe/Tirane. */
  protected readonly selectedDate = signal(todayBookingDate(new Date()));

  /** Optimistic per-set overrides applied on tap, cleared once a reconcile confirms server truth. */
  private readonly overrides = signal<ReadonlyMap<number, StaffTileState>>(new Map());
  /** Sets with an in-flight mark/release — disabled until it settles. */
  protected readonly pending = signal<ReadonlySet<number>>(new Set());

  private readonly venueId: number | undefined;

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('venueId'));
    if (!Number.isInteger(id)) {
      this.failed.set(true);
      return;
    }
    this.venueId = id;
    if (this.operator.signedIn()) {
      this.load();
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
  private readonly tileState = computed<ReadonlyMap<number, StaffTileState>>(() => {
    const onlineHeld = new Set(this.bookings().map((b) => b.setId));
    const overrides = this.overrides();
    const state = new Map<number, StaffTileState>();
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

  /** The confirmed-bookings table rows, each labelled with its set's position. */
  protected readonly bookingRows = computed<readonly BookingRow[]>(() => {
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

  protected onSignIn(): void {
    if (!this.username() || !this.password()) {
      return;
    }
    this.operator.signIn(this.username(), this.password());
    this.failed.set(false);
    this.notice.set(undefined);
    this.load();
  }

  protected onSignOut(): void {
    this.operator.signOut();
    this.password.set('');
    this.venue.set(undefined);
    this.bookings.set([]);
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

  /** State of one tile (defaults to FREE before the map loads). */
  protected stateOf(set: SetView): StaffTileState {
    return this.tileState().get(set.id) ?? 'FREE';
  }

  protected isPending(set: SetView): boolean {
    return this.pending().has(set.id);
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
    this.staff.mark(this.venueId!, set.id, this.selectedDate()).subscribe({
      next: () => this.reconcile(),
      error: (e) => {
        const reason = staffMarkErrorOf(e);
        this.onWriteError(markFailureNotice(reason), reason === 'UNAUTHORIZED');
      },
    });
  }

  private release(set: SetView): void {
    this.applyOverride(set.id, 'FREE');
    this.staff.release(this.venueId!, set.id, this.selectedDate()).subscribe({
      next: () => this.reconcile(),
      error: (e) => {
        const reason = staffReleaseErrorOf(e);
        this.onWriteError(releaseFailureNotice(reason), reason === 'UNAUTHORIZED');
      },
    });
  }

  /** Shared mark/release failure path: surface the notice, sign out on 401, and reconcile. */
  private onWriteError(message: string, unauthorized: boolean): void {
    this.notice.set(message);
    if (unauthorized) {
      this.operator.signOut();
    }
    this.reconcile();
  }

  /** Optimistically flip a tile and mark it pending. */
  private applyOverride(setId: number, state: StaffTileState): void {
    this.notice.set(undefined);
    this.overrides.update((m) => new Map(m).set(setId, state));
    this.pending.update((s) => new Set(s).add(setId));
  }

  /** Re-read the map + bookings for the current date, then clear settled overrides (server truth wins). */
  private reconcile(): void {
    this.load(() => {
      this.overrides.set(new Map());
      this.pending.set(new Set());
    });
  }

  /** Fetch the map and bookings for the selected date; `onSettled` runs after both resolve. */
  private load(onSettled?: () => void): void {
    if (this.venueId === undefined) {
      return;
    }
    const requested = this.selectedDate();
    let remaining = 2;
    const settle = () => {
      if (--remaining === 0) {
        onSettled?.();
      }
    };
    this.venues.getVenueMap(this.venueId, requested).subscribe({
      next: (v) => {
        if (this.selectedDate() === requested) {
          this.venue.set(v);
          this.failed.set(false);
        }
        settle();
      },
      error: () => {
        if (this.selectedDate() === requested) {
          this.failed.set(true);
        }
        settle();
      },
    });
    this.staff.dailyBookings(this.venueId, requested).subscribe({
      next: (b) => {
        if (this.selectedDate() === requested) {
          this.bookings.set(b);
        }
        settle();
      },
      error: (e) => {
        if (staffMarkErrorOf(e) === 'UNAUTHORIZED') {
          this.notice.set('Could not sign in as operator. Check your credentials.');
          this.operator.signOut();
        }
        settle();
      },
    });
  }

  protected money(amount: MoneyView): string {
    return formatMoney(amount);
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
function markFailureNotice(reason: StaffMarkError): string {
  switch (reason) {
    case 'ALREADY_TAKEN':
      return 'That set was just taken — the map has been refreshed.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED;
    default:
      return 'Could not mark that set. The map has been refreshed.';
  }
}

/** Map a release failure to its operator-facing notice. */
function releaseFailureNotice(reason: StaffReleaseError): string {
  switch (reason) {
    case 'NOT_MARKED':
      return 'That set was not a walk-in mark — the map has been refreshed.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED;
    default:
      return 'Could not release that set. The map has been refreshed.';
  }
}

/** The accessibility action phrase for a tile's state. */
function tileAction(state: StaffTileState): string {
  switch (state) {
    case 'FREE':
      return 'free — tap to mark a walk-in';
    case 'STAFF_MARKED':
      return 'walk-in marked — tap to release';
    default:
      return 'booked online';
  }
}
