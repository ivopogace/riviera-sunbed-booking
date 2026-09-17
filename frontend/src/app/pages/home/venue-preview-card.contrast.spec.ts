import {
  AA_LARGE,
  AA_NORMAL,
  composite,
  contrastRatio,
  Rgb,
  rgbToHex,
} from '../../../testing/contrast';
import {
  ACCENT_INK,
  CARD_INK,
  CARD_TRACK_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_CARD_TRACK,
  DARK_STOPS,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
} from '../../../testing/glass-tokens';

/**
 * Contrast guard for the pin preview's crowd stepper — the two chevrons and the dot rail, which sit
 * on the card's own track tint (`--riv-card-track`) over the card glass over whatever the map paints
 * beneath: so every pair is composited over each theme's worst-case stops.
 *
 * The chevrons are glyphs in the card ink and are held to AA normal (WCAG 1.4.3), as the card's
 * other text is. The active dot is the one visible cue of where the tourist stands in the crowd, so
 * it is held to 3:1 against the track (WCAG 1.4.11). Deliberately NOT asserted: the inactive dots'
 * `card-ink-soft/35` tint — they are decorative, as the inert Discover rail's are
 * (`photo-slideshow.contrast.spec.ts`): the position is carried by the live region's text, by the
 * pill's `k/n` on the map, and by the accent pill's shape and place among them.
 */
interface Theme {
  readonly name: string;
  readonly glass: Glass;
  readonly track: Glass;
  readonly ink: Rgb;
  readonly accent: Rgb;
  readonly stops: readonly Rgb[];
}

const THEMES: readonly Theme[] = [
  {
    name: 'porcelain',
    glass: PORCELAIN_CARD_GLASS,
    track: { color: CARD_INK, alpha: CARD_TRACK_ALPHA },
    ink: INK_DARK,
    accent: ACCENT_INK,
    stops: PORCELAIN_STOPS,
  },
  {
    name: 'riviera',
    glass: RIVIERA_CARD_GLASS,
    track: { color: CARD_INK, alpha: CARD_TRACK_ALPHA },
    ink: INK_DARK,
    accent: ACCENT_INK,
    stops: RIVIERA_STOPS,
  },
  {
    name: 'dark',
    glass: DARK_CARD_GLASS,
    track: DARK_CARD_TRACK,
    ink: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    stops: DARK_STOPS,
  },
];

function trackOver(theme: Theme, stop: Rgb): Rgb {
  const glass = composite(theme.glass.color, theme.glass.alpha, stop);
  return composite(theme.track.color, theme.track.alpha, glass);
}

describe.each(THEMES)('Pin preview stepper contrast ($name theme)', (theme) => {
  it('the chevrons read at AA normal on the track over the card glass over every stop', () => {
    for (const stop of theme.stops) {
      expect(
        contrastRatio(rgbToHex(theme.ink), rgbToHex(trackOver(theme, stop))),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the active dot marks the current venue at 3:1 against the track over every stop', () => {
    for (const stop of theme.stops) {
      expect(
        contrastRatio(rgbToHex(theme.accent), rgbToHex(trackOver(theme, stop))),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});
