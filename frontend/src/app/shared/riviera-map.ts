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
import { FOOT_CREDIT_PLACEMENT, FOOT_CREDIT_PLACEMENT_SWAPPED, MapCredit } from './map-credit';
import { LngLat, MapEngine, MapEngineOptions, MapHandle } from './map-engine';
import { RIVIERA_MAP_OPTIONS } from './riviera-map-options';
import { TouchTarget } from './touch-target';
import { CrossIcon } from './cross-icon';

type MapStatus = 'booting' | 'ready' | 'unavailable';

/** The map carries at most one pin, so its marker id is a constant rather than an input. */
const PIN_ID = 'venue-location-pin';

/**
 * The pin: 44 px both axes (a drag target's floor), in the theme-invariant solid-button skin (on
 * imagery). `z-[2]` paints it over the you-are-here dot, which would swallow the drag where the
 * two coincide, as neither engine orders markers; both stay below the chrome column's `z-10`.
 */
const PIN_CLASSES =
  'inline-flex size-11 touch-manipulation items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill text-[20px] leading-none ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] z-[2]';

/** The visitor's own position, which is never the venue pin — a second marker, its own id. */
export const HERE_MARKER = 'you-are-here';

/**
 * The controls the map draws over its own imagery. A consumer drawing its own marks over this box
 * (Discover's pin layer) has to keep them off these, and asks for their boxes rather than reaching
 * into this component's DOM for them.
 */
const CHROME_SELECTOR =
  '[data-testid="map-near-me"], [data-testid="map-attribution"], ' +
  '[data-testid="map-zoom-in"], [data-testid="map-zoom-out"], ' +
  '[data-testid="map-near-me-message"], [data-testid="map-unavailable"]';

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
export type NearMeProblem = GeolocationFailure | 'off-map';

/** One short sentence each, all of them saying the map stayed where the visitor left it. */
export const NEAR_ME_MESSAGES: Record<NearMeProblem, string> = {
  denied: 'Location permission was declined. The map hasn’t moved.',
  unavailable: 'Your location isn’t available right now.',
  timeout: 'Finding your location took too long. Try again.',
  'off-map': 'You don’t seem to be on the Albanian riviera — the map hasn’t moved.',
};

/**
 * The you-are-here dot: an ink disc in a light ring, every map's "you", not read as a venue pin.
 * The theme-invariant solid-button pair; no touch floor (a graphic, not a control). It paints under
 * the pin ({@link PIN_CLASSES}), the one a pointer must reach.
 */
const HERE_CLASSES =
  'block size-5 rounded-full border-[3px] border-riv-solid-btn-fill bg-riv-solid-btn-ink ' +
  'shadow-[0_4px_12px_rgba(7,42,58,0.35)] z-[1]';

/**
 * The **riviera map** (`CONTEXT.md`) over the injected `MapEngine`, filling the box its consumer
 * sizes, with theme-invariant chrome (the imagery never themes): a skip control, as the canvas is a
 * focusable pan-and-zoom surface and the venue list stays the accessible path; zoom buttons at the
 * touch floor; the credit the tiles' licences require. A `ribbon` keeps only the credit. E2e waits
 * on `data-status`. It draws only the placement pin (`null` is none; a change moves it in place);
 * Discover overlays venue pins through {@link RivieraMap.handle}, so nothing venue-shaped crosses.
 */
@Component({
  selector: 'app-riviera-map',
  imports: [BusyAction, MapCredit, TouchTarget, CrossIcon],
  host: {
    class: 'relative block overflow-hidden bg-riv-solid-btn-fill',
    // A ribbon's corners are its consumer's: the map's own would round the imagery inside them.
    '[class]': 'ribbon() ? "" : "rounded-[26px]"',
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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
  /**
   * The phone chrome: the map's controls on one row at its foot, this many px up from the map's
   * bottom edge — the credit at one end, wrapped to 200 px, no zoom column (a pinch zooms), and
   * the consumer's own control at the other. `null` is the shipped column.
   */
  readonly foot = input<number | null>(null);
  /** The foot row has changed sides for a lone pin under it: the credit goes right (`footSwap`). */
  readonly footSwapped = input(false);
  /**
   * A bare ribbon: the map as a picture its consumer marks up and hides from assistive technology.
   * No skip control, control column or unavailable notice; the credit at the foot at 10 px, links
   * out of the tab order; the engine non-interactive.
   */
  readonly ribbon = input(false);

  readonly mapClick = output<LngLat>();
  readonly pinMoved = output<LngLat>();

  protected readonly status = signal<MapStatus>('booting');
  /** The style and its first tiles are on screen — what a consumer holding a still over the map waits for. */
  readonly loaded = computed(() => this.status() === 'ready');

  /** Asked once: a browser does not grow the API mid-session. */
  private readonly canLocate = this.geolocation.supported();
  protected readonly nearMeShown = computed(() => this.nearMe() && this.canLocate);
  protected readonly locating = signal(false);
  private readonly problem = signal<NearMeProblem | null>(null);
  protected readonly nearMeMessage = computed(() => {
    const problem = this.problem();
    return problem === null ? null : NEAR_ME_MESSAGES[problem];
  });

  protected readonly footChrome = computed(() => this.foot() !== null);
  /** The engine's options: the consumer's, with a ribbon's input switched off. */
  private readonly engineOptions = computed<MapEngineOptions>(() =>
    this.ribbon() ? { ...this.options(), interactive: false } : this.options(),
  );
  /**
   * The credit's place, padding and leading together (two utilities for one property would
   * resolve by stylesheet order): the shipped bottom-right corner; the foot row's left; or a
   * ribbon's foot, at 10 px so it wraps to three lines in 150 px.
   */
  protected readonly creditPlacement = computed(() => {
    if (this.ribbon()) {
      return 'left-2 bottom-2 max-w-[calc(100%-16px)] px-[6px] py-[2px] text-[10px] leading-[14px]';
    }
    if (this.footChrome()) {
      return this.footSwapped() ? FOOT_CREDIT_PLACEMENT_SWAPPED : FOOT_CREDIT_PLACEMENT;
    }
    return 'right-3 bottom-3 max-w-[calc(100%-24px)] px-[10px] py-[4px] text-[12px] leading-[16px]';
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

  /**
   * The controls now drawn over the imagery, in viewport coordinates, for a consumer's overlay to
   * avoid. Measured per call, not watched (the consumer knows when its geometry moved); a control
   * laid out to nothing (every one under jsdom) is left out, not reported as a box at 0.
   */
  chromeBoxes(): readonly DOMRect[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>(CHROME_SELECTOR)]
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
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
      handle = await this.engine.create(this.canvasHost().nativeElement, this.engineOptions());
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

/** The fence rule: inside the ADR-0022 extract or not a place the map can open on. */
export function withinBounds(at: LngLat, bounds: readonly [LngLat, LngLat]): boolean {
  const [southWest, northEast] = bounds;
  return (
    at.lng >= southWest.lng &&
    at.lng <= northEast.lng &&
    at.lat >= southWest.lat &&
    at.lat <= northEast.lat
  );
}
