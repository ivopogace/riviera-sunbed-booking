import { AA_LARGE, AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  INK_DARK,
  POP_ACCENT,
  POP_HOVER,
  POP_INK,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_CHIP,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  SOLID_FILL_BRAND,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * Contrast guard for the operator account chip. Both hosts are porcelain-pinned, so every
 * pair is proven over porcelain's background stops. The chip's identity is its avatar disc and its
 * label, not the `--riv-chip-border` hairline (1.3:1 on the header glass — decoration under
 * `docs/design/non-text-contrast.md` rule 2): the disc is the non-text boundary held to 3:1
 * (WCAG 1.4.11), the label and the popover rows to 4.5:1 (1.4.3). The token mirrors live in
 * `testing/glass-tokens.ts`; the utilities they mirror are in `shared/popover-skin.ts`.
 */
describe('OperatorAccountChip porcelain contrast (#1008)', () => {
  it('porcelain: the avatar disc clears 3:1 on the header glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const glass = surfaceOver(PORCELAIN_HEADER_GLASS, stop);
      expect(
        contrastRatio(rgbToHex(SOLID_FILL_BRAND), rgbToHex(glass)),
        `stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('porcelain: the chip label clears AA on the chip tint over the header glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const glass = surfaceOver(PORCELAIN_HEADER_GLASS, stop);
      const chip = composite(PORCELAIN_CHIP.color, PORCELAIN_CHIP.alpha, glass);
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(chip)),
        `stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('porcelain: popover row inks clear AA on the pop surface over every stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const surface = surfaceOver(POP_SURFACE, stop);
      // The rows and the identity block's handle.
      expect(
        contrastRatio(rgbToHex(POP_INK), rgbToHex(surface)),
        `row ink, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      // "Signed in as <username>" in the identity block.
      const soft = composite(POP_INK_SOFT.color, POP_INK_SOFT.alpha, surface);
      expect(
        contrastRatio(rgbToHex(soft), rgbToHex(surface)),
        `soft ink, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      // The current page's row: accent ink on the hover fill.
      const hover = composite(POP_HOVER.color, POP_HOVER.alpha, surface);
      expect(
        contrastRatio(rgbToHex(POP_ACCENT), rgbToHex(hover)),
        `current row, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
