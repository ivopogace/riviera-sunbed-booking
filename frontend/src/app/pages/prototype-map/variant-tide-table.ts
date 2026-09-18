/**
 * PROTOTYPE variant H — **Tide table**. The coast × the week, in the sea.
 *
 * <p>Round 2 put the sea at the foot of the band and left it empty. This variant fills it with the
 * one thing this product has that a map of hotels does not: availability is per set PER DATE
 * (invariant #2), so the coast has a different shape every day of the week. Under the pins, in the
 * water, seven rows — today and the six days after it — and in each row one bar per venue at the
 * venue's own x on the band: the bar's height is how much of that venue is still free that day.
 * The columns are the map's x axis carried down through the sea, so the table pans and zooms with
 * the map and no legend has to say which bar is which — it is under its pin.
 *
 * <p>The row is the date control: press a day and the pins, the preview and the cards recount for
 * it. The `<input type="date">` goes. Today's row carries the day's second fact (invariant #4):
 * venues whose online sales have already closed for today are hatched, and the label says at what
 * time the next ones close.
 *
 * <p>What it needs that does not exist: a week's availability in one read (`/api/venues?date=`
 * answers one day). The fixture invents it (`prototype-days.ts`).
 */
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { defaultBookingDate } from '../../shared/booking-date';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { bearingFor, PrototypeBand } from './prototype-band';
import { COAST } from './prototype-coast';
import {
  clockLabel,
  closedForTodayAt,
  daysFrom,
  DayColumn,
  freeOn,
  parseClock,
  salesCloseOf,
} from './prototype-days';
import { PrototypeVenueCard } from './prototype-venue-card';

const CHIP =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ' +
  'text-riv-ink whitespace-nowrap hover:bg-riv-ink/8 ' +
  'aria-pressed:bg-riv-accent-ink aria-pressed:text-riv-on-accent-ink';

/**
 * One bar of the table: a venue on a day — or, where venues sit closer than a bar can be drawn
 * apart, the crowd of them, summed: the same rule that turns their pins into one place pill.
 */
interface Cell {
  readonly cards: readonly VenueCard[];
  readonly x: number;
  readonly width: number;
  readonly free: number;
  readonly total: number;
  /** 0…1 of the row's height. */
  readonly level: number;
  /** Today only: the day's clock is past every member's close. */
  readonly closed: boolean;
}

/** Columns nearer than this merge into one bar. */
const MERGE_PX = 14;

interface Row {
  readonly day: DayColumn;
  readonly chosen: boolean;
  readonly cells: readonly Cell[];
  /** The row's total free sets, for the label. */
  readonly free: number;
}

/** The band's height and how much of its foot the table takes: seven rows of 26 px plus the rail. */
const TABLE_HEIGHT = 7 * 26 + 12;

@Component({
  selector: 'app-variant-tide-table',
  imports: [PanelGlass, TouchTarget, PrototypeBand, PrototypeVenueCard],
  host: { class: 'block' },
  template: `
    <!-- Not sticky: strip + band are 654 px, which leaves a 900 px window no room to scroll cards under. -->
    <div class="relative z-[8]">
      <div
        appPanelGlass
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-x-0 border-t-0 px-4 py-2 lg:px-6"
      >
        <h1
          class="hidden text-[20px] leading-[1.1] font-bold tracking-[-0.02em] text-riv-ink min-[1280px]:block"
        >
          Find your spot on the Riviera.
        </h1>
        <p class="text-[13px] whitespace-nowrap text-riv-ink-soft">
          <strong class="text-[15px] font-extrabold text-riv-accent-ink">{{ freeChosen() }}</strong>
          sets free at {{ cards().length }} venues on
          <strong class="text-riv-ink">{{ chosenDay()?.weekday }} {{ chosenDay()?.label }}</strong>
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
              <span
                class="rounded-full bg-riv-ink/10 px-1.5 text-[11px] font-bold tabular-nums aria-pressed:bg-white/25"
                aria-hidden="true"
                >{{ region.venues }}</span
              >
            </button>
          }
        </nav>
      </div>

      <app-prototype-band
        #band
        class="h-[420px] lg:h-[clamp(560px,66vh,720px)]"
        [pins]="pins()"
        [cards]="cards()"
        [date]="state().date"
        [bearing]="bearing()"
        [padding]="padding"
        [hovered]="hovered()"
        [initialOpen]="initialOpen"
        previewCorner="top-left"
        (narrowed)="filtered.emit({ beach: $event })"
      >
        <!-- THE TIDE TABLE: seven rows in the water, one bar per venue under its own pin. -->
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 z-[5] hidden flex-col justify-end pb-3 lg:flex"
          [style.height.px]="tableHeight"
          role="group"
          aria-label="Free sets by day, along the coast"
        >
          @for (row of rows(); track row.day.date) {
            <div class="relative h-[26px]">
              <!-- The row's baseline: a thread of water, brighter on the chosen day. -->
              <span
                class="absolute inset-x-0 bottom-0 h-px"
                [class]="row.chosen ? 'bg-riv-solid-btn-fill/80' : 'bg-riv-solid-btn-fill/30'"
                aria-hidden="true"
              ></span>
              @for (cell of row.cells; track cell.cards[0].id) {
                <!-- The cell's full height as a faint track, so the bar reads as a level. -->
                <span
                  class="absolute bottom-0 block rounded-t-[3px] bg-riv-solid-btn-fill/15"
                  [style.left.px]="cell.x - cell.width / 2"
                  [style.width.px]="cell.width"
                  [style.height.px]="24"
                  aria-hidden="true"
                ></span>
                <button
                  type="button"
                  data-touch-exempt="a bar in a chart whose venue is also a 44 px pin on the map above it and a card below"
                  class="pointer-events-auto absolute bottom-0 block rounded-t-[3px] border-0 p-0 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                  [class]="cellClass(cell, row)"
                  [style.left.px]="cell.x - cell.width / 2"
                  [style.width.px]="cell.width"
                  [style.height.px]="1 + cell.level * 23"
                  [attr.aria-label]="cellLabel(cell, row)"
                  [attr.aria-pressed]="row.chosen && lit(cell)"
                  (mouseenter)="hovered.set(cell.cards[0].id)"
                  (mouseleave)="hovered.set(null)"
                  (click)="pressCell(cell, row)"
                ></button>
              }
              <!-- The day, at the rail: press to move the whole page to that day. -->
              <button
                type="button"
                appTouchTarget
                class="pointer-events-auto absolute left-3 -bottom-[9px] z-[1] inline-flex h-[24px]! min-h-0! items-center gap-2 rounded-full border px-2.5 text-[12px] leading-none font-bold whitespace-nowrap tabular-nums shadow-[0_4px_12px_rgba(7,42,58,0.25)]"
                [class]="
                  row.chosen
                    ? 'border-riv-solid-btn-fill bg-riv-solid-btn-ink text-riv-solid-btn-fill'
                    : 'border-riv-solid-btn-border bg-riv-solid-btn-fill/90 text-riv-solid-btn-ink hover:bg-riv-solid-btn-hover'
                "
                [attr.aria-pressed]="row.chosen"
                (click)="filtered.emit({ date: row.day.date })"
              >
                <span class="w-[26px]" [class.opacity-70]="!row.chosen">{{ row.day.weekday }}</span>
                <span>{{ row.day.label }}</span>
                <span class="font-semibold opacity-80">{{ row.free }} free</span>
                @if (row.day.isToday && closingNext(); as next) {
                  <span class="border-l border-current/30 pl-2 font-semibold opacity-80">{{
                    next
                  }}</span>
                }
              </button>
            </div>
          }
        </div>
      </app-prototype-band>
    </div>

    <div class="px-4 pt-5 pb-28 lg:px-6">
      @if (state().beach) {
        <p class="mb-3 flex items-center gap-3 text-[14px] text-riv-ink-soft">
          Showing <strong class="text-riv-ink">{{ beachName() }}</strong> only.
          <button
            type="button"
            appTouchTarget
            class="rounded-full border border-riv-accent-border bg-riv-accent-fill px-3 text-[13px] font-bold text-riv-accent-ink"
            (click)="filtered.emit({ beach: '' })"
          >
            Show the whole {{ state().region ? 'region' : 'coast' }}
          </button>
        </p>
      }
      <ul class="grid list-none grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-4">
        @for (card of cards(); track card.id) {
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
    </div>
  `,
})
export class VariantTideTable {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly chip = CHIP;
  protected readonly coast = COAST;
  protected readonly tableHeight = TABLE_HEIGHT;
  /** The foot holds the table; the coast is fitted above it. */
  /** The foot holds the table; the coast is fitted above it, and clear of the day labels at the left. */
  protected readonly padding = { top: 24, bottom: TABLE_HEIGHT + 56, left: 300, right: 120 };

  private readonly band = viewChild.required(PrototypeBand);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly initialOpen = this.query.get('open');
  /** `?now=15:30` seeds the day's clock for a screenshot; else the real one. */
  private readonly minutesNow =
    parseClock(this.query.get('now')) ?? new Date().getHours() * 60 + new Date().getMinutes();
  private readonly today = defaultBookingDate(new Date());

  protected readonly hovered = signal<number | null>(null);
  protected readonly litId = computed(() => {
    const open = this.band().open();
    return open === null ? this.hovered() : Number(open);
  });

  protected readonly bearing = computed(() => bearingFor(this.state().region, this.state().beach));

  /** The cards recounted for the chosen day — the pins, the preview and the grid all read these. */
  protected readonly cards = computed<readonly VenueCard[]>(() =>
    this.state().cards.map((card) => {
      const free = freeOn(card, this.state().date, this.today);
      const closed = this.state().date === this.today && closedForTodayAt(card, this.minutesNow);
      return {
        ...card,
        free,
        freePercent: Math.round((free / card.total) * 100),
        salesClosed: closed,
      };
    }),
  );
  protected readonly pins = computed(() =>
    this.cards().flatMap((card) =>
      card.location
        ? [
            {
              id: String(card.id),
              at: { lng: card.location.longitude, lat: card.location.latitude },
              card,
            },
          ]
        : [],
    ),
  );

  protected readonly days = computed(() => daysFrom(this.today, this.today));
  protected readonly chosenDay = computed(
    () => this.days().find((d) => d.date === this.state().date) ?? null,
  );
  protected readonly freeChosen = computed(() =>
    this.cards().reduce((sum, card) => sum + card.free, 0),
  );
  protected readonly beachName = computed(
    () => this.state().beaches.find((b) => b.code === this.state().beach)?.label ?? '',
  );

  /** "9 close 16:00" — the next close still ahead of the clock, and how many venues share it. */
  protected readonly closingNext = computed<string | null>(() => {
    const ahead = this.state()
      .cards.map((card) => salesCloseOf(card))
      .filter((close) => close !== '00:01' && closeMinutesOf(close) > this.minutesNow);
    if (ahead.length === 0) return null;
    const soonest = ahead.reduce((a, b) => (closeMinutesOf(a) < closeMinutesOf(b) ? a : b));
    const count = ahead.filter((c) => c === soonest).length;
    return `${count} close ${soonest === '23:59' ? 'at midnight' : clockLabel(closeMinutesOf(soonest))}`;
  });

  /** Bumped on every camera move: the table's x positions are the map's. */
  private readonly tick = signal(0);

  protected readonly rows = computed<readonly Row[]>(() => {
    this.tick();
    const band = this.band();
    const placed = this.state()
      .cards.flatMap((card) => {
        if (!card.location) return [];
        const at = band.project({ lng: card.location.longitude, lat: card.location.latitude });
        return at === null ? [] : [{ card, x: at.x }];
      })
      .sort((a, b) => a.x - b.x);
    // Neighbours too close to draw apart become one column, as their pins become one pill.
    const groups: { cards: VenueCard[]; x: number }[] = [];
    for (const p of placed) {
      const last = groups.at(-1);
      if (last && p.x - last.x < MERGE_PX) {
        last.cards.push(p.card);
        last.x = (last.x * (last.cards.length - 1) + p.x) / last.cards.length;
      } else {
        groups.push({ cards: [p.card], x: p.x });
      }
    }
    // A column is as wide as the room to its neighbours allows, capped at a bar.
    const widths = groups.map((g, i) => {
      const left = i === 0 ? Infinity : g.x - groups[i - 1].x;
      const right = i === groups.length - 1 ? Infinity : groups[i + 1].x - g.x;
      return Math.max(8, Math.min(36, Math.min(left, right) - 4));
    });
    return this.days().map((day) => {
      const cells = groups.map((g, i) => {
        const free = g.cards.reduce((sum, c) => sum + freeOn(c, day.date, this.today), 0);
        const total = g.cards.reduce((sum, c) => sum + c.total, 0);
        return {
          cards: g.cards,
          x: g.x,
          width: widths[i],
          free,
          total,
          level: free / total,
          closed: day.isToday && g.cards.every((c) => closedForTodayAt(c, this.minutesNow)),
        };
      });
      return {
        day,
        chosen: day.date === this.state().date,
        cells,
        free: cells.reduce((sum, c) => sum + c.free, 0),
      };
    });
  });

  protected lit(cell: Cell): boolean {
    return cell.cards.some((c) => c.id === this.litId());
  }

  protected cellClass(cell: Cell, row: Row): string {
    const lit = this.lit(cell);
    if (cell.closed) {
      return 'bg-[repeating-linear-gradient(135deg,var(--riv-solid-btn-fill)_0px,var(--riv-solid-btn-fill)_2px,transparent_2px,transparent_5px)] opacity-70';
    }
    if (lit) return 'bg-riv-solid-btn-ink opacity-100';
    return row.chosen
      ? 'bg-(image:--riv-bar-grad) opacity-100'
      : 'bg-riv-solid-btn-fill opacity-85';
  }

  protected cellLabel(cell: Cell, row: Row): string {
    const day = `${row.day.weekday} ${row.day.label}`;
    const who =
      cell.cards.length === 1
        ? cell.cards[0].name
        : `${cell.cards.length} venues at ${cell.cards[0].beachLabel}`;
    return cell.closed
      ? `${who}: online sales for today closed at ${salesCloseOf(cell.cards[0])}`
      : `${who}: ${cell.free} of ${cell.total} sets free on ${day}`;
  }

  /** A bar is a venue on a day: the page moves to that day and opens that venue (a crowd's first). */
  protected pressCell(cell: Cell, row: Row): void {
    if (!row.chosen) this.filtered.emit({ date: row.day.date });
    this.band().open.set(String(cell.cards[0].id));
  }

  constructor() {
    effect((onCleanup) => {
      const handle = this.band().handle();
      if (handle) onCleanup(handle.onMove(() => this.tick.update((n) => n + 1)));
    });
  }
}

function closeMinutesOf(close: string): number {
  const [h, m] = close.split(':').map(Number);
  return h * 60 + m;
}
