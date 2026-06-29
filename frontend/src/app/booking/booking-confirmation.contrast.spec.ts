import { AA_LARGE, AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * Deterministic WCAG-AA contrast for the confirmation screen's colour pairs (issue #6,
 * AC-13). Mirrors booking-confirmation.scss.
 */
describe('BookingConfirmation colour contrast (WCAG AA)', () => {
  const WHITE = '#ffffff';

  it('heading/body (slate-900) on white meets AA', () => {
    expect(contrastRatio('#0f172a', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('lead/labels (slate-700) on white meets AA', () => {
    expect(contrastRatio('#334155', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the big booking code (blue-700, large text) on white meets AA-large', () => {
    expect(contrastRatio('#1d4ed8', WHITE)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the home link (blue-700) on white meets AA', () => {
    expect(contrastRatio('#1d4ed8', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
