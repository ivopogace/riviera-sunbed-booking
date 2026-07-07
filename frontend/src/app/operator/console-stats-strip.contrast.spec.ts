import { CARD_INK, INK_DARK, PORCELAIN_STOPS, WHITE, expectAaOverStops } from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the console stats strip (#171). The strip's tiles use `appCardGlass`
 * (porcelain `--riv-card-glass` = white @ 0.55), so every ink sits over that glass composited over
 * the console's porcelain background stops. The label uses `--riv-card-ink-faint` (0.72) —
 * deliberately brighter than the design file's `rgba(12,42,51,0.5)`, which would fail AA. Values
 * mirror `styles.scss`; a token edit there must re-pass here.
 */

const CARD_GLASS = { color: WHITE, alpha: 0.55 };

describe('ConsoleStatsStrip porcelain contrast (WCAG AA, #171)', () => {
  it('tile KPI number (--riv-card-ink) meets AA on the card glass over every porcelain stop', () => {
    expectAaOverStops(INK_DARK, 1, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('tile label (--riv-card-ink-faint, 0.72) meets AA — raised from the design 0.5 for AA', () => {
    expectAaOverStops(CARD_INK, 0.72, CARD_GLASS, PORCELAIN_STOPS);
  });

  it('takings sub-label (--riv-card-ink-soft, 0.78) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, 0.78, CARD_GLASS, PORCELAIN_STOPS);
  });
});
