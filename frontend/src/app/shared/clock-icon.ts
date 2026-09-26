import { Component } from '@angular/core';

/**
 * The clock: a time running out (the beach-map header's sales-close note, the operator request
 * queue's urgent time-left chip). The inline-SVG glyph contract, `riviera-tailwind` § Icons: a
 * component, since a directive can't carry SVG geometry (ICON-1). Zero API surface: the stroke is
 * `currentColor` and the size a presentation attribute, so a call site resizes with
 * `[&_svg]:size-[…]`, no `input()` (ICON-2–4); a `contents` host keeps the svg the flex child;
 * `aria-hidden` on host and svg, the note's sentence carries the meaning. Never an emoji (ICON-7).
 */
@Component({
  selector: 'app-clock-icon',
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
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>`,
})
export class ClockIcon {}
