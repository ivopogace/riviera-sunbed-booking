import { Directive } from '@angular/core';

/**
 * The tourist surfaces' SEMANTIC chip — the booking-mode chip ("Instant Book" / "Request to
 * Book") and the "New" (no reviews yet) chip, on the Discover cards and the beach-map header
 * (issue #705). Both make a claim the PLATFORM authors about how this booking will go; the
 * descriptive chips beside them (`shared/amenity-chip.ts` and its to-water variant) report what
 * the VENUE says about itself. Before this directive the two families wore the same pale pill,
 * so nothing in a card scan said that one of them changes what happens when you tap a set.
 *
 * <p>The distinction is an INVERSION rather than another tint: an opaque saturated accent fill
 * with white ink, against the descriptive family's pale fills with dark ink. A tint was not
 * available — the to-water chip already owns the pale-teal accent, so a second one would have
 * muddled the two families instead of separating them. The fill is `--riv-solid-fill-brand`, the
 * brand teal the system proves carries white body text at AA (5.86:1).
 *
 * <p>OPAQUE SOLID, never rgba — the css:S7924 treatment the sibling chips use, and here it does
 * more than satisfy the analyzer. The mode chip sits over an ARBITRARY uploaded cover photo,
 * where the retired `--riv-mode-chip-glass` backing had to be proven against the worst photo a
 * venue can upload; and the same chip sits on the beach map's dark panel glass, where the
 * retired `--riv-chip-bg` tint had to be composited per theme over every background stop. An
 * opaque fill removes the backdrop from both arguments at once, which is why one ink/fill pair
 * in `shared/semantic-chip.contrast.spec.ts` now replaces two composited per-surface proofs.
 * The rim is a LIGHTER accent, inverting the descriptive chips' darker-than-fill border for the
 * same reason the fill inverts: on the dark map header a darker rim would have dissolved. It
 * separates from the fill at only 1.25:1 (#861 lightened the fill), which is decorative and not
 * the boundary WCAG 1.4.11 asks about — the chip is identified against the CARD, at 5.39:1.
 *
 * <p>Deliberately carries NO geometry — no `display`, no padding, no `text-*`. The five call
 * sites differ (11px tracked caps over a photo — twice, the mode and sales-closed chips —
 * 13.5px inherited inside the Discover rating row,
 * 0.78rem twice in the map header), and #705 asks for no layout shift, so each keeps its own box
 * and the directive supplies only what makes the family read as one. That is the opposite of the
 * `amenity-chip` / `status-chip` split, where the whole pill IS the recipe; the difference is
 * that those two own every one of their call sites' boxes and this one owns none.
 *
 * <p>`rounded-full` and `border` DO belong here: all five call sites already agreed on both, and
 * leaving a radius at the call site beside one in a directive is the stylesheet-order coin-flip
 * `shared/panel-glass.ts` documents. The border's *width* is what must not move — every call
 * site had a 1px border before, so swapping only its colour keeps all five boxes identical.
 *
 * <p>The literal marker class `semantic-chip` is retained as an inert hook in the sibling
 * directives' style, and here it is load-bearing: `home.spec.ts` and `venue-map.spec.ts` assert
 * the family membership of each chip through it, which is how "the same treatment on both
 * surfaces" is checked rather than claimed.
 */
@Directive({
  selector: '[appSemanticChip]',
  host: {
    class:
      'semantic-chip rounded-full border font-bold bg-riv-solid-fill-brand border-[#2f7d92] text-white',
  },
})
export class SemanticChip {}
