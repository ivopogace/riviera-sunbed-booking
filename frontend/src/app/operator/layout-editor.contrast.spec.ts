import { AA_LARGE, AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  WASH_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the layout editor. The editor is always porcelain (console
 * host), its control panels use `appCardGlass` (`--riv-card-glass` = white @ 0.55), and its
 * primary buttons reuse the project's AA-safe `--riv-cta-grad` teal (NOT the design's brighter
 * `#2bb8d4/#0e8aa8`, which fails AA with white). Since #672 slice 2 the grid sits on the shared
 * canvas's sea→sand wash, whose rail-chip inks are proven in `venue-map.contrast.spec.ts`. Grid
 * cells carry no text — state is conveyed by colour AND a per-cell `aria-label` — but the gap
 * cell's identity is its dashed border alone, so that boundary is proven 3:1 (1.4.11) composited
 * over the wash's worst-case (sand) stop. Values mirror the template + `beach-cell.ts` +
 * `styles.scss`; an edit there must re-pass here.
 */

// --riv-cta-grad stops (the AA-safe darkened teal, shared with every tourist/operator CTA).
const CTA_STOPS = ['#0c7288', '#0a5f74'];
// The "Facing the sea" banner: solid white on the restyle's sea teal (shared BeachGridFrame, #672).
const SEA_BANNER_STOPS = ['#0e7a89', '#0c6675'];
// beach-cell.ts: the gap cell's dashed border is a CARD_INK tint at this alpha.
const GAP_BORDER_ALPHA = 0.55;

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
    expect(contrastRatio('#ffffff', '#0a5f74')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('save error + saved notice inks meet AA over every porcelain stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const hex = rgbToHex(stop);
      expect(contrastRatio('#a3160e', hex), `error over ${hex}`).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio('#0a6e85', hex), `notice over ${hex}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('sanity: the design cyan (#0e8aa8) that we replaced would have FAILED AA with white', () => {
    // Documents WHY the buttons use --riv-cta-grad, not the design gradient — guards against a re-swap.
    expect(contrastRatio('#ffffff', '#0e8aa8')).toBeLessThan(AA_NORMAL);
    // and the composite helper is exercised so an accidental import break is caught
    expect(rgbToHex(composite(INK_DARK, 1, [255, 255, 255]))).toBe(rgbToHex(INK_DARK));
  });
});
