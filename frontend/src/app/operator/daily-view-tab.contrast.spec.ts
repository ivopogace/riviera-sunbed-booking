import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_CHIP,
  PORCELAIN_STOPS,
  WASH_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Daily view tab. The tab is always porcelain (console
 * host); its date + arrivals panels use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text
 * pairs: the headings, date labels, arrivals labels and the availability strong counts use
 * `--riv-card-ink`; the helper/availability text uses `--riv-card-ink-soft` (0.78); the "Date"
 * mini-label uses `--riv-card-ink-faint` (0.72); the write-failure notice + load-error use `#a3160e`.
 * The arrival-code chip ink (`--riv-card-ink`) sits over `--riv-chip-bg` over the card glass.
 * Since #672 slice 2 the grid sits on the shared canvas's sea→sand wash (rail-chip inks proven in
 * `venue-map.contrast.spec.ts`); since #686 every tile's visible text is its *position number*.
 * The FREE tile's number is proven AA composited over the wash's worst-case stops; the locked
 * tile's number is proven over its striped fill's worst case, the darker stripe (the `●` beside it
 * stays `aria-hidden` decorative — state is carried by sr-only text); the filled STAFF_MARKED
 * tile — white text on the `#0a6e85` teal, also its legend swatch — is wash-independent. The
 * zero-set empty state introduces no colour: its heading is `--riv-card-ink` and its copy
 * `--riv-card-ink-soft`, both already proven on this card glass, and its link is white on the
 * `--riv-cta-grad` stops the sibling operator CTAs prove. Values
 * mirror the template + `styles.scss`; a token edit there must re-pass here.
 */

// The FREE tile fill (`bg-white/85`, daily-view-tab.ts tileClass).
const FREE_TILE_FILL = { color: WHITE, alpha: 0.85 };
// The locked tile's worst-case fill: the striped gradient's darker rgba(12,42,51,0.28) band.
const LOCKED_STRIPE_FILL = { color: CARD_INK, alpha: 0.28 };
// --riv-cta-grad stops (the AA-safe darkened teal shared with every CTA); the empty-state link sits on these.
const CTA_STOPS = ['#0c7288', '#0a5f74'];

describe('DailyViewTab porcelain contrast (WCAG AA, #175)', () => {
  it('headings + labels + arrivals + availability counts (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('helper + availability text (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the "Date" mini-label (--riv-card-ink-faint 0.72) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the arrival-code chip ink (--riv-card-ink) meets AA over the chip tint on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const chipSurface = composite(
        PORCELAIN_CHIP.color,
        PORCELAIN_CHIP.alpha,
        surfaceOver(PORCELAIN_CARD_GLASS, stop),
      );
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(chipSurface)),
        `chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the marked-tile glyph + legend swatch (white on #0a6e85) meet AA', () => {
    expect(contrastRatio('#ffffff', '#0a6e85')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the FREE tile position number (--riv-card-ink on white/85) meets AA over every wash stop (#686)', () => {
    expectAaOverStops(INK_DARK, 1, FREE_TILE_FILL, WASH_STOPS);
  });

  it('the locked-tile position number (--riv-card-ink) meets AA over the dark stripe on every wash stop (#686)', () => {
    expectAaOverStops(INK_DARK, 1, LOCKED_STRIPE_FILL, WASH_STOPS);
  });

  it('the empty-map link (white) meets AA on both CTA gradient stops (#718)', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the write-failure notice + load-error ink (#a3160e) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio('#a3160e', rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
