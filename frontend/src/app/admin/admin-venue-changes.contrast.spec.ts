import { CARD_INK_SOFT_ALPHA } from '../../testing/glass-tokens';
import {
  CONSOLE_THEMES,
  cardOver,
  expectAaOnSurfaces,
  insetOver,
  tintOver,
} from '../../testing/console-themes';

/**
 * WCAG-AA contrast guard for the admin console's Venue changes tab. The tab wears the console theme
 * (porcelain by default, dark by choice), on `appCardGlass` surfaces. Its text pairs are the ones the
 * console already registers, and this file is what keeps that true: the heading, venue name and
 * refund count are `--riv-card-ink`; the intro, amounts and column headers `--riv-card-ink-soft`; the
 * fee column `--riv-console-negative-ink`, the same ink a payout-ledger deduction wears, over the card
 * and over the table header's own tint; the load-error `--riv-error-ink` on the inset; the Refresh
 * button's `--riv-accent-ink` over the console tint at 0.05.
 */
describe.each(CONSOLE_THEMES)(
  'AdminVenueChanges contrast in the $name console (WCAG AA)',
  (theme) => {
    it('the heading, venue name and refund count (--riv-card-ink) meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.ink, 1, (stop) => cardOver(theme, stop));
    });

    it('the intro, amounts and column headers (--riv-card-ink-soft) meet AA on the card glass', () => {
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.ink, CARD_INK_SOFT_ALPHA, (stop) =>
        tintOver(theme, theme.tint, 0.05, stop),
      );
    });

    it('the fee column (--riv-console-negative-ink) meets AA on the card glass and the header tint', () => {
      expectAaOnSurfaces(theme, theme.negativeInk, 1, (stop) => cardOver(theme, stop));
      expectAaOnSurfaces(theme, theme.negativeInk, 1, (stop) =>
        tintOver(theme, theme.tint, 0.05, stop),
      );
    });

    it('the load-error notice (--riv-error-ink) meets AA on the inset', () => {
      expectAaOnSurfaces(theme, theme.errorInk, 1, (stop) => insetOver(theme, 0.7, stop));
    });

    it('the Refresh button ink (--riv-accent-ink) meets AA over the console tint at 0.05', () => {
      expectAaOnSurfaces(theme, theme.accentRing, 1, (stop) =>
        tintOver(theme, theme.tint, 0.05, stop),
      );
    });
  },
);
