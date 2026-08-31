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
 * the mirror with a literal equality instead. Since #854 the semantic FILL is a named utility for
 * the same reason, so {@link ChipFill.fillClass} carries the class and the hex is inherited from
 * `glass-tokens.ts` rather than restated — one link longer, but still unbroken. And no spec can see
 * a variant it never renders:
 * `water` is the amenity chip's only axis and it is boolean, so a third variant means a new input —
 * rendering it in that spec is part of adding it, not a step this file can enforce.
 */

import { rgbToHex } from './contrast';
import { SOLID_FILL_BRAND } from './glass-tokens';

/** A chip recipe: the ink, and the opaque fill it sits on. Values mirror the directives' host classes. */
export interface ChipFill {
  readonly name: string;
  readonly ink: string;
  readonly fill: string;
  /**
   * The class the fill is painted through, when that is no longer derivable from {@link fill} by
   * interpolation — i.e. once the recipe has been tokenised and paints a named utility instead of a
   * `bg-[#…]` arbitrary value. Absent means the recipe is still a literal and `bg-[${fill}]` is the
   * class, which is how the amenity chips (class S of the colour-literal audit) still work.
   */
  readonly fillClass?: string;
}

/** `shared/amenity-chip.ts` — what the VENUE says about itself. */
export const DESCRIPTIVE_CHIPS: readonly ChipFill[] = [
  { name: 'amenity-chip (neutral tag)', ink: '#2f4a54', fill: '#eef2f4' },
  { name: 'amenity-chip--water (to-water accent)', ink: '#0a5f74', fill: '#d7eef4' },
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
