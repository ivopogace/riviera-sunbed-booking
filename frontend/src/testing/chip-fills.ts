/**
 * The ONE test-side mirror of the chip directives' OPAQUE SOLID recipes — the same role
 * `testing/glass-tokens.ts` plays for the `styles.scss` glass tokens, and for the same reason:
 * a per-spec hand-copy of a "keep in sync" constant goes stale silently.
 *
 * <p>Here that reason is sharper than usual, because two specs make claims about EACH OTHER'S
 * values. `shared/amenities.contrast.spec.ts` proves every descriptive ink reads AA on its own
 * fill; `shared/semantic-chip.contrast.spec.ts` proves the semantic fill is a different family
 * from EVERY descriptive one. With the descriptive list hand-copied into the second spec, a third
 * amenity variant would be added to the first and silently escape the second — which is precisely
 * the check the second spec exists to make. One list, imported twice, is what makes the promise
 * real rather than aspirational (review finding on PR #755).
 */

/** A chip recipe: the ink, and the opaque fill it sits on. Values mirror the directives' host classes. */
export interface ChipFill {
  readonly name: string;
  readonly ink: string;
  readonly fill: string;
}

/** `shared/amenity-chip.ts` — what the VENUE says about itself. */
export const DESCRIPTIVE_CHIPS: readonly ChipFill[] = [
  { name: 'amenity-chip (neutral tag)', ink: '#2f4a54', fill: '#eef2f4' },
  { name: 'amenity-chip--water (to-water accent)', ink: '#0a5f74', fill: '#d7eef4' },
];

/** `shared/semantic-chip.ts` — what the PLATFORM claims about how booking works. */
export const SEMANTIC_CHIP: ChipFill = {
  name: 'semantic-chip (mode + New)',
  ink: '#ffffff',
  fill: '#0a5f74',
};
