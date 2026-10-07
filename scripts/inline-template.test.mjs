import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CodeTail,
  INLINE_TEMPLATE_EXTENSIONS,
  interpolationStep,
  maskBlockExpressions,
  readAttributes,
  tagNameAt,
  typescriptRegions,
  walkTags,
} from './inline-template.mjs';

/** A tail fed one string at a time, the way a scanner feeds it as it walks code. */
function fed(...pieces) {
  const tail = new CodeTail();
  for (const piece of pieces) tail.push(piece);
  return tail;
}

/**
 * The decision the four guards share, and the reason it is one module: a `template:` key followed
 * by a backtick opens an Angular inline template; anything else — a key that merely ends in
 * `template`, a plural, a string between key and backtick — opens an opaque string. The tail
 * carries across lines, because 44 components under `frontend/src/app` put the backtick on its own
 * line after `template:`.
 */
test('the code before a backtick decides whether it opens an inline template', () => {
  const opens = [
    ['template: '],
    ['template:'],
    ['template :'],
    ['  template:', '\n', '    '],
    ['@Component({', '\n', '  selector: ', '\n', '  template: '],
    ['{ template: '],
    [',', '\n', '  template:', '\n'],
  ];
  for (const pieces of opens) {
    assert.equal(fed(...pieces).opensInlineTemplate(), true, JSON.stringify(pieces));
  }

  const stays = [
    [],
    ['xtemplate: '],
    ['templates: '],
    ['template'],
    ['template = '],
    ['const fixture = '],
    ['template: foo '],
  ];
  for (const pieces of stays) {
    assert.equal(fed(...pieces).opensInlineTemplate(), false, JSON.stringify(pieces));
  }
});

test('a string between the key and the backtick resets the tail', () => {
  const tail = fed('template: ');
  tail.reset();
  tail.push(' ');
  assert.equal(tail.opensInlineTemplate(), false);
});

/**
 * Asking is the backtick: the literal it opens is a string or a template, and never the code
 * before the next backtick. Without this, `template: \`a\`\`b\`` read the second literal as a
 * template too.
 */
test('a backtick consumes the tail', () => {
  const tail = fed('template: ');
  assert.equal(tail.opensInlineTemplate(), true);
  assert.equal(tail.opensInlineTemplate(), false);
  tail.push('template: ');
  assert.equal(tail.opensInlineTemplate(), true);
});

test('the tail is bounded but keeps `template:` across a newline and an indent', () => {
  const tail = fed(`${'x'.repeat(500)}\n  template:`, '\n', ' '.repeat(12));
  assert.equal(tail.opensInlineTemplate(), true);
});

test('only a TypeScript file holds inline templates', () => {
  assert.deepEqual([...INLINE_TEMPLATE_EXTENSIONS].sort(), ['.ts', '.tsx']);
});

/**
 * Inside an inline template a `${…}` is code, not markup: nothing inside it can open an HTML
 * comment or close the literal, and its braces are counted so a nested `{}` does not end it early.
 * `depth` is the caller's, carried across lines by the scanner that owns the loop.
 */
test('an interpolation is code counted by brace depth', () => {
  assert.equal(interpolationStep('<p>hi</p>', 0, 0), null);
  assert.equal(interpolationStep('$ {', 0, 0), null);
  assert.deepEqual(interpolationStep('${a}', 0, 0), { depth: 1, next: 2 });
  assert.deepEqual(interpolationStep('${a}', 2, 1), { depth: 1, next: 3 });
  assert.deepEqual(interpolationStep('${a}', 3, 1), { depth: 0, next: 4 });
  assert.deepEqual(interpolationStep('${ {a:1} }', 3, 1), { depth: 2, next: 4 });
  assert.deepEqual(interpolationStep('${ {a:1} }', 7, 2), { depth: 1, next: 8 });
  // Text inside an interpolation is consumed one character at a time, `<!--` and backtick included.
  assert.deepEqual(interpolationStep('${label("<!-- x -->")}', 9, 1), { depth: 1, next: 10 });
  assert.deepEqual(interpolationStep('${cond ? `a` : `b`}', 9, 1), { depth: 1, next: 10 });
});

/** Walks a whole template line with the step, the way every guard's scanner does. */
function walk(text) {
  let depth = 0;
  const closes = [];
  for (let at = 0; at < text.length; ) {
    const step = interpolationStep(text, at, depth);
    if (step === null) {
      at++;
      continue;
    }
    if (step.depth === 0) closes.push(step.next);
    ({ depth } = step);
    at = step.next;
  }
  return { depth, closes };
}

test('a brace inside a string inside the interpolation counts', () => {
  // The simplification all four guards accept: `"}"` ends the interpolation at the quoted brace.
  assert.deepEqual(walk('${ x("}") }'), { depth: 0, closes: [7] });
  // A balanced pair inside a string is harmless, and the real close is found.
  assert.deepEqual(walk('${ x("{}") }'), { depth: 0, closes: [12] });
  // An unclosed interpolation carries its depth to the next line.
  assert.equal(walk('${ x(').depth, 1);
});

/** The interpolation is code, so the template mask holds its width in blanks. */
function blank(text) {
  return ' '.repeat(text.length);
}

/**
 * The masks keep every line's length, so a finding in either reads off the original file's
 * coordinates. The template mask holds an inline template's text and nothing else; the code mask
 * holds what a call-site search may read — never a comment, a string, or a template literal.
 */
test('typescriptRegions masks a component down to its inline template and its code', () => {
  const lines = [
    '/** A doc comment quoting `<button [disabled]="busy()">` is not markup. */',
    '@Component({',
    "  selector: 'app-thing', // a comment naming focus()",
    '  template: `',
    '    <button [disabled]="busy()">${label}</button>',
    '  `,',
    '})',
    'export class Thing {',
    "  readonly hint = '<button>not markup</button>';",
    '  readonly label = `it\'s <b>bold</b>`;',
    '  go() { this.el.focus(); }',
    '}',
  ];

  const { template, code } = typescriptRegions(lines);

  assert.deepEqual(template.map((line) => line.length), lines.map((line) => line.length));
  assert.deepEqual(code.map((line) => line.length), lines.map((line) => line.length));
  assert.equal(template[4].trim(), `<button [disabled]="busy()">${blank('${label}')}</button>`);
  assert.deepEqual(template.map((line) => line.trim()).filter(Boolean), [template[4].trim()]);
  assert.equal(code[0].trim(), '');
  assert.equal(code[2].trim(), 'selector:            ,');
  assert.equal(code[4].trim(), '');
  assert.equal(code[8].trim(), `readonly hint = ${blank("'<button>not markup</button>'")};`);
  assert.equal(code[9].trim(), `readonly label = ${blank("`it's <b>bold</b>`")};`);
  assert.equal(code[10].trim(), 'go() { this.el.focus(); }');
});

test('typescriptRegions reads only a `template:` literal as an inline template', () => {
  const lines = ['const fixtures = {', '  xtemplate: `', '    <button>Go</button>', '  `,', '};'];

  const { template } = typescriptRegions(lines);

  assert.deepEqual(template.map((line) => line.trim()), ['', '', '', '', '']);
});

test('typescriptRegions carries a block comment and a template across lines', () => {
  const lines = [
    '/* template: `<p>not a template</p>`',
    '   still comment */ const a = 1;',
    '@Component({ template: `',
    '  <p>${cond ? `<b>`: `<i>`}</p>',
    '  <p>${ "}" }</p>`, selector: "x" })',
    'class A {}',
  ];

  const { template, code } = typescriptRegions(lines);

  assert.equal(template[0].trim(), '');
  assert.equal(code[1].trim(), 'const a = 1;');
  assert.equal(template[3].trim(), `<p>${blank('${cond ? `<b>`: `<i>`}')}</p>`);
  // The shared simplification: the quoted brace ends the interpolation, and the rest is text.
  assert.equal(template[4].trim(), `<p>${blank('${ "}')}" }</p>`);
  assert.equal(code[4].trim(), ', selector:     })');
  assert.equal(code[5].trim(), 'class A {}');
});

test('readAttributes reads a start tag across lines up to its `>`', () => {
  const read = readAttributes(['<img', '  src=/a/b/', '  alt="x"/>'], 0, 4);

  assert.deepEqual(Object.fromEntries(read.attributes), {
    src: { value: '/a/b', line: 1 },
    alt: { value: 'x', line: 2 },
  });
  assert.deepEqual([read.line, read.column, read.selfClosed], [2, 10, true]);
});

/** A walk resumes after the position returned; column 0 of the last line re-read the same tag (#1473). */
test('readAttributes that runs off the end stops past the last character', () => {
  for (const [lines, line, column] of [
    [['x <div'], 0, 6],
    [['<a x="foo'], 0, 2],
    [['<a x="foo', 'bar'], 0, 2],
    [['<p>', '  <div a b'], 1, 6],
  ]) {
    const read = readAttributes(lines, line, column);
    const last = lines.length - 1;

    assert.deepEqual([read.line, read.column], [last, lines[last].length]);
  }
});

/**
 * A `<` where an attribute should start ends the tag, as in Angular's lexer, and the read stops one
 * before it: a walk resumes after the position returned, so it reads that `<` as the next tag (#1475).
 */
test('readAttributes ends a start tag at a `<` and stops just before it', () => {
  for (const [lines, line, column, end] of [
    [['{{ n<max }} <button [disabled]="s()">'], 0, 8, [0, 11]],
    [['{{ n<max }}', '<button [disabled]="s()">'], 0, 8, [1, -1]],
  ]) {
    const read = readAttributes(lines, line, column);

    assert.deepEqual([...read.attributes.keys()], ['}}']);
    assert.deepEqual([read.line, read.column], end);
  }
});

/**
 * A start tag is complete only when its `>` ends the read. One ended at a `<`, at a quote where a
 * name should be, or by the region's end is incomplete, as Angular's lexer marks it (#1478).
 */
test('readAttributes says whether the start tag reached its `>`', () => {
  for (const [lines, line, column, incomplete] of [
    [['<button type="button">'], 0, 7, false],
    [['<img', '  src=/a/b/', '  alt="x"/>'], 0, 4, false],
    [['{{ n<max }} <button>'], 0, 8, true],
    [["{{ a<b ? 'x' : 'y' }}"], 0, 6, true],
    [['x <div'], 0, 6, true],
    [['<a x="foo'], 0, 2, true],
  ]) {
    assert.equal(readAttributes(lines, line, column).incomplete, incomplete, lines.join('\n'));
  }
});

/** #1478: a bare value ends at a `<`, as Angular's lexer's `isNameEnd` ends one. */
test('readAttributes ends a bare value at a `<` and the tag just before it', () => {
  const read = readAttributes(['{{ a<b c=<button type="button">'], 0, 6);

  assert.deepEqual(Object.fromEntries(read.attributes), { c: { value: '', line: 0 } });
  assert.deepEqual([read.line, read.column, read.incomplete], [0, 8, true]);
});

test('readAttributes still takes a bare value\'s trailing slash as the self-close marker', () => {
  const read = readAttributes(['<app-badge mode=compact/>'], 0, 10);

  assert.deepEqual(Object.fromEntries(read.attributes), { mode: { value: 'compact', line: 0 } });
  assert.deepEqual([read.selfClosed, read.incomplete], [true, false]);
});

/**
 * The tag-name rule both markup guards apply (#1475): a `<` opens an element only when a letter
 * starts the name and whitespace, `/`, `>` or the line's end follows it — so a comparison such as
 * `count()<limit)` or `i<select.length` is text.
 */
test('tagNameAt reads an element name only where a real tag name ends', () => {
  const cases = [
    ['<button type="button">', 1, 'button'],
    ['<app-pay-panel/>', 1, 'app-pay-panel'],
    ['<SELECT>', 1, 'select'],
    ['</button>', 2, 'button'],
    ['<button', 1, 'button'],
    ['@if (count()<limit) {', 13, null],
    ['{{ i<select.length }}', 5, null],
    ['{{ a<1 }}', 5, null],
    ['{{ a< b }}', 4, null],
  ];
  for (const [line, from, expected] of cases) {
    assert.equal(tagNameAt(line, from), expected, line);
  }
});

/**
 * #1480: Angular's lexer reads a block's parameters (`_consumeBlockParameters`) and a `@let` value
 * (`_consumeLetDeclarationValue`) as expressions, never as markup, so the walk must not find a tag
 * there. Each case is the template before and after; the mask keeps every line's length.
 */
test('maskBlockExpressions blanks block parameters and `@let` values as Angular reads them', () => {
  const cases = [
    ['@if (n<div && a>b) {x}', '@if (            ) {x}'],
    ['} @else if (n<div && a>b) {', '} @else if (            ) {'],
    ['@if(a>b){<b>x</b>}', '@if(   ){<b>x</b>}'],
    ['@if (f(a, g(b))<c > d) {', '@if (                ) {'],
    ["@if (label() === ')' && a>b) {", '@if (                      ) {'],
    ["@switch (k) { @case ('a;b>') { <i></i> } }", "@switch ( ) { @case (      ) { <i></i> } }"],
    ['@for (s of sets(); track s.id; let i = $index) {', '@for (                                       ) {'],
    ['@defer (on viewport; prefetch on idle) {', '@defer (                             ) {'],
    ['} @placeholder (minimum 500ms) {', '} @placeholder (             ) {'],
    ['} @loading (after 100ms; minimum 1s) {', '} @loading (                       ) {'],
    ['@let ok = n<div && a>b;', '@let ok =             ;'],
    ["@let s = 'a;b>' + x; <p></p>", '@let s =           ; <p></p>'],
    ['@if (a<b', '@if (   '],
    ['@let x = a<b', '@let x =    '],
  ];
  for (const [line, expected] of cases) {
    assert.equal(expected.length, line.length, line);
    assert.deepEqual(maskBlockExpressions([line]), [expected], line);
  }
});

test('maskBlockExpressions keeps line geometry across multi-line parameters and values', () => {
  const lines = ['@if (', '  n<div &&', '  a>b', ') {', '@let x =', '  n<y >', '  z;', '<button>'];

  assert.deepEqual(maskBlockExpressions(lines), [
    '@if (',
    '          ',
    '     ',
    ') {',
    '@let x =',
    '       ',
    '   ;',
    '<button>',
  ]);
});

/**
 * #1482: Angular's lexer reads the content of `script` and `style` (raw text) and of `textarea` and
 * `title` (escapable raw text) up to the element's end tag (`_consumeRawTextWithTagClose`), so no
 * block or `@let` opens there; the blocks after the element still do. The lexer judges a `<title>`
 * by its name and prefix alone, so one inside `<svg>` is raw text too, and only `<svg:title>` is
 * parsed.
 */
test('maskBlockExpressions masks nothing inside a raw-text element', () => {
  const cases = [
    ['<textarea>Write @if (a<b</textarea> @if (c<d) {x}', '<textarea>Write @if (a<b</textarea> @if (   ) {x}'],
    ['<title>Mail @let x = a>b</title>@let y = a>b;', '<title>Mail @let x = a>b</title>@let y =    ;'],
    ['<style>@if (a<b</style>@if (c<d) {', '<style>@if (a<b</style>@if (   ) {'],
    ['<script>@let x = a</script>@let y = b;', '<script>@let x = a</script>@let y =  ;'],
    ['<svg><title>@if (a<b) {x}</title></svg>', '<svg><title>@if (a<b) {x}</title></svg>'],
    ['<svg:title>@if (a<b) {x}</svg:title>', '<svg:title>@if (   ) {x}</svg:title>'],
    ['<TEXTAREA rows="4">@if (a</TextArea>@if (b) {', '<TEXTAREA rows="4">@if (a</TextArea>@if ( ) {'],
    ['<title data-x="a>b">@if (a</title>@if (b) {', '<title data-x="a>b">@if (a</title>@if ( ) {'],
    ['<textarea>@if (a</ textarea >@if (b) {', '<textarea>@if (a</ textarea >@if ( ) {'],
    ['<textarea>@if (a</textareax>@if (b) {', '<textarea>@if (a</textareax>@if (b) {'],
    ['<textarea>@if (a<b', '<textarea>@if (a<b'],
    ['<textarea>@if (a<b) {x} @let y = c;', '<textarea>@if (a<b) {x} @let y = c;'],
    ['<p>n<title < @if (a<b) {x}', '<p>n<title < @if (   ) {x}'],
  ];
  for (const [line, expected] of cases) {
    assert.equal(expected.length, line.length, line);
    assert.deepEqual(maskBlockExpressions([line]), [expected], line);
  }
});

test('maskBlockExpressions finds a raw-text element\'s end tag across lines', () => {
  const lines = ['<textarea', '  rows="4">', '@if (a<b', '</textarea', '>', '@if (c<d) {'];

  assert.deepEqual(maskBlockExpressions(lines), [
    '<textarea',
    '  rows="4">',
    '@if (a<b',
    '</textarea',
    '>',
    '@if (   ) {',
  ]);
});

/**
 * #1486: a block after an end tag with whitespace before its name is still masked. A pin, not a
 * proof: before the fix the walk read that end tag as text, which masks the same.
 */
test('maskBlockExpressions masks a block after an end tag with whitespace before its name', () => {
  assert.deepEqual(maskBlockExpressions(['<p>x</ p>@if (a<b) {']), ['<p>x</ p>@if (   ) {']);
  assert.deepEqual(maskBlockExpressions(['<p>x</', '  p', '>@let y = a>b;']), [
    '<p>x</',
    '  p',
    '>@let y =    ;',
  ]);
});

/**
 * A block opens only in text: an `@` inside a tag, an interpolation or an escaped `&#64;` opens none,
 * as Angular's lexer reads them, and a malformed `@let` masks nothing.
 */
test('maskBlockExpressions leaves an `@` outside text alone', () => {
  for (const line of [
    '<p title="@if (a<b)" [x]="@let y = a>b;">x</p>',
    "{{ '@if (' }} <b>a > b</b>",
    "{{ 'it\\'s @if (' + a > b",
    '&#64;if (a<b) <i>x</i>',
    '@letter = a>b;',
    '@let ok a>b;',
    'mail@example.com <i>x</i>',
  ]) {
    assert.deepEqual(maskBlockExpressions([line]), [line], line);
  }
});

/** The walk's entries as a test compares them: `<name` for a start tag, `</name` for an end tag. */
function walked(lines) {
  return walkTags(lines).map((tag) => {
    const name = tag.prefix === '' ? tag.name : `${tag.prefix}:${tag.name}`;
    return tag.kind === 'close' ? `</${name}` : `<${name}`;
  });
}

/**
 * #1484: the walk reads a raw-text element's start tag and its end tag, and nothing between, as
 * `_consumeTagOpen` hands a complete `script`/`style`/`textarea`/`title` start tag to
 * `_consumeRawTextWithTagClose`. The end tag reaches the walk as a close entry in every form that
 * lexer accepts, so a guard's open-element stack stays balanced.
 */
test('walkTags steps over a raw-text element\'s content to its end tag', () => {
  const cases = [
    ['<textarea>Use <button> here</textarea><i>', ['<textarea', '</textarea', '<i']],
    ['<title><b>x</b></title><i>', ['<title', '</title', '<i']],
    ['<style>a::after{content:"<select>"}</style><i>', ['<style', '</style', '<i']],
    ['<script><input></script><i>', ['<script', '</script', '<i']],
    ['<svg><title><button></title></svg>', ['<svg', '<title', '</title', '</svg']],
    ['<svg:title><b>x</b></svg:title>', ['<b', '</b']],
    ['<TEXTAREA rows="4"><b></TextArea><i>', ['<textarea', '</textarea', '<i']],
    ['<title data-x="a>b"><b></title><i>', ['<title', '</title', '<i']],
    ['<textarea><b></ textarea ><i>', ['<textarea', '</textarea', '<i']],
    ['<textarea><b></textareax><i>', ['<textarea']],
    ['<textarea/><b></textarea><i>', ['<textarea', '</textarea', '<i']],
    ['<p>n<title < <b>x</b>', ['<p', '<title', '<b', '</b']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(walked([line]), expected, line);
  }
});

test('walkTags finds a raw-text end tag across lines, and reads none past the end', () => {
  assert.deepEqual(
    walked(['<textarea', '  rows="4">', '<b>', '</', 'textarea', '>', '<button>']),
    ['<textarea', '</textarea', '<button'],
  );
  assert.deepEqual(walked(['<textarea>', '<b>', '<button>']), ['<textarea']);
});

/**
 * #1487: a start tag `_consumePrefixAndName` reads as `prefix:name` is raw text when
 * `getHtmlTagDefinition(name).getContentType(prefix)` says so: `script`, `style`, `textarea` and
 * `title` under any prefix, but `title` under exactly `svg`, which is parsed. The name is matched in
 * any case and the prefix exactly, as the lexer does. `_consumeRawTextWithTagClose` ends the content
 * at the bare name's end tag only, so `</svg:style>` ends nothing. Since #1492 the element is a walk
 * entry, its end tag a bare-name close entry, as an unprefixed raw-text element's is (#1484). A
 * prefix the lexer does not read (`svg-x:`, a second `:`, a name that runs on past `style`) opens no
 * entry and no raw text. Each row is the tree `HtmlParser` builds; a self-closed `<svg:style/>`, a
 * `</svg:style>` and an incomplete start tag are each a build error too, and pin only the lexer's
 * reading.
 */
test('walkTags steps over a prefixed raw-text element\'s content to its bare-name end tag', () => {
  const cases = [
    ['<svg:style><b></style><i>', ['<svg:style', '</style', '<i']],
    ['<xhtml:textarea appTouchTarget><b></textarea><i>', ['<xhtml:textarea', '</textarea', '<i']],
    ['<math:title><b></title><i>', ['<math:title', '</title', '<i']],
    ['<SVG:title><b></title><i>', ['<SVG:title', '</title', '<i']],
    ['<svg:STYLE><b></STYLE><i>', ['<svg:style', '</style', '<i']],
    ['<svg:script><b></script><i>', ['<svg:script', '</script', '<i']],
    ['<svg:textarea><b></textarea><i>', ['<svg:textarea', '</textarea', '<i']],
    ['<x1:textarea><b></textarea><i>', ['<x1:textarea', '</textarea', '<i']],
    ['<svg:style x="a>b"><b></style><i>', ['<svg:style', '</style', '<i']],
    ['<svg:style><b></ style ><i>', ['<svg:style', '</style', '<i']],
    ['<svg:style/><b></style><i>', ['<svg:style', '</style', '<i']],
    ['<svg:style><b></svg:style><i>', ['<svg:style']],
    ['<svg:title><b>x</b></svg:title>', ['<svg:title', '<b', '</b', '</svg:title']],
    ['<svg:TITLE><b></b></svg:TITLE>', ['<svg:title', '<b', '</b', '</svg:title']],
    ['<a:b:style><b></b>', ['<b', '</b']],
    ['<svg-x:style><b></b>', ['<b', '</b']],
    ['<svg:style.x><b></b>', ['<b', '</b']],
    ['<svg:style<b></style><i>', ['<svg:style', '<b', '</style', '<i']],
    ['<svg:style a<b></style><i>', ['<svg:style', '<b', '</style', '<i']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(walked([line]), expected, line);
  }
});

test('walkTags finds a prefixed raw-text end tag across lines, and reads none past the end', () => {
  assert.deepEqual(
    walked(['<svg:style', '  media="x">', '<b>', '</style', '>', '<button>']),
    ['<svg:style', '</style', '<button'],
  );
  assert.deepEqual(walked(['<svg:style>', '<b>']), ['<svg:style']);
});

/**
 * #1492: every start tag `_consumePrefixAndName` reads as `prefix:name` is a walk entry, as Angular
 * builds it (`HtmlParser`: `:xhtml:button[Text "Go"]`, `div[:xhtml:div, button]`). The entry
 * carries the prefix as written and the local name lower-cased, as an unprefixed entry's name is, so
 * a guard's stack balances it against `</prefix:name>` and against the bare `</name>` that namespace
 * inheritance makes its end tag (`_getPrefix`). `_consumeTagClose` reads an end tag's prefix the same
 * way, whitespace around it included. An unprefixed entry's prefix is `''`.
 */
test('walkTags reads a prefixed element\'s start and end tags as entries named by the local name', () => {
  const cases = [
    ['<xhtml:button>Go</xhtml:button>', ['<xhtml:button', '</xhtml:button']],
    ['<div><xhtml:div></div><button>x</button></div>', ['<div', '<xhtml:div', '</div', '<button', '</button', '</div']],
    ['<svg:g><b></b></g><i>', ['<svg:g', '<b', '</b', '</g', '<i']],
    ['<xhtml:DIV></ xhtml:DIV\t>', ['<xhtml:div', '</xhtml:div']],
    ['<x1:div/><i>', ['<x1:div', '<i']],
    ['<svg:g<b></b>', ['<svg:g', '<b', '</b']],
    ['<a:b:c></a:b:c><i>', ['<i']],
    ['<1:div></1:div><i>', ['<i']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(walked([line]), expected, line);
  }
  assert.deepEqual(
    walked(['<svg:g', '  class="x">', '</', '  svg:g', '>']),
    ['<svg:g', '</svg:g'],
  );
  const [open, close] = walkTags(['<button></button>']);
  assert.equal(open.prefix, '');
  assert.equal(close.prefix, '');
  const [svg] = walkTags(['<svg:g class="x" />']);
  assert.deepEqual([svg.attributes.has('class'), svg.selfClosed, svg.incomplete, svg.line], [true, true, false, 1]);
});

/**
 * #1492: `html` is whether the tag's own spelling builds the HTML element its `name` names. An
 * unprefixed tag is created with `createElement`, which lower-cases its name in an HTML document; a
 * prefixed one with `createElementNS(NAMESPACE_URIS[prefix] || prefix, name)`, which keeps the case,
 * and only the exact prefix `xhtml` maps to the HTML namespace. So `<xhtml:button>` is an
 * `HTMLButtonElement`, while `<svg:button>`, `<XHTML:button>` and `<xhtml:BUTTON>` are not. Namespace
 * inheritance is not followed: an unprefixed tag is `html` wherever it stands, as it was judged
 * before.
 */
test('walkTags marks the start tags whose own spelling builds an HTML element', () => {
  const cases = [
    ['<button>', true],
    ['<BUTTON>', true],
    ['<xhtml:button>', true],
    ['<xhtml:my-el>', true],
    ['<svg:button>', false],
    ['<XHTML:button>', false],
    ['<xhtml:BUTTON>', false],
    ['<math:input>', false],
  ];
  for (const [line, html] of cases) {
    assert.equal(walkTags([line])[0].html, html, line);
  }
});

/**
 * #1487: no block or `@let` opens inside a prefixed raw-text element, and the ones after it still
 * do (`HtmlParser`: `:svg:style[Text "@if (a<b) {x}"], Block`).
 */
test('maskBlockExpressions masks nothing inside a prefixed raw-text element', () => {
  const cases = [
    ['<svg:style>@if (a<b) {x}</style>@if (c<d) {y}', '<svg:style>@if (a<b) {x}</style>@if (   ) {y}'],
    ['<xhtml:textarea>@let x = a>b</textarea>@let y = a>b;', '<xhtml:textarea>@let x = a>b</textarea>@let y =    ;'],
  ];
  for (const [line, expected] of cases) {
    assert.equal(expected.length, line.length, line);
    assert.deepEqual(maskBlockExpressions([line]), [expected], line);
  }
});

/**
 * #1486: an end tag as `_consumeTagClose` reads it: `</`, whitespace, the name, whitespace, `>`,
 * where whitespace is the lexer's `isWhitespace` (TAB through SPACE, NBSP) and so spans lines. An
 * EM SPACE is no lexer whitespace, and a `</` with no name after it is no end tag.
 */
test('walkTags reads an end tag with whitespace around its name', () => {
  for (const lines of [
    ['<p>x</ p><i>'],
    ['<p>x</\tp><i>'],
    ['<p>x</\u00a0p><i>'],
    ['<p>x</\fp><i>'],
    ['<p>x</\vp><i>'],
    ['<p>x</p \t><i>'],
    ['<p>x</ p', '  ><i>'],
    ['<p>x</', 'p><i>'],
    ['<p>x</ ', '', '  p', '>', '<i>'],
    ['<p>x</ p q><i>'],
  ]) {
    assert.deepEqual(walked(lines), ['<p', '</p', '<i'], lines.join('⏎'));
  }
  for (const lines of [['<p>x</ ><i>'], ['<p>x</\u2003p><i>'], ['<p>a </ 3<i>']]) {
    assert.deepEqual(walked(lines), ['<p', '<i'], lines.join('⏎'));
  }
  assert.deepEqual(walked(['<p>x</ ', '']), ['<p']);
});

/** A start tag's entry carries what the guards judge; the 1-based line is where its `<` is. */
test('walkTags reports a start tag\'s attributes, line and form', () => {
  const lines = ['<p>', '<textarea', '  [disabled]="saving()">x</textarea><i/>'];
  const [open, close, after] = walkTags(lines).slice(1);

  assert.equal(open.name, 'textarea');
  assert.equal(open.line, 2);
  assert.deepEqual(open.attributes.get('[disabled]'), { value: 'saving()', line: 2 });
  assert.equal(open.selfClosed, false);
  assert.equal(open.incomplete, false);
  assert.deepEqual(close, { kind: 'close', name: 'textarea' });
  assert.equal(after.selfClosed, true);
});
