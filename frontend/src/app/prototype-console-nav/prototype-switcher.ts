import { Component, computed, inject, isDevMode } from '@angular/core';

import { TouchTarget } from '../shared/touch-target';
import { PrototypeConsoleNavVariant } from './prototype-console-nav-variant';

const ARROW =
  'inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-[18px] leading-none text-white hover:bg-white/15 focus-visible:outline-white';

/**
 * PROTOTYPE — the floating variant switcher (bottom-centre, deliberately not part of the design
 * under evaluation). Arrows and ←/→ keys cycle; the choice lands in the URL as `?variant=`.
 * Renders nothing in a production build. Sits above the phone bottom bars of the variants that
 * have one (`c`), so it never covers the control being judged.
 */
@Component({
  selector: 'app-prototype-switcher',
  imports: [TouchTarget],
  host: {
    '(document:keydown.arrowleft)': 'onArrow($event, -1)',
    '(document:keydown.arrowright)': 'onArrow($event, 1)',
  },
  template: `
    @if (devMode) {
      <div
        class="fixed bottom-4 left-1/2 z-70 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#111827] py-1 pr-1 pl-4 font-mono text-[12px] text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/20"
        [class]="variants.variant() === 'c' ? 'max-lg:bottom-[80px]' : ''"
        data-testid="prototype-switcher"
        data-touch-exempt="prototype tooling, not a product control"
      >
        <span class="mr-2 text-[10px] font-bold tracking-[0.16em] text-amber-300 uppercase"
          >Prototype</span
        >
        <button
          appTouchTarget
          type="button"
          [class]="arrow"
          aria-label="Previous nav variant"
          (click)="variants.cycle(-1)"
        >
          &lsaquo;
        </button>
        <span class="max-w-[420px] min-w-[220px] text-center whitespace-nowrap" aria-live="polite">
          <strong class="text-amber-300 uppercase">{{ variants.variant() }}</strong>
          <span class="opacity-60"> {{ position() }} </span>
          &middot; {{ label() }}
        </span>
        <button
          appTouchTarget
          type="button"
          [class]="arrow"
          aria-label="Next nav variant"
          (click)="variants.cycle(1)"
        >
          &rsaquo;
        </button>
      </div>
    }
  `,
})
export class PrototypeSwitcher {
  protected readonly devMode = isDevMode();
  protected readonly arrow = ARROW;
  protected readonly variants = inject(PrototypeConsoleNavVariant);

  protected readonly label = computed(
    () =>
      this.variants.options.find((option) => option.key === this.variants.variant())?.name ?? '',
  );

  protected readonly position = computed(() => {
    const index = this.variants.options.findIndex(
      (option) => option.key === this.variants.variant(),
    );
    return `${index + 1}/${this.variants.options.length}`;
  });

  protected onArrow(event: Event, step: 1 | -1): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    this.variants.cycle(step);
  }
}
