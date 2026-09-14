import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  PendingTasks,
  signal,
  viewChild,
} from '@angular/core';

import { MapEngine, MapEngineOptions, MapHandle } from './map-engine';
import { TouchTarget } from './touch-target';

/**
 * The riviera as the map opens: centred on the coast between Vlorë and Ksamil, at a zoom that
 * shows the whole stretch, and fenced so a tourist cannot pan out of the extract into blank sea.
 * The style is a same-origin path (ADR-0022); the real adapter prefixes it with the API origin
 * where the SPA is served elsewhere.
 */
export const RIVIERA_MAP_OPTIONS: MapEngineOptions = {
  styleUrl: '/map/style.json',
  view: { center: { lng: 19.75, lat: 40.05 }, zoom: 8.6 },
  minZoom: 7,
  maxZoom: 16,
  maxBounds: [
    { lng: 19.0, lat: 39.3 },
    { lng: 20.5, lat: 40.8 },
  ],
};

type MapStatus = 'booting' | 'ready' | 'unavailable';

/**
 * The **riviera map** — the geographic discovery map, as distinct from a venue's beach map.
 * Renders whatever engine is provided (`MapEngine`) into its canvas host and owns the chrome
 * around it: a skip control for keyboard and screen-reader users (the map canvas is a focusable
 * pan-and-zoom surface, and the venue list stays the fully accessible path), labelled zoom
 * buttons at the touch-target floor, and the permanent "© OpenStreetMap contributors" attribution
 * (ODbL). Wears the theme-invariant solid-button skin: the imagery under it never themes.
 *
 * <p>The host reports its state as `data-status` (`booting` → `ready` once the style has loaded,
 * or `unavailable` when the browser cannot render a map), which is what the e2e waits on. The
 * consumer sizes the host; the map fills it.
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
  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly mapEnd = viewChild.required<ElementRef<HTMLElement>>('mapEnd');

  protected readonly status = signal<MapStatus>('booting');

  private handle: MapHandle | undefined;
  private disposed = false;

  constructor() {
    afterNextRender(() => {
      void this.pendingTasks.run(() => this.boot());
    });
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.handle?.destroy();
    });
  }

  /** The live engine handle, for specs driving the fake; `undefined` until booted or when unavailable. */
  currentHandle(): MapHandle | undefined {
    return this.handle;
  }

  protected zoomIn(): void {
    this.handle?.zoomIn();
  }

  protected zoomOut(): void {
    this.handle?.zoomOut();
  }

  /** Bypass block (WCAG 2.4.1): land focus just past the map, on the way to whatever follows it. */
  protected skipMap(): void {
    this.mapEnd().nativeElement.focus();
  }

  private async boot(): Promise<void> {
    let handle: MapHandle;
    try {
      handle = await this.engine.create(this.canvasHost().nativeElement, RIVIERA_MAP_OPTIONS);
    } catch {
      this.status.set('unavailable');
      return;
    }
    if (this.disposed) {
      handle.destroy();
      return;
    }
    this.handle = handle;
    handle.on('load', () => this.status.set('ready'));
  }
}
