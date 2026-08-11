/**
 * Diff-scoped guard for the plan doc's **File structure** section (issue #533, sibling of #529's
 * RV-STYLE-1 guard): every path a slice changes should be listed there, because that section is
 * what a resuming session reads to know what the slice touches.
 *
 * Reports one direction only — **in the diff, absent from the section**. The reverse (a path the
 * plan listed and the work turned out not to need) is legitimate drift and is never reported; a
 * plan is written before the work.
 *
 * A slice with no plan doc passes cleanly: `riviera-sdlc` rule 6 lets a one-line fix skip the plan
 * doc entirely, and a guard must not invent a requirement the SDLC does not make.
 */

import { pathToFileURL } from 'node:url';

import { changedPaths, git, mergeBase, nameOnlyArgs, readText } from './git-diff.mjs';

/** The heading that opens the section, as the plan-doc template writes it. */
const HEADING = /^##\s+File structure\s*$/i;

/**
 * Returns the lines under `## File structure` up to the next `## ` heading, or null when the doc
 * has no such section. `---` rules and `### ` sub-headings stay inside — only a sibling heading
 * closes it.
 */
export function sectionOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** A backticked span that could be a path: no spaces, and a file extension. `*` allowed. */
const PATH_LIKE = /^[\w@.][\w./@*-]*\.[A-Za-z0-9]+$/;

/** A backticked span naming a directory, e.g. `frontend/src/app/venue-admin/`. */
const DIR_LIKE = /^[\w@.][\w./@*-]*\/$/;

/** An extension-less dotfile, e.g. `.nvmrc`. */
const DOTFILE = /^\.[A-Za-z0-9][\w-]*$/;

/** A bare extension, e.g. `.html` or `.a11y.spec.ts` — a sibling of the path written before it. */
const SIBLING_EXT = /^\.[A-Za-z0-9][\w.]*$/;

/** True when a token denotes a file or directory rather than prose. */
function isPath(token) {
  return PATH_LIKE.test(token) || DIR_LIKE.test(token) || DOTFILE.test(token);
}

/** `privacy-policy.ts` + `.a11y.spec.ts` → `privacy-policy.a11y.spec.ts`. */
function siblingOf(base, extension) {
  return base.replace(/\.[^./]*$/, '') + extension;
}

/**
 * A bare filename written after a path on the same line means the file *next to* it —
 * `frontend/src/app/app.html` + `app.spec.ts` is that directory's spec, not every `app.spec.ts` in
 * the tree. Anything already carrying a `/` is left alone.
 */
function beside(base, token) {
  if (token.includes('/')) return token;
  const directory = base.slice(0, base.lastIndexOf('/') + 1);
  return `${directory}${token}`;
}

/** `frontend/e2e/{a,b}.e2e.ts` → one entry per alternative; recursive, so nesting works. */
function expandBraces(token) {
  const braces = /^(.*?)\{([^{}]*)\}(.*)$/.exec(token);
  if (!braces) return [token];
  const [, before, alternatives, after] = braces;
  return alternatives.split(',').flatMap((one) => expandBraces(`${before}${one.trim()}${after}`));
}

/**
 * `venue-create-card.ts|.html` → both files. An alternative that starts with `.` is a sibling
 * extension of the first one; anything else is a path in its own right.
 */
function expandPipes(token) {
  if (!token.includes('|')) return [token];
  const [first, ...rest] = token.split('|');
  return [first, ...rest.map((one) => (one.startsWith('.') ? siblingOf(first, one) : one))];
}

/**
 * Every path a File-structure section names, in source order.
 *
 * Parsed line by line because one real idiom is positional: a bare extension attaches to the path
 * written before it *on the same line* (`` `privacy-policy.ts`/`.html` ``). Bullets that carry only
 * prose in backticks — a method name, an HTTP route — contribute nothing, since no pattern above
 * matches them.
 *
 * A leading dot alone does not mean "extension": `.github/workflows/ci.yml` is a path and `.nvmrc`
 * is a file, while `.spec.ts` is a sibling only because a path precedes it on the line. The `/` and
 * that preceding path are what separate the three.
 */
export function listedPaths(section) {
  const listed = [];

  for (const line of section.split('\n')) {
    let previous = null;

    for (const [, span] of line.matchAll(/`([^`\n]+)`/g)) {
      const token = span.trim();

      if (previous && SIBLING_EXT.test(token)) {
        listed.push(siblingOf(previous, token));
        continue;
      }
      for (const candidate of expandBraces(token).flatMap(expandPipes)) {
        if (!isPath(candidate)) continue;
        listed.push(previous ? beside(previous, candidate) : candidate);
        if (!candidate.endsWith('/')) previous = candidate;
      }
    }
  }
  return listed;
}

/**
 * RegExp metacharacters that must be escaped to stay literal. A `Set` membership test rather than
 * `String#replace`, which without `/g` escapes only the first match — correct here only by accident
 * of being handed one character at a time, and flagged as such by CodeQL on PR #538.
 */
const RESERVED = new Set([...'.+^${}()|[]\\?']);

/**
 * Compiles a listed token into a RegExp body: `**` crosses directory boundaries, a single `*` stays
 * within one segment, and every other character is literal. Scanned rather than chain-replaced so
 * that the widened forms cannot themselves be re-read as wildcards.
 */
function globBody(token) {
  let body = '';

  for (let i = 0; i < token.length; ) {
    if (token.startsWith('**/', i)) {
      body += '(?:[^/]*/)*';
      i += 3;
    } else if (token.startsWith('**', i)) {
      body += '.*';
      i += 2;
    } else if (token[i] === '*') {
      body += '[^/]*';
      i += 1;
    } else {
      body += RESERVED.has(token[i]) ? `\\${token[i]}` : token[i];
      i += 1;
    }
  }
  return body;
}

/**
 * True when a listed token denotes `path`.
 *
 * A token may be written repo-relative — real sections shorten
 * `platform/src/test/java/ai/riviera/platform/payout/application/DailyTakingsServiceTest.java` to
 * its last two packages — so a suffix counts, but only on a `/` boundary: `venue-map.ts` must not
 * be satisfied by `admin-venue-map.ts`.
 *
 * Shortening all the way to a bare filename is idiomatic here too, and stays allowed — see
 * `usable` for the one case it is not.
 */
function covers(token, path) {
  if (token.endsWith('/')) return path.startsWith(token) || path.includes(`/${token}`);
  if (token.includes('*')) return new RegExp(`(^|/)${globBody(token)}$`).test(path);
  return path === token || path.endsWith(`/${token}`);
}

/**
 * Drops the listed tokens that are too vague to mean anything.
 *
 * A token with no `/` carries no directory context, so if it matches **more than one** path in this
 * diff it has not identified either of them — `index.ts` cannot stand for both
 * `booking/index.ts` and `unrelated/index.ts`. Dropping it reports both, which is the right answer:
 * the section did not say which. Matching exactly one path is the common idiom (a plan doc naming
 * `SecurityConfig.java`) and stays covered — the floor has to sit here rather than at "must contain
 * a `/`", because that stricter rule false-flags eleven legitimately-named files on PR #516 alone,
 * and a noisy gate is one that gets switched off (R-2).
 *
 * <p>Judged for the **general** cover only. A token that exactly equals a changed path settles that
 * path directly (see `findOmissions`) and never needs this: a repo-root file is written bare because
 * nothing qualifies it, so counting suffix matches made root `CLAUDE.md` unlistable whenever a diff
 * also touched `frontend/.claude/CLAUDE.md`.
 *
 * <p>A **rooted** directory token is exempt from the count — covering several files is its job, and
 * stripping its only slash before the `/` test left a top-level `scripts/` with no spelling that
 * could work — but only over its **direct children**. Without that floor `frontend/` satisfies the
 * guard for the whole app, which defeats the point: a resuming session learns nothing from a
 * four-character token. An *unrooted* one (`components/` matching two trees) is still ambiguous.
 */
function usable(token, changed) {
  if (token.includes('*')) return true;
  if (token.replace(/\/$/, '').includes('/')) return true;
  if (token.endsWith('/') && changed.some((path) => path.startsWith(token))) {
    return changed
      .filter((path) => covers(token, path))
      .every((path) => !path.slice(token.length).includes('/'));
  }
  return changed.filter((path) => covers(token, path)).length <= 1;
}

/**
 * Paths never worth reporting. The plan docs themselves are self-evident to anyone reading one,
 * and a lockfile is a tool's output rather than a file the author chose to touch.
 */
function isExempt(path, docs) {
  return docs.some((d) => d.path === path) || /(^|\/)package-lock\.json$/.test(path);
}

/**
 * Paths a slice changed that its plan doc's File-structure section does not account for.
 *
 * @param {{ docs: { path: string, text: string }[], changed: string[] }} input the plan docs the
 *   diff touches (new-side content) and every path it changed
 * @returns {{ path: string, reason: string }[]} one entry per unlisted path, in diff order
 */
export function findOmissions({ docs, changed }) {
  if (docs.length === 0) return [];

  const sections = docs.map((d) => sectionOf(d.text));
  const listed = sections.filter((section) => section !== null).flatMap(listedPaths);
  const general = listed.filter((token) => usable(token, changed));
  const reason = sections.every((section) => section === null)
    ? 'no "## File structure" section'
    : 'not listed in the File structure section';

  return changed
    .filter((path) => !isExempt(path, docs))
    .filter((path) => !listed.includes(path))
    .filter((path) => !general.some((token) => covers(token, path)))
    .map((path) => ({ path, reason }));
}

/**
 * The plan docs among a diff's paths: top-level markdown under `docs/plans/`. A per-slice asset
 * directory (`docs/plans/<slug>/screenshot.png`) is content the section should list, not a plan.
 */
export function planDocsIn(changed) {
  return changed.filter((path) => /^docs\/plans\/[^/]+\.md$/.test(path));
}

const ADVICE =
  'Add each path above to the plan doc\'s "## File structure" section — that section is what a ' +
  'resuming session reads to know what the slice touches, so an omission misleads exactly the ' +
  'reader it exists for (issue #533). A directory or a glob may stand in for a large mechanical ' +
  'sweep. A slice with no plan doc is not checked at all.';

/** Renders the findings for a terminal: one line per path, then the fix. */
export function report(omissions) {
  const lines = omissions.map((o) => `  ${o.path}  — ${o.reason}`);
  return `Paths changed by this diff but absent from the plan doc:\n${lines.join('\n')}\n${ADVICE}`;
}

/**
 * Runs the detector over a diff.
 *
 * Plan docs are read from the **working tree**, not from the diff: the section is judged as it
 * stands now, which is also what the author is about to fix. A doc the diff deletes reads as null
 * and drops out.
 */
export function check(range) {
  const changed = changedPaths(
    git(nameOnlyArgs(range)),
  );

  const docs = planDocsIn(changed)
    .map((path) => ({ path, text: readText(path) }))
    .filter((d) => d.text !== null);

  return findOmissions({ docs, changed });
}

function main(argv) {
  if (argv[0] !== '--diff') {
    process.stderr.write('usage: check-plan-file-structure.mjs --diff [<base>]\n');
    return 2;
  }
  const omissions = check(mergeBase(argv[1] ?? 'origin/main'));
  if (omissions.length === 0) return 0;
  process.stderr.write(`${report(omissions)}\n`);
  return 1;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
// pathToFileURL, not a `file://` template: no Windows path matches one, silencing the CLI there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
