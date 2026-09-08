import {
  CARD_INK,
  CARD_INK_FAINT_ALPHA,
  CARD_INK_SOFT_ALPHA,
  INK_DARK,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
} from '../../testing/glass-tokens';
import { CONSOLE_THEMES, cardOver, expectAaOnSurfaces } from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the console stats strip. The strip's tiles use `appCardGlass`
 * (porcelain `--riv-card-glass` = white @ 0.55), so every ink sits over that glass composited over
 * the console's porcelain background stops. The label uses `--riv-card-ink-faint` (0.72) —
 * deliberately brighter than the drawn `rgba(12,42,51,0.5)`, which would fail AA. Values
 * mirror `tailwind.css`; a token edit there must re-pass here.
 */

describe('ConsoleStatsStrip porcelain contrast (WCAG AA, #171)', () => {
  it('tile KPI number (--riv-card-ink) meets AA on the card glass over every porcelain stop', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('tile label (--riv-card-ink-faint, 0.72) meets AA — raised from the drawn 0.5 for AA', () => {
    expectAaOverStops(CARD_INK, CARD_INK_FAINT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });

  it('takings sub-label (--riv-card-ink-soft, 0.78) meets AA on the card glass', () => {
    expectAaOverStops(CARD_INK, CARD_INK_SOFT_ALPHA, PORCELAIN_CARD_GLASS, PORCELAIN_STOPS);
  });
});

/** Both console themes off one table (`testing/console-themes.ts`); the porcelain rows above stay
 *  as the parity proof. */
describe.each(CONSOLE_THEMES)(
  'ConsoleStatsStrip contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('the KPI number, its label and the takings sub-label meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_FAINT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
    });
  },
);
