/**
 * Diff-scoped guard for RV-STYLE-1: an inline comment is one line, or it is not written
 * (`riviera-java-conventions` §6c, `frontend/.claude/CLAUDE.md`, review-bank item RV-STYLE-1).
 *
 * Only ever reasons about lines a diff **added**. The existing tree carries many pre-existing
 * multi-line inline comments that read as established convention in their own files; a
 * repo-wide gate would go red on day one and get switched off (issue #529).
 *
 * Exempt by design: doc comments (`/** … *\/`, TSDoc — the rule's own carve-out), a block
 * comment standing before any code as the file's header, and `#`/SQL-`--` comment syntaxes
 * (see the plan doc's Non-goals; #522/F-6 settled SQL).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

  const violations = [];
  for (const region of merge(scan(lines, syntax))) {
    if (region.endLine === region.startLine) continue;
    if (region.isDoc || region.isFileHeader) continue;
    if (!touchedByDiff(region, added)) continue;
    violations.push({
      path,
      line: region.startLine + 1,
      endLine: region.endLine + 1,
      text: lines[region.startLine].trim(),
    });
  }
  return violations;
}

function touchedByDiff(region, added) {
  for (let i = region.startLine; i <= region.endLine; i++) {
    if (added.has(i + 1)) return true;
  }
  return false;
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
  let seenCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let c = 0;
    let lineHasCode = false;

    while (c < line.length) {
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
        if (line.startsWith('"""', c)) {
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
        c = skipString(line, c);
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

/** Returns the index just past the string literal opening at `start`, honouring backslash escapes. */
function skipString(line, start) {
  const quote = line[start];
  let c = start + 1;
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
 * Collapses a run of consecutive whole-line comments into one region, so two `//` lines above a
 * statement read as one two-line comment. Only whole-line comments merge: a trailing comment is
 * one line by construction, and merging it with the next line's comment would flag two unrelated
 * one-liners that merely sit next to each other.
 */
function merge(regions) {
  const merged = [];
  for (const region of regions) {
    const previous = merged[merged.length - 1];
    const continues =
      previous &&
      previous.kind === 'line' &&
      region.kind === 'line' &&
      previous.wholeLine &&
      region.wholeLine &&
      region.startLine === previous.endLine + 1;
    if (continues) {
      previous.endLine = region.endLine;
    } else {
      merged.push({ ...region });
    }
  }
  return merged;
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

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Reads a path from the working tree, or null when it is unreadable (deleted, binary, gone). */
function readLines(path) {
  try {
    return readFileSync(path, 'utf8').split('\n');
  } catch {
    return null;
  }
}

/**
 * Runs the detector over every in-scope file a diff touches.
 *
 * @param {string[]} diffArgs arguments describing the diff, e.g. `['origin/main...HEAD']`
 * @param {string[]} [limitTo] when given, only these paths are considered
 */
export function check(diffArgs, limitTo) {
  const diff = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', ...diffArgs]);
  const violations = [];

  for (const [path, added] of parseAddedLines(diff)) {
    if (limitTo && !limitTo.includes(path)) continue;
    if (!syntaxFor(path)) continue;
    const lines = readLines(path);
    if (!lines) continue;
    violations.push(...findViolations({ path, lines, added }));
  }
  return violations;
}

const ADVICE =
  'RV-STYLE-1: an inline comment is one line, or it is not written. Shorten it, delete it, or ' +
  'move the prose to a doc comment (Javadoc/TSDoc), which is exempt. See ' +
  'riviera-java-conventions §6c.';

function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}-${v.endLine}  ${v.text}`).join('\n');
}

/** Resolves the merge base with `base`, falling back to a plain two-dot diff when it has none. */
function rangeFor(base) {
  try {
    git(['merge-base', base, 'HEAD']);
    return [`${base}...HEAD`];
  } catch {
    return [base];
  }
}

function main(argv) {
  const mode = argv[0];

  if (mode === '--hook') {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const path = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
    if (!path || !syntaxFor(path)) return 0;
    const relative = path.replace(`${process.cwd()}/`, '');
    const violations = check(['HEAD', '--', relative], [relative]);
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
    const paths = argv.slice(1);
    const violations = check(['HEAD', '--', ...paths], paths);
    if (violations.length === 0) return 0;
    process.stderr.write(`Multi-line inline comments:\n${report(violations)}\n${ADVICE}\n`);
    return 1;
  }

  if (mode === '--diff') {
    const violations = check(rangeFor(argv[1] ?? 'origin/main'));
    if (violations.length === 0) return 0;
    process.stderr.write(`Multi-line inline comments added by this diff:\n${report(violations)}\n${ADVICE}\n`);
    return 1;
  }

  process.stderr.write('usage: check-inline-comments.mjs (--diff <base> | --files <path…> | --hook)\n');
  return 2;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
