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
 * whole walk: `typescriptRegions` masks a file down to its inline templates and its code,
 * `maskHtmlComments` masks an external template's comments, `maskBlockExpressions` masks block
 * parameters and `@let` values out of the tag walk, `tagNameAt` decides where in the masked markup an
 * element tag opens, and `readAttributes` reads one start tag's attributes. Beside
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

/**
 * An external template with every `<!-- … -->` blanked to spaces, line and column geometry kept, so
 * a control inside a comment is never judged as markup.
 */
export function maskHtmlComments(lines) {
  const out = lines.map((line) => line.split(''));
  let open = false;

  for (const chars of out) {
    for (let c = 0; c < chars.length; c++) {
      if (open) {
        if (startsWith(chars, '-->', c)) {
          blank(chars, c, 3);
          c += 2;
          open = false;
        } else {
          chars[c] = ' ';
        }
      } else if (startsWith(chars, '<!--', c)) {
        blank(chars, c, 4);
        c += 3;
        open = true;
      }
    }
  }
  return out.map((chars) => chars.join(''));
}

function startsWith(chars, token, at) {
  for (let i = 0; i < token.length; i++) {
    if (chars[at + i] !== token[i]) return false;
  }
  return true;
}

function blank(chars, at, length) {
  for (let i = at; i < at + length; i++) chars[i] = ' ';
}

/**
 * What may follow an element name in a real tag: whitespace, the self-closing slash, or `>`.
 *
 * A subset of Angular's own name end (its lexer also ends a name at `<`, a quote or `=`), and the
 * subset is the point: `@if (count()<limit)` and `{{ i<select.length }}` open no tag, because the
 * operand runs on into `)` or `.`. An operand followed by a space, as in `{{ n<max }}`, still opens
 * one; when a `<` comes before any `>`, `readAttributes` ends it there, so it never takes the real
 * control after it as its own attributes (#1475), and marks it incomplete, so `check-touch-target`
 * neither judges it — a phantom named for a control would fail a build on a line holding none
 * (#529's lesson) — nor lets it enclose anything (#1478). A block parameter or `@let` value, where
 * such a read could reach a `>` and read as complete, is blanked first by `maskBlockExpressions`
 * (#1480). Shared through `tagNameAt`.
 */
const TAG_NAME_END = /[\s/>]/;

/**
 * The element name starting at `from`, just past a tag's `<` (or its `</`), lower-cased; null when
 * that `<` opens no tag — no letter starts the name, or no `TAG_NAME_END` follows it. A name at the
 * line's end is a real one: a start tag that spans lines puts its first attribute on the next.
 *
 * @param {string} line the masked template line
 * @param {number} from the index after the `<` or `</`
 * @returns {string | null} the element name, or null for template text
 */
export function tagNameAt(line, from) {
  if (!/[A-Za-z]/.test(line[from] ?? '')) return null;
  const name = /^[\w-]+/.exec(line.slice(from))[0];
  return TAG_NAME_END.test(line[from + name.length] ?? ' ') ? name.toLowerCase() : null;
}

/**
 * The attributes of the start tag whose name ends at `column`, and where its `>` is: a map of
 * attribute name to its value and the 0-based line the name sits on. A tag legitimately spans
 * lines, so the read does too.
 *
 * `selfClosed` is whether a `/` stood last before the `>`; a bare value's trailing `/` is that
 * marker, not value. A bare value ends at a `<` as well, as Angular's lexer ends one (`isNameEnd`),
 * so a phantom's `c=` glued to a real tag never takes it as its value (#1478). A read that runs off
 * the end without a `>` stops past the last character of the last line, so a walk resuming there
 * ends rather than finding the same `<` again (#1473). A `<` where an attribute should start ends
 * the tag as Angular's lexer does, and the read stops just before it, so a walk resuming there reads
 * that `<` as the next tag (#1475).
 *
 * `incomplete` is whether the read ended anywhere but at the tag's `>` — a `<`, a quote where a name
 * should be, the region's end. Angular's lexer marks such a tag incomplete, and its parser pushes it
 * and pops it at once (`_consumeElementStartTag`), reporting it unterminated: it encloses nothing,
 * and no template that builds holds one. So the walk meets an incomplete tag only as a phantom, such
 * as the `<max` of `{{ n<max }}` (#1478).
 */
export function readAttributes(lines, line, column) {
  const attributes = new Map();
  let i = line;
  let c = column;
  let slash = false;

  while (i < lines.length) {
    if (c >= lines[i].length) {
      i++;
      c = 0;
      continue;
    }
    const ch = lines[i][c];
    if (ch === '>') return { attributes, line: i, column: c, selfClosed: slash, incomplete: false };
    if (/[\s/]/.test(ch)) {
      slash ||= ch === '/';
      c++;
      continue;
    }
    if (ch === '<') {
      return { attributes, line: i, column: c - 1, selfClosed: slash, incomplete: true };
    }
    // `{{ a<b ? 'x' : 'y' }}` reads as a start tag, and its quote is where a name should be.
    const name = /^[^\s=>/'"<]+/.exec(lines[i].slice(c));
    if (name === null) {
      return { attributes, line: i, column: c, selfClosed: slash, incomplete: true };
    }
    slash = false;
    c += name[0].length;
    if (lines[i][c] !== '=') {
      attributes.set(name[0], { value: '', line: i });
      continue;
    }
    const read = readValue(lines, i, c + 1);
    attributes.set(name[0], { value: read.value, line: i });
    i = read.line;
    c = read.column;
  }
  return { attributes, ...pastEnd(lines), selfClosed: slash, incomplete: true };
}

function readValue(lines, line, column) {
  const quote = lines[line][column];
  if (quote !== '"' && quote !== "'") {
    const raw = /^[^\s><]*/.exec(lines[line].slice(column))[0];
    // Only a trailing slash is the self-close marker; one inside `data-href=/legal/terms` is value.
    const bare = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    return { value: bare, line, column: column + bare.length };
  }
  let value = '';
  for (let i = line; i < lines.length; i++) {
    const from = i === line ? column + 1 : 0;
    const end = lines[i].indexOf(quote, from);
    if (end === -1) {
      value += `${lines[i].slice(from)}\n`;
      continue;
    }
    return { value: value + lines[i].slice(from, end), line: i, column: end + 1 };
  }
  return { value, ...pastEnd(lines) };
}

/** The position just past the region's last character. */
function pastEnd(lines) {
  const line = lines.length - 1;
  return { line, column: lines[line].length };
}

/**
 * Angular's block names (the compiler's `SUPPORTED_BLOCKS`). Its lexer opens a block at any text `@`
 * these start, so `@iffy` opens one too; a literal `@` in text is written `&#64;`.
 */
const BLOCKS = [
  '@if',
  '@else',
  '@for',
  '@switch',
  '@case',
  '@default',
  '@empty',
  '@defer',
  '@placeholder',
  '@loading',
  '@error',
  '@content',
];

/**
 * The template with every block's parameters and every `@let` value blanked to spaces, line and
 * column geometry kept, for the guards' tag walk only.
 *
 * Angular reads `@if (…)`, `@for (…; track …)`, `@defer (on …)` and the rest, and the value of
 * `@let name = …;`, as expressions, never as markup, so a `<` there opens no tag. Unmasked, the walk
 * opened one at `@if (n<div && a>b)` that reached the `>` and read as complete (#1480). The mask
 * follows the lexer: a block or `@let` opens only in text — the walk steps over a tag as
 * `readAttributes` reads it, and over an interpolation as `_consumeInterpolation` does — a block's
 * parameters run from its `(` to the `)` `_consumeBlockParameters` stops at, and a `@let` value from
 * its `=` to the `;` `_consumeLetDeclarationValue` stops at. A guard that reads a block's condition
 * keeps reading the unmasked template.
 *
 * @param {string[]} lines the comment-masked template region
 * @returns {string[]} the same lines with block parameters and `@let` values blanked
 */
export function maskBlockExpressions(lines) {
  const text = lines.join('\n');
  const out = text.split('');
  const starts = lineStarts(lines);
  let at = 0;

  while (at < text.length) {
    const step = text.startsWith('{{', at)
      ? interpolationEnd(text, at + 2)
      : (tagEnd(lines, starts, text, at) ??
        letEnd(text, at, out) ??
        blockEnd(text, at, out) ??
        at + 1);
    at = step;
  }
  return out.join('').split('\n');
}

function lineStarts(lines) {
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

/** The offset just past the tag a `<` at `at` opens or closes, as the guards' walk reads it; else null. */
function tagEnd(lines, starts, text, at) {
  if (text[at] !== '<') return null;
  const line = starts.findLastIndex((start) => start <= at);
  const column = at - starts[line];
  const closing = lines[line][column + 1] === '/';
  const from = closing ? column + 2 : column + 1;
  const name = tagNameAt(lines[line], from);
  if (name === null) return null;
  if (closing) return starts[line] + from + name.length;
  const read = readAttributes(lines, line, from + name.length);
  return starts[read.line] + read.column + 1;
}

/**
 * The offset an interpolation opened before `from` ends at: past its `}}` outside a string, or at a
 * `<` that starts a tag, where Angular's lexer ends one early (`_isTagStart`).
 */
function interpolationEnd(text, from) {
  let quote = null;
  for (let at = from; at < text.length; at++) {
    const ch = text[at];
    if (quote === null && /^<[A-Za-z/!?]/.test(text.slice(at, at + 2))) return at;
    if (quote === null && text.startsWith('}}', at)) return at + 2;
    if (ch === '\\') at++;
    else if (ch === quote) quote = null;
    else if (quote === null && isQuote(ch)) quote = ch;
  }
  return text.length;
}

/**
 * The offset past a `@let` at `at`, with its value blanked in `out`; null when no `@let` starts
 * there. Angular's `_consumeLetDeclaration`: whitespace, a name, `=`, then the value up to a `;`
 * outside a string. A malformed one masks nothing.
 */
function letEnd(text, at, out) {
  if (!text.startsWith('@let', at)) return null;
  let c = at + 4;
  if (!/\s/.test(text[c] ?? '')) return c;
  c = skipWhitespace(text, c);
  c += /^(?:[A-Za-z$_][\w$]*)?/.exec(text.slice(c))[0].length;
  c = skipWhitespace(text, c);
  if (text[c] !== '=') return c;
  const end = untilOutsideQuotes(text, c + 1, ';');
  blankRange(out, c + 1, end);
  return end;
}

/**
 * The offset past a block's parameters at `at`, blanked in `out`; null when no block starts there.
 * The name is read as `_getBlockName` reads it (`@else if` included), and the parameters as
 * `_consumeBlockParameters` reads them: `;`-separated, each ending at a `;` or at a `)` outside a
 * string and outside the parentheses it opened.
 */
function blockEnd(text, at, out) {
  if (!BLOCKS.some((block) => text.startsWith(block, at))) return null;
  let c = at + 1;
  let named = false;
  while (c < text.length && (/\w/.test(text[c]) || (named && /\s/.test(text[c])))) {
    named ||= /\w/.test(text[c]);
    c++;
  }
  if (text[c] !== '(') return c;
  const end = parametersEnd(text, c + 1);
  blankRange(out, c + 1, end);
  return end;
}

function parametersEnd(text, from) {
  let at = skipParameterSeparators(text, from);
  while (at < text.length && text[at] !== ')') {
    at = skipParameterSeparators(text, parameterEnd(text, at));
  }
  return Math.min(at, text.length);
}

/** The offset one parameter ends at: its `;`, or the `)` outside a string and its own parentheses. */
function parameterEnd(text, from) {
  let quote = null;
  let parens = 0;
  let at = from;
  while (at < text.length && (text[at] !== ';' || quote !== null)) {
    const ch = text[at];
    if (ch === '\\') at++;
    else if (ch === quote) quote = null;
    else if (quote === null && isQuote(ch)) quote = ch;
    else if (quote === null && ch === '(') parens++;
    else if (quote === null && ch === ')') {
      if (parens === 0) return at;
      parens--;
    }
    at++;
  }
  return at;
}

function skipParameterSeparators(text, at) {
  while (at < text.length && (text[at] === ';' || /\s/.test(text[at]))) at++;
  return at;
}

function untilOutsideQuotes(text, from, stop) {
  let at = from;
  while (at < text.length && text[at] !== stop) {
    if (isQuote(text[at])) {
      const quote = text[at];
      at++;
      while (at < text.length && text[at] !== quote) at += text[at] === '\\' ? 2 : 1;
    }
    at++;
  }
  return Math.min(at, text.length);
}

function skipWhitespace(text, at) {
  while (at < text.length && /\s/.test(text[at])) at++;
  return at;
}

/** Angular's `isQuote`: a backtick quotes a string in an expression too. */
function isQuote(ch) {
  return ch === '"' || ch === "'" || ch === '`';
}

/** Blanks `out[from, to)` to spaces, keeping each line end so the geometry holds. */
function blankRange(out, from, to) {
  for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = ' ';
}
