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
 *
 * **Every git call is made from the repository root with path output pinned.** Three ways a guard
 * can otherwise report a false clean, all found by PR #618's review and all fixed here rather than
 * three times over: a pathspec resolves against the *caller's* cwd (so `npm run format:check`, which
 * runs in `frontend/`, matched nothing), `diff.relative=true` in a contributor's config strips the
 * leading directory from every path (so a `frontend/` scope test rejects them all), and a path
 * holding a non-ASCII byte comes back C-quoted (`"b/src/caf\303\251.ts"`) and matches nothing at
 * all — the same defect PR #538 fixed for `changedPaths`, one function below, and which this module
 * inherited for the `+++` headers.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Pinned on every invocation, because each of these is a contributor-config setting that silently
 * re-spells the paths a guard keys on — and a guard that cannot recognise a path reports **clean**.
 * `core.quotepath` C-quotes any non-ASCII byte; `diff.mnemonicPrefix` swaps `a/`/`b/` for `w/`,
 * `i/`, `c/`; `diff.noprefix` drops the prefix entirely. All three found by PR #618's review.
 */
const PIN = [
  '-c',
  'core.quotepath=false',
  '-c',
  'diff.mnemonicPrefix=false',
  '-c',
  'diff.noprefix=false',
];

let root = null;

function run(args, cwd) {
  return execFileSync('git', [...PIN, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The repository root, resolved once from wherever the process happens to be. */
export function repoRoot() {
  if (root === null) root = run(['rev-parse', '--show-toplevel']).trim();
  return root;
}

/** Runs git **from the repository root** and returns its stdout. */
export function git(args) {
  return run(args, repoRoot());
}

/** The diff invocation the guards share: no context, no colour, no cwd-relative paths. */
export function diffArgs(...rest) {
  return ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-relative', ...rest];
}

/** The name-only form of the same invocation; `-z` so a non-ASCII path survives (PR #538). */
export function nameOnlyArgs(...rest) {
  return ['diff', '--name-only', '-z', '--no-color', '--no-ext-diff', '--no-relative', ...rest];
}

/**
 * Maps a unified diff to the 1-based line numbers each file gains. Files the diff deletes are
 * absent from the result: they have no new content to check.
 *
 * `+++` is honoured only **between** hunks, and every `diff --git` closes the file before it. An
 * added line whose content begins with `++ ` is emitted as `+++ …`, which is indistinguishable from
 * a header by prefix alone — a plan doc quoting a diff was enough to re-target every following added
 * line onto a file that does not exist, and to leave the real file's lines unchecked (PR #618).
 *
 * @param {string} diff output of `git diff --unified=0`
 * @returns {Map<string, Set<number>>} new-side path → added line numbers
 */
export function parseAddedLines(diff) {
  const added = new Map();
  let path = null;
  let next = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      path = null;
      next = 0;
      continue;
    }
    if (next === 0 && line.startsWith('+++ ')) {
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

/**
 * The merge base with `base`, or `base` itself when there is none.
 *
 * Diffing a *commit* rather than a `a...b` range is what puts the **working tree** on the new side,
 * which is the side the guards read their file content from. With `…...HEAD` the two drift apart the
 * moment anything is uncommitted — including a guard's own `--fix` — and line numbers from one are
 * then applied to the other (PR #618).
 */
export function mergeBase(base) {
  try {
    return git(['merge-base', base, 'HEAD']).trim();
  } catch {
    return base;
  }
}

/** Reads a repo-relative path from the working tree, or null when it is unreadable. */
export function readText(path) {
  try {
    return readFileSync(`${repoRoot()}/${path}`, 'utf8');
  } catch {
    return null;
  }
}
