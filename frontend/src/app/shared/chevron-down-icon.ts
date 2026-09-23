import { Component } from '@angular/core';

/**
 * The disclosure chevron: this control opens a choice below it — the Discover head's place, its
 * spelled-out beaches chip and its day.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-chevron-down-icon',
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
    <path d="m6 9 6 6 6-6" />
  </svg>`,
})
export class ChevronDownIcon {}
