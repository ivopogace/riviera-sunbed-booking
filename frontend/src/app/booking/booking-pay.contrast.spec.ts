import { AA_LARGE, AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * Deterministic WCAG-AA contrast for the payment page's colour pairs (issue #50, AC-7). Mirrors
 * booking-pay.scss. axe-core's color-contrast rule can't run under jsdom, so the maths is checked
 * here; the Playwright e2e covers real-render contrast.
 */
describe('BookingPay colour contrast (WCAG AA)', () => {
  const WHITE = '#ffffff';

  it('heading/body (slate-900) on white meets AA', () => {
    expect(contrastRatio('#0f172a', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('lead/labels/status (slate-700) on white meets AA', () => {
    expect(contrastRatio('#334155', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the big booking code (blue-700, large text) on white meets AA-large', () => {
    expect(contrastRatio('#1d4ed8', WHITE)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('links (blue-700) on white meet AA', () => {
    expect(contrastRatio('#1d4ed8', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the primary button (white on blue-700) meets AA', () => {
    expect(contrastRatio(WHITE, '#1d4ed8')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the disabled button (white on slate-600) meets AA', () => {
    expect(contrastRatio(WHITE, '#475569')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the error message (red-800 on red-50) meets AA', () => {
    expect(contrastRatio('#991b1b', '#fef2f2')).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
