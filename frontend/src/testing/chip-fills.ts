/**
 * The unit suite's ONE mirror of the chip directives' OPAQUE SOLID recipes — the same role
 * `testing/glass-tokens.ts` plays for the `tailwind.css` glass tokens, and for the same reason:
 * a per-spec hand-copy of a "keep in sync" constant goes stale silently.
 *
 * <p>One copy lives outside that reach on purpose: `e2e/discovery-flow.e2e.ts` repeats the same
 * pair as `rgb()` triples, because the mocked Playwright suite drives the built app as a black box
 * and imports nothing from app source. That copy is self-policing in a way these are not — it is
 * compared against the real rendered page, so a drift turns the suite red rather than passing
 * quietly. Change it together with this file.
 *
 * <p>Here that reason is sharper than usual, because two specs make claims about EACH OTHER'S
 * values. `shared/amenities.contrast.spec.ts` proves every descriptive ink reads AA on its own
 * fill; `shared/semantic-chip.contrast.spec.ts` proves the semantic fill is a different family
 * from EVERY descriptive one. With the descriptive list hand-copied into the second spec, a third
 * amenity variant would be added to the first and silently escape the second — which is precisely
 * the check the second spec exists to make.
 *
 * <p>Be precise about what one shared list buys, because the first attempt at this fix
 * overclaimed. A list is still only a list: on its own it moves the hand-copy one level up rather
 * than removing it. What ties it to the code is a directive spec per recipe, each asserting a SET
 * rather than a subset — `shared/amenity-chip.spec.ts` pins the rendered fills as exactly
 * {@link DESCRIPTIVE_CHIPS} (so an entry no variant renders, and a rendered fill the list omits,
 * both fail), and `shared/semantic-chip.spec.ts` pins {@link SEMANTIC_CHIP}'s whole class list.
 * A value that drifts in either place fails there, loudly, instead of quietly weakening a proof
 * two files away. Set equality is the load-bearing part: `contains` assertions would pass while a
 * second, translucent fill shipped beside the opaque one.
 *
 * <p>Three ties are weaker than the rest, and saying so is cheaper than discovering it. The semantic
 * ink is Tailwind's named `text-white`, which cannot be interpolated from a hex, so its spec pins
 * the mirror with a literal equality instead. The semantic FILL is a named utility for the same
 * reason (#854), so {@link ChipFill.fillClass} carries the class and the hex is inherited from
 * `glass-tokens.ts` rather than restated — one link longer, but still unbroken. And no spec can see
 * a variant it never renders:
 * `water` is the amenity chip's only axis and it is boolean, so a third variant means a new input —
 * rendering it in that spec is part of adding it, not a step this file can enforce.
 */

import { rgbToHex } from './contrast';
import {
  AMENITY_TAG_FILL,
  AMENITY_TAG_INK,
  AMENITY_WATER_FILL,
  AMENITY_WATER_INK,
  SOLID_FILL_BRAND,
} from './glass-tokens';

/** A chip recipe: the ink, and the opaque fill it sits on. Values mirror the directives' host classes. */
export interface ChipFill {
  readonly name: string;
  readonly ink: string;
  readonly fill: string;
  /**
   * The class the fill is painted through, when that is no longer derivable from {@link fill} by
   * interpolation — i.e. once the recipe has been tokenised and paints a named utility instead of a
   * `bg-[#…]` arbitrary value. Absent means the recipe is still a literal and `bg-[${fill}]` is the
   * class. Every recipe here is tokenised as of #858 — the amenity chips last, which also retired
   * their class-S row in the colour-literal audit: a two-variant tag is class F's shape, not a
   * per-state palette. The field stays optional for the next recipe added before its own migration.
   */
  readonly fillClass?: string;
  /**
   * The class the INK is painted through, on the same terms as {@link fillClass}: absent means the
   * recipe is still a literal and `text-[${ink}]` is the class. Added at #858, when the amenity
   * recipes became the first tokenised ones whose ink is not a static utility — `SEMANTIC_CHIP`'s
   * is `text-white`, which needed no field.
   */
  readonly inkClass?: string;
}

/**
 * `shared/amenity-chip.ts` — what the VENUE says about itself.
 *
 * <p>Tokenised at #858 onto the theme-invariant `--riv-amenity-*` family, so the hexes are no longer
 * tied to what renders by interpolation and are taken from the family mirror instead — the
 * `SEMANTIC_CHIP` precedent below. `shared/fixed-fill-token-skins.contrast.spec.ts` ties those
 * values to the declaration in `tailwind.css`, so the chain from here to the paint is unbroken.
 *
 * <p>These are the ONLY sites #858 migrated that carry accessible text, which is why the AA proof
 * `shared/amenities.contrast.spec.ts` runs over them matters rather than being a formality.
 */
export const DESCRIPTIVE_CHIPS: readonly ChipFill[] = [
  {
    name: 'amenity-chip (neutral tag)',
    ink: rgbToHex(AMENITY_TAG_INK),
    fill: rgbToHex(AMENITY_TAG_FILL),
    fillClass: 'bg-riv-amenity-tag-fill',
    inkClass: 'text-riv-amenity-tag-ink',
  },
  {
    name: 'amenity-chip--water (to-water accent)',
    ink: rgbToHex(AMENITY_WATER_INK),
    fill: rgbToHex(AMENITY_WATER_FILL),
    fillClass: 'bg-riv-amenity-water-fill',
    inkClass: 'text-riv-amenity-water-ink',
  },
];

/**
 * `shared/semantic-chip.ts` — what the PLATFORM claims about how booking works.
 *
 * <p>Tokenised at #854: the fill is `--riv-solid-fill-brand`, so the hex is no longer tied to what
 * renders by interpolation. It is taken from the family mirror instead, which
 * `shared/solid-fill-tokens.contrast.spec.ts` ties to the declaration in `tailwind.css` — so the
 * chain from this value to the paint is unbroken, just one link longer than the amenity chips'.
 */
export const SEMANTIC_CHIP: ChipFill = {
  name: 'semantic-chip (mode + New)',
  ink: '#ffffff',
  fill: rgbToHex(SOLID_FILL_BRAND),
  fillClass: 'bg-riv-solid-fill-brand',
};
