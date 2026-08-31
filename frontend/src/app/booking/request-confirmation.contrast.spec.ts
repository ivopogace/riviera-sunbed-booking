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
 * WCAG-AA contrast guard for the Liquid Glass "Request sent" card. A centered card-glass surface on the bare themed gradient — every pair is the EFFECTIVE
 * colour composited over the theme's worst-case stops (the venue-map pattern). Mirrors
 * request-confirmation.ts's `CLS` recipe (the amber info box text is card ink-soft, covered
 * below). The ✉ badge
 * is decorative (aria-hidden) — 1.4.11-exempt.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (big reference code)
const CTA_STOPS = ['#0c7288', '#0a5f74']; // --riv-cta-grad — the "Track this request" button

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

describe('Request-sent card — theme-independent CTA (WCAG AA, issue #137)', () => {
  it('the primary button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe.each(THEMES)(
  'Request-sent card glass contrast — $name theme (WCAG AA, issue #137)',
  (theme) => {
    it('card ink (heading, emphasis) meets AA on the card glass', () => {
      expectAaOverStops(theme.cardInk, 1, theme.cardGlass, theme.stops);
    });

    it('card ink-soft (lead, info box, code label, status) meets AA on the card glass', () => {
      expectAaOverStops(theme.cardInkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
    });

    it('accent ink (big reference code) meets AA on the card glass', () => {
      expectAaOverStops(theme.accent, 1, theme.cardGlass, theme.stops);
    });
  },
);
