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
  PORCELAIN_PANEL_TRACK,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_CHIP,
  RIVIERA_HEADER_GLASS,
  RIVIERA_PANEL_TRACK,
  RIVIERA_STOPS,
  WASH_STOPS,
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
 * `--riv-card-ink-soft` pair already below, and the empty-map heading + copy reuse that same
 * pair on the same card glass). Deviations from the design file, on purpose:
 * the header + back pill sit on the AA-proven dark header glass, not the bare
 * gradient; the seat tiles are TRANSLUCENT over the sea→sand wash (#672), whose gradient stops
 * are opaque and theme-independent — so each tile/chip ink is proven composited (fill alpha over
 * every wash stop) rather than as a solid pair; the date field is near-opaque (it sits on dark
 * glass, unlike Discover's field on light card glass); and the legend band is painted the wash's
 * own FIRST stop, so its swatches composite over exactly the ground their tiles do — which makes
 * its ink a theme-independent solid pair rather than a per-theme glass composite.
 *
 * The walk-in tile is absent from `TILE_SURFACES` on purpose: its own test below proves the same
 * ink over the same fill on BOTH hatch bands, so a row here would assert the gap band's arithmetic
 * a second time and give a future retune two places to miss.
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
 *
 * The walk-in tile's 135° hatch (#701) joins that exclusion, and the reasoning is written down
 * here because the ghost tile above shows the bar is not automatic. The hatch is
 * `rgba(95,77,42,0.16)`, ≈1.26:1 against its own tile fill — nowhere near 3:1, and it cannot be:
 * a 3:1 stripe on this sand needs ≈0.55 alpha, which drops the tile's own numeral to ≈2.1:1, so
 * 1.4.11 and 1.4.3 are arithmetically incompatible on one tile. It is excluded because it is
 * **redundant**, not because it is faint: the walk-in state is carried by the tile's accessible
 * name ("walk-in only — book at the venue") and by the tile rendering no button at all, exactly
 * like the `#e6c483` / `#c8ab62` tier borders beside it. What the hatch may not do is cost the
 * numeral its AA — so the numeral is proven below on BOTH bands, stripe and gap.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (availability count, scroll hint)

/** The walk-in tile's hatch stripe (`map-tile.ts`): the tile's own ink, laid over its fill. */
const WALK_IN_HATCH: Glass = { color: hexToRgb('5f4d2a'), alpha: 0.16 };

/** NOT `--riv-field-fill`: a literal (`venue-map.html`) — on the DARK header glass a 0.55 fill fails AA. */
const DATE_FIELD_FILL_ALPHA = 0.9;

// --riv-cta-grad stops (theme-invariant) — the failure-panel "Try again" button's white text.
const CTA_STOPS = ['#0c7288', '#0a5f74'];

// Translucent tile/chip surfaces: ink on `fill`@`alpha`, composited over each wash stop.
const TILE_SURFACES: readonly {
  readonly fg: string;
  readonly fill: Rgb;
  readonly alpha: number;
  readonly usage: string;
}[] = [
  { fg: '#0f7d8c', fill: WHITE, alpha: 0.75, usage: 'available tile' },
  { fg: '#875911', fill: hexToRgb('fbf1d9'), alpha: 0.85, usage: 'premium (front-row) tile' },
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

  it('card ink (availability count, empty-map heading) meets AA on the map card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (promenade, failure + empty-map copy) meets AA on the card glass', () => {
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

  it("legend ink meets AA on the band, which is the wash's own first stop (#701)", () => {
    const band = WASH_STOPS[0];
    const ink = composite(CARD_INK, CARD_INK_SOFT_ALPHA, band);
    expect(contrastRatio(rgbToHex(ink), rgbToHex(band))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the walk-in numeral meets AA on both hatch bands over every wash stop (#701)', () => {
    for (const stop of WASH_STOPS) {
      const gap = composite(hexToRgb('efe0bd'), 0.6, stop);
      const stripe = composite(WALK_IN_HATCH.color, WALK_IN_HATCH.alpha, gap);
      for (const band of [gap, stripe]) {
        expect(
          contrastRatio('#5f4d2a', rgbToHex(band)),
          `over stop ${rgbToHex(stop)}, band ${rgbToHex(band)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
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

  it('the CTA button ("Try again", "Back to Discover") meets AA over both CTA stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  /**
   * A skeleton block is aria-hidden decoration, so WCAG sets it no bar. This one is derived
   * instead: `--riv-card-track` on the light card glass measures 1.26:1, and that is the
   * placeholder contrast the whole app already ships (Discover, My bookings, the set editor). So
   * the floor sits just under the app's own norm — low enough to assert nothing new, high enough
   * to have caught the defect that prompted it: the same card tint on the DARK panel glass, where
   * it measured 1.02:1 and the loading state was an empty panel.
   */
  const SKELETON_VISIBLE = 1.2;

  it('the loading skeleton reads as blocks on both themes, never a blank panel (#744)', () => {
    // The threshold's derivation is on SKELETON_VISIBLE above.
    const cases = [
      { glass: RIVIERA_HEADER_GLASS, track: RIVIERA_PANEL_TRACK, stops: RIVIERA_STOPS },
      { glass: PORCELAIN_HEADER_GLASS, track: PORCELAIN_PANEL_TRACK, stops: PORCELAIN_STOPS },
    ];
    for (const { glass, track, stops } of cases) {
      for (const stop of stops) {
        const panel = surfaceOver(glass, stop);
        const block = composite(track.color, track.alpha, panel);
        expect(
          contrastRatio(rgbToHex(block), rgbToHex(panel)),
          `over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(SKELETON_VISIBLE);
      }
    }
  });

  // The "photos coming soon" caption pill test is gone with the pill itself: the banner now renders the real cover photo (or the bare gradient as the empty state) and carries no text — the scrim there is decorative depth on an aria-hidden band, with no AA duty.
});
