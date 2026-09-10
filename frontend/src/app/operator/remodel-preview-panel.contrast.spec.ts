import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { SOLID_FILL_WARN, WARN_FILL, WARN_INK, WHITE } from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the remodel preview panel. Every ink on it is the fixed amber warn
 * family — the sentence, the group headings, the list items, the link, the Back button and the
 * refund confirmation's two fields, their labels and their errors all wear `--riv-warn-ink` over
 * `--riv-warn-fill`, and the Save button is white over `--riv-solid-fill-warn` — so the pairs are
 * theme-invariant: a fixed fill pins every ink on it whichever console theme the editor wears
 * (`shared/warn-token-skin.contrast.spec.ts`). That is why the fields do NOT wear the console field
 * skin their admin sibling does: `--riv-field-border` and `--riv-console-inset` theme, and a themed
 * skin over a fixed ground drifts in the dark console. Values mirror the template; an edit there
 * must re-pass here.
 */
describe('RemodelPreviewPanel contrast (WCAG AA, #1033)', () => {
  it('the warn ink meets AA (normal text) on the warn fill — sentence, lists, link, Back, the confirmation fields', () => {
    expect(contrastRatio(rgbToHex(WARN_INK), rgbToHex(WARN_FILL))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it('white meets AA (normal text) on the solid warn fill — the Save button', () => {
    expect(contrastRatio(rgbToHex(WHITE), rgbToHex(SOLID_FILL_WARN))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});
