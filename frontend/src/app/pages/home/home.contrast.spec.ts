import { AA_LARGE, AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from '../../../testing/contrast';
import {
  CARD_INK,
  Glass,
  INK_DARK,
  PORCELAIN_CHIP,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CHIP,
  RIVIERA_HEADER_GLASS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass Discover page (issue #135; gate from #38).
 * Glass surfaces are translucent, so every pair is checked as the EFFECTIVE colour — the
 * glass rgba composited over the worst-case stops of the theme's background gradient, and
 * alpha inks composited over that result (the `app.contrast.spec.ts` pattern from #134).
 * Shared token mirrors + the AA-over-stops loop live in `testing/glass-tokens.ts`.
 *
 * This table mirrors every text-bearing token in `styles.scss` + `home.scss`; a token edit
 * there must re-pass here. Deviations from the design file, on purpose (plan R-1/R-2, same
 * class as T1's header): the hero and list-state panels sit on the AA-proven header glass
 * instead of the bare gradient; the riviera card glass is 0.78 (design 0.55); the muted
 * card inks are 0.78/0.72 (design 0.7/0.55); the teal accent is #085a6e (design #0a6e85);
 * the field border is a dark tint (design white) for the 1.4.11 component boundary; the
 * CTA-button gradient is darkened for white-text AA (#149, see CTA_STOPS below).
 *
 * T2b (#149) additions reuse already-pinned tokens: the failure panel sits on the same
 * `--riv-card-glass` as the cards with `--riv-card-ink` (title) / `--riv-card-ink-soft`
 * (body copy), and the cutoff explainer line uses `--riv-card-ink-soft` on that card glass —
 * both covered by the "card ink" / "card ink-soft" cases above. The genuinely new surface is
 * the "Try again" button's white text on `--riv-cta-grad` (pinned below).
 *
 * Deliberately excluded (WCAG 1.4.3 incidental / 1.4.11 redundant decoration): the
 * availability bar track+fill (`N of M free` text carries the fact), the sun disc, the
 * ★ glyph and · separators (aria-hidden; the numeric rating carries the value), and the
 * decorative card border.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink

// --riv-cta-grad stops (theme-invariant; consumed by the Discover failure-panel "Try again"
// button, #149). Deviation from the design file, on purpose (plan R-1): the design's brighter
// #2bb8d4→#0e8aa8 gives white body-size text only 2.4–4.0:1 (< AA); darkened for AA. Both stops
// are pinned because the text sits over the whole gradient (worst case is the lighter stop).
const CTA_STOPS = ['#0c7288', '#0a5f74'];

// styles.scss card-surface tokens (theme-invariant ones live in the :root block)
const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
const FIELD_FILL_ALPHA = 0.55; // --riv-field-fill (white) over the card glass
const MODE_CHIP_GLASS: Glass = { color: WHITE, alpha: 0.7 }; // --riv-mode-chip-glass
const CARD_INK_SOFT_ALPHA = 0.78; // --riv-card-ink-soft
const CARD_INK_FAINT_ALPHA = 0.72; // --riv-card-ink-faint
const FIELD_BORDER_ALPHA = 0.55; // --riv-field-border (dark tint)

// --riv-photo-grad stops (same in both themes; from the design's CTA hexes).
const PHOTO_STOPS = ['2bb8d4', '0e8aa8'].map(hexToRgb);

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly headerGlass: Glass;
  readonly chip: Glass;
  readonly cardGlass: Glass;
  readonly heroInk: Rgb;
  readonly heroInkSoftAlpha: number; // --riv-ink-soft
}

const THEMES: readonly Theme[] = [
  {
    name: 'riviera',
    stops: RIVIERA_STOPS,
    headerGlass: RIVIERA_HEADER_GLASS,
    chip: RIVIERA_CHIP,
    cardGlass: RIVIERA_CARD_GLASS,
    heroInk: WHITE,
    heroInkSoftAlpha: 0.86,
  },
  {
    name: 'porcelain',
    stops: PORCELAIN_STOPS,
    headerGlass: PORCELAIN_HEADER_GLASS,
    chip: PORCELAIN_CHIP,
    cardGlass: PORCELAIN_CARD_GLASS,
    heroInk: INK_DARK,
    heroInkSoftAlpha: 0.7,
  },
];

describe.each(THEMES)('Discover glass contrast — $name theme (WCAG AA, issue #135)', (theme) => {
  it('hero headline + state text (ink) meets AA on the hero/state panel glass', () => {
    expectAaOverStops(theme.heroInk, 1, theme.headerGlass, theme.stops);
  });

  it('hero intro / state copy (ink-soft) meets AA on the hero/state panel glass', () => {
    expectAaOverStops(theme.heroInk, theme.heroInkSoftAlpha, theme.headerGlass, theme.stops);
  });

  it('hero chip text meets AA on the chip tint over the hero panel glass', () => {
    // The thinnest pair on the page (riviera worst case ~4.53:1 over #ffe2b0) — pinned
    // here as well as in app.contrast.spec.ts because the hero relies on it directly.
    for (const stop of theme.stops) {
      const panel = surfaceOver(theme.headerGlass, stop);
      const chip = composite(theme.chip.color, theme.chip.alpha, panel);
      expect(
        contrastRatio(rgbToHex(theme.heroInk), rgbToHex(chip)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('card ink (names, ratings, free count) meets AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, theme.cardGlass, theme.stops);
  });

  it('card ink-soft (reviews, price copy, footer) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('card ink-faint (field labels, count subline) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, theme.cardGlass, theme.stops);
  });

  it('accent ink (result count, from-price) meets AA on the card glass', () => {
    expectAaOverStops(hexToRgb(ACCENT), 1, theme.cardGlass, theme.stops);
  });

  it('select/date text meets AA on the field fill over the card glass', () => {
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, card);
      expect(contrastRatio(rgbToHex(INK_DARK), rgbToHex(field))).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('field border marks the input boundary at 3:1 against its fill (WCAG 1.4.11)', () => {
    for (const stop of theme.stops) {
      const card = surfaceOver(theme.cardGlass, stop);
      const field = composite(WHITE, FIELD_FILL_ALPHA, card);
      const border = composite(CARD_INK, FIELD_BORDER_ALPHA, field);
      expect(contrastRatio(rgbToHex(border), rgbToHex(field))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe('Discover photo-area contrast (theme-independent, issue #135)', () => {
  it('mode chip text (accent) meets AA on the chip glass over the photo gradient', () => {
    for (const stop of PHOTO_STOPS) {
      const chip = composite(MODE_CHIP_GLASS.color, MODE_CHIP_GLASS.alpha, stop);
      expect(
        contrastRatio(ACCENT, rgbToHex(chip)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the failure-panel "Try again" button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('location overlay (white) meets AA over the weakest scrim under the text band', () => {
    // Geometry (kept true by home.scss + styles.scss): the photo is 150px; the scrim
    // reaches alpha 0.5 at its 75% stop (y = 112.5px); the overlay text (bottom: 13px,
    // explicit 15px line box) occupies y ≈ 122–137px — entirely below the 0.5 stop, so
    // 0.5 is a floor with margin (actual band minimum ≈ 0.54). Review finding at #135:
    // an earlier scrim curve only reached ~0.35 under the text, where the lightest
    // photo stop composites below AA.
    const SCRIM = hexToRgb('0d2828');
    for (const stop of PHOTO_STOPS) {
      const backdrop = composite(SCRIM, 0.5, stop);
      expect(
        contrastRatio(rgbToHex(WHITE), rgbToHex(backdrop)),
        `over stop ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
