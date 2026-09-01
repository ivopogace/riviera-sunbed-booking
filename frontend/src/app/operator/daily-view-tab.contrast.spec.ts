import { AA_LARGE, AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_CHIP,
  PORCELAIN_STOPS,
  WASH_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
  SOLID_FILL_BRAND,
  WARN_EDGE,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Daily view tab. The tab is always porcelain (console
 * host); its date + arrivals panels use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text
 * pairs: the headings, date labels, arrivals labels and the availability strong counts use
 * `--riv-card-ink`; the helper/availability text uses `--riv-card-ink-soft` (0.78); the "Date"
 * mini-label uses `--riv-card-ink-faint` (0.72); the write-failure notice + load-error use `--riv-error-ink`.
 * The arrival-code chip ink (`--riv-card-ink`) sits over `--riv-chip-bg` over the card glass.
 * Since #672 slice 2 the grid sits on the shared canvas's sea→sand wash (rail-chip inks proven in
 * `venue-map.contrast.spec.ts`); since #686 every tile's visible text is its *position number*.
 * The FREE tile's number is proven AA composited over the wash's worst-case stops; the locked
 * tile's number is proven over its striped fill's worst case, the darker stripe (the `●` beside it
 * stays `aria-hidden` decorative — state is carried by sr-only text); the filled STAFF_MARKED
 * tile — white text on `--riv-solid-fill-brand`, also its legend swatch — is wash-independent. The
 * zero-set empty state introduces no colour: its heading is `--riv-card-ink` and its copy
 * `--riv-card-ink-soft`, both already proven on this card glass, and its link is white on the
 * `--riv-cta-grad` stops the sibling operator CTAs prove. Values
 * mirror the template + `tailwind.css`; a token edit there must re-pass here.
 */

// The FREE tile fill (`bg-white/85`, daily-view-tab.ts tileClass).
const FREE_TILE_FILL = { color: WHITE, alpha: 0.85 };
// The locked tile's worst-case fill: --riv-walkin-hatch's darker band, a CARD_INK tint. 0.30 since
// #879 gave the hatch one declaration (this tile painted 0.28 of its own before).
const LOCKED_STRIPE_FILL = { color: CARD_INK, alpha: 0.3 };
// The close-sales trigger button: --riv-warn-edge/50 hairline on its own `bg-white/60` fill.
const TRIGGER_EDGE_ALPHA = 0.5;
const TRIGGER_FILL_ALPHA = 0.6;
// --riv-cta-grad stops (the AA-safe darkened teal shared with every CTA); the empty-state link sits on these.
const CTA_STOPS = ['#0c7288', '#0a5f74'];

const ERROR_HEX = rgbToHex(ERROR_INK);

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

  it('the marked-tile glyph + legend swatch (white on --riv-solid-fill-brand) meet AA', () => {
    expect(contrastRatio('#ffffff', rgbToHex(SOLID_FILL_BRAND))).toBeGreaterThanOrEqual(AA_NORMAL);
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

  it('the write-failure notice + load-error ink (--riv-error-ink) meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ERROR_HEX, rgbToHex(stop)),
        `error over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the close-sales confirm copy (--riv-card-ink) meets AA over the #f0aa2e@0.10 amber tint (#794)', () => {
    // The same darkened-amber pattern the payouts weather confirm proves; re-pinned per file.
    const amberTint = { color: [240, 170, 46] as [number, number, number], alpha: 0.1 };
    for (const stop of PORCELAIN_STOPS) {
      const tint = composite(
        amberTint.color,
        amberTint.alpha,
        surfaceOver(PORCELAIN_CARD_GLASS, stop),
      );
      expect(
        contrastRatio(rgbToHex(INK_DARK), rgbToHex(tint)),
        `ink over amber tint ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the close-sales confirm button (white on darkened amber #9a6410) meets AA (#794)', () => {
    expect(contrastRatio('#ffffff', '#9a6410')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * The close-sales trigger's amber hairline, recorded under **rule 2** of
   * `docs/design/non-text-contrast.md` (#879). Its edge does not clear 3:1 against its own fill and
   * does not need to: this is a filled control whose identity is carried by its own label, so
   * 1.4.11's "required to identify" does not reach the boundary. All three of rule 2's conditions,
   * demonstrated rather than asserted in prose:
   *
   * <ol>
   *   <li>the label carries the identity — `--riv-card-ink` on the button's own `white/60` fill,
   *       measured at AA below;
   *   <li>the number is measured, not waved off — the edge ratio is computed and bounded, so a
   *       later slice that *worsens* it has to come through this test;
   *   <li>the control paints a real `border`, which is what makes rule 3 (forced-colors) its
   *       fallback.
   * </ol>
   *
   * <p>It became a recorded family because #879 moved the value (`#d9861a` -> `#e0a03a`, 1.65:1 ->
   * 1.48:1 on this fill). The position was already sub-3:1 before the merge and carried no entry —
   * so the ladder did not create this exemption, it found one that was never written down.
   */
  it('the close-sales trigger is identified by its label, not its edge (1.4.11 rule 2)', () => {
    for (const stop of PORCELAIN_STOPS) {
      const fill = composite(WHITE, TRIGGER_FILL_ALPHA, surfaceOver(PORCELAIN_CARD_GLASS, stop));
      const edge = composite(WARN_EDGE, TRIGGER_EDGE_ALPHA, fill);

      // 1. The label carries the identity, at AA on the button's own fill.
      expect(
        contrastRatio(rgbToHex(CARD_INK), rgbToHex(fill)),
        `trigger label over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);

      // 2. The edge's own ratio is measured and bounded — decorative is a conclusion, not a skip.
      const edgeRatio = contrastRatio(rgbToHex(edge), rgbToHex(fill));
      expect(edgeRatio, `trigger edge over ${rgbToHex(stop)}`).toBeLessThan(AA_LARGE);
      expect(edgeRatio, `trigger edge over ${rgbToHex(stop)}`).toBeGreaterThan(1.4);
    }
  });
});
