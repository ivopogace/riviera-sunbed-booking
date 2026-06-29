import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * Deterministic WCAG-AA contrast check for the booking dialog's colour pairs (issue #6,
 * AC-13) — axe can't measure contrast under jsdom, so the maths is verified here. The colours
 * mirror booking-dialog.scss; if that file changes, update these.
 */
describe('BookingDialog colour contrast (WCAG AA)', () => {
  const WHITE = '#ffffff';

  it('primary button text on blue-700 meets AA', () => {
    expect(contrastRatio(WHITE, '#1d4ed8')).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('body title text (slate-900) on white meets AA', () => {
    expect(contrastRatio('#0f172a', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('summary text (slate-700) on white meets AA', () => {
    expect(contrastRatio('#334155', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('error text (red-700) on white meets AA', () => {
    expect(contrastRatio('#b91c1c', WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
