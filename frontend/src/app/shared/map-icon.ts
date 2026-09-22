import { Component } from '@angular/core';

/**
 * The folded-map mark on the Discover sheet's `Show map` pill, the way back down to the ground.
 *
 * <p>An inline SVG on `currentColor`, chosen over the ⌖ (U+2316 POSITION INDICATOR) the pill
 * carried. ⌖ is an obscure Miscellaneous-Technical codepoint with thin font coverage, so it is
 * served by a fallback symbol font — or not at all — and it depicted a target, which is what Near
 * me means on the same screen. A map, for the button that shows the map: the pill's glyph and its
 * word now say the same thing, and the crosshair belongs to one action only.
 *
 * <p>Zero API surface — see `shared/clock-icon.ts` for why: `currentColor` takes the pill's ink,
 * the size is a presentation attribute a call-site class outranks, and `display: contents` keeps
 * the svg the direct flex child the pill's `gap-2` spaces. `aria-hidden` on the host AND the svg:
 * the pill's word is its accessible name.
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
