import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PendingTasks,
  signal,
  viewChild,
} from '@angular/core';

import { LngLat, MapEngine, MapEngineOptions, MapHandle } from './map-engine';
import { TouchTarget } from './touch-target';

/**
 * The riviera as the map opens: centred on the coast between Vlorë and Ksamil, at a zoom that
 * shows the whole stretch, and fenced to the extract — all of Albania, the same box as `BBOX` in
 * `scripts/build-riviera-map.sh` — so a tourist cannot pan off the tiles into blank sea. The style
 * is a same-origin path (ADR-0022); the real adapter prefixes it with the API origin where the SPA
 * is served elsewhere.
 */
export const RIVIERA_MAP_OPTIONS: MapEngineOptions = {
  styleUrl: '/map/style.json',
  view: { center: { lng: 19.75, lat: 40.05 }, zoom: 8.6 },
  minZoom: 7,
  maxZoom: 16,
  maxBounds: [
    { lng: 19.0, lat: 39.5 },
    { lng: 21.2, lat: 42.8 },
  ],
};

type MapStatus = 'booting' | 'ready' | 'unavailable';

/** The map carries at most one pin, so its marker id is a constant rather than an input. */
const PIN_ID = 'venue-location-pin';

/**
 * The pin's own box: 44 px both axes (the touch-target floor) in the theme-invariant solid-button
 * skin the rest of the map chrome wears — it sits on imagery, which never themes.
 */
const PIN_CLASSES =
  'inline-flex size-11 cursor-grab touch-manipulation items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill text-[20px] leading-none ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)]';

/**
 * The **riviera map** — the geographic discovery map, as distinct from a venue's beach map.
 * Renders whatever engine is provided (`MapEngine`) into its canvas host and owns the chrome
 * around it: a skip control for keyboard and screen-reader users (the map canvas is a focusable
 * pan-and-zoom surface, and the venue list stays the fully accessible path), labelled zoom
 * buttons at the touch-target floor, and the permanent "© OpenMapTiles © OpenStreetMap
 * contributors" credit the tiles' licences require (CC-BY, ODbL). Wears the theme-invariant
 * solid-button skin: the imagery under it never themes.
 *
 * <p>The host reports its state as `data-status` (`booting` → `ready` once the style has loaded,
 * or `unavailable` when the browser cannot render a map), which is what the e2e waits on. The
 * consumer sizes the host; the map fills it.
 *
 * <p>It carries at most one `pin`. A null pin is no marker at all, a changed pin moves the marker
 * in place, and `mapClick`/`pinMoved` report positions so a placer above the seam can own where
 * the pin belongs without knowing which engine drew it.
 */
@Component({
  selector: 'app-riviera-map',
  imports: [TouchTarget],
  host: {
    class: 'relative block overflow-hidden rounded-[26px] bg-riv-solid-btn-fill',
    role: 'region',
    'aria-label': 'Map of the riviera',
    '[attr.data-status]': 'status()',
  },
  templateUrl: './riviera-map.html',
})
export class RivieraMap {
  private readonly engine = inject(MapEngine);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly document = inject(DOCUMENT);
  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly mapEnd = viewChild.required<ElementRef<HTMLElement>>('mapEnd');

  /** The camera and fence; the riviera by default, so an unpinned consumer binds nothing. */
  readonly options = input<MapEngineOptions>(RIVIERA_MAP_OPTIONS);
  /** Where the single pin sits, or `null` for none. */
  readonly pin = input<LngLat | null>(null);
  readonly pinDraggable = input(false);
  /** The pin marker's accessible name — the seam leaves the element's a11y to its caller. */
  readonly pinLabel = input('Venue location');

  readonly mapClick = output<LngLat>();
  readonly pinMoved = output<LngLat>();

  protected readonly status = signal<MapStatus>('booting');

  private readonly live = signal<MapHandle | undefined>(undefined);
  private marker: HTMLButtonElement | undefined;
  private markerOnMap = false;
  private disposed = false;
  private readonly unsubscribes: (() => void)[] = [];

  constructor() {
    afterNextRender(() => {
      void this.pendingTasks.run(() => this.boot());
    });
    effect(() => this.syncPin());
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.unsubscribes.forEach((off) => off());
      this.live()?.destroy();
    });
  }

  /** The live engine handle, for specs driving the fake; `undefined` until booted or when unavailable. */
  currentHandle(): MapHandle | undefined {
    return this.live();
  }

  private syncPin(): void {
    const handle = this.live();
    const pin = this.pin();
    if (!handle) {
      return;
    }
    if (!pin) {
      if (this.markerOnMap) {
        handle.removeMarker(PIN_ID);
        this.markerOnMap = false;
      }
      return;
    }
    const element = this.pinElement();
    element.setAttribute('aria-label', this.pinLabel());
    if (this.markerOnMap) {
      handle.moveMarker(PIN_ID, pin);
      return;
    }
    handle.addMarker({ id: PIN_ID, lngLat: pin, element, draggable: this.pinDraggable() });
    this.markerOnMap = true;
  }

  /** One element for the life of the component, so a move never costs the pin its focus. */
  private pinElement(): HTMLButtonElement {
    this.marker ??= this.buildPinElement();
    return this.marker;
  }

  private buildPinElement(): HTMLButtonElement {
    const element = this.document.createElement('button');
    element.type = 'button';
    element.className = PIN_CLASSES;
    element.dataset['testid'] = 'map-pin';
    const glyph = this.document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '\u25cf';
    element.appendChild(glyph);
    return element;
  }

  protected zoomIn(): void {
    this.live()?.zoomIn();
  }

  protected zoomOut(): void {
    this.live()?.zoomOut();
  }

  /** Bypass block (WCAG 2.4.1): land focus just past the map, on the way to whatever follows it. */
  protected skipMap(): void {
    this.mapEnd().nativeElement.focus();
  }

  private async boot(): Promise<void> {
    let handle: MapHandle;
    try {
      handle = await this.engine.create(this.canvasHost().nativeElement, this.options());
    } catch {
      this.status.set('unavailable');
      return;
    }
    if (this.disposed) {
      handle.destroy();
      return;
    }
    this.unsubscribes.push(
      handle.on('load', () => this.status.set('ready')),
      handle.onMapClick((at) => this.mapClick.emit(at)),
      handle.onMarkerDragEnd((_id, at) => this.pinMoved.emit(at)),
    );
    this.live.set(handle);
  }
}
