import { Component, input, output } from '@angular/core';

// Tailwind twin of the retired shared/_glass.scss `failure-retry` + `retry-focus-ring` mixins (spike:
// SCSS-vs-Tailwind comparison). A component, not a mixin — Tailwind has no CSS-level sharing
// primitive, so reuse across home.ts/venue-map.ts moves to the component layer instead.
@Component({
  selector: 'app-retry-button',
  template: `
    <button
      type="button"
      class="cursor-pointer rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) px-6.5 py-3 text-[14.5px] font-bold text-white shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] transition hover:brightness-[1.06] motion-reduce:transition-none focus-visible:shadow-[0_0_0_7px_color-mix(in_srgb,var(--riv-accent-ink)_90%,transparent)] focus-visible:outline-[3px] focus-visible:outline-white focus-visible:outline-offset-2"
      [attr.data-testid]="testId()"
      (click)="retry.emit()"
    >
      {{ label() }}
    </button>
  `,
})
export class RetryButton {
  readonly label = input('Try again');
  readonly testId = input.required<string>();
  readonly retry = output<void>();
}
