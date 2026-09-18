/**
 * PROTOTYPE — throwaway. Measures the map pane's box live and frames the fixture into it: the
 * camera comes from the pane and the pins (`coast-frame.ts`), never from the shipped constant.
 */
import { DestroyRef, Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

import { LngLat, MapHandle, MapView } from '../../shared/map-engine';
import { Box, bestStretch, describeFrame } from './coast-frame';

@Directive({ selector: '[appProtoPane]', exportAs: 'protoPane' })
export class ProtoPane {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly box = signal<Box>({ width: 0, height: 0 });

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) =>
        this.box.set({ width: entry.contentRect.width, height: entry.contentRect.height }),
      );
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

/** The camera for `points` in `box`: the fit, or the best stretch when the pane cannot hold them all. */
export function cameraFor(
  points: readonly LngLat[],
  box: Box,
  padding: number,
  maxZoom = 16,
): MapView {
  const fit = bestStretch(points, box, padding);
  return { center: fit.center, zoom: Math.min(fit.zoom, maxZoom) };
}

/** Frame `points` into `box` on a booted map, cutting (first frame) or easing (later ones). */
export function frame(
  handle: MapHandle,
  points: readonly LngLat[],
  box: Box,
  padding: number,
  ease: boolean,
  maxZoom = 16,
): void {
  const view = cameraFor(points, box, padding, maxZoom);
  if (ease) {
    handle.easeTo(view);
  } else {
    handle.setView(view);
  }
}

export function readout(points: readonly LngLat[], box: Box, padding: number): string {
  return describeFrame(points, box, padding);
}
