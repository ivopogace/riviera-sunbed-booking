import { AA_LARGE, AA_NORMAL, contrastRatio, Rgb, rgbToHex } from '../../../testing/contrast';
import {
  ACCENT_INK,
  DARK_ACCENT_INK,
  DARK_HEADER_GLASS,
  DARK_INK_FAINT,
  DARK_ON_ACCENT_INK,
  DARK_STOPS,
  DARK_TABBAR_GLASS,
  Glass,
  INK_FAINT,
  ON_ACCENT_INK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  PORCELAIN_TABBAR_GLASS,
  RIVIERA_HEADER_GLASS,
  RIVIERA_INK_FAINT,
  RIVIERA_STOPS,
  RIVIERA_TABBAR_GLASS,
  surfaceOver,
} from '../../../testing/glass-tokens';

/**
 * Contrast guard for the sheet's own chrome. The head is the tab bar's near-opaque glass over the
 * sheet's panel glass over whatever the map paints beneath, so the grabber's bar is composited
 * over each theme's worst-case stops and held to 3:1 (WCAG 1.4.11: it is the one visible cue of a
 * control whose name is in its label). The Map pill is the accent pair, opaque, so its ink is
 * checked once per theme.
 */
interface Theme {
  readonly name: string;
  readonly panel: Glass;
  readonly head: Glass;
  readonly bar: Glass;
  readonly accent: Rgb;
  readonly onAccent: Rgb;
  readonly stops: readonly Rgb[];
}

const THEMES: readonly Theme[] = [
  {
    name: 'porcelain',
    panel: PORCELAIN_HEADER_GLASS,
    head: PORCELAIN_TABBAR_GLASS,
    bar: INK_FAINT,
    accent: ACCENT_INK,
    onAccent: ON_ACCENT_INK,
    stops: PORCELAIN_STOPS,
  },
  {
    name: 'riviera',
    panel: RIVIERA_HEADER_GLASS,
    head: RIVIERA_TABBAR_GLASS,
    bar: RIVIERA_INK_FAINT,
    accent: ACCENT_INK,
    onAccent: ON_ACCENT_INK,
    stops: RIVIERA_STOPS,
  },
  {
    name: 'dark',
    panel: DARK_HEADER_GLASS,
    head: DARK_TABBAR_GLASS,
    bar: DARK_INK_FAINT,
    accent: DARK_ACCENT_INK,
    onAccent: DARK_ON_ACCENT_INK,
    stops: DARK_STOPS,
  },
];

/** The head's effective surface over one stop of the theme's background. */
export function headOver(theme: Theme, stop: Rgb): Rgb {
  return surfaceOver(theme.head, surfaceOver(theme.panel, stop));
}

describe.each(THEMES)('Discover sheet contrast ($name theme)', (theme) => {
  it('the grabber bar reads at 3:1 on the head over every stop', () => {
    for (const stop of theme.stops) {
      const head = headOver(theme, stop);
      const bar = surfaceOver(theme.bar, head);
      expect(
        contrastRatio(rgbToHex(bar), rgbToHex(head)),
        `over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the Map pill’s ink reads at AA normal on the accent fill', () => {
    expect(contrastRatio(rgbToHex(theme.onAccent), rgbToHex(theme.accent))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});
