import { Component } from '@angular/core';

/**
 * The padlock glyph a beach-map cell wears when a live claim pins its set (the operator's layout
 * editor and set editor). An inline SVG on `currentColor`, on the `clock-icon.ts` contract: no
 * inputs — the stroke follows the cell's own ink, and the size is a presentation attribute every
 * call-site class outranks (`[&_svg]:size-[9px]`); the host is `display: contents` so the svg is
 * what the cell lays out; `aria-hidden` at the host and the svg, because the cell's accessible
 * description carries the meaning.
 */
@Component({
  selector: 'app-lock-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="4" y="10.5" width="16" height="11" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>`,
})
export class LockIcon {}
