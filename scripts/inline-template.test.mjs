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

/** A mask's non-blank lines, each with its runs of blanks read as one space. */
function kept(mask) {
  return mask.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
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

/**
 * #1494: each `template:` literal is its own template to Angular, which builds an element left open
 * at its end (`<svg><g>` parses with no error), so `templates` masks each literal apart, geometry
 * kept, for a walk that must not carry one template's open elements into the next.
 */
test('typescriptRegions masks each inline template apart as well', () => {
  const lines = [
    '@Component({ template: `<svg><g>` })',
    'export class Chart {}',
    '@Component({',
    '  template: `<button>x</button>`,',
    '})',
    'export class Panel {}',
  ];

  const { template, templates } = typescriptRegions(lines);

  assert.equal(templates.length, 2);
  for (const mask of templates) {
    assert.deepEqual(mask.map((line) => line.length), lines.map((line) => line.length));
  }
  assert.deepEqual(templates[0].map((line) => line.trim()).filter(Boolean), ['<svg><g>']);
  assert.deepEqual(templates[1].map((line) => line.trim()).filter(Boolean), ['<button>x</button>']);
  assert.deepEqual(template.map((line) => line.trim()).filter(Boolean), [
    '<svg><g>',
    '<button>x</button>',
  ]);
  assert.deepEqual(typescriptRegions(['const a = 1;']).templates, []);
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

/**
 * #1496: Angular's lexer reads `<!--` to the first `-->` after it as a `Comment` node
 * (`_consumeComment`), so `template` blanks an inline template's comment as an external one is
 * blanked, and a control spelled inside it is no control. `<!-->`, `<!--->` and `--!>` end nothing.
 * `templates`, the tag walk's input, keeps it: the walk steps over a comment itself.
 */
test('typescriptRegions blanks a template comment where Angular\'s lexer ends it', () => {
  const lines = [
    '@Component({',
    '  template: `<!-- <button>x</button> --><p>ok</p> <!--',
    '<input />',
    '    --><i></i>',
    '    <!--><b>-->,<!---><u>-->,<!-- --!><s> --><br>',
    '  `,',
    '})',
  ];

  const { template, templates, code } = typescriptRegions(lines);

  assert.deepEqual(templates[0].slice(1, 3), [
    '             <!-- <button>x</button> --><p>ok</p> <!--',
    '<input />',
  ]);
  assert.deepEqual(template.map((line) => line.length), lines.map((line) => line.length));
  assert.deepEqual(kept(template), ['<p>ok</p>', '<i></i>', ', , <br>']);
  assert.deepEqual(kept(code), ['@Component({', 'template:', ',', '})']);
});

/**
 * #1496: a comment is blanked only when the scan reads its whole span as the text Angular reads.
 * One that its literal ends before closing is a build error, and one that spans an interpolation or
 * an escape may end inside it, so neither hides what follows: the scan keeps it as markup. So does
 * a processing instruction whose quote never closes, a build error that runs to the literal's end.
 */
test('typescriptRegions keeps a comment it cannot end as Angular would', () => {
  const lines = [
    '@Component({ template: `<!-- <button>a</button>` })',
    '@Component({ template: `<button>b</button> -->` })',
    '@Component({ template: `<!-- ${x} <button>c</button> -->` })',
    '@Component({ template: `<!-- -\\-> <button>d</button> -->` })',
    '@Component({ template: `<?x "> <!-- <button>e</button> -->` })',
  ];

  const { template } = typescriptRegions(lines);

  assert.deepEqual(template.map((line) => line.trim()), [
    '<!-- <button>a</button>',
    '<button>b</button> -->',
    `<!-- ${blank('${x}')} <button>c</button> -->`,
    `<!-- -${blank('\\-')}> <button>d</button> -->`,
    '<?x "> <!-- <button>e</button> -->',
  ]);
});

/**
 * #1496: the lexer opens a comment only where it reads markup, in text or at an interpolation's
 * early end. In a quoted attribute value, raw text, CDATA, a doctype, a processing instruction, a
 * block's parameters or a `@let` value a `<!--` is text, so none of these blanks the control after
 * it: `HtmlParser` builds each `markup` tree with its `button`, and each `blanked` one with none.
 * After a `${…}` or an escape the cooked text is unknown, so the last two `markup` entries stay.
 */
test('typescriptRegions opens a comment only where Angular\'s lexer does', () => {
  const markup = [
    '<div title="<!--"><button>x</button></div><!-- c -->',
    '<textarea><!-- </textarea><button>x</button> -->',
    '<svg><style><!-- </style><button>x</button> --></svg>',
    '<![CDATA[ <!-- ]]><button>x</button> -->',
    '<!DOCTYPE <!-- ><button>x</button> -->',
    '@if (a == "<!--") {<button>x</button>} -->',
    '@let x = "<!--"; <button>x</button> -->',
    '<?x <!-- ><button>x</button> -->',
    '<?x ">" <!-- ?><button>x</button> -->',
    '{{ a // " }}@let x = "<!--"; <button>x</button> -->',
    '{{ a //<!-- }}<button>x</button> -->',
    '${a}<!-- <button>x</button> -->',
    '\\n<!-- <button>x</button> -->${a}',
  ];
  const blanked = [
    '<p>{{ a }}<!-- <button>x</button> --></p>',
    '<p>{{ a <!-- b }}<button>x</button> --></p>',
    '<p>{{ "<!-- }}" }}<button>x</button> --></p>',
    '<p>{{ a // " }}<!-- <button>x</button> --></p>',
    '{{ "@if (" }}<!-- <button>x</button> -->)',
    '<!DOCTYPE ">" <!-- <button>x</button> -->',
    '<!><!-- <button>x</button> -->',
    '<a href="https://x.y/z"></a><!-- <button>x</button> -->',
  ];

  for (const body of markup) {
    const { template } = typescriptRegions([`@Component({ template: \`${body}\` })`]);
    assert.match(template[0], /<button>x<\/button>/, body);
  }
  for (const body of blanked) {
    const { template } = typescriptRegions([`@Component({ template: \`${body}\` })`]);
    assert.doesNotMatch(template[0], /button/, body);
  }
});

/**
 * #1496: a start tag the walk cannot read to its `>` (`readAttributes` marks it incomplete, or no
 * name it knows follows the `<`) is a build error in Angular or a misread, so the scan stops
 * reading comments there, as at an escape; so does one holding a `//` or `/*` outside quotes, a
 * start-tag comment (`_consumeSingleLineComment`, `_consumeMultiLineComment`) the walk reads as
 * attributes. `HtmlParser` builds each `div` below with its `role`; the `a[a]` one is a build
 * error, where stopping costs nothing.
 */
test('typescriptRegions reads no comment past a start tag it cannot read', () => {
  for (const body of [
    '<div title = "<!--" role="dialog">x</div><!-- end -->',
    '<div // <!--\n role="dialog" -->>x</div>',
    '<div /* <!-- */ role="dialog" -->>x</div>',
    '<a[a]="<!--" role="dialog">x</a><!-- end -->',
    '<div //><!-- \n role="dialog">x</div><!-- end -->',
    '<div /*><!--*/ role="dialog">x</div><!-- end -->',
  ]) {
    const lines = `@Component({ template: \`${body}\` })`.split('\n');
    assert.match(typescriptRegions(lines).template.join('\n'), /role="dialog"/, body);
  }
});

test('readAttributes reads a start tag across lines up to its `>`', () => {
  const read = readAttributes(['<img', '  src=/a/b/', '  alt="x"/>'], 0, 4);

  assert.deepEqual(Object.fromEntries(read.attributes), {
    src: { value: '/a/b', line: 1 },
    alt: { value: 'x', line: 2 },
  });
  assert.deepEqual([read.line, read.column, read.selfClosed], [2, 10, true]);
});

/**
 * #1503: Angular's lexer reads whitespace around an attribute's `=` (`_consumeAttribute`) and a
 * `//` to its line's end or a `/* … *\/` between attributes as a start-tag comment
 * (`_consumeTagOpen`), so `readAttributes` reads them too; a `/*` that never closes ends no tag.
 */
test('readAttributes reads a spaced `=` and steps over start-tag comments', () => {
  const read = (lines) => {
    const tag = readAttributes(lines, 0, 4);
    return [Object.fromEntries(tag.attributes), tag.line, tag.column, tag.incomplete];
  };
  assert.deepEqual(read(['<div a = "x" b', '=', "'y' c =z>"]), [
    { a: { value: 'x', line: 0 }, b: { value: 'y', line: 0 }, c: { value: 'z', line: 2 } },
    2,
    8,
    false,
  ]);
  assert.deepEqual(read(['<div // a="x" >', '  b="y">']), [{ b: { value: 'y', line: 1 } }, 1, 7, false]);
  assert.deepEqual(read(['<div /* > a="x" */ b="y">']), [{ b: { value: 'y', line: 0 } }, 0, 24, false]);
  assert.deepEqual(read(['<div /* a="x"']), [{}, 0, 13, true]);
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

/**
 * #1503: a comment, a doctype or a processing instruction is one token to Angular's lexer, so no
 * block or `@let` opens in one, and the mask blanks nothing on its account (`HtmlParser`: `Comment,
 * b[";"]`; `b[";"]`; `b[")"]`).
 */
test('maskBlockExpressions reads no block or `@let` in a comment, doctype or processing instruction', () => {
  for (const line of [
    '<!-- @let x = --><b>;</b>',
    '<!-- @if ( --><b>)</b>',
    '<!DOCTYPE "@let x = "><b>;</b>',
    '<?x @if ( ?><b>)</b>',
  ]) {
    assert.deepEqual(maskBlockExpressions([line]), [line], line);
  }
});

/**
 * #1502: a CDATA section is raw text to its `]]>` (`_consumeCdata`), so its content is blanked, its
 * delimiters kept, and no block or `@let` opens in it (`HtmlParser`: `" @let a = ", b["x"], ";"`;
 * `" @if ( ", b["x"], ")"`). The blocks after the section are masked as anywhere, and a
 * `<![CDATA[` in a comment opens no section (`Comment, @let x, "]]>"`).
 */
test('maskBlockExpressions blanks a CDATA section\'s content and reads nothing in it', () => {
  const cases = [
    ['<![CDATA[ @let a = ]]><b>x</b>;', '<![CDATA[          ]]><b>x</b>;'],
    ['<![CDATA[ @if ( ]]><b>x</b>)', '<![CDATA[       ]]><b>x</b>)'],
    ['<![CDATA[x]]>@if (a<b) {', '<![CDATA[ ]]>@if (   ) {'],
    ['<!-- <![CDATA[ -->@let x = a<b;]]>', '<!-- <![CDATA[ -->@let x =    ;]]>'],
  ];
  for (const [line, expected] of cases) {
    assert.equal(expected.length, line.length, line);
    assert.deepEqual(maskBlockExpressions([line]), [expected], line);
  }
  assert.deepEqual(maskBlockExpressions(['<![CDATA[', '@let a =', ']]>@let b = a>c;']), [
    '<![CDATA[',
    '        ',
    ']]>@let b =    ;',
  ]);
});

/** The walk's entries as a test compares them: `<name` or `<prefix:name`, and `</` likewise. */
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
    ['<svg:title><b>x</b></svg:title>', ['<svg:title', '<b', '</b', '</svg:title']],
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
 * at the bare name's end tag only, so `</svg:style>` ends nothing. The element is a walk entry, its
 * end tag a bare-name close entry, as an unprefixed raw-text element's is (#1484). A name the walk
 * does not read (`svg-x:`, a second `:`, a name that runs on past `style`, one glued to the next
 * `<`) opens no entry and no raw text; an incomplete start tag opens an entry but no raw text. Each
 * row is the tree `HtmlParser` builds; a self-closed `<svg:style/>`, a `</svg:style>` and an
 * incomplete start tag are each a build error too, and pin only the lexer's reading.
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
    ['<svg:style<b></style><i>', ['<b', '</style', '<i']],
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
 * carries the prefix as written and the local name lower-cased, as an unprefixed entry's name is,
 * so a guard's stack balances it against `</prefix:name>` and against the bare `</name>` that
 * namespace inheritance makes its end tag (`_getPrefix`). `_consumeTagClose` reads an end tag's
 * prefix the same way, whitespace around it included. An unprefixed entry's prefix is `''`. The
 * last three rows are build errors or names the walk does not read (`elementNameAt`), and pin only
 * the walk's reading.
 */
test('walkTags reads a prefixed element\'s start and end tags, named by the local name', () => {
  const cases = [
    ['<xhtml:button>Go</xhtml:button>', ['<xhtml:button', '</xhtml:button']],
    [
      '<div><xhtml:div></div><button>x</button></div>',
      ['<div', '<xhtml:div', '</div', '<button', '</button', '</div'],
    ],
    ['<svg:g><b></b></g><i>', ['<svg:g', '<b', '</b', '</g', '<i']],
    ['<xhtml:DIV></ xhtml:DIV\t>', ['<xhtml:div', '</xhtml:div']],
    ['<x1:div/><i>', ['<x1:div', '<i']],
    ['<svg:g<b></b>', ['<b', '</b']],
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
  assert.deepEqual(
    [[...svg.attributes.keys()], svg.selfClosed, svg.incomplete, svg.line],
    [['class'], true, false, 1],
  );
});

/**
 * #1492: with no namespace inherited, `html` is whether the tag's own spelling builds the HTML
 * element its `name` names. An unprefixed tag is created with `createElement`, which lower-cases
 * its name in an HTML document; a prefixed one with `createElementNS(NAMESPACE_URIS[prefix] ||
 * prefix, name)`, which keeps the case, and only the exact prefix `xhtml` maps to the HTML
 * namespace. So `<xhtml:button>` is an `HTMLButtonElement`, while `<svg:button>`, `<XHTML:button>`
 * and `<xhtml:BUTTON>` are not.
 */
test('walkTags marks a lone start tag html by its own spelling', () => {
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
 * #1494: a tag's namespace is the one `_getPrefix` gives it: its own prefix, else its name's
 * `implicitNamespacePrefix` (`svg`, `foreignObject` → `svg`, `math` → `math`, looked up exactly and
 * then lower-cased), else its closest open element's, unless that element's local name is exactly
 * `foreignObject` (`preventNamespaceInheritance`). Blocks are no parent, and a self-closed or
 * incomplete tag encloses nothing, and an end tag closes the open elements it skips. Each row's
 * `HtmlParser` tree: `:svg:svg[:svg:button]`,
 * `:svg:svg[:svg:foreignObject[button]]`, `:svg:svg[:svg:foreignobject[:svg:button]]`, and so on.
 */
test('walkTags gives a start tag the namespace Angular\'s parser does, inherited included', () => {
  const cases = [
    ['<svg><button></button></svg>', [['svg', false], ['svg', false]]],
    ['<math><button></button></math>', [['math', false], ['math', false]]],
    ['<SVG><Math><button>', [['svg', false], ['math', false], ['math', false]]],
    [
      '<svg><foreignObject><button></button></foreignObject></svg>',
      [['svg', false], ['svg', false], ['', true]],
    ],
    ['<svg><foreignobject><button>', [['svg', false], ['svg', false], ['svg', false]]],
    ['<svg><x:foreignObject><BUTTON>', [['svg', false], ['x', false], ['', true]]],
    ['<foreignObject><p>', [['svg', false], ['', true]]],
    ['<svg></svg><button>', [['svg', false], ['', true]]],
    [
      '<svg><foreignObject><p></foreignObject><button>',
      [['svg', false], ['svg', false], ['', true], ['svg', false]],
    ],
    ['<svg/><button>', [['svg', false], ['', true]]],
    ['<svg <button>', [['svg', false], ['', true]]],
    ['<svg>@if (a) {<button></button>}</svg>', [['svg', false], ['svg', false]]],
    ['<svg><g></g><button>', [['svg', false], ['svg', false], ['svg', false]]],
    ['<svg><xhtml:button>', [['svg', false], ['xhtml', true]]],
    ['<xhtml:div><button><BUTTON>', [['xhtml', true], ['xhtml', true], ['xhtml', false]]],
    ['<svg:g><button>', [['svg', false], ['svg', false]]],
    ['<svg:style></style><button>', [['svg', false], ['', true]]],
  ];
  for (const [line, expected] of cases) {
    const opens = walkTags([line]).filter((tag) => tag.kind === 'open');
    assert.deepEqual(
      opens.map((tag) => [tag.namespace, tag.html]),
      expected,
      line,
    );
  }
});

/**
 * #1498: a start tag is `void` when Angular closes it at the next token: its name, lower-cased, is
 * one `getHtmlTagDefinition` marks `isVoid` (22.1.6: the fourteen below), and it builds in the
 * namespace `''`. A prefixed or inherited one is looked up by its full name (`:xhtml:param`,
 * `:svg:param`), finds the default definition and encloses (`HtmlParser`:
 * `:svg:svg[:svg:param[:svg:foreignObject[button]]]`).
 */
test('walkTags marks a start tag void as Angular\'s tag definitions do', () => {
  for (const name of ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr']) {
    assert.equal(walkTags([`<${name}>`])[0].void, true, name);
    assert.equal(walkTags([`<${name}/>`])[0].void, true, `${name}/`);
  }
  for (const line of ['<PARAM>', '<Img src="x">', '<div><param>']) {
    assert.equal(walkTags([line]).at(-1).void, true, line);
  }
  for (const line of ['<button>', '<p>', '<keygen>', '<xhtml:param>', '<svg:input>',
    '<svg><param>', '<math><input>', '<svg><foreignObject><div><x:param>']) {
    assert.equal(walkTags([line]).at(-1).void, false, line);
  }
  assert.equal(walkTags(['<svg><foreignObject><param>']).at(-1).void, true);
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
  assert.equal(open.prefix, '');
  assert.equal(open.line, 2);
  assert.deepEqual(open.attributes.get('[disabled]'), { value: 'saving()', line: 2 });
  assert.equal(open.selfClosed, false);
  assert.equal(open.incomplete, false);
  assert.deepEqual(close, { kind: 'close', prefix: '', name: 'textarea' });
  assert.equal(after.selfClosed, true);
});

/** The walk's entries as `<name`, `</name`, and `~name` for a close with no end tag of its own. */
function closes(lines) {
  return walkTags(lines).map((tag) => {
    const name = tag.prefix === '' ? tag.name : `${tag.prefix}:${tag.name}`;
    if (tag.kind === 'open') return `<${name}`;
    return tag.implicit ? `~${name}` : `</${name}`;
  });
}

/**
 * #1497: the walk emits a close where Angular's tree builder closes an element with no end tag of
 * its own. `_pushContainer` pops the current container when its definition `isClosedByChild` the
 * new element's lower-cased full name (22.1.6 `closedByChildren`), so only an HTML-namespace parent
 * and child, and only the top element, never one under a block, an ICU case or another element
 * (`HtmlParser`: `p["a"], ul[]`; `p[b[div[]]]`; `p[:svg:svg[]]`; `table[tr[td["a"], td["b",
 * tr[td[]]]]]`).
 */
test('walkTags closes an element its child closes, as Angular\'s tag definitions do', () => {
  const cases = [
    ['<p>a<ul></ul><button>', ['<p', '~p', '<ul', '</ul', '<button']],
    ['<p><p>', ['<p', '~p', '<p']],
    ['<P><DIV>', ['<p', '~p', '<div']],
    ['<p><hr/><button>', ['<p', '~p', '<hr', '<button']],
    ['<ul><li>a<li><button>x</button></ul>',
      ['<ul', '<li', '~li', '<li', '<button', '</button', '~li', '</ul']],
    ['<table><tr><td>a<td>b<tr><td>', ['<table', '<tr', '<td', '~td', '<td', '<tr', '<td']],
    ['<tbody><tbody><thead><tfoot>', ['<tbody', '~tbody', '<tbody', '<thead', '~thead', '<tfoot']],
    ['<select><option>a<option>b<optgroup><option>',
      ['<select', '<option', '~option', '<option', '~option', '<optgroup', '<option']],
    ['<dl><dt>a<dd>b<dt>', ['<dl', '<dt', '~dt', '<dd', '~dd', '<dt']],
    ['<ruby><rb>a<rt>b<rp>c<rtc>d', ['<ruby', '<rb', '~rb', '<rt', '~rt', '<rp', '~rp', '<rtc']],
    ['<p>{{ a }}<div>', ['<p', '~p', '<div']],
    ['<p><svg>', ['<p', '<svg']],
    ['<p><b><div>', ['<p', '<b', '<div']],
    ['<p><xhtml:div>', ['<p', '<xhtml:div']],
    ['<xhtml:p><div>', ['<xhtml:p', '<div']],
    ['<svg><p><div>', ['<svg', '<p', '<div']],
    ['<p>@if (a) {<div></div>}', ['<p', '<div', '</div']],
    ['<p>@if (a) <div>', ['<p', '~p', '<div']],
    ['<p>@default never;<div>', ['<p', '~p', '<div']],
    ['<p>{n, plural, =0 {<div>x</div>} other {y}}<button>', ['<p', '<div', '</div', '<button']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(closes(maskBlockExpressions([line])), expected, line);
  }
});

/**
 * #1497: a block's `}` pops everything above the block (`_popContainer(null, Block, …)`), and an
 * ICU case's `}` everything above the case, which `_parseExpansionCase` builds as its own tree;
 * a `}` inside an interpolation or with no block open closes nothing (`HtmlParser`: `@if{p["x"]},
 * button[]`; `@if{p[ICU("y"), button[]]}`; `ICU(p["a"]), button[]`). An ICU's head and a case's
 * value are raw text, a form's `{` opens a case even before `{{`, and inside an ICU no block opens
 * (`ICU(p["a"]|"c"), button[]`; `ICU("y")`; `ICU("x@if (a) ", ICU())`). A `{` with no ICU head
 * fails a build and is read as text.
 */
test('walkTags closes what a block or an ICU case leaves open at its `}`', () => {
  const cases = [
    ['@if (a) {<p>x}<button>', ['<p', '~p', '<button']],
    ['@if (a) {<li>x} @else {<li>y}', ['<li', '~li', '<li', '~li']],
    ['@if (a) {<p>{{ b }}x}<button>', ['<p', '~p', '<button']],
    ['@if (a)\n{<p>x}', ['<p', '~p']],
    ['@switch (a) { @case (1) {<p>x} @case (2) @case (3) {<p>y}}<div>',
      ['<p', '~p', '<p', '~p', '<div']],
    ['@if (a) {<p>{n, select, x {y}}<button></button>}', ['<p', '<button', '</button', '~p']],
    ['@if (a) {<li><p>x}', ['<li', '<p', '~p', '~li']],
    ['{n, select, x {<p>a}}<button>', ['<p', '~p', '<button']],
    ['{n, select, x {<p>a<div>b</div>}}', ['<p', '~p', '<div', '</div']],
    ['<p>}<button>', ['<p', '<button']],
    ['{n, select, x {{{ a }}<p>}}<button>', ['<p', '~p', '<button']],
    ['{n, select, x {<p>a} =1 <b> {c}}<button>', ['<p', '~p', '<button']],
    ['{n<b>, select, x {y}}', []],
    ['{n, select, x {x@if (a) {<img>n, select, y {}}}}<button>', ['<button']],
    ['{n, select, x {a} }<p><div>{m, select, y {z}}', ['<p', '~p', '<div']],
    ['<p>{ a }<div>', ['<p', '~p', '<div']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(closes(maskBlockExpressions(line.split('\n'))), expected, line);
  }
});

/**
 * #1497: a void element is closed by the next token (`_closeVoidElement`), or by the start tag
 * after it, which `isClosedByChild` lets close the void element alone. An ICU right after it is no
 * such token, so it builds inside the void element (`HtmlParser`: `p[input[], div[]]`; `p[input[],
 * " "], div[]`; `p[input[ICU(div[])], div[]]`).
 */
test('walkTags closes a void element at the next token, and only the void element', () => {
  const cases = [
    ['<p><input><div>', ['<p', '<input', '~input', '<div']],
    ['<p><input> <div>', ['<p', '<input', '~input', '~p', '<div']],
    ['<p><input></p>', ['<p', '<input', '~input', '</p']],
    ['<p><input>{n, select, x {<div>}}<div>', ['<p', '<input', '<div', '~div', '~input', '<div']],
    ['<p><br>@if (a) {x}<div>', ['<p', '<br', '~br', '~p', '<div']],
    ['<input/><div>', ['<input', '<div']],
    ['<svg><input><g>', ['<svg', '<input', '<g']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(closes(maskBlockExpressions([line])), expected, line);
  }
});

/** #1497: an ICU case is built by its own tree builder, so its elements inherit no namespace. */
test('walkTags gives an element in an ICU case no parent namespace', () => {
  const opens = walkTags(['<svg>{n, select, x {<button>}}<g>']).filter(
    (tag) => tag.kind === 'open',
  );
  assert.deepEqual(
    opens.map((tag) => [tag.name, tag.namespace, tag.html]),
    [['svg', 'svg', false], ['button', '', true], ['g', 'svg', false]],
  );
});

/**
 * #1497: an end tag closes the element of its full name, as `_popContainer` matches it, so `</P>`
 * closes the `<P>`, not a `<p>` left open inside it, and the elements it pops past each get an
 * implicit close first (`HtmlParser`: `P[li[p[]]], li[]`; `ul[li[p["a"]]], p[]`). With no element
 * of that name, which fails a build, it closes the last of its lower-cased name; a block it pops
 * past, also a build error, gets no close entry.
 */
test('walkTags closes the element an end tag names in full, and what it pops past', () => {
  const cases = [
    ['<P><li><p></P><li>', ['<p', '<li', '<p', '~p', '~li', '</p', '<li']],
    ['<ul><li><p>a</ul><p>', ['<ul', '<li', '<p', '~p', '~li', '</ul', '<p']],
    ['<svg:style></style><g>', ['<svg:style', '</style', '<g']],
    ['<P><b></p><i>', ['<p', '<b', '~b', '</p', '<i']],
    ['<div>@if (a) {<p></div>', ['<div', '<p', '~p', '</div']],
  ];
  for (const [line, expected] of cases) assert.deepEqual(closes([line]), expected, line);
});

/**
 * #1497: every row of `getHtmlTagDefinition`'s `closedByChildren` (`@angular/compiler` 22.1.6),
 * copied here so a dropped or misspelt name fails; a child outside a row closes nothing.
 */
test('walkTags closes each element at exactly the children Angular\'s definitions name', () => {
  const rows = {
    p: ['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'nav', 'ol', 'p', 'pre',
      'section', 'table', 'ul'],
    thead: ['tbody', 'tfoot'],
    tbody: ['tbody', 'tfoot'],
    tfoot: ['tbody'],
    tr: ['tr'],
    td: ['td', 'th'],
    th: ['td', 'th'],
    li: ['li'],
    dt: ['dt', 'dd'],
    dd: ['dt', 'dd'],
    rb: ['rb', 'rt', 'rtc', 'rp'],
    rt: ['rb', 'rt', 'rtc', 'rp'],
    rtc: ['rb', 'rtc', 'rp'],
    rp: ['rb', 'rt', 'rtc', 'rp'],
    optgroup: ['optgroup'],
    option: ['option', 'optgroup'],
  };
  const names = new Set([...Object.keys(rows), ...Object.values(rows).flat(), 'span', 'li']);
  for (const parent of [...Object.keys(rows), 'div', 'ul']) {
    for (const child of names) {
      const closed = rows[parent]?.includes(child) === true;
      const line = `<${parent}><${child}>`;
      const expected = closed
        ? [`<${parent}`, `~${parent}`, `<${child}`]
        : [`<${parent}`, `<${child}`];
      assert.deepEqual(closes([line]), expected, line);
    }
  }
});

/**
 * #1497: an HTML comment is one node to Angular (`_consumeComment`), so nothing in it opens or
 * closes a container: no tag, block, ICU or `}`, which an inline `.ts` template leaves unmasked
 * (`HtmlParser`: `@if{li["x", Comment, button["y"]]}`; `Comment, "x", button["y"]`; `p[Comment],
 * div[]`). Like any node, it closes a void element; an unterminated one fails a build and is
 * stepped over at its `<!--` alone.
 */
test('walkTags steps over an HTML comment as one token', () => {
  const cases = [
    ['@if (a) {<li>x<!-- } --><button>y</button>}', ['<li', '<button', '</button', '~li']],
    ['<!-- {a, b, -->x<button>y</button>', ['<button', '</button']],
    ['<p><!-- @if (a) { --><div>', ['<p', '~p', '<div']],
    ['<!-- <button> --><p>', ['<p']],
    ['<p><input><!-- c --><div>', ['<p', '<input', '~input', '~p', '<div']],
    ['<!--><button>', ['<button']],
    ['<!-- x <button>', ['<button']],
  ];
  for (const [line, expected] of cases) {
    assert.deepEqual(closes(maskBlockExpressions([line])), expected, line);
  }
});

/**
 * #1497: a CDATA section is one token as well (`_consumeCdata`), so a `<!--` or a tag in it opens
 * nothing (`HtmlParser`: `" <!-- ", button["x"], Comment`; `" <button> "`; `p[input[], "x"],
 * div[]`).
 */
test('walkTags steps over a CDATA section as one token', () => {
  const cases = [
    ['<![CDATA[ <!-- ]]><button>x</button><!-- -->', ['<button', '</button']],
    ['<![CDATA[ <button> ]]>', []],
    ['<p><input><![CDATA[x]]><div>', ['<p', '<input', '~input', '~p', '<div']],
  ];
  for (const [line, expected] of cases) assert.deepEqual(closes([line]), expected, line);
});

/**
 * #1503: a doctype (`_consumeDocType`, to its first `>`) and a processing instruction
 * (`_consumeProcessingInstruction`, to a `?` or `>` outside quotes) are one token each, so no tag
 * or `<!--` in one opens; neither is a node, so neither closes a void element (`HtmlParser`: `">",
 * p[]`; `p[]`; `" ?>", p[]`; `input[Expansion]`).
 */
test('walkTags steps over a doctype or processing instruction as one token', () => {
  const cases = [
    ['<!DOCTYPE <button>><p>', ['<p']],
    ['<?x "<!--" ?><p>', ['<p']],
    ["<?x '>' <b> ?><p>", ['<p']],
    ['<input><!x>{a, select, b {<b>}}', ['<input', '<b', '~b']],
  ];
  for (const [line, expected] of cases) assert.deepEqual(closes([line]), expected, line);
});

/**
 * #1503: `_consumeInterpolation` ends an interpolation at a tag start before it looks at quotes, so
 * a `<!--` in its string opens a comment and the tag after it is read (`HtmlParser`: `"{{ \"",
 * Comment, p[]`; `"{{ a // \"", Comment, p[]`).
 */
test('walkTags ends an interpolation at a tag start inside its string, as Angular\'s lexer does', () => {
  for (const line of ['{{ "<!-- c --><p>', '{{ a // "<!-- c --><p>']) {
    assert.deepEqual(closes([line]), ['<p'], line);
  }
});

/** #1497: an ICU form whose case never opens fails a build; the tags after it are still read. */
test('walkTags reads on past an ICU form with no case', () => {
  assert.deepEqual(closes(['{a, b, x <button>']), ['<button']);
});
