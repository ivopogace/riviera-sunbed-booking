import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * Deterministic WCAG AA colour-contrast check for the venue editor (issue #38 pattern). axe-core
 * cannot measure contrast under jsdom, so the editor's colour tokens are asserted here. These hex
 * values MUST stay in lockstep with the CSS custom properties in `venue-editor.scss`.
 */
const TEXT = '#1a1a1a';
const BG = '#ffffff';
const CARD = '#f4f4f5';
const HINT = '#44474c';
const PRIMARY = '#0a5c2f';
const ON_PRIMARY = '#ffffff';
const SECONDARY = '#e4e4e7';
const ON_SECONDARY = '#1a1a1a';
const DANGER = '#9a1414';
const ON_DANGER = '#ffffff';

describe('VenueEditor colour contrast (WCAG AA)', () => {
  it('body text on the page and card backgrounds meets AA', () => {
    expect(contrastRatio(TEXT, BG)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(TEXT, CARD)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('hint and error text meet AA on both backgrounds', () => {
    expect(contrastRatio(HINT, BG)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(HINT, CARD)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(DANGER, BG)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(DANGER, CARD)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('button label text meets AA on every button colour', () => {
    expect(contrastRatio(ON_PRIMARY, PRIMARY)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(ON_SECONDARY, SECONDARY)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(ON_DANGER, DANGER)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
