import { AA_NORMAL, Rgb, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  ACCENT_INK,
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_STOPS,
  DARK_WASH_FILL,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  SOLID_BTN_FILL,
  SOLID_BTN_INK,
  WHITE,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the venue page's review section. It paints the review panel's inks on
 * the review panel's surfaces — the section title, notes and each entry's words on the card glass,
 * the stars and name over the wash composited on that glass, the outline control on its solid fill
 * — so this mirrors `review-panel.contrast.spec.ts` row for row, against the `CLS` recipes in
 * `venue-reviews.ts`.
 */

/** `--riv-wash-fill` on the light ink families; the dark theme swaps it for a far fainter one. */
const LIGHT_WASH_FILL: Glass = { color: WHITE, alpha: 0.5 };

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
  readonly ink: Rgb;
  readonly inkBase: Rgb;
  readonly accent: Rgb;
  /** `cls.card`'s `--riv-wash-fill`, painted over the card glass. */
  readonly wash: Glass;
}

const LIGHT_INKS = { ink: INK_DARK, inkBase: CARD_INK, accent: ACCENT_INK, wash: LIGHT_WASH_FILL };
const DARK_INKS = {
  ink: DARK_CARD_INK,
  inkBase: DARK_CARD_INK,
  accent: DARK_ACCENT_INK,
  wash: DARK_WASH_FILL,
};

const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS, ...LIGHT_INKS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS, ...LIGHT_INKS },
  { name: 'dark', stops: DARK_STOPS, cardGlass: DARK_CARD_GLASS, ...DARK_INKS },
];

describe.each(THEMES)('Venue reviews — card-glass text (WCAG AA) — $name', (theme) => {
  it('the section title meets AA on the card glass', () => {
    expectAaOverStops(theme.ink, 1, theme.cardGlass, theme.stops);
  });

  it('the loading, empty and failure notes meet AA on the card glass', () => {
    expectAaOverStops(theme.inkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });
});

describe.each(THEMES)('Venue reviews — the entry wash (WCAG AA) — $name', (theme) => {
  it('the stars meet AA over the wash composited on the card glass', () => {
    expectAaOverStops(theme.accent, 1, layered(theme.wash, theme.cardGlass), theme.stops);
  });

  it('the name and the words meet AA over that same composite', () => {
    expectAaOverStops(theme.ink, 1, layered(theme.wash, theme.cardGlass), theme.stops);
  });

  it('the stay month meets AA over that same composite', () => {
    expectAaOverStops(
      theme.inkBase,
      CARD_INK_SOFT_ALPHA,
      layered(theme.wash, theme.cardGlass),
      theme.stops,
    );
  });
});

describe('Venue reviews — the "Show more" control (solid fill, WCAG AA)', () => {
  /** Both --riv-solid-btn-* values are theme-invariant because the fill under them is too. */
  it('the outline ink meets AA on the solid fill', () => {
    expect(contrastRatio(rgbToHex(SOLID_BTN_INK), rgbToHex(SOLID_BTN_FILL))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});

/** Two translucent layers as one: the wash painted over the glass, both over whatever is behind. */
function layered(front: Glass, back: Glass): Glass {
  const alpha = front.alpha + back.alpha * (1 - front.alpha);
  const channel = (index: 0 | 1 | 2) =>
    (front.color[index] * front.alpha + back.color[index] * back.alpha * (1 - front.alpha)) / alpha;
  return { color: [channel(0), channel(1), channel(2)], alpha };
}
