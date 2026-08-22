import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatMonthLabel,
  monthWeeks,
  startOfMonth,
  startOfWeek,
} from '../shared/booking-date';
import { DailyAvailability } from '../shared/venue-views';
import { TouchTarget } from '../shared/touch-target';
import { trapFocusWithin } from '../shared/focus-trap';
import {
  DAY_MEANING,
  DAY_SELECTED_CLASS,
  DAY_TINT_CLASS,
  DayAvailabilityState,
  dayAccessibleName,
  dayAvailabilityState,
  freeFraction,
} from './day-availability';
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
}

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
 * The venue page's date picker: a modal calendar carrying each day's free/total set count, so a
 * tourist sees which days are worth choosing before the pick commits.
 *
 * <p>The counts are a **snapshot, never a hold** (invariant #2, and the `CONTEXT.md` glossary): a
 * day showing free capacity can be full by the time a set is claimed, and only the claim decides.
 * Nothing here is phrased as bookable or reserved, and no count gates a later step of the flow.
 * `total` spans both pools, so it answers "how busy is this day", not "how many can I book".
 *
 * <p>Today and every past day render but cannot be chosen (invariant #4, display only — the server
 * stays authoritative for the real cutoff). The endpoint answers them, because it reports
 * availability rather than bookability, so the exclusion is entirely this component's job.
 *
 * <p>Focus, not selection, drives the visible month: {@link focusedDate} is the roving-tabindex
 * position and the month is computed from it, so an arrow key that crosses a month boundary and a
 * PageDown are the same operation with the same refetch.
 */
@Component({
  selector: 'app-availability-calendar',
  imports: [TouchTarget],
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

  /** The day the map is currently showing — rendered as selected, and where the picker opens. */
  readonly selectedDate = input.required<string>();

  /** The earliest day that can be chosen (tomorrow in `Europe/Tirane`). */
  readonly minDate = input.required<string>();

  readonly chosen = output<string>();
  readonly dismissed = output<void>();

  protected readonly weekdays = WEEKDAYS;

  private readonly venues = inject(VenueService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The roving-tabindex position. Arrow keys move it; only Enter/Space/click commits a choice. */
  private readonly focusedDate = linkedSignal(() =>
    this.selectedDate() < this.minDate() ? this.minDate() : this.selectedDate(),
  );

  private readonly counts = signal<ReadonlyMap<string, DailyAvailability>>(new Map());
  protected readonly countsFailed = signal(false);
  private epoch = 0;

  protected readonly visibleMonth = computed(() => startOfMonth(this.focusedDate()));
  protected readonly monthLabel = computed(() => formatMonthLabel(this.visibleMonth()));

  /** Whether a step back would land before the month holding the earliest bookable day. */
  protected readonly atEarliestMonth = computed(
    () => this.visibleMonth() <= startOfMonth(this.minDate()),
  );

  protected readonly weeks = computed<readonly (CalendarCell | undefined)[][]>(() => {
    const counts = this.counts();
    const minDate = this.minDate();
    const selected = this.selectedDate();
    const focused = this.focusedDate();
    return monthWeeks(this.visibleMonth()).map((week) =>
      week.map((iso) => {
        if (iso === undefined) {
          return undefined;
        }
        const day = counts.get(iso);
        const selectable = iso >= minDate;
        const state = selectable ? dayAvailabilityState(day) : 'unknown';
        return {
          iso,
          dayOfMonth: Number(iso.slice(8)),
          state,
          tint: iso === selected ? DAY_SELECTED_CLASS : DAY_TINT_CLASS[state],
          barPercent: `${Math.round(freeFraction(selectable ? day : undefined) * 100)}%`,
          name: dayAccessibleName(iso, day, selectable),
          selectable,
          selected: iso === selected,
          focused: iso === focused,
        };
      }),
    );
  });

  constructor() {
    effect(() => this.fetchMonth(this.venueId(), this.visibleMonth()));
    afterRenderEffect({
      write: () => {
        const focused = this.focusedDate();
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
    this.focusedDate.set(addMonths(this.focusedDate(), months));
  }

  /**
   * Roving-tabindex movement. The handler is bound on each cell rather than the grid, because a
   * keydown on a non-focusable wrapper is an `interactive-supports-focus` violation
   * (`shared/segmented-control.ts`). `Enter` and `Space` are deliberately absent: the cell is a real
   * `<button>`, so they fire its click and reach {@link choose} natively.
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
    this.focusedDate.set(next);
  }

  /** Commit a day, ignoring one that cannot be booked — the aria-disabled cells still take clicks. */
  protected choose(cell: CalendarCell): void {
    if (cell.selectable) {
      this.chosen.emit(cell.iso);
    }
  }

  /** Keep keyboard focus inside the dialog (WCAG 2.4.3 / 2.1.2) — shared trap. */
  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }

  /** The legend phrase for a state, so the tint is explained in words as well as colour. */
  protected legend(state: DayAvailabilityState): string {
    return DAY_MEANING[state].legend;
  }

  /**
   * Read one month's counts. The window is the month's own inclusive bounds, so it is 31 days at
   * most and the server's 62-day cap is out of reach however far the user navigates.
   *
   * <p>Each dispatch carries a generation, and a response from a superseded one is dropped — month
   * navigation races exactly as the map's date changes do (`venue-map.ts`'s `epoch` guard).
   */
  private fetchMonth(venueId: number, month: string): void {
    const generation = ++this.epoch;
    this.venues.availabilityCalendar(venueId, month, endOfMonth(month)).subscribe({
      next: (days) => {
        if (this.epoch !== generation) {
          return;
        }
        this.countsFailed.set(false);
        this.counts.set(new Map(days.map((day) => [day.date, day])));
      },
      error: () => {
        if (this.epoch !== generation) {
          return;
        }
        this.countsFailed.set(true);
        this.counts.set(new Map());
      },
    });
  }
}
