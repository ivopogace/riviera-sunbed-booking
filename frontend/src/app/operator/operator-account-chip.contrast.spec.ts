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
import {
  CONSOLE_THEMES,
  expectAaOnSurfaces,
  glassOn,
  headerOver,
  popOver,
} from '../../testing/console-themes';
import { declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Contrast guard for the operator account chip. Its host wears the operator's console theme, so
 * the porcelain rows prove the default and the themed block at the foot proves both console
 * themes. The chip's identity is its avatar disc and its
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

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. The avatar disc is the solid brand fill in both themes. */
describe.each(CONSOLE_THEMES)(
  'OperatorAccountChip contrast in the $name console (#1010)',
  (theme) => {
    it('the chip’s boundary — the disc in porcelain, the ring round it in dark — clears 3:1 on the header glass', () => {
      expectAaOnSurfaces(
        theme,
        theme.avatarBoundary.color,
        theme.avatarBoundary.alpha,
        (stop) => headerOver(theme, stop),
        AA_LARGE,
      );
    });

    it('the ring is declared transparent in the base block and white-at-alpha in the dark block, nowhere else', () => {
      expect(declarationsOf('--riv-console-avatar-ring')).toEqual([
        'transparent',
        'rgba(255, 255, 255, 0.55)',
      ]);
      expect(declarationsOf('--color-riv-console-avatar-ring')).toEqual([
        'var(--riv-console-avatar-ring)',
      ]);
    });

    it('the chip label clears AA on the chip tint over the header glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) =>
        glassOn(theme.chip, headerOver(theme, stop)),
      );
    });

    it('the popover rows, the identity block and the current row clear AA on the pop surface', () => {
      expectAaOnSurfaces(theme, theme.popInk, 1, (stop) => popOver(theme, stop));
      expectAaOnSurfaces(theme, theme.popInkSoft.color, theme.popInkSoft.alpha, (stop) =>
        popOver(theme, stop),
      );
      expectAaOnSurfaces(theme, theme.popAccent, 1, (stop) =>
        glassOn(theme.popHover, popOver(theme, stop)),
      );
    });

    it('the Console theme rows — the label in the pop ink and the pressed row’s accent tick — clear AA', () => {
      expectAaOnSurfaces(theme, theme.popInk, 1, (stop) => popOver(theme, stop));
      expectAaOnSurfaces(theme, theme.popAccent, 1, (stop) => popOver(theme, stop));
    });
  },
);
