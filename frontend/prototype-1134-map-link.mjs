/**
 * THROWAWAY PROTOTYPE (issue #1134) — link the built riviera map assets into `public/` so the dev
 * server can serve `/map/**` itself and the prototype runs the REAL MapLibre map with no backend.
 *
 * Angular refuses an `assets` entry outside the workspace root ("must be within the workspace
 * root"), so the 60 MB `platform/map` directory is linked rather than copied or configured. The
 * link is gitignored and only ever created by `npm run prototype:1134`.
 */
import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const link = resolve(here, 'public/map');
const target = resolve(here, '../platform/map');

if (!existsSync(target)) {
  console.error(`No map assets at ${target} — run scripts/build-riviera-map.sh first.`);
  process.exit(1);
}

if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) {
  console.log('public/map already linked.');
} else {
  symlinkSync(target, link, 'junction');
  console.log(`Linked public/map -> ${target}`);
}
