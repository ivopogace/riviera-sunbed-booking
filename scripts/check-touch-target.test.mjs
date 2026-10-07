import test from 'node:test';
import assert from 'node:assert/strict';

import { findViolations } from './check-touch-target.mjs';

const HTML = 'frontend/src/app/operator/payouts-tab.html';
const TS = 'frontend/src/app/admin/admin-privacy.ts';

/** Every line added, which is the common case for a fixture written as one hunk. */
function all(lines) {
  return new Set(lines.map((_, i) => i + 1));
}

function scan(path, lines, options = {}) {
  return findViolations({ path, lines, added: options.added ?? all(lines), ...options });
}

test('flags a button that declares neither the directive nor an exemption', () => {
  const lines = [
    '<button',
    '  type="button"',
    '  data-testid="payouts-export"',
    '  (click)="onExport()"',
    '>',
    '  Export',
    '</button>',
  ];

  const violations = scan(HTML, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'TT-1');
  assert.equal(violations[0].path, HTML);
  assert.equal(violations[0].line, 1);
});

test('accepts either declaration on the control itself', () => {
  const lines = [
    '<button type="button" appTouchTarget (click)="onExport()">Export</button>',
    '<input appTouchTarget type="date" [value]="date()" />',
    '<select appTouchTarget data-testid="venue-picker"></select>',
    '<textarea appTouchTarget data-testid="reason"></textarea>',
    '<button type="button" data-touch-exempt="control inside a sentence">Retry</button>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

test('an ancestor exemption covers its subtree and no further', () => {
  const lines = [
    '<p data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)">',
    '  {{ togglePrompt() }}',
    '  <button type="button" (click)="toggleMode()">{{ toggleAction() }}</button>',
    '</p>',
    '<button type="button" (click)="submit()">Submit</button>',
  ];

  const violations = scan(HTML, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 5);
});

test('never judges an anchor, however it is written', () => {
  const lines = [
    '<a routerLink="/" class="link">Home</a>',
    '<a class="oc-tab" [routerLink]="[\'/operator\', venueId(), tab.path]">{{ tab.label }}</a>',
    '<a href="/legal/terms" target="_blank" rel="noopener">Terms</a>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

test('in a component, judges the template literal and nothing else', () => {
  const lines = [
    '/**',
    ' * The privacy tab. A control is floored with `<button appTouchTarget>`; an exempt one carries',
    ' * `data-touch-exempt`. A bare `<button>` in prose like this is documentation, not markup.',
    ' */',
    '@Component({',
    "  selector: 'app-admin-privacy',",
    '  template: `',
    '    <button type="button" (click)="erase()">Erase</button>',
    '  `,',
    '})',
    'export class AdminPrivacy {',
    "  readonly hint = '<button>not markup either</button>';",
    '}',
  ];

  const violations = scan(TS, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'TT-1');
  assert.equal(violations[0].line, 8);
});

/**
 * The opener is word-bounded, the decision `inline-template.mjs` holds for all four guards: a key
 * that merely ends in `template` is a string, and its `<button>` is a fixture, not markup.
 */
test('a key that merely ends in `template` does not open an inline template', () => {
  const lines = [
    'const fixtures = {',
    '  xtemplate: `',
    '    <button type="button" (click)="erase()">Erase</button>',
    '  `,',
    '};',
  ];

  assert.deepEqual(scan(TS, lines), []);
});

test('does not judge a control inside an HTML comment', () => {
  const lines = [
    '<!-- <button type="button">Removed while we rethink the flow</button> -->',
    '<button type="button" appTouchTarget>Keep</button>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

/**
 * #1496: an inline template's comment is a `Comment` node to Angular, as an external one is; one
 * its literal leaves open is a build error and hides nothing in the next literal, and a `<!--` in
 * an attribute value opens none.
 */
test('does not judge a control inside an inline template\'s HTML comment', () => {
  const lines = ['@Component({', '  template: `<!-- <button>x</button> --><p>ok</p>`,', '})'];
  const unterminated = [
    '@Component({ template: `<!-- <p>draft</p>` })',
    '@Component({ template: `<button>x</button>` })',
  ];

  assert.deepEqual(scan(TS, lines), []);
  assert.deepEqual(
    scan(TS, unterminated).map((v) => [v.rule, v.line]),
    [['TT-1', 2]],
  );
  assert.deepEqual(
    scan(TS, ['@Component({ template: `<i title="<!--"></i><button>x</button><!-- c -->` })']).map(
      (v) => [v.rule, v.line],
    ),
    [['TT-1', 1]],
  );
});

test('carries an exemption across control flow, self-closing tags and void elements', () => {
  const lines = [
    '<p data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)">',
    '  @if (loading()) {',
    '    <app-spinner />',
    '    <img src="/x.png" alt="" />',
    '    <input type="text" [formField]="form.q" />',
    '    <button type="button" (click)="retry()">Retry</button>',
    '  }',
    '</p>',
    '<button type="button" (click)="submit()">Submit</button>',
  ];

  const violations = scan(HTML, lines);

  assert.deepEqual(
    violations.map((v) => v.line),
    [9],
  );
});

test('an expression whose identifier spells a judged element is not a control', () => {
  for (const expression of [
    '{{ i<select.length ? "a" : "b" }}',
    '{{ value<input.max }}',
    '{{ rows<textarea.rows }}',
    '{{ count<button.limit }}',
  ]) {
    assert.deepEqual(scan(HTML, [`<span>${expression}</span>`]), [], expression);
  }
});

test('an expression that reads as a tag does not swallow the controls after it', () => {
  const lines = [
    '<span>{{ shown<total ? "some" : "all" }}</span>',
    '<button type="button" (click)="more()">More</button>',
  ];

  const violations = scan(HTML, lines);

  assert.deepEqual(
    violations.map((v) => v.line),
    [2],
  );
});

/** #1475: Angular's lexer abandons a start tag at a `<`, and so does the walk. */
test('an expression that reads as a tag ends at the next tag, so the control is still judged', () => {
  const lines = ['<p>', '  {{ n<max }}', '  <button type="button" (click)="more()">More</button>', '</p>'];

  const violations = scan(HTML, lines);

  assert.deepEqual(
    violations.map((v) => v.line),
    [3],
  );
});

/** #1478: a bare value ends at a `<`, as Angular's lexer ends one, so it never swallows a control. */
test('a phantom tag whose bare value is glued to a control leaves the control judged', () => {
  const lines = ['<p>{{ a<b c=<button type="button" (click)="go()">Go</button></p>'];

  assert.deepEqual(
    scan(HTML, lines).map((v) => [v.rule, v.line]),
    [['TT-1', 1]],
  );
});

/**
 * #1478: Angular's parser pushes an unterminated start tag and pops it at once, so it never encloses
 * anything; a phantom named after an exempt ancestor must not take that ancestor's end tag.
 */
test('a phantom named after an exempt ancestor does not keep its exemption open', () => {
  for (const phantom of ['{{ n<div }}', '{{ n<max }}']) {
    const lines = [
      '<div data-touch-exempt="inline link in a sentence">',
      `  ${phantom}`,
      '</div>',
      '<button type="button" (click)="go()">Go</button>',
    ];

    assert.deepEqual(
      scan(HTML, lines).map((v) => [v.rule, v.line]),
      [['TT-1', 4]],
      phantom,
    );
  }
});

/**
 * #1480: Angular reads a block parameter and a `@let` value as an expression, never as markup, so a
 * `<` comparison there opens no tag even when a `>` follows it; the shapes build with no error.
 */
test('a comparison in a block parameter or a `@let` value takes no ancestor\'s end tag', () => {
  for (const expression of ['@if (n<div && a>b) {x}', '@let ok = n<div && a>b;']) {
    const lines = [
      '<div data-touch-exempt="inline link in a sentence">',
      `  ${expression}`,
      '</div>',
      '<button type="button">Go</button>',
    ];

    assert.deepEqual(
      scan(HTML, lines).map((v) => [v.rule, v.line]),
      [['TT-1', 4]],
      expression,
    );
  }
});

test('a comparison in a block parameter is no control', () => {
  assert.deepEqual(scan(HTML, ['<p>@if (n<button && a>b) {x}</p>']), []);
});

/**
 * #1482: Angular reads a `<textarea>` or `<title>` as raw text (`_consumeRawTextWithTagClose`), so
 * an `@if (` or `@let` there opens nothing, and the control after the element is still judged.
 */
test('an `@` in raw text leaves the control after the element judged', () => {
  for (const element of [
    '<textarea data-touch-exempt="r">Write @if (you like</textarea>',
    '<title>Mail @let x = 1</title>',
  ]) {
    const lines = [element, '<button type="button">Go</button>'];

    assert.deepEqual(
      scan(HTML, lines).map((v) => [v.rule, v.line]),
      [['TT-1', 2]],
      element,
    );
  }
});

/**
 * #1484: Angular reads a raw-text element's content as text up to its end tag, so a `<button>`
 * spelled there is no control (`HtmlParser`: `textarea[Text "Use <button> here"]`), and the control
 * after the element is still judged.
 */
test('markup inside a raw-text element is no control', () => {
  for (const element of [
    '<textarea appTouchTarget>Use <button> here</textarea>',
    '<title>Use <button> here</title>',
    '<style>button::after { content: "<select>" }</style>',
    '<script><input></script>',
    '<svg><title><button>You are here</button></title></svg>',
  ]) {
    assert.deepEqual(scan(HTML, [element]), [], element);
    assert.deepEqual(
      scan(HTML, [element, '<button type="button">Go</button>']).map((v) => [v.rule, v.line]),
      [['TT-1', 2]],
      element,
    );
  }
});

/**
 * #1487: a prefixed `style`, `script`, `textarea` or `title` is raw text too, up to its bare-name end
 * tag (`HtmlParser`: `:svg:style[Text "<button>"]`), so the `<button>` in it is no control and the
 * control after it is still judged. `<svg:title>` alone is parsed, and an `<xhtml:button>` in it
 * stays judged (`:svg:title[:xhtml:button[Text "a"]]`).
 */
test('markup inside a prefixed raw-text element is no control', () => {
  for (const element of [
    '<svg:style><button></style>',
    '<xhtml:textarea appTouchTarget><button></textarea>',
    '<math:title><button></title>',
  ]) {
    assert.deepEqual(scan(HTML, [element]), [], element);
    assert.deepEqual(
      scan(HTML, [element, '<button type="button">Go</button>']).map((v) => [v.rule, v.line]),
      [['TT-1', 2]],
      element,
    );
  }
  assert.deepEqual(
    scan(HTML, ['<svg><svg:title><xhtml:button>a</xhtml:button></svg:title></svg>']).map((v) => [
      v.rule,
      v.line,
    ]),
    [['TT-1', 1]],
  );
});

/**
 * #1487, #1492: a prefixed raw-text element is a walk entry closed by its bare-name end tag, so it
 * leaves the exemption stack as it found it: the exempt ancestor closes at its own end tag, and a
 * `</div>` in the content closes nothing.
 */
test('a prefixed raw-text element leaves the exemption stack balanced', () => {
  const lines = [
    '<div data-touch-exempt="r">',
    '  <svg:style>Use </div> here</style>',
    '  <button type="button">x</button>',
    '</div>',
    '<button type="button">y</button>',
  ];

  assert.deepEqual(
    scan(HTML, lines).map((v) => [v.rule, v.line]),
    [['TT-1', 5]],
  );
});

/**
 * #1492: a prefixed control in the HTML namespace is a control (`HtmlParser`:
 * `:xhtml:button[Text "Go"]`, built by `createElementNS` as an `HTMLButtonElement`), and is judged
 * like an unprefixed one, exempted like one by itself or an ancestor. A prefix that builds no HTML
 * element is no control: `<svg:button>` is an SVG-namespace element, `<XHTML:button>` is in the
 * namespace `XHTML`, and `<xhtml:BUTTON>` is an `HTMLUnknownElement`, the case kept by
 * `createElementNS`.
 */
test('a control in the HTML namespace by its xhtml: prefix is judged, any other prefix is not', () => {
  for (const control of [
    '<xhtml:button>Go</xhtml:button>',
    '<xhtml:input/>',
    '<xhtml:select></xhtml:select>',
    '<xhtml:textarea></textarea>',
  ]) {
    assert.deepEqual(scan(HTML, [control]).map((v) => [v.rule, v.line]), [['TT-1', 1]], control);
  }
  for (const declared of [
    '<xhtml:button appTouchTarget>Go</xhtml:button>',
    '<xhtml:button data-touch-exempt="r">Go</xhtml:button>',
    '<p data-touch-exempt="r"><xhtml:button>Go</xhtml:button></p>',
    '<xhtml:p data-touch-exempt="r"><button>Go</button></xhtml:p>',
    '<svg:button>x</svg:button>',
    '<XHTML:button>x</XHTML:button>',
    '<xhtml:BUTTON>x</xhtml:BUTTON>',
    '<math:input/>',
  ]) {
    assert.deepEqual(scan(HTML, [declared]), [], declared);
  }
});

/**
 * #1492: a prefixed element is an entry on the exemption stack, so the bare `</div>` that namespace
 * inheritance makes the end tag of an `<xhtml:div>` closes it, not the exempt `<div>` around it
 * (`HtmlParser`: `div[:xhtml:div, button]`), and `</svg:g>` closes the `<svg:g>` it ends.
 */
test('a prefixed element leaves the exemption stack balanced', () => {
  assert.deepEqual(
    scan(HTML, ['<div data-touch-exempt="r"><xhtml:div></div><button>x</button></div>']),
    [],
  );
  const lines = [
    '<svg:g data-touch-exempt="r">',
    '  <svg:g></svg:g>',
    '  <button type="button">x</button>',
    '</svg:g>',
    '<button type="button">y</button>',
  ];

  assert.deepEqual(
    scan(HTML, lines).map((v) => [v.rule, v.line]),
    [['TT-1', 5]],
  );
});

/**
 * #1492: only a void element in the namespace `''` is void. Angular looks a prefixed tag's
 * definition up by its full name (`:xhtml:input`), finds the default one, and lets it enclose what
 * follows until its end tag (`HtmlParser`: `:xhtml:input[:xhtml:button[Text "x"]]`), so an
 * exemption on it covers that. A bare `<input>` outside `<svg>` stays void with or without its `/`,
 * and its exemption covers nothing after.
 */
test('a prefixed void-named element encloses its content, exemption included', () => {
  assert.deepEqual(
    scan(HTML, ['<xhtml:input data-touch-exempt="r"><button>x</button></xhtml:input>']),
    [],
  );
  for (const element of [
    '<xhtml:input data-touch-exempt="r"/><button>x</button>',
    '<input data-touch-exempt="r"><button>x</button>',
  ]) {
    assert.deepEqual(scan(HTML, [element]).map((v) => [v.rule, v.line]), [['TT-1', 1]], element);
  }
});

/**
 * #1498: every element Angular's `getHtmlTagDefinition` marks `isVoid` closes at the next token
 * (`_closeVoidElement`), so its exemption covers nothing after it but an ICU that follows at once
 * (#1497), whatever its case (`HtmlParser`: `param, button[Text "x"]`). `<param>` is the one the
 * guard's own list once lacked.
 */
test('a void element\'s exemption covers nothing after it, `<param>` included', () => {
  const angularVoid = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr'];
  for (const name of [...angularVoid, 'PARAM']) {
    const element = `<${name} data-touch-exempt="r"><button>x</button>`;
    assert.deepEqual(scan(HTML, [element]).map((v) => [v.rule, v.line]), [['TT-1', 1]], element);
  }
});

/**
 * #1494: an unprefixed tag inherits its parent's namespace (`_getPrefix`), so a bare `<button>`
 * inside `<svg>` or `<math>` is no control (`HtmlParser`: `:svg:svg[:svg:button[Text "x"]]`), while
 * one inside a `<foreignObject>`, which stops inheritance, or after the `</svg>` is a real button.
 */
test('a control in an inherited SVG or MathML namespace is no control', () => {
  for (const element of [
    '<svg><button>x</button></svg>',
    '<math><button>x</button></math>',
    '<svg><g><input/><select></select></g></svg>',
  ]) {
    assert.deepEqual(scan(HTML, [element]), [], element);
  }
  for (const element of [
    '<svg><foreignObject><button>x</button></foreignObject></svg>',
    '<svg></svg><button>x</button>',
    '<svg/><button>x</button>',
  ]) {
    assert.deepEqual(scan(HTML, [element]).map((v) => [v.rule, v.line]), [['TT-1', 1]], element);
  }
});

/**
 * #1494: each inline template is its own tree, so an element one leaves open (Angular builds
 * `<svg><g>` and `<div data-touch-exempt="r">` with no error) neither gives the next template's
 * control its namespace nor exempts it.
 */
test('an element left open in one inline template does not reach the next', () => {
  for (const opener of ['<svg><g>', '<div data-touch-exempt="r">']) {
    const lines = [
      `@Component({ template: \`${opener}\` })`,
      'export class Chart {}',
      '@Component({',
      '  template: `<button>x</button>`,',
      '})',
      'export class Panel {}',
    ];

    assert.deepEqual(scan(TS, lines).map((v) => [v.rule, v.line]), [['TT-1', 4]], opener);
  }
});

/**
 * #1494: void is judged on the namespace a tag builds in, as Angular looks its definition up by
 * full name: an unprefixed `<input>` inside `<svg>` is `:svg:input`, encloses what follows up to
 * its end tag, and its exemption covers the `<foreignObject>`'s button in it (`HtmlParser`:
 * `:svg:svg[:svg:input[:svg:foreignObject[button]]]`).
 */
test('a void-named element in an inherited namespace encloses its content', () => {
  const lines = [
    '<svg><input data-touch-exempt="r">',
    '  <foreignObject><button>x</button></foreignObject>',
    '</input></svg>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

/**
 * #1484: the raw-text element's end tag still closes it, in any form Angular's lexer accepts, and
 * a `<div>` or `</div>` in its content opens or closes nothing, so the exempt ancestor closes at
 * its own end tag: the button inside it stays exempt and the button after it is judged.
 */
test('a raw-text element leaves the exemption stack balanced', () => {
  for (const content of ['Use <div> here', 'Use </div> here']) {
    for (const end of ['</textarea>', '</ textarea >', '</TextArea>']) {
      const lines = [
        '<div data-touch-exempt="r">',
        `  <textarea>${content}${end}`,
        '  <button type="button">x</button>',
        '</div>',
        '<button type="button">y</button>',
      ];

      assert.deepEqual(
        scan(HTML, lines).map((v) => [v.rule, v.line]),
        [['TT-1', 5]],
        `${content}${end}`,
      );
    }
  }
});

/**
 * #1486: Angular's `_consumeTagClose` skips whitespace, a line end included, between `</` and the
 * name, so `</ div>` closes the inner `<div>` and the exempt ancestor closes at its own end tag: the
 * button inside it stays exempt and the button after it is judged.
 */
test('an end tag with whitespace before its name closes its element', () => {
  for (const inner of [['<div>x</ div>'], ['<div>x</', 'div>'], ['<div>x</\u00a0', '  div', '>']]) {
    const lines = [
      '<div data-touch-exempt="r">',
      ...inner,
      '<button type="button">x</button>',
      '</div>',
      '<button type="button">y</button>',
    ];

    assert.deepEqual(
      scan(HTML, lines).map((v) => [v.rule, v.line]),
      [['TT-1', lines.length]],
      inner.join('⏎'),
    );
  }
  assert.deepEqual(
    scan(HTML, ['<div data-touch-exempt="r"><div>x</ div></div><button>y</button>']).map(
      (v) => [v.rule, v.line],
    ),
    [['TT-1', 1]],
  );
});

/** #529's posture: a phantom named for a control is no control, wherever its read ends. */
test('a phantom named for a control fails no build', () => {
  for (const line of [
    '<p>{{ n<button }} more</p>',
    '<p>{{ n<select ? "a" : "b" }}</p>',
    '<p>{{ n<input',
  ]) {
    assert.deepEqual(scan(HTML, [line]), [], line);
  }
});

test('an unquoted value glued to the self-closing slash does not leak its exemption', () => {
  const lines = [
    '<app-badge data-touch-exempt="control inside a sentence" mode=compact/>',
    '<button type="button" (click)="submit()">Submit</button>',
  ];

  const violations = scan(HTML, lines);

  assert.deepEqual(
    violations.map((v) => v.line),
    [2],
  );
});

/** Only a slash the `>` follows is a self-close marker; one inside a path is part of the value. */
test('a bare value that legitimately contains slashes still opens an exemption scope', () => {
  const lines = [
    '<div data-touch-exempt="control inside a sentence" data-href=/legal/terms>',
    '  <button type="button" (click)="retry()">Retry</button>',
    '</div>',
    '<button type="button" (click)="submit()">Submit</button>',
  ];

  const violations = scan(HTML, lines);

  assert.deepEqual(
    violations.map((v) => v.line),
    [4],
  );
});

test('judges only the lines the diff added', () => {
  const lines = [
    '<button type="button" (click)="old()">Standing</button>',
    '<button type="button" (click)="fresh()">Added</button>',
  ];

  const violations = scan(HTML, lines, { added: new Set([2]) });

  assert.deepEqual(
    violations.map((v) => v.line),
    [2],
  );
});

test('flags an exemption that gives no reason', () => {
  const lines = [
    '<button type="button" data-touch-exempt="">Retry</button>',
    '<button type="button" data-touch-exempt>Dismiss</button>',
    '<button type="button" data-touch-exempt="   ">Cancel</button>',
  ];

  const violations = scan(HTML, lines);

  assert.deepEqual(
    violations.map((v) => [v.line, v.rule]),
    [
      [1, 'TT-2'],
      [2, 'TT-2'],
      [3, 'TT-2'],
    ],
  );
});

/**
 * A template region whose last line ends inside a start tag once rewound the walk to that line's
 * column 0, where it found the same `<` or `name="` again and pushed it forever (#1473).
 */
test('a template that ends inside a start tag still returns', () => {
  for (const tail of ['x <div', '  <div', '<p x="foo']) {
    const lines = ['<button type="button">Go</button>', tail];

    assert.deepEqual(
      scan(HTML, lines).map((v) => [v.line, v.rule]),
      [[1, 'TT-1']],
    );
  }
});

/**
 * #1497: an exemption ends where Angular closes its element, with or without an end tag: at a child
 * its definition is closed by (`<ul>` closes a `<p>`, `<li>` an `<li>`), at its block's or ICU
 * case's `}`, and at the end tag of its full name (`HtmlParser` 22.1.6: `p["a"], ul[],
 * button["x"]`; `@if{p["x"]}, button["y"]`; `ul[li["a"], li[button["x"]]]`; `P[li[p[]]],
 * button["x"]`).
 */
test('an exemption ends where Angular closes its element implicitly', () => {
  for (const line of [
    '<p data-touch-exempt="r">a<ul></ul><button>x</button>',
    '@if (a) {<p data-touch-exempt="r">x}<button>y</button>',
    '<ul><li data-touch-exempt="r">a<li><button>x</button></ul>',
    '<table><tr><td data-touch-exempt="r">a<td><button>x</button></table>',
    '<select appTouchTarget><option data-touch-exempt="r">a<option><button>x</button></select>',
    '{n, select, x {<p data-touch-exempt="r">a}}<button>x</button>',
    '<P data-touch-exempt="r"><li><p></P><button>x</button>',
  ]) {
    assert.deepEqual(scan(HTML, [line]).map((v) => [v.rule, v.line]), [['TT-1', 1]], line);
  }
});

/**
 * #1497: an exemption Angular keeps open still covers its subtree: a child its definition is not
 * closed by, a block or an ICU case between it and the child, a non-HTML namespace, and a void
 * element, which the start tag right after it closes alone (`HtmlParser`: `p[b[div[]], button[]]`;
 * `p[@if{div[]}, button[]]`; `p[input[], div[], button[]]`; `p[ICU(div[]), button[]]`).
 */
test('an exemption Angular keeps open still covers its subtree', () => {
  for (const line of [
    '<p data-touch-exempt="r"><b><div></div></b><button>x</button></p>',
    '<p data-touch-exempt="r">@if (a) {<div></div>}<button>x</button></p>',
    '<p data-touch-exempt="r"><input><div></div><button>x</button></p>',
    '<p data-touch-exempt="r">{n, select, x {<div></div>}}<button>x</button></p>',
    '<p data-touch-exempt="r"><svg></svg><button>x</button></p>',
    '<xhtml:p data-touch-exempt="r"><div></div><xhtml:button>x</xhtml:button></xhtml:p>',
    '<li data-touch-exempt="r">{{ a }}<button>x</button></li>',
  ]) {
    assert.deepEqual(scan(HTML, [line]), [], line);
  }
});

/**
 * #1497: a void element closes at the next token, but an ICU right after it builds inside it, so
 * its exemption covers that ICU's controls and nothing after (`HtmlParser`:
 * `input[ICU(button[])], button[]`).
 */
test('a void element\'s exemption covers an ICU right after it, and nothing more', () => {
  const lines = [
    '<input data-touch-exempt="r">{n, select, x {<button>x</button>}}<button>y</button>',
  ];
  assert.deepEqual(scan(HTML, lines).map((v) => [v.rule, v.line]), [['TT-1', 1]]);
});

/**
 * #1497: a comment in an inline template is one node to Angular, so the walk lets no brace or
 * ICU head in it end an exemption or hide the controls after it (`HtmlParser`: `@if{li["x",
 * Comment, button["y"]]}`; `Comment, "x", button["y"]`). The block mask still reads into one: an
 * unclosed `@let` or `@if (` there is #1496's, which masks an inline template's comments.
 */
test('a comment in an inline template neither ends an exemption nor hides a control', () => {
  const component = (markup) => ['@Component({', '  template: `', ...markup, '  `,', '})'];
  const exempt = component([
    '@if (a) {',
    '<li data-touch-exempt="r">x',
    '<!-- } -->',
    '<button>y</button>',
    '}',
  ]);
  assert.deepEqual(scan(TS, exempt), []);

  const judged = component(['<!-- {a, b, -->', 'x', '<button>y</button>']);
  assert.deepEqual(scan(TS, judged).map((v) => [v.rule, v.line]), [['TT-1', 5]]);
});
