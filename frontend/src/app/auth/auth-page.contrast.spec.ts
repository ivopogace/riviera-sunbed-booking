import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  ACCENT_CHIP_FILL,
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  CARD_TRACK_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_CARD_TRACK,
  DARK_ERROR_INK,
  DARK_FIELD_BORDER,
  DARK_FIELD_FILL,
  DARK_STOPS,
  DARK_WASH_FILL,
  FIELD_BORDER_ALPHA,
  MEDALLION_POSITIVE_FILL,
  MEDALLION_POSITIVE_INK,
  MEDALLION_WAITING_FILL,
  MEDALLION_WAITING_INK,
  FIELD_FILL_ALPHA,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the unified auth card. The card is translucent, so
 * every pair is checked as the EFFECTIVE colour — the card glass composited over the worst-case
 * stops of the theme's background gradient, then each alpha ink composited over that result.
 *
 * The card reuses the already-proven `--riv-*` token set, so most rows are the same maths the
 * booking cards run. The genuinely new surfaces here are the segmented control's
 * two variants: the pill track (a dark tint over the card glass, with a solid-white selected pill)
 * and the option cards (a teal tint when selected, a white wash when not).
 *
 * The outcome-card tone glyphs are `aria-hidden` — the heading carries the meaning — so WCAG 1.4.3
 * exempts them from the AA text minimum, and #858's posture across the whole medallion family is
 * carried here unchanged. They are NOT exempt from being *legible*, and that half used to go
 * unasserted: the glyph row below holds them to 1.4.11's 3:1 non-text floor. It is the only guard
 * in the tree that composites a glyph's own fill onto THIS theme's card, which is the exact shape
 * of the failure it exists for — a fixed ink over a fill the theme moves underneath it (#869).
 */

const ACCENT = hexToRgb('085a6e'); // --riv-accent-ink (light themes)
const ERROR_INK = hexToRgb('a3160e'); // --riv-error-ink (light themes; was #8c2b22 pre-token)
const CTA_STOPS = ['#0c7288', '#0a5f74']; // --riv-cta-grad, both stops (submit + landed CTA)

/**
 * shared/outcome-card.ts's two tone glyphs, wearing the `--riv-medallion-*` skin since #869.
 *
 * <p>ONE array shared by all three themes rather than a row per theme, and the shape is the claim:
 * both pairs are opaque and theme-invariant, so `alpha: 1` makes the composite below collapse to
 * the fill itself and every theme reads the same number. Before #869 this had to be per-theme —
 * the `success` ink was `--riv-accent-ink` over a translucent tint, and the `pending` ink was a
 * one-off `#a86a12` fixed over one, which is the pairing that measured 2.46:1 in dark.
 */
const TONE_GLYPHS: readonly ToneGlyph[] = [
  {
    tone: 'success',
    ink: MEDALLION_POSITIVE_INK,
    fill: { color: MEDALLION_POSITIVE_FILL, alpha: 1 },
  },
  {
    tone: 'pending',
    ink: MEDALLION_WAITING_INK,
    fill: { color: MEDALLION_WAITING_FILL, alpha: 1 },
  },
];

/** segmented-control.ts card variant: --riv-accent-chip-fill over --riv-wash-fill. */
const OPTION_SELECTED: Glass = ACCENT_CHIP_FILL;
const LIGHT_WASH: Glass = { color: WHITE, alpha: 0.5 };

interface Theme {
  readonly name: string;
  readonly stops: readonly ReturnType<typeof hexToRgb>[];
  readonly cardGlass: Glass;
  readonly cardInk: Rgb; // --riv-card-ink
  readonly cardInkBase: Rgb; // base of the muted rgba ink family
  readonly accent: Rgb; // --riv-accent-ink
  readonly error: Rgb; // --riv-error-ink
  readonly fieldFill: Glass; // --riv-field-fill over the card
  readonly fieldBorder: Glass; // --riv-field-border over the card
  readonly track: Glass; // --riv-card-track tint over the card
  readonly pillFill: Rgb; // --riv-pill-fill (opaque selected pill)
  readonly optionUnselected: Glass; // --riv-wash-fill over the card
  readonly toneGlyphs: readonly ToneGlyph[]; // outcome-card's two decorative medallions
}

/** One outcome-card tone: the ink, and the fill it sits on before the card is composited in. */
interface ToneGlyph {
  readonly tone: string;
  readonly ink: Rgb;
  readonly fill: Glass;
}

const THEMES: readonly Theme[] = [
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    cardGlass: RIVIERA_CARD_GLASS,
    cardInk: INK_DARK,
    cardInkBase: CARD_INK,
    accent: ACCENT,
    error: ERROR_INK,
    fieldFill: { color: WHITE, alpha: FIELD_FILL_ALPHA },
    fieldBorder: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
    track: { color: CARD_INK, alpha: CARD_TRACK_ALPHA },
    pillFill: WHITE,
    optionUnselected: LIGHT_WASH,
    toneGlyphs: TONE_GLYPHS,
  },
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    cardGlass: PORCELAIN_CARD_GLASS,
    cardInk: INK_DARK,
    cardInkBase: CARD_INK,
    accent: ACCENT,
    error: ERROR_INK,
    fieldFill: { color: WHITE, alpha: FIELD_FILL_ALPHA },
    fieldBorder: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
    track: { color: CARD_INK, alpha: CARD_TRACK_ALPHA },
    pillFill: WHITE,
    optionUnselected: LIGHT_WASH,
    toneGlyphs: TONE_GLYPHS,
  },
  {
    name: 'dark',
    stops: DARK_STOPS,
    cardGlass: DARK_CARD_GLASS,
    cardInk: DARK_CARD_INK,
    cardInkBase: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    error: DARK_ERROR_INK,
    fieldFill: DARK_FIELD_FILL,
    fieldBorder: DARK_FIELD_BORDER,
    track: DARK_CARD_TRACK,
    pillFill: hexToRgb('101a2e'),
    optionUnselected: DARK_WASH_FILL,
    toneGlyphs: TONE_GLYPHS,
  },
];

describe.each(THEMES)('AuthPage contrast — $name', (theme: Theme) => {
  it('card ink (title, field text, option labels) is AA on the card glass', () => {
    expectAaOverStops(theme.cardInk, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (subtitle, toggle prompt, landed body) is AA', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (field labels, password hint, option blurbs) is AA', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('the accent ink (links, mode toggle, selected pill) is AA', () => {
    expectAaOverStops(theme.accent, 1, theme.cardGlass, theme.stops);
  });

  it('the error message is AA on the card glass', () => {
    expectAaOverStops(theme.error, 1, theme.cardGlass, theme.stops);
  });

  it('field text is AA over the field fill composited on the card glass', () => {
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const field = composite(theme.fieldFill.color, theme.fieldFill.alpha, card);
      expect(
        contrastRatio(rgbToHex(theme.cardInk), rgbToHex(field)),
        `field ink over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the field border clears the 3:1 component boundary against the card (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const border = composite(theme.fieldBorder.color, theme.fieldBorder.alpha, card);
      expect(
        contrastRatio(rgbToHex(border), rgbToHex(card)),
        `field border over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the unselected pill label is AA over the pill track', () => {
    // A THIRD composite (track tint on card glass) — why this label is ink-soft: faint gives 4.38:1.
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const track = composite(theme.track.color, theme.track.alpha, card);
      const ink = composite(theme.cardInkBase, CARD_INK_SOFT_ALPHA, track);
      expect(
        contrastRatio(rgbToHex(ink), rgbToHex(track)),
        `inactive pill ink over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the selected pill label is AA on its solid pill fill', () => {
    // The selected pill is opaque, so it does not depend on the stop underneath.
    expect(contrastRatio(rgbToHex(theme.accent), rgbToHex(theme.pillFill))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('the outcome-card tone glyphs clear the 3:1 non-text floor on the card (WCAG 1.4.11)', () => {
    /** aria-hidden buys the AA exemption (spec header), never a pass on legibility. Composited
     *  per stop because a TRANSLUCENT glyph fill resolves against the card, and the card themes. */
    for (const glyph of theme.toneGlyphs) {
      for (const stop of theme.stops) {
        const card = surfaceOver(theme.cardGlass, stop);
        const fill = composite(glyph.fill.color, glyph.fill.alpha, card);
        expect(
          contrastRatio(rgbToHex(glyph.ink), rgbToHex(fill)),
          `${glyph.tone} glyph over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    }
  });

  it('option-card label and blurb are AA on both option fills', () => {
    for (const option of [OPTION_SELECTED, theme.optionUnselected]) {
      for (const stop of theme.stops) {
        const card = surfaceOver(theme.cardGlass, stop);
        const fill = composite(option.color, option.alpha, card);
        const blurb = composite(theme.cardInkBase, CARD_INK_FAINT_ALPHA, fill);
        expect(
          contrastRatio(rgbToHex(theme.cardInk), rgbToHex(fill)),
          `option label over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(
          contrastRatio(rgbToHex(blurb), rgbToHex(fill)),
          `option blurb over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });
});

describe('AuthPage contrast — theme-invariant', () => {
  it('white CTA text is AA on both gradient stops (submit + landed CTA)', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `CTA stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
