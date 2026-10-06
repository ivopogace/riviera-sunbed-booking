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
