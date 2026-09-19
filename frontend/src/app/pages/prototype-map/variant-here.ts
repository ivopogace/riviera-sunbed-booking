/**
 * PROTOTYPE variant N — **Here**. Round 5's answer, phone first: the page opens WHERE THE TOURIST
 * IS — one region, today, nearest first — and the map is a band at the head of the scroll column
 * whose depth is the set's own shape.
 *
 * <p>What it takes from the survivors, and why the combination beats each alone:
 *
 * <ul>
 *   <li>From B: the shipped pin pills on a phone-width map, which `B-charttable-phone.png` proved
 *       legible — but not B's map-as-the-page: a sheet over a full-bleed map costs the page its
 *       scroll, hides the southern pins and the licence credit under the sheet and the tab bar,
 *       and asks a thumb to learn a detent. Here the map is a band and the page scrolls.
 *   <li>From K: the aspect rule, on the phone's one free axis (the depth), and K's ribbon — moved
 *       out of the first screen into the coast picker, where `K-locator-phone.png` showed it can
 *       carry all sixteen beaches, and where its WebGL context is paid for only on demand.
 *   <li>From M: the beach as the unit of the list — every group of rows is a beach, captioned with
 *       its distance — but not M's sixteen maps: one map, one context, one set of tiles.
 *   <li>From J: "still selling for today" as the strip's sentence and as dusk on the pins and
 *       rows. It is the instrument that matters MORE on a phone, where the tourist is on the beach
 *       at half past three; J's band was what could not survive 390 px, not its idea.
 * </ul>
 *
 * <p>From `lg` up the phone's map pane becomes the left column — a 390 px instrument, the phone's
 * own width, the strip above it and the region's coast index under it — and the rows become the
 * card grid. Desktop is the phone plus a list beside it, not a different page.
 */
import {
  afterRenderEffect,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { beachEntry, regionLabel } from '../../shared/beaches';
import { todayBookingDate } from '../../shared/booking-date';
import { LngLat } from '../../shared/map-engine';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { contentAspect } from './prototype-aspect';
import { COAST } from './prototype-coast';
import { clockLabel, closedForTodayAt, parseClock } from './prototype-days';
import { paneDepth, PrototypeHereMap, TURN_ASPECT } from './prototype-here-map';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import {
  BeachGroup,
  distanceLabel,
  groupByBeach,
  nearestRegion,
  locationOf,
  distanceKm,
} from './prototype-place';
import { PrototypePlaceStrip } from './prototype-place-strip';
import { PrototypeVenueCard } from './prototype-venue-card';
import { PrototypeVenueRow } from './prototype-venue-row';

/** The phone opens on a region, never the coast (the fence); this is the riviera proper. */
const PHONE_DEFAULT_REGION = 'HIMARE';
/** The desktop column: a phone's width, so the phone's map pane is the desktop's instrument. */
const COLUMN = 390;
/** Tailwind's `lg`. */
const WIDE_PX = 1024;

/** What the page is looking at once the phone default and the tourist's position are applied. */
interface Focus {
  readonly cards: readonly VenueCard[];
  readonly region: string;
  readonly beach: string;
}

@Component({
  selector: 'app-variant-here',
  imports: [
    TouchTarget,
    PrototypeHereMap,
    PrototypePlaceStrip,
    PrototypeVenueRow,
    PrototypeVenueCard,
  ],
  host: { class: 'block' },
  template: `
    <div class="lg:flex lg:h-[calc(100dvh-68px)]">
      <aside
        #column
        class="lg:flex lg:shrink-0 lg:flex-col lg:gap-3 lg:overflow-hidden lg:p-4 lg:pr-0"
        [style.width.px]="wide() ? COLUMN + 16 : null"
      >
        <app-prototype-place-strip
          class="sticky top-0 z-[20] lg:static"
          skin="rounded-b-[18px] shadow-[0_8px_24px_rgba(7,42,58,0.16)] lg:rounded-[18px]"
          [state]="state()"
          [title]="title()"
          [subtitle]="subtitle()"
          [selling]="selling()"
          [total]="focus().cards.length"
          [total]="focus().cards.length"
          [clock]="clock()"
          [dayWord]="dayWord()"
          (picked)="filtered.emit($event)"
          (nearMe)="map.locate()"
        />
        <app-prototype-here-map
          #map
          class="block w-full lg:shrink-0 lg:rounded-[20px] lg:shadow-[0_10px_32px_rgba(7,42,58,0.18)]"
          [style.height.px]="depth()"
          [pins]="pins()"
          [cards]="focus().cards"
          [date]="state().date"
          [region]="focus().region"
          [beach]="focus().beach"
          [here]="state().here"
          [selected]="selected()"
          [duskIds]="duskIds()"
          [turned]="turned()"
          [chrome]="wide()"
          (chosen)="choose($event)"
          (narrowed)="filtered.emit({ beach: $event })"
          (located)="onLocated($event)"
        />
        @if (wide() && indexRoom()) {
          <!-- C's rail, scoped: the region's beaches with counts and prices, under the map. -->
          <nav class="min-h-0 flex-1 overflow-y-auto scrollbar-thin" aria-label="Beaches nearby">
            <ol class="list-none">
              @for (b of regionBeaches(); track b.code) {
                <li>
                  <button
                    type="button"
                    appTouchTarget
                    class="flex w-full items-center gap-2 rounded-[12px] px-2 text-left text-[14px] hover:bg-white/60 aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink"
                    [attr.aria-current]="focus().beach === b.code ? 'true' : null"
                    (click)="filtered.emit({ beach: b.code, here: null })"
                  >
                    <span class="font-semibold">{{ b.label }}</span>
                    <span class="ml-auto opacity-80">{{ b.from }}</span>
                    <span
                      class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-riv-accent-ink px-1.5 text-[11.5px] font-bold text-white"
                      >{{ b.venues }}</span
                    >
                  </button>
                </li>
              }
            </ol>
          </nav>
        }
      </aside>

      <main
        class="min-w-0 flex-1 px-3 pt-3 pb-8 lg:overflow-y-auto lg:px-5 lg:pt-4 lg:scrollbar-thin"
      >
        @for (group of groups(); track group.code) {
          <h2
            class="mt-2 mb-2 flex items-baseline gap-2 px-1 text-[14px] text-riv-ink-soft first:mt-0 lg:mt-3"
          >
            <span class="text-[17px] font-bold tracking-[-0.01em] text-riv-ink">{{
              group.label
            }}</span>
            @if (group.km !== null) {
              <span class="font-semibold text-riv-accent-ink">{{ kmLabel(group.km) }}</span>
            } @else {
              <span>{{ group.region }}</span>
            }
            <span class="ml-auto shrink-0"
              >{{ group.cards.length }} {{ group.cards.length === 1 ? 'venue' : 'venues' }}</span
            >
          </h2>
          @if (wide()) {
            <ul
              class="mb-3 grid list-none grid-cols-2 gap-4 [@media(min-width:1500px)]:grid-cols-3 [@media(min-width:1900px)]:grid-cols-4"
            >
              @for (card of group.cards; track card.id) {
                <li [attr.data-row]="card.id">
                  <app-prototype-venue-card
                    [card]="card"
                    [selected]="selected() === '' + card.id"
                    (hovered)="hovered.set($event)"
                  />
                </li>
              }
            </ul>
          } @else {
            <ul class="flex list-none flex-col gap-2">
              @for (card of group.cards; track card.id) {
                <li>
                  <app-prototype-venue-row
                    [card]="card"
                    [date]="state().date"
                    [selected]="selected() === '' + card.id"
                    [dusk]="duskIds().has('' + card.id)"
                    [km]="rowKm(card)"
                  />
                </li>
              }
            </ul>
          }
        }
        @if (groups().length === 0) {
          <p class="px-2 py-8 text-center text-[14px] text-riv-ink-soft">
            No venues here for this date. Pick another place on the coast.
          </p>
        }
      </main>
    </div>
  `,
})
export class VariantHere {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly COLUMN = COLUMN;
  private readonly column = viewChild.required<ElementRef<HTMLElement>>('column');
  private readonly document = inject(DOCUMENT);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly wide = signal(false);
  private readonly columnRoom = signal(700);
  protected readonly selected = signal<string | null>(null);
  protected readonly hovered = signal<number | null>(null);

  /** `?now=15:30` for a screenshot; the browser's clock, read in Tirane, otherwise. */
  private readonly now = computed(() => parseClock(this.params().get('now')) ?? tiraneMinutes());
  protected readonly clock = computed(() => clockLabel(this.now()));
  private readonly isToday = computed(() => this.state().date === todayBookingDate(new Date()));
  protected readonly dayWord = computed(() => (this.isToday() ? 'today' : 'that day'));

  /**
   * The rule the whole variant rests on: the phone opens on a region, never on the coast. With
   * nothing chosen, the region is the tourist's own when located, the riviera proper otherwise;
   * the desktop, whose column CAN frame the coast, opens on all of it.
   */
  protected readonly focus = computed<Focus>(() => {
    const s = this.state();
    if (s.beach !== '' || s.region !== '')
      return { cards: s.cards, region: s.region, beach: s.beach };
    const region =
      s.here !== null ? nearestRegion(s.here, s.cards) : this.wide() ? '' : PHONE_DEFAULT_REGION;
    if (region === '') return { cards: s.cards, region: '', beach: '' };
    return {
      cards: s.cards.filter((c) => beachEntry(c.beach)?.region === region),
      region,
      beach: '',
    };
  });

  protected readonly pins = computed(() =>
    this.focus().cards.map((card) => ({ id: String(card.id), at: locationOf(card), card })),
  );

  protected readonly groups = computed<readonly BeachGroup[]>(() =>
    groupByBeach(this.focus().cards, this.state().here),
  );

  protected readonly duskIds = computed<ReadonlySet<string>>(() => {
    if (!this.isToday()) return new Set();
    const now = this.now();
    return new Set(
      this.focus()
        .cards.filter((c) => closedForTodayAt(c, now))
        .map((c) => String(c.id)),
    );
  });
  protected readonly selling = computed(() => this.focus().cards.length - this.duskIds().size);

  protected readonly title = computed(() => {
    const { region, beach } = this.focus();
    const here = this.state().here;
    if (here !== null && beach === '' && this.state().region === '') {
      return this.groups()[0]?.label ?? 'Near you';
    }
    if (beach !== '') return this.groups()[0]?.label ?? '';
    return region === '' ? 'The whole coast' : regionLabel(region);
  });
  protected readonly subtitle = computed(() => {
    const { region, beach, cards } = this.focus();
    const n = `${cards.length} ${cards.length === 1 ? 'venue' : 'venues'}`;
    if (beach !== '') return `${this.groups()[0]?.region ?? ''} · ${n}`;
    if (this.state().here !== null && this.state().region === '') {
      return `Near you · ${regionLabel(region)} · nearest first`;
    }
    const beaches = this.groups().length;
    const where = region === '' ? 'Velipojë to Ksamil · ' : '';
    return `${where}${beaches} ${beaches === 1 ? 'beach' : 'beaches'} · ${n}`;
  });

  /** The region's beaches for the desktop index, from the coast's own count. */
  protected readonly regionBeaches = computed(() => {
    const region = this.focus().region;
    return COAST.find((r) => r.code === region)?.beaches ?? [];
  });

  private readonly aspect = computed(() => contentAspect(this.pins().map((p) => p.at)));
  /** A tall set lies along the phone's width; the desktop column is portrait and keeps north up. */
  /** Three venues on one beach have no shape worth turning for; a region does. */
  protected readonly turned = computed(
    () => !this.wide() && this.pins().length >= 4 && (this.aspect() ?? 0) > TURN_ASPECT,
  );
  protected readonly depth = computed(() => {
    const at = this.pins().map((p) => p.at);
    if (!this.wide()) return paneDepth(at, this.pageWidth(), this.turned());
    // The column: the set's own depth at 390 wide, or the whole column for a coast-shaped set.
    return Math.min(this.columnRoom(), paneDepth(at, COLUMN, false, this.columnRoom()));
  });
  /** Room under the map for the region's index, on the desktop. */
  protected readonly indexRoom = computed(() => this.columnRoom() - this.depth() > 160);
  private readonly pageWidth = signal(390);

  protected kmLabel(km: number): string {
    return distanceLabel(km);
  }

  protected rowKm(card: VenueCard): string | null {
    const here = this.state().here;
    return here === null ? null : distanceLabel(distanceKm(here, locationOf(card)));
  }

  /** A pin press opens no second card: the row IS the preview, scrolled into view and lit. */
  protected choose(id: string | null): void {
    this.selected.set(id);
    if (id === null) return;
    this.document
      .querySelector(`[data-row="${id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  protected onLocated(at: LngLat | null): void {
    if (at !== null) this.filtered.emit({ here: at, region: '', beach: '' });
  }

  constructor() {
    afterRenderEffect(() => {
      const width = window.innerWidth;
      this.pageWidth.set(width);
      this.wide.set(width >= WIDE_PX);
      const column = this.column().nativeElement;
      // The column holds the strip (measured) and the map; what is left is the map's room.
      const strip = column.querySelector('app-prototype-place-strip')?.clientHeight ?? 0;
      if (this.wide()) this.columnRoom.set(Math.max(300, column.clientHeight - 32 - strip - 12));
    });
  }
}

/** The clock in Europe/Tirane (invariant #6), as minutes after midnight. */
function tiraneMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tirane',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return parseClock(parts) ?? 0;
}
