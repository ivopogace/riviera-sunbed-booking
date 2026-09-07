import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../testing/contrast';
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

/**
 * WCAG-AA contrast guard for the console shell's section row, both rails and the More sheet. The
 * shell is ALWAYS porcelain (the app shell pins `data-riv-theme="porcelain"` on every console
 * route), so every pair is proven over the porcelain header glass / background stops; the chip's
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
