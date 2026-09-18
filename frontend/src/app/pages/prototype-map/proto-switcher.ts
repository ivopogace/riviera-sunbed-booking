/**
 * PROTOTYPE — throwaway. The deliberately ugly floating switcher: obviously not part of any variant.
 * Arrows and ←/→ cycle the variant through the URL; the readout prints the live map frame numbers.
 */
import { Component, inject, input } from '@angular/core';

import { TouchTarget } from '../../shared/touch-target';

import { environment } from '../../../environments/environment';
import { ProtoState, VARIANTS, Variant } from './proto-state';

@Component({
  selector: 'app-proto-switcher',
  imports: [TouchTarget],
  host: {
    class: 'contents',
    '(document:keydown.arrowleft)': 'onArrow($event, -1)',
    '(document:keydown.arrowright)': 'onArrow($event, 1)',
  },
  template: `
    @if (shown) {
      <div
        class="fixed bottom-[calc(66px+env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-16px)] -translate-x-1/2 flex-col items-center gap-1 rounded-[4px] border-[3px] border-dashed border-[#ff00aa] bg-[#ffff00] px-2 py-1 font-mono text-[12px] text-black shadow-[4px_4px_0_#ff00aa] sm:bottom-3"
        data-testid="proto-switcher"
      >
        <div class="flex items-center gap-2">
          <button
            type="button"
            appTouchTarget
            class="min-h-11 min-w-11 cursor-pointer bg-[#ff00aa] px-2 font-bold text-white"
            (click)="step(-1)"
            aria-label="Previous variant"
          >
            ◀
          </button>
          <span class="font-bold uppercase">
            {{ current().toUpperCase() }} · {{ nameOf(current()) }}
          </span>
          <button
            type="button"
            appTouchTarget
            class="min-h-11 min-w-11 cursor-pointer bg-[#ff00aa] px-2 font-bold text-white"
            (click)="step(1)"
            aria-label="Next variant"
          >
            ▶
          </button>
        </div>
        <div class="hidden flex-wrap justify-center gap-1 sm:flex">
          @for (v of variants; track v.key) {
            <button
              type="button"
              appTouchTarget
              class="cursor-pointer border border-black px-2"
              [class]="v.key === current() ? 'bg-black text-[#ffff00]' : 'bg-white'"
              (click)="go(v.key)"
            >
              {{ v.key.toUpperCase() }}
            </button>
          }
        </div>
        @if (readout(); as text) {
          <p
            class="hidden max-w-[560px] text-center text-[11px] leading-[1.3] sm:block"
            data-testid="proto-readout"
            [attr.data-readout]="text"
          >
            {{ text }}
          </p>
        }
      </div>
    }
  `,
})
export class ProtoSwitcher {
  private readonly state = inject(ProtoState);
  protected readonly variants = VARIANTS;
  protected readonly shown = !environment.production;
  readonly readout = input<string>('');
  readonly current = input.required<Variant>();

  protected nameOf(key: Variant): string {
    return VARIANTS.find((v) => v.key === key)?.name ?? '';
  }

  protected step(delta: number): void {
    const at = VARIANTS.findIndex((v) => v.key === this.current());
    this.go(VARIANTS[(at + delta + VARIANTS.length) % VARIANTS.length].key);
  }

  protected go(key: Variant): void {
    this.state.set({ variant: key, venue: null, sheet: null, zoomed: null });
  }

  protected onArrow(event: Event, delta: number): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable], [role="dialog"], .maplibregl-canvas',
      )
    ) {
      return;
    }
    this.step(delta);
  }
}
