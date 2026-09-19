/**
 * PROTOTYPE — throwaway. Round 5's map pane: the riviera map as a phone can carry it, one element
 * N and O place differently (at the head of the page, at its foot).
 *
 * <p>Its rules, each measured in the README:
 *
 * <ul>
 *   <li>The pane is always the phone's full width, so K's aspect rule has ONE free axis: the
 *       height is the set's own (`390 · aspect`, clamped), and a set taller than
 *       {@link TURN_ASPECT} is TURNED to lie along the width — round 2's band, reached for by
 *       round 4's rule, on the phone's terms. The whole coast is never a state here: at 390 px it
 *       cannot be framed either way, so the picker's ribbon is the whole-coast map.
 *   <li>The map sits in a scroll column, so one finger scrolls the page and two move the map
 *       (MapLibre's cooperative gestures) — a map that grabs the scroll is the fastest way to
 *       strand a thumb on a 260 px pane.
 *   <li>The pins are the shipped pills: at 390 px the crowding rule already reads
 *       (`B-charttable-phone.png`), and a pill is a 44 px control where K's dots were not.
 *   <li>The one control in the pane is Near me, BOTTOM-left — the thumb's corner, not the shipped
 *       top-right. Zoom is a pinch below `lg`; the shipped zoom column returns from `lg` up.
 *   <li>A venue whose sales for today have closed wears dusk on its pin (J's instrument as a
 *       per-pin state), exactly as its row does.
 * </ul>
 */
import {
  afterRenderEffect,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { GeolocationGateway } from '../../shared/geolocation';
import { LngLat, MapHandle, MapView } from '../../shared/map-engine';
import { HERE_MARKER, RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { VenuePin } from '../home/pin-crowding';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { contentAspect } from './prototype-aspect';
import { bearingFor, PrototypeBand } from './prototype-band';
import { fitPins } from './prototype-camera';
import { rawMap } from './prototype-raw-map';

/** Taller than this (h : w, north up) and the set lies along the phone's width instead. */
export const TURN_ASPECT = 1.3;
/** The pane's depth: never shallower than a pill row plus sea, never deeper than half a phone. */
const MIN_DEPTH = 236;
export const MAX_DEPTH = 400;
/** Chrome the fit keeps clear of, as `prototype-camera` does. */
const PAD = 76;
const DUSK_CLASSES = ['opacity-45', 'saturate-50'];
/**
 * Below `lg`: no zoom column (a pinch zooms), and the licence credit in the top-right corner —
 * the pane's foot is the thumb's, and Near me lives there.
 */
const PHONE_CHROME =
  '[&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:top-2 [&_app-riviera-map>p]:bottom-auto ' +
  '[&_app-riviera-map>p]:text-[11px] [&_app-riviera-map>p]:leading-[14px]';

/** The pane's depth for a set on a `width` px pane: the set's own shape, on the one free axis. */
export function paneDepth(
  pins: readonly LngLat[],
  width: number,
  turned: boolean,
  maxDepth = MAX_DEPTH,
): number {
  const aspect = contentAspect(pins, turned ? 90 : 0);
  // One beach's three venues are one pill: no shape to give depth to, so the pane stays shallow.
  if (aspect === null || pins.length < 4) return MIN_DEPTH;
  const shape = turned ? Math.min(aspect, 1 / aspect) : aspect;
  return Math.round(Math.max(MIN_DEPTH, Math.min(maxDepth, (width - PAD) * shape + PAD)));
}

@Component({
  selector: 'app-prototype-here-map',
  imports: [RivieraMap, VenuePinLayer, PrototypeBand, TouchTarget],
  host: { class: 'relative block overflow-hidden bg-riv-solid-btn-fill' },
  template: `
    @if (turned()) {
      <!-- The wrapper positions: a position utility on the band host would lose to its own. -->
      <div class="absolute inset-0" [class]="chrome() ? '' : PHONE_CHROME">
        <app-prototype-band
          class="size-full"
          [pins]="pins()"
          [cards]="cards()"
          [date]="date()"
          [bearing]="bearing()"
          [padding]="bandPadding"
          [narrowPadding]="bandPadding"
          [preview]="false"
          [nearMe]="false"
          [duskIds]="duskIds()"
          [hovered]="selectedNumber()"
          (opened)="$event !== null && chosen.emit($event)"
          (narrowed)="narrowed.emit($event)"
        />
      </div>
    } @else {
      <!-- Below lg the credit moves to the top-right corner: the foot is the thumb's, for Near me. -->
      <div
        #pane
        class="absolute inset-0 [&>app-riviera-map]:rounded-none"
        [class]="chrome() ? '' : PHONE_CHROME"
      >
        <app-riviera-map class="size-full" [nearMe]="false" (mapClick)="chosen.emit(null)" />
      </div>
      <app-venue-pin-layer
        class="rounded-none!"
        [pins]="pins()"
        [map]="handle()"
        [selected]="selected()"
        [maxZoom]="maxZoom"
        (chosen)="chosen.emit($event)"
        (narrowed)="narrowed.emit($event)"
      />
    }
    <!-- Bottom-LEFT: the thumb's own corner. The shipped control sits top-right, out of reach. -->
    <button
      type="button"
      appTouchTarget
      class="absolute bottom-3 left-3 z-[8] inline-flex touch-manipulation items-center gap-1.5 rounded-full border-2 px-[14px] text-[14px] font-bold shadow-[0_6px_18px_rgba(7,42,58,0.3)]"
      [class]="
        here() !== null
          ? 'border-riv-solid-btn-fill bg-riv-solid-btn-ink text-riv-solid-btn-fill'
          : 'border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink'
      "
      [attr.aria-pressed]="here() !== null"
      (click)="locate()"
    >
      <span aria-hidden="true">◎</span>
      {{ here() !== null ? 'You are here' : 'Near me' }}
    </button>
    @if (turned()) {
      <span
        class="absolute top-2 left-3 z-[8] inline-flex h-7 items-center gap-0.5 rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill px-2 text-[11px] font-extrabold text-riv-solid-btn-ink"
        title="North"
        ><span class="text-[13px] leading-none" [style.rotate]="-bearing() + 'deg'">↑</span>N</span
      >
    }
  `,
})
export class PrototypeHereMap {
  readonly pins = input.required<readonly VenuePin[]>();
  readonly cards = input.required<readonly VenueCard[]>();
  readonly date = input.required<string>();
  readonly region = input.required<string>();
  readonly beach = input.required<string>();
  readonly here = input<LngLat | null>(null);
  readonly selected = input<string | null>(null);
  readonly duskIds = input<ReadonlySet<string>>(new Set());
  /** Lay a tall set along the width (the phone's rule); a desktop column keeps north up. */
  readonly turned = input(false);
  /** The shipped zoom column and credit placement — on from `lg`, off where a pinch zooms. */
  readonly chrome = input(false);
  /** Chrome that covers the pane's foot (O's strip), which the fit keeps the pins clear of. */
  readonly insetBottom = input(0);

  readonly chosen = output<string | null>();
  readonly narrowed = output<string>();
  readonly located = output<LngLat | null>();

  private readonly map = viewChild(RivieraMap);
  private readonly band = viewChild(PrototypeBand);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly geolocation = inject(GeolocationGateway);

  protected readonly handle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  protected readonly bearing = computed(() => bearingFor(this.region(), this.beach()));
  protected readonly PHONE_CHROME = PHONE_CHROME;
  /** A pill is centred on its pin and up to 110 px wide, so the sides keep half of one clear. */
  protected readonly bandPadding = { top: 56, bottom: 64, left: 56, right: 56 };
  protected readonly selectedNumber = computed(() => {
    const id = this.selected();
    return id === null ? null : Number(id);
  });
  private readonly moved = signal(0);
  private hereShown = false;

  /** Ask the browser where the tourist is; the strip's Near me row and the pane's button share it. */
  async locate(): Promise<void> {
    const outcome = await this.geolocation.locate();
    this.located.emit(outcome.kind === 'located' ? outcome.at : null);
  }

  constructor() {
    let wired: MapHandle | undefined;
    afterRenderEffect(() => {
      const handle = this.handle();
      const pane = this.pane()?.nativeElement;
      const pins = this.pins().map((p) => p.at);
      const here = this.here();
      const inset = this.insetBottom();
      if (handle === undefined || pane === undefined) return;
      if (wired !== handle) {
        wired = handle;
        this.hereShown = false;
        handle.onMove(() => this.moved.update((n) => n + 1));
        // In a scroll column one finger scrolls the page; two move the map.
        rawMap(handle)?.map.cooperativeGestures.enable();
      }
      // The pane's foot may be covered (O's strip): fit into what is left, then lift the centre.
      const view = fitView(pins, pane, inset);
      if (view !== null) handle.easeTo(view);
      this.syncHere(handle, here);
    });
    // Dusk is a class on the rendered pin buttons — one layer, one crowd rule (round 3, finding 3).
    afterRenderEffect(() => {
      const dusk = this.duskIds();
      this.pins();
      this.handle();
      this.moved();
      for (const button of this.element.nativeElement.querySelectorAll<HTMLElement>('[data-pin]')) {
        const at = dusk.has(button.dataset['pin'] ?? '');
        for (const cls of DUSK_CLASSES) button.classList.toggle(cls, at);
      }
    });
    effect(() => {
      const band = this.band();
      const here = this.here();
      const handle = band?.handle();
      if (handle !== undefined) this.syncHere(handle, here);
    });
  }

  private syncHere(handle: MapHandle, here: LngLat | null): void {
    if (here === null) {
      if (this.hereShown) handle.removeMarker(HERE_MARKER);
      this.hereShown = false;
      return;
    }
    if (this.hereShown) {
      handle.moveMarker(HERE_MARKER, here);
      return;
    }
    const dot = this.document.createElement('div');
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', 'You are here');
    dot.className =
      'block size-5 rounded-full border-[3px] border-riv-solid-btn-fill bg-riv-solid-btn-ink shadow-[0_0_0_6px_rgba(10,79,94,0.18),0_4px_12px_rgba(7,42,58,0.35)] z-[1]';
    handle.addMarker({ id: HERE_MARKER, lngLat: here, element: dot });
    this.hereShown = true;
  }
}

/**
 * The fit for a pane whose foot is covered by `insetBottom` px of chrome: fit the uncovered box,
 * then lift the centre by half the cover so the pins sit in what is actually visible.
 */
function fitView(pins: readonly LngLat[], pane: HTMLElement, insetBottom: number): MapView | null {
  const view = fitPins(pins, pane.clientWidth, pane.clientHeight - insetBottom);
  if (view === null || insetBottom === 0) return view;
  const perPixel = 360 / (512 * 2 ** view.zoom);
  const latPerPixel = perPixel * Math.cos((view.center.lat * Math.PI) / 180);
  return {
    center: { lng: view.center.lng, lat: view.center.lat - (insetBottom / 2) * latPerPixel },
    zoom: view.zoom,
  };
}
