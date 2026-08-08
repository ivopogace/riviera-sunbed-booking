import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA contrast guard for the shared status chips. The chips
 * use OPAQUE SOLID fills (the css:S7924 treatment — see `shared/status-chip.ts`), so their text
 * contrast is theme-independent and asserted directly. This is the **single home** of that proof —
 * both `booking-view` and `my-bookings` consume the directive, so the assertion lives here once
 * (not duplicated per consumer). Values mirror that directive's `FILLS` map.
 */
const CHIPS: readonly [status: string, ink: string, fill: string][] = [
  ['CONFIRMED', '#0e6e46', '#d9f2e7'],
  ['PENDING_REQUEST', '#8a5410', '#fceed5'],
  ['AWAITING_PAYMENT', '#0a5e7a', '#d5f1f6'],
  ['DECLINED', '#8a3a2a', '#f6e5e0'],
  ['EXPIRED', '#5a6a72', '#eceeef'],
  ['CANCELLED', '#8a3a2a', '#f6e5e0'],
  ['COMPLETED', '#0a5e6e', '#e1f5f9'],
  ['NO_SHOW', '#7a4a3a', '#ece6e3'],
  ['WITHDRAWN', '#5c5470', '#eeecf4'],
];

describe('Status chips (solid fills, WCAG AA) — shared/status-chip.ts', () => {
  it.each(CHIPS)('the %s chip ink meets AA on its solid fill', (_status, ink, fill) => {
    expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
