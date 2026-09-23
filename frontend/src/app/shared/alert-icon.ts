import { Component } from '@angular/core';

/**
 * The warning triangle: something failed or ran out — inside `appFailureIcon`'s medallion on a
 * load failure, and inline in the sentence that says a request expired under the operator.
 *
 * <p>Zero API surface — `shared/clock-icon.ts` explains the shape.
 */
@Component({
  selector: 'app-alert-icon',
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
    <path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4.5M12 17.5h.01" />
  </svg>`,
})
export class AlertIcon {}
