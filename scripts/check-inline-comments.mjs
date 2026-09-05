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
  resolveBase,
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

/**
 * The markdown every session reads as instructions: a skill's `SKILL.md` and its `references/`.
 * Not the rest of `.claude/skills/` — the triage skill's out-of-scope ledger is a list of issue
 * numbers by design — and not `docs/`, whose prose cites issues and PRs on purpose.
 */
const SKILL_MARKDOWN = /^\.claude\/skills\/[^/]+\/(?:SKILL\.md|references\/.+\.md)$/;

/** Returns the comment syntax for a path, or null when the file is out of scope. */
export function syntaxFor(path) {
  if (SKILL_MARKDOWN.test(path)) return { markdown: true };
  const dot = path.lastIndexOf('.');
  return dot === -1 ? null : (SYNTAX[path.slice(dot).toLowerCase()] ?? null);
}

/**
 * Text that is written for the author's session rather than the next reader's. `provenance` is
 * an issue or PR number — `git blame`'s job, and what `riviera-java-conventions` §6d forbids in a
 * doc comment outright; it gates. `history` narrates a change the reader never saw and is
 * contract language often enough (a port that releases a set claimed earlier) that it only advises.
 */
const TELLS = {
  provenance: /(?<![\w#&])#[1-9]\d{2,3}(?!\w)|\b(?:issues?|PRs?|pull requests?)\s+#?\d{2,4}\b/i,
  history:
    /\bused to (?:be|have|do|need|run|take|hold|read|say|mean)\b|\bno longer\b|\bpreviously\b|\bformerly\b|\boriginally\b|\bhistorically\b|\bthis (?:change|slice|PR)\b|\bthe alternative would\b|\bwas left out\b/i,
};

/** Every violation carries a `rule`; these fail a run, the rest are printed and let through. */
export const GATING = new Set(['multiline', 'provenance']);

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
  if (syntax.markdown) return markdownViolations(path, lines, added);

  const regions = scan(lines, syntax);
  const violations = [];

  for (const region of regions) {
    violations.push(...tellViolations(path, lines, added, region));
    if (region.kind === 'line') continue;
    if (region.endLine === region.startLine) continue;
    if (region.isDoc || region.isFileHeader) continue;
    if (!added.has(region.startLine + 1)) continue;
    violations.push(violationAt(path, lines, region.startLine, region.endLine));
  }
  for (const run of addedLineRuns(regions, added)) {
    violations.push(violationAt(path, lines, run.startLine, run.endLine));
  }
  return violations.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

function violationAt(path, lines, startLine, endLine) {
  return {
    path,
    line: startLine + 1,
    endLine: endLine + 1,
    text: lines[startLine].trim(),
    rule: 'multiline',
  };
}

/**
 * The tell violations in one comment region. A doc comment with any added line is judged
 * **whole** — every line of it, written by this diff or not — because touching a doc comment
 * means re-reading it against the rule; any other comment is judged on its added lines only.
 * Only the comment's own text is read: the code before a trailing comment never counts.
 */
function tellViolations(path, lines, added, region) {
  const touched = [];
  for (let i = region.startLine; i <= region.endLine; i++) {
    if (added.has(i + 1)) touched.push(i);
  }
  if (touched.length === 0) return [];
  const judged = region.isDoc ? range(region.startLine, region.endLine) : touched;

  const violations = [];
  for (const i of judged) {
    const text = i === region.startLine ? lines[i].slice(region.column) : lines[i];
    for (const [rule, pattern] of Object.entries(TELLS)) {
      if (pattern.test(text)) {
        violations.push({ path, line: i + 1, endLine: i + 1, text: lines[i].trim(), rule });
      }
    }
  }
  return violations;
}

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

/**
 * The tell violations in skill markdown: the lines the diff added, outside fenced code and with
 * code spans removed, so a command's `#NN` placeholder or a colour token is never read as prose.
 */
function markdownViolations(path, lines, added) {
  const violations = [];
  let fenced = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:```|~~~)/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !added.has(i + 1)) continue;
    const prose = lines[i].replace(/`[^`]*`/g, '');
    for (const [rule, pattern] of Object.entries(TELLS)) {
      if (pattern.test(prose)) {
        violations.push({ path, line: i + 1, endLine: i + 1, text: lines[i].trim(), rule });
      }
    }
  }
  return violations;
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
          column: c,
          wholeLine: line.slice(0, c).trim() === '',
        });
        break;
      }
      if (syntax.block && line.startsWith('/*', c)) {
        const isDoc = line.startsWith('/**', c) && !line.startsWith('/**/', c);
        const isFileHeader = !(seenCode || lineHasCode);
        open = { kind: 'block', startLine: i, column: c, isDoc, isFileHeader };
        c += 2;
        continue;
      }
      if (syntax.html && line.startsWith('<!--', c)) {
        const isFileHeader = !(seenCode || lineHasCode);
        open = { kind: 'html', startLine: i, column: c, isDoc: false, isFileHeader };
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

const TEST = 'Keep a line of prose only if a fresh session reading it would act differently.';

const ADVICE = {
  multiline:
    'RV-STYLE-1: an inline comment is one line, or it is not written. Shorten it, delete it, or ' +
    'move the contract to a doc comment (Javadoc/TSDoc). See riviera-java-conventions §6c.',
  provenance:
    `RV-STYLE-1: ${TEST} An issue or PR number is provenance — git blame's job — so drop it; ` +
    'relocate load-bearing rationale to RESPONSIBILITIES.md or an ADR and leave a one-line ' +
    'pointer. A touched doc comment is judged whole. See riviera-java-conventions §6c.',
  history:
    `RV-STYLE-1 (advisory): ${TEST} "no longer", "previously", "used to be" narrate a change ` +
    'the reader never saw: state the contract as it stands, or drop the line. See ' +
    'riviera-java-conventions §6c.',
};

function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}-${v.endLine}  ${v.rule}  ${v.text}`).join('\n');
}

function advise(violations) {
  return [...new Set(violations.map((v) => v.rule))].map((rule) => ADVICE[rule]).join('\n');
}

/**
 * Prints the findings and answers the exit code: 1 when any gating rule fired, else 0. An
 * advisory finding still reaches stdout — a rule nobody sees is a rule nobody follows — but it
 * never fails the run.
 */
export function settle(violations, headline, out = process.stdout, err = process.stderr) {
  const gating = violations.filter((v) => GATING.has(v.rule));
  const advisory = violations.filter((v) => !GATING.has(v.rule));
  if (advisory.length > 0) {
    out.write(`${headline} — advisory, not gating:\n${report(advisory)}\n${advise(advisory)}\n`);
  }
  if (gating.length === 0) return 0;
  err.write(`${headline}:\n${report(gating)}\n${advise(gating)}\n`);
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
    if (!path || !syntaxFor(path)) return 0;
    const violations = checkPaths([toRepoRelative(path)]);
    if (violations.length === 0) return 0;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Comment or skill prose written by this edit:\n${report(violations)}\n${advise(violations)}`,
        },
      }),
    );
    return 0;
  }

  if (mode === '--files') {
    return settle(checkPaths(argv.slice(1).map(toRepoRelative)), 'Comments and skill prose');
  }

  if (mode === '--diff') {
    const { base, error } = resolveBase(argv[1] ?? 'origin/main');
    if (error) {
      process.stderr.write(`${error}\n`);
      return 2;
    }
    return settle(check([base]), 'Comments and skill prose this diff touched');
  }

  process.stderr.write('usage: check-inline-comments.mjs (--diff <base> | --files <path…> | --hook)\n');
  return 2;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
// pathToFileURL, not a `file://` template: no Windows path matches one, silencing the CLI there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
