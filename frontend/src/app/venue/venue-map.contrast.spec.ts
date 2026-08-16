import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  FIELD_BORDER_ALPHA,
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
 * WCAG-AA contrast guard for the Liquid Glass beach map. Glass
 * surfaces are translucent, so every pair is checked as the EFFECTIVE colour — the glass rgba
 * composited over the theme background's worst-case gradient stops, and alpha inks composited
 * over that (the `home.contrast.spec.ts` / `app.contrast.spec.ts` pattern). Shared token
 * mirrors + the AA-over-stops loop live in `testing/glass-tokens.ts`.
 *
 * This table mirrors every text-bearing token `venue-map.html` sets itself; the shared directives
 * it composes prove their own (the amenity chips in `shared/amenities.contrast.spec.ts` — solid
 * fills, so backdrop-independent; the failure panel's inks are the `--riv-card-ink` /
 * `--riv-card-ink-soft` pair already below). Deviations from the design file, on purpose:
 * the header + back pill sit on the AA-proven dark header glass, not the bare
 * gradient; the seat tiles are TRANSLUCENT over the sea→sand wash (#672), whose gradient stops
 * are opaque and theme-independent — so each tile/chip ink is proven composited (fill alpha over
 * every wash stop) rather than as a solid pair; the date field is near-opaque (it sits on dark
 * glass, unlike Discover's field on light card glass).
 *
 * The ghost-taken tile is deliberately the faintest surface (free inventory pops, #672) but is
 * NOT excluded: its seat number is proven AA and its dashed border — the non-colour "taken"
 * cue beside the accessible name — is proven at 3:1 (1.4.11), both composited below. The
 * review gate rejected reading it as WCAG 1.4.3 "inactive component": the tile is static
 * content, not a disabled control.
 *
 * Deliberately excluded (WCAG 1.4.3 incidental / 1.4.11 redundant decoration): the availability
 * bar track+fill (`N of M free` carries the fact), the ★ / · glyphs and the sun disc
 * (aria-hidden; the numeric rating carries the value), the failure badge (aria-hidden; the
 * heading carries the meaning), and the decorative live-tile/card borders.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (availability count, scroll hint)

/** NOT `--riv-field-fill`: a literal (`venue-map.html`) — on the DARK header glass a 0.55 fill fails AA. */
const DATE_FIELD_FILL_ALPHA = 0.9;

// --riv-cta-grad stops (theme-invariant) — the failure-panel "Try again" button's white text.
const CTA_STOPS = ['#0c7288', '#0a5f74'];

/** The sea→sand wash's gradient stops — the opaque, theme-independent backdrops behind every
 *  translucent tile and side chip (`venue-map.html` map scroller, #672). */
const WASH_STOPS: readonly Rgb[] = ['cfeef6', 'e7f5f1', 'f6eedb'].map(hexToRgb);

// Translucent tile/chip surfaces: ink on `fill`@`alpha`, composited over each wash stop.
const TILE_SURFACES: readonly {
  readonly fg: string;
  readonly fill: Rgb;
  readonly alpha: number;
  readonly usage: string;
}[] = [
  { fg: '#0f7d8c', fill: WHITE, alpha: 0.75, usage: 'available tile' },
  { fg: '#875911', fill: hexToRgb('fbf1d9'), alpha: 0.85, usage: 'premium (front-row) tile' },
  { fg: '#5f4d2a', fill: hexToRgb('efe0bd'), alpha: 0.85, usage: 'walk-in tile' },
  { fg: '#566560', fill: WHITE, alpha: 0.2, usage: 'ghost taken tile' },
  // css:S7924 stayed quiet on the translucent chips (PR #673); if it re-fires, solidify per failure-panel.
  { fg: '#0a4f5e', fill: WHITE, alpha: 0.6, usage: 'row-code chip' },
  { fg: '#0a4f5e', fill: WHITE, alpha: 0.8, usage: 'zone price chip' },
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
      const field = composite(WHITE, DATE_FIELD_FILL_ALPHA, panel);
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(field))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('date field border marks the input boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const field = composite(WHITE, DATE_FIELD_FILL_ALPHA, panel);
      const border = composite(CARD_INK, FIELD_BORDER_ALPHA, field);
      expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('card ink (availability count) meets AA on the map card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (promenade, legend, failure copy) meets AA on the card glass', () => {
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
  // The chips are aria-hidden decoration (tile names carry seat+price) but proven like the tiles.
  it.each(TILE_SURFACES)('$usage ink meets AA composited over every wash stop ($fg)', (surface) => {
    for (const stop of WASH_STOPS) {
      const bg = composite(surface.fill, surface.alpha, stop);
      expect(
        contrastRatio(surface.fg, rgbToHex(bg)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the ghost-taken dashed border marks "taken" at 3:1 against its tile fill (WCAG 1.4.11)', () => {
    for (const stop of WASH_STOPS) {
      const tile = composite(WHITE, 0.2, stop);
      expect(
        contrastRatio('#6b7d77', rgbToHex(tile)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('sea-banner white text meets AA on the lightest teal stop', () => {
    expect(contrastRatio('#ffffff', '#0e7a89')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the failure-panel "Try again" button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  // The "photos coming soon" caption pill test is gone with the pill itself: the banner now renders the real cover photo (or the bare gradient as the empty state) and carries no text — the scrim there is decorative depth on an aria-hidden band, with no AA duty.
});
