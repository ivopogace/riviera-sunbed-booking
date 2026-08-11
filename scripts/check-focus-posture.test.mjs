import test from 'node:test';
import assert from 'node:assert/strict';

import { checkPaths, findViolations } from './check-focus-posture.mjs';

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
  const realShape = [
    '<button',
    '  type="submit"',
    '  [disabled]="detailsForm().invalid()"',
    '  [appBusy]="saving()"',
    '>',
    '  Save changes',
    '</button>',
  ];

  assert.deepEqual(scan(HTML, realShape), []);
});

/**
 * A split is legal because its `[disabled]` half expresses validity, which `isBusyFlag` already
 * declines — not because `[appBusy]` sits beside it. Exempting the element wholesale accepted the
 * one shape the rule exists to catch: the native attribute still blurs the pressed control however
 * much `aria-disabled` says otherwise.
 */
test('still flags the busy flag when appBusy sits beside it on the same element', () => {
  const violations = scan(HTML, ['<button [appBusy]="saving()" [disabled]="saving()">Save</button>']);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'BUSY-1');
});

/**
 * `BusyAction` is for buttons only — inertness comes from consuming the activating click — so
 * advising `[appBusy]` on anything else asks for a rewrite that cannot be written. A fieldset's
 * group-disable and a child component's `disabled` input are both correct code.
 */
test('judges only the controls appBusy can actually replace', () => {
  const lines = [
    '<fieldset [disabled]="saving()"><input name="a" /></fieldset>',
    '<app-money-input [disabled]="saving()" />',
    '<div [disabled]="busy()"></div>',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

test('survives a less-than inside an interpolation', () => {
  const lines = [
    '<div>{{ a<b ? \'x\' : \'y\' }}</div>',
    '<button [disabled]="saving()">S</button>',
  ];

  const violations = scan(HTML, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
});

test('finds a confirm surface in an @else if branch', () => {
  const lines = [
    '@if (loaded()) {',
    '  <p>x</p>',
    '} @else if (confirmRemove()) {',
    '  <button data-testid="rm">Remove</button>',
    '}',
  ];

  const violations = scan(HTML, lines, { componentSource: '' });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'FOCUS-1');
  assert.equal(violations[0].line, 3);
});

test('reads a condition whose parenthesis opens on the next line', () => {
  const lines = ['@if', '(confirmRemove()) {', '  <button>Remove</button>', '}'];

  const violations = scan(HTML, lines, { componentSource: '' });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'FOCUS-1');
});

/**
 * The exemption has to be a call site in code. Matching the raw source let a component be excused by
 * a TSDoc sentence mentioning the helper — `shared/confirm-panel.ts` and `shared/confirm-with-reason.ts`
 * were both exempt on their prose alone, and any component copying that comment inherited it.
 */
test('does not accept a focus helper named only in a comment', () => {
  const mentioned = [
    "/** Focus back out is the caller's, via focusMover(). */",
    '@Component({',
    '  template: `',
    '    @if (confirmRemove()) { <button data-testid="rm">Remove</button> }',
    '  `,',
    '})',
    'export class Impostor {}',
  ];
  const called = [...mentioned];
  called[6] = 'export class Real { private readonly move = focusMover(); }';

  assert.equal(scan(TS, mentioned).length, 1);
  assert.deepEqual(scan(TS, called), []);
});

test('accepts a component that focuses through afterNextRender directly', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (confirmRemove()) { <button data-testid="rm">Remove</button> }',
    '  `,',
    '})',
    'export class ConfirmPanel {',
    '  constructor() { afterNextRender({ write: () => this.button().focus() }); }',
    '}',
  ];

  assert.deepEqual(scan(TS, lines), []);
});

/**
 * `afterNextRender` is a general lifecycle API — `auth/verify-email.ts` uses it for a data call —
 * so accepting it alone handed a permanent exemption to any component that adopts the idiom for
 * measurement, a chart, or a scroll.
 */
test('does not accept afterNextRender used for something other than focus', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (confirmRemove()) { <button data-testid="rm">Remove</button> }',
    '  `,',
    '})',
    'export class VerifyEmail {',
    '  constructor() { afterNextRender(() => void this.verify()); }',
    '}',
  ];

  assert.equal(scan(TS, lines).length, 1);
});

/**
 * The `string` state has to be handled above the backtick opener, or the *closing* backtick reopens
 * it and every later line is lost — including the focus call sites the rule reads, which turns a
 * hard gate red on a component that demonstrably moves focus. Live shape: `booking-pay.ts` orders a
 * `` `Pay ${…}` `` string before its `afterNextRender(`.
 */
test('returns to code after a plain backtick string closes', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (confirmRemove()) { <button data-testid="rm">Remove</button> }',
    '  `,',
    '})',
    'export class BookingPay {',
    '  private readonly label = `Pay ${this.priceText}`;',
    '  private readonly move = focusMover();',
    '}',
  ];

  assert.deepEqual(scan(TS, lines), []);
});

/**
 * A backtick that is not a `template:` value is a string like any other. Leaving the scanner in
 * `code` state let the literal's contents be read as source, so an apostrophe or a `//` inside one
 * silently consumed real markup further down the file.
 */
test('skips a backtick string that is not a template', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    <button [disabled]="saving()">Save</button>',
    '  `,',
    '})',
    'export class Thing {',
    '  private readonly label = `it\'s busy // really`;',
    '}',
  ];

  const violations = scan(TS, lines);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
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

/**
 * The shared confirm components own the **open** leg only — their own TSDoc says focus back out is
 * the caller's — so rendering one is not compliance. Treating it as an exemption accepted a
 * component that still strands focus on cancel and on settle, two thirds of the rule.
 */
test('does not accept delegation as a substitute for the caller own legs', () => {
  const panel = [
    '@if (confirmRegen()) {',
    '  <app-confirm-panel [prompt]="\'Regenerate?\'" (confirmed)="regen()" />',
    '}',
  ];

  assert.equal(scan(HTML, panel, { componentSource: '' }).length, 1);
  assert.deepEqual(scan(HTML, panel, { componentSource: 'const m = focusMover();' }), []);
});

/**
 * A trigger/prompt pair writes the trigger as a negated branch, which `isConfirmPrompt` accepts — so
 * judging delegation per block reported the trigger half of the shape the repo already writes
 * (`payouts-tab.html` is exactly `@if (!weatherConfirm())` + `@if (weatherConfirm())`).
 */
test('does not report the trigger half of a trigger and prompt pair', () => {
  const lines = [
    '@if (!confirmRemove()) {',
    '  <button data-testid="rm-trigger">Remove</button>',
    '}',
    '@if (confirmRemove()) {',
    '  <app-confirm-panel label="x" />',
    '}',
  ];

  assert.deepEqual(scan(HTML, lines, { componentSource: 'const m = focusMover();' }), []);
});

/**
 * The authoring-time half is only worth having if it sees a **new** file: that is how a confirm
 * surface enters the tree, and the hook fires on `Write`. Diffing against `HEAD` reported such a
 * file clean, and the fix first shipped pinned by nothing — a revert would have passed CI green.
 */
test('judges an untracked file whole, and reports nothing for a clean tracked one', () => {
  const path = 'frontend/src/app/operator/new-tab.ts';
  const read = () =>
    [
      '@Component({',
      '  template: `',
      '    @if (confirmRemove()) { <button data-testid="rm">Remove</button> }',
      '  `,',
      '})',
      'export class NewTab {}',
    ].join('\n');

  const asNew = checkPaths([path], { tracked: () => new Set(), read, diff: () => new Map() });

  assert.equal(asNew.length, 1);
  assert.equal(asNew[0].rule, 'FOCUS-1');
  assert.equal(asNew[0].path, path);
});

/**
 * The tracked branch stays **diff-scoped**, and it has to be reachable to prove it: gating on a
 * `tracked === trackedAmong` identity check left the branch unexercised, so deleting the diff
 * scoping outright — which would report every standing binding on any edit — kept the suite green.
 */
test('judges a tracked file by the lines its diff added, and no others', () => {
  const path = 'frontend/src/app/operator/new-tab.ts';
  const read = () =>
    [
      '@Component({',
      '  template: `',
      '    @if (confirmRemove()) { <button data-testid="rm">Remove</button> }',
      '  `,',
      '})',
      'export class NewTab {}',
    ].join('\n');
  const tracked = (paths) => new Set(paths);

  const untouched = checkPaths([path], { tracked, read, diff: () => new Map() });
  const rewritten = checkPaths([path], {
    tracked,
    read,
    diff: () => new Map([[path, new Set([3])]]),
  });

  assert.deepEqual(untouched, []);
  assert.equal(rewritten.length, 1);
  assert.equal(rewritten[0].rule, 'FOCUS-1');
});

test('does not mistake confirmed state or a confirmation value for a prompt', () => {
  const paymentState = ["@if (state() === 'confirmed') {", '  <p>Paid</p>', '}'];
  const domainNoun = ['@if (confirmation(); as c) {', '  <p>{{ c.code }}</p>', '}'];

  assert.deepEqual(scan(HTML, paymentState, { componentSource: '' }), []);
  assert.deepEqual(scan(HTML, domainNoun, { componentSource: '' }), []);
});

/**
 * One finding per component — the fix is one set of legs however many branches the surface spans —
 * reported against the branch that renders the **prompt**. The negated half renders the trigger and
 * destroys nothing, so pointing there sends the author to the wrong block.
 */
test('reports one finding per component, against the prompt rather than the trigger', () => {
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
  assert.equal(violations[0].line, 4);
});

test('judges only the confirm surfaces a diff added', () => {
  const lines = ['@if (confirmRemove()) {', '  <button>Remove</button>', '}'];

  const untouched = scan(HTML, lines, { added: new Set([2]), componentSource: '' });

  assert.deepEqual(untouched, []);
});

/** Only `app-payout-statement` traps focus, so a template's other children stay ordinary markup. */
const TRAPS = (tag) => tag === 'app-payout-statement';

/** A component whose template holds the statement modal, parameterised by what its body does. */
function modalComponent(body) {
  return [
    '@Component({',
    '  template: `',
    '    <button data-testid="statement-open" (click)="open()">Statement</button>',
    '    @if (statementOpen()) {',
    '      <app-payout-statement (dismissed)="close()" />',
    '    }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    ...body,
    '}',
  ];
}

/**
 * Instance 14 was a modal dismiss, not a confirm branch — `@if (statementOpen())` names no confirm
 * flag, so the confirm-only trigger never saw the surface that stranded focus at all.
 */
test('treats a branch that renders a focus-trapped child as a surface', () => {
  const lines = modalComponent(['  close() { this.statementOpen.set(false); }']);

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'FOCUS-1');
  assert.equal(violations[0].line, 10);
});

/**
 * The exemption #624 exists to narrow: `payouts-tab` moved focus for its weather confirm, so the
 * component-scoped question answered "yes" for the statement modal it stranded focus on as well.
 */
test('reports a second surface the component moves no focus for', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (weatherConfirm()) { <button data-testid="weather-confirm-btn">Refund</button> }',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="close()" /> }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  private readonly focusAfterRender = focusMover();',
    '  cancelWeather() { this.weatherConfirm.set(false); this.focusAfterRender("weather-trigger"); }',
    '  close() { this.statementOpen.set(false); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'FOCUS-1');
  assert.equal(violations[0].line, 10);
});

/**
 * The shape that killed the flip-level rule in #621: a bulk state reset flips the same signal with
 * no focus move wanted. One compliant flip site is what exempts the signal, not every one of them.
 */
test('accepts a signal one of whose flip sites moves focus', () => {
  const lines = modalComponent([
    '  private readonly focusAfterRender = focusMover();',
    '  close() { this.statementOpen.set(false); this.focusAfterRender("statement-open"); }',
    '  resetForVenue() { this.notice.set(undefined); this.statementOpen.set(false); }',
  ]);

  assert.deepEqual(scan(TS, lines, { isFocusTrap: TRAPS }), []);
});

/**
 * The component floor reads `afterNextRender` + `focus()`, which the two shell modals do not use:
 * `app.ts` and `venue-map.ts` restore focus to the trigger with a plain `.focus()`. Applying the
 * floor to the widened trigger reports both of them — correct code, the error direction #621 spent
 * three review passes eliminating.
 */
test('does not apply the component floor to a modal branch', () => {
  const lines = modalComponent([
    '  private returnTo?: HTMLElement;',
    '  close() { this.statementOpen.set(false); this.returnTo?.focus(); }',
  ]);

  assert.deepEqual(scan(TS, lines, { isFocusTrap: TRAPS }), []);
});

/**
 * `venue-map.html` wraps its whole page in `@if (venueView(); as v)`, three hundred lines above the
 * branch that renders the dialog. Attributing the modal to every enclosing branch would report the
 * page-level one, whose signal is a loaded-state flag nothing dismisses.
 */
test('attributes a modal to the innermost branch that renders it', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (venueView(); as v) {',
    '      <h1>{{ v.name }}</h1>',
    '      @if (selectedSet(); as set) {',
    '        <app-payout-statement (dismissed)="close()" />',
    '      }',
    '    }',
    '  `,',
    '})',
    'export class VenueMap {',
    '  close() { this.selectedSet.set(undefined); }',
    '  reload() { this.venueView.set(undefined); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 12);
});

/** The mover is a field the component names itself, so the rule reads the binding, not a convention. */
test('counts a call to a mover field under any name', () => {
  const lines = modalComponent([
    '  private readonly moveFocus = focusMover();',
    '  close() { this.statementOpen.set(false); this.moveFocus("statement-open"); }',
  ]);

  assert.deepEqual(scan(TS, lines, { isFocusTrap: TRAPS }), []);
});

/**
 * `payouts-tab` as it stood mid-#621 — the weather-confirm legs landed, the statement modal's had
 * not — which is the tree FOCUS-1 reported clean and #621's own review pass caught by hand.
 */
test('reports the surface that hid behind the weather-confirm legs', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (!weatherConfirm()) { <button data-testid="weather-trigger">Weather refund</button> }',
    '    @if (weatherConfirm()) { <button data-testid="weather-confirm-btn">Issue refund</button> }',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="closeStatement()" /> }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  private readonly focusAfterRender = focusMover();',
    '  askWeather() { this.weatherConfirm.set(true); this.focusAfterRender("weather-confirm-btn"); }',
    '  cancelWeather() { this.weatherConfirm.set(false); this.focusAfterRender("weather-trigger"); }',
    '  closeStatement() { this.statementOpen.set(false); }',
    '  private resetForVenue() {',
    '    this.notice.set(undefined);',
    '    this.weatherConfirm.set(false);',
    '    this.statementOpen.set(false);',
    '  }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'FOCUS-1');
  assert.equal(violations[0].line, 12);
});
