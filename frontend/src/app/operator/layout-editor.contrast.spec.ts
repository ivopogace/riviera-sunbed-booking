import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the layout editor. The editor is always porcelain (console
 * host), its control/grid panels use `appCardGlass` (`--riv-card-glass` = white @ 0.55), and its
 * primary buttons reuse the project's AA-safe `--riv-cta-grad` teal (NOT the design's brighter
 * `#2bb8d4/#0e8aa8`, which fails AA with white). Grid cells carry no text — state is conveyed by
 * colour AND a per-cell `aria-label`, so only the text pairs below need AA. Values mirror the template
 * + `styles.scss`; a token edit there must re-pass here.
 */

// --riv-cta-grad stops (the AA-safe darkened teal, shared with every tourist/operator CTA).
const CTA_STOPS = ['#0c7288', '#0a5f74'];
// The "Facing the sea" banner: solid white on a darkened teal gradient (kept AA, unlike the design cyan).
const SEA_BANNER_STOPS = ['#0a6e85', '#0a5a6e'];

describe('LayoutEditor porcelain contrast (WCAG AA, #172)', () => {
  it('panel headings + row labels + promenade banner (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('input labels + tool counts (--riv-card-ink-faint 0.72) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('helper text + per-row prices (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
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
