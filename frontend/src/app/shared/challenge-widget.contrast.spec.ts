import {
  AA_LARGE,
  AA_NORMAL,
  composite,
  contrastRatio,
  Rgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  ACCENT_INK,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_FIELD_BORDER,
  DARK_FIELD_FILL,
  DARK_ON_ACCENT_INK,
  DARK_STOPS,
  FIELD_BORDER_ALPHA,
  FIELD_FILL_ALPHA,
  Glass,
  INK_DARK,
  CARD_INK,
  ON_ACCENT_INK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  WHITE,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf, themeBlock } from '../../testing/stylesheet-tokens';

/**
 * WCAG-AA guard for the proof-of-work control's mapped tokens. The wrapper paints the ALTCHA
 * widget with `--riv-*` tokens, so what has to hold per theme is: the label ink on the widget's
 * base (the field fill over the card glass over the theme's worst stops), the attribution footer
 * at the widget's own 0.7 opacity, the checkbox border at the non-text 3:1, and the checked state
 * — the accent fill against the base, and the check glyph's `--riv-on-accent-ink` on the accent.
 *
 * <p>`--riv-on-accent-ink` is the one token this slice adds: an ink placed ON an accent fill, so
 * it must move with `--riv-accent-ink` — white on the light themes' dark teal, the dark card ink on
 * the dark theme's light teal. The stylesheet pin below keeps the two declarations paired.
 */

const FOOTER_OPACITY = 0.7;

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly card: Glass;
  readonly field: Glass;
  readonly border: Glass;
  readonly ink: Rgb;
  readonly accent: Rgb;
  readonly onAccent: Rgb;
}

const THEMES: readonly Theme[] = [
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    card: PORCELAIN_CARD_GLASS,
    field: { color: WHITE, alpha: FIELD_FILL_ALPHA },
    border: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
    ink: INK_DARK,
    accent: ACCENT_INK,
    onAccent: ON_ACCENT_INK,
  },
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    card: RIVIERA_CARD_GLASS,
    field: { color: WHITE, alpha: FIELD_FILL_ALPHA },
    border: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
    ink: INK_DARK,
    accent: ACCENT_INK,
    onAccent: ON_ACCENT_INK,
  },
  {
    name: 'dark',
    stops: DARK_STOPS,
    card: DARK_CARD_GLASS,
    field: DARK_FIELD_FILL,
    border: DARK_FIELD_BORDER,
    ink: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    onAccent: DARK_ON_ACCENT_INK,
  },
];

/** The widget's base at one stop: the field fill composited over the card glass over the stop. */
function base(theme: Theme, stop: Rgb): Rgb {
  return surfaceOver(theme.field, surfaceOver(theme.card, stop));
}

function ratio(fg: Rgb, bg: Rgb): number {
  return contrastRatio(rgbToHex(fg), rgbToHex(bg));
}

describe('challenge widget contrast', () => {
  describe.each(THEMES)('$name', (theme) => {
    it.each(theme.stops.map((stop) => [rgbToHex(stop), stop] as const))(
      'label ink and footer read on the widget base over stop %s',
      (_, stop) => {
        const surface = base(theme, stop);
        expect(ratio(theme.ink, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
        const footer = composite(theme.ink, FOOTER_OPACITY, surface);
        expect(ratio(footer, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      },
    );

    it.each(theme.stops.map((stop) => [rgbToHex(stop), stop] as const))(
      'checkbox border and checked state clear 3:1 over stop %s',
      (_, stop) => {
        const surface = base(theme, stop);
        const border = composite(theme.border.color, theme.border.alpha, surface);
        expect(ratio(border, surface)).toBeGreaterThanOrEqual(AA_LARGE);
        expect(ratio(theme.accent, surface)).toBeGreaterThanOrEqual(AA_LARGE);
      },
    );

    it('paints the check glyph legibly on the accent fill', () => {
      expect(ratio(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });

  it('declares --riv-on-accent-ink once in the base block and once in the dark block', () => {
    expect(declarationsOf('--riv-on-accent-ink')).toEqual([
      rgbToHex(ON_ACCENT_INK),
      rgbToHex(DARK_ON_ACCENT_INK),
    ]);
    expect(baseBlock()).toContain(`--riv-on-accent-ink: ${rgbToHex(ON_ACCENT_INK)}`);
    expect(themeBlock('dark')).toContain(`--riv-on-accent-ink: ${rgbToHex(DARK_ON_ACCENT_INK)}`);
    expect(themeBlock('riviera')).not.toContain('--riv-on-accent-ink');
  });
});
