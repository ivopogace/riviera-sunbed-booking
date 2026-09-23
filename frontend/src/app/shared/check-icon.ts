import { Component } from '@angular/core';

/**
 * The check: done — the success medallion (a confirmed booking, a landed sign-in, an empty
 * request queue) and a staff-marked set on the daily view.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-check-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>`,
})
export class CheckIcon {}
