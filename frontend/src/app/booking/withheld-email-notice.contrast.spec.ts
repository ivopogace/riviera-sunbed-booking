import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA guard for the withheld-email notice (#390). Theme-independent by construction: the fill is
 * a SOLID composite of the design's amber tint (not a translucent one), so the pair is a single fixed
 * hex in both themes and static CSS analysis computes the real ratio — the `.form-error` /
 * `.done-badge.warn` / `.failure-icon` precedent for `css:S7924`.
 *
 * <p>One spec, because there is now one component: this assertion used to be copy-pasted into both
 * booking contrast specs, where a palette change to one surface would have left the other green and
 * wrong.
 */

const FILL = '#fcf0d9';
const INK = '#8a5410';

describe('Withheld-email notice contrast (WCAG AA, #390)', () => {
  it('the notice ink meets AA on its solid amber fill', () => {
    expect(contrastRatio(INK, FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
