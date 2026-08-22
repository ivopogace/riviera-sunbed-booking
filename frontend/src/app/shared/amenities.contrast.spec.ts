import { DESCRIPTIVE_CHIPS } from '../../testing/chip-fills';
import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA contrast guard for the shared amenity chips. Like the status chips, they use
 * OPAQUE SOLID fills (the css:S7924 treatment — see `shared/amenity-chip.ts`), so their text
 * contrast is theme-independent and asserted directly on the ink/fill pair — the same chip reads
 * AA on both the light Discover card and the dark glass beach-map header. This is the single home
 * of that proof; the values come from `testing/chip-fills.ts`, which the semantic-chip spec reads
 * too so a new variant added here cannot escape its family-separation check.
 */
describe('Amenity chips (solid fills, WCAG AA) — shared/amenity-chip.ts', () => {
  it.each(DESCRIPTIVE_CHIPS)('the $name ink meets AA on its solid fill', ({ ink, fill }) => {
    expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
