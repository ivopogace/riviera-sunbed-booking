import { AA_LARGE, AA_NORMAL, composite, contrastRatio, hexToRgb, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  CARD_TRACK_ALPHA,
  FIELD_BORDER_ALPHA,
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
 * booking cards run. The genuinely new surfaces this slice introduces are the segmented control's
 * two variants: the pill track (a dark tint over the card glass, with a solid-white selected pill)
 * and the option cards (a teal tint when selected, a white wash when not).
 *
 * Deliberately excluded (WCAG 1.4.3 incidental / decorative): the outcome-card tone glyphs, which
 * are `aria-hidden` — the heading carries the meaning.
 */

const ACCENT = hexToRgb('085a6e'); // --riv-accent-ink
const ERROR_INK = hexToRgb('8c2b22'); // the one role="alert" message colour
const CTA_STOPS = ['#0c7288', '#0a5f74']; // --riv-cta-grad, both stops (submit + landed CTA)

/** segmented-control.ts card variant: the selected teal tint and the unselected white wash. */
const OPTION_SELECTED: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.16 };
const OPTION_UNSELECTED: Glass = { color: WHITE, alpha: 0.5 };

interface Theme {
  readonly name: string;
  readonly stops: readonly ReturnType<typeof hexToRgb>[];
  readonly cardGlass: Glass;
}

const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS },
];

describe.each(THEMES)('AuthPage contrast — $name', (theme: Theme) => {
  it('card ink (title, field text, option labels) is AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (subtitle, toggle prompt, landed body) is AA', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (field labels, password hint, option blurbs) is AA', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('the accent ink (links, mode toggle, selected pill) is AA', () => {
    expectAaOverStops(ACCENT, 1, theme.cardGlass, theme.stops);
  });

  it('the error message is AA on the card glass', () => {
    expectAaOverStops(ERROR_INK, 1, theme.cardGlass, theme.stops);
  });

  it('field text is AA over the field fill composited on the card glass', () => {
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, card);
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(field)),
        `field ink over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the field border clears the 3:1 component boundary against the card (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const border = composite(CARD_INK, FIELD_BORDER_ALPHA, card);
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
      const track = composite(CARD_INK, CARD_TRACK_ALPHA, card);
      const ink = composite(CARD_INK, CARD_INK_SOFT_ALPHA, track);
      expect(
        contrastRatio(rgbToHex(ink), rgbToHex(track)),
        `inactive pill ink over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the selected pill label is AA on its solid white fill', () => {
    // The selected pill is opaque white, so it does not depend on the stop underneath.
    expect(contrastRatio(rgbToHex(ACCENT), rgbToHex(WHITE))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('option-card label and blurb are AA on both option fills', () => {
    for (const option of [OPTION_SELECTED, OPTION_UNSELECTED]) {
      for (const stop of theme.stops) {
        const card = surfaceOver(theme.cardGlass, stop);
        const fill = composite(option.color, option.alpha, card);
        const blurb = composite(CARD_INK, CARD_INK_FAINT_ALPHA, fill);
        expect(
          contrastRatio(rgbToHex(INK_DARK), rgbToHex(fill)),
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
