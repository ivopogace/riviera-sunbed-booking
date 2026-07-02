import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from '../testing/contrast';

/**
 * WCAG-AA contrast guard for the Liquid Glass shell tokens (issue #134, AC-4; gate from #38).
 * Glass surfaces are translucent, so each pair is checked as the EFFECTIVE colour: the glass
 * rgba composited over the worst-case (lightest and darkest) stop of the theme's background
 * gradient, and alpha inks composited over that result. Mirrors `styles.scss` + `app.scss` —
 * a token edit there must re-pass here (three tokens already deviate from the design file for
 * exactly this reason; see the styles.scss header note and plan R-2).
 *
 * Decorative, text-free elements (sun disc, blobs, swatches, menu bars, caret) are exempt
 * (WCAG 1.4.3 incidental/decoration).
 */

const WHITE = hexToRgb('ffffff');
const INK_DARK = hexToRgb('0a2a33');

// styles.scss tokens (keep in sync)
const RIVIERA_HEADER_GLASS = { color: hexToRgb('0a2c3f'), alpha: 0.72 };
const PORCELAIN_HEADER_GLASS = { color: WHITE, alpha: 0.6 };
const POPOVER = { color: WHITE, alpha: 0.92 };

// Worst-case gradient stops the header/footer glass can sit over.
const RIVIERA_STOPS = ['93e6f2', 'ffe2b0', '38b6d2', '0a4f6e'].map(hexToRgb);
const PORCELAIN_STOPS = ['ffffff', 'eef6f8', 'cfeaf2', 'dfeef2'].map(hexToRgb);

interface GlassPair {
  readonly usage: string;
  readonly ink: Rgb;
  readonly inkAlpha: number;
  readonly glass: { color: Rgb; alpha: number };
  readonly stops: readonly Rgb[];
}

const PAIRS: readonly GlassPair[] = [
  { usage: 'riviera: ink (brand, chip text) on header glass', ink: WHITE, inkAlpha: 1, glass: RIVIERA_HEADER_GLASS, stops: RIVIERA_STOPS },
  { usage: 'riviera: ink-soft (nav links, footer) on header glass', ink: WHITE, inkAlpha: 0.86, glass: RIVIERA_HEADER_GLASS, stops: RIVIERA_STOPS },
  { usage: 'riviera: ink-faint (brand subtitle) on header glass', ink: WHITE, inkAlpha: 0.8, glass: RIVIERA_HEADER_GLASS, stops: RIVIERA_STOPS },
  { usage: 'porcelain: ink on header glass', ink: INK_DARK, inkAlpha: 1, glass: PORCELAIN_HEADER_GLASS, stops: PORCELAIN_STOPS },
  { usage: 'porcelain: ink-soft (nav links, footer) on header glass', ink: INK_DARK, inkAlpha: 0.7, glass: PORCELAIN_HEADER_GLASS, stops: PORCELAIN_STOPS },
  { usage: 'porcelain: ink-faint (brand subtitle) on header glass', ink: INK_DARK, inkAlpha: 0.66, glass: PORCELAIN_HEADER_GLASS, stops: PORCELAIN_STOPS },
];

describe('Liquid Glass shell token contrast (WCAG AA, issue #134)', () => {
  it.each(PAIRS)('$usage meets AA over every gradient stop', ({ ink, inkAlpha, glass, stops }) => {
    for (const stop of stops) {
      const surface = composite(glass.color, glass.alpha, stop);
      const effectiveInk = composite(ink, inkAlpha, surface);
      expect(
        contrastRatio(rgbToHex(effectiveInk), rgbToHex(surface)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('riviera chip text (white) stays AA on the chip glass over the header glass', () => {
    for (const stop of RIVIERA_STOPS) {
      const header = composite(RIVIERA_HEADER_GLASS.color, RIVIERA_HEADER_GLASS.alpha, stop);
      const chip = composite(WHITE, 0.16, header); // --riv-chip-bg
      expect(contrastRatio(rgbToHex(WHITE), rgbToHex(chip))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('porcelain chip text (ink) stays AA on the chip tint over the header glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const header = composite(PORCELAIN_HEADER_GLASS.color, PORCELAIN_HEADER_GLASS.alpha, stop);
      const chip = composite(INK_DARK, 0.05, header); // --riv-chip-bg
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(chip))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('popover text meets AA over the darkest riviera stop (worst case for the white popover)', () => {
    const darkest = hexToRgb('0a4f6e');
    const popover = composite(POPOVER.color, POPOVER.alpha, darkest);
    // menu links / theme names (#0a2a33), the 10.5px theme label (ink at 0.7), and the check (#0a6e85)
    expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(popover))).toBeGreaterThanOrEqual(AA_NORMAL);
    const label = composite(INK_DARK, 0.7, popover);
    expect(contrastRatio(rgbToHex(label), rgbToHex(popover))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio('#0a6e85', rgbToHex(popover))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('legacy compat surface keeps the slate ink the pre-redesign pages assume', () => {
    // .riv-legacy-surface pins the exact background (#f8fafc) the per-page contrast specs use.
    expect(contrastRatio('#0f172a', '#f8fafc')).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
