/**
 * Proves a comment-trimming diff changed **only** comments (issue #544, `riviera-java-conventions` §6d).
 *
 * Strips every comment from both sides of the diff, normalizes whitespace, and reports any file whose
 * remaining code is not identical. A comment-only refactor that touches 1,000 files cannot be reviewed
 * line by line; this is what makes it reviewable — the diff is large but provably inert.
 *
 * Usage: `node scripts/check-comment-only.mjs [<base>]`  (default base `origin/main`)
 *
 * The base is `<remote>/<branch>`, which `resolveBase` fetches before using, or a commit SHA, which
 * cannot go stale — a bare local branch is refused (issue #952). That matters more here than
 * anywhere else in the family: this guard is neither a CI gate nor a registered hook, so a by-hand
 * run against a session-old `origin/main` was the only way it was ever invoked, and widening its
 * range is how another branch's code change gets certified as this one's comment-only refactor.
 *
 * **Every git call and every read goes through `git-diff.mjs`, from the repository root.** This guard
 * was left out of PR #618's sweep and kept the front-end the other three shed: run from a
 * subdirectory, every read threw, the `catch` around each one `continue`d, and the printed count —
 * derived from the files it *meant* to inspect — still called them verified code-identical. On this
 * tool's output a reviewer skips reading the diff, so a confident false clean here is the one that
 * costs the most (issue #641). It also judges from **one** reference point rather than three — see
 * `check` for which three it used to mix, and what each one cost.
 */

import { pathToFileURL } from 'node:url';

import { changedPaths, git, nameOnlyArgs, readText, resolveBase } from './git-diff.mjs';

/** Extensions whose comment syntax `strip` understands. Anything else is skipped, not assumed safe. */
const SUPPORTED = new Set(['.java', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.scss', '.css']);

/**
 * The code before a backtick that makes its template literal an Angular inline template, where an
 * `<!-- … -->` is a comment — in a TypeScript file only. In any other template literal it is string
 * content: a spec's HTML fixture is code, and reporting a change to it as comment-only is the false
 * clean this tool must never give.
 */
const TEMPLATE_KEY = /\btemplate\s*:\s*$/;

/** The extensions whose `template:` literal is an Angular inline template. */
const INLINE_TEMPLATE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Characters after which a `/` opens a regex literal rather than dividing. */
const REGEX_PRECEDERS = new Set(
  ['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'],
);

/** Keywords after which a `/` opens a regex literal, where the preceding character is a letter. */
const REGEX_KEYWORDS = new Set(
  ['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'do', 'else', 'yield', 'await', 'new', 'delete',
    'void', 'throw'],
);

const WORD_CHAR = /[A-Za-z0-9_$]/;

/**
 * Would a `/` at this point open a regex literal rather than divide? Decided from the last significant
 * character already emitted — the standard heuristic, and inert on Java, where none of the regex-opening
 * positions is valid syntax before a `/`.
 */
function opensRegex(out) {
  let end = out.length - 1;
  while (end >= 0 && /\s/.test(out[end])) end--;
  if (end < 0) return true;
  const last = out[end];
  if (REGEX_PRECEDERS.has(last)) return true;
  if (!WORD_CHAR.test(last)) return false;
  let start = end;
  while (start >= 0 && WORD_CHAR.test(out[start])) start--;
  return REGEX_KEYWORDS.has(out.slice(start + 1, end + 1));
}

/**
 * The index just past a regex literal starting at {@code i}, or -1 if it is not one that terminates on
 * this line. A `/` inside a `[…]` class does not close the literal — the case that made `/[/*]/` read as
 * an opening block comment and swallow the rest of the file.
 */
function readRegex(src, i) {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\n') return -1;
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j + 1;
    j++;
  }
  return -1;
}

/**
 * The index just past an <em>unquoted</em> CSS `url(…)`, or -1 when it is quoted (the string handler is
 * already correct) or unterminated. Unquoted is the dangerous form: the `//` in `url(http://x)` sits in
 * code state with no string to protect it.
 */
function readUnquotedUrl(src, i) {
  if (src.slice(i, i + 4).toLowerCase() !== 'url(') return -1;
  let j = i + 4;
  while (j < src.length && /[ \t]/.test(src[j])) j++;
  if (src[j] === '"' || src[j] === "'") return -1;
  const close = src.indexOf(')', j);
  if (close === -1 || src.slice(j, close).includes('\n')) return -1;
  return close + 1;
}

/**
 * Removes comments while honouring string, template, char, Java text-block, JS regex-literal and CSS
 * unquoted-`url()` state, so a `//` inside a URL or a `/*` inside a string or character class is kept as
 * the code it is — and an `<!-- … -->` inside an Angular inline template is removed as the comment it is,
 * while a `${…}` interpolation inside that template stays the code it is.
 *
 * <p>Known limitation: the final normalization collapses whitespace on every line, including inside a
 * Java text block, whose compiled value depends on its minimum common indentation. A re-indent of a text
 * block would therefore compare equal. Out of scope for a comment-only sweep, which never re-indents;
 * if this tool is ever pointed at a formatting change, that case needs handling first. Second known
 * limitation, shared with `check-inline-comments.mjs`: inside an inline template's `${…}` a brace
 * inside a string counts, so an unbalanced one ends the interpolation early.
 *
 * @param {string} src file contents
 * @param {string} [extension] the file's extension, e.g. `.ts`; decides whether a `template:` literal
 *   is an inline template
 * @returns {string} code-only lines, trimmed and whitespace-collapsed, blanks dropped
 */
export function strip(src, extension = '') {
  const scan = {
    src,
    out: '',
    i: 0,
    state: 'code',
    quote: '',
    interpolation: 0,
    inlineTemplates: INLINE_TEMPLATE_EXTENSIONS.has(extension),
  };

  while (scan.i < src.length) {
    if (scan.state === 'code') stripCode(scan);
    else if (scan.state === 'line') stripLineComment(scan);
    else if (scan.state === 'block') stripBlockComment(scan);
    else stripQuoted(scan);
  }

  return scan.out
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .join('\n');
}

/** One step in code: a comment or a quote opens, or one code token is copied through. */
function stripCode(scan) {
  const { src, i } = scan;
  const two = src.slice(i, i + 2);
  if (src.startsWith('"""', i)) {
    scan.state = 'text';
    scan.out += '"""';
    scan.i += 3;
    return;
  }
  if (two === '//' || two === '/*') {
    scan.state = two === '//' ? 'line' : 'block';
    scan.i += 2;
    return;
  }
  if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
    openQuoted(scan);
    return;
  }
  // An unquoted url() and a regex literal both hide `/` sequences the comment checks would eat.
  const urlEnd = src[i] === 'u' || src[i] === 'U' ? readUnquotedUrl(src, i) : -1;
  const regexEnd = src[i] === '/' && opensRegex(scan.out) ? readRegex(src, i) : -1;
  const end = Math.max(urlEnd, regexEnd, i + 1);
  scan.out += src.slice(i, end);
  scan.i = end;
}

/** Opens a string, or the inline template that a `template:` backtick in a TypeScript file is. */
function openQuoted(scan) {
  const ch = scan.src[scan.i];
  const inlineTemplate = ch === '`' && scan.inlineTemplates && TEMPLATE_KEY.test(scan.out);
  scan.state = inlineTemplate ? 'template' : 'str';
  scan.quote = ch;
  scan.out += ch;
  scan.i++;
}

/** One step inside a string, a Java text block, or an inline template: copied through, comments aside. */
function stripQuoted(scan) {
  const { src, i, state } = scan;
  if (src[i] === '\\') {
    scan.out += src.slice(i, i + 2);
    scan.i += 2;
    return;
  }
  if (state === 'text' && src.startsWith('"""', i)) {
    scan.state = 'code';
    scan.out += '"""';
    scan.i += 3;
    return;
  }
  if (state === 'template' && (copyInterpolation(scan) || skipHtmlComment(scan))) return;
  if (state !== 'text' && src[i] === scan.quote) scan.state = 'code';
  scan.out += src[i];
  scan.i++;
}

/** Copies one character of an open `${…}`, or opens one; false when the scan is in template text. */
function copyInterpolation(scan) {
  const { src, i } = scan;
  if (scan.interpolation > 0) {
    scan.interpolation += braceDelta(src[i]);
    scan.out += src[i];
    scan.i++;
    return true;
  }
  if (!src.startsWith('${', i)) return false;
  scan.interpolation = 1;
  scan.out += '${';
  scan.i += 2;
  return true;
}

function braceDelta(ch) {
  if (ch === '{') return 1;
  if (ch === '}') return -1;
  return 0;
}

/** Drops an `<!-- … -->` where the scan stands; false when none opens there. */
function skipHtmlComment(scan) {
  const { src, i } = scan;
  if (!src.startsWith('<!--', i)) return false;
  const end = src.indexOf('-->', i + 4);
  scan.i = end === -1 ? src.length : end + 3;
  return true;
}

function stripLineComment(scan) {
  if (scan.src[scan.i] === '\n') {
    scan.state = 'code';
    scan.out += '\n';
  }
  scan.i++;
}

function stripBlockComment(scan) {
  const { src, i } = scan;
  if (src.startsWith('*/', i)) {
    scan.state = 'code';
    scan.i += 2;
    return;
  }
  if (src[i] === '\n') scan.out += '\n';
  scan.i++;
}

/** The base side of a file, or null when that revision does not hold it. */
function show(base, path) {
  try {
    return git(['show', `${base}:${path}`]);
  } catch {
    return null;
  }
}

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

/**
 * Returns one entry per file whose code changed, the paths skipped for an unsupported extension,
 * the paths that could not be read at all, and how many were genuinely compared.
 *
 * <p>**One reference point, `from`, on both sides.** It is a merge-base commit resolved by the
 * caller, and it supplies the file list *and* the before side, while the after side is the working
 * tree throughout. The guard used to mix three: a `base...HEAD` file list, a before side read from
 * the literal `base` **tip**, and a working-tree after side. Once `base` moved, it compared this
 * branch's files against commits the branch was never based on and reported another branch's code
 * change as this one's; and because the list came from committed history while the content came
 * from disk, a code change living only in the working tree was never listed at all. The three
 * sibling guards collapsed onto one commit in #618 for exactly these reasons.
 *
 * <p>`verified` counts files this actually diffed, rather than deriving a count from the ones it
 * *meant* to. Those are the same number only when nothing bailed, and the difference was the whole
 * of issue #641: run from a subdirectory, every read failed, every file `continue`d, and the derived
 * count still reported them as verified code-identical — a confident false clean in the tool that
 * authorises not reading a diff.
 */
export function check(from) {
  const changed = changedPaths(git(nameOnlyArgs('--diff-filter=M', from)));
  const codeChanged = [];
  const skipped = [];
  const unreadable = [];
  let verified = 0;

  for (const path of changed) {
    if (!SUPPORTED.has(extensionOf(path))) {
      skipped.push(path);
      continue;
    }
    const before = show(from, path);
    const after = readText(path);
    // Fail-closed backstop. `--diff-filter=M` means both sides exist, so this should be unreachable.
    if (before === null || after === null) {
      unreadable.push(path);
      continue;
    }
    verified++;
    if (strip(before, extensionOf(path)) !== strip(after, extensionOf(path))) codeChanged.push(path);
  }
  return { codeChanged, skipped, unreadable, verified };
}

function main(argv) {
  const ref = argv[0] ?? 'origin/main';
  const { base, error } = resolveBase(ref);
  if (error) {
    process.stderr.write(`${error}\n`);
    return 2;
  }
  const { codeChanged, skipped, unreadable, verified } = check(base);

  if (codeChanged.length > 0) {
    process.stderr.write(
      `Not comment-only — code changed in ${codeChanged.length} file(s):\n` +
        codeChanged.map((p) => `  ${p}`).join('\n') +
        '\n',
    );
    return 1;
  }
  // "Could not read it" is not "verified": on this tool's output a reviewer skips the diff.
  if (unreadable.length > 0) {
    process.stderr.write(
      `Unverified — ${unreadable.length} file(s) could not be read on one side or the other:\n` +
        unreadable.map((p) => `  ${p}`).join('\n') +
        '\n',
    );
    return 1;
  }
  process.stdout.write(
    `Comment-only: ${verified} file(s) verified code-identical against ${ref} (merge-base ${base}).\n`,
  );
  if (skipped.length > 0) {
    process.stdout.write(`Skipped ${skipped.length} file(s) with unsupported comment syntax.\n`);
  }
  return 0;
}

// pathToFileURL, not concatenation: on Windows `C:\…` never equals the `file:///C:/…` form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
