import {
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  desaturate,
  hexToRgb,
  rgbToHex,
} from '../../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_CHIP,
  DARK_HEADER_GLASS,
  DARK_STOPS,
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
  WORST_PHOTOS,
  PANEL_ACCENT_INK,
  RIVIERA_PANEL_ACCENT_INK,
  DARK_PANEL_ACCENT_INK,
  PORCELAIN_PANEL_WASH_HOVER,
  RIVIERA_PANEL_WASH_HOVER,
  DARK_PANEL_WASH_HOVER,
  expectAaOverStops,
  surfaceOver,
} from '../../../testing/glass-tokens';
import { baseBlock, declarationsOf, themeBlock } from '../../../testing/stylesheet-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass Discover page.
 * Glass surfaces are translucent, so every pair is checked as the EFFECTIVE colour — the
 * glass rgba composited over the worst-case stops of the theme's background gradient, and
 * alpha inks composited over that result (the `app.contrast.spec.ts` pattern).
 * Shared token mirrors + the AA-over-stops loop live in `testing/glass-tokens.ts`.
 *
 * This table mirrors every text-bearing colour in `tailwind.css` + `home.html`'s utilities; an
 * edit there must re-pass here. Deviations from the drawn values, on purpose (the same
 * class as the shell header's): the list-state panels sit on
 * the AA-proven header glass instead of the bare gradient; the riviera card glass is 0.78
 * (drawn 0.55); the muted
 * card inks are 0.78/0.72 (drawn 0.7/0.55); the teal accent is #085a6e (drawn #0a6e85);
 * CTA-button gradient is darkened for white-text AA (see CTA_STOPS below).
 *
 * The failure-panel additions reuse already-pinned tokens: the failure panel sits on the same
 * `--riv-card-glass` as the cards with `--riv-card-ink` (title) / `--riv-card-ink-soft`
 * (body copy) — covered by the "card ink" / "card ink-soft" cases above. The genuinely new
 * surface is the "Try again" button's white text on `--riv-cta-grad` (pinned below).
 *
 * Deliberately excluded (WCAG 1.4.3 incidental / 1.4.11 redundant decoration): the
 * availability bar track+fill (`N of M free` text carries the fact), the sun disc, the
 * star mark and · separators (aria-hidden; the numeric rating carries the value), and the
 * decorative card border.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (light themes; dark uses DARK_ACCENT_INK)

/**
 * --riv-cta-grad stops (theme-invariant; consumed by the Discover failure-panel "Try again"
 * button). Deviation from the drawn values, on purpose: the drawn brighter
 * #2bb8d4→#0e8aa8 gives white body-size text only 2.4–4.0:1 (< AA); darkened for AA. Both stops
 * are pinned because the text sits over the whole gradient (worst case is the lighter stop).
 */
const CTA_STOPS = ['#0c7288', '#0a5f74'];

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly headerGlass: Glass;
  readonly chip: Glass;
  readonly cardGlass: Glass;
  readonly cardInk: Rgb; // --riv-card-ink (solid)
  readonly cardInkBase: Rgb; // base of the muted rgba ink family
  readonly accent: Rgb; // --riv-accent-ink
  readonly panelAccent: Rgb; // --riv-panel-accent-ink
  readonly panelWashHover: Glass; // --riv-panel-wash-hover, composited over the header glass
  readonly pageInk: Rgb;
  readonly pageInkSoftAlpha: number; // --riv-ink-soft
}

const THEMES: readonly Theme[] = [
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    headerGlass: RIVIERA_HEADER_GLASS,
    chip: RIVIERA_CHIP,
    cardGlass: RIVIERA_CARD_GLASS,
    cardInk: INK_DARK,
    cardInkBase: CARD_INK,
    accent: hexToRgb(ACCENT.slice(1)),
    panelAccent: RIVIERA_PANEL_ACCENT_INK,
    panelWashHover: RIVIERA_PANEL_WASH_HOVER,
    pageInk: WHITE,
    pageInkSoftAlpha: 0.86,
  },
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    headerGlass: PORCELAIN_HEADER_GLASS,
    chip: PORCELAIN_CHIP,
    cardGlass: PORCELAIN_CARD_GLASS,
    cardInk: INK_DARK,
    cardInkBase: CARD_INK,
    accent: hexToRgb(ACCENT.slice(1)),
    panelAccent: PANEL_ACCENT_INK,
    panelWashHover: PORCELAIN_PANEL_WASH_HOVER,
    pageInk: INK_DARK,
    pageInkSoftAlpha: 0.7,
  },
  {
    name: 'dark',
    stops: DARK_STOPS,
    headerGlass: DARK_HEADER_GLASS,
    chip: DARK_CHIP,
    cardGlass: DARK_CARD_GLASS,
    cardInk: DARK_CARD_INK,
    cardInkBase: DARK_CARD_INK,
    accent: DARK_ACCENT_INK,
    panelAccent: DARK_PANEL_ACCENT_INK,
    panelWashHover: DARK_PANEL_WASH_HOVER,
    pageInk: WHITE,
    pageInkSoftAlpha: 0.86,
    // Bare gradient: every slate stop is dark enough for white ink AA — the scrim stays riviera-only.
  },
];

describe.each(THEMES)('Discover glass contrast — $name theme (WCAG AA, issue #135)', (theme) => {
  it('loading/empty state panel text (ink + ink-soft) meets AA on the header glass', () => {
    expectAaOverStops(theme.pageInk, 1, theme.headerGlass, theme.stops);
    expectAaOverStops(theme.pageInk, theme.pageInkSoftAlpha, theme.headerGlass, theme.stops);
  });

  // The panel's own accent; the card accent is a different token (rationale: `tailwind.css`).
  it('panel accent ink (group-head distance, row price) meets AA on the header glass', () => {
    expectAaOverStops(theme.panelAccent, 1, theme.headerGlass, theme.stops);
  });

  // Were the card accent ever to clear AA here, the panel token would be dead weight — so this fails.
  it('the card accent ink is the one that could not clear AA here, in riviera', () => {
    const worst = Math.min(
      ...theme.stops.map((stop) =>
        contrastRatio(rgbToHex(theme.accent), rgbToHex(surfaceOver(theme.headerGlass, stop))),
      ),
    );
    expect(worst < AA_NORMAL).toBe(theme.name === 'riviera');
  });

  // A hovered desk row: the wash over the panel glass, over each stop (rationale: `tailwind.css`).
  it('the row hover wash keeps both inks at AA on the panel glass', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const hovered = composite(theme.panelWashHover.color, theme.panelWashHover.alpha, panel);
      for (const [label, ink] of [
        ['page ink', theme.pageInk],
        ['panel accent ink', theme.panelAccent],
      ] as const) {
        expect(
          contrastRatio(rgbToHex(ink), rgbToHex(hovered)),
          `${label} over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('card ink (names, ratings, free count) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInk, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (reviews, price copy, footer) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (field labels, count subline) meets AA on the card glass', () => {
    expectAaOverStops(theme.cardInkBase, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (the head counts, the row price) meets AA on the card glass', () => {
    expectAaOverStops(theme.accent, 1, theme.cardGlass, theme.stops);
  });
});

describe('Discover photo-area contrast (theme-independent, issue #135; real photos since #142)', () => {
  // `WORST_PHOTOS` (testing/glass-tokens.ts): the placeholder gradient's stops plus pure white and pure black — shared with the slideshow-chrome spec. This file's only consumer is the location overlay, so the case that earns the set here is pure white (the dark scrim under white text); pure black earns its place in the specs that back light chrome on a photo.

  // The mode-chip-on-glass assertion that stood here is GONE, not moved. Its subject, the mode chip, now wears an opaque fill and is proven by shared/semantic-chip.contrast.spec.ts. Repointing it at the card's step chips was the wrong repair: those glyphs are aria-hidden decoration, which this file's own header excludes, and shared/photo-slideshow.contrast.spec.ts already proves the identical pair at the 3:1 bar WCAG 1.4.11 actually asks of them. Holding decoration to 4.5:1 here only invented a constraint the design never owed.

  it('the failure-panel "Try again" button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('location overlay (white) meets AA over the weakest scrim under the text band, over any photo', () => {
    // Worst case (home.html's aspect-[3/2] band at the grid's 264px min width, 176px tall): the text clears the 0.68 stop with 16px margin, more than the old fixed-150px band's 9.5px.
    const SCRIM = hexToRgb('0d2828');
    for (const stop of WORST_PHOTOS) {
      const backdrop = composite(SCRIM, 0.68, stop);
      expect(
        contrastRatio(rgbToHex(WHITE), rgbToHex(backdrop)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * The list/map switch's pressed pill paints the on-accent ink over the accent ink — opaque, so
 * the pair is theme-keyed rather than composited over stops; the unpressed pill's card ink over
 * the card glass is the "card ink" case above.
 *
 * <p>The pin preview's "View beach map" call to action rides this case: it wears the same pair.
 * The rest of that card sits on the card glass with the card inks, already covered above — it is
 * fed the very record a list card renders.
 */
/**
 * A dusk CARD is `saturate(0)` over the whole of it — the filter is on the card anchor, which owns
 * the glass, so the ink and the surface under it are greyed together; a faded card (opacity) would
 * not keep the pair. The matrix itself lives in `testing/contrast`.
 */
describe.each(THEMES)('Discover dusk row contrast — $name theme', (theme) => {
  it('card ink still meets AA on the card glass once both are desaturated', () => {
    for (const stop of theme.stops) {
      const glass = desaturate(surfaceOver(theme.cardGlass, stop));
      const ink = desaturate(theme.cardInk);
      expect(
        contrastRatio(rgbToHex(ink), rgbToHex(glass)),
        `over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the accent price still meets AA on the desaturated card glass', () => {
    for (const stop of theme.stops) {
      const glass = desaturate(surfaceOver(theme.cardGlass, stop));
      const accent = desaturate(theme.accent);
      expect(
        contrastRatio(rgbToHex(accent), rgbToHex(glass)),
        `over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * A dusk PANEL row differs from the dusk card above in what the filter can reach. `saturate-0` sits
 * on the ROW ANCHOR, which paints no background of its own at rest — the panel glass behind it
 * belongs to an ancestor, outside the filter. So the greyed ink is read against an UNGREYED panel,
 * where the card's ink is read against a card glass greyed with it. The closed chip the row's price
 * slot gives way to carries its own fill inside the filter, and is proven with its recipe in
 * `shared/semantic-chip.contrast.spec.ts`.
 */
describe.each(THEMES)('Discover dusk panel row contrast — $name theme', (theme) => {
  it('the row ink still meets AA on the panel it is greyed against', () => {
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      expect(
        contrastRatio(rgbToHex(desaturate(theme.pageInk)), rgbToHex(panel)),
        `over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the row\u2019s soft ink \u2014 the facts line and the free count \u2014 still meets AA desaturated', () => {
    for (const stop of theme.stops) {
      // Alpha survives the matrix, so the soft ink is greyed and THEN composited over the panel.
      const panel = surfaceOver(theme.headerGlass, stop);
      const soft = composite(desaturate(theme.pageInk), theme.pageInkSoftAlpha, panel);
      expect(
        contrastRatio(rgbToHex(soft), rgbToHex(panel)),
        `over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

/**
 * The stylesheet pin (`testing/stylesheet-tokens`): the ratios above are computed from the mirrors
 * in `testing/glass-tokens.ts`, so a value that drifts in `tailwind.css` — or a fourth declaration
 * added later — would leave every one of them passing. Only the source text can see that.
 *
 * <p>Three blocks each, including the two values that repeat a card token's, is the decision
 * rather than an omission — why, at the declarations in `tailwind.css`.
 */
describe('the panel-surface token pair is declared once per theme', () => {
  it.each([
    ['--riv-panel-accent-ink', '#085a6e', '#a8e8f2', '#7cd7e8'],
    [
      '--riv-panel-wash-hover',
      'rgba(255, 255, 255, 0.75)',
      'rgba(10, 44, 63, 0.45)',
      'rgba(255, 255, 255, 0.16)',
    ],
  ])('%s declares exactly the base, riviera and dark values', (token, base, riviera, dark) => {
    expect(declarationsOf(token)).toEqual([base, riviera, dark]);
    expect(baseBlock()).toContain(`${token}: ${base}`);
    expect(themeBlock('riviera')).toContain(`${token}: ${riviera}`);
    expect(themeBlock('dark')).toContain(`${token}: ${dark}`);
  });

  it.each(['--riv-panel-accent-ink', '--riv-panel-wash-hover'])(
    '%s is mapped in @theme inline, without which its utility is never generated',
    (token) => {
      const utility = token.replace('--riv-', '--color-riv-');
      expect(declarationsOf(utility)).toEqual([`var(${token})`]);
    },
  );
});
