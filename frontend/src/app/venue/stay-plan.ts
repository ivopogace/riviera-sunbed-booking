import { Component, computed, input, output } from '@angular/core';

import { DateRange, daysBetween, parseIsoDate } from '../shared/booking-date';
import { formatBookingDate, formatStay } from '../shared/booking-date-label';
import { formatMoney } from '../shared/money';
import { plural } from '../shared/plural';
import { RetryButton } from '../shared/retry-button';
import { moveText } from '../shared/set-distance';
import { spotLabel } from '../shared/set-label';
import { TouchTarget } from '../shared/touch-target';
import { PlanAnchor, PlanView, SetView } from '../shared/venue-views';
import { SetRun, stayDays } from './stay-runs';

/** The stretch fills, cycled by position — one utility per token so Tailwind sees each class. */
export const STRETCH_FILL = [
  'bg-riv-stretch-1-fill',
  'bg-riv-stretch-2-fill',
  'bg-riv-stretch-3-fill',
  'bg-riv-stretch-4-fill',
] as const;

/** The stretch token a plan position wears, for a `--riv-plan-fill` custom property. */
export function stretchFillVar(index: number): string {
  return `var(--riv-stretch-${(index % STRETCH_FILL.length) + 1}-fill)`;
}

interface StripCell {
  readonly iso: string;
  readonly day: number;
  readonly stretch: number;
  readonly move: boolean;
  readonly label: string;
}

interface Stop {
  readonly index: number;
  readonly fill: string;
  readonly spot: string;
  readonly range: string;
  readonly rate: string;
  readonly move: { readonly day: string; readonly text: string } | null;
}

/**
 * A stitched plan as the tourist reads it before paying (stories 8, 9, 10): a day strip coloured by
 * stretch with a bar where a move happens, the stops with each move's morning and distance, the
 * per-day and total price, "Review & pay", and — when one spot could host part of the stay — the
 * way to shorten instead of moving. It books nothing itself.
 */
@Component({
  selector: 'app-stay-plan',
  imports: [RetryButton, TouchTarget],
  template: `
    <section
      class="mt-3 rounded-[16px] border border-riv-field-border bg-riv-field-solid px-4 py-3 text-[14px] text-riv-card-ink"
      data-testid="stay-plan"
      aria-labelledby="stay-plan-title"
    >
      <p
        class="text-[11.5px] font-bold uppercase tracking-[0.12em] text-riv-card-ink-soft"
        data-testid="stay-plan-kicker"
      >
        {{ kicker() }}
      </p>
      <h3
        id="stay-plan-title"
        class="mt-1 text-[17px] font-bold tracking-[-0.01em]"
        data-testid="stay-plan-title"
      >
        Your {{ days() }} days, planned
      </h3>
      <p class="mt-1 text-riv-card-ink-soft" data-testid="stay-plan-intro">{{ intro() }}</p>
      <ol
        class="mt-3 grid list-none gap-[3px]"
        [style.grid-template-columns]="'repeat(' + days() + ', minmax(0, 1fr))'"
        aria-label="Days of the stay"
        data-testid="stay-plan-strip"
      >
        @for (cell of strip(); track cell.iso) {
          <li
            class="grid h-8 place-items-center rounded-[6px] text-[11px] font-bold text-riv-stretch-ink"
            [class]="fillClass(cell.stretch)"
            [class.border-l-2]="cell.move"
            [class.border-riv-stretch-ink]="cell.move"
            [attr.data-stretch]="cell.stretch"
            [attr.data-move]="cell.move ? '' : null"
            [attr.aria-label]="cell.label"
          >
            <span aria-hidden="true">{{ cell.day }}</span>
          </li>
        }
      </ol>
      <ul class="mt-3 flex list-none flex-col gap-2" data-testid="stay-plan-stops">
        @for (stop of stops(); track stop.index) {
          <li data-testid="stay-plan-stop">
            @if (stop.move; as move) {
              <p class="mb-1 pl-9 text-[13px] text-riv-card-ink-soft" data-testid="stay-plan-move">
                Move on <strong class="text-riv-card-ink">{{ move.day }}</strong
                >: {{ move.text }}
              </p>
            }
            <div class="flex items-center gap-3">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold text-riv-stretch-ink"
                [class]="stop.fill"
                aria-hidden="true"
                >{{ stop.index }}</span
              >
              <span class="min-w-0 flex-1">
                <strong>{{ stop.spot }}</strong>
                <span class="text-riv-card-ink-soft"> · {{ stop.range }}</span>
              </span>
              <span class="shrink-0 text-[13px] text-riv-card-ink-soft">{{ stop.rate }}/day</span>
            </div>
          </li>
        }
      </ul>
      <p class="mt-3 flex items-baseline justify-between gap-3" data-testid="stay-plan-price">
        <span class="text-riv-card-ink-soft">{{ perDay() }}/day avg · {{ days() }} days</span>
        <strong class="text-[17px]">{{ total() }}</strong>
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <app-retry-button testId="stay-plan-book" label="Review & pay" (retry)="book.emit()" />
        <button
          appTouchTarget
          type="button"
          class="inline-flex cursor-pointer items-center rounded-[14px] px-3 py-2 font-bold text-riv-accent-ink underline-offset-2 hover:underline"
          data-testid="stay-plan-close"
          (click)="dismissed.emit()"
        >
          Back to the map
        </button>
      </div>
      @if (longestRun(); as best) {
        <div class="mt-4 border-t border-riv-field-border pt-3" data-testid="stay-plan-shorten">
          <p class="font-bold">Prefer not to move?</p>
          <p class="mt-1 text-riv-card-ink-soft">
            {{ runSpot(best) }} for {{ runLabel(best) }} · the longest stay one spot can host.
          </p>
          <button
            appTouchTarget
            type="button"
            class="mt-2 inline-flex cursor-pointer items-center rounded-[14px] px-3 py-2 font-bold text-riv-accent-ink underline-offset-2 hover:underline"
            data-testid="stay-plan-shorten-cta"
            (click)="shorten.emit({ first: best.run.first, last: best.run.last })"
          >
            Shorten my stay to {{ runLabel(best) }}
          </button>
        </div>
      }
    </section>
  `,
})
export class StayPlan {
  readonly plan = input.required<PlanView>();
  /** The stay the plan covers, first and last day. */
  readonly first = input.required<string>();
  readonly last = input.required<string>();
  /** The move budget the plan was searched under, for the unanchorable copy. */
  readonly maxMoves = input(3);
  /** The tapped set's role when the tourist planned around one. */
  readonly anchor = input<PlanAnchor | null | undefined>(undefined);
  readonly anchorSet = input<SetView | undefined>(undefined);
  /** The longest one-spot run, offered instead of moving; absent when no spot hosts any of the stay. */
  readonly longestRun = input<SetRun | undefined>(undefined);

  readonly book = output<void>();
  readonly shorten = output<DateRange>();
  readonly dismissed = output<void>();

  protected readonly days = computed(() => daysBetween(this.first(), this.last()));

  protected readonly kicker = computed(() => {
    const plan = this.plan();
    return `${plural(plan.moves, 'move')} · ${plural(plan.stretches.length, 'spot')}`;
  });

  protected readonly intro = computed(() => {
    const base =
      'No single spot is free every day, so we chose the fewest moves, then the shortest ones.';
    const set = this.anchorSet();
    if (set === undefined) {
      return base;
    }
    const spot = spotLabel(set.rowLabel, set.positionNo);
    switch (this.anchor()) {
      case 'START':
        return `${base} Starts at ${spot}, the spot you picked.`;
      case 'END':
        return `${base} Ends at ${spot}, the spot you picked.`;
      case 'UNANCHORABLE':
        return `${base} ${spot} couldn’t fit in a plan with ${this.maxMoves()} moves, so this plan uses other spots.`;
      default:
        return base;
    }
  });

  protected readonly strip = computed<readonly StripCell[]>(() => {
    const stretches = this.plan().stretches;
    return stretches.flatMap((stretch, index) =>
      stayDays(stretch.firstDate, stretch.lastDate).map((iso, dayIndex) => ({
        iso,
        day: parseIsoDate(iso).getDate(),
        stretch: index,
        move: index > 0 && dayIndex === 0,
        label: `${formatBookingDate(iso)}: ${spotLabel(stretch.rowLabel, stretch.positionNo)}`,
      })),
    );
  });

  protected readonly stops = computed<readonly Stop[]>(() => {
    const plan = this.plan();
    return plan.stretches.map((stretch, index) => {
      const move = index === 0 ? null : plan.movesBetween[index - 1];
      return {
        index: index + 1,
        fill: this.fillClass(index),
        spot: spotLabel(stretch.rowLabel, stretch.positionNo),
        range: formatStay(stretch.firstDate, stretch.lastDate),
        rate: formatMoney(stretch.pricePerDay),
        move:
          move === undefined || move === null
            ? null
            : {
                day: formatBookingDate(move.onDate),
                text: moveText(move.rowsAway, move.positionsAway, move.towardSea),
              },
      };
    });
  });

  protected readonly total = computed(() => formatMoney(this.plan().total));

  protected readonly perDay = computed(() => {
    const total = this.plan().total;
    return formatMoney({
      minorUnits: Math.round(total.minorUnits / this.days()),
      currency: total.currency,
    });
  });

  protected fillClass(index: number): string {
    return STRETCH_FILL[index % STRETCH_FILL.length];
  }

  protected runSpot(best: SetRun): string {
    return spotLabel(best.set.rowLabel, best.set.positionNo);
  }

  protected runLabel(best: SetRun): string {
    return formatStay(best.run.first, best.run.last);
  }
}
