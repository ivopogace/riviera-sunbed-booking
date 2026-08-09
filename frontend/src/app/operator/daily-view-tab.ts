import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, forkJoin, of, tap } from 'rxjs';

import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import {
  HeldSetState,
  SetRow,
  TileState,
  deriveTileStates,
  groupSetsByRow,
  tileTapAction,
} from '../shared/availability-grid';
import { CardGlass } from '../shared/card-glass';
import { formatMoney, MoneyView } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { formatCivilDate, todayBookingDate } from '../shared/booking-date';
import { setLabel, setsById, tierSentenceLabel } from '../shared/set-label';
import { SetView, VenueMapView } from '../shared/venue-views';
import { VenueService } from '../venue/venue.service';
import { BeachGridFrame } from './beach-grid-frame';
import { ConsoleDailyBooking, MarkErrorCode, ReleaseErrorCode } from './operator-console.model';
import {
  OperatorConsoleService,
  checkInErrorOf,
  checkInWrongDateOf,
  markErrorOf,
  releaseErrorOf,
} from './operator-console.service';
import { QrScanner } from './qr-scanner';
import { codeFromScan } from './scan-input';

/** One arrivals row: set label, display-only arrival code (invariant #7), and whether already checked in. */
interface ArrivalRow {
  readonly setId: number;
  readonly code: string;
  readonly label: string;
  readonly checkedIn: boolean;
}

/** The check-in panel's announced outcome; tone drives the ink, the text carries the meaning. */
interface CheckInNotice {
  readonly tone: 'ok' | 'error';
  readonly text: string;
}

/**
 * The Daily view tab — the operator console's restyle of the staff
 * daily-operations surface: a sea-facing availability grid (tap a FREE set to mark a walk-in, tap a
 * `STAFF_MARKED` set to release; an online-booked set is locked), a Europe/Tirane date picker, and
 * an Arrivals card listing the day's confirmed bookings with their booking-code chips.
 *
 * <p>A restyle only — <strong>no change to the availability invariants</strong>. It is the second
 * driving adapter onto the existing owner-asserted staff mark/release writes (invariant #13):
 * `availability` stays the single writer per `(set, date)` (invariant #2) and the online/walk-in
 * pools stay separate (invariant #3). Tile classification comes from the owner availability-states
 * read — `BOOKED_ONLINE` covers any online hold, paid or not, so an unpaid hold renders locked,
 * never as a phantom walk-in. Tap state is optimistic-but-reconciled — the tile flips immediately, the
 * write is sent, then the map + bookings + states are re-read so server truth replaces the guess (the
 * server release deletes only a `STAFF_MARKED` row, so a mis-tap on an online-held tile is
 * a safe no-op). Reads `:venueId` from the parent route via {@link parentVenueId} (child routes don't
 * inherit it), the same as {@link import('./pricing-tab').PricingTab}. Always
 * porcelain (inherited from the console shell); glass via {@link CardGlass}; the shared sea-facing
 * chrome via {@link BeachGridFrame}. Tile state is conveyed by an accessible name, not colour alone
 * (WCAG AA); codes are bearer credentials (invariant #7), shown for arrival verification, never logged.
 *
 * <p>The Request-to-Book queue is deliberately out of scope — it is the Requests tab's job. This
 * tab does daily-ops only.
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

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if
   *  invalid) — reactive to in-place venue switches, which reuse this instance. */
  private readonly venueId = parentVenueId(this.route);

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly bookings = signal<readonly ConsoleDailyBooking[]>([]);
  /** The day's per-set server states — the tile-classification authority; undefined until loaded. */
  private readonly states = signal<ReadonlyMap<number, HeldSetState> | undefined>(undefined);
  /** True once the initial load settles (success or failure) — drives the loading vs content state. */
  protected readonly loaded = signal(false);
  /** True when the initial venue read failed — shows an error (not a false "no sets" state). */
  protected readonly loadError = signal(false);
  /** A transient notice (e.g. a set was just taken by the other channel, or a write failed). */
  protected readonly notice = signal<string | undefined>(undefined);

  /** The day the view reflects (ISO YYYY-MM-DD); defaults to today in Europe/Tirane (invariant #6). */
  protected readonly selectedDate = signal(todayBookingDate(new Date()));

  private readonly scanner = inject(QrScanner);
  /** The check-in scanner panel is open (camera live for the real adapter). */
  protected readonly scanOpen = signal(false);
  /** An in-flight check-in POST — gates the buttons so one scan cannot double-submit. */
  protected readonly checkInBusy = signal(false);
  /** The last check-in outcome, announced via the panel's status region. */
  protected readonly checkInNotice = signal<CheckInNotice | undefined>(undefined);
  protected readonly scanVideo = viewChild<ElementRef<HTMLVideoElement>>('scanVideo');

  /** Optimistic per-set overrides applied on tap, cleared once a reconcile confirms server truth. */
  private readonly overrides = signal<ReadonlyMap<number, TileState>>(new Map());
  /** Sets with an in-flight mark/release — disabled until it settles. */
  protected readonly pendingSets = signal<ReadonlySet<number>>(new Set());
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;


  constructor() {
    // Re-runs on an in-place venue switch: reset to the fresh-mount state, then load.
    effect(() => {
      const id = this.venueId();
      untracked(() => (id === undefined ? this.markInvalid() : this.resetForVenue()));
    });
    // Start the scanner once the panel is open AND its <video> exists (the fake needs no video).
    effect(() => {
      const open = this.scanOpen();
      const video = this.scanVideo()?.nativeElement;
      if (open) {
        untracked(() => this.startScanner(video));
      }
    });
    inject(DestroyRef).onDestroy(() => this.scanner.stop());
  }

  private startScanner(video: HTMLVideoElement | undefined): void {
    this.scanner.start(video, (payload) => this.onScanPayload(payload)).catch((error: unknown) => {
      this.closeScan();
      this.checkInNotice.set({ tone: 'error', text: cameraUnavailableMessage(error) });
    });
  }

  protected toggleScan(): void {
    if (this.scanOpen()) {
      this.closeScan();
      return;
    }
    this.checkInNotice.set(undefined);
    this.scanOpen.set(true);
  }

  private closeScan(): void {
    this.scanner.stop();
    this.scanOpen.set(false);
  }

  protected submitCode(input: HTMLInputElement): void {
    const code = codeFromScan(input.value);
    if (code === null) {
      this.checkInNotice.set({ tone: 'error', text: 'That doesn’t look like a booking code.' });
      return;
    }
    input.value = '';
    this.checkIn(code);
  }

  private onScanPayload(payload: string): void {
    this.closeScan();
    const code = codeFromScan(payload);
    if (code === null) {
      this.checkInNotice.set({ tone: 'error', text: 'That QR code isn’t a booking.' });
      return;
    }
    this.checkIn(code);
  }

  private checkIn(code: string): void {
    const venueId = this.venueId();
    if (venueId === undefined || this.checkInBusy()) {
      return;
    }
    this.checkInBusy.set(true);
    this.console.checkIn(venueId, code).subscribe({
      next: (result) => {
        this.checkInBusy.set(false);
        const label = setLabel(setsById(this.venue()?.sets), result.setId);
        this.checkInNotice.set({ tone: 'ok', text: `Checked in — ${label}.` });
        this.load();
      },
      error: (error: unknown) => {
        this.checkInBusy.set(false);
        this.dropSessionIfUnauthorized(error);
        this.checkInNotice.set({ tone: 'error', text: checkInMessage(error) });
      },
    });
  }

  private markInvalid(): void {
    this.loaded.set(true);
    this.loadError.set(true);
  }

  /** Drop every venue-scoped signal — grid, codes, optimistic/pending state — and load fresh, on
   *  today's date (the same state a full navigation would mount with). */
  private resetForVenue(): void {
    this.epoch++;
    this.closeScan();
    this.checkInBusy.set(false);
    this.checkInNotice.set(undefined);
    this.selectedDate.set(todayBookingDate(new Date()));
    this.overrides.set(new Map());
    this.pendingSets.set(new Set());
    this.notice.set(undefined);
    this.loadError.set(false);
    this.loaded.set(false);
    this.venue.set(undefined);
    this.bookings.set([]);
    this.states.set(undefined);
    this.load();
  }

  /** Sets grouped into rows (read order preserved) for the grid. */
  protected readonly rows = computed<readonly SetRow[]>(() =>
    groupSetsByRow(this.venue()?.sets ?? []),
  );

  /** The effective tile state per set id: optimistic override, else the server state token. */
  private readonly tileState = computed<ReadonlyMap<number, TileState>>(() =>
    deriveTileStates(this.venue()?.sets ?? [], this.states() ?? new Map(), this.overrides()),
  );

  /** The arrivals rows, each labelled with its set's position (else the raw set id). */
  protected readonly arrivals = computed<readonly ArrivalRow[]>(() => {
    const byId = setsById(this.venue()?.sets);
    return this.bookings().map((b) => ({
      setId: b.setId,
      code: b.code,
      label: setLabel(byId, b.setId),
      checkedIn: b.checkedIn,
    }));
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
    const venueId = this.venueId();
    if (venueId === undefined || this.isPending(set)) {
      return;
    }
    const epoch = this.epoch;
    const action = tileTapAction(this.stateOf(set));
    if (action === undefined) {
      return; // BOOKED_ONLINE — locked
    }
    const marking = action === 'mark';
    this.applyOverride(set.id, marking ? 'STAFF_MARKED' : 'FREE');
    const write = marking
      ? this.console.markSet(venueId, set.id, this.selectedDate())
      : this.console.releaseSet(venueId, set.id, this.selectedDate());
    write.subscribe({
      next: () => {
        if (this.epoch === epoch) {
          this.reconcile(set.id); // skip if a venue switch superseded this write (#180)
        }
      },
      error: (e: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this write (#180)
        }
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
    this.states.set(undefined);
    this.load();
  }

  /** Optimistically flip a tile and mark it pending. */
  private applyOverride(setId: number, state: TileState): void {
    this.notice.set(undefined);
    this.overrides.update((m) => new Map(m).set(setId, state));
    this.pendingSets.update((s) => new Set(s).add(setId));
  }

  /**
   * Re-read the map + bookings + states, then clear ONLY this set's settled override/pending — server
   * truth now wins for it. A global clear would wipe the in-flight optimistic state of a DIFFERENT tile
   * the operator tapped while this reload was outstanding (re-enabling it and duplicating its write).
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

  /** Fetch the map + bookings + availability states for the selected date; `onSettled` runs after ALL settle. */
  private load(onSettled?: () => void): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    const requested = this.selectedDate();
    const epoch = this.epoch;
    // Continuations re-check venue + date so a superseded venue/day never writes here.
    const current = (): boolean => this.epoch === epoch && this.selectedDate() === requested;
    const venue$ = this.venues.getVenueMap(venueId, requested).pipe(
      tap((v) => {
        if (current()) {
          this.venue.set(v);
          this.loadError.set(false);
        }
      }),
      catchError((error: unknown) => {
        // Wipe to the error card only when there is no grid to preserve (initial / date-change load).
        // A transient failure of a post-write reconcile keeps the working grid the operator is using.
        if (current() && this.venue() === undefined) {
          this.loadError.set(true);
        }
        this.dropSessionIfUnauthorized(error);
        return of(undefined);
      }),
    );
    const bookings$ = this.console.dailyBookings(venueId, requested).pipe(
      tap((b) => {
        if (current()) {
          this.bookings.set(b);
        }
      }),
      catchError((error: unknown) => {
        this.dropSessionIfUnauthorized(error);
        return of(undefined);
      }),
    );
    // A failed reconcile keeps the last consistent states, mirroring the venue read's degrade.
    const states$ = this.console.dailyAvailability(venueId, requested).pipe(
      tap((list) => {
        if (current()) {
          this.states.set(new Map(list.map((s) => [s.setId, s.state])));
        }
      }),
      catchError((error: unknown) => {
        this.dropSessionIfUnauthorized(error);
        return of(undefined);
      }),
    );
    // The join flips `loaded` only once ALL reads settle — no "0 of 0 free" flash.
    forkJoin([venue$, bookings$, states$]).subscribe(() => {
      if (current()) {
        // States still missing = their initial read failed: error card, never tiles without truth.
        if (this.states() === undefined) {
          this.loadError.set(true);
        }
        this.loaded.set(true);
      }
      onSettled?.();
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
    const tier = tierSentenceLabel(set.tier);
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

/** Why the camera didn't open, in operator terms — the browser's error name picks the guidance. */
function cameraUnavailableMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked for this site — allow it in the browser settings, or type the code.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found — type the code instead.';
    case 'NotReadableError':
      return 'The camera is in use by another app — close it, or type the code.';
    case 'NotSupportedError':
      return 'This browser can’t open the camera here — type the code instead.';
    default: {
      const suffix = name === undefined ? '' : ` (${name})`;
      return `Camera unavailable${suffix} — type the code instead.`;
    }
  }
}

/** The operator-facing message for a failed check-in; dates render like the rest of the console. */
function checkInMessage(error: unknown): string {
  switch (checkInErrorOf(error)) {
    case 'ALREADY_CHECKED_IN':
      return 'Already checked in — this code was used before.';
    case 'WRONG_SERVICE_DATE': {
      const date = checkInWrongDateOf(error);
      return date === undefined
        ? 'This booking is for a different day.'
        : `This booking is for ${date}.`;
    }
    case 'BOOKING_NOT_FOUND':
      return 'No booking with that code at this venue.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue.';
    case 'UNAUTHORIZED':
      return 'Your session expired — sign in again.';
    default:
      return 'Couldn’t check in. Try again.';
  }
}
