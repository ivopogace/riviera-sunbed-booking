import { AA_LARGE, AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { SOLID_BTN_FILL, SOLID_BTN_HOVER, SOLID_BTN_INK } from '../../testing/glass-tokens';

/**
 * The map chrome — zoom buttons, the attribution pill, the unavailable notice, the revealed skip
 * control, the location pin — floats over imagery of unknown luminance, so it wears the
 * theme-invariant `--riv-solid-btn-*` family: an opaque fill with a fixed ink, the same pair in
 * every theme (`booking/solid-btn-tokens.contrast.spec.ts` guards the invariance). This spec pins
 * the pair at the sizes the map paints: 12 px attribution and 14 px notice text at AA normal, the
 * 22 px semibold zoom glyphs at AA large. The pin's 20 px glyph is normal weight, so it is held to
 * the stricter AA-normal case rather than the large one.
 */
describe('riviera map chrome contrast', () => {
  const ink = rgbToHex(SOLID_BTN_INK);

  it('attribution and notice text clear AA over the resting fill', () => {
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_FILL))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('zoom glyphs clear AA-large over both the resting and the hover fill', () => {
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_FILL))).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_HOVER))).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
