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
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_FIELD_BORDER,
  DARK_HEADER_GLASS,
  DARK_PANEL_TRACK,
  DARK_STOPS,
  DARK_WASH_STOPS,
  FIELD_BORDER_ALPHA,
  Glass,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_PANEL_TRACK,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
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

/** `--riv-field-solid`, NOT `--riv-field-fill` — on the header glass a 0.55 fill fails AA. */
const DATE_FIELD_FILL_ALPHA = 0.9;
const DARK_DATE_FIELD: Glass = { color: hexToRgb('0f172a'), alpha: 0.92 };

// --riv-cta-grad stops (theme-invariant) — the failure-panel "Try again" button's white text.
const CTA_STOPS = ['#0c7288', '#0a5f74'];

// Translucent tile/chip surfaces: ink on `fill`@`alpha`, composited over each wash stop.
interface TileSurface {
  readonly fg: string;
  readonly fill: Rgb;
  readonly alpha: number;
  readonly usage: string;
}
const TILE_SURFACES: readonly TileSurface[] = [
  { fg: '#0f7d8c', fill: WHITE, alpha: 0.75, usage: 'available tile' },
  { fg: '#875911', fill: hexToRgb('fbf1d9'), alpha: 0.85, usage: 'premium (front-row) tile' },
  { fg: '#566560', fill: WHITE, alpha: 0.2, usage: 'ghost taken tile' },
  // css:S7924 stayed quiet on the translucent chips (PR #673); if it re-fires, solidify per failure-panel.
  { fg: '#0a4f5e', fill: WHITE, alpha: 0.6, usage: 'row-code chip' },
  { fg: '#0a4f5e', fill: WHITE, alpha: 0.8, usage: 'zone price chip' },
];
/** The night map's tile/chip surfaces — the dark `--riv-tile-*` / `--riv-map-*` values. */
const DARK_TILE_SURFACES: readonly TileSurface[] = [
  { fg: '#8fd6e2', fill: WHITE, alpha: 0.1, usage: 'available tile' },
  { fg: '#ecd09a', fill: hexToRgb('e6c483'), alpha: 0.18, usage: 'premium (front-row) tile' },
  { fg: '#a7b5b0', fill: WHITE, alpha: 0.05, usage: 'ghost taken tile' },
  { fg: '#9adde8', fill: WHITE, alpha: 0.1, usage: 'row-code chip' },
  { fg: '#9adde8', fill: WHITE, alpha: 0.12, usage: 'zone price chip' },
];

/** The two map ink families: daylight (porcelain, riviera, every porcelain-pinned operator
 *  surface) and night (the dark theme). Wash stops + tile values + the walk-in/ghost pieces. */
interface MapFamily {
  readonly name: string;
  readonly washStops: readonly Rgb[];
  readonly tiles: readonly TileSurface[];
  readonly legendInk: Rgb; // base of --riv-card-ink-soft on the sea band
  readonly walkinInk: string;
  readonly walkinFill: Glass;
  readonly walkinHatch: Glass;
  readonly ghostFill: Glass;
  readonly ghostBorder: string;
}
const MAP_FAMILIES: readonly MapFamily[] = [
  {
    name: 'daylight',
    washStops: WASH_STOPS,
    tiles: TILE_SURFACES,
    legendInk: CARD_INK,
    walkinInk: '#5f4d2a',
    walkinFill: { color: hexToRgb('efe0bd'), alpha: 0.6 },
    walkinHatch: WALK_IN_HATCH,
    ghostFill: { color: WHITE, alpha: 0.2 },
    ghostBorder: '#6b7d77',
  },
  {
    name: 'night',
    washStops: DARK_WASH_STOPS,
    tiles: DARK_TILE_SURFACES,
    legendInk: DARK_CARD_INK,
    walkinInk: '#e5d3a8',
    walkinFill: { color: hexToRgb('efe0bd'), alpha: 0.12 },
    // 0.14 (day: 0.16): 0.16 drops the numeral to 4.33:1 on the stripe band.
    walkinHatch: { color: hexToRgb('e5d3a8'), alpha: 0.14 },
    ghostFill: { color: WHITE, alpha: 0.05 },
    ghostBorder: '#7d8f89',
  },
];

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly headerGlass: Glass;
  readonly cardGlass: Glass;
  readonly headInk: Rgb; // --riv-ink
  readonly headInkSoftAlpha: number; // --riv-ink-soft
  readonly headInkFaintAlpha: number; // --riv-ink-faint
  readonly cardInk: Rgb; // --riv-card-ink
  readonly cardInkBase: Rgb; // base of the muted rgba ink family
  readonly accent: Rgb; // --riv-accent-ink
  readonly dateField: Glass; // --riv-field-solid over the header glass
  readonly fieldBorder: Glass; // --riv-field-border over the date field
}

const THEMES: readonly Theme[] = [
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    headerGlass: RIVIERA_HEADER_GLASS,
    cardGlass: RIVIERA_CARD_GLASS,
    headInk: WHITE,
    headInkSoftAlpha: 0.86,
    headInkFaintAlpha: 0.8,
    cardInk: INK_DARK,
    cardInkBase: CARD_INK,
    accent: hexToRgb(ACCENT.slice(1)),
    dateField: { color: WHITE, alpha: DATE_FIELD_FILL_ALPHA },
    fieldBorder: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
  },
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    headerGlass: PORCELAIN_HEADER_GLASS,
    cardGlass: PORCELAIN_CARD_GLASS,
    headInk: INK_DARK,
    headInkSoftAlpha: 0.7,
    headInkFaintAlpha: 0.66,
    cardInk: INK_DARK,
    cardInkBase: CARD_INK,
    accent: hexToRgb(ACCENT.slice(1)),
    dateField: { color: WHITE, alpha: DATE_FIELD_FILL_ALPHA },
    fieldBorder: { color: CARD_INK, alpha: FIELD_BORDER_ALPHA },
  },
  {
    name: 'dark',
    stops: DARK_STOPS,
    headerGlass: DARK_HEADER_GLASS,
    cardGlass: DARK_CARD_GLASS,
    headInk: WHITE,
    headInkSoftAlpha: 0.86,
    headInkFaintAlpha: 0.8,
    cardInk: DARK_CARD_INK,
    cardInkBase: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    dateField: DARK_DATE_FIELD,
    fieldBorder: DARK_FIELD_BORDER,
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

  // The mode-pill / "New"-pill proof that stood here MOVED to shared/semantic-chip.contrast.spec.ts (#705). It composited --riv-chip-bg over this panel's glass over every background stop, once per theme; the pills now wear an opaque solid fill, so a single ink/fill pair proves them on every surface and in both themes at once. Moved rather than dropped — and the successor is the stronger claim, because it cannot be invalidated by a change to the panel beneath.

  it('date field text (dark ink) meets AA on the near-opaque field over the header glass', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const field = composite(theme.dateField.color, theme.dateField.alpha, panel);
      expect(contrastRatio(rgbToHex(theme.cardInk), rgbToHex(field))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('date field border marks the input boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const field = composite(theme.dateField.color, theme.dateField.alpha, panel);
      const border = composite(theme.fieldBorder.color, theme.fieldBorder.alpha, field);
      expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('card ink (availability count, empty-map heading) meets AA on the map card glass', () => {
    expectAaOverStops(theme.cardInk, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (promenade, failure + empty-map copy) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (tap hint) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (free count, scroll hint) meets AA on the card glass', () => {
    expectAaOverStops(theme.accent, 1, theme.cardGlass, theme.stops);
  });
});

describe.each(MAP_FAMILIES)('Beach-map contrast — $name family (issue #136)', (family) => {
  // The chips are aria-hidden decoration (tile names carry seat+price) but proven like the tiles.
  it.each(family.tiles)('$usage ink meets AA composited over every wash stop ($fg)', (surface) => {
    for (const stop of family.washStops) {
      const bg = composite(surface.fill, surface.alpha, stop);
      expect(
        contrastRatio(surface.fg, rgbToHex(bg)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("legend ink meets AA on the band, which is the wash's own first stop (#701)", () => {
    const band = family.washStops[0];
    const ink = composite(family.legendInk, CARD_INK_SOFT_ALPHA, band);
    expect(contrastRatio(rgbToHex(ink), rgbToHex(band))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the walk-in numeral meets AA on both hatch bands over every wash stop (#701)', () => {
    for (const stop of family.washStops) {
      const gap = composite(family.walkinFill.color, family.walkinFill.alpha, stop);
      const stripe = composite(family.walkinHatch.color, family.walkinHatch.alpha, gap);
      for (const band of [gap, stripe]) {
        expect(
          contrastRatio(family.walkinInk, rgbToHex(band)),
          `over stop ${rgbToHex(stop)}, band ${rgbToHex(band)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('the ghost-taken dashed border marks "taken" at 3:1 against its tile fill (WCAG 1.4.11)', () => {
    for (const stop of family.washStops) {
      const tile = composite(family.ghostFill.color, family.ghostFill.alpha, stop);
      expect(
        contrastRatio(family.ghostBorder, rgbToHex(tile)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe('Beach-map theme-independent contrast (issue #136)', () => {
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

  it('the loading skeleton reads as blocks on every theme, never a blank panel (#744)', () => {
    // The threshold's derivation is on SKELETON_VISIBLE above.
    const cases = [
      { glass: RIVIERA_HEADER_GLASS, track: RIVIERA_PANEL_TRACK, stops: RIVIERA_STOPS },
      { glass: PORCELAIN_HEADER_GLASS, track: PORCELAIN_PANEL_TRACK, stops: PORCELAIN_STOPS },
      { glass: DARK_HEADER_GLASS, track: DARK_PANEL_TRACK, stops: DARK_STOPS },
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
