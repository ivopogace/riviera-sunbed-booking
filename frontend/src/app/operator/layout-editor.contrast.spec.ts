import { AA_LARGE, AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  CONSOLE_ACCENT_INK,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  SOLID_FILL_BRAND,
  WASH_STOPS,
  expectAaOverStops,
  DARK_PREMIUM_INK,
  PREMIUM_INK,
  SEA_GRAD_STOPS,
} from '../../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  cardOver,
  expectAaOnSurfaces,
  insetOver,
  tintOver,
} from '../../testing/console-themes';
import { declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * WCAG-AA contrast guard for the layout editor. The editor wears the operator's console theme
 * (porcelain by default; the themed block at the foot proves both), its control panels use `appCardGlass` (`--riv-card-glass` = white @ 0.55), and its
 * primary buttons reuse the project's AA-safe `--riv-cta-grad` teal (NOT the drawn brighter
 * `#2bb8d4/#0e8aa8`, which fails AA with white). The grid sits on the shared
 * canvas's sea→sand wash, whose rail-chip inks are proven in `venue-map.contrast.spec.ts`. The
 * gap cell's identity is its dashed border alone, so that boundary is proven 3:1 (1.4.11)
 * composited over the wash's worst-case (sand) stop. Every non-gap cell also carries
 * its position number — proven 4.5:1 (normal text) against each tile kind's own worst fill,
 * `beach-cell.ts`'s `CELL_CLASS`. Values mirror the template + `beach-cell.ts` + `tailwind.css`;
 * an edit there must re-pass here.
 */

// --riv-cta-grad stops (the AA-safe darkened teal, shared with every tourist/operator CTA).
const CTA_STOPS = ['#0c7288', '#0a5f74'];
// The "Facing the sea" banner: solid white on the restyle's sea teal (shared BeachGridFrame, #672).
const SEA_BANNER_STOPS = ['#0e7a89', '#0c6675'];
// beach-cell.ts: the gap cell's dashed border is a CARD_INK tint at this alpha.
const GAP_BORDER_ALPHA = 0.55;
// layout-editor.html / set-editor.html: the tile position number's ink — CARD_INK at full opacity.
const TILE_NUMBER_INK = '#0c2a33';
// beach-cell.ts CELL_CLASS: the premium tile's own gradient (not the wash) — its worst stop.
const PREMIUM_FILL_STOPS = ['#ffe3a3', '#f4c05a'];
// beach-cell.ts CELL_CLASS: the standard tile's white @ 0.85 over the wash.
const STANDARD_FILL_ALPHA = 0.85;
/** `tailwind.css` `--riv-walkin-hatch`: the hatch's two band alphas (#879). Asserted over BOTH
 *  rather than over a nominated "worst case" — which band is worst depends on the ink being
 *  measured, and a spec that picks one is one refactor away from measuring the wrong surface.
 *  Before #879 these were per-site (30/12 here, 35/12 at the layout editor, 28/10 on the Daily
 *  view); they are now one declaration, so one constant pair serves every consumer. */
const WALKIN_BAND_ALPHAS = [0.3, 0.1] as const;

const ERROR_HEX = rgbToHex(ERROR_INK);
// tailwind.css `--riv-premium-ink` in porcelain: the premium tile's own numeral and lock-glyph ink.
const PREMIUM_INK_HEX = rgbToHex(PREMIUM_INK);

describe('LayoutEditor porcelain contrast (WCAG AA, #172)', () => {
  it('panel headings + promenade banner (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('input labels + tool counts (--riv-card-ink-faint 0.72) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('helper text (--riv-card-ink-soft 0.78) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the gap cell dashed border marks the aisle at 3:1 over every wash stop (WCAG 1.4.11, #672)', () => {
    for (const stop of WASH_STOPS) {
      const border = composite(CARD_INK, GAP_BORDER_ALPHA, stop);
      expect(
        contrastRatio(rgbToHex(border), rgbToHex(stop)),
        `over wash stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('Generate / Save (white) meet AA on both CTA gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('"Facing the sea" banner (white) meets AA on both teal stops', () => {
    for (const stop of SEA_BANNER_STOPS) {
      expect(contrastRatio('#ffffff', stop), `stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('regenerate-confirm text meets AA on its warning surface, and its confirm button (white) on solid teal', () => {
    expect(contrastRatio('#7a4a08', '#fff4e0')).toBeGreaterThanOrEqual(AA_NORMAL);
    // The ConfirmPanel primary fill, read from the mirror — a literal here drifts off the token.
    expect(contrastRatio('#ffffff', rgbToHex(SOLID_FILL_BRAND))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('save error + saved notice inks meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const hex = rgbToHex(stop);
      expect(contrastRatio(ERROR_HEX, hex), `error over ${hex}`).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(
        contrastRatio(rgbToHex(CONSOLE_ACCENT_INK), hex),
        `notice over ${hex}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the tile position number meets AA (4.5:1) on every cell kind’s own worst fill (#709)', () => {
    for (const stop of PREMIUM_FILL_STOPS) {
      expect(contrastRatio(TILE_NUMBER_INK, stop), `premium fill ${stop}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
    for (const stop of WASH_STOPS) {
      const wash = rgbToHex(stop);
      const standard = rgbToHex(composite([255, 255, 255], STANDARD_FILL_ALPHA, stop));
      expect(
        contrastRatio(TILE_NUMBER_INK, standard),
        `standard over ${wash}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      for (const band of WALKIN_BAND_ALPHAS) {
        const walkin = rgbToHex(composite(CARD_INK, band, stop));
        expect(
          contrastRatio(TILE_NUMBER_INK, walkin),
          `walk-in (band ${band}) over ${wash}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('the lock glyph, drawn in the tile ink, marks a locked cell at 3:1 over every cell kind’s own worst fill (WCAG 1.4.11, #1031)', () => {
    for (const stop of PREMIUM_FILL_STOPS) {
      expect(contrastRatio(PREMIUM_INK_HEX, stop), `premium fill ${stop}`).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    }
    for (const stop of WASH_STOPS) {
      const standard = rgbToHex(composite([255, 255, 255], STANDARD_FILL_ALPHA, stop));
      expect(contrastRatio(TILE_NUMBER_INK, standard)).toBeGreaterThanOrEqual(AA_LARGE);
      for (const band of WALKIN_BAND_ALPHAS) {
        const walkin = rgbToHex(composite(CARD_INK, band, stop));
        expect(contrastRatio(TILE_NUMBER_INK, walkin)).toBeGreaterThanOrEqual(AA_LARGE);
      }
    }
  });

  it('the lock legend and the refusal notice (card ink, soft and full) meet AA on the card glass (#1031)', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('sanity: the design cyan (#0e8aa8) that we replaced would have FAILED AA with white', () => {
    // Documents WHY the buttons use --riv-cta-grad, not the design gradient — guards against a re-swap.
    expect(contrastRatio('#ffffff', '#0e8aa8')).toBeLessThan(AA_NORMAL);
    // and the composite helper is exercised so an accidental import break is caught
    expect(rgbToHex(composite(INK_DARK, 1, [255, 255, 255]))).toBe(rgbToHex(INK_DARK));
  });
});

/**
 * Both console themes off one table (`testing/console-themes.ts`): the tool rail idle and armed,
 * the three tile numerals on the night sand (the premium one on its own themed ink over the gold),
 * the gap boundary and the selection ring at 3:1, the fields on the inset. The porcelain rows
 * above stay as the parity proof.
 */
describe.each(CONSOLE_THEMES)(
  'LayoutEditor contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('panel headings, helper text and labels meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_FAINT_ALPHA, (stop) => cardOver(theme, stop));
    });

    it('a tool chip’s label meets AA idle (card ink on the inset/45) and armed (card ink on --riv-select-tint/20)', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.45, stop));
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) =>
        tintOver(theme, theme.selectTint, 0.2, stop),
      );
    });

    it('the rows / positions fields and the row-name field (card ink on the inset/60) meet AA', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, 0.6, stop));
    });

    it('the tile numeral meets AA on every cell kind’s own worst fill', () => {
      for (const stop of theme.premiumStops) {
        expect(
          contrastRatio(rgbToHex(theme.premiumInk), rgbToHex(stop)),
          `${theme.name}: premium fill ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
      for (const stop of theme.washStops) {
        const wash = rgbToHex(stop);
        const standard = composite(theme.inset, STANDARD_FILL_ALPHA, stop);
        expect(
          contrastRatio(rgbToHex(theme.ink), rgbToHex(standard)),
          `${theme.name}: standard over ${wash}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
        for (const band of WALKIN_BAND_ALPHAS) {
          const walkin = composite(theme.tint, band, stop);
          expect(
            contrastRatio(rgbToHex(theme.ink), rgbToHex(walkin)),
            `${theme.name}: walk-in (band ${band}) over ${wash}`,
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        }
      }
    });

    it('the lock glyph (the tile ink) marks a locked cell at 3:1 over every cell kind’s own worst fill (#1031)', () => {
      for (const stop of theme.premiumStops) {
        expect(
          contrastRatio(rgbToHex(theme.premiumInk), rgbToHex(stop)),
          `${theme.name}: premium fill ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
      for (const stop of theme.washStops) {
        const standard = composite(theme.inset, STANDARD_FILL_ALPHA, stop);
        expect(contrastRatio(rgbToHex(theme.ink), rgbToHex(standard))).toBeGreaterThanOrEqual(
          AA_LARGE,
        );
        for (const band of WALKIN_BAND_ALPHAS) {
          const walkin = composite(theme.tint, band, stop);
          expect(contrastRatio(rgbToHex(theme.ink), rgbToHex(walkin))).toBeGreaterThanOrEqual(
            AA_LARGE,
          );
        }
      }
    });

    it('the gap cell’s dashed boundary (--riv-console-tint/55) marks the aisle at 3:1 over every wash stop', () => {
      for (const stop of theme.washStops) {
        const edge = composite(theme.tint, GAP_BORDER_ALPHA, stop);
        expect(
          contrastRatio(rgbToHex(edge), rgbToHex(stop)),
          `${theme.name}: aisle over ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    });

    it('the Select swatch ring (--riv-accent-ink) marks the tool at 3:1 over the chip’s inset', () => {
      expectAaOnSurfaces(
        theme,
        theme.accentRing,
        1,
        (stop) => insetOver(theme, 0.45, stop),
        AA_LARGE,
      );
    });

    it('the premium numeral and the gold it sits on are one themed pair: two declarations each', () => {
      expect(declarationsOf('--riv-premium-ink')).toEqual([
        rgbToHex(PREMIUM_INK),
        rgbToHex(DARK_PREMIUM_INK),
      ]);
      expect(declarationsOf('--riv-premium-grad')).toHaveLength(2);
    });

    it('the "Facing the sea" banner (white on --riv-sea-grad) meets AA on both stops in every theme', () => {
      for (const stop of SEA_GRAD_STOPS) {
        expect(contrastRatio('#ffffff', rgbToHex(stop))).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it('the save error and the saved notice meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.accentInk, 1, (stop) => cardOver(theme, stop));
    });
  },
);
