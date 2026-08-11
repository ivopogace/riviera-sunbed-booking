import test from 'node:test';
import assert from 'node:assert/strict';

import { findViolations } from './check-focus-posture.mjs';

const HTML = 'frontend/src/app/operator/payouts-tab.html';
const TS = 'frontend/src/app/admin/admin-privacy.ts';

/** Every line added, which is the common case for a fixture written as one hunk. */
function all(lines) {
  return new Set(lines.map((_, i) => i + 1));
}

function scan(path, lines, options = {}) {
  return findViolations({ path, lines, added: options.added ?? all(lines), ...options });
}

test('flags a button disabled by an in-flight flag', () => {
  const lines = [
    '<button',
    '  type="button"',
    '  data-testid="layout-save"',
    '  (click)="onSave()"',
    '  [disabled]="saving()"',
    '>',
    '  Save layout',
    '</button>',
  ];

  const violations = scan(HTML, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'BUSY-1');
  assert.equal(violations[0].path, HTML);
  assert.equal(violations[0].line, 5);
});

test('flags the other busy-flag shapes the app already binds to appBusy', () => {
  for (const expression of [
    'busy()',
    'submitting()',
    'erasing()',
    'paying()',
    'refunding()',
    'withdrawing()',
    'cancelling()',
    'actingId() !== undefined',
    'isDeciding(row.bookingId)',
    'slotUi()[slot.key].busy',
    'lever.busy()',
    'checkInBusy()',
  ]) {
    const violations = scan(HTML, [`<button [disabled]="${expression}">Go</button>`]);
    assert.equal(violations.length, 1, `expected ${expression} to be flagged`);
    assert.equal(violations[0].rule, 'BUSY-1');
  }
});

test('leaves inputs alone', () => {
  const lines = [
    '<input type="number" [value]="row.priceEur" [disabled]="saving()" />',
    '<textarea data-testid="admin-privacy-reason" [disabled]="busy()"></textarea>',
    '<select data-testid="venue-picker" [disabled]="busy()"></select>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

test('leaves validity and state bindings alone', () => {
  const lines = [
    '<button [disabled]="!canAddRow()">Add row</button>',
    '<button [disabled]="!canAddCol()">Add column</button>',
    '<button appBeachCell [disabled]="cell.disabled"></button>',
    '<button [disabled]="isPending(set)"></button>',
    '<button type="submit" [disabled]="venueForm().invalid()">Create venue</button>',
    '<button type="submit" [disabled]="detailsForm().invalid()">Save changes</button>',
    '<button [disabled]="dirty()">Move</button>',
    '<button [disabled]="!hasLayout()">Save layout</button>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

test('accepts a split binding', () => {
  const sameFlag = ['<button [appBusy]="saving()" [disabled]="saving()">Save</button>'];
  const realShape = [
    '<button',
    '  type="submit"',
    '  [disabled]="detailsForm().invalid()"',
    '  [appBusy]="saving()"',
    '>',
    '  Save changes',
    '</button>',
  ];

  assert.deepEqual(scan(HTML, sameFlag), []);
  assert.deepEqual(scan(HTML, realShape), []);
});

test('ignores bindings outside an inline template', () => {
  const doc = [
    '/**',
    ' * The posture for a control whose own activation started the write it is now waiting on:',
    ' * `<button [appBusy]="saving()" (click)="save()">`.',
    ' *',
    ' * <p>It replaces `<button [disabled]="saving()">`, which blurs the pressed control.',
    ' */',
    "@Directive({ selector: '[appBusy]' })",
    'export class BusyAction {}',
  ];

  assert.deepEqual(scan(TS, doc), []);
});

test('scans the inline template of a component', () => {
  const lines = [
    '@Component({',
    "  selector: 'app-admin-privacy',",
    '  template: `',
    '    <button data-testid="admin-privacy-erase" [disabled]="busy()">Erase</button>',
    '  `,',
    '})',
    'export class AdminPrivacy {}',
  ];

  const violations = scan(TS, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'BUSY-1');
  assert.equal(violations[0].line, 4);
});

test('judges only the lines a diff added', () => {
  const lines = [
    '<button [disabled]="saving()">Save</button>',
    '<button [disabled]="busy()">Refund</button>',
  ];

  const violations = scan(HTML, lines, { added: new Set([2]) });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
});

/** A component rendering its own confirm surface, parameterised by what it does about focus. */
function component(body) {
  return [
    '@Component({',
    "  selector: 'app-payouts-tab',",
    '  template: `',
    '    <button data-testid="weather-trigger" (click)="ask()">Weather refund</button>',
    '    @if (weatherConfirm()) {',
    '      <button data-testid="weather-confirm-btn" (click)="go()">Issue refund</button>',
    '    }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    ...body,
    '}',
  ];
}

test('flags a confirm surface with no focus leg', () => {
  const lines = component(['  protected readonly weatherConfirm = signal(false);']);

  const violations = scan(TS, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'FOCUS-1');
  assert.equal(violations[0].line, 5);
});

test('accepts a confirm surface whose component moves focus', () => {
  const lines = component(['  private readonly focusAfterRender = focusMover();']);

  assert.deepEqual(scan(TS, lines), []);
});

test('pairs an external template with its component', () => {
  const lines = [
    '<button data-testid="set-remove" (click)="askToRemove()">Remove</button>',
    '@if (confirmRemove()) {',
    '  <button data-testid="set-remove-confirm">Remove set</button>',
    '}',
  ];

  const stranded = scan(HTML, lines, { componentSource: 'export class SetEditor {}' });
  const moved = scan(HTML, lines, {
    componentSource: 'const focusAfterRender = focusMover();',
  });

  assert.equal(stranded.length, 1);
  assert.equal(stranded[0].rule, 'FOCUS-1');
  assert.equal(stranded[0].line, 2);
  assert.deepEqual(moved, []);
});

test('accepts delegation to the shared confirm components', () => {
  const panel = [
    '@if (confirmRegen()) {',
    '  <app-confirm-panel [prompt]="\'Regenerate?\'" (confirmed)="regen()" />',
    '}',
  ];
  const withReason = [
    '@if (confirming() === slot.slot) {',
    '  <app-confirm-with-reason (confirmed)="remove(slot)" />',
    '}',
  ];

  assert.deepEqual(scan(HTML, panel, { componentSource: '' }), []);
  assert.deepEqual(scan(HTML, withReason, { componentSource: '' }), []);
});

test('does not mistake confirmed state or a confirmation value for a prompt', () => {
  const paymentState = ["@if (state() === 'confirmed') {", '  <p>Paid</p>', '}'];
  const domainNoun = ['@if (confirmation(); as c) {', '  <p>{{ c.code }}</p>', '}'];

  assert.deepEqual(scan(HTML, paymentState, { componentSource: '' }), []);
  assert.deepEqual(scan(HTML, domainNoun, { componentSource: '' }), []);
});

test('reports one finding per component however many blocks the surface spans', () => {
  const lines = [
    '@if (!weatherConfirm()) {',
    '  <button data-testid="weather-trigger">Weather refund</button>',
    '}',
    '@if (weatherConfirm()) {',
    '  <button data-testid="weather-confirm-btn">Issue refund</button>',
    '}',
  ];

  const violations = scan(HTML, lines, { componentSource: '' });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 1);
});

test('judges only the confirm surfaces a diff added', () => {
  const lines = ['@if (confirmRemove()) {', '  <button>Remove</button>', '}'];

  const untouched = scan(HTML, lines, { added: new Set([2]), componentSource: '' });

  assert.deepEqual(untouched, []);
});
