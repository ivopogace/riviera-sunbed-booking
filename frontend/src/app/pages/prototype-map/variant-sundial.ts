/**
 * PROTOTYPE variant J — **Sundial**. Today, hour by hour: the light on the coast is the clock.
 *
 * <p>A tourist already on the riviera at half past three has one question the shipped page
 * cannot answer at a glance: which of these still take a booking for TODAY? Online sales close
 * per venue on the day itself — 16:00 for most, midnight for some, in advance only for a few
 * (invariant #4) — and the product buries that in a note on the venue page. This variant makes
 * it the map's light. The sea at the foot of the band holds the day as a line from 06:00 to
 * midnight; the sun is on it at the current hour and can be dragged; every venue whose close the
 * sun has passed drops into dusk on the map, and the band itself darkens toward evening. The
 * cards below split the same way: still selling for today, and tomorrow onward.
 *
 * <p>The one orchestrated moment: on load the sun rises from 06:00 to now in about a second and
 * a half, and the coast's pins go to dusk one close at a time as it passes them — the day so far,
 * played once. Under `prefers-reduced-motion` it is a cut. The clock is seeded by `?now=15:30`
 * for a screenshot, else the browser's.
 */
import {
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { bearingFor, PrototypeBand } from './prototype-band';
import { COAST } from './prototype-coast';
import { clockLabel, closedForTodayAt, parseClock, salesCloseOf } from './prototype-days';
import { PrototypeVenueCard } from './prototype-venue-card';

const CHIP =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ' +
  'text-riv-ink whitespace-nowrap hover:bg-riv-ink/8 ' +
  'aria-pressed:bg-riv-accent-ink aria-pressed:text-riv-on-accent-ink';

/** The day line runs from dawn to midnight. */
const DAWN = 6 * 60;
const MIDNIGHT = 24 * 60;
/** The line's inset from the band's edges: clear of the compass and the zoom column. */
const LINE_LEFT = 64;
const LINE_RIGHT = 150;
/** The room under the coast for the line, its labels and the sun. */
const SEA_DEPTH = 150;

interface CloseMark {
  readonly minutes: number;
  readonly label: string;
  readonly count: number;
}

@Component({
  selector: 'app-variant-sundial',
  imports: [PanelGlass, TouchTarget, PrototypeBand, PrototypeVenueCard],
  host: { class: 'block' },
  template: `
    <div class="sticky top-0 z-[8] sm:top-[72px]">
      <div
        appPanelGlass
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-x-0 border-t-0 px-4 py-2 lg:px-6"
      >
        <h1
          class="hidden text-[20px] leading-[1.1] font-bold tracking-[-0.02em] text-riv-ink min-[1280px]:block"
        >
          Today on the Riviera.
        </h1>
        <p class="text-[13px] whitespace-nowrap text-riv-ink-soft">
          At <strong class="text-riv-ink tabular-nums">{{ hourLabel() }}</strong
          >,
          <strong class="text-[15px] font-extrabold text-riv-accent-ink">{{
            litCards().length
          }}</strong>
          of {{ state().cards.length }} venues still take a booking for today.
        </p>
        <nav
          class="-mx-4 flex min-w-0 basis-full gap-0.5 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:flex-1 lg:basis-auto lg:justify-end lg:px-0"
          aria-label="The coast, north to south"
        >
          <button
            type="button"
            appTouchTarget
            [class]="chip"
            [attr.aria-pressed]="state().region === '' && state().beach === ''"
            (click)="filtered.emit({ region: '', beach: '' })"
          >
            Whole coast
          </button>
          @for (region of coast; track region.code) {
            <button
              type="button"
              appTouchTarget
              [class]="chip"
              [attr.aria-pressed]="state().region === region.code"
              (click)="filtered.emit({ region: region.code, beach: '' })"
            >
              {{ region.label }}
            </button>
          }
        </nav>
      </div>

      <app-prototype-band
        #band
        class="h-[420px] lg:h-[clamp(440px,54vh,600px)]"
        [pins]="state().pins"
        [duskIds]="duskIds()"
        [cards]="state().cards"
        [date]="state().date"
        [bearing]="bearing()"
        [padding]="padding"
        [hovered]="hovered()"
        [initialOpen]="initialOpen"
        previewCorner="top-left"
        (narrowed)="filtered.emit({ beach: $event })"
      >
        <!-- Evening: the band darkens as the sun goes down. Ink over imagery, never a new colour. -->
        <div
          class="pointer-events-none absolute inset-0 z-[3] bg-riv-solid-btn-ink motion-safe:[transition:opacity_0.2s_linear]"
          [style.opacity]="dusk_()"
          aria-hidden="true"
        ></div>

        <!-- THE DAY LINE, in the sea: dawn to midnight, the closes marked, the sun at the hour. -->
        <div
          class="absolute inset-x-0 bottom-0 z-[5] hidden lg:block"
          [style.height.px]="seaDepth"
          role="group"
          aria-label="The day: when online sales close along the coast"
        >
          <div
            class="absolute top-[64px] h-[3px] rounded-full bg-riv-solid-btn-fill/80"
            [style.left.px]="lineLeft"
            [style.right.px]="lineRight"
            aria-hidden="true"
          >
            <!-- The hours behind the sun are the day gone: drawn in ink. -->
            <span
              class="absolute inset-y-0 left-0 rounded-full bg-riv-solid-btn-ink/70"
              [style.width.%]="fraction(hour()) * 100"
            ></span>
            @for (tick of ticks; track tick) {
              <span
                class="absolute top-[7px] -translate-x-1/2 text-[11px] font-semibold tabular-nums text-riv-solid-btn-fill [text-shadow:0_1px_4px_rgba(7,42,58,0.6)]"
                [style.left.%]="fraction(tick) * 100"
              >
                <span class="mx-auto mb-0.5 block h-[6px] w-px bg-riv-solid-btn-fill/80"></span>
                {{ tickLabel(tick) }}
              </span>
            }
            @for (mark of closeMarks(); track mark.minutes) {
              <!-- A close: how many venues stop selling for today at this hour. -->
              <span
                class="absolute -top-[46px] flex -translate-x-1/2 flex-col items-center gap-0.5"
                [style.left.%]="fraction(mark.minutes) * 100"
              >
                <span
                  class="rounded-full border px-2.5 py-1 text-[12px] leading-none font-bold whitespace-nowrap shadow-[0_4px_12px_rgba(7,42,58,0.25)]"
                  [class]="
                    hour() >= mark.minutes
                      ? 'border-riv-solid-btn-fill/50 bg-riv-solid-btn-ink/80 text-riv-solid-btn-fill'
                      : 'border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink'
                  "
                  >{{ mark.count }} close {{ mark.label }}</span
                >
                <span class="h-[14px] w-px bg-riv-solid-btn-fill/80"></span>
              </span>
            }
            <!-- The sun, at the hour. -->
            <span
              class="absolute top-1/2 z-[1] size-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_22px_8px_rgba(255,199,105,0.45)] motion-safe:[transition:left_0.12s_linear]"
              [style.left.%]="fraction(hour()) * 100"
              aria-hidden="true"
            ></span>
            <span
              class="absolute top-[26px] -translate-x-1/2 rounded-full bg-riv-solid-btn-ink px-2 py-0.5 text-[12px] leading-none font-bold whitespace-nowrap text-riv-solid-btn-fill tabular-nums"
              [style.left.%]="fraction(hour()) * 100"
              aria-hidden="true"
              >{{ hourLabel() }}
              @if (hour() === now) {
                <span class="font-semibold opacity-80"> · now</span>
              }
            </span>
          </div>
          <!-- The control under the graphic: a plain range the whole line wide. -->
          <label
            class="absolute top-[40px] block h-[48px]"
            [style.left.px]="lineLeft - 17"
            [style.right.px]="lineRight - 17"
          >
            <span class="sr-only">Hour of the day</span>
            <input
              type="range"
              appTouchTarget
              class="block h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0"
              [min]="dawn"
              [max]="midnight"
              step="5"
              [value]="hour()"
              (input)="scrub($event)"
            />
          </label>
          @if (hour() !== now) {
            <button
              type="button"
              appTouchTarget
              class="absolute right-3 top-3 inline-flex items-center rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill px-3 text-[12px] font-bold text-riv-solid-btn-ink"
              (click)="hour.set(now)"
            >
              Back to now
            </button>
          }
        </div>
      </app-prototype-band>
    </div>

    <div class="px-4 pt-5 pb-28 lg:px-6">
      <h2 class="mb-3 text-[15px] font-bold text-riv-ink">
        Still selling for today
        <span class="ml-1 font-semibold text-riv-ink-soft">{{ litCards().length }}</span>
      </h2>
      <ul class="grid list-none grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-4">
        @for (card of litCards(); track card.id) {
          <li>
            <app-prototype-venue-card
              [card]="card"
              [selected]="litId() === card.id"
              photoClass="aspect-[16/9]"
              (hovered)="hovered.set($event)"
            />
          </li>
        }
      </ul>
      @if (duskCards().length > 0) {
        <h2 class="mt-8 mb-3 text-[15px] font-bold text-riv-ink">
          Tomorrow onward
          <span class="ml-1 font-semibold text-riv-ink-soft">{{ duskCards().length }}</span>
          <span class="ml-2 text-[13px] font-normal text-riv-ink-soft"
            >— closed for today, or selling in advance only</span
          >
        </h2>
        <ul
          class="grid list-none grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-4 opacity-70 saturate-75"
        >
          @for (card of duskCards(); track card.id) {
            <li>
              <app-prototype-venue-card
                [card]="card"
                [selected]="litId() === card.id"
                photoClass="aspect-[16/9]"
                (hovered)="hovered.set($event)"
              />
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class VariantSundial {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly chip = CHIP;
  protected readonly coast = COAST;
  protected readonly dawn = DAWN;
  protected readonly midnight = MIDNIGHT;
  protected readonly lineLeft = LINE_LEFT;
  protected readonly lineRight = LINE_RIGHT;
  protected readonly seaDepth = SEA_DEPTH;
  protected readonly ticks = [6 * 60, 9 * 60, 12 * 60, 15 * 60, 18 * 60, 21 * 60, 24 * 60];
  protected readonly padding = { top: 24, bottom: SEA_DEPTH + 40, left: 64, right: 120 };

  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly initialOpen = this.query.get('open');
  /** The day's clock: seeded for a screenshot, else the browser's. */
  protected readonly now = Math.max(
    DAWN,
    parseClock(this.query.get('now')) ?? new Date().getHours() * 60 + new Date().getMinutes(),
  );
  /** The hour the sun is at — `now` unless the tourist has dragged it. */
  protected readonly hour = signal(this.now);
  protected readonly hourLabel = computed(() => clockLabel(this.hour()));

  protected readonly hovered = signal<number | null>(null);
  protected readonly litId = computed(() => this.hovered());
  protected readonly bearing = computed(() => bearingFor(this.state().region, this.state().beach));

  protected readonly litCards = computed<readonly VenueCard[]>(() =>
    this.state().cards.filter((card) => !closedForTodayAt(card, this.hour())),
  );
  protected readonly duskCards = computed<readonly VenueCard[]>(() =>
    this.state().cards.filter((card) => closedForTodayAt(card, this.hour())),
  );
  protected readonly duskIds = computed(
    () => new Set(this.duskCards().map((card) => String(card.id))),
  );

  /** The closes still on the line — 00:01 is before dawn, so it is the dusk layer's from the start. */
  protected readonly closeMarks = computed<readonly CloseMark[]>(() => {
    const counts = new Map<number, number>();
    for (const card of this.state().cards) {
      const close = salesCloseOf(card);
      if (close === '00:01') continue;
      const minutes = close === '23:59' ? MIDNIGHT : 16 * 60;
      counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([minutes, count]) => ({
        minutes,
        count,
        label: minutes === MIDNIGHT ? 'at midnight' : `at ${clockLabel(minutes)}`,
      }));
  });

  /** How dark the band is: daylight until 18:00, dusk by 21:00, night at midnight. */
  protected readonly dusk_ = computed(() => {
    const h = this.hour();
    if (h <= 18 * 60) return 0;
    return Math.min(0.55, ((h - 18 * 60) / (3 * 60)) * 0.45 + (h > 21 * 60 ? 0.1 : 0));
  });

  protected fraction(minutes: number): number {
    return (Math.max(DAWN, Math.min(MIDNIGHT, minutes)) - DAWN) / (MIDNIGHT - DAWN);
  }

  protected tickLabel(minutes: number): string {
    return minutes === MIDNIGHT ? '24' : String(minutes / 60).padStart(2, '0');
  }

  protected scrub(event: Event): void {
    this.hour.set(Number((event.target as HTMLInputElement).value));
  }

  constructor() {
    // The moment: the sun rises from dawn to now, once. A cut when motion is reduced.
    const doc = inject(DOCUMENT);
    const reduced = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || this.now <= DAWN + 30 || this.query.get('still') !== null) return;
    this.hour.set(DAWN);
    const start = performance.now();
    const span = 1600;
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / span);
      const eased = 1 - (1 - p) * (1 - p);
      this.hour.set(Math.round(DAWN + (this.now - DAWN) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame));
  }
}
