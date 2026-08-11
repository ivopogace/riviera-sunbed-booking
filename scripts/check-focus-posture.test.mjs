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
