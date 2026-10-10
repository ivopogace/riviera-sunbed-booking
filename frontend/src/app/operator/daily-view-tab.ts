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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, tap } from 'rxjs';

import { TouchTarget } from '../shared/touch-target';
import { OperatorAuth, SESSION_EXPIRED_MESSAGE } from '../core/operator-auth';
import {
  HeldSetState,
  TileState,
  deriveTileStates,
  groupSetsByRow,
  tileTapAction,
} from '../shared/availability-grid';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { ConfirmPanel } from '../shared/confirm-panel';
import { focusMover } from '../shared/focus-after-render';
import { LoadAnnouncer } from '../shared/load-announcer';
import { MapSkeletonGrid } from '../shared/map-skeleton-grid';
import { SkeletonBlock } from '../shared/skeleton-block';
import { StatusChip } from '../shared/status-chip';
import { formatMoney, formatMoneyRange, MoneyView } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { formatCivilDate, todayBookingDate } from '../shared/booking-date';
import { formatStay } from '../shared/booking-date-label';
import { metaFor } from '../shared/booking-status';
import { plural } from '../shared/plural';
import { setLabel, setsById, tierSentenceLabel } from '../shared/set-label';
import { SetView, VenueMapView } from '../shared/venue-views';
import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from '../shared/beach-map-canvas';
import { AvailabilityChanges } from './availability-changes';
import {
  ConsoleDailyBooking,
  DayRefundErrorCode,
  MarkErrorCode,
  ReleaseErrorCode,
  VenueDayRefundResult,
  VenueProfileErrorCode,
  DayAttendance,
} from './operator-console.model';
import {
  OperatorConsoleService,
  checkInErrorOf,
  checkInSetIdOf,
  checkInWrongDateOf,
  dayRefundErrorOf,
  markErrorOf,
  releaseErrorOf,
  venueProfileErrorOf,
} from './operator-console.service';
import { QrScanner } from './qr-scanner';
import { codeFromScan } from './scan-input';
import { StayDayGroup, stayDayGroupOf } from './stay-day-group';
import { CheckIcon } from '../shared/check-icon';
import { DotIcon } from '../shared/dot-icon';

/**
 * One guest row: set label, display-only arrival code (invariant #7), the guest's span when the
 * stay is longer than the day (`span`, else `null`), where the stay stands on the day (`group`),
 * the chip announcing how the day resolved (`null` while still expected; the operator wording
 * "Checked in" is deliberately not `STATUS_META`'s tourist-facing "Completed"), and whether the
 * venue may still refund the day (`refundable`: neither attended nor already refunded, ADR-0027 §7).
 */
interface ArrivalRow {
  readonly setId: number;
  readonly code: string;
  readonly label: string;
  readonly span: string | null;
  readonly group: StayDayGroup;
  readonly chip: ArrivalChip | null;
  readonly refundable: boolean;
}

/** One of the guest list's groups on the day, in the order shown; an empty group is not rendered. */
interface GuestGroup {
  readonly key: StayDayGroup;
  readonly title: string;
  readonly testId: string;
  readonly rows: readonly ArrivalRow[];
}

const GUEST_GROUPS: readonly { key: StayDayGroup; title: string }[] = [
  { key: 'ARRIVING', title: 'Arriving' },
  { key: 'STAYING', title: 'Staying' },
  { key: 'LEAVING', title: 'Leaving' },
];

/** The settled-status badge: shared-directive modifier, operator wording, and its test hook. */
interface ArrivalChip {
  readonly modifier: string;
  readonly label: string;
  readonly testId: string;
}

/**
 * The badge per resolved day — the day's attendance, never the stay's outcome; an `EXPECTED` day shows
 * none. The modifier is read from `STATUS_META` (the one status→modifier map), so a rename there can't
 * silently drop this chip to the neutral fallback; a released day's badge is `RELEASED_CHIP` (ADR-0027).
 */
const ARRIVAL_CHIPS: Partial<Record<DayAttendance, ArrivalChip>> = {
  ATTENDED: {
    modifier: metaFor('COMPLETED').chip,
    label: 'Checked in',
    testId: 'arrival-checked-in',
  },
  MISSED: { modifier: metaFor('NO_SHOW').chip, label: 'No-show', testId: 'arrival-no-show' },
  REFUNDED: {
    modifier: metaFor('CANCELLED').chip,
    label: 'Day refunded',
    testId: 'arrival-day-refunded',
  },
};

const RELEASED_CHIP: ArrivalChip = {
  modifier: metaFor('CANCELLED').chip,
  label: 'Day released',
  testId: 'arrival-day-released',
};

function arrivalChipOf(b: ConsoleDailyBooking): ArrivalChip | null {
  if (b.attendance === 'REFUNDED' && b.released === true) {
    return RELEASED_CHIP;
  }
  return ARRIVAL_CHIPS[b.attendance] ?? null;
}

/** ADR-0027 §7: a day neither attended nor already refunded, on a booking that happened (every listed row did). */
function isRefundable(b: ConsoleDailyBooking): boolean {
  return b.attendance === 'EXPECTED' || b.attendance === 'MISSED';
}

/** One availability row on the shared canvas's row contract, plus the sets its tiles render. */
interface DailyRow extends BeachMapCanvasRow {
  readonly sets: readonly SetView[];
}

/** The check-in panel's announced outcome; tone drives the ink, the text carries the meaning. */
interface CheckInNotice {
  readonly tone: 'ok' | 'error';
  readonly text: string;
}

/**
 * The Daily view tab: sea-facing availability grid (tap FREE → walk-in mark, tap `STAFF_MARKED` →
 * release; `BOOKED_ONLINE`, unpaid holds included, is locked), Europe/Tirane date picker, and the
 * day's Arrivals with booking codes (invariant #7: shown for verification, never logged). Tile
 * state is an accessible name, not colour alone. Taps are optimistic, then map + bookings + states
 * are re-read so server truth wins. "Close today's online sales" sets the STANDING sales-close to
 * 00:01 (invariant #4; {@link OperatorConsoleService#closeOnlineSalesNow}), no per-day override.
 */
@Component({
  selector: 'app-daily-view-tab',
  imports: [
    CardGlass,
    LoadAnnouncer,
    BeachMapCanvas,
    BeachMapRowDef,
    SkeletonBlock,
    MapSkeletonGrid,
    StatusChip,
    BusyAction,
    TouchTarget,
    RouterLink,
    ConfirmPanel,
    CheckIcon,
    DotIcon,
  ],
  templateUrl: './daily-view-tab.html',
})
export class DailyViewTab {
  private readonly route = inject(ActivatedRoute);
  private readonly console = inject(OperatorConsoleService);
  private readonly changes = inject(AvailabilityChanges);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this tab manages, from the parent `/operator/:venueId` route — always a
   *  real one (`venueIdGuard` gates it) and reactive to in-place switches, which reuse this
   *  instance. */
  protected readonly venueId = parentVenueId(this.route);

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly bookings = signal<readonly ConsoleDailyBooking[]>([]);
  /** The day's per-set server states — the tile-classification authority; undefined until loaded. */
  private readonly states = signal<ReadonlyMap<number, HeldSetState> | undefined>(undefined);
  /** True once the initial load settles (success or failure) — drives the loading vs content state. */
  protected readonly loaded = signal(false);
  /** True when the initial venue read failed — shows an error (not a false "no sets" state). */
  protected readonly loadError = signal(false);

  /** The arrivals placeholder rows — its own constant, so the map's geometry cannot move them. */
  protected readonly skeletonArrivals = [1, 2, 3, 4] as const;
  /** A transient notice (e.g. a set was just taken by the other channel, or a write failed). */
  protected readonly notice = signal<string | undefined>(undefined);

  /** The day the view reflects (ISO YYYY-MM-DD); defaults to today in Europe/Tirane (invariant #6). */
  protected readonly selectedDate = signal(todayBookingDate(new Date()));

  /** Every confirm transition (the kill switch, a day refund) destroys the control just activated (WCAG 2.4.3). */
  private readonly focusAfterRender = focusMover();
  /** True while the amber "close today's online sales" confirm is open (two-step, no accidental close). */
  protected readonly closeSalesConfirm = signal(false);
  /** An in-flight close-sales GET→PATCH — gates the confirm so a double-tap cannot double-write. */
  protected readonly closeSalesBusy = signal(false);
  /** The kill switch targets today only — on any other date the sales window is not "now". */
  protected readonly selectedDateIsToday = computed(
    () => this.selectedDate() === todayBookingDate(new Date()),
  );
  /** Whether today's online sales are still open per the map read's per-request verdict. */
  protected readonly salesOpenToday = computed(() => this.venue()?.salesOpen !== false);
  /** The day-refund confirm's warning: a day still ahead is freed to sell; a past day keeps its claim (ADR-0027 §4). */
  protected readonly refundConfirmMessage = computed(() =>
    this.selectedDate() < todayBookingDate(new Date())
      ? 'The guest gets that day’s share back; the day has passed, so the set is not put back on sale. A one-day booking is cancelled and refunded in full. The amount is decided by the booking, and the guest is not told why.'
      : 'The guest gets that day’s share back and the set is free to sell again for the day; a one-day booking is cancelled and refunded in full. The amount is decided by the booking, and the guest is not told why.',
  );

  private readonly scanner = inject(QrScanner);
  /** The check-in scanner panel is open (camera live for the real adapter). */
  protected readonly scanOpen = signal(false);
  /** An in-flight check-in POST — gates the buttons so one scan cannot double-submit. */
  protected readonly checkInBusy = signal(false);
  /** The last check-in outcome, announced via the panel's status region. */
  protected readonly checkInNotice = signal<CheckInNotice | undefined>(undefined);
  protected readonly scanVideo = viewChild<ElementRef<HTMLVideoElement>>('scanVideo');

  /** The row whose venue day refund confirm is open (its code), one at a time; `undefined` when none. */
  protected readonly refundConfirmCode = signal<string | undefined>(undefined);
  /** An in-flight day-refund POST — gates the confirm so a double-tap cannot double-refund. */
  protected readonly refundBusy = signal(false);
  /** The last day-refund outcome, announced via the guest list's status region. */
  protected readonly refundNotice = signal<CheckInNotice | undefined>(undefined);

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
      this.venueId();
      untracked(() => this.resetForVenue());
    });
    // Start only once the panel is open AND its <video> exists — the first run precedes the render.
    effect(() => {
      const open = this.scanOpen();
      const video = this.scanVideo()?.nativeElement;
      if (open && video !== undefined) {
        untracked(() => this.startScanner(video));
      }
    });
    inject(DestroyRef).onDestroy(() => this.scanner.stop());
  }

  private startScanner(video: HTMLVideoElement | undefined): void {
    this.scanner
      .start(video, (payload) => this.onScanPayload(payload))
      .catch((error: unknown) => {
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
    if (this.checkInBusy()) {
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
        this.checkInNotice.set({
          tone: 'error',
          text: checkInMessage(error, setsById(this.venue()?.sets)),
        });
      },
    });
  }

  /** Drop every venue-scoped signal — grid, codes, optimistic/pending state — and load fresh, on
   *  today's date (the same state a full navigation would mount with). */
  private resetForVenue(): void {
    this.epoch++;
    this.closeScan();
    this.checkInBusy.set(false);
    this.checkInNotice.set(undefined);
    this.refundConfirmCode.set(undefined);
    this.refundBusy.set(false);
    this.refundNotice.set(undefined);
    this.closeSalesConfirm.set(false);
    this.closeSalesBusy.set(false);
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

  /** Sets grouped into rows (read order preserved), on the shared canvas's row contract. */
  protected readonly rows = computed<readonly DailyRow[]>(() => {
    const rows = groupSetsByRow(this.venue()?.sets ?? []);
    // A mixed-price row renders its min–max span, never just the first set's price.
    const prices = rows.map((r) => formatMoneyRange(r.sets.map((s) => s.price)));
    return rows.map((row, i) => ({
      code: row.label,
      priceLabel: prices[i],
      zoneStart: i === 0 || prices[i] !== prices[i - 1],
      tileCount: row.sets.length,
      sets: row.sets,
    }));
  });

  /** The effective tile state per set id: optimistic override, else the server state token. */
  private readonly tileState = computed<ReadonlyMap<number, TileState>>(() =>
    deriveTileStates(this.venue()?.sets ?? [], this.states() ?? new Map(), this.overrides()),
  );

  /** The guest rows, each labelled with its set's position (else the raw set id). */
  protected readonly arrivals = computed<readonly ArrivalRow[]>(() => {
    const byId = setsById(this.venue()?.sets);
    const date = this.selectedDate();
    return this.bookings().map((b) => ({
      setId: b.setId,
      code: b.code,
      label: setLabel(byId, b.setId),
      span: b.firstDate === b.lastDate ? null : formatStay(b.firstDate, b.lastDate),
      group: stayDayGroupOf(b.firstDate, b.lastDate, date),
      chip: arrivalChipOf(b),
      refundable: isRefundable(b),
    }));
  });

  /** Open the amber day-refund confirm under one row (two-step — the write is the confirm's job). */
  protected onRefundDay(row: ArrivalRow): void {
    this.refundNotice.set(undefined);
    this.refundConfirmCode.set(row.code);
  }

  protected onCancelRefund(): void {
    const code = this.refundConfirmCode();
    this.refundConfirmCode.set(undefined);
    if (code !== undefined) {
      this.focusAfterRender(`refund-day-${code}`, 'daily-refund-result');
    }
  }

  /**
   * Refund the open row's day for the venue's own reason (ADR-0027): the server picks the leg and the
   * amount (invariant #10); either outcome re-reads the day so the row's chip reconciles.
   */
  protected onConfirmRefund(): void {
    const venueId = this.venueId();
    const code = this.refundConfirmCode();
    if (code === undefined || this.refundBusy()) {
      return;
    }
    const epoch = this.epoch;
    const date = this.selectedDate();
    this.refundBusy.set(true);
    this.console.dayRefund(venueId, code, date).subscribe({
      next: (result) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this write's UI state
        }
        this.refundBusy.set(false);
        this.refundConfirmCode.set(undefined);
        this.refundNotice.set({
          tone: 'ok',
          text: dayRefundSuccessNotice(result, formatCivilDate(result.serviceDate)),
        });
        this.focusAfterRender('daily-refund-result');
        this.load();
      },
      error: (error: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this write's UI state
        }
        this.refundBusy.set(false);
        this.refundConfirmCode.set(undefined);
        this.dropSessionIfUnauthorized(error);
        this.refundNotice.set({
          tone: 'error',
          text: dayRefundFailureNotice(dayRefundErrorOf(error)),
        });
        this.focusAfterRender('daily-refund-result');
        this.load();
      },
    });
  }

  /** Arriving, staying, leaving — the non-empty groups in that order (design D4, story 30). */
  protected readonly guestGroups = computed<readonly GuestGroup[]>(() =>
    GUEST_GROUPS.map(({ key, title }) => ({
      key,
      title,
      testId: `daily-group-${key.toLowerCase()}`,
      rows: this.arrivals().filter((row) => row.group === key),
    })).filter((group) => group.rows.length > 0),
  );

  /**
   * "N guests not yet checked in today" — today only (story 31): a future day has no scans yet and a
   * past day is the sweep's; `null` when there is nothing to say.
   */
  protected readonly notCheckedInText = computed<string | null>(() => {
    if (!this.selectedDateIsToday()) {
      return null;
    }
    const pending = this.bookings().filter((b) => b.attendance === 'EXPECTED').length;
    return pending > 0 ? `${plural(pending, 'guest')} not yet checked in today.` : null;
  });

  protected readonly markedCount = computed(
    () => [...this.tileState().values()].filter((s) => s === 'STAFF_MARKED').length,
  );
  protected readonly freeCount = computed(
    () => [...this.tileState().values()].filter((s) => s === 'FREE').length,
  );
  protected readonly totalCount = computed(() => this.venue()?.sets.length ?? 0);

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
    if (this.isPending(set)) {
      return;
    }
    const epoch = this.epoch;
    const action = tileTapAction(this.stateOf(set));
    if (action === undefined) {
      return; // BOOKED_ONLINE — locked
    }
    const marking = action === 'mark';
    const date = this.selectedDate();
    this.applyOverride(set.id, marking ? 'STAFF_MARKED' : 'FREE');
    const write = marking
      ? this.console.markSet(venueId, set.id, date)
      : this.console.releaseSet(venueId, set.id, date);
    write.subscribe({
      next: () => {
        // The row changed server-side whatever this tab shows now: the strip and the shared map follow.
        this.changes.announce({ venueId, date });
        if (this.epoch === epoch) {
          this.reconcile(set.id); // skip if a venue switch superseded this write
        }
      },
      error: (e: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this write
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
    this.closeSalesConfirm.set(false);
    this.refundConfirmCode.set(undefined);
    this.refundNotice.set(undefined);
    this.loadError.set(false);
    this.loaded.set(false);
    this.venue.set(undefined);
    this.bookings.set([]);
    this.states.set(undefined);
    this.load();
  }

  /** Open the amber close-sales confirm (two-step — the write is the confirm's job). Focus-in is
   *  `app-confirm-panel`'s own job (WCAG 2.4.3); this only opens it. */
  protected onCloseSales(): void {
    this.notice.set(undefined);
    this.closeSalesConfirm.set(true);
  }

  protected onCancelCloseSales(): void {
    this.closeSalesConfirm.set(false);
    this.focusAfterRender('daily-close-sales');
  }

  /**
   * Close today's online sales via the STANDING setting (invariant #4; no per-day override). Either
   * outcome re-reads the day so the header reconciles with the map's `salesOpen`; a lost `STALE_WRITE`
   * race says try again rather than auto-retrying, so the operator sees what changed first.
   */
  protected onConfirmCloseSales(): void {
    const venueId = this.venueId();
    if (this.closeSalesBusy()) {
      return;
    }
    const epoch = this.epoch;
    this.closeSalesBusy.set(true);
    this.console.closeOnlineSalesNow(venueId).subscribe({
      next: () => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this write's UI state
        }
        this.closeSalesBusy.set(false);
        this.closeSalesConfirm.set(false);
        this.notice.set(
          'Online sales for today are closed. This stays in place for future days until you change it back in Venue & commodities.',
        );
        this.focusAfterRender('daily-notice');
        this.load();
      },
      error: (e: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this write's UI state
        }
        this.closeSalesBusy.set(false);
        this.closeSalesConfirm.set(false);
        const reason = venueProfileErrorOf(e);
        if (reason === 'UNAUTHORIZED') {
          this.operator.sessionLost();
        }
        this.notice.set(closeSalesFailureNotice(reason));
        this.focusAfterRender('daily-notice');
        this.load();
      },
    });
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

  /** Fetch the owner's map (today's) + the selected date's bookings and availability states; `onSettled` runs after ALL settle. */
  private load(onSettled?: () => void): void {
    const venueId = this.venueId();
    const requested = this.selectedDate();
    const epoch = this.epoch;
    // Continuations re-check venue + date so a superseded venue/day never writes here.
    const current = (): boolean => this.epoch === epoch && this.selectedDate() === requested;
    // The owner's read: the grid needs the layout only; tile states come from the dated availability read.
    const venue$ = this.console.beachMap(venueId).pipe(
      map((view) => view.map),
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

  /** The Tailwind background/ink classes for a tile of the given state (test-hooks: `.set-tile` + data-state). */
  protected tileClass(set: SetView): string {
    switch (this.stateOf(set)) {
      case 'STAFF_MARKED':
        return 'border-transparent bg-riv-solid-fill-brand text-white';
      case 'BOOKED_ONLINE':
        return 'border-riv-console-tint/15 bg-(image:--riv-walkin-hatch) text-riv-card-ink';
      default:
        return 'border-riv-console-tint/15 bg-riv-console-inset/85 text-riv-card-ink';
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

/** Map a close-sales failure to its operator-facing notice; a lost race asks for a re-try. */
function closeSalesFailureNotice(reason: VenueProfileErrorCode): string {
  switch (reason) {
    case 'STALE_WRITE':
      return 'Couldn’t close today’s sales — the venue was changed at the same time. Check the refreshed state and try again.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue, so you can’t close its sales.';
    case 'UNAUTHORIZED':
      return SESSION_EXPIRED_MESSAGE;
    default:
      return 'Couldn’t close today’s sales. Please try again.';
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

/**
 * The operator-facing message for a failed check-in; dates render like the rest of the console. A
 * repeat scan names today's set when the server carries it, so staff can still point a stay's guest
 * to the right lounger on a move day.
 */
function checkInMessage(error: unknown, sets: ReadonlyMap<number, SetView>): string {
  switch (checkInErrorOf(error)) {
    case 'ALREADY_CHECKED_IN': {
      const setId = checkInSetIdOf(error);
      return setId === undefined
        ? 'Already checked in today.'
        : `Already checked in today — ${setLabel(sets, setId)}.`;
    }
    case 'WRONG_SERVICE_DATE': {
      const date = checkInWrongDateOf(error);
      return date === undefined
        ? 'This booking is for a different day.'
        : `This booking is for ${date}.`;
    }
    case 'DAY_REFUNDED': {
      const setId = checkInSetIdOf(error);
      return setId === undefined
        ? 'Today was refunded for weather — the spot is still the guest’s, no check-in.'
        : `Today was refunded for weather — ${setLabel(sets, setId)} is still the guest’s, no check-in.`;
    }
    case 'DAY_RELEASED': {
      const setId = checkInSetIdOf(error);
      return setId === undefined
        ? 'Today was refunded by the venue and the spot released — no check-in.'
        : `Today was refunded by the venue and ${setLabel(sets, setId)} was released — no check-in.`;
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

/** The operator-facing notice for a venue day refund the server carried out (money in minor units, #5). */
function dayRefundSuccessNotice(result: VenueDayRefundResult, dateLabel: string): string {
  const amount = formatMoney({ minorUnits: result.refundMinor, currency: result.currency });
  if (result.kind === 'BOOKING_CANCELLED') {
    return `Booking cancelled and ${amount} refunded in full — the set is free again on ${dateLabel}.`;
  }
  return result.released
    ? `${dateLabel} refunded (${amount}) — the set is free again that day; the stay goes on.`
    : `${dateLabel} refunded (${amount}); the stay goes on.`;
}

/** Map a day-refund failure to its operator-facing notice (no nested ternaries). */
function dayRefundFailureNotice(reason: DayRefundErrorCode): string {
  switch (reason) {
    case 'DAY_ATTENDED':
      return 'The guest checked in that day — an attended day is not refunded.';
    case 'DAY_ALREADY_REFUNDED':
      return 'That day was already refunded.';
    case 'BOOKING_NOT_FOUND':
      return 'No booking with that code covers this day at this venue.';
    case 'NOT_VENUE_OWNER':
      return 'You don’t manage this venue.';
    case 'UNAUTHORIZED':
      return 'Your session expired — sign in again.';
    default:
      return 'Could not refund the day. Please try again.';
  }
}
