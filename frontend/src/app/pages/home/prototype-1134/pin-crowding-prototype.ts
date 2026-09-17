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
import { VariantStackFan } from './variant-stack-fan';
import { VariantStackSheet } from './variant-stack-sheet';
import { VariantTetheredFan } from './variant-tethered-fan';

/**
 * THROWAWAY PROTOTYPE (issue #1134) — the plumbing the three variants sit on, and nothing that
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
  imports: [VariantStackFan, VariantStackSheet, VariantTetheredFan],
  host: {
    class: 'pointer-events-none absolute inset-0 z-[4] block',
    '(document:keydown.escape)': 'dismiss()',
  },
  template: `
    @switch (variant()) {
      @case ('A') {
        <app-variant-stack-fan
          [clusters]="clusters()"
          [selected]="selected()"
          (chosen)="chosen.emit($event)"
        />
      }
      @case ('B') {
        <app-variant-stack-sheet
          [clusters]="clusters()"
          [selected]="selected()"
          (chosen)="chosen.emit($event)"
        />
      }
      @case ('C') {
        <app-variant-tethered-fan
          [clusters]="clusters()"
          [selected]="selected()"
          (chosen)="chosen.emit($event)"
        />
      }
    }
  `,
})
export class PinCrowdingPrototype {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fan = viewChild(VariantStackFan);
  private readonly sheet = viewChild(VariantStackSheet);

  readonly pins = input.required<readonly PrototypePin[]>();
  readonly map = input<MapHandle | undefined>(undefined);
  readonly variant = input.required<PrototypeVariantKey>();
  readonly selected = input<string | null>(null);
  readonly chosen = output<string>();

  /** Bumped whenever the projection could have changed; the only thing `clusters` recomputes on. */
  private readonly tick = signal(0);

  protected readonly clusters = computed(() => {
    const handle = this.map();
    this.tick();
    return handle ? clusterPins(this.pins(), (at) => handle.project(at)) : [];
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
    const observer = new ResizeObserver(() => this.bump());
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private bump(): void {
    this.tick.update((value) => value + 1);
  }

  protected dismiss(): void {
    this.fan()?.restack();
    this.sheet()?.close();
  }
}
