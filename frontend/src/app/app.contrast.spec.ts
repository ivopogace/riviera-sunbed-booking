import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from '../testing/contrast';
import {
  DARK_CHIP,
  DARK_HEADER_GLASS,
  DARK_POP_ACCENT,
  DARK_POP_INK,
  DARK_POP_INK_SOFT,
  DARK_POP_SURFACE,
  DARK_STOPS,
  INK_DARK,
  POP_ACCENT,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_CHIP,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CHIP,
  RIVIERA_HEADER_GLASS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass shell tokens.
 * Glass surfaces are translucent, so each pair is checked as the EFFECTIVE colour: the glass
 * rgba composited over the worst-case (lightest and darkest) stop of the theme's background
 * gradient, and alpha inks composited over that result. The token mirrors live in
 * `testing/glass-tokens.ts` (shared with the per-page glass specs) — a token edit in
 * `tailwind.css` must re-pass here (three tokens already deviate from the design file for
 * exactly this reason; see the tailwind.css header note).
 *
 * Decorative, text-free elements (sun disc, blobs, swatches, menu bars, caret) are exempt
 * (WCAG 1.4.3 incidental/decoration).
 */

interface GlassPair {
  readonly usage: string;
  readonly ink: Rgb;
  readonly inkAlpha: number;
  readonly glass: { color: Rgb; alpha: number };
  readonly stops: readonly Rgb[];
}

const PAIRS: readonly GlassPair[] = [
  {
    usage: 'riviera: ink (brand, chip text) on header glass',
    ink: WHITE,
    inkAlpha: 1,
    glass: RIVIERA_HEADER_GLASS,
    stops: RIVIERA_STOPS,
  },
  {
    usage: 'riviera: ink-soft (nav links, footer) on header glass',
    ink: WHITE,
    inkAlpha: 0.86,
    glass: RIVIERA_HEADER_GLASS,
    stops: RIVIERA_STOPS,
  },
  {
    usage: 'riviera: ink-faint (brand subtitle) on header glass',
    ink: WHITE,
    inkAlpha: 0.8,
    glass: RIVIERA_HEADER_GLASS,
    stops: RIVIERA_STOPS,
  },
  {
    usage: 'dark: ink (brand, chip text) on header glass',
    ink: WHITE,
    inkAlpha: 1,
    glass: DARK_HEADER_GLASS,
    stops: DARK_STOPS,
  },
  {
    usage: 'dark: ink-soft (nav links, footer) on header glass',
    ink: WHITE,
    inkAlpha: 0.86,
    glass: DARK_HEADER_GLASS,
    stops: DARK_STOPS,
  },
  {
    usage: 'dark: ink-faint (brand subtitle) on header glass',
    ink: WHITE,
    inkAlpha: 0.8,
    glass: DARK_HEADER_GLASS,
    stops: DARK_STOPS,
  },
  {
    usage: 'porcelain: ink on header glass',
    ink: INK_DARK,
    inkAlpha: 1,
    glass: PORCELAIN_HEADER_GLASS,
    stops: PORCELAIN_STOPS,
  },
  {
    usage: 'porcelain: ink-soft (nav links, footer) on header glass',
    ink: INK_DARK,
    inkAlpha: 0.7,
    glass: PORCELAIN_HEADER_GLASS,
    stops: PORCELAIN_STOPS,
  },
  {
    usage: 'porcelain: ink-faint (brand subtitle) on header glass',
    ink: INK_DARK,
    inkAlpha: 0.66,
    glass: PORCELAIN_HEADER_GLASS,
    stops: PORCELAIN_STOPS,
  },
];

describe('Liquid Glass shell token contrast (WCAG AA, issue #134)', () => {
  it.each(PAIRS)('$usage meets AA over every gradient stop', ({ ink, inkAlpha, glass, stops }) => {
    expectAaOverStops(ink, inkAlpha, glass, stops);
  });

  it('riviera chip text (white) stays AA on the chip glass over the header glass', () => {
    for (const stop of RIVIERA_STOPS) {
      const header = surfaceOver(RIVIERA_HEADER_GLASS, stop);
      const chip = composite(RIVIERA_CHIP.color, RIVIERA_CHIP.alpha, header);
      expect(contrastRatio(rgbToHex(WHITE), rgbToHex(chip))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('dark chip text (white) stays AA on the chip glass over the header glass', () => {
    for (const stop of DARK_STOPS) {
      const header = surfaceOver(DARK_HEADER_GLASS, stop);
      const chip = composite(DARK_CHIP.color, DARK_CHIP.alpha, header);
      expect(contrastRatio(rgbToHex(WHITE), rgbToHex(chip))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('porcelain chip text (ink) stays AA on the chip tint over the header glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const header = surfaceOver(PORCELAIN_HEADER_GLASS, stop);
      const chip = composite(PORCELAIN_CHIP.color, PORCELAIN_CHIP.alpha, header);
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(chip))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('light popover text meets AA over the darkest riviera stop (worst case for white glass)', () => {
    const popover = composite(POP_SURFACE.color, POP_SURFACE.alpha, hexToRgb('0a4f6e'));
    // menu links / theme names (--riv-pop-ink), the 10.5px label (pop-ink-soft), the check (pop-accent)
    expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(popover))).toBeGreaterThanOrEqual(AA_NORMAL);
    const label = composite(POP_INK_SOFT.color, POP_INK_SOFT.alpha, popover);
    expect(contrastRatio(rgbToHex(label), rgbToHex(popover))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(rgbToHex(POP_ACCENT), rgbToHex(popover))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('dark popover text meets AA over every dark-theme stop', () => {
    for (const stop of DARK_STOPS) {
      const popover = composite(DARK_POP_SURFACE.color, DARK_POP_SURFACE.alpha, stop);
      expect(contrastRatio(rgbToHex(DARK_POP_INK), rgbToHex(popover))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      const label = composite(DARK_POP_INK_SOFT.color, DARK_POP_INK_SOFT.alpha, popover);
      expect(contrastRatio(rgbToHex(label), rgbToHex(popover))).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(rgbToHex(DARK_POP_ACCENT), rgbToHex(popover))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('legacy compat surface keeps the slate ink the pre-redesign pages assume', () => {
    // .riv-legacy-surface pins the exact background (#f8fafc) the per-page contrast specs use.
    expect(contrastRatio('#0f172a', '#f8fafc')).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
