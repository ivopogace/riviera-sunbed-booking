import { Component } from '@angular/core';

/**
 * The rain cloud: the operator's weather refund, the one refund the venue — not the guest's
 * cancellation window — decides.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-rain-icon',
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
    <path d="M7 15.5a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.4 9 3.3 3.3 0 0 1 17.5 15.5H7Z" />
    <path d="m8.5 18.5-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2" />
  </svg>`,
})
export class RainIcon {}
