import { AA_NORMAL, Rgb, contrastRatio, hexToRgb } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass "You're booked." confirmation card. A centered
 * card-glass surface on the bare themed gradient, so every pair is the EFFECTIVE colour
 * composited over the theme's worst-case stops (the venue-map pattern). Mirrors
 * booking-confirmation.scss. The ✓ badge is decorative (aria-hidden) — 1.4.11-exempt.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (Paid, big code, link)
const CTA_STOPS = ['#0c7288', '#0a5f74']; // --riv-cta-grad — the "Back to the beach" button

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
}
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS },
];

describe('Confirmation card — theme-independent CTA (WCAG AA, issue #137)', () => {
  it('the primary button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe.each(THEMES)('Confirmation card glass contrast — $name theme (WCAG AA, issue #137)', (theme) => {
  it('card ink (heading, summary values) meets AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (lead, summary keys, code label + note) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (Paid amount, big booking code, manage link) meets AA on the card glass', () => {
    expectAaOverStops(hexToRgb(ACCENT), 1, theme.cardGlass, theme.stops);
  });
});
