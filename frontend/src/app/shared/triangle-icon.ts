import { Component } from '@angular/core';

/**
 * The solid triangle: a direction on the beach map's orientation banners — up to the sea, and,
 * turned by the call site's `[&_svg]:rotate-180`, down to the promenade. Filled rather than
 * stroked, a marker rather than a control.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-triangle-icon',
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
    <path d="M12 5 20.5 19h-17L12 5Z" fill="currentColor" />
  </svg>`,
})
export class TriangleIcon {}
