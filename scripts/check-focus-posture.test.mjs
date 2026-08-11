import test from 'node:test';
import assert from 'node:assert/strict';

import { checkPaths, findViolations, focusTraps, settle } from './check-focus-posture.mjs';

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

  assert.deepEqual(scan(HTML, lines, { isFocusTrap: () => false }), []);
});

/**
 * #628: the self-committing-field shape (#625's class) — a field whose own start tag both starts
 * the write (`(change)`/`(blur)`) and is disabled by it, judged only for the kinds
 * `readonly` actually locks. `pricing-tab.html` is the live fixed shape.
 */
test('flags a self-committing text field disabled by its own busy flag', () => {
  for (const shape of [
    '<input type="number" [value]="row.priceEur" (change)="onPriceChange(row)" [disabled]="saving()" />',
    '<input (blur)="commit()" [disabled]="saving()" />',
    '<input type="date" (change)="onDate()" [disabled]="submitting()" />',
    '<textarea (blur)="onEdit()" [disabled]="busy()"></textarea>',
  ]) {
    const violations = scan(HTML, [shape]);
    assert.equal(violations.length, 1, `expected ${shape} to be flagged`);
    assert.equal(violations[0].rule, 'BUSY-2');
    assert.equal(violations[0].line, 1);
  }
});

/**
 * The rule stays silent wherever `readonly` is inert (`<select>`, checkbox, radio, `file`,
 * `range`, `color`), on a dynamic `[type]` it cannot read, on a field no handler of its own
 * commits, and on a validity binding — the deny-list posture `BUSY_STEMS` set (#628's narrow
 * option; the inert kinds stay RV-FE-9's human check).
 */
test('leaves the controls readonly cannot lock and every non-self-committing field alone', () => {
  const lines = [
    '<select (change)="pick()" [disabled]="busy()"></select>',
    '<input type="checkbox" (change)="toggle()" [disabled]="saving()" />',
    '<input type="radio" (change)="choose()" [disabled]="saving()" />',
    '<input type="file" (change)="upload()" [disabled]="uploading()" />',
    '<input type="range" (input)="slide()" [disabled]="saving()" />',
    '<input type="color" (change)="tint()" [disabled]="saving()" />',
    '<input [type]="kind()" (change)="commit()" [disabled]="saving()" />',
    '<input [attr.type]="kind()" (change)="commit()" [disabled]="saving()" />',
    '<input type="number" [value]="row.priceEur" [disabled]="saving()" />',
    '<input type="number" (change)="commit()" [disabled]="detailsForm().invalid()" />',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

/**
 * `(input)` is a per-keystroke event whose dominant use is draft-sync into a signal while a
 * BUTTON starts the write — the shape `admin-commissions` and `admin-privacy` bind three times as
 * correct code, and the sweep that gates BUSY-2 found. A per-keystroke committer is a deliberate
 * miss, the same trade `BUSY_STEMS` makes for a novel flag name.
 */
test('does not read a draft-sync input binding as self-committing', () => {
  const lines = [
    '<input type="number" [value]="draftPercent()" [disabled]="busy()" (input)="onPercentTyped($event)" />',
    '<input type="text" [value]="reason()" [disabled]="busy()" (input)="onReasonTyped($event)" />',
  ];

  assert.deepEqual(scan(HTML, lines), []);
});

/** #628's gating argument is BUSY-1's: syntactic, and swept with zero standing violations. */
test('gates BUSY-2 like BUSY-1', () => {
  const sink = () => ({ written: [], write(text) { this.written.push(text); } });
  const out = sink();
  const err = sink();

  const failed = settle(
    [{ path: HTML, line: 1, rule: 'BUSY-2', text: '[disabled]="saving()"' }],
    'Focus posture',
    out,
    err,
  );

  assert.equal(failed, 1);
  assert.match(err.written.join(''), /BUSY-2/);
  assert.match(err.written.join(''), /readonly/);
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
  const seams = { componentSource: '', isFocusTrap: () => false };

  assert.equal(scan(HTML, panel, seams).length, 1);
  assert.deepEqual(
    scan(HTML, panel, { ...seams, componentSource: 'const m = focusMover();' }),
    [],
  );
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
  const seams = { componentSource: 'const m = focusMover();', isFocusTrap: () => false };

  assert.deepEqual(scan(HTML, lines, seams), []);
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
 * `set-editor` and `layout-editor` split the component in two, so each half sees only one side of
 * the rule — and a diff routinely writes only one of them. Each half therefore reports at the line
 * it can act on: the `.ts` at the flip where the leg goes, the `.html` at the branch it just added.
 * Anchoring only in the `.ts` left a newly added stranding modal reported by nothing at all.
 */
test('judges a component with an external template against its sibling', () => {
  const template = [
    '<button data-testid="statement-open" (click)="open()">Statement</button>',
    '@if (statementOpen()) {',
    '  <app-payout-statement (dismissed)="close()" />',
    '}',
  ];
  const component = [
    'export class PayoutsTab {',
    '  private readonly focusAfterRender = focusMover();',
    '  close() {',
    '    this.statementOpen.set(false);',
    '  }',
    '}',
  ];

  const fromComponent = scan(TS, component, {
    templateSource: template.join('\n'),
    isFocusTrap: TRAPS,
  });
  const fromTemplate = scan(HTML, template, {
    componentSource: component.join('\n'),
    isFocusTrap: TRAPS,
  });

  assert.equal(fromComponent.length, 1);
  assert.equal(fromComponent[0].line, 4);
  assert.equal(fromTemplate.length, 1);
  assert.equal(fromTemplate[0].line, 2);
});

/**
 * An `@else` body sits **outside** its `@if`'s braces, so scanning for `@if` alone attributed a trap
 * rendered there to whatever branch wrapped the page — reporting that branch's signal, which is a
 * loaded-state flag nothing dismisses, while the real dismiss handler went unjudged. Ten templates
 * in the app already use `@else`/`@empty`.
 */
test('does not attribute a trap in an else block to the branch that wraps the page', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (venueView(); as v) {',
    '      @if (ready()) {',
    '        <p>ok</p>',
    '      } @else {',
    '        <app-payout-statement (dismissed)="close()" />',
    '      }',
    '    }',
    '  `,',
    '})',
    'export class VenueMap {',
    '  close() { this.dialogOpen.set(false); }',
    '  reload() { this.venueView.set(undefined); }',
    '}',
  ];

  assert.deepEqual(scan(TS, lines, { isFocusTrap: TRAPS }), []);
});

/** A component that renders the same modal in two layouts has one teardown, so it has one finding. */
test('reports a signal once however many branches are gated on it', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="close()" /> }',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="close()" /> }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 8);
});

/** Prettier moves the brace onto its own line when the heritage clause overflows. */
test('does not let an unrelated member excuse a flip when the class brace stands alone', () => {
  const lines = modalComponent([
    '  ngOnInit() { this.hostRef.nativeElement.focus(); }',
    '  close() { this.statementOpen.set(false); }',
  ]);
  lines[8] = 'export class PayoutsTab';
  lines.splice(9, 0, '  implements OnInit', '{');

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].text, 'close() { this.statementOpen.set(false); }');
});

/** Both ends of the member are column-precise, or a neighbour on the same line lends it a leg. */
test('does not borrow a focus call from a member sharing the flip line', () => {
  const lines = modalComponent([
    '  other() { this.trigger.focus(); } close() { this.statementOpen.set(false); }',
  ]);

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 10);
});

/** A brace inside an interpolation closed the branch early, dropping the trap out of every span. */
test('reads past a brace quoted inside the branch body', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen()) {',
    "      <p>{{ label() ?? '}' }}</p>",
    '      <app-payout-statement (dismissed)="close()" />',
    '    }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 10);
});

/**
 * The most idiomatic dismiss in a small component is wired in the template, where there is no
 * handler to hold a leg — so it is a complete teardown with provably no focus move, not a miss.
 */
test('reports a teardown wired in the template with no handler at all', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen()) {',
    '      <app-payout-statement (dismissed)="statementOpen.set(false)" />',
    '    }',
    '  `,',
    '})',
    'export class PayoutsTab {}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 4);
});

/**
 * `payout-statement.ts` names `role="dialog"` and `trapFocusWithin` in its TSDoc as well as its
 * markup, so reading the raw file classified traps partly on prose — the same mistake the rule
 * already refuses to make about a focus helper named only in a comment.
 */
test('does not call a component a focus trap on the strength of its comments', () => {
  const files = {
    'frontend/src/app/shared/plain-panel.ts': [
      '/** Unlike a role="dialog" modal, this panel does not trap focus. */',
      "@Component({ selector: 'app-plain-panel', template: `<p>hi</p>` })",
      'export class PlainPanel {}',
    ].join('\n'),
    'frontend/src/app/operator/payout-statement.ts': [
      '/** A modal. */',
      '@Component({',
      "  selector: 'app-payout-statement',",
      '  template: `<div role="dialog" aria-modal="true"></div>`,',
      '})',
      'export class PayoutStatement {}',
    ].join('\n'),
  };
  const traps = focusTraps((path) => files[path] ?? null, () => Object.keys(files));

  assert.equal(traps('app-plain-panel'), false);
  assert.equal(traps('app-payout-statement'), true);
});

/** The rule's second half asks a question about the flip, so the flip is the line a diff must write. */
test('judges only the surfaces and flips a diff added', () => {
  const lines = modalComponent([
    '  open() { this.statementOpen.set(true); }',
    '  close() { this.statementOpen.set(false); }',
  ]);

  const elsewhere = scan(TS, lines, { added: new Set([1, 10]), isFocusTrap: TRAPS });
  const theFlip = scan(TS, lines, { added: new Set([11]), isFocusTrap: TRAPS });

  assert.deepEqual(elsewhere, []);
  assert.equal(theFlip.length, 1);
  assert.equal(theFlip[0].line, 11);
});

/**
 * #621's third review pass settled this: FOCUS-1 approximates a runtime property, so it prints and
 * returns 0 while BUSY-1 — syntactic, and unchallenged across three passes — fails the build.
 */
test('keeps FOCUS-1 advisory and BUSY-1 gating', () => {
  const sink = () => ({ written: [], write(text) { this.written.push(text); } });
  const advisory = { out: sink(), err: sink() };
  const gating = { out: sink(), err: sink() };

  const advised = settle(
    [{ path: HTML, line: 3, rule: 'FOCUS-1', text: '@if (confirmRemove()) {' }],
    'Focus posture',
    advisory.out,
    advisory.err,
  );
  const failed = settle(
    [{ path: HTML, line: 5, rule: 'BUSY-1', text: '[disabled]="saving()"' }],
    'Focus posture',
    gating.out,
    gating.err,
  );

  assert.equal(advised, 0);
  assert.match(advisory.out.written.join(''), /advisory, not gating/);
  assert.deepEqual(advisory.err.written, []);
  assert.equal(failed, 1);
  assert.match(gating.err.written.join(''), /BUSY-1/);
});

/**
 * `declaresClass` used to test `\bclass\b` before the statement-terminator, so walking up from a
 * FIRST member's own brace read `export class A {` and classified the member as the class body —
 * `memberOf` returned nothing, and a handler that demonstrably moves focus was reported (#629.1).
 * Member order must not change the verdict; a decorator-preceded member is the same walk.
 */
test('judges a first-member handler by its own body, not the class\'s', () => {
  const firstMember = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="close()" /> }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); this.trigger.focus(); }',
    '  statementOpen = signal(false);',
    '}',
  ];
  const fieldFirst = [...firstMember];
  [fieldFirst[6], fieldFirst[7]] = [fieldFirst[7], fieldFirst[6]];
  const decorated = [...firstMember];
  decorated.splice(6, 0, "  @HostListener('document:keydown.escape')");

  assert.deepEqual(scan(TS, firstMember, { isFocusTrap: TRAPS }), []);
  assert.deepEqual(scan(TS, fieldFirst, { isFocusTrap: TRAPS }), []);
  assert.deepEqual(scan(TS, decorated, { isFocusTrap: TRAPS }), []);
});

/**
 * Two blocks opening and closing on one line both span it, and the line-granular innermost pick
 * took the LATER sibling — a false positive against its signal plus a silent miss on the signal
 * that actually gates the trap (#629.2). Attribution has to be column-precise.
 */
test('attributes a trap to the block that renders it when two share a line', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="close()" /> } @if (banner()) { <p>x</p> }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); }',
    '  dismissBanner() { this.banner.set(false); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 7);
});

/**
 * `closingBrace` read the apostrophe in ordinary template prose as a string opener, skipped the
 * real `}` beside it, and extended the branch to the end of the file — so a trap rendered AFTER
 * the branch was attributed to it (#629.3). A quote with no mate on its own line is prose.
 */
test('does not let a prose apostrophe extend a branch to the end of file', () => {
  const lines = [
    '@Component({',
    '  template: `',
    "    @if (ready()) { <p>It's ready</p> }",
    '    <app-payout-statement (dismissed)="close()" />',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); }',
    '  reload() { this.ready.set(false); }',
    '}',
  ];

  assert.deepEqual(scan(TS, lines, { isFocusTrap: TRAPS }), []);
});

/**
 * When the diff adds the trigger half and a flip but not the prompt line, the floor lands on the
 * negated trigger — whose signal `gatingSignal` failed to read, so `reported` recorded null and
 * the prompt surface was reported a second time at its flip (#629.4). One finding per signal.
 */
test('reports a surface once when the floor lands on the negated trigger', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (!confirmRemove()) { <button data-testid="rm-trigger">Remove</button> }',
    '    @if (confirmRemove()) { <button data-testid="rm-confirm">Really remove</button> }',
    '  `,',
    '})',
    'export class Thing {',
    '  cancel() { this.confirmRemove.set(false); }',
    '}',
  ];
  const added = all(lines);
  added.delete(4);

  const violations = scan(TS, lines, { added });

  assert.equal(violations.length, 1);
});

/**
 * PR #630 review F-2: a heritage clause carrying a multi-line call argument
 * (`extends mixin({ … }) {`) put a statement-terminator-looking line between the class-body brace
 * and the `class` keyword, so the line-walk classified the class body as a member — and a focus
 * call anywhere in the class then exempted every stranding flip. The walk is brace-aware now.
 */
test('does not classify a heritage call argument closing line as a member', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen()) { <app-payout-statement (dismissed)="close()" /> }',
    '  `,',
    '})',
    'export class PayoutsTab extends mixin({',
    '  a: 1,',
    '}) {',
    '  private readonly m = focusMover();',
    '  other() { this.m("statement-open"); }',
    '  close() { this.statementOpen.set(false); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 11);
});

/**
 * PR #630 review F-3: two prose apostrophes on one line straddled a branch's `}` and read as a
 * string, re-opening the #629.3 misattribution. A quote is a string opener only in expression
 * context — an interpolation or a condition's parentheses — never in element text.
 */
test('does not pair prose apostrophes across a branch closing brace', () => {
  const lines = [
    '@Component({',
    '  template: `',
    "    @if (ready()) { <p>It's on</p> } <p>Don't miss it</p>",
    '    <app-payout-statement (dismissed)="close()" />',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); }',
    '  reload() { this.ready.set(false); }',
    '}',
  ];

  assert.deepEqual(scan(TS, lines, { isFocusTrap: TRAPS }), []);
});

/** The expression-context half of the same rule: a quoted brace in a condition is still skipped. */
test('reads past a brace quoted inside a branch condition', () => {
  const lines = [
    '@Component({',
    '  template: `',
    '    @if (statementOpen() && label() !== \'}\') { <app-payout-statement (dismissed)="close()" /> }',
    '  `,',
    '})',
    'export class PayoutsTab {',
    '  close() { this.statementOpen.set(false); }',
    '}',
  ];

  const violations = scan(TS, lines, { isFocusTrap: TRAPS });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 7);
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
