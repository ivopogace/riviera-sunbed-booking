import { Component } from '@angular/core';

/**
 * The "where I am" crosshair: Near me's own mark, on the sheet's and the desktop panel's buttons,
 * the coast picker's, and the head's located indicator.
 *
 * <p>An inline SVG on `currentColor`, chosen over the ◎ (U+25CE BULLSEYE) these carried. Two
 * reasons, both about this mark rather than a rule against glyphs (`shared/clock-icon.ts` makes
 * the same kind of call): a bullseye is a symbol-block codepoint, so it is served by whatever
 * symbol font the platform falls back to and arrives at a weight the UI font never chose; and it
 * read as a near-twin of the Map pill's ⌖, which sat on the same screen for a different action.
 * The crosshair is the convention every map app uses for "my location", and now nothing else on
 * the screen wears it.
 *
 * <p>Zero API surface, as `clock-icon` explains: `currentColor` follows the ink of whatever
 * control holds it, and the size is a presentation attribute, which loses to every CSS rule — so
 * a call site resizes with a plain descendant class (`[&_svg]:size-[17px]`, as the head's
 * located mark does) and needs no `input()`. The 13 px default is `clock-icon`'s, the size that
 * sits beside this app's 13–14 px control text; at 15 it pushed the narrowest phone's Near me
 * button into the tile credit (`discover-sheet.e2e.ts`). The host is `display: contents` so the svg, not a wrapper, is the flex child each
 * button's `gap-*` lays out. `aria-hidden` sits on the host AND the svg: the button's own words
 * carry the meaning.
 */
@Component({
  selector: 'app-locate-icon',
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
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>`,
})
export class LocateIcon {}
