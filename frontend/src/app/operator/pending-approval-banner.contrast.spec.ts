import { AA_LARGE, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import { CONSOLE_THEMES, expectAaOnSurfaces, tintOver } from '../../testing/console-themes';
import { WARN_EDGE } from '../../testing/glass-tokens';

/**
 * The pending-approval notice paints the merged amber warn family as a TINT on the console's
 * card glass — `border-riv-warn-edge/55 bg-riv-warn-edge/15` — not as the family's opaque fill,
 * so `shared/warn-token-skin.contrast.spec.ts`'s fixed-fill argument does not reach it: the
 * banner's ground is the card, which themes with the console. Proven here, per console theme,
 * where the element lives.
 *
 * <p>The edge is the boundary of a `role="status"` region, a `<div>` — the same ground as the
 * console's "Venue not found" card in `docs/design/non-text-contrast.md`: outside 1.4.11 rather
 * than exempt under rule 2, because nothing about the notice is identified by its hairline; the
 * text carries it. The number is measured and bounded all the same (it sits under 3:1 in both
 * themes, nearer it in dark), so a later slice that worsens it comes through this test.
 */

const EDGE_ALPHA = 0.55;
const FILL_ALPHA = 0.15;

describe.each(CONSOLE_THEMES)('PendingApprovalBanner contrast ($name console, #1010)', (theme) => {
  it('the notice text (--riv-card-ink) meets AA on the amber tint over every page stop', () => {
    expectAaOnSurfaces(theme, theme.ink, 1, (stop) => tintOver(theme, WARN_EDGE, FILL_ALPHA, stop));
  });

  it('the edge is measured, not required: the status text carries the identity', () => {
    for (const stop of theme.stops) {
      const fill = tintOver(theme, WARN_EDGE, FILL_ALPHA, stop);
      const edge = composite(WARN_EDGE, EDGE_ALPHA, fill);
      const edgeRatio = contrastRatio(rgbToHex(edge), rgbToHex(fill));

      expect(edgeRatio, `${theme.name}: edge over ${rgbToHex(stop)}`).toBeGreaterThan(1.3);
      expect(edgeRatio, `${theme.name}: edge over ${rgbToHex(stop)}`).toBeLessThan(AA_LARGE);
    }
  });
});
