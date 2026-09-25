/**
 * Standing-tree ratchet for §6d's doc-comment budget: the lines over budget may only fall.
 *
 * `check-inline-comments.mjs` gates every doc comment a diff touches; this locks each trim in and
 * covers what a diff never shows as added, such as a renamed file. The baseline is per area so its
 * diff shows where a PR trimmed; the gate is the total, so moving a file between areas is not growth.
 *
 * Usage: `node scripts/check-doc-budget.mjs [--update | --report]`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { findViolations, isBudgeted } from './check-inline-comments.mjs';
import { changedPaths, git, readText, repoRoot } from './git-diff.mjs';

export const BASELINE = 'scripts/doc-budget-baseline.json';

const ROOTS = ['platform/src/main/java', 'frontend/src'];

/** The module or frontend folder a path's excess is booked to. */
export function areaOf(path) {
  const backend = /^platform\/src\/main\/java\/ai\/riviera\/platform\/(?:([^/]+)\/)?/.exec(path);
  if (backend) return `platform/${backend[1] ?? '(root)'}`;
  const frontend = /^frontend\/src\/app\/(?:([^/]+)\/)?/.exec(path);
  if (frontend) return `frontend/${frontend[1] ?? '(app)'}`;
  return path.startsWith('frontend/') ? 'frontend/(src)' : 'platform/(other)';
}

/** Each over-budget doc comment in one source, judged as if the whole file were new. */
export function overBudget(path, text) {
  if (!isBudgeted(path)) return [];
  const lines = text.split('\n');
  const everyLine = new Set(lines.map((_, i) => i + 1));
  return findViolations({ path, lines, added: everyLine }).filter((v) =>
    v.rule.startsWith('docbudget'),
  );
}

/**
 * Lines over budget per area, keys sorted so the baseline diffs cleanly.
 *
 * @param {Iterable<{ path: string, text: string }>} sources
 */
export function tally(sources) {
  const areas = {};
  for (const { path, text } of sources) {
    const excess = overBudget(path, text).reduce((sum, v) => sum + v.excess, 0);
    if (excess > 0) areas[areaOf(path)] = (areas[areaOf(path)] ?? 0) + excess;
  }
  return Object.fromEntries(Object.entries(areas).sort(([a], [b]) => a.localeCompare(b)));
}

export const total = (areas) => Object.values(areas).reduce((sum, n) => sum + n, 0);

/**
 * The verdict on the tree against the baseline: `grew` when the total rose, `stale` when it did
 * not but an area differs, else `ok`. `moved` lists every area that differs, either way.
 */
export function compare(current, baseline) {
  const names = [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort();
  const moved = names
    .map((area) => ({ area, from: baseline[area] ?? 0, to: current[area] ?? 0 }))
    .filter(({ from, to }) => from !== to);
  if (total(current) > total(baseline)) return { verdict: 'grew', moved };
  return { verdict: moved.length > 0 ? 'stale' : 'ok', moved };
}

/** Every budgeted source in the working tree, untracked files included. */
function workingTree() {
  const listed = changedPaths(
    git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...ROOTS]),
  );
  return listed
    .filter(isBudgeted)
    .map((path) => ({ path, text: readText(path) }))
    .filter(({ text }) => text !== null);
}

function readBaseline() {
  const text = readText(BASELINE);
  return text === null ? null : JSON.parse(text);
}

function writeBaseline(areas) {
  const file = `${repoRoot()}/${BASELINE}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(areas, null, 2)}\n`, 'utf8');
}

const describe = (moved) =>
  moved.map(({ area, from, to }) => `  ${area}: ${from} → ${to}`).join('\n');

function report(sources, out) {
  const files = sources
    .map(({ path, text }) => ({
      path,
      excess: overBudget(path, text).reduce((sum, v) => sum + v.excess, 0),
    }))
    .filter(({ excess }) => excess > 0)
    .sort((a, b) => b.excess - a.excess);
  const areas = Object.entries(tally(sources)).sort(([, a], [, b]) => b - a);
  out.write(
    `Doc-comment lines over the §6d budget: ${files.reduce((sum, f) => sum + f.excess, 0)}\n\n`,
  );
  out.write(
    `By area:\n${areas.map(([area, n]) => `  ${String(n).padStart(5)}  ${area}`).join('\n')}\n\n`,
  );
  out.write(
    `Heaviest files:\n${files
      .slice(0, 15)
      .map((f) => `  ${String(f.excess).padStart(5)}  ${f.path}`)
      .join('\n')}\n`,
  );
}

export function main(argv, out = process.stdout, err = process.stderr) {
  const mode = argv[0] ?? '--check';
  if (!['--check', '--update', '--report'].includes(mode)) {
    err.write('usage: check-doc-budget.mjs [--check | --update | --report]\n');
    return 2;
  }
  const sources = workingTree();
  if (mode === '--report') {
    report(sources, out);
    return 0;
  }

  const current = tally(sources);
  const baseline = readBaseline();
  if (baseline === null) {
    if (mode !== '--update') {
      err.write(
        `${BASELINE} is missing: run \`node scripts/check-doc-budget.mjs --update\` to create it.\n`,
      );
      return 1;
    }
    writeBaseline(current);
    out.write(`Wrote ${BASELINE}: ${total(current)} lines over budget.\n`);
    return 0;
  }

  const { verdict, moved } = compare(current, baseline);
  if (verdict === 'grew') {
    err.write(
      `Doc comments over the §6d budget grew from ${total(baseline)} to ${total(current)} lines:\n` +
        `${describe(moved)}\nTrim the doc comments this change lengthened (riviera-java-conventions §6d); ` +
        '`--report` lists the heaviest files. The baseline never rises by --update.\n',
    );
    return 1;
  }
  if (verdict === 'ok') {
    if (mode === '--update') out.write('Baseline already matches the tree.\n');
    return 0;
  }
  if (mode === '--update') {
    writeBaseline(current);
    out.write(
      `Locked in: ${total(baseline)} → ${total(current)} lines over budget.\n${describe(moved)}\n`,
    );
    return 0;
  }
  err.write(
    `${BASELINE} is stale — the tree is at ${total(current)} lines over budget, the baseline says ` +
      `${total(baseline)}:\n${describe(moved)}\nRun \`node scripts/check-doc-budget.mjs --update\` ` +
      'and commit the baseline to lock the progress in.\n',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
