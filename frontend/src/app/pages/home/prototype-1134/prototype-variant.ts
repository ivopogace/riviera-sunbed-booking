/**
 * THROWAWAY PROTOTYPE (issue #1134) — the variant registry the `?variant=` param selects from.
 * One line per variant, so the switcher bar, the route param and the READMEs cannot drift.
 */

export type PrototypeVariantKey = 'A' | 'B' | 'C' | 'D';

export interface PrototypeVariant {
  readonly key: PrototypeVariantKey;
  /** What the switcher bar shows beside the key. */
  readonly name: string;
  /** The one-line claim the variant is being judged on. */
  readonly claim: string;
}

export const PROTOTYPE_VARIANTS: readonly PrototypeVariant[] = [
  { key: 'A', name: 'Stack & fan', claim: 'Merge the crowd, fan it open on a press' },
  { key: 'B', name: 'Stack sheet', claim: 'Leave the map alone, choose from a list' },
  { key: 'C', name: 'Tethered fan', claim: 'Push them apart, tether them to the truth' },
  { key: 'D', name: 'Named pins', claim: 'Say what is there; press again for the next one' },
];

/** The `?variant=` value, or `null` when the page is not in prototype mode at all. */
export function readVariant(raw: string | null): PrototypeVariantKey | null {
  const key = (raw ?? '').trim().toUpperCase();
  return PROTOTYPE_VARIANTS.some((variant) => variant.key === key)
    ? (key as PrototypeVariantKey)
    : null;
}

/** The next/previous variant, wrapping — what the switcher's two arrows walk. */
export function stepVariant(current: PrototypeVariantKey, by: 1 | -1): PrototypeVariantKey {
  const at = PROTOTYPE_VARIANTS.findIndex((variant) => variant.key === current);
  const count = PROTOTYPE_VARIANTS.length;
  return PROTOTYPE_VARIANTS[(at + by + count) % count].key;
}
