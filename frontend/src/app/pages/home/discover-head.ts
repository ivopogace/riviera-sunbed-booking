import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';

import { addDays } from '../../shared/booking-date';
import { formatBookingDate } from '../../shared/booking-date-label';
import { focusMover } from '../../shared/focus-after-render';
import { TouchTarget } from '../../shared/touch-target';

/** One beach of the focused region, as the beach rail offers it. */
export interface BeachOption {
  readonly code: string;
  readonly label: string;
  /** Venues on it in the current list. */
  readonly count: number;
}

/** The week the day rail offers: today and the six days after it. */
const DAYS_SHOWN = 7;

/**
 * A rail enters from a little above and transparent (`starting:`), and leaves back the same
 * way, held by `animate.leave` until its transition ends; both under `motion-safe`.
 */
const RAIL =
  'flex gap-1.5 overflow-x-auto px-3 pt-1 pb-2 scrollbar-none starting:-translate-y-1 starting:opacity-0 ' +
  'motion-safe:[transition:opacity_0.18s_ease,translate_0.18s_ease]';
const RAIL_LEAVE = 'opacity-0 -translate-y-1';

/**
 * A chip in the field skin, lit as the accent pair when `aria-current`. The `group` lets the
 * count disc invert with it.
 */
const CHIP =
  'inline-flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-[13px] text-[14px] font-semibold ' +
  'border-riv-field-border bg-riv-field-fill text-riv-card-ink ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'aria-[current]:border-riv-accent-ink aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink';
const COUNT =
  'inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold ' +
  'bg-riv-accent-ink text-riv-on-accent-ink group-aria-[current]:bg-riv-on-accent-ink group-aria-[current]:text-riv-accent-ink';

/**
 * The venue sheet's head: **one 44 px row carrying the query** — the place (a press opens the
 * coast picker) over the selling line (`8 of 11 selling today`, invariant #4 as the map's light),
 * the region's beaches gathered into one chip (`⛱ 6`, spelled out `⛱ All beaches 6 ▾` where the
 * sheet is wide, lit with the beach's own count when one is chosen), and the day (`Today ▾`).
 *
 * <p>A press on either chip opens its rail of chips under the row, with the lit chip scrolled
 * into view, and a pick closes it. The rails are hidden at peek — the head is the one row there —
 * so a press then asks the page for the sheet first (`railOpened`) and the rail shows once the
 * rails are. The answer to Near me when it is not a position stands in the same rail slot, off
 * the map, until dismissed.
 *
 * <p>The words are the page's: title, subtitle and the beaches come in as inputs, and every
 * choice goes out as an output. The head keeps only which rail is open.
 */
@Component({
  selector: 'app-discover-head',
  imports: [TouchTarget],
  host: { class: 'block' },
  template: `
    <div class="flex h-11 items-center gap-2 px-3">
      <button
        type="button"
        appTouchTarget
        data-testid="head-place"
        class="flex min-w-0 flex-1 touch-manipulation items-center gap-2 rounded-[12px] px-1.5 text-left"
        [attr.aria-expanded]="pickerOpen()"
        (click)="placePressed.emit()"
      >
        @if (located()) {
          <span
            data-testid="head-located"
            class="text-[19px] leading-none text-riv-accent-ink"
            aria-hidden="true"
            >◎</span
          >
        }
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-[19px] leading-[1.1] font-bold tracking-[-0.01em] text-riv-ink"
            ><span data-testid="head-title">{{ title() }}</span
            >&ngsp;<span class="text-[13px] font-normal text-riv-ink-faint" aria-hidden="true"
              >▾</span
            ></span
          >
          <span
            data-testid="head-subtitle"
            class="truncate text-[12.5px] leading-[1.25] text-riv-ink-soft"
            >{{ subtitle() }}</span
          >
        </span>
      </button>
      <button
        type="button"
        appTouchTarget
        data-testid="head-beaches"
        [class]="CHIP + ' group px-[11px]'"
        [attr.aria-current]="beach() !== '' ? 'true' : null"
        [attr.aria-expanded]="beachesOpen()"
        [attr.aria-label]="beachChipLabel()"
        (click)="toggleBeaches()"
      >
        <span aria-hidden="true">⛱</span>&ngsp;
        @if (spelled()) {
          {{ chipWord() }}&ngsp;
        }
        <span [class]="COUNT">{{ chipCount() }}</span>
        @if (spelled()) {
          &ngsp;<span class="text-[11px] opacity-70" aria-hidden="true">▾</span>
        }
      </button>
      <button
        type="button"
        appTouchTarget
        data-testid="head-day"
        [class]="CHIP + ' px-3'"
        [attr.aria-expanded]="dayOpen()"
        (click)="toggleDay()"
      >
        {{ dayWord() }}&ngsp;<span class="text-[11px] text-riv-card-ink-faint" aria-hidden="true"
          >▾</span
        >
      </button>
    </div>
    @if (railsShown()) {
      @if (dayOpen()) {
        <div [class]="RAIL" [animate.leave]="RAIL_LEAVE" role="group" aria-label="Day">
          @for (day of days(); track day.date) {
            <button
              type="button"
              appTouchTarget
              [class]="CHIP"
              [attr.aria-current]="day.date === date() ? 'true' : null"
              (click)="pickDay(day.date)"
            >
              {{ day.label }}
            </button>
          }
        </div>
      } @else if (beachesOpen()) {
        <div [class]="RAIL" [animate.leave]="RAIL_LEAVE" role="group" aria-label="Beach">
          <button
            type="button"
            appTouchTarget
            [class]="CHIP + ' group'"
            [attr.aria-current]="beach() === '' ? 'true' : null"
            (click)="pickBeach('')"
          >
            All&ngsp;<span [class]="COUNT">{{ regionCount() }}</span>
          </button>
          @for (option of beaches(); track option.code) {
            <button
              type="button"
              appTouchTarget
              [class]="CHIP + ' group'"
              [attr.aria-current]="beach() === option.code ? 'true' : null"
              (click)="pickBeach(option.code)"
            >
              {{ option.label }}&ngsp;<span [class]="COUNT">{{ option.count }}</span>
            </button>
          }
        </div>
      } @else if (note(); as words) {
        <!-- The answer to Near me when it is not a position: the map's own words, in the rail's slot, off the map. -->
        <div [class]="RAIL + ' items-center'" [animate.leave]="RAIL_LEAVE">
          <p
            role="alert"
            data-testid="head-note"
            class="min-w-0 flex-1 text-[13px] leading-[1.4] text-riv-ink-soft"
          >
            {{ words }}
          </p>
          <button
            type="button"
            appTouchTarget
            data-testid="head-note-dismiss"
            aria-label="Dismiss message"
            class="inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full text-[19px] leading-none text-riv-ink-soft"
            (click)="noteDismissed.emit()"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      }
    }
  `,
})
export class DiscoverHead {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly moveFocus = focusMover();

  protected readonly CHIP = CHIP;
  protected readonly COUNT = COUNT;
  protected readonly RAIL = RAIL;
  protected readonly RAIL_LEAVE = RAIL_LEAVE;

  /** The place as the tourist reads it: the beach, the region, or where they stand. */
  readonly title = input.required<string>();
  /** The selling line under the place. */
  readonly subtitle = input.required<string>();
  /** The tourist is placed on the riviera: the accent glyph carries it, nothing is repeated. */
  readonly located = input(false);
  /** The focused region's beaches with a venue, in coast order. */
  readonly beaches = input.required<readonly BeachOption[]>();
  /** The chosen beach's code, `''` for the whole region. */
  readonly beach = input('');
  /** Spell the beach chip out (`⛱ All beaches 6 ▾`): the sheet is wide enough for the words. */
  readonly spelled = input(false);
  /** Today in Europe/Tirane, ISO — the page's clock, never this component's. */
  readonly today = input.required<string>();
  /** The day the list is counted for, ISO. */
  readonly date = input.required<string>();
  /** The rails have room to open: false at peek, where the head is the one row. */
  readonly railsShown = input(true);
  /** The Near me answer standing in the rail slot, or `null`. */
  readonly note = input<string | null>(null);
  /** Whether the coast picker the place opens is open, for the place's `aria-expanded`. */
  readonly pickerOpen = input(false);

  readonly placePressed = output<void>();
  readonly beachPicked = output<string>();
  readonly dayPicked = output<string>();
  readonly noteDismissed = output<void>();
  /** A rail was asked for: at peek the page raises the sheet so the rail has room. */
  readonly railOpened = output<void>();

  protected readonly dayOpen = signal(false);
  protected readonly beachesOpen = signal(false);

  private readonly chosen = computed(() =>
    this.beaches().find((option) => option.code === this.beach()),
  );
  /** Venues in the whole region, the `All` chip's count. */
  protected readonly regionCount = computed(() =>
    this.beaches().reduce((sum, option) => sum + option.count, 0),
  );
  /** The region's beaches, or the chosen beach's own venues once one is lit. */
  protected readonly chipCount = computed(() => this.chosen()?.count ?? this.beaches().length);
  protected readonly chipWord = computed(() => this.chosen()?.label ?? 'All beaches');
  protected readonly beachChipLabel = computed(() => {
    const chosen = this.chosen();
    return chosen === undefined
      ? `All ${this.beaches().length} beaches: choose one`
      : `${chosen.label}: change the beach`;
  });

  protected readonly days = computed(() =>
    Array.from({ length: DAYS_SHOWN }, (_, offset) => {
      const date = addDays(this.today(), offset);
      return { date, label: this.dayLabel(date) };
    }),
  );
  protected readonly dayWord = computed(() => this.dayLabel(this.date()));

  /** Today, Tomorrow, then the weekday and day — the way a tourist says it. */
  private dayLabel(date: string): string {
    if (date === this.today()) {
      return 'Today';
    }
    if (date === addDays(this.today(), 1)) {
      return 'Tomorrow';
    }
    return formatBookingDate(date);
  }

  protected toggleDay(): void {
    const opening = !this.dayOpen();
    this.dayOpen.set(opening);
    this.beachesOpen.set(false);
    if (opening) {
      this.railOpened.emit();
      this.revealCurrentChip();
    }
  }

  protected toggleBeaches(): void {
    const opening = !this.beachesOpen();
    this.beachesOpen.set(opening);
    this.dayOpen.set(false);
    if (opening) {
      this.railOpened.emit();
      this.revealCurrentChip();
    }
  }

  /**
   * Both rails shut — Escape, a pick elsewhere, the picker opening. A rail takes its chips with
   * it, so focus held inside one lands on the chip that opened it (WCAG 2.4.3).
   */
  closeRails(): void {
    const focused = this.railHoldsFocus();
    this.dayOpen.set(false);
    this.beachesOpen.set(false);
    if (focused === 'day') {
      this.moveFocus('head-day');
    } else if (focused === 'beach') {
      this.moveFocus('head-beaches');
    }
  }

  /** Which open rail holds focus, if any — the pressed chip is about to be destroyed with it. */
  private railHoldsFocus(): 'day' | 'beach' | null {
    const active = this.host.nativeElement.ownerDocument.activeElement;
    if (this.dayOpen() && this.rail('Day')?.contains(active)) {
      return 'day';
    }
    return this.beachesOpen() && this.rail('Beach')?.contains(active) ? 'beach' : null;
  }

  private rail(name: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(
      `[role="group"][aria-label="${name}"]`,
    );
  }

  /** A pick closes the rail under the pressed chip, so focus goes back to the day chip. */
  protected pickDay(date: string): void {
    this.dayPicked.emit(date);
    this.dayOpen.set(false);
    this.moveFocus('head-day');
  }

  protected pickBeach(code: string): void {
    this.beachPicked.emit(code);
    this.beachesOpen.set(false);
    this.moveFocus('head-beaches');
  }

  /** A rail opens with its lit chip in view, wherever along the coast or the week it sits. */
  private revealCurrentChip(): void {
    afterNextRender(
      {
        write: () => {
          this.host.nativeElement
            .querySelector<HTMLElement>('[role="group"] [aria-current]')
            ?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
        },
      },
      { injector: this.injector },
    );
  }
}
