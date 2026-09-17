import { AA_LARGE, AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { SOLID_BTN_FILL, SOLID_BTN_HOVER, SOLID_BTN_INK } from '../../testing/glass-tokens';

/**
 * The map chrome — zoom buttons, the near-me control and its message, the attribution pill, the
 * unavailable notice, the revealed skip control, the location pin, the you-are-here dot — floats
 * over imagery of unknown luminance, so it wears the
 * theme-invariant `--riv-solid-btn-*` family: an opaque fill with a fixed ink, the same pair in
 * every theme (`booking/solid-btn-tokens.contrast.spec.ts` guards the invariance). This spec pins
 * the pair at the sizes the map paints: 12 px attribution and 14 px notice text at AA normal, the
 * 22 px semibold zoom glyphs at AA large. The pin's 20 px glyph is normal weight, so it is held to
 * the stricter AA-normal case rather than the large one.
 */
describe('riviera map chrome contrast', () => {
  const ink = rgbToHex(SOLID_BTN_INK);

  /**
   * Discover's venue pins and place pills (`pages/home/venue-pin-layer.contrast.spec.ts`) wear this
   * same pair and invert it for selection and for "here" — the imagery under them never themes, so
   * a switching accent fill under a fixed ink would drift — and `contrastRatio` is order-independent.
   */
  it('attribution and notice text clear AA over the resting fill', () => {
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_FILL))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * The you-are-here dot rides the resting half of this case rather than a test of its own: it is
   * an ink disc inside a ring cut from that same opaque fill, so the pair WCAG 1.4.11 asks 3:1 of
   * is the resting pair below, internal to the graphic — the ring is what separates it from
   * imagery, whatever the imagery is. It has no hover state; only the buttons do.
   */
  it('zoom glyphs clear AA-large over both the resting and the hover fill', () => {
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_FILL))).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(ink, rgbToHex(SOLID_BTN_HOVER))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  /**
   * The inverted pair — a selected pin, a place pill the camera cannot separate, the crowd's
   * count disc — instead of the themed accent: the imagery under it never themes, so a switching
   * fill under a fixed ink would drift. Inversion preserves the ratio, and asserting it keeps that
   * true if either half is ever retuned.
   */
  it('the inverted pair clears AA', () => {
    expect(contrastRatio(rgbToHex(SOLID_BTN_FILL), rgbToHex(SOLID_BTN_INK))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});
