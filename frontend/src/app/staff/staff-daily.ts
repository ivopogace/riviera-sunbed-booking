import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { formatDeadline } from '../shared/deadline';
import { formatMoney } from '../shared/money';
import { parseIsoDate, todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView, VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import {
  DailyBookingItem,
  PendingRequestItem,
  StaffMarkError,
  StaffReleaseError,
  StaffRequestError,
  StaffTileState,
} from './staff.model';
import {
  StaffService,
  staffMarkErrorOf,
  staffReleaseErrorOf,
  staffRequestErrorOf,
} from './staff.service';

interface MapRow {
  readonly label: string;
  readonly sets: readonly SetView[];
}

interface BookingRow {
  readonly setId: number;
  readonly code: string;
  readonly label: string;
}

/** A pending request with its set resolved to a display label from the loaded map. */
interface PendingRequestRow extends PendingRequestItem {
  readonly setLabel: string;
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
 *
 * <p>Request-to-Book (issue #98) adds a venue-wide "Pending requests" queue (independent of the
 * selected date — it lists every open request, no booking codes). Accept/decline are sent, then
 * the queue AND the map/bookings are re-read: an accept can flip a tile for the shown day.
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
  /** The venue-wide Request-to-Book queue (issue #98) — every open request, all dates. */
  protected readonly requests = signal<readonly PendingRequestItem[]>([]);
  /** Requests with an in-flight accept/decline — their buttons are disabled until it settles. */
  private readonly deciding = signal<ReadonlySet<number>>(new Set());
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

  /** The pending-request rows, each set resolved from the loaded map (else the raw set id). */
  protected readonly requestRows = computed<readonly PendingRequestRow[]>(() => {
    const byId = new Map(this.venue()?.sets.map((s) => [s.id, s]) ?? []);
    return this.requests().map((r) => {
      const set = byId.get(r.setId);
      return { ...r, setLabel: set ? `${set.rowLabel} · ${set.positionNo}` : `Set ${r.setId}` };
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
    this.requests.set([]);
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

  protected isDeciding(bookingId: number): boolean {
    return this.deciding().has(bookingId);
  }

  protected onAccept(row: PendingRequestRow): void {
    this.decide(row, 'accept');
  }

  protected onDecline(row: PendingRequestRow): void {
    this.decide(row, 'decline');
  }

  /** Send an accept/decline, then reconcile: an accept can flip a tile on the shown day. */
  private decide(row: PendingRequestRow, action: 'accept' | 'decline'): void {
    if (this.venueId === undefined || this.isDeciding(row.bookingId)) {
      return;
    }
    this.notice.set(undefined);
    this.deciding.update((s) => new Set(s).add(row.bookingId));
    const call =
      action === 'accept'
        ? this.staff.acceptRequest(this.venueId, row.bookingId)
        : this.staff.declineRequest(this.venueId, row.bookingId);
    call.subscribe({
      next: (decision) => this.settleDecision(row.bookingId, decisionNotice(action, decision.status)),
      error: (e) => {
        const reason = staffRequestErrorOf(e);
        if (reason === 'UNAUTHORIZED') {
          // Sign out and settle WITHOUT reconciling: the reloads would go out credential-less,
          // 401 again, and overwrite this notice with a generic sign-in failure.
          this.operator.signOut();
          this.settleDecision(row.bookingId, decisionFailureNotice(action, reason), false);
          return;
        }
        this.settleDecision(row.bookingId, decisionFailureNotice(action, reason));
      },
    });
  }

  /** Shared decision epilogue: surface the outcome and (unless signed out) re-read everything. */
  private settleDecision(bookingId: number, message: string, reload = true): void {
    this.notice.set(message);
    this.deciding.update((s) => {
      const next = new Set(s);
      next.delete(bookingId);
      return next;
    });
    if (reload) {
      this.reconcile();
    }
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

  /**
   * Fetch the map and bookings for the selected date plus the venue-wide request queue
   * (date-independent, issue #98); `onSettled` runs after all three resolve.
   */
  private load(onSettled?: () => void): void {
    if (this.venueId === undefined) {
      return;
    }
    const requested = this.selectedDate();
    let remaining = 3;
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
    this.staff.pendingRequests(this.venueId).subscribe({
      next: (r) => {
        // Venue-wide, not date-scoped — apply regardless of the selected date.
        this.requests.set(r);
        settle();
      },
      error: (e) => {
        if (staffRequestErrorOf(e) === 'UNAUTHORIZED') {
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

  /** A request's response deadline rendered in Europe/Tirane wall-clock time (invariant #6). */
  protected requestDeadline(iso: string): string {
    return formatDeadline(iso);
  }

  /** Accessible name for an Accept button — names the guest, set and date, not just "Accept". */
  protected acceptLabel(row: PendingRequestRow): string {
    return `Accept booking request from ${row.guestName} for ${row.setLabel} on ${row.bookingDate}`;
  }

  /** Accessible name for a Decline button. */
  protected declineLabel(row: PendingRequestRow): string {
    return `Decline booking request from ${row.guestName} for ${row.setLabel} on ${row.bookingDate}`;
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

/** The operator-facing notice for a successful accept/decline (issue #98). */
function decisionNotice(action: 'accept' | 'decline', status: string): string {
  if (action === 'decline') {
    return 'Request declined.';
  }
  return status === 'CONFIRMED'
    ? 'Request accepted — the booking is confirmed.'
    : 'Request accepted — the guest has been asked to pay.';
}

/** Map an accept/decline failure to its operator-facing notice (issue #98). */
function decisionFailureNotice(action: 'accept' | 'decline', reason: StaffRequestError): string {
  switch (reason) {
    case 'REQUEST_EXPIRED':
      return 'That request has already expired — the queue has been refreshed.';
    case 'REQUEST_NOT_PENDING':
      return 'That request was already handled — the queue has been refreshed.';
    case 'NO_SUCH_REQUEST':
      return 'That request no longer exists — the queue has been refreshed.';
    case 'PAYMENT_INIT_FAILED':
      return 'Could not set up the guest’s payment — please try accepting again.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t handle its requests.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED;
    default:
      return `Could not ${action} that request. Please try again.`;
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
