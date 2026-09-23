import { Component } from '@angular/core';

/**
 * The cross: the mark on every close and dismiss control, and the failed-payment medallion's.
 * Never a `✕`/`×` character — two codepoints for one job, each drawn by whatever symbol font the
 * platform has (`pictorial-glyph-sweep.spec.ts` holds the line).
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape. A call site resizes with
 * `[&_svg]:size-[15px]`.
 */
@Component({
  selector: 'app-cross-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>`,
})
export class CrossIcon {}
