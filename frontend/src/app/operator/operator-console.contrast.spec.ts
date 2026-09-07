import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import { INK_DARK } from '../../testing/glass-tokens';
import { CONSOLE_THEMES } from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the venue console's page. The console wears the operator's console
 * theme (the app shell pins it on every console route), porcelain by default and dark by choice:
 * the porcelain row proves the default, the themed block at the foot proves both; the section row, the rail and the badge are the console shell's
 * (`console-shell.contrast.spec.ts`), the account chip's pairs are in
 * `operator-account-chip.contrast.spec.ts`, the venue switcher's popover in
 * `operator-venue-switch.contrast.spec.ts`. The venue-not-found card uses an OPAQUE SOLID fill
 * instead of a translucent one — the `css:S7924` treatment — so both the WCAG maths and the static
 * analyzer compute contrast without gradient compositing. These values mirror the Tailwind
 * utilities in `operator-console.html` and the porcelain `--riv-*` tokens in `tailwind.css`; a
 * colour edit in either must re-pass here.
 */

const WHITE = '#ffffff';
const INK = '#0a2a33'; // --riv-ink (porcelain)

describe('OperatorConsole porcelain contrast (WCAG AA, #170)', () => {
  it('not-found card ink meets AA on the opaque white surface', () => {
    expect(contrastRatio(INK, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
    // ink-soft intro on the white card
    const inkSoft = composite(INK_DARK, 0.7, [255, 255, 255]);
    expect(contrastRatio(rgbToHex(inkSoft), WHITE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

/** Both console themes off one table (`testing/console-themes.ts`): the "Venue not found" card is
 *  the opaque inset — white in porcelain, the slate in dark — under the document ink the pin
 *  re-resolves. The porcelain row above stays as the parity proof. */
describe.each(CONSOLE_THEMES)(
  'OperatorConsole contrast in the $name console (WCAG AA, #1010)',
  (theme) => {
    it('the not-found card ink meets AA on the opaque inset', () => {
      expect(contrastRatio(rgbToHex(theme.ink), rgbToHex(theme.inset))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });
  },
);
