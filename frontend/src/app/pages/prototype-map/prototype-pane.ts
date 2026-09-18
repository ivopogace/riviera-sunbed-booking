import { afterNextRender, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';

import { PaneBox } from './prototype-camera';

/**
 * PROTOTYPE. Reports its host's rendered box, so a variant derives its camera from the pane it
 * actually got rather than from a constant. The map is only created once a box exists
 * (`@if (pane.box(); as box)`), because `app-riviera-map` reads its options once, at boot — a
 * camera computed before the pane was measured would be the very mistake this spike is about.
 */
@Directive({ selector: '[appPane]', exportAs: 'pane' })
export class Pane {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly box = signal<PaneBox | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const read = (): void => {
        const rect = element.getBoundingClientRect();
        this.box.set({ width: Math.round(rect.width), height: Math.round(rect.height) });
      };
      read();
      if (typeof ResizeObserver !== 'function') {
        return;
      }
      const observer = new ResizeObserver(read);
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
