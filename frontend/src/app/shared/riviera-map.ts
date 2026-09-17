import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
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

import { BusyAction } from './busy-action';
import { focusMover } from './focus-after-render';
import { GeolocationFailure, GeolocationGateway, GeolocationOutcome } from './geolocation';
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
 * The pin's own box: 44 px both axes, the floor a drag target needs, in the theme-invariant
 * solid-button skin the rest of the map chrome wears — it sits on imagery, which never themes.
 *
 * <p>The two markers can coincide — an operator pressing near-me while standing at their pinned
 * venue — and neither engine orders them, so the draggable one names a paint order rather than
 * inheriting DOM order: a dot over its middle would swallow the drag and pan the map instead. Both
 * stay far below the chrome column's `z-10`.
 */
const PIN_CLASSES =
  'inline-flex size-11 touch-manipulation items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill text-[20px] leading-none ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] z-[2]';

/** The visitor's own position, which is never the venue pin — a second marker, its own id. */
export const HERE_MARKER = 'you-are-here';

/**
 * Town scale: near enough to tell which beach the visitor is on, wide enough to still show the
 * ones along from it. Inside the map's own 7…16 fence.
 */
export const NEAR_ME_ZOOM = 12;

/**
 * Why the map did not move. The browser's three, plus the one the map's own fence adds: a position
 * outside `maxBounds` would be clamped to a corner with the visitor's marker unreachable, so it is
 * refused rather than half-honoured.
 */
type NearMeProblem = GeolocationFailure | 'off-map';

/** One short sentence each, all of them saying the map stayed where the visitor left it. */
const NEAR_ME_MESSAGES: Record<NearMeProblem, string> = {
  denied: 'Location permission was declined. The map hasn’t moved.',
  unavailable: 'Your location isn’t available right now.',
  timeout: 'Finding your location took too long. Try again.',
  'off-map': 'You don’t seem to be on the Albanian riviera — the map hasn’t moved.',
};

/**
 * The you-are-here dot: an ink disc inside a light ring, the shape every map uses for "you", so
 * it is not read as another venue pin beside the placer's. Same theme-invariant solid-button pair
 * as the rest of the chrome, and no touch floor — it is a graphic, not a control. It paints under
 * the pin (see {@link PIN_CLASSES}), which is the one a pointer has business reaching.
 */
const HERE_CLASSES =
  'block size-5 rounded-full border-[3px] border-riv-solid-btn-fill bg-riv-solid-btn-ink ' +
  'shadow-[0_4px_12px_rgba(7,42,58,0.35)] z-[1]';

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
 * <p>The one marker it draws is the operator's PLACEMENT pin: a null `pin` is no marker at all, a
 * changed pin moves the marker in place, and `mapClick`/`pinMoved` report positions so a placer
 * above the seam can own where the pin belongs without knowing which engine drew it. Discover's
 * venue pins are not the map's: the page draws them itself as an overlay over this box, projected
 * through the live {@link RivieraMap.handle}, so nothing venue-shaped crosses this seam.
 */
@Component({
  selector: 'app-riviera-map',
  imports: [BusyAction, TouchTarget],
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
  private readonly geolocation = inject(GeolocationGateway);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly document = inject(DOCUMENT);
  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly mapEnd = viewChild.required<ElementRef<HTMLElement>>('mapEnd');
  private readonly moveFocus = focusMover();

  /** The camera and fence; the riviera by default, so an unpinned consumer binds nothing. */
  readonly options = input<MapEngineOptions>(RIVIERA_MAP_OPTIONS);
  /** Where the single pin sits, or `null` for none. */
  readonly pin = input<LngLat | null>(null);
  readonly pinDraggable = input(false);
  /** The pin marker's accessible name — the seam leaves the element's a11y to its caller. */
  readonly pinLabel = input('Venue location');
  /**
   * Offer the near-me control. Off by default: a map embedded for a purpose of its own says so,
   * and a browser without the Geolocation API gets no control either way.
   */
  readonly nearMe = input(false);

  readonly mapClick = output<LngLat>();
  readonly pinMoved = output<LngLat>();

  protected readonly status = signal<MapStatus>('booting');

  /** Asked once: a browser does not grow the API mid-session. */
  private readonly canLocate = this.geolocation.supported();
  protected readonly nearMeShown = computed(() => this.nearMe() && this.canLocate);
  protected readonly locating = signal(false);
  private readonly problem = signal<NearMeProblem | null>(null);
  protected readonly nearMeMessage = computed(() => {
    const problem = this.problem();
    return problem === null ? null : NEAR_ME_MESSAGES[problem];
  });

  private readonly live = signal<MapHandle | undefined>(undefined);
  /**
   * The live engine handle: `undefined` until booted or when unavailable, then the one thing a
   * consumer needs to draw over the map itself — project a point, follow the camera, move it.
   */
  readonly handle = this.live.asReadonly();
  private hereMarker: HTMLElement | undefined;
  private hereOnMap = false;
  private marker: HTMLElement | undefined;
  private markerOnMap = false;
  private markerDraggable = false;
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

  /** Where the camera looks now, so a consumer can act on what the viewer is actually looking at. */
  currentCenter(): LngLat | undefined {
    return this.live()?.view().center;
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
    // Read every input before the branch below returns, so the effect keeps tracking them.
    const draggable = this.pinDraggable();
    const element = this.pinElement();
    element.setAttribute('aria-label', this.pinLabel());
    // Only a draggable pin advertises the grab cursor; an undraggable one would promise a gesture.
    element.classList.toggle('cursor-grab', draggable);
    if (this.markerOnMap && this.markerDraggable === draggable) {
      handle.moveMarker(PIN_ID, pin);
      return;
    }
    if (this.markerOnMap) {
      // An engine binds draggability when the marker is added, so a change re-registers it.
      handle.removeMarker(PIN_ID);
    }
    handle.addMarker({ id: PIN_ID, lngLat: pin, element, draggable });
    this.markerOnMap = true;
    this.markerDraggable = draggable;
  }

  /** One element for the life of the component, so a move never detaches what a drag is holding. */
  private pinElement(): HTMLElement {
    this.marker ??= this.buildPinElement();
    return this.marker;
  }

  /**
   * Not a control: the pin is dragged with a pointer, and every keyboard path to it lives in the
   * consumer's own buttons. A focusable element here would announce an action it cannot perform.
   */
  private buildPinElement(): HTMLElement {
    const element = this.document.createElement('div');
    element.setAttribute('role', 'img');
    element.className = PIN_CLASSES;
    element.dataset['testid'] = 'map-pin';
    const glyph = this.document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '\u25cf';
    element.appendChild(glyph);
    // Both engines mount the marker inside the surface they read clicks from.
    element.addEventListener('click', (event) => event.stopPropagation());
    return element;
  }

  /**
   * Ask the browser where the visitor is and centre there. Does nothing before the engine is up,
   * exactly as the zoom buttons do — with no map there is nothing to centre and no prompt worth
   * raising. The position is used here and discarded; it is never sent, stored or logged.
   */
  protected async findMe(): Promise<void> {
    const handle = this.live();
    if (!handle || this.locating()) {
      return;
    }
    this.locating.set(true);
    this.problem.set(null);
    try {
      const outcome = await this.geolocation.locate();
      if (!this.disposed) {
        this.apply(handle, outcome);
      }
    } finally {
      this.locating.set(false);
    }
  }

  private apply(handle: MapHandle, outcome: GeolocationOutcome): void {
    if (outcome.kind !== 'located') {
      this.problem.set(outcome.kind);
    } else if (!withinBounds(outcome.at, this.options().maxBounds)) {
      this.problem.set('off-map');
    } else {
      this.showHere(handle, outcome.at);
    }
  }

  private showHere(handle: MapHandle, at: LngLat): void {
    if (this.hereOnMap) {
      handle.moveMarker(HERE_MARKER, at);
    } else {
      handle.addMarker({ id: HERE_MARKER, lngLat: at, element: this.hereElement() });
      this.hereOnMap = true;
    }
    handle.setView({ center: at, zoom: NEAR_ME_ZOOM });
  }

  /** One element for the life of the component, for the same reason the pin has one. */
  private hereElement(): HTMLElement {
    this.hereMarker ??= this.buildHereElement();
    return this.hereMarker;
  }

  private buildHereElement(): HTMLElement {
    const element = this.document.createElement('div');
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', 'You are here');
    element.className = HERE_CLASSES;
    element.dataset['testid'] = 'map-here';
    // Both engines mount the marker inside the surface they read clicks from.
    element.addEventListener('click', (event) => event.stopPropagation());
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

  /**
   * Dismiss the near-me message without moving the map — a later "Near me" press can raise it
   * again. The teardown takes the dismiss button itself, which just held focus, so it is moved
   * back to the control beside it rather than stranding it on `<body>` (WCAG 2.4.3).
   */
  protected dismissNearMeMessage(): void {
    this.problem.set(null);
    this.moveFocus('map-near-me');
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

function withinBounds(at: LngLat, bounds: readonly [LngLat, LngLat]): boolean {
  const [southWest, northEast] = bounds;
  return (
    at.lng >= southWest.lng &&
    at.lng <= northEast.lng &&
    at.lat >= southWest.lat &&
    at.lat <= northEast.lat
  );
}
