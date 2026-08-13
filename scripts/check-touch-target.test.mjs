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
