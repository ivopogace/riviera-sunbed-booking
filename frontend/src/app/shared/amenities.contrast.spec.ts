import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA contrast guard for the shared amenity chips (T7 #140). Like the status chips, they use
 * OPAQUE SOLID fills (the css:S7924 treatment — see `shared/_glass.scss` `amenity-chip`), so their
 * text contrast is theme-independent and asserted directly on the ink/fill pair — the same chip
 * reads AA on both the light Discover card and the dark glass beach-map header. This is the single
 * home of that proof; values mirror the `amenity-chip` mixin.
 */
const CHIPS: readonly [name: string, ink: string, fill: string][] = [
  ['amenity-chip (neutral tag)', '#2f4a54', '#eef2f4'],
  ['amenity-chip--water (to-water accent)', '#0a5f74', '#d7eef4'],
];

describe('Amenity chips (solid fills, WCAG AA) — shared/_glass.scss amenity-chip', () => {
  it.each(CHIPS)('the %s ink meets AA on its solid fill', (_name, ink, fill) => {
    expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
