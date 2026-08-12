/**
 * Diff-scoped guard for RV-STYLE-1: an inline comment is one line, or it is not written
 * (`riviera-java-conventions` §6c, `frontend/.claude/CLAUDE.md`, review-bank item RV-STYLE-1).
 *
 * Reasons about lines a diff **added**, for anything git already tracks. The existing tree carries
 * many pre-existing multi-line inline comments that read as established convention in their own
 * files; a repo-wide gate would go red on day one and get switched off (issue #529). A file git has
 * never seen is judged whole instead — see `checkPaths` (#619).
 *
 * Exempt by design: doc comments (`/** … *\/`, TSDoc — the rule's own carve-out), a block
 * comment standing before any code as the file's header, and `#`/SQL-`--` comment syntaxes
 * (see the plan doc's Non-goals; #522/F-6 settled SQL).
 */

import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  changedPaths,
  diffArgs,
  git,
  mergeBase,
  parseAddedLines,
  readText,
  repoRoot,
} from './git-diff.mjs';

/**
 * Per-extension comment syntax. An extension absent from this map is not checked at all.
 *
 * - `line` — the line-comment marker, or null where the language has none (plain CSS).
 * - `block` — supports `/* … *\/`, and therefore `/** … *\/` doc comments.
 * - `html` — supports `<!-- … -->`.
 * - `textBlock` — Java `"""` text blocks, whose contents must not be scanned for markers.
 */
const SYNTAX = {
  '.java': { line: '//', block: true, textBlock: true },
  '.ts': { line: '//', block: true },
  '.tsx': { line: '//', block: true },
  '.js': { line: '//', block: true },
  '.mjs': { line: '//', block: true },
  '.cjs': { line: '//', block: true },
  '.scss': { line: '//', block: true },
  '.css': { line: null, block: true },
  '.html': { line: null, block: false, html: true },
};

/** Returns the comment syntax for a path, or null when the file is out of scope. */
export function syntaxFor(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? null : (SYNTAX[path.slice(dot).toLowerCase()] ?? null);
}

/**
 * Finds every multi-line inline comment the diff wrote.
 *
 * @param {{ path: string, lines: string[], added: Set<number> }} input the file's new content,
 *   plus the 1-based line numbers the diff added
 * @returns {{ path: string, line: number, endLine: number, text: string }[]} one entry per block
 */
export function findViolations({ path, lines, added }) {
  const syntax = syntaxFor(path);
  if (!syntax) return [];

  const regions = scan(lines, syntax);
  const violations = [];

  for (const region of regions) {
    if (region.kind === 'line') continue;
    if (region.endLine === region.startLine) continue;
    if (region.isDoc || region.isFileHeader) continue;
    if (!added.has(region.startLine + 1)) continue;
    violations.push(violationAt(path, lines, region.startLine, region.endLine));
  }
  for (const run of addedLineRuns(regions, added)) {
    violations.push(violationAt(path, lines, run.startLine, run.endLine));
  }
  return violations.sort((a, b) => a.line - b.line);
}

function violationAt(path, lines, startLine, endLine) {
  return { path, line: startLine + 1, endLine: endLine + 1, text: lines[startLine].trim() };
}

/**
 * Groups the whole-line comments **the diff added** into maximal consecutive runs, and keeps the
 * runs longer than one line.
 *
 * The added-only restriction is the diff-scoping guarantee, and it is not a detail: grouping every
 * adjacent comment line and then asking whether any of them was added blames a pre-existing block
 * for the one compliant one-liner a diff parks beneath it — reporting a span, and quoting text,
 * the author never wrote. In a tree that carries many such blocks by design, that false positive
 * is exactly how a gate gets switched off (issue #529).
 *
 * The cost is a deliberate false negative: appending a second line to a comment that was already
 * there reads as a one-line addition. A diff that *rewrites* the comment — which is what the #522
 * regression did — adds both lines and is still caught.
 */
function addedLineRuns(regions, added) {
  const runs = [];
  let current = null;

  for (const region of regions) {
    const eligible =
      region.kind === 'line' && region.wholeLine && added.has(region.startLine + 1);
    if (eligible && current && region.startLine === current.endLine + 1) {
      current.endLine = region.startLine;
      continue;
    }
    if (current && current.endLine > current.startLine) runs.push(current);
    current = eligible ? { startLine: region.startLine, endLine: region.startLine } : null;
  }
  if (current && current.endLine > current.startLine) runs.push(current);
  return runs;
}

/**
 * Walks the file character by character, tracking string, text-block and open-comment state, and
 * returns one region per comment found. Scanning rather than regex-matching is what keeps a URL
 * (`"https://…"`) or a `/*` inside a string literal from reading as a comment.
 */
function scan(lines, syntax) {
  const regions = [];
  let open = null;
  let inTextBlock = false;
  let inTemplate = false;
  let seenCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let c = 0;
    let lineHasCode = false;

    while (c < line.length) {
      if (inTemplate) {
        c = skipString(line, c, '`');
        if (c <= line.length && line[c - 1] === '`') inTemplate = false;
        lineHasCode = true;
        continue;
      }
      if (open) {
        const terminator = open.kind === 'html' ? '-->' : '*/';
        const at = line.indexOf(terminator, c);
        if (at === -1) break;
        open.endLine = i;
        regions.push(open);
        c = at + terminator.length;
        open = null;
        continue;
      }
      if (inTextBlock) {
        // `\"""` embeds a literal triple quote without closing the block (JLS 3.10.6).
        if (line[c] === '\\') {
          c += 2;
        } else if (line.startsWith('"""', c)) {
          inTextBlock = false;
          c += 3;
        } else {
          c++;
        }
        continue;
      }
      if (syntax.textBlock && line.startsWith('"""', c)) {
        inTextBlock = true;
        lineHasCode = true;
        c += 3;
        continue;
      }
      const ch = line[c];
      if (ch === '"' || ch === "'" || ch === '`') {
        const body = c + 1;
        c = skipString(line, body, ch);
        // An unclosed template carries to the next line; `c === body` is the opener standing last.
        if (ch === '`' && (c === body || line[c - 1] !== '`')) inTemplate = true;
        lineHasCode = true;
        continue;
      }
      if (syntax.line && line.startsWith(syntax.line, c)) {
        regions.push({
          kind: 'line',
          startLine: i,
          endLine: i,
          wholeLine: line.slice(0, c).trim() === '',
        });
        break;
      }
      if (syntax.block && line.startsWith('/*', c)) {
        const isDoc = line.startsWith('/**', c) && !line.startsWith('/**/', c);
        open = { kind: 'block', startLine: i, isDoc, isFileHeader: !(seenCode || lineHasCode) };
        c += 2;
        continue;
      }
      if (syntax.html && line.startsWith('<!--', c)) {
        open = { kind: 'html', startLine: i, isDoc: false, isFileHeader: !(seenCode || lineHasCode) };
        c += 4;
        continue;
      }
      if (ch.trim() !== '') lineHasCode = true;
      c++;
    }
    if (lineHasCode) seenCode = true;
  }

  // An unterminated block runs to the end of the file; report it against the last line.
  if (open) {
    open.endLine = lines.length - 1;
    regions.push(open);
  }
  return regions;
}

/**
 * Scans from `start` to just past the closing `quote`, honouring backslash escapes. When the quote
 * never closes on this line the end of the line is returned, so the caller can tell the two apart
 * by checking whether the character before the returned index is the quote — **and whether the
 * scan moved at all**: an opener standing last on its line returns `start` itself, where the
 * character before is that opener, which read as a close and inverted the caller's state (#619).
 */
function skipString(line, start, quote) {
  let c = start;
  while (c < line.length) {
    if (line[c] === '\\') {
      c += 2;
      continue;
    }
    if (line[c] === quote) return c + 1;
    c++;
  }
  return line.length;
}

/**
 * Runs the detector over every in-scope file a diff touches.
 *
 * @param {string[]} range arguments describing the diff, e.g. `['<merge-base>']`
 * @param {string[]} [limitTo] when given, only these paths are considered
 */
export function check(range, limitTo) {
  const diff = git(diffArgs(...range));
  const violations = [];

  for (const [path, added] of parseAddedLines(diff)) {
    if (limitTo && !limitTo.includes(path)) continue;
    if (!syntaxFor(path)) continue;
    const text = readText(path);
    if (text === null) continue;
    violations.push(...findViolations({ path, lines: text.split('\n'), added }));
  }
  return violations;
}

/**
 * Checks explicit paths against `HEAD`, judging an **untracked** file whole.
 *
 * A file git has never seen has no diff against `HEAD`, so the plain diff path reported it clean —
 * and a brand-new file is the commonest way a violation enters the tree, on the very `Write` the
 * `PostToolUse` hook fires for. `check-focus-posture` closed this in #618; this guard kept the gap
 * until #619's CLI harness went looking for it.
 *
 * <p>Only the untracked half is judged whole. A **tracked** file stays diff-scoped even here, which
 * is where this deliberately parts company with `check-focus-posture`'s `--files`: that rule has
 * ~12 standing instances and can afford a whole-file verdict, while ~460 pre-existing multi-line
 * comments stand in this tree by design, so judging a committed file whole would bury the author in
 * lines someone else wrote — the day-one red issue #529 exists to avoid.
 *
 * @param {string[]} paths repo-relative paths
 */
export function checkPaths(paths) {
  const inScope = paths.filter((path) => syntaxFor(path));
  if (inScope.length === 0) return [];

  const tracked = new Set(changedPaths(git(['ls-files', '-z', '--', ...inScope])));
  const violations = tracked.size === 0 ? [] : check(['HEAD', '--', ...tracked], [...tracked]);

  for (const path of inScope.filter((candidate) => !tracked.has(candidate))) {
    const text = readText(path);
    if (text === null) continue;
    const lines = text.split('\n');
    violations.push(...findViolations({ path, lines, added: new Set(lines.map((_, i) => i + 1)) }));
  }
  return violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

const ADVICE =
  'RV-STYLE-1: an inline comment is one line, or it is not written. Shorten it, delete it, or ' +
  'move the prose to a doc comment (Javadoc/TSDoc), which is exempt. See ' +
  'riviera-java-conventions §6c.';

function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}-${v.endLine}  ${v.text}`).join('\n');
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
    if (!path || !syntaxFor(path)) return 0;
    const violations = checkPaths([toRepoRelative(path)]);
    if (violations.length === 0) return 0;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Multi-line inline comment written by this edit:\n${report(violations)}\n${ADVICE}`,
        },
      }),
    );
    return 0;
  }

  if (mode === '--files') {
    const violations = checkPaths(argv.slice(1).map(toRepoRelative));
    if (violations.length === 0) return 0;
    process.stderr.write(`Multi-line inline comments:\n${report(violations)}\n${ADVICE}\n`);
    return 1;
  }

  if (mode === '--diff') {
    const violations = check([mergeBase(argv[1] ?? 'origin/main')]);
    if (violations.length === 0) return 0;
    process.stderr.write(`Multi-line inline comments added by this diff:\n${report(violations)}\n${ADVICE}\n`);
    return 1;
  }

  process.stderr.write('usage: check-inline-comments.mjs (--diff <base> | --files <path…> | --hook)\n');
  return 2;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
// pathToFileURL, not a `file://` template: no Windows path matches one, silencing the CLI there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
