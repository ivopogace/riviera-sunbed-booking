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
 * parameters and `@let` values out of the tag walk, and `walkTags` is that walk: where in the masked
 * markup an element tag opens (`elementNameAt`), one start tag's attributes (`readAttributes`), and a
 * raw-text element's content stepped over as text. Beside
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
 * The masks of a TypeScript file, each keeping line and column geometry so a finding still
 * reports its real position:
 *
 * - `template` — the contents of inline templates, and nothing else. A `<button [disabled]>` that a
 *   TSDoc spells out to document a convention, or that a fixture string holds, is not markup.
 * - `code` — executable source with comments, strings and template literals removed, so a helper
 *   named in a comment cannot pass for a call site.
 *
 * `templates` is `template` once per literal, in source order: each is its own template to
 * Angular, which builds an element left open at its end, so a walk that keeps open elements walks
 * each apart.
 *
 * @param {string[]} lines the file's lines
 * @returns {{ template: string[], templates: string[][], code: string[] }} the masks, line for line
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
    templates: [],
    code: lines.map(blankOf),
  };
  for (let row = 0; row < lines.length; row++) {
    scan.line = lines[row];
    scan.row = row;
    scan.at = 0;
    while (scan.at < scan.line.length) MASK[scan.state](scan);
    if (scan.state === 'code') scan.tail.push('\n');
  }
  return {
    template: scan.template.map(joined),
    templates: scan.templates.map((mask) => mask.map(joined)),
    code: scan.code.map(joined),
  };
}

function blankOf(line) {
  return ' '.repeat(line.length).split('');
}

function blankRow(chars) {
  return chars.map(() => ' ');
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
    if (scan.state === 'template') scan.templates.push(scan.template.map(blankRow));
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
  if (line[at] === '`') {
    scan.state = 'code';
  } else {
    scan.template[scan.row][at] = line[at];
    scan.templates.at(-1)[scan.row][at] = line[at];
  }
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
 * (#1480). Shared through `tagNameAt` and `elementNameAt`.
 */
const TAG_NAME_END = /[\s/>]/;

/**
 * The unprefixed element name starting at `from`, just past a tag's `<` (or its `</` and any
 * whitespace), lower-cased; null when that `<` opens no unprefixed tag — no letter starts the name,
 * or no `TAG_NAME_END` follows it, as a `:` does in `<svg:g>`, whose name `elementNameAt` reads
 * instead. A name at the line's end is a real one: a start tag that spans lines puts its first
 * attribute on the next.
 *
 * @param {string} line the masked template line
 * @param {number} from the index after the `<`, or after the `</` and its whitespace
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
 * follows the lexer: a block or `@let` opens only in text — the walk steps over a tag as `walkTags`
 * reads it, a raw-text element's content and end tag included (`RAW_TEXT`, #1482), and over an
 * interpolation as `_consumeInterpolation` does — a block's parameters run from its `(` to the `)`
 * `_consumeBlockParameters` stops at, and a `@let` value from its `=` to the `;`
 * `_consumeLetDeclarationValue` stops at. A guard that reads a block's condition
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

/**
 * The elements whose content Angular's lexer reads as text up to their end tag, so no tag, block or
 * `@let` opens inside one: `getHtmlTagDefinition`'s `RAW_TEXT` (`script`, `style`) and
 * `ESCAPABLE_RAW_TEXT` (`textarea`, `title`), the WHATWG raw-text and escapable raw-text elements.
 * The lexer judges a tag by its name and prefix, never its parent, so a `<title>` inside `<svg>` is
 * raw text too, and so is a prefixed one such as `<svg:style>` or `<x:title>` (`isRawText`).
 */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Whether a start tag's content is raw text, as `getHtmlTagDefinition(name).getContentType(prefix)`
 * answers: every `RAW_TEXT` name under any prefix or none, but `title` under the prefix `svg`, which
 * `title`'s definition overrides to parsed. The name arrives lower-cased, as the definition lookup
 * falls back to; the prefix is compared exactly, as the override is, so `<SVG:title>` is raw text.
 */
function isRawText(prefix, name) {
  return RAW_TEXT.has(name) && !(prefix === 'svg' && name === 'title');
}

/**
 * The offset just past the tag a `<` at `at` opens or closes, as `tagAt` reads it, and past a
 * raw-text element's content and end tag too; else null.
 */
function tagEnd(lines, starts, text, at) {
  if (text[at] !== '<') return null;
  const line = starts.findLastIndex((start) => start <= at);
  const found = tagAt(lines, line, at - starts[line]);
  return found === null ? null : starts[found.line] + found.column + 1;
}

/**
 * Walks the masked template and returns one entry per element tag, start and end alike, in
 * document order: `{ kind: 'open', prefix, name, namespace, html, attributes, selfClosed,
 * incomplete, line }` with the 1-based line its `<` is on, or `{ kind: 'close', prefix, name }`.
 * The one walk both markup guards judge and `maskBlockExpressions` steps by, so the three read the
 * same tags.
 *
 * `prefix` is the namespace prefix as written, `''` when there is none, and `name` the local name
 * lower-cased, so a guard's stack balances `<svg:g>` against `</svg:g>` and against the bare `</g>`
 * namespace inheritance makes its end tag (`_getPrefix`). `namespace` is the prefix the element is
 * built under, inherited included (`namespaceOf`), and `html` whether that builds the HTML element
 * `name` names (`isHtml`); a guard judges a control by it, so `<svg:button>` and the bare
 * `<button>` inside `<svg>` are no buttons.
 *
 * A start tag legitimately spans lines — every multi-line binding in the app is written that way —
 * so this tracks position across the whole region rather than per line.
 *
 * @param {string[]} lines the masked template region
 */
export function walkTags(lines) {
  const tags = [];
  const open = [];
  let i = 0;
  let c = 0;

  while (i < lines.length) {
    if (c >= lines[i].length) {
      i++;
      c = 0;
      continue;
    }
    const found = tagAt(lines, i, c);
    if (found !== null) {
      for (const tag of found.tags) tags.push(nested(tag, found.local, open));
      i = found.line;
      c = found.column;
    }
    c++;
  }
  return tags;
}

/**
 * The entry `tag` with its namespace, kept in step with `open`, the elements open around it, each
 * with its local name as written and its namespace. A complete start tag that is not self-closed is
 * pushed, and an end tag pops back to the last open element of its lower-cased local name, as
 * `check-touch-target`'s stack does: a superset of `_popContainer`'s full-name match whose extra
 * pairs are build errors; an end tag with none pops nothing. Blocks are no entries, as
 * `_getClosestElementLikeParent` skips them. An element Angular closes without an end tag (a void
 * one, or a `<p>` its child closes) stays open here until an ancestor's end tag, which changes no
 * namespace: Angular closes one implicitly only in the HTML namespace, whose children inherit `''`
 * either way.
 */
function nested(tag, local, open) {
  if (tag.kind === 'close') {
    const at = open.findLastIndex((element) => element.name === tag.name);
    if (at !== -1) open.length = at;
    return tag;
  }
  const namespace = namespaceOf(tag.prefix, local, open.at(-1));
  if (!tag.selfClosed && !tag.incomplete) open.push({ name: tag.name, local, namespace });
  return { ...tag, namespace, html: isHtml(namespace, local) };
}

/**
 * `getHtmlTagDefinition`'s `implicitNamespacePrefix`, looked up as it is: by the name as written,
 * then lower-cased, so `<SVG>` is `svg` but `<foreignobject>` none.
 */
const IMPLICIT_NAMESPACE = new Map([
  ['svg', 'svg'],
  ['foreignObject', 'svg'],
  ['math', 'math'],
]);

/**
 * The prefix `_getPrefix` gives a start tag: its own, else its name's implicit one, else its
 * closest open element's, unless that element's local name is exactly `foreignObject`, the one
 * definition that sets `preventNamespaceInheritance`; `''` for the HTML namespace.
 */
function namespaceOf(prefix, local, parent) {
  const own =
    prefix || IMPLICIT_NAMESPACE.get(local) || IMPLICIT_NAMESPACE.get(local.toLowerCase());
  if (own) return own;
  if (parent === undefined || parent.local === 'foreignObject') return '';
  return parent.namespace;
}

/**
 * Whether an element built under `namespace` is the HTML element its lower-cased name names.
 * Angular's renderer creates one with no namespace by `createElement`, which lower-cases the name
 * in an HTML document, and any other by `createElementNS(NAMESPACE_URIS[namespace] || namespace,
 * name)`, which keeps its case: only `xhtml` maps to the HTML namespace, and only a lower-case name
 * there is the element it spells (`<xhtml:BUTTON>` is an `HTMLUnknownElement`).
 */
function isHtml(namespace, local) {
  return namespace === '' || (namespace === 'xhtml' && local === local.toLowerCase());
}

/**
 * The tags a `<` at line `i`, column `c` opens or closes, the start tag's local name as written
 * (`local`), and the last position reading them took; null when that `<` opens no tag.
 *
 * A complete start tag whose content is raw text (`isRawText`, by prefix and name) is followed by
 * that content, which `_consumeTagOpen` hands to `_consumeRawTextWithTagClose` as text: the read
 * runs on to the element's end tag and returns it as a close entry beside the start tag, so a
 * guard's open-element stack stays balanced, or to the region's end when there is none. That lexer
 * matches only the bare name's end tag, so `<svg:style>…</style>` closes and `<svg:style>…
 * </svg:style>` runs to the region's end, and the close entry has no prefix. An incomplete start tag
 * returns before that in the lexer, so it starts no raw text, and nor does it here.
 */
function tagAt(lines, i, c) {
  if (lines[i][c] !== '<') return null;
  if (lines[i][c + 1] === '/') return endTagAt(lines, i, c + 2);
  const tag = elementNameAt(lines[i], c + 1);
  if (tag === null) return null;
  const { prefix, name, local } = tag;
  const read = readAttributes(lines, i, c + 1 + tag.length);
  const open = {
    kind: 'open',
    prefix,
    name,
    attributes: read.attributes,
    selfClosed: read.selfClosed,
    incomplete: read.incomplete,
    line: i + 1,
  };
  if (!isRawText(prefix, name) || read.incomplete) {
    return { tags: [open], local, line: read.line, column: read.column };
  }
  const end = rawTextEnd(lines, read.line, read.column + 1, name);
  if (end === null) return { tags: [open], local, ...pastEnd(lines) };
  return { tags: [open, { kind: 'close', prefix: '', name }], local, ...end };
}

/**
 * A tag's prefix and name as `_consumePrefixAndName` reads them: the prefix is an ASCII letter and
 * then ASCII letters and digits up to a `:`, and the name runs on from there. A `-` before any `:`
 * ends the prefix read, so `<svg-x:style>` has no prefix, and its name is all of `svg-x:style`.
 */
const PREFIXED_NAME = /^([A-Za-z][A-Za-z\d]*):([\w-]+)/;

/**
 * The prefix and name of the tag whose name starts at `from`, as `_consumePrefixAndName` reads them,
 * with the name's length in the line; null when that `<` opens no tag. An unprefixed name is
 * `tagNameAt`'s, its prefix `''`. A prefixed one is read by `PREFIXED_NAME` and ended by a
 * `TAG_NAME_END`; a name with a second `:` (`<a:b:c>`, Angular's `:a:b:c`) or a `:` after a `-`
 * (`<svg-x:style>`) is read by neither, and is no tag to the walk, its end tag no more than its start.
 * `name` is the local name lower-cased, `local` the same as written, which the namespace reads.
 *
 * @param {string} line the masked template line
 * @param {number} from the index after the `<`, or after the `</` and its whitespace
 * @returns {{ prefix: string, name: string, local: string, length: number } | null}
 */
function elementNameAt(line, from) {
  const bare = tagNameAt(line, from);
  if (bare !== null) {
    const local = line.slice(from, from + bare.length);
    return { prefix: '', name: bare, local, length: bare.length };
  }
  const read = PREFIXED_NAME.exec(line.slice(from));
  if (read === null || !TAG_NAME_END.test(line[from + read[0].length] ?? ' ')) return null;
  const [whole, prefix, local] = read;
  return { prefix, name: local.toLowerCase(), local, length: whole.length };
}

/** Angular's `isWhitespace`: TAB through SPACE, and NBSP; a line end is one of them. */
const LEXER_WHITESPACE = /[\t-\x20\xa0]/;

/**
 * The end tag read from just past its `</` at line `i`, column `from`, as `_consumeTagClose` reads
 * it: whitespace, the prefix and name (`elementNameAt`, so a prefix starts with a letter, though the
 * lexer reads `</1:div>` too, a build error either way), whitespace, `>`, where either whitespace may
 * cross line ends; null when no name follows. The position is that `>`. When anything else follows
 * the name, Angular emits no end tag and the template never builds, but the entry stands and the
 * walk resumes after the name.
 */
function endTagAt(lines, i, from) {
  const start = pastWhitespace(lines, i, from);
  const tag = elementNameAt(lines[start.line], start.column);
  if (tag === null) return null;
  const nameEnd = start.column + tag.length;
  const end = pastWhitespace(lines, start.line, nameEnd);
  const at = lines[end.line][end.column] === '>' ? end : { line: start.line, column: nameEnd - 1 };
  return { tags: [{ kind: 'close', prefix: tag.prefix, name: tag.name }], ...at };
}

/** The first position from line `i`, column `c` that is no lexer whitespace, or the region's end. */
function pastWhitespace(lines, i, c) {
  let line = i;
  let column = c;
  for (;;) {
    while (LEXER_WHITESPACE.test(lines[line][column] ?? '')) column++;
    if (column < lines[line].length || line === lines.length - 1) return { line, column };
    line++;
    column = 0;
  }
}

/**
 * The position of the `>` that ends a raw-text element's end tag, searching from line `line`,
 * column `column`, as `_consumeRawTextWithTagClose` finds it: `</`, whitespace, the name in any
 * case, whitespace, `>`, where whitespace is the lexer's `isWhitespace` and so spans lines. With
 * none, null: the lexer reads the content to the region's end.
 */
function rawTextEnd(lines, line, column, name) {
  const text = lines.slice(line).join('\n');
  const space = `${LEXER_WHITESPACE.source}*`;
  const close = new RegExp(`</${space}${name}${space}>`, 'gi');
  close.lastIndex = column;
  if (close.exec(text) === null) return null;
  let at = close.lastIndex - 1;
  let i = line;
  while (at >= lines[i].length) {
    at -= lines[i].length + 1;
    i++;
  }
  return { line: i, column: at };
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
