import { Component } from '@angular/core';

/**
 * The beach umbrella: a beach — the Discover head's beaches chip, and the medallion that says a
 * venue is gone.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-umbrella-icon',
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
    <path d="M3 12a9 8.5 0 0 1 18 0Z" />
    <path d="M12 12v8.5M12 3.5V2.5M9 21h6" />
  </svg>`,
})
export class UmbrellaIcon {}
