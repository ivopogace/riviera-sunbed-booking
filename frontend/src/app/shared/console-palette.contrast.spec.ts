import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  FIELD_FILL_ALPHA,
  POP_HOVER,
  POP_INK,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_STOPS,
  surfaceOver,
  WHITE,
} from '../../testing/glass-tokens';
import { CONSOLE_THEMES, expectAaOnSurfaces, glassOn, popOver } from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the ⌘K palette (`console-palette.ts`), which wears the operator's
 * console theme (the porcelain rows prove the default, the themed block at the foot proves both):
 * the field's query and placeholder inks over the field
 * fill laid on the popover surface, the group tag (10.5px bold, held to 4.5:1) and the highlighted
 * hit (full ink on the hover fill) on that surface, each over the porcelain background stops. The
 * row and hint inks are `console-shell.contrast.spec.ts`'s (the More sheet shares the recipe).
 */
describe('ConsolePalette porcelain contrast (WCAG AA, #1013)', () => {
  function over(stop: (typeof PORCELAIN_STOPS)[number]) {
    const surface = surfaceOver(POP_SURFACE, stop);
    return {
      surface,
      field: composite(WHITE, FIELD_FILL_ALPHA, surface),
      hover: composite(POP_HOVER.color, POP_HOVER.alpha, surface),
    };
  }

  it('the query (full pop ink) and the placeholder (soft pop ink) meet AA on the field fill', () => {
    for (const stop of PORCELAIN_STOPS) {
      const { field } = over(stop);
      const placeholder = composite(POP_INK_SOFT.color, POP_INK_SOFT.alpha, field);
      expect(
        contrastRatio(rgbToHex(POP_INK), rgbToHex(field)),
        `query, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(
        contrastRatio(rgbToHex(placeholder), rgbToHex(field)),
        `placeholder, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the group tag (soft pop ink) meets AA on the popover surface', () => {
    for (const stop of PORCELAIN_STOPS) {
      const { surface } = over(stop);
      const tag = composite(POP_INK_SOFT.color, POP_INK_SOFT.alpha, surface);
      expect(
        contrastRatio(rgbToHex(tag), rgbToHex(surface)),
        `tag, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the highlighted hit (full pop ink on the hover fill) meets AA', () => {
    for (const stop of PORCELAIN_STOPS) {
      const { hover } = over(stop);
      expect(
        contrastRatio(rgbToHex(POP_INK), rgbToHex(hover)),
        `hit, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. The field is the themed `--riv-field-fill` on the popover surface. */
describe.each(CONSOLE_THEMES)(
  'ConsolePalette contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('the query and the placeholder meet AA on the field fill', () => {
      expectAaOnSurfaces(theme, theme.popInk, 1, (stop) =>
        glassOn(theme.fieldFill, popOver(theme, stop)),
      );
      expectAaOnSurfaces(theme, theme.popInkSoft.color, theme.popInkSoft.alpha, (stop) =>
        glassOn(theme.fieldFill, popOver(theme, stop)),
      );
    });

    it('the group tag meets AA on the popover surface and the highlighted hit on the hover fill', () => {
      expectAaOnSurfaces(theme, theme.popInkSoft.color, theme.popInkSoft.alpha, (stop) =>
        popOver(theme, stop),
      );
      expectAaOnSurfaces(theme, theme.popInk, 1, (stop) =>
        glassOn(theme.popHover, popOver(theme, stop)),
      );
    });
  },
);
