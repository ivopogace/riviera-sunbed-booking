import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from '../testing/contrast';
import {
  INK_DARK,
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
 * WCAG-AA contrast guard for the Liquid Glass shell tokens (issue #134, AC-4; gate from #38).
 * Glass surfaces are translucent, so each pair is checked as the EFFECTIVE colour: the glass
 * rgba composited over the worst-case (lightest and darkest) stop of the theme's background
 * gradient, and alpha inks composited over that result. The token mirrors live in
 * `testing/glass-tokens.ts` (shared with the per-page glass specs) — a token edit in
 * `styles.scss` must re-pass here (three tokens already deviate from the design file for
 * exactly this reason; see the styles.scss header note and plan R-2).
 *
 * Decorative, text-free elements (sun disc, blobs, swatches, menu bars, caret) are exempt
 * (WCAG 1.4.3 incidental/decoration).
 */

// Shell-only surface (near-opaque white popover in every theme)
const POPOVER = { color: WHITE, alpha: 0.92 };

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
    expectAaOverStops(ink, inkAlpha, glass, stops);
  });

  it('riviera chip text (white) stays AA on the chip glass over the header glass', () => {
    for (const stop of RIVIERA_STOPS) {
      const header = surfaceOver(RIVIERA_HEADER_GLASS, stop);
      const chip = composite(RIVIERA_CHIP.color, RIVIERA_CHIP.alpha, header);
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
