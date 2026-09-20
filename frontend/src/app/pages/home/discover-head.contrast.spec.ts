import { AA_NORMAL, contrastRatio, Rgb, rgbToHex } from '../../../testing/contrast';
import {
  ACCENT_INK,
  CARD_INK,
  DARK_ACCENT_INK,
  DARK_CARD_INK,
  DARK_FIELD_FILL,
  DARK_HEADER_GLASS,
  DARK_ON_ACCENT_INK,
  DARK_STOPS,
  DARK_TABBAR_GLASS,
  FIELD_FILL_ALPHA,
  Glass,
  INK_DARK,
  ON_ACCENT_INK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  PORCELAIN_TABBAR_GLASS,
  RIVIERA_HEADER_GLASS,
  RIVIERA_STOPS,
  RIVIERA_TABBAR_GLASS,
  surfaceOver,
  WHITE,
} from '../../../testing/glass-tokens';

/**
 * Contrast guard for the sheet's head: its inks sit on the tab bar's near-opaque glass over the
 * sheet's panel glass over whatever the map paints beneath, so every pair is composited over each
 * theme's worst-case stops. The chips wear the field skin (`--riv-field-fill` under
 * `--riv-card-ink`), the field's fill itself translucent over the head; the count disc and a lit
 * chip are the opaque accent pair. Everything here is body text, held to AA normal.
 */
interface Theme {
  readonly name: string;
  readonly panel: Glass;
  readonly head: Glass;
  readonly ink: Rgb;
  readonly inkSoft: Glass;
  readonly field: Glass;
  readonly fieldInk: Rgb;
  readonly accent: Rgb;
  readonly onAccent: Rgb;
  readonly stops: readonly Rgb[];
}

/** `--riv-ink-soft` per theme: the subtitle's ink (`tailwind.css`). */
const INK_SOFT: Glass = { color: CARD_INK, alpha: 0.7 };
const LIGHT_INK_SOFT: Glass = { color: WHITE, alpha: 0.86 };
/** `--riv-field-fill` in porcelain and riviera: white at 0.55 (riviera declares no override). */
const FIELD_FILL: Glass = { color: WHITE, alpha: FIELD_FILL_ALPHA };

const THEMES: readonly Theme[] = [
  {
    name: 'porcelain',
    panel: PORCELAIN_HEADER_GLASS,
    head: PORCELAIN_TABBAR_GLASS,
    ink: INK_DARK,
    inkSoft: INK_SOFT,
    field: FIELD_FILL,
    fieldInk: CARD_INK,
    accent: ACCENT_INK,
    onAccent: ON_ACCENT_INK,
    stops: PORCELAIN_STOPS,
  },
  {
    name: 'riviera',
    panel: RIVIERA_HEADER_GLASS,
    head: RIVIERA_TABBAR_GLASS,
    ink: WHITE,
    inkSoft: LIGHT_INK_SOFT,
    field: FIELD_FILL,
    fieldInk: CARD_INK,
    accent: ACCENT_INK,
    onAccent: ON_ACCENT_INK,
    stops: RIVIERA_STOPS,
  },
  {
    name: 'dark',
    panel: DARK_HEADER_GLASS,
    head: DARK_TABBAR_GLASS,
    ink: WHITE,
    inkSoft: LIGHT_INK_SOFT,
    field: DARK_FIELD_FILL,
    fieldInk: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    onAccent: DARK_ON_ACCENT_INK,
    stops: DARK_STOPS,
  },
];

function headOver(theme: Theme, stop: Rgb): Rgb {
  return surfaceOver(theme.head, surfaceOver(theme.panel, stop));
}

describe.each(THEMES)('Discover head contrast ($name theme)', (theme) => {
  it('the title and the selling line read at AA normal on the head over every stop', () => {
    for (const stop of theme.stops) {
      const head = headOver(theme, stop);
      expect(
        contrastRatio(rgbToHex(theme.ink), rgbToHex(head)),
        `title over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      const soft = surfaceOver(theme.inkSoft, head);
      expect(
        contrastRatio(rgbToHex(soft), rgbToHex(head)),
        `subtitle over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('a chip’s ink reads at AA normal on the field fill over the head over every stop', () => {
    for (const stop of theme.stops) {
      const fill = surfaceOver(theme.field, headOver(theme, stop));
      expect(
        contrastRatio(rgbToHex(theme.fieldInk), rgbToHex(fill)),
        `over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the count disc and a lit chip read at AA normal as the accent pair', () => {
    expect(contrastRatio(rgbToHex(theme.onAccent), rgbToHex(theme.accent))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});
