import { AA_LARGE } from '../../testing/contrast';
import {
  DARK_HEADER_GLASS,
  DARK_INK_FAINT,
  DARK_STOPS,
  INK_DARK,
  INK_FAINT,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_HEADER_GLASS,
  RIVIERA_INK_FAINT,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
} from '../../testing/glass-tokens';

/**
 * WCAG 1.4.11 guard for the shared tab rail. Two non-text marks identify the rail: the
 * current tab's 3px underline in `--riv-ink`, and the hairline the tabs share plus the group
 * dividers, both in `--riv-ink-faint`. Each is held to 3:1 against the header glass over every
 * background stop, per theme — the rail is a `shared/` primitive, and the console's own dark
 * theme makes a dark-themed host a real consumer rather than a hypothetical one.
 */
describe('TabRail contrast (WCAG 1.4.11)', () => {
  const themes = [
    {
      name: 'porcelain',
      ink: INK_DARK,
      faint: INK_FAINT,
      glass: PORCELAIN_HEADER_GLASS,
      stops: PORCELAIN_STOPS,
    },
    {
      name: 'riviera',
      ink: WHITE,
      faint: RIVIERA_INK_FAINT,
      glass: RIVIERA_HEADER_GLASS,
      stops: RIVIERA_STOPS,
    },
    {
      name: 'dark',
      ink: WHITE,
      faint: DARK_INK_FAINT,
      glass: DARK_HEADER_GLASS,
      stops: DARK_STOPS,
    },
  ];

  for (const theme of themes) {
    it(`${theme.name}: the current tab's underline (full ink) clears 3:1 on the header glass`, () => {
      expectAaOverStops(theme.ink, 1, theme.glass, theme.stops, AA_LARGE);
    });

    it(`${theme.name}: the hairline and dividers (ink-faint) clear 3:1 on the header glass`, () => {
      expectAaOverStops(theme.faint.color, theme.faint.alpha, theme.glass, theme.stops, AA_LARGE);
    });
  }
});
