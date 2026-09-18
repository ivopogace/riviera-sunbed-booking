import { Component, computed, inject } from '@angular/core';

import { TouchTarget } from '../../shared/touch-target';

import { PrototypeState, VARIANT_NAMES, VARIANTS } from './prototype-state';

/**
 * PROTOTYPE. The deliberately ugly variant switcher — magenta, monospaced and unmistakably not
 * part of any design under evaluation. Arrows cycle and wrap, `←`/`→` do the same from the
 * keyboard (never while a field is focused), and the URL is the source of truth so every screen
 * stays linkable.
 *
 * <p>It also prints the measurement the whole spike turns on: the map pane's rendered box, the
 * zoom floor the fence imposes on a box that shape, the camera's actual zoom, and how much of the
 * 230 km coast that frames. Every screenshot therefore carries its own evidence.
 */
@Component({
  selector: 'app-prototype-switcher',
  imports: [TouchTarget],
  host: {
    class:
      'fixed z-[999] flex items-center gap-2 rounded-md border-4 border-dashed border-[#ff00aa] ' +
      'bg-[#12001a] px-2 py-1 font-mono text-[#ffe6ff] shadow-[0_8px_30px_rgba(0,0,0,0.6)] ' +
      // On the phone it rides the header, which is the shell's and already measured; the bottom
      // of the screen is the sheet, which is the thing being judged.
      'max-sm:inset-x-1 max-sm:top-1 max-sm:text-[9px] ' +
      // On desktop it takes the map's own bottom-right corner rather than the middle of the
      // screen: every variant puts something being judged along the bottom edge.
      'sm:right-2 sm:bottom-2 sm:max-w-[520px] sm:flex-wrap sm:text-[11px]',
    '(document:keydown.arrowLeft)': 'onKey($event, -1)',
    '(document:keydown.arrowRight)': 'onKey($event, 1)',
  },
  template: `
    <button
      type="button"
      appTouchTarget
      class="inline-flex items-center justify-center px-2 text-[16px] leading-none"
      (click)="step(-1)"
    >
      ‹
    </button>
    <span class="text-center font-bold uppercase sm:min-w-[170px]"
      >{{ state.variant() }} · {{ name() }}</span
    >
    <button
      type="button"
      appTouchTarget
      class="inline-flex items-center justify-center px-2 text-[16px] leading-none"
      (click)="step(1)"
    >
      ›
    </button>
    @if (frame(); as f) {
      <span class="border-l-2 border-[#ff00aa] pl-2 tabular-nums max-sm:leading-[11px]"
        >pane {{ f.pane }} · floor z{{ f.floor }} · now z{{ f.zoom }} · frames {{ f.km }} km
        {{ f.holdsCoast ? '· whole coast fits' : '· coast CROPPED' }}</span
      >
    }
  `,
})
export class PrototypeSwitcher {
  protected readonly state = inject(PrototypeState);

  protected readonly name = computed(() => VARIANT_NAMES[this.state.variant()]);

  protected readonly frame = computed(() => {
    const measured = this.state.measurement();
    if (!measured) {
      return null;
    }
    return {
      pane: `${measured.width}×${measured.height}`,
      floor: measured.frame.floor.toFixed(2),
      zoom: measured.frame.zoom.toFixed(2),
      km: Math.round(measured.frame.km),
      holdsCoast: measured.frame.holdsCoast,
    };
  });

  protected step(direction: number): void {
    const at = VARIANTS.indexOf(this.state.variant());
    const next = VARIANTS[(at + direction + VARIANTS.length) % VARIANTS.length];
    this.state.patch({ variant: next, venue: null, beach: null, at: null, sheet: null });
  }

  protected onKey(event: Event, direction: number): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    this.step(direction);
  }
}
