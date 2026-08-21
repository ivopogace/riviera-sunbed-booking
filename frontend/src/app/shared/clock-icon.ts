import { Component } from '@angular/core';

/**
 * The cutoff rule's clock glyph, shared by Discover and the beach map. An inline SVG on
 * `currentColor`, chosen over the ⏰ emoji the two notes used to carry: at this size, on this
 * glass, the emoji rendered platform-dependently and read as an error mark. That is a judgement
 * about these two notes, not a rule against emoji glyphs — the app's remaining ones
 * (`appFailureIcon`'s ⚠, the requests-tab ⏰) are unrelated and stay.
 *
 * <p>A component rather than a directive — deliberately breaking the neighbouring `shared/` glyph
 * precedent (`appFailureIcon`, `appAmenityChip`). A directive can only add classes and attributes
 * to an element that already exists, so it cannot carry the circle and path geometry; deduplicating
 * real SVG geometry needs an inline template.
 *
 * <p>Zero API surface, because the cascade already gives each call site full control: `currentColor`
 * makes the stroke follow whatever ink the surrounding note sets, and the size is a **presentation
 * attribute**, which loses to every CSS rule — so a call site resizes with a plain class
 * (`[&_svg]:size-[15px]` — the descendant form, so it keeps matching however deeply the glyph is
 * wrapped) and needs no `input()`. The host is `display: contents` so the svg stays
 * the direct flex child of the note and each call site's own `gap-1`/`shrink-0` layout is untouched.
 * `aria-hidden` sits on the host **and** the svg: the note's sentence carries the meaning.
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
