import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../testing/contrast';
import {
  CARD_INK,
  DARK_CHIP,
  DARK_HEADER_GLASS,
  DARK_POP_ACCENT,
  DARK_POP_HOVER,
  DARK_POP_INK,
  DARK_POP_INK_SOFT,
  DARK_POP_SURFACE,
  DARK_STOPS,
  DARK_TABBAR_GLASS,
  INK_DARK,
  POP_ACCENT,
  POP_HOVER,
  POP_INK_SOFT,
  POP_SURFACE,
  PORCELAIN_CHIP,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  PORCELAIN_TABBAR_GLASS,
  RIVIERA_CHIP,
  RIVIERA_HEADER_GLASS,
  RIVIERA_STOPS,
  RIVIERA_TABBAR_GLASS,
  SOLID_FILL_BRAND,
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
 * `tailwind.css` must re-pass here (three tokens already deviate from their drawn values for
 * exactly this reason).
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

  /**
   * The theme control is a bare swatch, so the swatch's ring is its only WCAG 1.4.11 boundary:
   * the swatch itself reaches 1.0:1 against the bar (its white end on porcelain), and a white
   * inset ring vanishes there too. The ring is `--riv-ink-soft`, composited over the header glass like any ink.
   */
  it.each([
    {
      theme: 'porcelain',
      ring: CARD_INK,
      alpha: 0.7,
      glass: PORCELAIN_HEADER_GLASS,
      stops: PORCELAIN_STOPS,
    },
    {
      theme: 'riviera',
      ring: WHITE,
      alpha: 0.86,
      glass: RIVIERA_HEADER_GLASS,
      stops: RIVIERA_STOPS,
    },
    { theme: 'dark', ring: WHITE, alpha: 0.86, glass: DARK_HEADER_GLASS, stops: DARK_STOPS },
  ])(
    'the swatch ring (ink-soft) clears 3:1 against the header glass in every theme: $theme (#1002)',
    ({ ring, alpha, glass, stops }) => {
      for (const stop of stops) {
        const bar = surfaceOver(glass, stop);
        const ringOnBar = composite(ring, alpha, bar);
        expect(
          contrastRatio(rgbToHex(ringOnBar), rgbToHex(bar)),
          `over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    },
  );

  /**
   * The phone tab bar paints its own near-opaque token (`--riv-tabbar-glass`), not the header
   * glass: at the header's 0.6 / 0.72 the beach map's availability strip bled through. Its labels
   * are 11px body text, so AA; the current tab's marker is a shape cue in full ink — a 3px bar and
   * a 1.5px ring — because no tint the token set offers clears 1.4.11's 3:1 on the bar.
   */
  const TAB_BARS = [
    {
      theme: 'porcelain',
      ink: INK_DARK,
      soft: CARD_INK,
      softAlpha: 0.7,
      glass: PORCELAIN_TABBAR_GLASS,
      stops: PORCELAIN_STOPS,
    },
    {
      theme: 'riviera',
      ink: WHITE,
      soft: WHITE,
      softAlpha: 0.86,
      glass: RIVIERA_TABBAR_GLASS,
      stops: RIVIERA_STOPS,
    },
    {
      theme: 'dark',
      ink: WHITE,
      soft: WHITE,
      softAlpha: 0.86,
      glass: DARK_TABBAR_GLASS,
      stops: DARK_STOPS,
    },
  ] as const;

  it.each(TAB_BARS)(
    'tab labels (ink, ink-soft) meet AA on the tab-bar glass over every stop: $theme (#1003)',
    ({ ink, soft, softAlpha, glass, stops }) => {
      expectAaOverStops(ink, 1, glass, stops);
      expectAaOverStops(soft, softAlpha, glass, stops);
    },
  );

  it.each(TAB_BARS)(
    "the current tab's full-ink marker clears 3:1 against the tab bar in every theme: $theme (#1003)",
    ({ ink, glass, stops }) => {
      for (const stop of stops) {
        const bar = surfaceOver(glass, stop);
        expect(
          contrastRatio(rgbToHex(ink), rgbToHex(bar)),
          `over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    },
  );

  it('the avatar initial (white) meets AA on the solid brand fill, the header never wearing the CTA gradient', () => {
    expect(contrastRatio(rgbToHex(WHITE), rgbToHex(SOLID_FILL_BRAND))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it("the mobile menu's current-page row (pop-accent on the hover fill) meets AA in every theme", () => {
    const lightPopover = composite(POP_SURFACE.color, POP_SURFACE.alpha, hexToRgb('0a4f6e'));
    const lightRow = composite(POP_HOVER.color, POP_HOVER.alpha, lightPopover);
    expect(contrastRatio(rgbToHex(POP_ACCENT), rgbToHex(lightRow))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
    for (const stop of DARK_STOPS) {
      const popover = composite(DARK_POP_SURFACE.color, DARK_POP_SURFACE.alpha, stop);
      const row = composite(DARK_POP_HOVER.color, DARK_POP_HOVER.alpha, popover);
      expect(contrastRatio(rgbToHex(DARK_POP_ACCENT), rgbToHex(row))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });
});
