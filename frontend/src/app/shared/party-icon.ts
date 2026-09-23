import { Component } from '@angular/core';

/**
 * The party popper: good news the guest was waiting for — a request the venue accepted.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-party-icon',
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
    <path d="M4 20 8.5 9l6.5 6.5L4 20Z" />
    <path
      d="M14 3.5v2M20.5 10h-2M18.5 5.5l-1.5 1.5M11.5 8c0-2 1-3 2.5-3.5M16 12.5c2-.5 3 0 3.5 1.5"
    />
  </svg>`,
})
export class PartyIcon {}
