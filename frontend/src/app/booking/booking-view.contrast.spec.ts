import { AA_NORMAL, Rgb, contrastRatio, hexToRgb } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_CARD_GLASS,
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
 * WCAG-AA contrast guard for the Liquid Glass booking view. Two families:
 *
 *  1. Card-surface text sits on the translucent card glass over the bare gradient, so each pair is
 *     the EFFECTIVE colour composited over the theme's worst-case stops (the confirmation-card
 *     pattern) — proven with `expectAaOverStops`.
 *  2. Status banners and the cancel buttons use OPAQUE SOLID fills (the css:S7924 treatment), so
 *     their text contrast is theme-independent and asserted directly with `contrastRatio`. Values
 *     mirror the `CLS` recipes in `booking-view.ts` — the component's SCSS is retired, so
 *     the utilities on those elements are what these numbers must track. (The status **chips**
 *     live in the `shared/status-chip.ts` directive — their
 *     AA proof lives in `shared/booking-status.contrast.spec.ts`.)
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (booking code, Paid amount, cancel result, links)

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
}
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS },
  { name: 'dark', stops: DARK_STOPS, cardGlass: DARK_CARD_GLASS },
];

describe.each(THEMES)('Booking view — card-glass text (WCAG AA, issue #138) — $name', (theme) => {
  it('card ink (title, detail values, strong emphasis) meets AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (lead, detail labels, code label/note, terms) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (booking code, Paid amount, cancel result, links) meets AA on the card glass', () => {
    expectAaOverStops(hexToRgb(ACCENT), 1, theme.cardGlass, theme.stops);
  });
});

// ---- theme-independent solid fills (banners + buttons; chips are in booking-status.contrast.spec) ----

const BANNERS: readonly [name: string, fill: string, eyebrow: string][] = [
  ['awaiting', '#ddf4f8', '#0a5e7a'],
  ['pending', '#fdf5e6', '#8a5410'],
  ['declined', '#faefec', '#8a3a2a'],
  ['expired', '#f0f2f3', '#4f5f67'],
  ['withdrawn', '#f0eef6', '#5c5470'],
  ['cancelled', '#f0f2f3', '#4f5f67'],
];
const BANNER_BODY = '#334a52';
const BANNER_STRONG = '#0a2a33';

describe('Booking view — status banners (solid fills, WCAG AA, issue #138)', () => {
  it.each(BANNERS)(
    'the %s banner eyebrow, body and strong meet AA on its fill',
    (_name, fill, eyebrow) => {
      expect(contrastRatio(eyebrow, fill), 'eyebrow').toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(BANNER_BODY, fill), 'body').toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(BANNER_STRONG, fill), 'strong').toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );
});

describe('Booking view — withdraw prose inside the pending banner (#123)', () => {
  it('the confirm question and result line reuse the banner ink, so they meet AA on its fill', () => {
    // Pinned to BANNER_BODY: a themed ink over a FIXED banner fill drifts between themes.
    const pendingFill = BANNERS.find(([name]) => name === 'pending')![1];
    expect(contrastRatio(BANNER_BODY, pendingFill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('Booking view — action buttons (WCAG AA, issue #138)', () => {
  it('the destructive confirm (white) meets AA on both terracotta gradient stops', () => {
    for (const stop of ['#c14a2c', '#a83c25']) {
      expect(contrastRatio('#ffffff', stop), `over ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the outline buttons (Cancel / Keep) inks meet AA on the solid #f4f6f7 fill', () => {
    for (const ink of ['#a3372a', '#0a4f5e']) {
      expect(contrastRatio(ink, '#f4f6f7'), ink).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the Pay now CTA (white) meets AA on both --riv-cta-grad stops', () => {
    for (const stop of ['#0c7288', '#0a5f74']) {
      expect(contrastRatio('#ffffff', stop), `over ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
