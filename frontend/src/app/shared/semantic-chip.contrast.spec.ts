import { DESCRIPTIVE_CHIPS, SEMANTIC_CHIP } from '../../testing/chip-fills';
import { AA_LARGE, AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA contrast guard for the shared SEMANTIC chips — the booking-mode chip and the "New"
 * chip (issue #705). Like the amenity and status chips, the recipe uses an OPAQUE SOLID fill
 * (the css:S7924 treatment — see `shared/semantic-chip.ts`), so the proof is a plain ink/fill
 * pair: no compositing, no per-theme case, no per-surface case. This is the single home of
 * that proof; the values come from `testing/chip-fills.ts`.
 *
 * <p>It is the successor of two assertions this slice displaced, and deliberately stronger than
 * both. `venue-map.contrast.spec.ts` proved the map header's mode pill by compositing
 * `--riv-chip-bg` over the panel glass over each background stop, once per theme — an argument
 * that had to be re-run for every surface the chip might move to. And `home.contrast.spec.ts`
 * proved the Discover mode chip's accent ink on the 0.85 `--riv-mode-chip-glass` over the worst
 * photo any venue can upload. An opaque fill removes the backdrop from both arguments: a photo,
 * a panel and a theme can no longer reach the ink at all.
 *
 * <p>The second test is the *distinguishability* claim of #705 stated as a number rather than an
 * opinion. "Semantic chips read as a different family at a glance" is only checkable if the
 * separation between the two families' fills is measured, so it is asserted at the 3:1 non-text
 * bar against EVERY descriptive fill. It reads that family from the shared list rather than a
 * local copy, which is what stops a third amenity variant from drifting into the semantic fill's
 * neighbourhood unnoticed — the check is only as complete as its enumeration.
 */
describe('Semantic chips (solid fill, WCAG AA) — shared/semantic-chip.ts', () => {
  it('the semantic-chip ink meets AA on its solid fill', () => {
    expect(contrastRatio(SEMANTIC_CHIP.ink, SEMANTIC_CHIP.fill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(DESCRIPTIVE_CHIPS)(
    'the semantic fill is a different family from the $name fill',
    ({ fill }) => {
      expect(contrastRatio(SEMANTIC_CHIP.fill, fill)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );
});
