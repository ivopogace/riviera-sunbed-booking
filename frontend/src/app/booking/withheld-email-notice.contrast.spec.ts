import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import { DARK_ERROR_INK, NOTICE_BANNER_FILL, NOTICE_BANNER_INK } from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the `--riv-notice-banner-*` pair (#868, class F-4 of the colour-literal audit) — the
 * skin the amber notice banner wears: this component's "we couldn't email you" notice and the two
 * legal pages' standing draft banner (`pages/legal/legal-pages.contrast.spec.ts` reads the same
 * mirror for its own AA assertion, rather than restating the literal).
 *
 * <p>The medallion-waiting pair's exact value, on a different FORM. `--riv-medallion-waiting-*`
 * (#858) is a round, `aria-hidden` glyph whose whole population owes no AA assertion; this family
 * is a rectangular block of accessible text and genuinely owes one — asserted below, alongside the
 * themed-ink bound (`DARK_ERROR_INK` mirrors both `--riv-error-ink` and `--riv-danger-ink`'s dark
 * value, `#ffa9a1`) that is why the pair is theme-invariant rather than reused from either.
 *
 * <p>Which makes the invariance itself the thing to protect, and jsdom maths cannot see it: a dark
 * override added later would leave every ratio here passing. So the last tests read
 * `src/tailwind.css` as text (the `core/theme-boot.spec.ts` drift-guard pattern) and assert the
 * declaration is single and sits in the base block, that its value is what this mirror says, and
 * that none of the family's three sites has kept a literal copy — while the value's other, unrelated
 * homes (the medallion, `status-chip`, `booking-view`) are `shared/fixed-fill-token-skins.contrast.spec.ts`'s
 * `OUT_OF_FAMILY` concern, not this one. The cross-theme proof against a real render — where the
 * cascade, not a regex, decides — is `e2e/notice-banner-token-skin.e2e.ts`.
 */

const PAIR = {
  '--riv-notice-banner-fill': rgbToHex(NOTICE_BANNER_FILL),
  '--riv-notice-banner-ink': rgbToHex(NOTICE_BANNER_INK),
} as const;

/** The family's three sites — the only homes this slice migrates (#868's ledger row). */
const SITES = [
  'booking/withheld-email-notice.ts',
  'pages/legal/privacy-policy.html',
  'pages/legal/terms-of-service.html',
];

const APP_ROOT = join(process.cwd(), 'src/app');

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

describe('Withheld-email notice contrast (WCAG AA, #390, #868)', () => {
  it('the notice ink meets AA on its solid amber fill', () => {
    expect(
      contrastRatio(rgbToHex(NOTICE_BANNER_INK), rgbToHex(NOTICE_BANNER_FILL)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the themed error/danger ink would not — which is why the pair is theme-invariant', () => {
    expect(contrastRatio(rgbToHex(DARK_ERROR_INK), rgbToHex(NOTICE_BANNER_FILL))).toBeLessThan(
      AA_NORMAL,
    );
  });

  it('declares each token exactly once, so no theme block can override it', () => {
    for (const name of Object.keys(PAIR)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('declares the pair in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(PAIR)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the values this test mirror carries', () => {
    for (const [name, value] of Object.entries(PAIR)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('leaves none of the three sites painting the pair as a literal', () => {
    for (const path of SITES) {
      const source = read(path);
      expect(source, `${path} still paints #fcf0d9`).not.toContain('#fcf0d9');
      expect(source, `${path} still paints #8a5410`).not.toContain('#8a5410');
    }
  });
});
