import { Component } from '@angular/core';

/**
 * The back arrow: the way back to the list of beaches, from a venue's map and from My bookings.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-arrow-left-icon',
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
    stroke-linejoin="round"
  >
    <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />
  </svg>`,
})
export class ArrowLeftIcon {}
