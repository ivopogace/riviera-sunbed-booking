import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for `--riv-sun-grad` — the one sun (#882).
 *
 * <p>The tree carried three, and #882 named two of them. Re-running its own enumeration — every
 * image built inline in a class expression — returned a third that the issue had filed as
 * per-site: `venue-map`'s photo-band empty state. That one shares the home card's ROLE exactly
 * (`photos.length === 0`, over `--riv-photo-grad`, under `--riv-photo-scrim`, anchored top-42%
 * centred), so the three split 1/2 by role rather than 2 by value, and the pairing the issue
 * proposed was not the one the code had.
 *
 * <p>They are one declaration now for the reason `--riv-premium-grad` and `--riv-walkin-hatch`
 * are: a mirror stays a mirror only while there is one thing to mirror. The value is the map's,
 * because it was the only one already tuned against the cyan it sits on — the card's translucent
 * stops composited to rgb(117,162,126) over that gradient, an olive orb rather than a sun, which
 * is exactly the "flat pale-green blob" #704 diagnosed and fixed at the map alone.
 *
 * <p>THEME-INVARIANT, on #704's ground generalized: every stop is opaque, so the sun composites
 * against nothing and cannot take a themed backdrop's colour. That matters here because one of
 * the backdrops really does theme — `--riv-photo-grad` has a dark override — so the translucent
 * form was not merely wrong once, it was wrong differently per theme. jsdom maths cannot see an
 * override added later, so the declaration assertions read `src/tailwind.css` as text; the
 * cascade's own verdict is `e2e/sun-token.e2e.ts`.
 *
 * <p>It lives in `shared/` because the population it sweeps is tree-wide — the root shell,
 * `pages/home` and `venue` — the same reason `class-o-tint-tokens.contrast.spec.ts` does.
 */

/** Vitest runs with cwd = `frontend/`. */
const APP = join(process.cwd(), 'src/app');

/** #704's values, the ones the merged token adopts, as a known-good literal rather than a re-read. */
const SUN =
  'radial-gradient(circle at 38% 30%, #fff6da 0%, #ffd97a 42%, #f6b23f 76%, #e89a26 100%)';

/**
 * A radial gradient built inline in a class expression — the MECHANISM #882's audit enumerated by,
 * narrowed to the shape a sun takes. Matching the mechanism rather than the amber stops is what
 * returned the third sun: the two the issue named share a notation, and the one it missed does not.
 */
const INLINE_RADIAL = 'bg-[radial-gradient(';

/** The three inline suns as they stood before the merge, verbatim — the meta-test's fixtures. */
const PRE_MERGE_SUNS = [
  'bg-[radial-gradient(circle_at_34%_30%,#ffe6a3,#f0aa2e_70%)]',
  'bg-[radial-gradient(circle_at_34%_30%,rgba(255,236,180,0.95),rgba(240,170,46,0.5)_72%)]',
  'bg-[radial-gradient(circle_at_38%_30%,#fff6da_0%,#ffd97a_42%,#f6b23f_76%,#e89a26_100%)]',
];

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

  /**
   * The value is asserted against #704's literal, not against whatever the stylesheet happens to
   * say: adopting the map's paint is the decision, and a test re-reading the declaration to
   * compare it with itself could not disagree with a later edit.
   *
   * <p>Whitespace is collapsed first because Prettier owns the line breaks — it wraps a gradient
   * this long across lines, as it already does `--riv-photo-scrim`. The stops are the claim here;
   * where the formatter puts the newlines is not.
   */
  it('carries the map band values — the ones already tuned against the sea gradient', () => {
    expect(unwrapped(declarationsOf('--riv-sun-grad')[0])).toBe(SUN);
  });

  it('no source rebuilds a sun inline', () => {
    const rebuilt = appSources().filter((path) =>
      readFileSync(join(APP, path), 'utf8').includes(INLINE_RADIAL),
    );

    expect(rebuilt, 'sources building a radial gradient inline').toEqual([]);
  });

  /**
   * The sweep above asserts `[]`, so a pattern that stopped matching would pass it silently — the
   * fails-OPEN trap `class-o-tint-tokens.contrast.spec.ts` records hitting while it was written.
   * These are the three literals the sweep existed to find; if it cannot see them it is broken.
   */
  it('has a sweep that can actually fail', () => {
    for (const sun of PRE_MERGE_SUNS) {
      expect(sun.includes(INLINE_RADIAL), sun).toBe(true);
    }
  });
});
