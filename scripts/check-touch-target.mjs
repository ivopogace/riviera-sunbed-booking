/**
 * Diff-scoped guard for the 44 × 44 px touch-target floor's **declaration**, the static half
 * of the mechanism `riviera-tailwind` describes.
 *
 * - **TT-1** — a judged control declares neither `appTouchTarget` nor a `data-touch-exempt` on
 *   itself or an ancestor. It cannot know whether the rendered box is 44 px; it knows whether
 *   anyone decided.
 *
 * `<a>` is deliberately **out of scope**: `min-height` is a no-op on a `display: inline` box, so a
 * directive on a link is a declaration that can be false, and marking the app's 53 undeclared links
 * would manufacture exactly that. Links stay `frontend/e2e/touch-targets*.e2e.ts`'s and RV-FE's job.
 * The same posture `check-focus-posture.mjs` takes with the `<input>` kinds `readonly` cannot lock:
 * cover what the predicate judges exactly, and say plainly what is out of reach.
 *
 * The complement, never the replacement: only the e2e sweep measures a rendered box, and it caught
 * every #605 finding that mattered. This proves the mechanism reaches surfaces no sweep visits.
 */

import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  changedPaths,
  diffArgs,
  git,
  resolveBase,
  parseAddedLines,
  readText,
  repoRoot,
} from './git-diff.mjs';
import { adviser, report, tally } from './guard-report.mjs';
import {
  maskBlockExpressions,
  maskHtmlComments,
  typescriptRegions,
  walkTags,
} from './inline-template.mjs';

/** Angular templates only; a spec's fixtures are allowed to build the non-compliant forms. */
const IN_SCOPE = /^frontend\/src\/app\/.*(?<!\.spec)\.(ts|html)$/;

/** The controls whose floor a static rule can judge — see the header on why `<a>` is absent. */
const JUDGED = new Set(['button', 'input', 'select', 'textarea']);

/**
 * Finds every undeclared control the diff wrote in one file.
 *
 * <p>An exemption is inherited, because that is how the shipped markup expresses it: `auth-page.ts`
 * puts the reason on the `<p>` that *is* the sentence and leaves the `<button>` inside it bare. So
 * the walk carries a stack rather than judging each tag alone.
 *
 * <p>An incomplete start tag (`readAttributes`) is skipped: it is a phantom such as `{{ n<div }}`'s.
 * Judged, one named for a control fails a build on a line holding none (#529); pushed, it takes a
 * real ancestor's end tag and leaves that ancestor's exemption open over what follows (#1478).
 *
 * @param {{ path: string, lines: string[], added: Set<number> }} input the file's new content and
 *   the 1-based line numbers the diff added
 * @returns {{ path: string, line: number, rule: string, text: string }[]} one entry per violation
 */
export function findViolations({ path, lines, added }) {
  return templateRegions(path, lines).flatMap(({ region, stop }) =>
    regionViolations(path, lines, added, region, stop),
  );
}

/** One template's violations, on a stack of its own: an element left open reaches no other. */
function regionViolations(path, lines, added, region, stop) {
  const violations = [];
  const open = [];

  for (const tag of walkTags(maskBlockExpressions(region, stop))) {
    if (tag.kind === 'close') {
      const at = open.findLastIndex((element) => element.name === tag.name);
      if (at !== -1) open.length = at;
      continue;
    }
    if (tag.incomplete) continue;
    const exempt = tag.attributes.has('data-touch-exempt');
    const rule = added.has(tag.line) ? ruleBroken(tag, open) : null;
    if (rule !== null) {
      violations.push({ path, line: tag.line, rule, text: lines[tag.line - 1].trim() });
    }
    if (encloses(tag)) open.push({ name: tag.name, exempt });
  }
  return violations;
}

/**
 * Whether a start tag opens a scope: any that is not self-closed. The walk emits a close entry
 * wherever Angular ends the element, its own end tag or an implicit one (a void element at the next
 * token, a `<p>` at the child that closes it, an `<li>` at its block's `}`), so the scope ends
 * there.
 */
function encloses(tag) {
  return !tag.selfClosed;
}

/**
 * TT-2 for an exemption that gives no reason, TT-1 for an undeclared control, else null. A control is
 * a `JUDGED` name built in the HTML namespace (`html`): `<xhtml:button>` is one, `<svg:button>` and
 * a bare `<button>` inside `<svg>` none.
 */
function ruleBroken(tag, open) {
  const marker = tag.attributes.get('data-touch-exempt');
  if (marker !== undefined) return marker.value.trim() === '' ? 'TT-2' : null;
  const declared =
    tag.attributes.has('appTouchTarget') || open.some((element) => element.exempt);
  return tag.html && JUDGED.has(tag.name) && !declared ? 'TT-1' : null;
}

/**
 * The file's templates, each with everything that is not its markup blanked, keeping line and
 * column geometry so a violation still reports its real position, and an inline one with its
 * `unread` position as the `stop` its tag walk's mask takes.
 *
 * An `.html` file is one template, all of it but its comments; a `.ts` file holds one per
 * `template:` literal, its comments blanked by `typescriptRegions`. Without the second,
 * `touch-target.ts`'s own TSDoc — which spells out `<button appTouchTarget>` to document the
 * convention — would read as markup.
 */
function templateRegions(path, lines) {
  if (path.endsWith('.html')) return [{ region: maskHtmlComments(lines) }];
  const { templates, unread } = typescriptRegions(lines);
  return templates.map((region, n) => ({ region, stop: unread[n] }));
}

/**
 * Runs the detector over every in-scope file a diff touches.
 *
 * @param {string[]} range arguments describing the diff, e.g. `['<merge-base>']`
 */
export function check(range) {
  return [...parseAddedLines(git(diffArgs(...range)))].flatMap(([path, added]) =>
    checkOne(path, added),
  );
}

/**
 * Checks explicit paths against `HEAD`, judging an **untracked** file whole.
 *
 * A new file has no diff against `HEAD`, so the plain diff path reported it clean — and a new
 * component is exactly how an undeclared control enters the tree, on the `Write` the hook fires for.
 *
 * @param {string[]} paths repo-relative paths
 * @param {{ tracked?: (paths: string[]) => Set<string>, read?: (path: string) => string | null,
 *   diff?: (paths: string[]) => Map<string, Set<number>> }} [seams] injection points for the test
 *   suite; all three hit git or disk by default
 */
export function checkPaths(paths, seams = {}) {
  const { tracked = trackedAmong, read = readText, diff = diffedLines } = seams;
  const known = tracked(paths);
  const added = known.size === 0 ? new Map() : diff([...known]);
  return paths.flatMap((path) =>
    known.has(path)
      ? checkOne(path, added.get(path) ?? new Set(), read)
      : checkOne(path, null, read),
  );
}

function diffedLines(paths) {
  return parseAddedLines(git(diffArgs('HEAD', '--', ...paths)));
}

/**
 * One `git ls-files` for the whole set. `--error-unmatch` per path would fork N processes and print
 * git's "did you forget to 'git add'?" to stderr for every new file — telling the author the guard
 * failed when it worked. An empty set short-circuits, since a bare `ls-files` lists the repository.
 */
function trackedAmong(paths) {
  if (paths.length === 0) return new Set();
  return new Set(changedPaths(git(['ls-files', '-z', '--', ...paths])));
}

/** The whole-tree audit `--all` runs; never a gate, since it judges lines no diff added. */
export function sweep() {
  return appPaths().flatMap((path) => checkOne(path, null));
}

let appPathsIndex;
function appPaths() {
  appPathsIndex ??= changedPaths(git(['ls-files', '-z', 'frontend/src/app']));
  return appPathsIndex;
}

/** Checks one path; `added` of null lifts the diff scoping, which is what `sweep()` wants. */
function checkOne(path, added, read = readText) {
  if (!IN_SCOPE.test(path)) return [];
  const text = read(path);
  if (text === null) return [];
  const lines = text.split('\n');
  return findViolations({ path, lines, added: added ?? new Set(lines.map((_, i) => i + 1)) });
}

const ADVICE = {
  'TT-1':
    'TT-1: an interactive control that declares neither the 44x44 floor nor an exemption ' +
    '(WCAG 2.5.5). Add [appTouchTarget] from shared/touch-target.ts — and pair it with ' +
    '`inline-flex items-center` if the element is inline, where min-height is a no-op. If the ' +
    'control is genuinely exempt, say why in data-touch-exempt="<reason>", on it or on the ' +
    'ancestor that is the sentence. This rule cannot see a rendered box: only ' +
    'frontend/e2e/touch-targets*.e2e.ts measures that, and it stays the proof. <a> is out of ' +
    'scope entirely. See frontend/.claude/CLAUDE.md.',
  'TT-2':
    'TT-2: a data-touch-exempt with no reason. The reason string is the whole point of marking ' +
    'rather than assuming — an unexplained exemption is the drift the floor exists to stop. The ' +
    'reason names one of the sanctioned classes listed in the riviera-tailwind skill, rule 4; ' +
    'anything else that "cannot" meet the floor is a layout to fix.',
};

const advise = adviser(ADVICE);

/** Both rules gate: each is element names and attributes, with no runtime property approximated. */
export function settle(violations, headline, err = process.stderr) {
  if (violations.length === 0) return 0;
  err.write(`${headline}:\n${report(violations)}\n${advise(violations)}\n`);
  return 1;
}

/** git runs from the repository root, so a pathspec has to be expressed from there too. */
function toRepoRelative(argument) {
  return relative(repoRoot(), resolve(process.cwd(), argument)).split(sep).join('/');
}

function main(argv) {
  const mode = argv[0];

  if (mode === '--hook') {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const path = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
    if (!path) return 0;
    const edited = toRepoRelative(path);
    if (!IN_SCOPE.test(edited)) return 0;
    const violations = checkPaths([edited]);
    if (violations.length === 0) return 0;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Touch-target declarations written by this edit:\n${report(violations)}\n${advise(violations)}`,
        },
      }),
    );
    return 0;
  }

  // An explicit request judges the named files whole; skipping committed ones would read as clean.
  if (mode === '--files') {
    const paths = argv.slice(1).map(toRepoRelative);
    return settle(
      paths.flatMap((path) => checkOne(path, null)),
      'Touch-target declarations',
    );
  }

  if (mode === '--diff') {
    const { base, error } = resolveBase(argv[1] ?? 'origin/main');
    if (error) {
      process.stderr.write(`${error}\n`);
      return 2;
    }
    return settle(check([base]), 'Touch-target declarations written by this diff');
  }

  if (mode === '--all') {
    process.stdout.write(tally(sweep(), ['TT-1', 'TT-2']));
    return 0;
  }

  process.stderr.write(
    'usage: check-touch-target.mjs (--diff <base> | --files <path…> | --all | --hook)\n',
  );
  return 2;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
