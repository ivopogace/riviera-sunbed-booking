import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

import { DateRange } from '../shared/booking-date';
import { formatBookingDate, formatStay } from '../shared/booking-date-label';
import { trapFocusWithin } from '../shared/focus-trap';
import { plural } from '../shared/plural';
import { RetryButton } from '../shared/retry-button';
import { spotLabel } from '../shared/set-label';
import { TouchTarget } from '../shared/touch-target';
import { SetView } from '../shared/venue-views';
import { freeDaysOf, longestFreeRun, stayDays } from './stay-runs';

/**
 * What a tapped partly-free set covers of the tourist's stay: each day named free or taken, and the
 * longest run of days the set can host, offered as a shorter stay on this very spot. A modal like
 * the availability calendar (a real `<dialog open>`, the shared focus trap, Escape and the scrim to
 * dismiss). It books nothing: accepting the offer only asks the page for the shorter days.
 */
@Component({
  selector: 'app-partly-free-sheet',
  imports: [TouchTarget, RetryButton],
  host: {
    class:
      'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(6,30,40,0.35)] px-4 py-10',
    '(click)': 'dismissed.emit()',
    '(keydown.escape)': 'dismissed.emit()',
  },
  template: `
    <dialog
      open
      tabindex="-1"
      class="static m-0 w-full max-w-[352px] animate-[riv-pop_0.2s_ease] rounded-[22px] border border-riv-pop-border bg-riv-pop-surface p-4 text-riv-pop-ink shadow-riv-pop backdrop-blur-[28px] backdrop-saturate-[1.8] motion-reduce:animate-none"
      aria-modal="true"
      aria-labelledby="partly-free-title"
      data-testid="partly-free-sheet"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <h2 id="partly-free-title" class="text-[17px] font-bold tracking-[-0.01em]">
        {{ title() }}
      </h2>
      <ul class="mt-3 flex list-none flex-col gap-1 text-[13.5px]" data-testid="partly-free-days">
        @for (day of days(); track day.iso) {
          <li
            class="flex items-center justify-between rounded-[8px] px-2 py-1"
            [class.bg-riv-pop-hover]="day.free"
            [attr.data-free]="day.free"
          >
            <span>{{ day.label }}</span>
            <span class="font-bold" [class.text-riv-pop-ink-soft]="!day.free">{{
              day.free ? 'free' : 'taken'
            }}</span>
          </li>
        }
      </ul>
      @if (run(); as run) {
        <p
          class="mt-3 text-[13px] leading-[1.4] text-riv-pop-ink-soft"
          data-testid="partly-free-run"
        >
          The longest this spot can host you is {{ runLabel() }}.
        </p>
        <div class="mt-3 flex justify-center">
          <app-retry-button
            testId="shorten-stay"
            [label]="'Shorten my stay to ' + runLabel()"
            (retry)="shorten.emit({ first: run.first, last: run.last })"
          />
        </div>
      }
      <button
        appTouchTarget
        type="button"
        class="mt-2 w-full cursor-pointer rounded-[14px] px-4 py-2.5 text-[14px] font-bold text-riv-calendar-accent hover:bg-riv-pop-hover"
        data-testid="keep-dates"
        (click)="dismissed.emit()"
      >
        Keep my dates
      </button>
    </dialog>
  `,
})
export class PartlyFreeSheet {
  readonly set = input.required<SetView>();
  /** The first and last day of the stay the map is showing. */
  readonly first = input.required<string>();
  readonly last = input.required<string>();

  /** The shorter stay the tourist accepted — the page re-reads the map for it and books this set. */
  readonly shorten = output<DateRange>();
  readonly dismissed = output<void>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly days = computed(() => {
    const taken = new Set(this.set().takenDates ?? []);
    return stayDays(this.first(), this.last()).map((iso) => ({
      iso,
      label: formatBookingDate(iso),
      free: !taken.has(iso),
    }));
  });

  protected readonly title = computed(() => {
    const set = this.set();
    const total = this.days().length;
    return `${spotLabel(set.rowLabel, set.positionNo)} is free ${freeDaysOf(set, total)} of ${plural(total, 'day')}`;
  });

  protected readonly run = computed(() =>
    longestFreeRun(this.set().takenDates ?? [], this.first(), this.last()),
  );

  protected readonly runLabel = computed(() => {
    const run = this.run();
    return run === undefined ? '' : formatStay(run.first, run.last);
  });

  constructor() {
    afterNextRender(() => {
      this.hostRef.nativeElement
        .querySelector<HTMLElement>('[data-testid="shorten-stay"], [data-testid="keep-dates"]')
        ?.focus();
    });
  }

  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }
}
