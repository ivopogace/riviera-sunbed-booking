/**
 * The one decision the four template-walking guards share: **the template literal after
 * `template:` in a TypeScript file is an Angular inline template**, where an `<!-- … -->` is a
 * comment and a control is markup, and a `${…}` inside it is code. Any other template literal — a
 * spec's HTML fixture, a SQL string, a `template:` key in a `.js` file — is opaque string content.
 *
 * Four guards act on it, through two surfaces. `check-inline-comments` and `check-comment-only` walk
 * a `.ts` file with their own scanners — one finds comment regions, the other strips them — and take
 * only the decision: a scanner keeps its loop, its string and escape rules and its comment handling,
 * feeds the code it walks into a `CodeTail`, asks at a backtick, and steps a `${…}` with
 * `interpolationStep`. `check-focus-posture` and `check-touch-target` judge markup, so they take the
 * whole walk: `typescriptRegions` masks a file down to its inline templates and its code. Beside
 * `git-diff.mjs` because that is the guards' shared module, and dependency-free for the same reason
 * it is: the hygiene CI job runs the suites with no install step.
 */

/** The extensions whose `template:` literal is an inline template. A `.js` key is a string. */
export const INLINE_TEMPLATE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * The code before a backtick that makes its literal an inline template. Word-bounded, so a key that
 * merely ends in `template` opens a string; anchored at the end, so only whitespace — a newline and
 * an indent included — may stand between the key and the backtick.
 */
const OPENER = /\btemplate\s*:\s*$/;

/**
 * Long enough for `template:` followed by a newline and any indentation; bounded only so the string
 * a scanner carries stays short.
 */
const TAIL_LENGTH = 80;

/**
 * The code a scanner has walked up to the current backtick, with the one question that code answers.
 *
 * A scanner pushes every character it reads in code state, the line end included (the key and its
 * backtick are on different lines in most components), and resets on a string — the tail is *code*
 * before the backtick, and a string between the key and the backtick means the literal is not the
 * key's value. Comments are the scanner's own affair: it pushes them or not as its comment rule says.
 */
export class CodeTail {
  #tail = '';

  /** Appends code the scanner read; a line end is pushed as `\n`. */
  push(text) {
    this.#tail = `${this.#tail}${text}`.slice(-TAIL_LENGTH);
  }

  /** Forgets the tail, at a string. */
  reset() {
    this.#tail = '';
  }

  /**
   * Whether the backtick the scanner stands on opens an inline template, and the tail is consumed
   * either way: the literal it opens is a string or a template, never the code before the next one.
   */
  opensInlineTemplate() {
    const opens = OPENER.test(this.#tail);
    this.#tail = '';
    return opens;
  }
}

/**
 * One step of the `${…}` rule inside an inline template, for a scanner that has already handled a
 * backslash escape at `at`.
 *
 * At `depth` 0 a `${` opens an interpolation; inside one every character is code — nothing in it can
 * open an HTML comment or close the literal — and its braces are counted so a nested `{}` does not end
 * it early. The count is by brace alone: a brace inside a string inside the interpolation counts too,
 * so an unbalanced one ends the interpolation early. That simplification is the shared rule, and this
 * is the one place it is stated.
 *
 * @param {string} text the line or source being walked
 * @param {number} at the index the scanner stands on
 * @param {number} depth the interpolation depth carried in by the scanner, 0 in template text
 * @returns {{ depth: number, next: number } | null} the new depth and the index after the step, or
 *   null when `at` is template text the scanner judges itself
 */
export function interpolationStep(text, at, depth) {
  if (depth > 0) return { depth: depth + braceDelta(text[at]), next: at + 1 };
  if (text.startsWith('${', at)) return { depth: 1, next: at + 2 };
  return null;
}

function braceDelta(ch) {
  if (ch === '{') return 1;
  if (ch === '}') return -1;
  return 0;
}

/**
 * The two masks of a TypeScript file, each keeping line and column geometry so a finding still
 * reports its real position:
 *
 * - `template` — the contents of inline templates, and nothing else. A `<button [disabled]>` that a
 *   TSDoc spells out to document a convention, or that a fixture string holds, is not markup.
 * - `code` — executable source with comments, strings and template literals removed, so a helper
 *   named in a comment cannot pass for a call site.
 *
 * @param {string[]} lines the file's lines
 * @returns {{ template: string[], code: string[] }} the two masks, line for line
 */
export function typescriptRegions(lines) {
  const scan = {
    line: '',
    row: 0,
    at: 0,
    state: 'code',
    depth: 0,
    tail: new CodeTail(),
    template: lines.map(blankOf),
    code: lines.map(blankOf),
  };
  for (let row = 0; row < lines.length; row++) {
    scan.line = lines[row];
    scan.row = row;
    scan.at = 0;
    while (scan.at < scan.line.length) MASK[scan.state](scan);
    if (scan.state === 'code') scan.tail.push('\n');
  }
  return { template: scan.template.map(joined), code: scan.code.map(joined) };
}

function blankOf(line) {
  return ' '.repeat(line.length).split('');
}

function joined(chars) {
  return chars.join('');
}

/** One step in code: a comment or a literal opens, or one character joins the code mask and the tail. */
function maskCode(scan) {
  const { line, at } = scan;
  const ch = line[at];
  if (line.startsWith('//', at)) {
    scan.at = line.length;
  } else if (line.startsWith('/*', at)) {
    openBlockComment(scan);
  } else if (ch === '"' || ch === "'") {
    scan.at = quotedEnd(line, at);
    scan.tail.reset();
  } else if (ch === '`') {
    scan.state = scan.tail.opensInlineTemplate() ? 'template' : 'string';
    scan.depth = 0;
    scan.at++;
  } else {
    scan.code[scan.row][at] = ch;
    scan.tail.push(ch);
    scan.at++;
  }
}

/** A `/* … *\/` closing on its own line is stepped over; one that runs on leaves the line in `block`. */
function openBlockComment(scan) {
  const end = scan.line.indexOf('*/', scan.at + 2);
  if (end === -1) {
    scan.state = 'block';
    scan.at = scan.line.length;
    return;
  }
  scan.at = end + 2;
  scan.tail.reset();
}

function maskBlock(scan) {
  if (scan.line.startsWith('*/', scan.at)) {
    scan.state = 'code';
    scan.at += 2;
  } else {
    scan.at++;
  }
}

/** A template literal that is not an inline template: opaque, escapes honoured, until its backtick. */
function maskString(scan) {
  const ch = scan.line[scan.at];
  if (ch === '`') scan.state = 'code';
  scan.at += ch === '\\' ? 2 : 1;
}

/** Inside an inline template: an escape or an interpolation is stepped over, and text joins the mask. */
function maskTemplate(scan) {
  const { line, at } = scan;
  if (line[at] === '\\') {
    scan.at += 2;
    return;
  }
  const step = interpolationStep(line, at, scan.depth);
  if (step !== null) {
    scan.depth = step.depth;
    scan.at = step.next;
    return;
  }
  if (line[at] === '`') scan.state = 'code';
  else scan.template[scan.row][at] = line[at];
  scan.at++;
}

const MASK = { code: maskCode, block: maskBlock, string: maskString, template: maskTemplate };

/** The index just past the `"`/`'` string opening at `at`, or the line's end when it never closes. */
function quotedEnd(line, at) {
  const quote = line[at];
  let c = at + 1;
  while (c < line.length) {
    if (line[c] === quote) return c + 1;
    c += line[c] === '\\' ? 2 : 1;
  }
  return line.length;
}
