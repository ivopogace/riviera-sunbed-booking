import { AA_NORMAL, Rgb, contrastRatio, hexToRgb } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
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
 * the ✓ / ⏳ done badge, the spinner, and the ✕ fail badge. The done badges now use SOLID composited
 * fills (not translucent tints) so static CSS contrast analysis computes their real colour.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (total, code, links)
const ERROR_RED = '#a3160e'; // .form-error ink
const ERROR_FILL = '#f6e8e7'; // .form-error solid light-pink box (composite of the old rgba(163,22,14,.1) tint)
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

  it('form-error red meets AA on its solid light-pink fill (theme-independent, static-analysis safe)', () => {
    // .form-error now sits on an opaque #f6e8e7 box (was a translucent red tint), so the pair is a
    // single fixed hex in both themes — a real ~6.6:1, not the ~1:1 the analyser saw on the tint.
    expect(contrastRatio(ERROR_RED, ERROR_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
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

  it('cancel-chip ink meets AA on the dark header glass over every gradient stop', () => {
    expectAaOverStops(theme.headInk, 1, theme.headerGlass, theme.stops);
  });
});
