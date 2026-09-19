/**
 * PROTOTYPE variant O — **Thumb**. Round 5's alternative to N, the same page with ONE structural
 * move: the map sits at the FOOT of the phone, fixed above the tab bar, and the list scrolls
 * above it. Every pin is then inside the thumb's arc, and so is the row a pin press brings to
 * the centre of the screen; the strip at the head is read once and pressed rarely.
 *
 * <p>The question it exists to answer from a screenshot rather than in prose: is a map that
 * hangs at the bottom of the screen read as the ground the list stands on — or as a widget the
 * page did not know where to put? From `lg` up O is N: the desktop has no thumb.
 */
import {
  afterRenderEffect,
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { beachEntry, regionLabel } from '../../shared/beaches';
import { todayBookingDate } from '../../shared/booking-date';
import { LngLat } from '../../shared/map-engine';
import { VenueCard } from '../home/venue-card';
import { contentAspect } from './prototype-aspect';
import { clockLabel, closedForTodayAt, parseClock } from './prototype-days';
import { paneDepth, PrototypeHereMap, TURN_ASPECT } from './prototype-here-map';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import {
  BeachGroup,
  distanceKm,
  distanceLabel,
  groupByBeach,
  locationOf,
  nearestRegion,
} from './prototype-place';
import { PrototypePlaceStrip } from './prototype-place-strip';
import { PrototypeVenueRow } from './prototype-venue-row';
import { VariantHere } from './variant-here';

const PHONE_DEFAULT_REGION = 'HIMARE';
/** The foot map's ceiling: the list above it must keep three rows on an 844 px phone. */
const FOOT_MAX_DEPTH = 264;
/** The tab bar's 61 px plus the home-indicator inset the shell already pads by. */
const ABOVE_TAB_BAR = 'calc(61px + env(safe-area-inset-bottom))';

@Component({
  selector: 'app-variant-thumb',
  imports: [PrototypeHereMap, PrototypePlaceStrip, PrototypeVenueRow, VariantHere],
  host: { class: 'block' },
  template: `
    @if (wide()) {
      <app-variant-here [state]="state()" (filtered)="filtered.emit($event)" />
    } @else {
      <app-prototype-place-strip
        class="sticky top-0 z-[20]"
        skin="rounded-b-[18px] shadow-[0_8px_24px_rgba(7,42,58,0.16)]"
        [state]="state()"
        [title]="title()"
        [subtitle]="subtitle()"
        [selling]="selling()"
        [total]="focus().cards.length"
        [clock]="clock()"
        [dayWord]="dayWord()"
        (picked)="filtered.emit($event)"
        (nearMe)="map.locate()"
      />
      <main class="px-3 pt-3" [style.padding-bottom.px]="depth() + 24">
        @for (group of groups(); track group.code) {
          <h2
            class="mt-2 mb-2 flex items-baseline gap-2 px-1 text-[14px] text-riv-ink-soft first:mt-0"
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
      </main>
      <!-- The map at the foot, above the tab bar: the pins in the thumb's arc, always. The wrapper
           is what is fixed — a position utility on the pane host would lose to its own. -->
      <div class="fixed inset-x-0 z-[15]" [style.bottom]="ABOVE_TAB_BAR">
        <app-prototype-here-map
          #map
          class="block rounded-t-[22px] shadow-[0_-12px_40px_rgba(7,42,58,0.3)]"
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
          (chosen)="choose($event)"
          (narrowed)="filtered.emit({ beach: $event })"
          (located)="onLocated($event)"
        />
      </div>
    }
  `,
})
export class VariantThumb {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly ABOVE_TAB_BAR = ABOVE_TAB_BAR;
  private readonly document = inject(DOCUMENT);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly wide = signal(false);
  private readonly pageWidth = signal(390);
  protected readonly selected = signal<string | null>(null);

  private readonly now = computed(() => parseClock(this.params().get('now')) ?? tiraneMinutes());
  protected readonly clock = computed(() => clockLabel(this.now()));
  private readonly isToday = computed(() => this.state().date === todayBookingDate(new Date()));
  protected readonly dayWord = computed(() => (this.isToday() ? 'today' : 'that day'));

  protected readonly focus = computed(() => {
    const s = this.state();
    if (s.beach !== '' || s.region !== '')
      return { cards: s.cards, region: s.region, beach: s.beach };
    const region = s.here !== null ? nearestRegion(s.here, s.cards) : PHONE_DEFAULT_REGION;
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
    if (this.state().here !== null && beach === '' && this.state().region === '') {
      return this.groups()[0]?.label ?? 'Near you';
    }
    if (beach !== '') return this.groups()[0]?.label ?? '';
    return regionLabel(region);
  });
  protected readonly subtitle = computed(() => {
    const { region, beach, cards } = this.focus();
    const n = `${cards.length} ${cards.length === 1 ? 'venue' : 'venues'}`;
    if (beach !== '') return `${this.groups()[0]?.region ?? ''} · ${n}`;
    if (this.state().here !== null && this.state().region === '') {
      return `Near you · ${regionLabel(region)} · nearest first`;
    }
    const beaches = this.groups().length;
    return `${beaches} beaches · ${n}`;
  });

  private readonly aspect = computed(() => contentAspect(this.pins().map((p) => p.at)));
  protected readonly turned = computed(
    () => this.pins().length >= 4 && (this.aspect() ?? 0) > TURN_ASPECT,
  );
  protected readonly depth = computed(() =>
    paneDepth(
      this.pins().map((p) => p.at),
      this.pageWidth(),
      this.turned(),
      FOOT_MAX_DEPTH,
    ),
  );

  protected kmLabel(km: number): string {
    return distanceLabel(km);
  }

  protected rowKm(card: VenueCard): string | null {
    const here = this.state().here;
    return here === null ? null : distanceLabel(distanceKm(here, locationOf(card)));
  }

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
      this.pageWidth.set(window.innerWidth);
      this.wide.set(window.innerWidth >= 1024);
    });
  }
}

function tiraneMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tirane',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return parseClock(parts) ?? 0;
}
