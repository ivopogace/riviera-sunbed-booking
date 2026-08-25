import { AA_NORMAL, Rgb, contrastRatio, hexToRgb } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_STOPS,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass "My bookings" list. Row and
 * empty-state text sit on the translucent card glass over the bare gradient, so each pair is the
 * effective colour composited over the theme's worst-case stops (the shared card-glass pattern).
 * The status chips are proven separately (theme-independent solids) in
 * `shared/booking-status.contrast.spec.ts`; the two solid-fill controls here are asserted directly.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (booking code, back link)

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
  readonly cardInk: Rgb; // --riv-card-ink
  readonly cardInkBase: Rgb; // base of the muted rgba ink family
  readonly accent: Rgb; // --riv-accent-ink
}
const LIGHT_INKS = { cardInk: INK_DARK, cardInkBase: CARD_INK, accent: hexToRgb(ACCENT.slice(1)) };
const DARK_INKS = { cardInk: DARK_CARD_INK, cardInkBase: DARK_CARD_INK, accent: DARK_ACCENT_INK };
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS, ...LIGHT_INKS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS, ...LIGHT_INKS },
  { name: 'dark', stops: DARK_STOPS, cardGlass: DARK_CARD_GLASS, ...DARK_INKS },
];

describe.each(THEMES)('My bookings — card-glass text (WCAG AA, issue #139) — $name', (theme) => {
  it('card ink (venue name, amount, headings) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInk, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (set/date meta, sub-label, empty lead) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (booking code, back link) meets AA on the card glass', () => {
    expectAaOverStops(theme.accent, 1, theme.cardGlass, theme.stops);
  });
});

describe('My bookings — solid-fill controls (WCAG AA, issue #139)', () => {
  it('the Browse beaches CTA (white) meets AA on both --riv-cta-grad stops', () => {
    for (const stop of ['#0c7288', '#0a5f74']) {
      expect(contrastRatio('#ffffff', stop), `over ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the Retry outline ink meets AA on its solid #f4f6f7 fill', () => {
    expect(contrastRatio('#0a4f5e', '#f4f6f7')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the rows-failed alert ink (#a3160e, #745) meets AA on its solid #f6e8e7 fill', () => {
    expect(contrastRatio('#a3160e', '#f6e8e7')).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
