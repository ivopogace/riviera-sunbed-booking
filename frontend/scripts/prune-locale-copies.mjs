/**
 * Runs after `ng build`: removes, from each extra locale's directory (`dist/frontend/browser/<subPath>/`),
 * the copies of `public/posters/` and `vendor/` the localized build makes for every locale (ADR-0030).
 * The app names both by absolute path (`/posters/…`, `/vendor/…`), so only the source locale's copy at
 * the root is ever requested, and three copies of the posters would triple their weight in the jar.
 * A build without `localize` has no locale directories, so this does nothing.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = path.join(FRONTEND, 'dist/frontend/browser');
const ROOT_ONLY = ['posters', 'vendor'];

const angular = JSON.parse(readFileSync(path.join(FRONTEND, 'angular.json'), 'utf8'));
for (const [locale, config] of Object.entries(angular.projects.frontend.i18n.locales)) {
  const dir = path.join(BROWSER, config.subPath ?? locale);
  if (!existsSync(dir)) continue;
  for (const copy of ROOT_ONLY) {
    rmSync(path.join(dir, copy), { recursive: true, force: true });
  }
}
