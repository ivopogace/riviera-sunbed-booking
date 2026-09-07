import { AA_LARGE, AA_NORMAL, composite, contrastRatio, rgbToHex } from '../testing/contrast';
import {
  INK_DARK,
  POP_ACCENT,
  POP_HOVER,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
  SOLID_FILL_BRAND,
  surfaceOver,
} from '../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  expectAaOnSurfaces,
  glassOn,
  headerOver,
  popOver,
} from '../testing/console-themes';

/**
 * WCAG-AA contrast guard for the console shell's section row, both rails and the More sheet. The
 * shell wears the operator's console theme — porcelain by default, dark by choice, never
 * `riviera` — so the porcelain rows below prove the default over the porcelain header glass /
 * background stops and the themed block at the foot proves both; the chip's
 * pairs are in `operator-account-chip.contrast.spec.ts`, the venue switcher's popover in
 * `operator-venue-switch.contrast.spec.ts`, the rail's own hairline in `tab-rail.contrast.spec.ts`.
 * These values mirror the utilities in `console-shell.ts` and the porcelain `--riv-*` tokens in
 * `tailwind.css`; a colour edit in either must re-pass here.
 */
const WHITE = '#ffffff';
const BADGE_FILL = rgbToHex(SOLID_FILL_BRAND);

describe('ConsoleShell porcelain contrast (WCAG AA, #1011)', () => {
  it('brand and venue name (full ink) meet AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('the resting Admin section link (ink 0.7) meets AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 0.7, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('the Sign in link (full ink, 13px) meets AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('Requests badge (white) meets AA on its solid teal fill', () => {
    expect(contrastRatio(WHITE, BADGE_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

/**
 * The phone rail paints on the header glass: the current slot's glyph and label in full ink, the
 * resting slots in the soft ink — 11px text, so both are held to 4.5:1, which also clears the 3:1
 * a glyph needs as a graphic (1.4.11). The sheet is the popover surface: the hint line in the
 * soft pop ink, the current row's accent on the hover fill.
 */
describe('ConsoleShell phone rail and More sheet porcelain contrast (WCAG AA, #1012)', () => {
  it("the phone rail's current and resting slot inks meet AA on the header glass", () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
    expectAaOverStops(INK_DARK, 0.7, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it("the More sheet's hint ink meets AA on the popover surface", () => {
    for (const stop of PORCELAIN_STOPS) {
      const surface = surfaceOver(POP_SURFACE, stop);
      const soft = composite(POP_INK_SOFT.color, POP_INK_SOFT.alpha, surface);
      expect(
        contrastRatio(rgbToHex(soft), rgbToHex(surface)),
        `hint, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("the More sheet's current row (accent on the hover fill) meets AA", () => {
    for (const stop of PORCELAIN_STOPS) {
      const surface = surfaceOver(POP_SURFACE, stop);
      const hover = composite(POP_HOVER.color, POP_HOVER.alpha, surface);
      expect(
        contrastRatio(rgbToHex(POP_ACCENT), rgbToHex(hover)),
        `current row, stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * Both console themes off one table (`testing/console-themes.ts`): the section row's inks and the
 * rail's marker on the dark header glass, the phone rail's slots, the More sheet's hint and current
 * row on the dark popover — beside the porcelain rows above, which stay as the parity proof. The
 * shell wears whichever console theme the operator chose; it never wears `riviera`.
 */
describe.each(CONSOLE_THEMES)(
  'ConsoleShell contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('brand, venue name, the Sign in link and the current tab (full ink) meet AA on the header glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => headerOver(theme, stop));
    });

    it('the resting Admin link and the resting phone slots (ink 0.7) meet AA on the header glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 0.7, (stop) => headerOver(theme, stop));
    });

    it("the rail's marker (full ink) and its hairline (--riv-ink-faint) clear 3:1 on the header glass", () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => headerOver(theme, stop), AA_LARGE);
      expectAaOnSurfaces(
        theme,
        theme.inkFaint.color,
        theme.inkFaint.alpha,
        (stop) => headerOver(theme, stop),
        AA_LARGE,
      );
    });

    it("the More sheet's hint ink and its current row (accent on the hover fill) meet AA on the popover", () => {
      expectAaOnSurfaces(theme, theme.popInkSoft.color, theme.popInkSoft.alpha, (stop) =>
        popOver(theme, stop),
      );
      expectAaOnSurfaces(theme, theme.popAccent, 1, (stop) =>
        glassOn(theme.popHover, popOver(theme, stop)),
      );
    });
  },
);
