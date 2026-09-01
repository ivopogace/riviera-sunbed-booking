import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { DARK_ERROR_INK, WARN_EDGE, WARN_FILL, WARN_INK } from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the merged **amber warn family** `--riv-warn-{edge,fill,ink}` (#879) — one skin for
 * every amber advisory surface in the tree: `shared/confirm-panel`'s `alertdialog`, the two
 * hand-rolled confirm panels on the operator console's Daily-view and Payouts tabs (and the trigger
 * button that opens the first), the two legal pages' standing draft banner, and
 * `booking/withheld-email-notice`.
 *
 * <p><strong>Three token families collapsed into this one, and one deliberately did not.</strong>
 * `--riv-warn-edge`/`--riv-warn-tint` (class O, #852) painted the console's two confirm panels;
 * `--riv-confirm-warn-*` (class O, #852) painted the shared component doing the same job in
 * different markup; `--riv-notice-banner-*` (class F-4, #868) painted the standing banners. The
 * first two were the same role in two paints — the console panels are hand-rolled twins of
 * `confirm-panel`, which is what makes this a role match rather than a value coincidence — and the
 * third joined them because an amber advisory is one treatment whichever surface carries it.
 * `--riv-premium-edge` stayed out: it is a beach-map TIER identity over a gold gradient, not a
 * warning, and role beats value (the fork #848, #858 and #864 each resolved the same way).
 *
 * <p><strong>Why `#e0a03a`/`#fff4e0`/`#7a4a08` and not the notice banner's `#fcf0d9`/`#8a5410`.</strong>
 * It is the higher-contrast pair — 6.86:1 against 5.54:1 — so every surface the merge moves, moves
 * in the safe direction, and `confirm-panel` itself does not move at all.
 *
 * <p><strong>The theme-invariance argument changed hands, which is the part worth reading.</strong>
 * As a class-O token this family's single declaration rested on "every consumer is a child of
 * `operator-console`, whose host pins porcelain, so a dark branch is unreachable". That ground is
 * now FALSE: the legal pages and the withheld-email notice are tourist surfaces that render under
 * all three document themes. What holds instead is #868's, and it is the stronger claim — the fill
 * is fixed, so a themed ink over it would drift (`DARK_ERROR_INK` `#ffa9a1` measures 1.63:1 on it,
 * asserted below). A fixed fill pins every ink on it, whichever theme the page is in.
 *
 * <p>It lives in `shared/` rather than beside any one consumer because the population is tree-wide —
 * the same home, and the same reason, as `class-o-tint-tokens.contrast.spec.ts` and
 * `solid-fill-tokens.contrast.spec.ts`. The cross-theme proof against a real render, where the
 * cascade rather than a regex decides, is `e2e/warn-token-skin.e2e.ts`.
 */

const FAMILY = {
  '--riv-warn-edge': rgbToHex(WARN_EDGE),
  '--riv-warn-fill': rgbToHex(WARN_FILL),
  '--riv-warn-ink': rgbToHex(WARN_INK),
} as const;

/** The retired names. A sweep asserting they are gone is what makes the merge a merge. */
const RETIRED = [
  '--riv-warn-tint',
  '--riv-confirm-warn-edge',
  '--riv-confirm-warn-fill',
  '--riv-confirm-warn-ink',
  '--riv-notice-banner-fill',
  '--riv-notice-banner-ink',
];

/** Every site the merged family paints — three families' worth, now one list. */
const SITES = [
  'shared/confirm-panel.ts',
  'operator/daily-view-tab.html',
  'operator/payouts-tab.html',
  'booking/withheld-email-notice.ts',
  'pages/legal/privacy-policy.html',
  'pages/legal/terms-of-service.html',
];

/** The literals the three retired families carried, none of which may survive at a site. */
const RETIRED_LITERALS = [
  '#d9861a',
  '#f0aa2e',
  '#e0a03a',
  '#fff4e0',
  '#7a4a08',
  '#fcf0d9',
  '#8a5410',
];

const APP_ROOT = join(process.cwd(), 'src/app');

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

describe('The merged amber warn family (WCAG AA + theme invariance, #879)', () => {
  it('the warn ink meets AA on its solid amber fill', () => {
    expect(contrastRatio(rgbToHex(WARN_INK), rgbToHex(WARN_FILL))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  /**
   * The merge's whole safety argument in one assertion: the surviving pair is not merely adequate,
   * it is BETTER than the pair it replaced on the three sites that moved. Written as a comparison
   * rather than as two thresholds because "still passes AA" would have been true of the losing
   * choice too, and would not have said why this one was picked.
   */
  it('beats the notice banner pair it replaced, so every moved surface moved the safe way', () => {
    const outgoing = contrastRatio('#8a5410', '#fcf0d9');
    const merged = contrastRatio(rgbToHex(WARN_INK), rgbToHex(WARN_FILL));

    expect(outgoing).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(merged).toBeGreaterThan(outgoing);
  });

  it('the themed error/danger ink would not — which is why the family is theme-invariant', () => {
    expect(contrastRatio(rgbToHex(DARK_ERROR_INK), rgbToHex(WARN_FILL))).toBeLessThan(AA_NORMAL);
  });

  it('declares each token exactly once, so no theme block can override it', () => {
    for (const name of Object.keys(FAMILY)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('declares the family in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(FAMILY)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the values this test mirror carries', () => {
    for (const [name, value] of Object.entries(FAMILY)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('is mapped in `@theme inline`, without which the utilities never generate', () => {
    for (const name of Object.keys(FAMILY)) {
      expect(
        declarationsOf(`--color-riv-${name.slice('--riv-'.length)}`),
        `the @theme inline row for ${name}`,
      ).toEqual([`var(${name})`]);
    }
  });

  it('leaves none of the three retired families declared', () => {
    for (const name of RETIRED) {
      expect(declarationsOf(name), `${name} should be retired`).toEqual([]);
    }
  });

  it('leaves no site painting any retired family as a literal', () => {
    for (const path of SITES) {
      const source = read(path);
      for (const literal of RETIRED_LITERALS) {
        expect(source.toLowerCase(), `${path} still paints ${literal}`).not.toContain(literal);
      }
    }
  });

  /**
   * The positive half. The sweep above asserts absences, which a mistyped path would satisfy
   * vacuously; this one proves each site is actually painting the merged family.
   */
  it('paints the merged family at every one of its sites', () => {
    for (const path of SITES) {
      expect(read(path), `${path} paints the merged family`).toMatch(/-riv-warn-(edge|fill|ink)/);
    }
  });
});
