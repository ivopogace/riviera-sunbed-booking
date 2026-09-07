import { AA_NORMAL, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import { INK_DARK } from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the venue console's page. The console is ALWAYS porcelain (the app
 * shell pins `data-riv-theme="porcelain"` on every console route), so every pair is proven over
 * the porcelain surfaces; the section row, the rail and the badge are the console shell's
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
