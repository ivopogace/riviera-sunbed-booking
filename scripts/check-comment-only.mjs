/**
 * Proves a comment-trimming diff changed **only** comments (issue #544, `riviera-java-conventions` §6d).
 *
 * Strips every comment from both sides of the diff, normalizes whitespace, and reports any file whose
 * remaining code is not identical. A comment-only refactor that touches 1,000 files cannot be reviewed
 * line by line; this is what makes it reviewable — the diff is large but provably inert.
 *
 * Usage: `node scripts/check-comment-only.mjs [<base>]`  (default base `origin/main`)
 *
 * **Every git call and every read goes through `git-diff.mjs`, from the repository root.** This guard
 * was left out of PR #618's sweep and kept the front-end the other three shed: run from a
 * subdirectory, every read threw, the `catch` around each one `continue`d, and the printed count —
 * derived from the files it *meant* to inspect — still called them verified code-identical. On this
 * tool's output a reviewer skips reading the diff, so a confident false clean here is the one that
 * costs the most (issue #641).
 */

import { pathToFileURL } from 'node:url';

import { changedPaths, git, nameOnlyArgs, readText } from './git-diff.mjs';

/** Extensions whose comment syntax `strip` understands. Anything else is skipped, not assumed safe. */
const SUPPORTED = new Set(['.java', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.scss', '.css']);

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
 * the code it is.
 *
 * <p>Known limitation: the final normalization collapses whitespace on every line, including inside a
 * Java text block, whose compiled value depends on its minimum common indentation. A re-indent of a text
 * block would therefore compare equal. Out of scope for a comment-only sweep, which never re-indents;
 * if this tool is ever pointed at a formatting change, that case needs handling first.
 *
 * @param {string} src file contents
 * @returns {string} code-only lines, trimmed and whitespace-collapsed, blanks dropped
 */
export function strip(src) {
  let out = '';
  let i = 0;
  let state = 'code';
  let quote = '';

  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (state === 'code') {
      if (src.startsWith('"""', i)) {
        state = 'text';
        out += '"""';
        i += 3;
      } else if (two === '//') {
        state = 'line';
        i += 2;
      } else if (two === '/*') {
        state = 'block';
        i += 2;
      } else if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
        state = 'str';
        quote = src[i];
        out += src[i];
        i++;
      } else {
        // An unquoted url() and a regex literal both hide `/` sequences the comment checks would eat.
        const urlEnd = src[i] === 'u' || src[i] === 'U' ? readUnquotedUrl(src, i) : -1;
        if (urlEnd !== -1) {
          out += src.slice(i, urlEnd);
          i = urlEnd;
          continue;
        }
        const regexEnd = src[i] === '/' && opensRegex(out) ? readRegex(src, i) : -1;
        if (regexEnd !== -1) {
          out += src.slice(i, regexEnd);
          i = regexEnd;
          continue;
        }
        out += src[i];
        i++;
      }
      continue;
    }
    if (state === 'text' || state === 'str') {
      if (src[i] === '\\') {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (state === 'text' && src.startsWith('"""', i)) {
        state = 'code';
        out += '"""';
        i += 3;
        continue;
      }
      if (state === 'str' && src[i] === quote) state = 'code';
      out += src[i];
      i++;
      continue;
    }
    if (state === 'line') {
      if (src[i] === '\n') {
        state = 'code';
        out += '\n';
      }
      i++;
      continue;
    }
    if (two === '*/') {
      state = 'code';
      i += 2;
      continue;
    }
    if (src[i] === '\n') out += '\n';
    i++;
  }

  return out
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .join('\n');
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
 * <p>`verified` counts files this actually diffed, rather than deriving a count from the ones it
 * *meant* to. Those are the same number only when nothing bailed, and the difference was the whole
 * defect: run from a subdirectory, every read failed, every file `continue`d, and the derived count
 * still reported them as verified code-identical — a confident false clean in the tool that
 * authorises not reading a diff (issue #641). Reading through `git-diff.mjs` fixes the cause;
 * counting what happened rather than what was planned makes any future cause visible.
 */
export function check(base) {
  const changed = changedPaths(git(nameOnlyArgs('--diff-filter=M', `${base}...HEAD`)));
  const codeChanged = [];
  const skipped = [];
  const unreadable = [];
  let verified = 0;

  for (const path of changed) {
    if (!SUPPORTED.has(extensionOf(path))) {
      skipped.push(path);
      continue;
    }
    const before = show(base, path);
    const after = readText(path);
    if (before === null || after === null) {
      unreadable.push(path);
      continue;
    }
    verified++;
    if (strip(before) !== strip(after)) codeChanged.push(path);
  }
  return { codeChanged, skipped, unreadable, verified };
}

function main(argv) {
  const base = argv[0] ?? 'origin/main';
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
  process.stdout.write(`Comment-only: ${verified} file(s) verified code-identical against ${base}.\n`);
  if (skipped.length > 0) {
    process.stdout.write(`Skipped ${skipped.length} file(s) with unsupported comment syntax.\n`);
  }
  return 0;
}

// pathToFileURL, not concatenation: on Windows `C:\…` never equals the `file:///C:/…` form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
