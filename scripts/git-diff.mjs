/**
 * The git and unified-diff helpers the `scripts/check-*.mjs` guards share.
 *
 * Extracted at the third guard (#615), which is the trigger #533's own generalization audit set:
 * with two guards, ten lines of stable git glue did not justify a module that couples two
 * deliberately independent checks; with three, the duplication is the thing that drifts. Nothing
 * here knows what a guard checks — it answers "what did this diff touch, and where" and stops.
 *
 * Dependency-free on purpose: the `Repo hygiene (diff-scoped)` CI job runs the suites with no
 * install step, so a module in this directory may import nothing outside `node:`.
 */

import { execFileSync } from 'node:child_process';

/** Runs git and returns its stdout. Throws (with `stdout` on the error) on a non-zero exit. */
export function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Maps a unified diff to the 1-based line numbers each file gains. Files the diff deletes are
 * absent from the result: they have no new content to check.
 *
 * @param {string} diff output of `git diff --unified=0`
 * @returns {Map<string, Set<number>>} new-side path → added line numbers
 */
export function parseAddedLines(diff) {
  const added = new Map();
  let path = null;
  let next = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      path = target === '/dev/null' ? null : target.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('@@')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      next = hunk ? Number(hunk[1]) : 0;
      continue;
    }
    if (path && next && line.startsWith('+')) {
      if (!added.has(path)) added.set(path, new Set());
      added.get(path).add(next);
      next++;
    }
  }
  return added;
}

/**
 * Splits `git diff --name-only -z` output. The `-z` is not a detail: without it git C-quotes and
 * octal-escapes any path holding a non-ASCII byte (`"src/logo-\360\237\230\200.png"`), and that
 * literal can never match a token, so **every** diff touching such a file failed unconditionally
 * with no way to satisfy the check. Found by PR #538's review.
 */
export function changedPaths(raw) {
  return raw.split('\0').filter(Boolean);
}

/** Resolves the merge base with `base`, falling back to a plain two-dot diff when it has none. */
export function rangeFor(base) {
  try {
    git(['merge-base', base, 'HEAD']);
    return `${base}...HEAD`;
  } catch {
    return base;
  }
}
