/**
 * Diff-scoped guard for `frontend/.prettierrc` (issue #615, sibling of #529's RV-STYLE-1 guard and
 * #533's plan-doc guard): the config has been advisory since it landed, so files drift from it
 * silently and reviewers pay for it by hand — twice on the record (PR #520, PR #612).
 *
 * **Judges lines, not files.** A file the diff touches is not required to be Prettier-clean; only
 * the lines the diff *added* are. `main` at `5f415a2` carries 1 500 misformatted lines across 200
 * files — 2.3 % of the tree, but spread thin, a median of two hunks per dirty file. A file-scoped
 * gate over that tree would demand an unrelated whole-file reformat on most pull requests, which is
 * exactly the trade PR #612's review refused, and a gate that asks for churn is a gate that gets
 * switched off (#529's lesson, restated by #533's R-2).
 *
 * Scope is `frontend/` alone, because that is where `.prettierrc` lives: `resolveConfig` returns
 * `null` for `scripts/`, `docs/` and `platform/`, so checking them would impose Prettier's
 * *defaults* on three trees that never agreed to them. Rule values are out of scope (#615).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { git, parseAddedLines, rangeFor } from './git-diff.mjs';

/** The one tree `frontend/.prettierrc` governs. */
const SCOPE = 'frontend/';

/** Lines of a hunk the report prints before it starts counting instead. */
const SHOWN_LINES = 6;

/**
 * Above this many LCS cells the line diff stops being worth its memory, and the whole differing
 * region is reported as one hunk instead. Conservative in the safe direction — it over-reports a
 * region rather than missing one — and unreachable in practice: the trim below leaves the common
 * case a handful of lines, and the widest file in the tree differs by 244.
 */
const LCS_CELL_CAP = 4_000_000;

/** True when `.prettierrc` governs this path. */
export function inScope(path) {
  return path.startsWith(SCOPE);
}

/**
 * The hunks of `path` that Prettier would rewrite **and** the diff wrote.
 *
 * @param {{ path: string, current: string, formatted: string, added: Set<number> }} input the file
 *   as it stands, the file as Prettier would write it, and the 1-based lines the diff added
 * @returns {{ path: string, line: number, endLine: number, current: string[], expected: string[] }[]}
 *   one entry per hunk, in file order. A pure insertion carries `current: []` and `endLine` one
 *   below `line` — the empty range before the line the new content belongs above.
 */
export function findMisformatted({ path, current, formatted, added }) {
  if (current === formatted) return [];

  const before = current.split('\n');
  const after = formatted.split('\n');

  return hunksBetween(before, after)
    .filter((hunk) => wasWritten(hunk, added))
    .map((hunk) => ({
      path,
      line: hunk.start + 1,
      endLine: hunk.start + hunk.deleted,
      current: before.slice(hunk.start, hunk.start + hunk.deleted),
      expected: hunk.replacement,
    }));
}

/**
 * True when the diff wrote any line this hunk covers. An insertion covers no line of its own, so it
 * is attributed to the two lines it sits between — writing either of them is what invited it.
 */
function wasWritten(hunk, added) {
  if (hunk.deleted === 0) return added.has(hunk.start) || added.has(hunk.start + 1);
  for (let line = hunk.start + 1; line <= hunk.start + hunk.deleted; line++) {
    if (added.has(line)) return true;
  }
  return false;
}

/**
 * Line-diffs `before` against `after`, returning one hunk per contiguous edit:
 * `{ start, deleted, replacement }`, where `start` is a 0-based index into `before`.
 *
 * The common prefix and suffix are trimmed first. That is not only an optimization — it is what
 * keeps the quadratic middle small enough to matter, since Prettier's output shares almost all of
 * its lines with the input.
 */
export function hunksBetween(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  return alignedHunks(before.slice(start, endBefore), after.slice(start, endAfter), start);
}

/**
 * The edit script between two line arrays, grouped into contiguous hunks and shifted by `offset`.
 * Runs a longest-common-subsequence walk, so an unchanged line inside the differing region splits
 * the region into two hunks rather than swallowing it — which is what lets a pre-existing drift and
 * a freshly-written one in the same file be told apart.
 */
function alignedHunks(before, after, offset) {
  const n = before.length;
  const m = after.length;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > LCS_CELL_CAP) {
    return [{ start: offset, deleted: n, replacement: after.slice() }];
  }

  const width = m + 1;
  const lengths = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] =
        before[i] === after[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const hunks = [];
  let open = null;
  let i = 0;
  let j = 0;

  const openAt = (index) => {
    if (!open) {
      open = { start: index + offset, deleted: 0, replacement: [] };
      hunks.push(open);
    }
    return open;
  };

  while (i < n && j < m) {
    if (before[i] === after[j]) {
      open = null;
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      openAt(i).deleted++;
      i++;
    } else {
      openAt(i).replacement.push(after[j]);
      j++;
    }
  }
  while (i < n) {
    openAt(i).deleted++;
    i++;
  }
  while (j < m) {
    openAt(i).replacement.push(after[j]);
    j++;
  }
  return hunks;
}

/**
 * One file's findings, given a formatter.
 *
 * The formatter is a parameter rather than a direct Prettier call so that the detector's suite can
 * run in the `Repo hygiene (diff-scoped)` job, which installs nothing — nothing in this module's
 * import graph may reach `node_modules`.
 *
 * @param {{ path: string, current: string, added: Set<number>,
 *   format: (path: string, text: string) => Promise<string|null>,
 *   warn: (message: string) => void }} input `format` returns null for a file Prettier does not
 *   handle, and may throw for one it cannot parse
 */
export async function inspect({ path, current, added, format, warn }) {
  let formatted;
  try {
    formatted = await format(path, current);
  } catch (error) {
    warn(`${path}: skipped, Prettier could not parse it (${firstLine(error)})`);
    return [];
  }
  if (formatted === null || formatted === undefined) return [];
  return findMisformatted({ path, current, formatted, added });
}

/** The first line of an error's message — Prettier's parse errors carry a code frame after it. */
function firstLine(error) {
  return String(error?.message ?? error).split('\n')[0];
}

/**
 * Applies exactly the given findings to `current` and returns the result.
 *
 * Bottom-up, so an earlier hunk's replacement cannot shift a later hunk's line numbers. Applying a
 * *subset* of a file's hunks is the point: what the guard reports is what `--fix` rewrites, and a
 * file's pre-existing drift survives untouched.
 */
export function applyHunks(current, findings) {
  const lines = current.split('\n');
  for (const finding of [...findings].sort((a, b) => b.line - a.line)) {
    lines.splice(finding.line - 1, finding.current.length, ...finding.expected);
  }
  return lines.join('\n');
}

const ADVICE =
  'Fix only these lines with `--fix` (`npm run format:check -- --fix` from frontend/). It rewrites\n' +
  "the hunks above and nothing else, so a file's pre-existing drift stays out of your diff (#615).";

/** Renders the findings for a terminal: each hunk as it stands, then as Prettier would write it. */
export function report(findings) {
  const blocks = findings.map((finding) => {
    const at = finding.endLine > finding.line ? `${finding.line}-${finding.endLine}` : finding.line;
    return [
      `  ${finding.path}:${at}`,
      ...side('-', finding.current),
      ...side('+', finding.expected),
    ].join('\n');
  });
  return `Prettier disagrees with lines this diff wrote:\n\n${blocks.join('\n\n')}\n\n${ADVICE}`;
}

function side(marker, lines) {
  const shown = lines.slice(0, SHOWN_LINES).map((line) => `    ${marker} ${line}`);
  const hidden = lines.length - shown.length;
  return hidden > 0 ? [...shown, `    ${marker} … (${hidden} more)`] : shown;
}

/**
 * A formatter backed by the Prettier in `frontend/node_modules`, resolved here rather than imported
 * at the top of the file so that importing this module never needs an install (see `inspect`).
 */
function formatterFor(root) {
  const require = createRequire(pathToFileURL(resolve(root, 'frontend/package.json')));
  let prettier;
  try {
    prettier = require('prettier');
  } catch {
    throw new Error('Prettier is not installed — run `npm ci` in frontend/ first.');
  }

  const ignorePath = resolve(root, 'frontend/.prettierignore');
  const ignore = existsSync(ignorePath) ? { ignorePath } : {};

  return async (path, text) => {
    const absolute = resolve(root, path);
    const info = await prettier.getFileInfo(absolute, { ...ignore, resolveConfig: true });
    if (info.ignored || !info.inferredParser) return null;
    const config = await prettier.resolveConfig(absolute);
    return prettier.format(text, { ...config, filepath: absolute });
  };
}

/** Reads a path from the working tree, or null when it is unreadable (deleted, binary, gone). */
function readText(absolute) {
  try {
    return readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

/** Runs the detector over every in-scope file the diff wrote to. */
async function check({ root, added, format, warn }) {
  const findings = [];

  for (const [path, lines] of added) {
    if (!inScope(path)) continue;
    const current = readText(resolve(root, path));
    if (current === null) continue;
    findings.push(...(await inspect({ path, current, added: lines, format, warn })));
  }
  return findings;
}

/** Rewrites each file the findings name, and returns the paths touched. */
function applyToDisk(root, findings) {
  const byPath = new Map();
  for (const finding of findings) {
    if (!byPath.has(finding.path)) byPath.set(finding.path, []);
    byPath.get(finding.path).push(finding);
  }
  for (const [path, hunks] of byPath) {
    const absolute = resolve(root, path);
    writeFileSync(absolute, applyHunks(readFileSync(absolute, 'utf8'), hunks));
  }
  return [...byPath.keys()];
}

/** git speaks repo-relative POSIX paths; a CLI argument is whatever the caller's shell resolved. */
function toRepoRelative(root, argument) {
  return relative(root, resolve(process.cwd(), argument)).split(sep).join('/');
}

function diffArgs(range) {
  return ['diff', '--unified=0', '--no-color', '--no-ext-diff', ...range];
}

async function main(argv) {
  const fixing = argv.includes('--fix');
  const rest = argv.filter((argument) => argument !== '--fix');
  const mode = rest[0];
  const paths = rest.slice(1);

  if (mode !== '--diff' && !(mode === '--files' && paths.length > 0)) {
    process.stderr.write('usage: check-prettier-format.mjs (--diff [<base>] | --files <path…>) [--fix]\n');
    return 2;
  }

  const root = git(['rev-parse', '--show-toplevel']).trim();
  const range =
    mode === '--diff'
      ? [rangeFor(paths[0] ?? 'origin/main')]
      : ['HEAD', '--', ...paths.map((path) => toRepoRelative(root, path))];
  const warn = (message) => process.stderr.write(`${message}\n`);
  const added = parseAddedLines(git(diffArgs(range)));
  const findings = await check({ root, added, format: formatterFor(root), warn });

  if (findings.length === 0) return 0;
  if (fixing) {
    const rewritten = applyToDisk(root, findings);
    process.stdout.write(`Reformatted the reported hunks in:\n${rewritten.map((path) => `  ${path}`).join('\n')}\n`);
    return 0;
  }
  process.stderr.write(`${report(findings)}\n`);
  return 1;
}

// Only run the CLI when invoked directly; pathToFileURL keeps that true on Windows too.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
