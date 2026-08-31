import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  ERROR_INK,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  SOLID_FILL_BRAND,
  SOLID_FILL_DANGER,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Requests tab. The tab is always porcelain (console host);
 * cards use `appCardGlass` (`--riv-card-glass` = white @ 0.55). Text pairs: the heading, guest name,
 * set-label + confirm/dismiss/keep-it copy use `--riv-card-ink`; the intro/meta/empty sub-copy use
 * `--riv-card-ink-soft` (0.78); "Respond by" uses `--riv-card-ink-faint` (0.72); the price value uses
 * the console teal `#0a6e85` (still a literal — class T, #848); the urgency chip + decline text +
 * expired-race + load-error use the alert red `--riv-error-ink` (also the urgency-chip text over its
 * own `#a3160e`@0.10 tint, a class-O modifier left to #852). The primary buttons put white on
 * `--riv-solid-fill-brand` (accept) / `--riv-solid-fill-danger` (confirm-decline), tokenised at #854.
 *
 * <p>The design mock's lighter teal→teal gradient (`#2bb8d4`) and raw ambers fail AA on their light
 * stops, so this tab deliberately uses the console's proven `#0a6e85` / `--riv-error-ink` inks instead (the
 * `riviera-tailwind` "deviate-from-design-for-AA-with-a-note" rule). Values mirror the template; a
 * colour edit there must re-pass here.
 */

const TEAL = '#0a6e85';
const ALERT = rgbToHex(ERROR_INK);
const ALERT_RGB = ERROR_INK;

/** The card-glass surface composited over a porcelain background stop. */
function cardSurface(stop: (typeof PORCELAIN_STOPS)[number]): string {
  return rgbToHex(surfaceOver(PORCELAIN_CARD_GLASS, stop));
}

describe('RequestsTab porcelain contrast (WCAG AA, #176)', () => {
  it('heading + guest + strong labels + confirm/dismiss copy (--riv-card-ink) meet AA on the card glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('intro + meta + empty-state sub-copy (--riv-card-ink-soft 0.78) meet AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the "Respond by" line (--riv-card-ink-faint 0.72) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('the price value (teal #0a6e85) meets AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(TEAL, cardSurface(stop)),
        `teal over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the alert red (--riv-error-ink: urgency text, decline text, expired-race, load-error) meets AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      expect(
        contrastRatio(ALERT, cardSurface(stop)),
        `alert over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the urgency-chip text (--riv-error-ink) meets AA over its own #a3160e@0.10 tint on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const chip = composite(ALERT_RGB, 0.1, surfaceOver(PORCELAIN_CARD_GLASS, stop));
      expect(
        contrastRatio(ALERT, rgbToHex(chip)),
        `chip over ${rgbToHex(stop)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the primary buttons (white on the --riv-solid-fill-* accept / confirm-decline fills) meet AA', () => {
    // Both fills are this tab's members of the #854 family; the family's own AA proof, its theme-invariance guard and the sweep that keeps them off literals are shared/solid-fill-tokens.contrast.spec.ts.
    expect(contrastRatio('#ffffff', rgbToHex(SOLID_FILL_BRAND))).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio('#ffffff', rgbToHex(SOLID_FILL_DANGER))).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
