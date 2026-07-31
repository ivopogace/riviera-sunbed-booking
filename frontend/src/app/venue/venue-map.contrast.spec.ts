import { AA_LARGE, AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_CHIP,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_CHIP,
  RIVIERA_HEADER_GLASS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass beach map (issue #136; gate from #38). Glass
 * surfaces are translucent, so every pair is checked as the EFFECTIVE colour — the glass rgba
 * composited over the theme background's worst-case gradient stops, and alpha inks composited
 * over that (the `home.contrast.spec.ts` / `app.contrast.spec.ts` pattern). Shared token
 * mirrors + the AA-over-stops loop live in `testing/glass-tokens.ts`.
 *
 * This table mirrors every text-bearing token in `venue-map.scss`. Deviations from the design
 * file, on purpose (plan R-2, same class as T1/T2): the header + back pill sit on the AA-proven
 * dark header glass, not the bare gradient; the seat tiles keep SOLID colours (below) so their
 * ink pairs are AA regardless of backdrop; the date field is near-opaque (it sits on dark glass,
 * unlike Discover's field on light card glass).
 *
 * Deliberately excluded (WCAG 1.4.3 incidental / 1.4.11 redundant decoration): the availability
 * bar track+fill (`N of M free` carries the fact), the ★ / · glyphs and the sun disc
 * (aria-hidden; the numeric rating carries the value), the failure badge (aria-hidden; the
 * heading carries the meaning), and the decorative tile/card borders.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (availability count, scroll hint)

// styles.scss card-surface tokens (theme-invariant ones live in the :root block).
const CARD_INK_FAINT_ALPHA = 0.72; // --riv-card-ink-faint

// The map's date field is near-opaque white on the DARK header glass (venue-map.scss) — a
// translucent fill would drop dark ink below AA there.
const FIELD_FILL_ALPHA = 0.9;
const FIELD_BORDER_ALPHA = 0.55; // --riv-field-border (dark tint) over the field fill

// --riv-cta-grad stops (theme-invariant) — the failure-panel "Try again" button's white text.
const CTA_STOPS = ['#0c7288', '#0a5f74'];

// Solid seat-tile colours (kept solid for backdrop-independent AA — see file header).
const TILE_PAIRS: readonly { readonly fg: string; readonly bg: string; readonly usage: string }[] = [
  { fg: '#0f7d8c', bg: '#ffffff', usage: 'available tile' },
  { fg: '#875911', bg: '#fbf1d9', usage: 'premium (front-row) tile' },
  { fg: '#696459', bg: '#ece8e0', usage: 'taken tile' },
];

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly headerGlass: Glass;
  readonly chip: Glass;
  readonly cardGlass: Glass;
  readonly headInk: Rgb; // --riv-ink
  readonly headInkSoftAlpha: number; // --riv-ink-soft
  readonly headInkFaintAlpha: number; // --riv-ink-faint
}

const THEMES: readonly Theme[] = [
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    headerGlass: RIVIERA_HEADER_GLASS,
    chip: RIVIERA_CHIP,
    cardGlass: RIVIERA_CARD_GLASS,
    headInk: WHITE,
    headInkSoftAlpha: 0.86,
    headInkFaintAlpha: 0.8,
  },
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    headerGlass: PORCELAIN_HEADER_GLASS,
    chip: PORCELAIN_CHIP,
    cardGlass: PORCELAIN_CARD_GLASS,
    headInk: INK_DARK,
    headInkSoftAlpha: 0.7,
    headInkFaintAlpha: 0.66,
  },
];

describe.each(THEMES)('Beach-map glass contrast — $name theme (WCAG AA, issue #136)', (theme) => {
  it('header ink (back pill, title, rating, from-price) meets AA on the header panel glass', () => {
    expectAaOverStops(theme.headInk, 1, theme.headerGlass, theme.stops);
  });

  it('header ink-soft (location, meta, description, loading copy) meets AA on the header glass', () => {
    expectAaOverStops(theme.headInk, theme.headInkSoftAlpha, theme.headerGlass, theme.stops);
  });

  it('header ink-faint (separators, date label, cutoff line) meets AA on the header glass', () => {
    expectAaOverStops(theme.headInk, theme.headInkFaintAlpha, theme.headerGlass, theme.stops);
  });

  it('mode-pill text meets AA on the chip tint over the header panel glass', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const chip = composite(theme.chip.color, theme.chip.alpha, panel);
      expect(
        contrastRatio(rgbToHex(theme.headInk), rgbToHex(chip)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('date field text (dark ink) meets AA on the near-opaque field over the header glass', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, panel);
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(field))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('date field border marks the input boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, panel);
      const border = composite(CARD_INK, FIELD_BORDER_ALPHA, field);
      expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('card ink (availability count) meets AA on the map card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (row price, promenade, legend, failure copy) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (tap hint) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (free count, scroll hint) meets AA on the card glass', () => {
    expectAaOverStops(hexToRgb(ACCENT), 1, theme.cardGlass, theme.stops);
  });
});

describe('Beach-map theme-independent contrast (issue #136)', () => {
  it.each(TILE_PAIRS)('$usage text meets AA ($fg on $bg)', ({ fg, bg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('row-label chip text (A–D) meets AA on its solid chip fill', () => {
    // Decorative (the row-codes column is aria-hidden; each tile's name carries the seat) but proven
    // anyway like the tiles — the v3 design's translucent rgba(12,42,51,.08) is replaced by this
    // solid composited equivalent so the css:S7924 analyzer computes it (venue-map.scss row-code).
    expect(contrastRatio('#0a4f5e', '#e7ecee')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('sea-banner white text meets AA on the lightest teal stop', () => {
    expect(contrastRatio('#ffffff', '#0e7a89')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the failure-panel "Try again" button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  // The "photos coming soon" caption pill test is gone with the pill itself (#142): the banner
  // now renders the real cover photo (or the bare gradient as the empty state) and carries no
  // text — the scrim there is decorative depth on an aria-hidden band, with no AA duty.
});
