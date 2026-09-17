/**
 * THROWAWAY PROTOTYPE — the variant registry the `?variant=` param selects from. One entry now:
 * the hybrid that graduated from five. The key is kept so every URL in the README still opens it.
 */

export type PrototypeVariantKey = 'E';

export interface PrototypeVariant {
  readonly key: PrototypeVariantKey;
  readonly name: string;
  /** The one-line claim the variant is being judged on. */
  readonly claim: string;
}

export const PROTOTYPE_VARIANTS: readonly PrototypeVariant[] = [
  {
    key: 'E',
    name: 'Place pill, hybrid',
    claim: 'A crowd is a place: press it to go there, or, when there is nowhere closer, through it',
  },
];

/** The `?variant=` value, or `null` when the page is not in prototype mode at all. */
export function readVariant(raw: string | null): PrototypeVariantKey | null {
  const key = (raw ?? '').trim().toUpperCase();
  return PROTOTYPE_VARIANTS.some((variant) => variant.key === key)
    ? (key as PrototypeVariantKey)
    : null;
}
