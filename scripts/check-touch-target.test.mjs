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
