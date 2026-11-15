import { readdirSync } from 'node:fs';

/**
 * Every file and folder under `root`, relative to it, with `/` separators on every OS.
 * `readdirSync(..., { recursive: true })` yields `\` on Windows, which no sweep's
 * forward-slash literal (`shared/x.ts`, `/operator/`) would match.
 */
export function recursivePaths(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' }).map((path) =>
    path.replaceAll('\\', '/'),
  );
}
