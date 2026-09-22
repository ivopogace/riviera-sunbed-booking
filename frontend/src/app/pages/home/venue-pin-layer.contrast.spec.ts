import { AA_NORMAL, contrastRatio, Rgb, desaturate, rgbToHex } from '../../../testing/contrast';
import { SOLID_BTN_FILL, SOLID_BTN_HOVER, SOLID_BTN_INK } from '../../../testing/glass-tokens';

/** The dusk face's paint: `testing/contrast`'s matrix, as the hex pair `contrastRatio` takes. */
function desaturated(rgb: Rgb): string {
  return rgbToHex(desaturate(rgb));
}

/**
 * The place pill and the crowd's member discs wear the map chrome's theme-invariant
 * `--riv-solid-btn-*` pair, like every control that floats over imagery of unknown luminance:
 * the resting pill paints the fixed ink on the fixed fill (hover on the hover fill), and the
 * inverted states — the count disc, the pill once the camera is here, a focused member — paint
 * the fill on the ink. `contrastRatio` is order-independent, so the resting case proves the
 * inverted ones too and they are not restated. The pill's smallest text is 11 px extrabold, so
 * every pair is held to AA normal, never the large-text allowance.
 */
describe('venue pin layer contrast', () => {
  const ink = rgbToHex(SOLID_BTN_INK);

  it('the pill’s text clears AA on the resting fill, and so the inverted disc and pill do too', () => {
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_FILL))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the pill’s text still clears AA on the hover fill', () => {
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_HOVER))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * Dusk paints the same fixed pair desaturated on the hover fill, so it holds in all three themes
   * for the reason the resting pill does: neither token switches. The prototype's faded button —
   * the whole face at 45 % over the map — measured 1.2–1.4:1 and is what this replaces.
   */
  it('the dusk face clears AA once the saturate filter has been applied to both', () => {
    expect(
      contrastRatio(desaturated(SOLID_BTN_INK), desaturated(SOLID_BTN_HOVER)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the dusk count disc, which inverts the same pair, clears AA too', () => {
    expect(
      contrastRatio(desaturated(SOLID_BTN_FILL), desaturated(SOLID_BTN_INK)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
