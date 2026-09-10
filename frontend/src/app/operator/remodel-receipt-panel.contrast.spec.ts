import { CARD_INK_SOFT_ALPHA } from '../../testing/glass-tokens';
import { CONSOLE_THEMES, expectAaOnSurfaces, insetOver } from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the remodel receipt panel and the editor's past-remodels disclosure.
 * Both wear `--riv-card-ink` (the heading, the move list, the refund and release lines with their
 * sub-headings, the Done button and the receipt links) and `--riv-card-ink-soft` (the saved-at line,
 * the empty state, the operator's reason) over a `bg-riv-console-inset/45` fill on the editor's card
 * glass, in both console themes. Values mirror the templates; an edit there must
 * re-pass here.
 */
const RECEIPT_FILL_ALPHA = 0.45;

describe.each(CONSOLE_THEMES)('RemodelReceiptPanel contrast (WCAG AA, #1034) — $name', (theme) => {
  it('the card ink meets AA (normal text) on the inset/45 — heading, moves, refunds, releases, Done, receipt links', () => {
    expectAaOnSurfaces(theme, theme.ink, 1, (stop) => insetOver(theme, RECEIPT_FILL_ALPHA, stop));
  });

  it('the soft card ink meets AA (normal text) on the inset/45 — saved-at line, empty state, refund reason', () => {
    expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) =>
      insetOver(theme, RECEIPT_FILL_ALPHA, stop),
    );
  });

  it('the error ink meets AA on the inset/45 — the past-remodels load failure', () => {
    expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) =>
      insetOver(theme, RECEIPT_FILL_ALPHA, stop),
    );
  });
});
