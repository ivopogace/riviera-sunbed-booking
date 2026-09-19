/**
 * PROTOTYPE variant P — **Search**. The Airbnb mobile search pattern, copied on purpose: it is
 * the most-tested answer to "browse places, then pick one on a map", and tourists already know
 * it. Two screens, one cheap switch, and neither screen tries to hold the other.
 *
 * <ul>
 *   <li><b>List first.</b> The phone opens on the cards — the shipped-style photo card, one
 *       column, full width — under one compact bar that says where and when (press → the coast
 *       picker). No hero, and <b>no map</b>: the list screen pays for no WebGL context and no
 *       tiles at all.
 *   <li><b>A floating Map pill at the foot</b>, centred above the tab bar, in thumb reach. It is
 *       the shipped List / Map toggle moved to where a thumb is and given one word.
 *   <li><b>The map screen is full bleed</b> with the shipped price pills, and along its foot a
 *       horizontal <b>card carousel that snaps</b>: press a pill and its card slides into place,
 *       swipe the carousel and the pin follows. No sheet, no detents. A List pill goes back.
 * </ul>
 *
 * <p>Opens on a region (the fence rule): the tourist's own when located, Himarë otherwise. From
 * `lg` up it is Airbnb's desktop too — the grid on the left, the map sticky on the right, the
 * pill gone — which is also the shape the shipped page has, with the hero and the width cap
 * removed, the camera fitted, and the map pane held to the 400 px column round 4 measured as the
 * coast's own shape rather than the shipped 42 %.
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
import { RouterLink } from '@angular/router';

import { beachEntry, regionLabel } from '../../shared/beaches';
import { todayBookingDate } from '../../shared/booking-date';
import { CardGlass } from '../../shared/card-glass';
import { GeolocationGateway } from '../../shared/geolocation';
import { LngLat, MapView } from '../../shared/map-engine';
import { PanelGlass } from '../../shared/panel-glass';
import { HERE_MARKER, RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { fitPins } from './prototype-camera';
import { PrototypeCoastPicker } from './prototype-coast-picker';
import { clockLabel, closedForTodayAt, parseClock } from './prototype-days';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { distanceKm, distanceLabel, locationOf, nearestRegion } from './prototype-place';
import { PrototypeVenueCard } from './prototype-venue-card';

const PHONE_DEFAULT_REGION = 'HIMARE';
/** The carousel's box at the map's foot, plus the List pill under it, which the fit keeps clear. */
const CAROUSEL_INSET = 190;
/** Tailwind's `lg`. */
const WIDE_PX = 1024;
const DUSK_CLASSES = ['opacity-45', 'saturate-50'];

const PILL =
  'pointer-events-auto inline-flex h-11 touch-manipulation items-center gap-2 rounded-full ' +
  'bg-riv-accent-ink px-5 text-[15px] font-bold text-riv-on-accent-ink ' +
  'shadow-[0_10px_28px_rgba(7,42,58,0.35)]';

@Component({
  selector: 'app-variant-search',
  imports: [
    RouterLink,
    CardGlass,
    PanelGlass,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    PrototypeCoastPicker,
    PrototypeVenueCard,
  ],
  host: { class: 'block' },
  template: `
    <!-- The one bar: where and when. Sticky over the list; floating over the map. -->
    <div
      class="sticky top-0 z-[20] px-3 pt-2 lg:static lg:px-5 lg:pt-4"
      [class]="mapOpen() ? 'fixed inset-x-0 top-0 z-[26]' : ''"
    >
      <div class="relative">
        <button
          type="button"
          appTouchTarget
          appPanelGlass
          class="flex w-full items-center gap-3 rounded-full py-1.5 pr-4 pl-4 text-left shadow-[0_8px_24px_rgba(7,42,58,0.18)] lg:w-auto lg:min-w-[420px]"
          [attr.aria-expanded]="pickerOpen()"
          (click)="pickerOpen.set(!pickerOpen())"
        >
          <span class="text-[18px] text-riv-accent-ink" aria-hidden="true">{{
            state().here !== null ? '◎' : '⌕'
          }}</span>
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-[15px] leading-[1.15] font-bold text-riv-ink">{{
              title()
            }}</span>
            <span class="truncate text-[12.5px] leading-[1.2] text-riv-ink-soft"
              >{{ state().dateLabel }} · {{ focus().cards.length }} venues · {{ selling() }} still
              selling today</span
            >
          </span>
          <span class="ml-auto shrink-0 text-[13px] text-riv-ink-faint" aria-hidden="true">▾</span>
        </button>
        @if (pickerOpen()) {
          <app-prototype-coast-picker
            [region]="state().region"
            [beach]="state().beach"
            [located]="state().here !== null"
            (picked)="filtered.emit($event)"
            (nearMe)="locate()"
            (closed)="pickerOpen.set(false)"
          />
        }
      </div>
    </div>

    <div class="lg:flex lg:gap-5 lg:px-5 lg:pt-4">
      <!-- The list: the shipped-style card, one column on a phone, the grid on a desktop. -->
      <main
        class="min-w-0 flex-1 px-3 pt-3 pb-24 lg:px-0 lg:pt-0"
        [class.max-lg:hidden]="mapOpen()"
      >
        <ul
          class="grid list-none grid-cols-1 gap-4 lg:grid-cols-2 [@media(min-width:1700px)]:grid-cols-3"
        >
          @for (card of cards(); track card.id) {
            <li [attr.data-row]="card.id">
              <app-prototype-venue-card
                [card]="card"
                [selected]="selected() === '' + card.id"
                (hovered)="hovered.set($event)"
              />
            </li>
          }
        </ul>
        @if (cards().length === 0) {
          <p class="px-2 py-8 text-center text-[14px] text-riv-ink-soft">
            No venues here for this date. Pick another place on the coast.
          </p>
        }
      </main>

      <!-- The map screen: full bleed on a phone when open; the sticky right pane on a desktop. -->
      @if (mapOpen() || wide()) {
        <div
          class="max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:z-[25] lg:sticky lg:top-[84px] lg:h-[calc(100dvh-100px)] lg:w-[400px] lg:shrink-0"
          [style.bottom]="wide() ? null : ABOVE_TAB_BAR"
        >
          <div
            #pane
            class="relative size-full overflow-hidden bg-riv-solid-btn-fill max-lg:[&_app-riviera-map>div.top-3]:hidden max-lg:[&_app-riviera-map>p]:top-[136px] max-lg:[&_app-riviera-map>p]:bottom-auto max-lg:[&_app-riviera-map>p]:text-[11px] max-lg:[&>app-riviera-map]:rounded-none lg:rounded-[26px]"
          >
            <app-riviera-map class="size-full" [nearMe]="false" (mapClick)="selected.set(null)" />
            <app-venue-pin-layer
              class="max-lg:rounded-none!"
              [pins]="pins()"
              [map]="handle()"
              [selected]="litPin()"
              [maxZoom]="maxZoom"
              (chosen)="choose($event)"
              (narrowed)="filtered.emit({ beach: $event })"
            />
            <!-- Locate, bottom-right above the carousel: Airbnb's own corner for it. -->
            <button
              type="button"
              appTouchTarget
              class="absolute right-3 z-[8] inline-flex size-11 touch-manipulation items-center justify-center rounded-full border-2 text-[20px] shadow-[0_6px_18px_rgba(7,42,58,0.3)] max-lg:bottom-[188px] lg:bottom-3"
              [class]="
                state().here !== null
                  ? 'border-riv-solid-btn-fill bg-riv-solid-btn-ink text-riv-solid-btn-fill'
                  : 'border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink'
              "
              aria-label="Near me"
              [attr.aria-pressed]="state().here !== null"
              (click)="locate()"
            >
              <span aria-hidden="true">◎</span>
            </button>

            <!-- The carousel: one card per pin, snapping; the selected pin's card is centred. -->
            <ul
              #carousel
              class="absolute inset-x-0 bottom-[66px] z-[9] flex list-none snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-[24px] px-[24px] pb-1 scrollbar-none lg:hidden"
              (scroll)="onCarouselScroll()"
            >
              @for (card of cards(); track card.id) {
                <li class="w-[calc(100%-48px)] shrink-0 snap-center" [attr.data-card]="card.id">
                  <a
                    appCardGlass
                    class="flex h-[104px] items-stretch gap-3 rounded-[18px] p-2 no-underline shadow-[0_10px_28px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-[22px] aria-[current]:outline-[3px] aria-[current]:-outline-offset-[3px] aria-[current]:outline-riv-accent-ink"
                    [class.opacity-60]="duskIds().has('' + card.id)"
                    [routerLink]="['/venues', card.id]"
                    [queryParams]="{ date: state().date }"
                    [attr.aria-label]="card.ariaLabel"
                    [attr.aria-current]="selected() === '' + card.id ? 'true' : null"
                  >
                    <span
                      class="relative block w-[88px] shrink-0 overflow-hidden rounded-[12px] bg-(image:--riv-photo-grad)"
                      aria-hidden="true"
                    >
                      <img
                        class="absolute inset-0 size-full object-cover"
                        [src]="card.photos[0].url"
                        alt=""
                      />
                    </span>
                    <span
                      class="flex min-w-0 flex-1 flex-col justify-between py-0.5"
                      aria-hidden="true"
                    >
                      <span class="flex items-baseline justify-between gap-2">
                        <span
                          class="truncate text-[16px] leading-[1.15] font-bold text-riv-card-ink"
                          >{{ card.name }}</span
                        >
                        <strong class="shrink-0 text-[16px] font-extrabold text-riv-accent-ink">{{
                          duskIds().has('' + card.id) ? 'Closed' : card.priceLabel
                        }}</strong>
                      </span>
                      <span class="truncate text-[12.5px] text-riv-card-ink-soft"
                        >{{ card.beachLabel }} · {{ card.regionLabel
                        }}{{ km(card) !== null ? ' · ' + km(card) : '' }}</span
                      >
                      <span class="flex items-center gap-[6px] text-[13px] text-riv-card-ink-soft">
                        @if (card.isRated) {
                          <span class="text-[#f4a939]" aria-hidden="true">★</span>
                          <span class="font-bold text-riv-card-ink">{{ card.rating }}</span>
                          <span class="opacity-30" aria-hidden="true">·</span>
                        }
                        <span
                          ><strong class="text-riv-card-ink">{{ card.free }}</strong> of
                          {{ card.total }} free</span
                        >
                      </span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          </div>
        </div>
      }
    </div>

    <!-- The switch, centred above the tab bar: one word, in thumb reach. Phone only. -->
    <div
      class="pointer-events-none fixed inset-x-0 z-[27] flex justify-center lg:hidden"
      [class.hidden]="pickerOpen()"
      [style.bottom]="PILL_BOTTOM"
    >
      <button type="button" appTouchTarget [class]="PILL" (click)="mapOpen.set(!mapOpen())">
        @if (mapOpen()) {
          <span aria-hidden="true">☰</span> List
        } @else {
          <span aria-hidden="true">⌖</span> Map
        }
      </button>
    </div>
  `,
})
export class VariantSearch {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly PILL = PILL;
  protected readonly ABOVE_TAB_BAR = 'calc(61px + env(safe-area-inset-bottom))';
  protected readonly PILL_BOTTOM = 'calc(73px + env(safe-area-inset-bottom))';
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;

  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly carousel = viewChild<ElementRef<HTMLElement>>('carousel');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly geolocation = inject(GeolocationGateway);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly handle = computed(() => this.map()?.handle());
  protected readonly wide = signal(false);
  /** `?mode=map` opens on the map screen, for a screenshot. */
  protected readonly mapOpen = signal(this.params().get('mode') === 'map');
  protected readonly pickerOpen = signal(false);
  protected readonly selected = signal<string | null>(null);
  protected readonly hovered = signal<number | null>(null);
  protected readonly litPin = computed(() => {
    const hover = this.hovered();
    return this.selected() ?? (hover === null ? null : String(hover));
  });

  private readonly now = computed(() => parseClock(this.params().get('now')) ?? tiraneMinutes());
  private readonly isToday = computed(() => this.state().date === todayBookingDate(new Date()));

  protected readonly focus = computed(() => {
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

  /** Flat, as Airbnb's is: nearest first when located, the coast's order otherwise. */
  protected readonly cards = computed<readonly VenueCard[]>(() => {
    const here = this.state().here;
    const cards = this.focus().cards;
    return here === null
      ? cards
      : [...cards].sort(
          (a, b) => distanceKm(here, locationOf(a)) - distanceKm(here, locationOf(b)),
        );
  });
  protected readonly pins = computed(() =>
    this.cards().map((card) => ({ id: String(card.id), at: locationOf(card), card })),
  );
  protected readonly duskIds = computed<ReadonlySet<string>>(() => {
    if (!this.isToday()) return new Set();
    const now = this.now();
    return new Set(
      this.cards()
        .filter((c) => closedForTodayAt(c, now))
        .map((c) => String(c.id)),
    );
  });
  protected readonly selling = computed(() => this.cards().length - this.duskIds().size);
  protected readonly clock = computed(() => clockLabel(this.now()));

  protected readonly title = computed(() => {
    const { region, beach } = this.focus();
    if (beach !== '') return this.cards()[0]?.beachLabel ?? '';
    if (this.state().here !== null && this.state().region === '') {
      return `Near you · ${regionLabel(region)}`;
    }
    return region === '' ? 'The whole coast' : regionLabel(region);
  });

  protected km(card: VenueCard): string | null {
    const here = this.state().here;
    return here === null ? null : distanceLabel(distanceKm(here, locationOf(card)));
  }

  /** A pill press: light the pin and bring its card to the carousel's centre (or the grid's). */
  protected choose(id: string): void {
    this.selected.set(id);
    this.syncing = true;
    const target = this.wide()
      ? this.document.querySelector(`[data-row="${id}"]`)
      : this.carousel()?.nativeElement.querySelector(`[data-card="${id}"]`);
    target?.scrollIntoView({ inline: 'center', block: 'center', behavior: 'smooth' });
    setTimeout(() => (this.syncing = false), 700);
  }

  private syncing = false;
  private scrollTimer: ReturnType<typeof setTimeout> | undefined;

  /** The carousel settles: the card nearest its centre is the selected pin. */
  protected onCarouselScroll(): void {
    if (this.syncing) return;
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      const rail = this.carousel()?.nativeElement;
      if (rail === undefined) return;
      const centre = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      let best: { id: string; d: number } | null = null;
      for (const li of rail.querySelectorAll<HTMLElement>('[data-card]')) {
        const r = li.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - centre);
        if (best === null || d < best.d) best = { id: li.dataset['card'] ?? '', d };
      }
      if (best !== null) this.selected.set(best.id);
    }, 120);
  }

  protected async locate(): Promise<void> {
    const outcome = await this.geolocation.locate();
    if (outcome.kind === 'located') {
      this.filtered.emit({ here: outcome.at, region: '', beach: '' });
    }
  }

  private hereShown = false;

  constructor() {
    afterRenderEffect(() => {
      this.wide.set(window.innerWidth >= WIDE_PX);
    });
    let wired: unknown;
    afterRenderEffect(() => {
      const handle = this.handle();
      const pane = this.pane()?.nativeElement;
      const pins = this.pins().map((p) => p.at);
      const here = this.state().here;
      if (handle === undefined || pane === undefined) return;
      if (wired !== handle) {
        wired = handle;
        this.hereShown = false;
      }
      const inset = this.wide() ? 0 : CAROUSEL_INSET;
      const view = fitCovered(pins, pane.clientWidth, pane.clientHeight, inset);
      if (view !== null) handle.easeTo(view);
      if (here !== null && !this.hereShown) {
        const dot = this.document.createElement('div');
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', 'You are here');
        dot.className =
          'block size-5 rounded-full border-[3px] border-riv-solid-btn-fill bg-riv-solid-btn-ink shadow-[0_0_0_6px_rgba(10,79,94,0.18),0_4px_12px_rgba(7,42,58,0.35)] z-[1]';
        handle.addMarker({ id: HERE_MARKER, lngLat: here, element: dot });
        this.hereShown = true;
      }
    });
    afterRenderEffect(() => {
      const dusk = this.duskIds();
      this.pins();
      this.handle();
      for (const button of this.element.nativeElement.querySelectorAll<HTMLElement>('[data-pin]')) {
        const at = dusk.has(button.dataset['pin'] ?? '');
        for (const cls of DUSK_CLASSES) button.classList.toggle(cls, at);
      }
    });
  }
}

/** Fit the uncovered box, then lift the centre by half the cover (the carousel at the foot). */
function fitCovered(
  pins: readonly LngLat[],
  width: number,
  height: number,
  insetBottom: number,
): MapView | null {
  const view = fitPins(pins, width, height - insetBottom);
  if (view === null || insetBottom === 0) return view;
  const perPixel = 360 / (512 * 2 ** view.zoom);
  const latPerPixel = perPixel * Math.cos((view.center.lat * Math.PI) / 180);
  return {
    center: { lng: view.center.lng, lat: view.center.lat - (insetBottom / 2) * latPerPixel },
    zoom: view.zoom,
  };
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
