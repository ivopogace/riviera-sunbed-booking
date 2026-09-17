import { AA_NORMAL, contrastRatio, rgbToHex } from '../../../testing/contrast';
import { SOLID_BTN_FILL, SOLID_BTN_HOVER, SOLID_BTN_INK } from '../../../testing/glass-tokens';

/**
 * The place pill and the crowd's member discs wear the map chrome's theme-invariant
 * `--riv-solid-btn-*` pair, like every control that floats over imagery of unknown luminance:
 * the resting pill paints the fixed ink on the fixed fill (hover on the hover fill), and the
 * inverted states — the count disc, the pill once the camera is here, a focused member — paint
 * the fill on the ink. The pill's smallest text is 11 px extrabold, so every pair is held to AA
 * normal, never the large-text allowance.
 */
describe('venue pin layer contrast', () => {
  const ink = rgbToHex(SOLID_BTN_INK);
  const fill = rgbToHex(SOLID_BTN_FILL);
  const hover = rgbToHex(SOLID_BTN_HOVER);

  it('the pill’s name and from-price clear AA on the resting fill', () => {
    expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the pill’s text still clears AA on the hover fill', () => {
    expect(contrastRatio(ink, hover)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the count disc, the inverted pill and a focused member clear AA with the pair inverted', () => {
    expect(contrastRatio(fill, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
