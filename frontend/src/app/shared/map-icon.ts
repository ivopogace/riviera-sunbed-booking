import { Component } from '@angular/core';

/**
 * The folded-map mark on the Discover sheet's `Show map` pill, the way back down to the ground.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape. A map and not a target,
 * because the crosshair is Near me's and sits on the same screen.
 */
@Component({
  selector: 'app-map-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>`,
})
export class MapIcon {}
