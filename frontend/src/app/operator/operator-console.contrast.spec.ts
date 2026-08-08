import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  INK_DARK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the operator console. The console is ALWAYS porcelain
 * (its host scopes `data-riv-theme="porcelain"`), so every pair is proven over the porcelain
 * background stops / header glass. Interactive chrome (sign-in card, active tab pill, Requests badge,
 * buttons) uses OPAQUE SOLID fills instead of translucent ones — the `css:S7924` treatment — so both the WCAG
 * maths and the static analyzer compute contrast without gradient compositing. These values mirror
 * `operator-console.scss`; a colour edit there must re-pass here.
 */

const WHITE = '#ffffff';
const INK = '#0a2a33'; // --riv-ink (porcelain)
// --riv-cta-grad stops (AA-safe darkened teal, shared with the tourist CTAs), and the badge fill.
const CTA_STOPS = ['#0c7288', '#0a5f74'];
const BADGE_FILL = '#0a5f74';
const ERROR_INK = '#a3160e';

describe('OperatorConsole porcelain contrast (WCAG AA, #170)', () => {
  it('header wordmark ink meets AA on the porcelain header glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('header "Operator" + signed-in-as (ink 0.7) meet AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 0.7, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('header venue title (ink-faint 0.66, small uppercase) meets AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 0.66, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('sign-in card / active tab / sign-out ink meet AA on the opaque white surface', () => {
    expect(contrastRatio(INK, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
    // ink-soft intro/label on the white card
    const inkSoft = composite(INK_DARK, 0.7, [255, 255, 255]);
    expect(contrastRatio(rgbToHex(inkSoft), WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('sign-in error ink meets AA on the white card', () => {
    expect(contrastRatio(ERROR_INK, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('sign-in submit (white) meets AA on both CTA gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio(WHITE, stop), `stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('Requests badge (white) meets AA on its solid teal fill', () => {
    expect(contrastRatio(WHITE, BADGE_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('inactive tab label (ink 0.7) meets AA over every porcelain background stop', () => {
    for (const stop of PORCELAIN_STOPS) {
      const ink = composite(INK_DARK, 0.7, stop);
      expect(contrastRatio(rgbToHex(ink), rgbToHex(stop)), `stop ${rgbToHex(stop)}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });
});
