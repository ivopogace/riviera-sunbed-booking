import { AA_NORMAL, Rgb, contrastRatio, hexToRgb, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_ERROR_INK,
  DARK_STOPS,
  DARK_WASH_FILL,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  SOLID_BTN_DANGER_INK,
  SOLID_BTN_FILL,
  SOLID_BTN_INK,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the review panel's own surfaces — the sibling of
 * `booking-view.contrast.spec.ts` for the section extracted out of it. Two families, same split:
 * token inks composited over the card glass, and the outline buttons' opaque fill asserted
 * directly. Values mirror the `CLS` recipes in `review-panel.ts`.
 *
 * The own-review card is the one new surface: a white wash over the card glass, so its ink is
 * proven over the *composite*, not over the wash alone.
 */

const ACCENT = hexToRgb('085a6e'); // --riv-accent-ink (the stored rating's stars)
const ERROR_INK = hexToRgb('a3160e'); // --riv-error-ink (the per-field messages)
/** `--riv-wash-fill` on the light ink families; the dark theme swaps it for a far fainter one. */
const LIGHT_WASH_FILL: Glass = { color: hexToRgb('ffffff'), alpha: 0.5 };

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
  readonly ink: Rgb;
  readonly inkBase: Rgb;
  readonly accent: Rgb;
  readonly error: Rgb;
  /** `cls.ownCard`'s `--riv-wash-fill`, painted over the card glass. */
  readonly wash: Glass;
}

const LIGHT_INKS = {
  ink: INK_DARK,
  inkBase: CARD_INK,
  accent: ACCENT,
  error: ERROR_INK,
  wash: LIGHT_WASH_FILL,
};
const DARK_INKS = {
  ink: DARK_CARD_INK,
  inkBase: DARK_CARD_INK,
  accent: DARK_ACCENT_INK,
  error: DARK_ERROR_INK,
  wash: DARK_WASH_FILL,
};

const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS, ...LIGHT_INKS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS, ...LIGHT_INKS },
  { name: 'dark', stops: DARK_STOPS, cardGlass: DARK_CARD_GLASS, ...DARK_INKS },
];

describe.each(THEMES)('Review panel — card-glass text (WCAG AA) — $name', (theme) => {
  it('the section title and the stored review name/comment meet AA on the card glass', () => {
    expectAaOverStops(theme.ink, 1, theme.cardGlass, theme.stops);
  });

  it('the section note (the frozen and window-closed copy) meets AA on the card glass', () => {
    expectAaOverStops(theme.inkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('the per-field error ink meets AA on the card glass', () => {
    expectAaOverStops(theme.error, 1, theme.cardGlass, theme.stops);
  });
});

describe.each(THEMES)('Review panel — the own-review wash (WCAG AA) — $name', (theme) => {
  it('the stored rating stars meet AA over the wash composited on the card glass', () => {
    expectAaOverStops(theme.accent, 1, layered(theme.wash, theme.cardGlass), theme.stops);
  });

  it('the stored review name and comment meet AA over that same composite', () => {
    expectAaOverStops(theme.ink, 1, layered(theme.wash, theme.cardGlass), theme.stops);
  });
});

describe('Review panel — outline buttons (solid fill, WCAG AA)', () => {
  /** Both inks are --riv-solid-btn-*, theme-invariant because the fill under them is too. */
  it('the edit and remove inks meet AA on the solid fill', () => {
    for (const ink of [SOLID_BTN_INK, SOLID_BTN_DANGER_INK].map(rgbToHex)) {
      expect(contrastRatio(ink, rgbToHex(SOLID_BTN_FILL)), ink).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/** Two translucent layers as one: the wash painted over the glass, both over whatever is behind. */
function layered(front: Glass, back: Glass): Glass {
  const alpha = front.alpha + back.alpha * (1 - front.alpha);
  const channel = (index: 0 | 1 | 2) =>
    (front.color[index] * front.alpha + back.color[index] * back.alpha * (1 - front.alpha)) / alpha;
  return { color: [channel(0), channel(1), channel(2)], alpha };
}
