import { AA_NORMAL, contrastRatio, rgbToHex } from '../testing/contrast';
import {
  INK_DARK,
  PORCELAIN_HEADER_GLASS,
  PORCELAIN_STOPS,
  expectAaOverStops,
  SOLID_FILL_BRAND,
} from '../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the console shell's section row and rail. The shell is ALWAYS
 * porcelain (the app shell pins `data-riv-theme="porcelain"` on every console route), so every pair
 * is proven over the porcelain header glass / background stops; the chip's pairs are in
 * `operator-account-chip.contrast.spec.ts`, the venue switcher's popover in
 * `operator-venue-switch.contrast.spec.ts`, the rail's own hairline in `tab-rail.contrast.spec.ts`.
 * These values mirror the utilities in `console-shell.ts` and the porcelain `--riv-*` tokens in
 * `tailwind.css`; a colour edit in either must re-pass here.
 */
const WHITE = '#ffffff';
const BADGE_FILL = rgbToHex(SOLID_FILL_BRAND);

describe('ConsoleShell porcelain contrast (WCAG AA, #1011)', () => {
  it('brand and venue name (full ink) meet AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('the resting Admin section link (ink 0.7) meets AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 0.7, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('the Sign in link (full ink, 13px) meets AA on the header glass', () => {
    expectAaOverStops(INK_DARK, 1, PORCELAIN_HEADER_GLASS, PORCELAIN_STOPS);
  });

  it('Requests badge (white) meets AA on its solid teal fill', () => {
    expect(contrastRatio(WHITE, BADGE_FILL)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
