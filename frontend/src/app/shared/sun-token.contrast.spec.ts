import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for `--riv-sun-grad`: one declaration, in the base block, carrying the opaque stops, and
 * no source rebuilding a sun inline.
 *
 * <p>Opacity is the load-bearing property, not a detail — a translucent stop composites against
 * the themed `--riv-photo-grad` beneath it and reads pale green. jsdom maths cannot see a dark
 * override added later, so these assertions read `src/tailwind.css` as text; the cascade's own
 * verdict is `e2e/sun-token.e2e.ts`.
 *
 * <p>Lives in `shared/` because the population it sweeps is tree-wide.
 * Rationale: docs/design/colour-literal-token-audit.md.
 */

/** Vitest runs with cwd = `frontend/`. */
const APP = join(process.cwd(), 'src/app');

/** The declared stops, as a known-good literal rather than a re-read of the stylesheet. */
const SUN =
  'radial-gradient(circle at 38% 30%, #fff6da 0%, #ffd97a 42%, #f6b23f 76%, #e89a26 100%)';

/** An image built inline in a class expression, narrowed to the shape a sun takes. */
const INLINE_RADIAL = 'bg-[radial-gradient(';

/** The three inline suns as they stood before the merge — the meta-test's known-bad fixtures. */
const PRE_MERGE_SUNS = [
  'bg-[radial-gradient(circle_at_34%_30%,#ffe6a3,#f0aa2e_70%)]',
  'bg-[radial-gradient(circle_at_34%_30%,rgba(255,236,180,0.95),rgba(240,170,46,0.5)_72%)]',
  'bg-[radial-gradient(circle_at_38%_30%,#fff6da_0%,#ffd97a_42%,#f6b23f_76%,#e89a26_100%)]',
];

/** The three files that carried a sun — the sweep is worthless if it stops reaching them. */
const SUN_SITES = ['app.html', 'pages/home/home.html', 'venue/venue-map.html'];

/** A declaration as one line, undoing only Prettier's wrapping — the stops are what is claimed. */
function unwrapped(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')');
}

/** App sources that could paint one. Templates are inline `.ts` for much of the console. */
function appSources(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'),
  );
}

describe('--riv-sun-grad', () => {
  it('declares one sun, in the base block', () => {
    expect(declarationsOf('--riv-sun-grad'), 'the sun declarations').toHaveLength(1);
    expect(baseBlock(), 'the sun in the base block').toContain('--riv-sun-grad:');
  });

  /** Prettier owns the line breaks — it wraps a gradient this long, as it does `--riv-photo-scrim`. */
  it('carries the opaque stops', () => {
    expect(unwrapped(declarationsOf('--riv-sun-grad')[0])).toBe(SUN);
    expect(SUN, 'no stop may carry an alpha').not.toContain('rgba');
  });

  it('no source rebuilds a sun inline', () => {
    const rebuilt = appSources().filter((path) =>
      readFileSync(join(APP, path), 'utf8').includes(INLINE_RADIAL),
    );

    expect(rebuilt, 'sources building a radial gradient inline').toEqual([]);
  });

  /**
   * The sweep asserts `[]`, so it passes vacuously if either half stops working: the matcher, or
   * the enumeration feeding it. Both halves are pinned here — an empty `appSources()` is the
   * failure mode a fixtures-only meta-test cannot see.
   */
  it('has a sweep that can actually fail', () => {
    const swept = appSources();

    for (const path of SUN_SITES) {
      expect(swept, `${path} is in the swept population`).toContain(path);
    }
    for (const sun of PRE_MERGE_SUNS) {
      expect(sun.includes(INLINE_RADIAL), sun).toBe(true);
    }
  });
});
