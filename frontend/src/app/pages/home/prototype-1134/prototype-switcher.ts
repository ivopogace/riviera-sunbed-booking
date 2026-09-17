import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { TouchTarget } from '../../../shared/touch-target';
import { PROTOTYPE_VARIANTS, PrototypeVariantKey, stepVariant } from './prototype-variant';

/**
 * THROWAWAY PROTOTYPE (issue #1134) — the floating bar that walks the variants.
 *
 * <p>Deliberately NOT in the app's own visual language: a flat, hard-edged, near-black pill that
 * could not be mistaken for a design under evaluation. It writes `?variant=` through the router, so
 * every variant is a shareable, reload-stable URL, and `←`/`→` walk them — except while a field has
 * focus, where the arrows belong to the field.
 *
 * <p>Self-gated on a production build, so a stray merge cannot ship it.
 */
@Component({
  selector: 'app-prototype-switcher',
  imports: [TouchTarget],
  host: {
    class: 'fixed bottom-4 left-1/2 z-50 -translate-x-1/2',
    '(document:keydown.arrowLeft)': 'walk($event, -1)',
    '(document:keydown.arrowRight)': 'walk($event, 1)',
  },
  template: `
    @if (shown) {
      <div
        class="flex items-center gap-1 rounded-[10px] border border-[#3d4a52] bg-[#11181c] p-1 text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
        role="group"
        aria-label="Prototype variant"
      >
        <button
          type="button"
          appTouchTarget
          class="inline-flex touch-manipulation items-center justify-center rounded-[6px] px-3 text-[17px] leading-none text-white hover:bg-[#232e34] focus-visible:outline-white"
          aria-label="Previous variant"
          (click)="go(-1)"
        >
          <span aria-hidden="true">&#x2190;</span>
        </button>
        <p class="px-2 text-center text-[13px] leading-[1.35] whitespace-nowrap">
          <strong class="font-bold">{{ current().key }} — {{ current().name }}</strong>
          <span class="block text-[11px] text-[#9fb0b8]">{{ current().claim }}</span>
        </p>
        <button
          type="button"
          appTouchTarget
          class="inline-flex touch-manipulation items-center justify-center rounded-[6px] px-3 text-[17px] leading-none text-white hover:bg-[#232e34] focus-visible:outline-white"
          aria-label="Next variant"
          (click)="go(1)"
        >
          <span aria-hidden="true">&#x2192;</span>
        </button>
      </div>
    }
  `,
})
export class PrototypeSwitcher {
  private readonly router = inject(Router);

  readonly variant = input.required<PrototypeVariantKey>();

  protected readonly shown = !environment.production;

  protected readonly current = computed(
    () => PROTOTYPE_VARIANTS.find((entry) => entry.key === this.variant()) ?? PROTOTYPE_VARIANTS[0],
  );

  protected go(by: 1 | -1): void {
    void this.router.navigate([], {
      queryParams: { variant: stepVariant(this.variant(), by) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected walk(event: Event, by: 1 | -1): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    this.go(by);
  }
}
