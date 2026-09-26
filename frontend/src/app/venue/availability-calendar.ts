import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  DateRange,
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatCivilDate,
  formatMonthLabel,
  monthWeeks,
  startOfMonth,
  startOfWeek,
} from '../shared/booking-date';
import { DailyAvailability } from '../shared/venue-views';
import { LoadAnnouncer } from '../shared/load-announcer';
import { SegmentedControl, SegmentedOption } from '../shared/segmented-control';
import { TouchTarget } from '../shared/touch-target';
import { trapFocusWithin } from '../shared/focus-trap';
import {
  DAY_SELECTED_CLASS,
  DAY_TINT_CLASS,
  DayAvailabilityState,
  dayAccessibleName,
  dayAvailabilityState,
  freeFraction,
} from './day-availability';
import { stayRule } from './stay-rule';
import { VenueService } from './venue.service';

/** One rendered day, or `undefined` for a grid position outside the visible month. */
export interface CalendarCell {
  readonly iso: string;
  readonly dayOfMonth: number;
  readonly state: DayAvailabilityState;
  readonly tint: string;
  readonly barPercent: string;
  readonly name: string;
  readonly selectable: boolean;
  readonly selected: boolean;
  readonly focused: boolean;
  /** Whether the capacity bar is drawn — see {@link AvailabilityCalendar.weeks}. */
  readonly showsBar: boolean;
}

/** One day at a time, or a stay of several days picked as a first and a last day. */
export type StayMode = 'day' | 'stay';

/**
 * The widest stay the picker offers, the server's own ceiling on a map read and a reserve (`StaySpan`
 * on the backend) — a technical bound, not a venue's stay cap.
 */
export const MAX_STAY_DAYS = 62;

const MODE_OPTIONS: readonly SegmentedOption<StayMode>[] = [
  { value: 'day', label: 'One day', testId: 'calendar-mode-day' },
  { value: 'stay', label: 'Several days', testId: 'calendar-mode-stay' },
];

/** Monday-first column headers: the abbreviation shown, and the day it stands for. */
const WEEKDAYS: readonly { readonly short: string; readonly long: string }[] = [
  { short: 'Mo', long: 'Monday' },
  { short: 'Tu', long: 'Tuesday' },
  { short: 'We', long: 'Wednesday' },
  { short: 'Th', long: 'Thursday' },
  { short: 'Fr', long: 'Friday' },
  { short: 'Sa', long: 'Saturday' },
  { short: 'Su', long: 'Sunday' },
];

/**
 * The venue page's modal date picker, each day with its free/total set count — a **snapshot, never
 * a hold** (invariant #2): phrase nothing as bookable and gate no later step on it; `total` spans
 * both pools. Past days (this component's floor), `salesOpen: false` days and, in stay mode, days
 * past the stay ceiling can't be chosen: display only, the server decides (invariant #4). Focus,
 * not selection, drives the month: {@link focusedDate} is the roving stop, so an arrow across a
 * month and a PageDown are one operation with one refetch.
 */
@Component({
  selector: 'app-availability-calendar',
  imports: [TouchTarget, LoadAnnouncer, SegmentedControl],
  templateUrl: './availability-calendar.html',
  host: {
    class:
      'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(6,30,40,0.35)] px-4 py-10',
    '(click)': 'dismissed.emit()',
    '(keydown.escape)': 'dismissed.emit()',
  },
})
export class AvailabilityCalendar {
  readonly venueId = input.required<number>();

  /** The first day the map is currently showing — rendered as selected, and where the picker opens. */
  readonly selectedDate = input.required<string>();

  /** The last day the map is showing when it shows a stay; absent or equal to the first for one day. */
  readonly selectedLastDate = input<string | undefined>(undefined);

  /** The earliest day that can be chosen — today in `Europe/Tirane`, sales close on the day itself. */
  readonly minDate = input.required<string>();

  /** Whether a stay of several days may be picked here — an Instant venue's page says yes. */
  readonly rangeAllowed = input(false);

  /** The venue's maximum stay in days; `null` or absent means any length this season. */
  readonly maxStayDays = input<number | null | undefined>(undefined);

  /** The chosen days; `first === last` for one day, which is every pick in day mode. */
  readonly chosen = output<DateRange>();
  readonly dismissed = output<void>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly modeOptions = MODE_OPTIONS;

  /**
   * Day mode is the one-tap pick the picker always had; stay mode takes a first and a last tap. It
   * opens in stay mode only when the map already shows a stay, and never where a range is not
   * allowed.
   */
  protected readonly mode = linkedSignal<StayMode>(() =>
    this.rangeAllowed() && this.showsStay() ? 'stay' : 'day',
  );

  /** In stay mode, the first day tapped while the last is still to come. */
  protected readonly pendingFirst = signal<string | undefined>(undefined);

  /** The most days a stay may run: the venue's maximum where it has one, else {@link MAX_STAY_DAYS}. */
  private readonly ceilingDays = computed(() => {
    const max = this.maxStayDays();
    return max != null && max < MAX_STAY_DAYS ? max : MAX_STAY_DAYS;
  });

  /** The last day the stay may run to once a first day is tapped — {@link ceilingDays} in all. */
  private readonly lastDayCeiling = computed(() => {
    const first = this.pendingFirst();
    return first === undefined ? undefined : addDays(first, this.ceilingDays() - 1);
  });

  /** The venue's stay rule, stated beside the stay-mode hint. */
  protected readonly stayRule = computed(() => stayRule(this.maxStayDays()));

  /** What the stay mode asks for next. */
  protected readonly stayHint = computed(() => {
    const first = this.pendingFirst();
    return first === undefined
      ? 'Tap your first day, then your last.'
      : `${formatCivilDate(first)} → tap your last day`;
  });

  private showsStay(): boolean {
    const last = this.selectedLastDate();
    return last !== undefined && last !== this.selectedDate();
  }

  private readonly venues = inject(VenueService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The roving-tabindex position (arrows move it; only Enter/Space/click commits). Opens on the
   * chosen day, else the floor if that is past; a chosen day the server marks unsellable stays the
   * stop — a season closure may leave no bookable day to fall to, and the month must not jump.
   */
  private readonly focusedDate = linkedSignal(() => {
    const selected = this.selectedDate();
    return this.isBookable(selected) ? selected : this.minDate();
  });

  /**
   * Bumped whenever focus should follow {@link focusedDate} into the grid: by keyboard moves inside
   * it, never by the month BUTTONS — focus stays on the button so a second press steps again (the
   * APG date picker).
   */
  private readonly focusRequest = signal(1);

  private readonly counts = signal<ReadonlyMap<string, DailyAvailability>>(new Map());
  protected readonly countsFailed = signal(false);
  protected readonly countsLoading = signal(true);
  private readonly destroyRef = inject(DestroyRef);
  private epoch = 0;

  protected readonly visibleMonth = computed(() => startOfMonth(this.focusedDate()));
  protected readonly monthLabel = computed(() => formatMonthLabel(this.visibleMonth()));

  /** Whether a step back would land before the month holding the earliest bookable day. */
  protected readonly atEarliestMonth = computed(
    () => this.visibleMonth() <= startOfMonth(this.minDate()),
  );

  /** Whether `iso` is a day this venue can still be booked for (invariant #4, display side). */
  private isBookable(iso: string): boolean {
    return iso >= this.minDate();
  }

  /** The days drawn as selected: a pending first day alone, else the stay the map shows. */
  private readonly highlightedRange = computed<DateRange>(() => {
    const pending = this.pendingFirst();
    if (pending !== undefined) {
      return { first: pending, last: pending };
    }
    const first = this.selectedDate();
    return { first, last: this.selectedLastDate() ?? first };
  });

  protected readonly weeks = computed<readonly (CalendarCell | undefined)[][]>(() => {
    const counts = this.counts();
    const highlighted = this.highlightedRange();
    const ceiling = this.lastDayCeiling();
    const focused = this.focusedDate();
    return monthWeeks(this.visibleMonth()).map((week) =>
      week.map((iso) => {
        if (iso === undefined) {
          return undefined;
        }
        const day = counts.get(iso);
        // The server's verdict outranks the client floor, and the stay ceiling caps a last day.
        const selectable =
          this.isBookable(iso) &&
          day?.salesOpen !== false &&
          (ceiling === undefined || iso <= ceiling);
        const state = selectable ? dayAvailabilityState(day) : 'unknown';
        const isSelected = iso >= highlighted.first && iso <= highlighted.last;
        return {
          iso,
          dayOfMonth: Number(iso.slice(8)),
          state,
          tint: [DAY_TINT_CLASS[state], isSelected ? DAY_SELECTED_CLASS : ''].join(' ').trim(),
          barPercent: `${Math.round(freeFraction(selectable ? day : undefined) * 100)}%`,
          name: dayAccessibleName(iso, day, selectable, isSelected),
          selectable,
          selected: isSelected,
          focused: iso === focused,
          showsBar: selectable && state !== 'unknown',
        };
      }),
    );
  });

  constructor() {
    effect(() => this.fetchMonth(this.venueId(), this.visibleMonth()));
    afterRenderEffect({
      write: () => {
        this.focusRequest();
        const focused = untracked(() => this.focusedDate());
        this.hostRef.nativeElement
          .querySelector<HTMLElement>(`button[data-date="${focused}"]`)
          ?.focus();
      },
    });
  }

  /** Move the visible month by `months`, refusing a step that would leave the bookable range. */
  protected stepMonth(months: number): void {
    if (months < 0 && this.atEarliestMonth()) {
      return;
    }
    const target = addMonths(this.focusedDate(), months);
    const floor = startOfMonth(this.minDate());
    this.focusedDate.set(target < floor ? floor : target);
  }

  /**
   * Roving-tabindex movement, bound per cell: a keydown on the non-focusable grid wrapper fails
   * `interactive-supports-focus`. No `Enter`/`Space`: the cell is a real `<button>`, so they reach
   * {@link choose} natively.
   */
  protected onDayKeydown(event: KeyboardEvent, iso: string): void {
    let next: string;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(iso, -1);
        break;
      case 'ArrowRight':
        next = addDays(iso, 1);
        break;
      case 'ArrowUp':
        next = addDays(iso, -7);
        break;
      case 'ArrowDown':
        next = addDays(iso, 7);
        break;
      case 'Home':
        next = startOfWeek(iso);
        break;
      case 'End':
        next = endOfWeek(iso);
        break;
      case 'PageUp':
        next = addMonths(iso, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(iso, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    this.moveFocusTo(next);
  }

  /**
   * Move the roving position AND focus (the keyboard's move). Clamped to the earliest month
   * "Previous month" reaches, so an arrow key never walks past a button that says it is unavailable
   * (firing a request per month on the way).
   */
  private moveFocusTo(date: string): void {
    const floor = startOfMonth(this.minDate());
    this.focusedDate.set(date < floor ? floor : date);
    this.focusRequest.update((request) => request + 1);
  }

  /**
   * Commit a day, ignoring one that cannot be booked — the aria-disabled cells still take clicks.
   * In stay mode the first tap only remembers the first day; a tap on an earlier day restarts there;
   * the tap on or after it commits the range.
   */
  protected choose(cell: CalendarCell): void {
    if (!cell.selectable) {
      return;
    }
    if (this.mode() === 'day') {
      this.chosen.emit({ first: cell.iso, last: cell.iso });
      return;
    }
    const first = this.pendingFirst();
    if (first === undefined || cell.iso < first) {
      this.pendingFirst.set(cell.iso);
      return;
    }
    this.pendingFirst.set(undefined);
    this.chosen.emit({ first, last: cell.iso });
  }

  /** Switching modes forgets a half-picked stay. */
  protected onModeChange(mode: StayMode): void {
    this.mode.set(mode);
    this.pendingFirst.set(undefined);
  }

  /** Commit the pending first day as a one-day pick. */
  protected justThisDay(): void {
    const first = this.pendingFirst();
    if (first !== undefined) {
      this.pendingFirst.set(undefined);
      this.chosen.emit({ first, last: first });
    }
  }

  /** Keep keyboard focus inside the dialog (WCAG 2.4.3 / 2.1.2) — shared trap. */
  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }

  /**
   * Read one month's counts (≤ 31 days, inside the server's 62-day cap). A superseded dispatch's
   * response is dropped (the `epoch` guard, as in `venue-map.ts`); counts and failure clear at
   * dispatch, so a slow month never shows the last one's numbers or a stale failure.
   */
  private fetchMonth(venueId: number, month: string): void {
    const generation = ++this.epoch;
    this.countsLoading.set(true);
    this.countsFailed.set(false);
    this.counts.set(new Map());
    this.venues
      .availabilityCalendar(venueId, month, endOfMonth(month))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (days) => {
          if (this.epoch !== generation) {
            return;
          }
          this.countsLoading.set(false);
          this.counts.set(new Map(days.map((day) => [day.date, day])));
        },
        error: () => {
          if (this.epoch !== generation) {
            return;
          }
          this.countsLoading.set(false);
          this.countsFailed.set(true);
        },
      });
  }
}
