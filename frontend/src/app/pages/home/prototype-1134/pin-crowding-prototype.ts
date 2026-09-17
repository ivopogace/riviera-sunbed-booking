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
  signal,
  viewChild,
} from '@angular/core';

import { MapHandle } from '../../../shared/map-engine';
import { clusterPins, PrototypePin } from './pin-crowding';
import { PrototypeVariantKey } from './prototype-variant';
import { CrowdStack, PlaceLanding, PlaceTravel, VariantPlacePill } from './variant-place-pill';

/**
 * THROWAWAY PROTOTYPE — the plumbing the variants sit on, and nothing that
 * decides how any of them looks.
 *
 * <p>It is a plain Angular overlay stretched over the map's own box, drawing every pin itself in
 * light DOM at projected screen coordinates rather than handing markers to the engine. That is the
 * prototype's central bet: `@for … track` keeps a pin's element across a re-group, so the
 * "re-adding a marker detaches its element" constraint the issue records never applies. The engine
 * keeps the basemap, the camera and the gestures; the pin layer becomes ordinary Angular.
 *
 * <p>The host is `pointer-events-none` so pans and zooms pass straight through to the canvas; each
 * variant re-arms pointer events on its own controls.
 */
@Component({
  selector: 'app-pin-crowding-prototype',
  imports: [VariantPlacePill],
  host: {
    class: 'pointer-events-none absolute inset-0 z-[4] block',
    '(document:keydown.escape)': 'dismiss()',
  },
  template: `
    @switch (variant()) {
      @case ('E') {
        <app-variant-place-pill
          [clusters]="clusters()"
          [selected]="selected()"
          [bounds]="size()"
          [zoom]="zoom()"
          [maxZoom]="maxZoom()"
          (chosen)="chosen.emit($event)"
          (travelled)="travelled.emit($event)"
          (landed)="landed.emit($event)"
        />
      }
    }
  `,
})
export class PinCrowdingPrototype {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pill = viewChild(VariantPlacePill);

  readonly pins = input.required<readonly PrototypePin[]>();
  readonly map = input<MapHandle | undefined>(undefined);
  readonly variant = input.required<PrototypeVariantKey>();
  readonly selected = input<string | null>(null);
  /** The map's zoom ceiling, for a variant that moves the camera. */
  readonly maxZoom = input.required<number>();
  readonly chosen = output<string>();
  /** A place was pressed — the page moves the camera and narrows the list. */
  readonly travelled = output<PlaceTravel>();
  /** A place that cannot separate further opens its first venue; the list narrows to the beach. */
  readonly landed = output<PlaceLanding>();

  /** The stepper for the open crowd, which the page hands to its preview card; else `null`. */
  readonly stack = computed<CrowdStack | null>(() => this.pill()?.stack() ?? null);

  /** Bumped whenever the projection could have changed; the only thing `clusters` recomputes on. */
  private readonly tick = signal(0);

  /** The map box's current size, for a variant that must know where the box ends. */
  protected readonly size = signal({ x: Infinity, y: Infinity });

  protected readonly clusters = computed(() => {
    const handle = this.map();
    this.tick();
    return handle ? clusterPins(this.pins(), (at) => handle.project(at)) : [];
  });

  /** The camera's zoom as of the last tick. */
  protected readonly zoom = computed(() => {
    this.tick();
    return this.map()?.view().zoom ?? 0;
  });

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect((onCleanup) => {
      const handle = this.map();
      if (!handle) {
        return;
      }
      const offMove = handle.onMove(() => this.bump());
      const offLoad = handle.on('load', () => this.bump());
      onCleanup(() => {
        offMove();
        offLoad();
      });
    });
    afterNextRender(() => this.watchSize());
  }

  /** A resized map re-projects every pin, and no engine reports that as a camera move. */
  private watchSize(): void {
    const observer = new ResizeObserver(([entry]) => {
      this.size.set({ x: entry.contentRect.width, y: entry.contentRect.height });
      this.bump();
    });
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private bump(): void {
    this.tick.update((value) => value + 1);
  }

  /**
   * Escape. The page closes the preview itself; here the pin that opened it takes focus back,
   * because the engine holds no pins in prototype mode for the page's own `focusPin` to reach.
   */
  protected dismiss(): void {
    if (this.selected() !== null) {
      this.host.nativeElement.querySelector<HTMLElement>('button[aria-expanded="true"]')?.focus();
    }
  }
}
