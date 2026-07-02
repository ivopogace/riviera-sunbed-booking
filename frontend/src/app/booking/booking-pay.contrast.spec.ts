import { AA_NORMAL, Rgb, contrastRatio, hexToRgb } from '../../testing/contrast';
import {
  CARD_INK,
  Glass,
  INK_DARK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_HEADER_GLASS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass payment page (issue #137, AC-12; gate from #50). The
 * page sits on the bare themed gradient with light card-glass panels, so every pair is the
 * EFFECTIVE colour: the glass composited over the theme's worst-case gradient stops, then the ink
 * over that (the `venue-map.contrast.spec.ts` pattern). Mirrors every text token in booking-pay.scss.
 *
 * Deliberately excluded (1.4.11 decorative, aria-hidden — the heading/label carries the meaning):
 * the ✓ / ⏳ done badge, the spinner, and the ✕ fail badge.
 */

const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
const CARD_INK_SOFT_ALPHA = 0.78; // --riv-card-ink-soft (lead, keys, status, labels)
const CARD_INK_FAINT_ALPHA = 0.72; // --riv-card-ink-faint (trust line)
const ACCENT = '#085a6e'; // --riv-accent-ink (total, code, links)
const ERROR_RED = '#a3160e'; // .form-error
const CTA_STOPS = ['#0c7288', '#0a5f74']; // --riv-cta-grad — the Pay button's white text

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
  readonly headerGlass: Glass;
  readonly headInk: Rgb; // --riv-ink (cancel chip)
}
const THEMES: readonly Theme[] = [
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    cardGlass: RIVIERA_CARD_GLASS,
    headerGlass: RIVIERA_HEADER_GLASS,
    headInk: WHITE,
  },
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    cardGlass: PORCELAIN_CARD_GLASS,
    headerGlass: PORCELAIN_HEADER_GLASS,
    headInk: INK_DARK,
  },
];

describe('Payment page — theme-independent CTA (WCAG AA, issue #137)', () => {
  it('the Pay / manage buttons (white) meet AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe.each(THEMES)('Payment page glass contrast — $name theme (WCAG AA, issue #137)', (theme) => {
  it('card ink (headings, summary values, code) meets AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (lead, summary keys, status, labels) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (trust line) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (total, big code, links) meets AA on the card glass', () => {
    expectAaOverStops(hexToRgb(ACCENT), 1, theme.cardGlass, theme.stops);
  });

  it('error red (payment error) meets AA on the card glass', () => {
    expectAaOverStops(hexToRgb(ERROR_RED), 1, theme.cardGlass, theme.stops);
  });

  it('cancel-chip ink meets AA on the dark header glass over every gradient stop', () => {
    expectAaOverStops(theme.headInk, 1, theme.headerGlass, theme.stops);
  });
});
