import { Component } from '@angular/core';

/**
 * The hourglass: waiting on someone else — the pending outcome medallion, a request awaiting the
 * venue, an operator account awaiting approval.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-hourglass-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M6 3h12M6 21h12" />
    <path d="M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9" />
  </svg>`,
})
export class HourglassIcon {}
