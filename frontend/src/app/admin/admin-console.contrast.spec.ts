import { AA_NORMAL, Rgb, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  ACCENT_INK,
  DANGER_ACTION_FILL,
  DANGER_FILL,
  DANGER_INK,
  DARK_CARD_GLASS,
  DARK_DANGER_ACTION_FILL,
  DARK_DANGER_FILL,
  DARK_DANGER_INK,
  DARK_STOPS,
  ERROR_INK,
  Glass,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the admin console. The console is ALWAYS porcelain (its host
 * scopes `data-riv-theme="porcelain"`, admin-console.ts:59), so the porcelain rows are the
 * live proof; the dark rows exist because `shared/confirm-with-reason.ts` and the danger
 * token set are reachable from outside this console, and a latent value nobody proved is
 * how #829's own "dark-red ink on a dark ground" case got written in the first place.
 *
 * <p>Two surfaces, not one: the tab bodies put error text directly on the page background
 * (`admin-commissions.ts` loading/error paragraphs use `text-riv-ink*`, the shell's ink),
 * while the cards put it on `--riv-card-glass`. Both are asserted.
 *
 * <p>Scope is WCAG 1.4.3 TEXT pairs. The erasure panel's own boundaries are non-text
 * (1.4.11) and are deliberately NOT asserted here: the Erase button's border measures
 * ≈2.6:1 over the panel fill on `main` today, so asserting it would either fail on
 * pre-existing paint or invite a silent value change during a token migration. Recorded as
 * a finding on #829 with its own follow-up issue instead (plan R-3).
 */

const OUTGOING_ERROR_INK: Rgb = [0xb3, 0x26, 0x1e];

/** The ink an admin surface paints on: the bare page stop, and the card glass over it. */
function adminSurfaces(stops: readonly Rgb[], glass: Glass): readonly Rgb[] {
  return [...stops, ...stops.map((stop) => surfaceOver(glass, stop))];
}

const PORCELAIN_SURFACES = adminSurfaces(PORCELAIN_STOPS, PORCELAIN_CARD_GLASS);

function ratio(ink: Rgb, surface: Rgb): number {
  return contrastRatio(rgbToHex(ink), rgbToHex(surface));
}

describe('AdminConsole contrast (WCAG AA, #829)', () => {
  it('the error ink meets AA on both admin surfaces', () => {
    for (const surface of PORCELAIN_SURFACES) {
      expect(
        ratio(ERROR_INK, surface),
        `error ink over ${rgbToHex(surface)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the migration does not lower contrast on any admin surface', () => {
    for (const surface of PORCELAIN_SURFACES) {
      expect(
        ratio(ERROR_INK, surface),
        `error ink over ${rgbToHex(surface)}`,
      ).toBeGreaterThanOrEqual(ratio(OUTGOING_ERROR_INK, surface));
    }
  });

  it('the accent ink the Kept term moves to meets AA on the card glass', () => {
    for (const stop of PORCELAIN_STOPS) {
      const card = surfaceOver(PORCELAIN_CARD_GLASS, stop);
      expect(ratio(ACCENT_INK, card), `accent ink over ${rgbToHex(card)}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('the danger ink meets AA on the panel and action fills, per theme', () => {
    const themes = [
      {
        name: 'porcelain',
        ink: DANGER_INK,
        glass: PORCELAIN_CARD_GLASS,
        stops: PORCELAIN_STOPS,
        panel: DANGER_FILL,
        action: DANGER_ACTION_FILL,
      },
      {
        name: 'dark',
        ink: DARK_DANGER_INK,
        glass: DARK_CARD_GLASS,
        stops: DARK_STOPS,
        panel: DARK_DANGER_FILL,
        action: DARK_DANGER_ACTION_FILL,
      },
    ];

    for (const theme of themes) {
      for (const stop of theme.stops) {
        const card = surfaceOver(theme.glass, stop);
        // The panel tints the card; the Erase button tints the panel again.
        const panel = composite(theme.panel.color, theme.panel.alpha, card);
        const action = composite(theme.action.color, theme.action.alpha, panel);

        expect(
          ratio(theme.ink, panel),
          `${theme.name} danger ink over the panel fill on ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(
          ratio(theme.ink, action),
          `${theme.name} danger ink over the action fill on ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });
});
