import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  INK_DARK,
  POP_ACCENT,
  POP_HOVER,
  POP_INK,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * Contrast guard for the venue switcher. Its host is porcelain-pinned, so every pair is proven
 * over porcelain's background stops: the venue name at title weight (`--riv-ink`, full alpha) on
 * the header glass, and the popover's three inks on the pop surface — the row name and the foot
 * row (`--riv-pop-ink`), the beach line and the `Your venues` heading (`--riv-pop-ink-soft`, small
 * text so held to 4.5:1 despite its weight), and the current row (`--riv-pop-accent` on the hover
 * fill). The caret is decoration (`aria-hidden`) in the name's own ink. Token mirrors:
 * `testing/glass-tokens.ts`; utilities: `shared/popover-skin.ts` and the component.
 */
describe('OperatorVenueSwitch porcelain contrast (#1009)', () => {
  it('the venue name at title weight clears AA on the header glass over every stop', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('the row name and the foot row clear AA on the pop surface over every stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const surface = composite(POP_SURFACE.color, POP_SURFACE.alpha, stop);
      expect(
        contrastRatio(rgbToHex(POP_INK), rgbToHex(surface)),
        `stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the beach line, the heading and the current row clear AA on the pop surface over every stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const surface = composite(POP_SURFACE.color, POP_SURFACE.alpha, stop);
      const soft = composite(POP_INK_SOFT.color, POP_INK_SOFT.alpha, surface);
      expect(
        contrastRatio(rgbToHex(soft), rgbToHex(surface)),
        `soft ink, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      const hover = composite(POP_HOVER.color, POP_HOVER.alpha, surface);
      expect(
        contrastRatio(rgbToHex(POP_ACCENT), rgbToHex(hover)),
        `current row, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
