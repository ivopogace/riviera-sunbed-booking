import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POSTER_SET } from './map-poster';

/** The committed set, as `frontend/scripts/render-map-posters.mjs` writes it and the SPA build ships it. */
const POSTERS_DIR = join(process.cwd(), 'public/posters');
/**
 * The set's weight: rendered sharp at quality 80 the phone bucket is ~70 kB at 2× and ~130 kB
 * at 3×, the tablet bucket about twice that; 43 entries come to ~25 MB. Past this, the runbook's
 * levers apply (the tablet 3× first), never a raised budget.
 */
const BUDGET_BYTES = 40_000_000;

/**
 * CI's hold on the poster set: every catalogue entry has its stills, so a region or beach added
 * to the catalogue without a regeneration fails here rather than as a broken image on a phone.
 */
describe('the poster set', () => {
  it('has a still for every catalogue region and beach, at every bucket and density', () => {
    const missing = POSTER_SET.map((poster) => poster.file).filter(
      (file) => !existsSync(join(POSTERS_DIR, file)),
    );
    expect(missing, 'regenerate: npm run posters (docs/runbooks/riviera-map-tiles.md)').toEqual([]);
  });

  it('holds nothing the catalogue does not name', () => {
    const named = new Set(POSTER_SET.map((poster) => poster.file));
    const stray = readdirSync(POSTERS_DIR).filter((file) => !named.has(file));
    expect(stray).toEqual([]);
  });

  it('stays under its budget', () => {
    const bytes = readdirSync(POSTERS_DIR)
      .map((file) => statSync(join(POSTERS_DIR, file)).size)
      .reduce((sum, size) => sum + size, 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });
});
