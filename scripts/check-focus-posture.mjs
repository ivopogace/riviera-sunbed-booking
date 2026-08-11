/**
 * Diff-scoped guard for the focus postures `frontend/.claude/CLAUDE.md` states, all causes of the
 * same WCAG 2.4.3 stranded-focus class (#604, #614, #616, #621, #625 — fifteen instances). The
 * human half of the check, for those shapes, is `riviera-review-overlay`'s RV-FE-9 (#623).
 *
 * - **BUSY-1** — a control disabled by a flag *its own activation set* blurs to `<body>` for the
 *   whole request. It belongs on `[appBusy]`, which announces the same state via `aria-disabled`.
 * - **BUSY-2** — the self-committing field, #625's shape (#628): a text-entry `<input>`/`<textarea>`
 *   whose own start tag carries `(change)`/`(blur)` and a busy `[disabled]` — Enter fires
 *   `change` without leaving the field, so the flag blurs the field focus is in. The fix is
 *   `[readonly]`, which locks typing without blurring; the kinds `readonly` cannot lock are out of
 *   scope and stay RV-FE-9's, as is a `(input)`-only field (draft-sync, not a commit).
 * - **FOCUS-1** — a confirm-before-destroy surface, or a focus-trapped modal, destroys the element
 *   focus is sitting on, so its component must move focus deliberately — rendering a shared confirm
 *   component is not enough, since those own the open leg only. Judged per **gating signal** (#624):
 *   moving focus for one surface used to excuse every other surface the component owned.
 *
 * Only ever reasons about lines a diff **added**: ~12 legitimate `[disabled]` bindings and 11
 * standing surfaces — 8 confirm + 3 focus-trapped modals, the count #626's widened trigger judges —
 * must never fail the repo, and a guard that goes red on day one gets switched off
 * (issue #529). `--all` sweeps the whole tree for an audit instead.
 *
 * BUSY-1 discriminates on a curated busy-flag vocabulary rather than on a state/validity allow-list,
 * because the two error directions are not symmetric — a false negative leaves the status quo, a
 * false positive fails a build on correct code. Rationale, the known limits, and the review round
 * that set most of them: `docs/plans/focus-posture-guard.md`.
 */

import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  changedPaths,
  diffArgs,
  git,
  mergeBase,
  parseAddedLines,
  readText,
  repoRoot,
} from './git-diff.mjs';

/** Angular templates only; a spec's fixtures are allowed to build the non-compliant forms. */
const IN_SCOPE = /^frontend\/src\/app\/.*(?<!\.spec)\.(ts|html)$/;

/**
 * The rules that **fail** a build: the two syntactic ones, deliberately.
 *
 * BUSY-1 and BUSY-2 are element names, attributes and a curated vocabulary — each swept the whole
 * tree with no false positive before gating (297 files for BUSY-1; #628's sweep for BUSY-2).
 * FOCUS-1 asks whether a component *moves focus*, which is a runtime property being
 * approximated over source: five components in this app move focus with a plain `.focus()`, and each
 * widening of the predicate trades a false positive for a false negative. It still runs, still
 * reports, and still found the two live bugs #621's slice fixed — it just advises rather than blocks.
 * Decision and the three review rounds behind it: `docs/plans/focus-posture-guard.md`.
 */
const GATING = new Set(['BUSY-1', 'BUSY-2']);

/**
 * Identifier stems that denote an in-flight write the user's own activation started. Derived from
 * the 17 distinct expressions already bound to `[appBusy]`, plus their obvious siblings.
 *
 * Deliberately excludes `loading`, `pending`, `processing`, `updating` and `creating`: each reads as
 * often as *state* (`isPending(set)` is a standing carve-out) as it does as busyness, and a stem
 * that fires on state is the false positive this guard cannot afford.
 */
export const BUSY_STEMS = [
  'busy',
  'saving',
  'submitting',
  'erasing',
  'paying',
  'cancelling',
  'canceling',
  'withdrawing',
  'refunding',
  'sending',
  'reloading',
  'searching',
  'deciding',
  'acting',
  'deleting',
  'removing',
  'uploading',
  'regenerating',
  'approving',
  'rejecting',
  'suspending',
  'reinstating',
];

/**
 * The elements `[appBusy]` can actually replace `[disabled]` on.
 *
 * An allow-list, not a deny-list: `BusyAction` is for buttons only — inertness comes from consuming
 * the activating click — so advising it on a `<fieldset>` or a child component's `disabled` input
 * asks for a rewrite that cannot be written, and every one of the 51 `[appBusy]` bindings in the
 * app is on a `<button>`.
 */
const ACTIONABLE = new Set(['button', 'a']);

/**
 * The `<input>` kinds `readonly` actually locks, per the HTML spec — the allow-list #628 scopes
 * BUSY-2 to. The inert kinds (`<select>`, checkbox, radio, `file`, `range`, `color`) get no advice
 * at all: `readonly` cannot lock them, no attribute locks without blurring, and the right posture
 * there — serialize in the handler — is RV-FE-9's human call (`frontend/.claude/CLAUDE.md`).
 */
const READONLY_KINDS = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'number',
]);

/**
 * The commit bindings a field starts its own write from — #625's shape, on the field's own tag:
 * Enter fires `change` without leaving the field, a click-away fires `blur`. Deliberately NOT
 * `(input)`: that is a per-keystroke event whose dominant use is draft-sync into a signal while a
 * *button* starts the write — `admin-commissions` and `admin-privacy` bind exactly
 * `(input)` + `[disabled]="busy()"` as correct code, and the sweep that gates this rule found all
 * three. A field that genuinely commits per keystroke is a deliberate miss, as `BUSY_STEMS` misses
 * a novel flag name.
 */
const COMMIT_HANDLERS = ['(change)', '(blur)'];

/** The repo's focus helper, as a call site — a TSDoc mention is not compliance. */
const FOCUS_HELPER = /\b(focusMover|focusAfterRender)\s*\(/;

/**
 * What makes a child component a focus trap. Tearing one down is the same
 * destroy-the-element-focus-sits-on transition a confirm prompt makes, which is why the trigger
 * reaches it — instance 14 was a modal dismiss and named no confirm flag anywhere.
 */
const FOCUS_TRAP = /trapFocusWithin|aria-modal|role="dialog"/;

/** The app's own components; nothing else can resolve to a file, so nothing else is asked about. */
const COMPONENT_TAG = /<(app-[\w-]+)/g;

/**
 * The hand-rolled equivalent: `afterNextRender` is a general lifecycle API (a data call in
 * `auth/verify-email.ts`), so it counts only alongside an actual `focus()` — which is what
 * `shared/confirm-panel.ts` and `shared/confirm-with-reason.ts` do.
 */
const HAND_ROLLED = [/\bafterNextRender\s*\(/, /\.focus\s*\(/];

function movesFocus(code) {
  return FOCUS_HELPER.test(code) || HAND_ROLLED.every((pattern) => pattern.test(code));
}

/**
 * Finds every posture violation the diff wrote in one file.
 *
 * <p>A component and its template are judged as one thing however they are split, but a violation is
 * only ever reported against the file it is *in*: the floor anchors on the branch, the signal check
 * on the flip that strands focus. So an external template's `.ts` reads its sibling for surfaces and
 * reports its own flips, and the `.html` reports the branch — neither reports the other's lines, and
 * nothing is reported twice.
 *
 * @param {{ path: string, lines: string[], added: Set<number>,
 *   componentSource?: string | (() => string), templateSource?: string | (() => string),
 *   isFocusTrap?: (tag: string) => boolean }} input the file's new content,
 *   the 1-based line numbers the diff added, the sibling's source for whichever half is missing
 *   (a thunk defers the read until a verdict actually needs it), and
 *   the seam that answers whether a child component traps focus
 * @returns {{ path: string, line: number, rule: string, text: string }[]} one entry per violation
 */
export function findViolations({
  path,
  lines,
  added,
  componentSource,
  templateSource,
  isFocusTrap = resolveFocusTrap,
}) {
  if (!IN_SCOPE.test(path)) return [];

  const html = path.endsWith('.html');
  const scanned = html ? htmlRegions(lines) : typescriptRegions(lines);
  const code = html ? codeOf(sourceOf(componentSource)) : scanned.code;
  const inline = html || scanned.template.some((line) => line.trim() !== '');
  const template = inline ? scanned.template : maskHtmlComments(sourceOf(templateSource).split('\n'));
  const violations = [
    ...busyViolations(path, lines, added, scanned.template),
    ...focusViolations({
      path,
      lines,
      added,
      surfaces: surfacesIn(template, isFocusTrap),
      template,
      code,
      ownsTemplate: inline,
      ownsCode: !html,
    }),
  ];
  return violations.sort((a, b) => a.line - b.line);
}

/** An `.html` file is all template but for its comments, and carries no TypeScript at all. */
function htmlRegions(lines) {
  return { template: maskHtmlComments(lines), code: [] };
}

/**
 * A sibling source may arrive as a thunk, so `checkOne` reads the disk only for the half a verdict
 * actually needs — a `.ts` with an inline template asked for its `.html` sibling on every sweep,
 * ~300 swallowed ENOENTs per `--all` (#629).
 */
function sourceOf(source) {
  return (typeof source === 'function' ? source() : source) ?? '';
}

/** Strips a sibling component's comments and strings so `movesFocus` sees call sites only. */
function codeOf(source) {
  return typescriptRegions(source.split('\n')).code;
}

function maskHtmlComments(lines) {
  const out = lines.map((line) => line.split(''));
  let open = false;

  for (let i = 0; i < out.length; i++) {
    for (let c = 0; c < out[i].length; c++) {
      if (open) {
        if (startsWith(out[i], '-->', c)) {
          blank(out[i], c, 3);
          c += 2;
          open = false;
        } else {
          out[i][c] = ' ';
        }
      } else if (startsWith(out[i], '<!--', c)) {
        blank(out[i], c, 4);
        c += 3;
        open = true;
      }
    }
  }
  return out.map((chars) => chars.join(''));
}

const TEMPLATE_KEY = /template\s*:\s*$/;

/**
 * Splits a `.ts` file into its two masks in one pass, keeping line and column geometry so a
 * violation still reports its real position.
 *
 * - `template` — the contents of `template:` literals, and nothing else. This is what keeps the
 *   `[disabled]` that `shared/busy-action.ts` quotes in its own TSDoc — documenting the very form
 *   BUSY-1 bans — from reading as markup.
 * - `code` — executable source with comments, strings and template literals removed, so a helper
 *   named in a comment cannot pass for a call site.
 */
function typescriptRegions(lines) {
  const template = lines.map((line) => ' '.repeat(line.length).split(''));
  const code = lines.map((line) => ' '.repeat(line.length).split(''));
  const source = lines.map((line) => line.split(''));
  let state = 'code';
  let depth = 0;
  let pending = '';

  for (let i = 0; i < source.length; i++) {
    for (let c = 0; c < source[i].length; c++) {
      const ch = source[i][c];

      if (state === 'block') {
        if (startsWith(source[i], '*/', c)) {
          state = 'code';
          c++;
        }
        continue;
      }
      // Above the backtick handler below, or the closing backtick re-opens the string instead.
      if (state === 'string') {
        if (ch === '\\') c++;
        else if (ch === '`') state = 'code';
        continue;
      }
      if (state === 'template') {
        if (ch === '\\') {
          c++;
        } else if (depth > 0) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        } else if (startsWith(source[i], '${', c)) {
          depth = 1;
          c++;
        } else if (ch === '`') {
          state = 'code';
          pending = '';
        } else {
          template[i][c] = ch;
        }
        continue;
      }
      if (startsWith(source[i], '//', c)) break;
      if (startsWith(source[i], '/*', c)) {
        const end = indexOfFrom(source[i], '*/', c + 2);
        if (end === -1) {
          state = 'block';
          break;
        }
        c = end + 1;
        pending = '';
        continue;
      }
      if (ch === '"' || ch === "'") {
        c = skipString(source[i], c) - 1;
        pending = '';
        continue;
      }
      if (ch === '`') {
        if (TEMPLATE_KEY.test(pending)) {
          state = 'template';
          depth = 0;
        } else {
          state = 'string';
        }
        pending = '';
        continue;
      }
      code[i][c] = ch;
      pending = /[\s\w:]/.test(ch) ? `${pending}${ch}`.slice(-40) : '';
    }
    if (state === 'code') pending = `${pending}\n`.slice(-40);
  }
  return {
    template: template.map((chars) => chars.join('')),
    code: code.map((chars) => chars.join('')),
  };
}

/** Scans from the opening quote at `c` to just past its match, honouring backslash escapes. */
function skipString(chars, c) {
  const end = stringEnd(chars, c);
  return end === -1 ? chars.length : end + 1;
}

/** The closing quote's index on the same line, or -1 when the quote at `c` has no mate there. */
function stringEnd(chars, c) {
  const quote = chars[c];
  for (let i = c + 1; i < chars.length; i++) {
    if (chars[i] === '\\') i++;
    else if (chars[i] === quote) return i;
  }
  return -1;
}

function busyViolations(path, lines, added, template) {
  const violations = [];

  for (const tag of startTags(template)) {
    const disabled = tag.attributes.get('[disabled]');
    if (!disabled || !isBusyFlag(disabled.value)) continue;
    if (!added.has(disabled.line + 1)) continue;
    const rule = ACTIONABLE.has(tag.name) ? 'BUSY-1' : selfCommits(tag) ? 'BUSY-2' : null;
    if (rule === null) continue;
    violations.push({
      path,
      line: disabled.line + 1,
      rule,
      text: lines[disabled.line].trim(),
    });
  }
  return violations;
}

/**
 * #625's shape, mechanically (#628): the field's own start tag both starts the write and is
 * disabled by it. Only for the kinds `readonly` applies to — a dynamic `[type]` is skipped because
 * the kind cannot be read off the tag, and a missing `type` defaults to `text`, which can. The
 * safe error direction, as `BUSY_STEMS` is for BUSY-1.
 */
function selfCommits(tag) {
  if (!COMMIT_HANDLERS.some((handler) => tag.attributes.has(handler))) return false;
  if (tag.name === 'textarea') return true;
  if (tag.name !== 'input' || tag.attributes.has('[type]')) return false;
  const type = tag.attributes.get('type');
  return type === undefined || READONLY_KINDS.has(type.value.toLowerCase());
}

/**
 * Reports a surface whose teardown moves focus nowhere, in two scopes.
 *
 * <p>**The component floor** — a component rendering a confirm branch and holding no focus call site
 * at all. One finding per component, not per `@if`: a surface routinely spans two branches (the
 * trigger's and the prompt's), and the fix is one set of legs however many it spans. It stays
 * confirm-only, because `movesFocus` deliberately rejects a bare `.focus()` and the app's two shell
 * modals restore focus exactly that way — applying the floor to them reports correct code.
 *
 * <p>**The signal check** — the surface's own gating signal, whose flip-to-closed sites all move
 * focus nowhere. This is what a component-wide exemption hides: one compliant surface excused every
 * other surface the component owned (#624). It is narrower than that exemption and wider than the
 * flip-level rule #621 rejected, which demanded a leg at *every* flip site and so reported the bulk
 * state resets — a venue switch, a route change — where no move is wanted. **One compliant flip site
 * exempts the signal**; a signal nothing flips closed is not a teardown this component performs. The
 * cost is a second stranding flip added beside a compliant one: unreported, and the price of not
 * reporting every bulk reset.
 *
 * <p>**Rendering `<app-confirm-panel>` is not an exemption.** Those components own the *open* leg
 * only — their own TSDoc says focus back out is the caller's — so a component that delegates and
 * holds no focus helper still strands focus on cancel and on settle, two thirds of the rule.
 *
 * <p>One finding per **signal** per file. A component split across two files can report the same
 * surface twice — the `.html` at its branch, the `.ts` at its flip — because neither half can anchor
 * on a line it does not contain, and a diff that writes only one of them must still be told.
 */
function focusViolations({ path, lines, added, surfaces, template, code, ownsTemplate, ownsCode }) {
  const violations = [];
  const floor = ownsTemplate ? floorSurface(added, surfaces, code) : undefined;
  const reported = new Set();

  if (floor !== undefined) {
    violations.push({ path, line: floor.line + 1, rule: 'FOCUS-1', text: lines[floor.line].trim() });
    reported.add(gatingSignal(floor.condition));
  }
  const movers = moverNames(code.join('\n'));
  for (const surface of surfaces) {
    const signal = gatingSignal(surface.condition);
    if (surface.negated || signal === null || reported.has(signal)) continue;
    const flips = [
      ...flipSites(code, signal).map((site) => ({ ...site, inFile: ownsCode, handler: true })),
      ...flipSites(template, signal).map((site) => ({ ...site, inFile: ownsTemplate })),
    ];
    if (flips.length === 0) continue;
    if (flips.some((site) => site.handler && movesFocusIn(memberOf(code, site), movers))) continue;
    // The flip is where the leg goes; the branch is all a template can point at for a flip it lacks.
    const anchors = [
      ...flips.filter((site) => site.inFile).map((site) => site.line),
      ...(ownsTemplate ? [surface.line] : []),
    ];
    const at = anchors.find((line) => added.has(line + 1));
    if (at === undefined) continue;
    reported.add(signal);
    violations.push({ path, line: at + 1, rule: 'FOCUS-1', text: lines[at].trim() });
  }
  return violations;
}

function floorSurface(added, surfaces, code) {
  if (movesFocus(code.join('\n'))) return undefined;

  const confirm = surfaces.filter(
    (found) => found.kind === 'confirm' && added.has(found.line + 1),
  );
  // The negated half of a trigger/prompt pair renders no prompt, so point at the prompt if there is one.
  return confirm.find((found) => !found.negated) ?? confirm[0];
}

/**
 * **Every** Angular block, not only the branches.
 *
 * A trap is attributed to the innermost block holding it, so every block that can hold one has to be
 * in the list: an `@else` body sits *outside* its `@if`'s braces, so scanning for `@if` alone
 * attributed a trap in an `@else` to whatever `@if` wrapped the page — reporting a loaded-state flag
 * nothing dismisses. `@empty`, `@case` and `@defer` bodies are all outside their heads the same way.
 */
const BLOCK = /@(?:else\s+if|if|else|for|empty|switch|case|default|defer|placeholder|loading|error)\b/g;

/** Every branch a teardown can destroy the focused element from: a confirm prompt, or a focus trap. */
function surfacesIn(lines, isFocusTrap) {
  const spans = blocks(lines);
  const traps = trapSurfaces(lines, spans, isFocusTrap);
  return spans
    .filter((span) => span.condition !== null && (isConfirmPrompt(span.condition) || traps.has(span)))
    .map((span) => ({
      ...span,
      kind: isConfirmPrompt(span.condition) ? 'confirm' : 'modal',
    }));
}

function blocks(lines) {
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(BLOCK)) {
      const after = { line: i, column: match.index + match[0].length };
      const condition = /if\b/.test(match[0]) ? readCondition(lines, i, after.column) : null;
      found.push({
        line: i,
        condition,
        negated: condition !== null && /^\(\s*!/.test(condition),
        head: after,
      });
    }
  }
  return found;
}

/**
 * The blocks that render a focus trap, each attributed to the **innermost** one holding it.
 *
 * `venue-map.html` wraps its whole page in an `@if`, three hundred lines above the branch that
 * renders the booking dialog. A trap whose innermost block is not a condition — an `@else`, a
 * `@case` — is left unattributed rather than pushed outward onto a signal that does not gate it:
 * a miss, which this rule can afford, instead of a report on correct code, which it cannot.
 */
function trapSurfaces(lines, spans, isFocusTrap) {
  const traps = new Set();

  for (let i = 0; i < lines.length; i++) {
    for (const column of trapColumns(lines[i], isFocusTrap)) {
      const innermost = spans.filter((span) => contains(span, bodyEnd(lines, span), i, column)).at(-1);
      if (innermost !== undefined) traps.add(innermost);
    }
  }
  return traps;
}

/** Where on the line a trap is rendered — the column is what tells same-line siblings apart. */
function trapColumns(line, isFocusTrap) {
  const columns = [];
  const direct = FOCUS_TRAP.exec(line);
  if (direct !== null) columns.push(direct.index);
  for (const match of line.matchAll(COMPONENT_TAG)) {
    if (isFocusTrap(match[1])) columns.push(match.index);
  }
  return columns;
}

/**
 * Whether the position sits inside the block's span, column-precise at both ends. Two blocks
 * opening and closing on one line both cover it line-wise, and the line-granular test attributed
 * a trap in the first to the second — a false positive against a signal that gates nothing plus a
 * silent miss on the one that does (#629).
 */
function contains(span, end, line, column) {
  if (span.line > line || (span.line === line && span.head.column > column)) return false;
  return end.line > line || (end.line === line && end.column >= column);
}

/**
 * The position a block's `{ … }` body closes at, computed on demand.
 *
 * Only a template holding a trap ever asks, so a file with no `<app-…>` child pays no brace walk at
 * all — this runs from a `PostToolUse` hook on every edit.
 */
function bodyEnd(lines, span) {
  span.end ??= closingBrace(lines, span.head) ?? {
    line: lines.length - 1,
    column: (lines.at(-1) ?? '').length,
  };
  return span.end;
}

/**
 * The signal a branch is gated on: `(statementOpen()` and `(selectedSet(); as set` both name one,
 * and so does the negated trigger half `(!confirmRemove()` — the floor can land there when the
 * diff adds the trigger but not the prompt, and failing to read its signal recorded null in
 * `reported`, so the same surface was reported a second time at its flip (#629).
 */
function gatingSignal(condition) {
  return /^\(\s*!?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(condition)?.[1] ?? null;
}

/**
 * The lines flipping a surface's signal off.
 *
 * Only the literal `set(false | undefined | null)` forms; a teardown written some other way
 * (`update(…)`, a `linkedSignal`, a `resource` reset) is a deliberate miss — the safe direction,
 * as `BUSY_STEMS` is for BUSY-1. Widen this rather than route around it.
 */
function flipSites(code, signal) {
  const flip = new RegExp(`(?<![\\w$])${RegExp.escape(signal)}\\s*\\.set\\(\\s*(?:false|undefined|null)\\s*\\)`);
  const sites = [];

  for (let i = 0; i < code.length; i++) {
    const found = flip.exec(code[i]);
    if (found !== null) sites.push({ line: i, column: found.index });
  }
  return sites;
}

/** The field names bound to `focusMover()`, since the mover's name is the component's to choose. */
function moverNames(code) {
  return [...code.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*focusMover\s*\(/g)].map((match) => match[1]);
}

/**
 * Whether the class member holding a flip moves focus.
 *
 * A bare `.focus()` counts here though `movesFocus` rejects it at component scope: narrowed to the
 * handler that closes this one surface, a focus call cannot plausibly be about something else.
 */
function movesFocusIn(member, movers) {
  return (
    /\.focus\s*\(/.test(member) ||
    movers.some((name) => new RegExp(`(?<![\\w$])${RegExp.escape(name)}\\s*\\(`).test(member))
  );
}

/**
 * The text of the class member holding a flip site — the unit a focus leg is judged in.
 *
 * Not the innermost block: a flip inside a `subscribe(…)` callback and the leg beside it belong to
 * the same handler, and `venue-map` writes its focus restore inside a `queueMicrotask`. Both ends
 * are column-precise, or a neighbour sharing the member's opening or closing line lends it a
 * `.focus()` it does not have. The walk stops at the class-declaring brace — the outermost
 * non-class block seen by then IS the member, so continuing to line 0 bought nothing (#629).
 */
function memberOf(code, site) {
  let member;
  let depth = 0;

  for (let i = site.line; i >= 0; i--) {
    for (let c = (i === site.line ? site.column : code[i].length) - 1; c >= 0; c--) {
      if (code[i][c] === '}') depth++;
      else if (code[i][c] !== '{') continue;
      else if (depth > 0) depth--;
      else if (declaresClass(code, i)) return member === undefined ? '' : blockText(code, member);
      else member = { line: i, column: c };
    }
  }
  return member === undefined ? '' : blockText(code, member);
}

/**
 * Whether the block opening here is the class body rather than one of its members.
 *
 * Prettier moves the brace onto its own line whenever the heritage clause overflows, so the
 * declaration can end lines above it. The statement-terminator test runs FIRST on the lines
 * above: a first (or decorator-preceded) member's walk reaches the class declaration's own line,
 * and reading `class` there classified the member's brace as the class body — reporting a handler
 * that demonstrably moves focus (#629). The declaration line itself ends in `{` or precedes a
 * heritage line, so terminating there is what tells the two apart.
 */
function declaresClass(code, line) {
  for (let i = line; i >= 0; i--) {
    if (i < line && /[;{}]\s*$|^\s*$/.test(code[i])) return false;
    if (/\bclass\b/.test(code[i])) return true;
  }
  return false;
}

function blockText(lines, open) {
  const close = closingBrace(lines, open);
  if (close === null) return lines[open.line].slice(open.column);
  if (close.line === open.line) return lines[open.line].slice(open.column, close.column + 1);
  return [
    lines[open.line].slice(open.column),
    ...lines.slice(open.line + 1, close.line),
    lines[close.line].slice(0, close.column + 1),
  ].join('\n');
}

/**
 * The position of the `}` closing the first `{` at or after `from`.
 *
 * Quote-aware, because a template legitimately writes a brace inside an attribute or an
 * interpolation (`{{ label() ?? '}' }}`) and counting it closes a block lines early — which moves a
 * trap out of the branch that renders it, or into a later sibling that does not. But only a quote
 * whose mate closes on the same line is a string: the apostrophe in ordinary prose
 * (`<p>It's ready</p> }`) has none, and skipping from it missed the real `}` beside it —
 * extending the branch to the end of the file and attributing every later trap to it (#629).
 */
function closingBrace(lines, from) {
  let depth = 0;

  for (let i = from.line; i < lines.length; i++) {
    for (let c = i === from.line ? from.column : 0; c < lines[i].length; c++) {
      const ch = lines[i][c];
      if (ch === '"' || ch === "'") {
        const end = stringEnd(lines[i], c);
        if (end !== -1) c = end;
      } else if (ch === '{') depth++;
      else if (ch !== '}') continue;
      else if (depth === 0) return null;
      else if (--depth === 0) return { line: i, column: c };
    }
  }
  return null;
}

/**
 * The text between a branch's `(` and its matching `)`.
 *
 * The separator is appended only inside the parentheses: at depth 0 a line break would prepend
 * whitespace to a condition whose `(` opens on the next line, and `isConfirmPrompt`'s anchor
 * would then never match.
 */
function readCondition(lines, line, column) {
  let depth = 0;
  let condition = '';

  for (let i = line; i < lines.length; i++) {
    for (let c = i === line ? column : 0; c < lines[i].length; c++) {
      const ch = lines[i][c];
      if (depth === 0 && /\s/.test(ch)) continue;
      if (depth === 0 && ch !== '(') return null;
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return condition;
      if (depth > 0) condition += ch;
    }
    if (depth > 0) condition += ' ';
  }
  return null;
}

/**
 * A prompt flag is *called* and matches `confirm`; the aliasing form never is one.
 *
 * The two shapes this rejects are both live: `@if (state() === 'confirmed')` in `booking-pay`, where
 * the match is a string literal, and `@if (confirmation(); as c)` in `booking-confirmation`, where
 * `confirmation` is a domain noun being bound to a value.
 */
function isConfirmPrompt(condition) {
  if (/;\s*as\s/.test(condition)) return false;
  const called = /^\(!?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(condition);
  return called !== null && /confirm/i.test(called[1]);
}

/** True when any identifier in the expression carries a busy stem. */
function isBusyFlag(expression) {
  const identifiers = expression.match(/[A-Za-z_$][\w$]*/g) ?? [];
  return identifiers.some((name) =>
    BUSY_STEMS.some((stem) => name.toLowerCase().includes(stem)),
  );
}

/**
 * Walks the masked template and returns one entry per element start tag, with its attributes.
 *
 * A start tag legitimately spans lines — every multi-line binding in the app is written that way —
 * so this tracks position across the whole region rather than per line.
 */
function startTags(lines) {
  const tags = [];

  for (let i = 0; i < lines.length; i++) {
    for (let c = 0; c < lines[i].length; c++) {
      if (lines[i][c] !== '<' || !/[A-Za-z]/.test(lines[i][c + 1] ?? '')) continue;
      const name = /^[\w-]+/.exec(lines[i].slice(c + 1))[0];
      const tag = readAttributes(lines, i, c + 1 + name.length);
      tags.push({ name: name.toLowerCase(), attributes: tag.attributes });
      i = tag.line;
      c = tag.column;
    }
  }
  return tags;
}

function readAttributes(lines, line, column) {
  const attributes = new Map();
  let i = line;
  let c = column;

  while (i < lines.length) {
    if (c >= lines[i].length) {
      i++;
      c = 0;
      continue;
    }
    const ch = lines[i][c];
    if (ch === '>') return { attributes, line: i, column: c };
    if (/[\s/]/.test(ch)) {
      c++;
      continue;
    }
    // `{{ a<b ? 'x' : 'y' }}` reads as a start tag, and its quote is where a name should be.
    const name = /^[^\s=>/'"]+/.exec(lines[i].slice(c));
    if (name === null) return { attributes, line: i, column: c };
    c += name[0].length;
    if (lines[i][c] !== '=') {
      attributes.set(name[0], { value: '', line: i });
      continue;
    }
    const read = readValue(lines, i, c + 1);
    attributes.set(name[0], { value: read.value, line: i });
    i = read.line;
    c = read.column;
  }
  return { attributes, line: lines.length - 1, column: 0 };
}

function readValue(lines, line, column) {
  const quote = lines[line][column];
  if (quote !== '"' && quote !== "'") {
    const bare = /^[^\s>]*/.exec(lines[line].slice(column))[0];
    return { value: bare, line, column: column + bare.length };
  }
  let value = '';
  for (let i = line; i < lines.length; i++) {
    const from = i === line ? column + 1 : 0;
    const end = lines[i].indexOf(quote, from);
    if (end === -1) {
      value += `${lines[i].slice(from)}\n`;
      continue;
    }
    return { value: value + lines[i].slice(from, end), line: i, column: end + 1 };
  }
  return { value, line: lines.length - 1, column: 0 };
}

function startsWith(chars, token, at) {
  for (let i = 0; i < token.length; i++) {
    if (chars[at + i] !== token[i]) return false;
  }
  return true;
}

function indexOfFrom(chars, token, from) {
  for (let i = from; i <= chars.length - token.length; i++) {
    if (startsWith(chars, token, i)) return i;
  }
  return -1;
}

function blank(chars, at, length) {
  for (let i = at; i < at + length; i++) chars[i] = ' ';
}

/**
 * Runs the detector over every in-scope file a diff touches.
 *
 * @param {string[]} range arguments describing the diff, e.g. `['<merge-base>']`
 */
export function check(range) {
  return [...parseAddedLines(git(diffArgs(...range)))].flatMap(([path, added]) =>
    checkOne(path, added),
  );
}

/**
 * Checks explicit paths against `HEAD`, judging an **untracked** file whole.
 *
 * A new file has no diff against `HEAD`, so the plain diff path reported it clean — and a new
 * component is exactly how a FOCUS-1 surface enters the tree, on the `Write` the hook fires for.
 *
 * <p>Tracked first, then diff only what is tracked: the new-file case this exists for would
 * otherwise always fork a `git diff` guaranteed to come back empty, on the interactive edit loop.
 *
 * @param {string[]} paths repo-relative paths
 * @param {{ tracked?: (paths: string[]) => Set<string>, read?: (path: string) => string | null,
 *   diff?: (paths: string[]) => Map<string, Set<number>> }} [seams] injection points for the test
 *   suite; all three hit git or disk by default
 */
export function checkPaths(paths, seams = {}) {
  const { tracked = trackedAmong, read = readText, diff = diffedLines } = seams;
  const known = tracked(paths);
  const added = known.size === 0 ? new Map() : diff([...known]);
  return paths.flatMap((path) =>
    known.has(path)
      ? checkOne(path, added.get(path) ?? new Set(), read)
      : checkOne(path, null, read),
  );
}

function diffedLines(paths) {
  return parseAddedLines(git(diffArgs('HEAD', '--', ...paths)));
}

/**
 * One `git ls-files` for the whole set. `--error-unmatch` per path would fork N processes and print
 * git's "did you forget to 'git add'?" to stderr for every new file — telling the author the guard
 * failed when it worked. An empty set short-circuits, since a bare `ls-files` lists the repository.
 */
function trackedAmong(paths) {
  if (paths.length === 0) return new Set();
  return new Set(changedPaths(git(['ls-files', '-z', '--', ...paths])));
}

/**
 * Sweeps every in-scope file in the working tree with the diff scoping lifted.
 *
 * The audit mode behind the plan's AC-11, deliberately **not** wired into CI: the standing tree
 * carries legitimate `[disabled]` bindings by design, so a repo-wide gate is exactly what the
 * diff-scoping exists to avoid.
 */
export function sweep() {
  return appPaths().flatMap((path) => checkOne(path, null));
}

/**
 * One `git ls-files` per process: `sweep()` and the trap index used to run the identical command
 * separately — two subprocesses per `--all`, in a guard a `PostToolUse` hook runs on every edit
 * (#629). Built lazily, so the hook still forks nothing until something actually asks.
 */
let appPathsIndex;
function appPaths() {
  return (appPathsIndex ??= changedPaths(git(['ls-files', '-z', 'frontend/src/app'])));
}

/** Checks one path; `added` of null lifts the diff scoping, which is what `sweep()` wants. */
function checkOne(path, added, read = readText) {
  if (!IN_SCOPE.test(path)) return [];
  const text = read(path);
  if (text === null) return [];
  const lines = text.split('\n');
  return findViolations({
    path,
    lines,
    added: added ?? new Set(lines.map((_, i) => i + 1)),
    componentSource: () => sibling(path, '.html', '.ts', read),
    templateSource: () => sibling(path, '.ts', '.html', read),
  });
}

/**
 * The other half of a component split across two files.
 *
 * An external template's focus handling lives in its sibling `.ts`, and that `.ts`'s surfaces live
 * in its sibling `.html`; reading across is what keeps FOCUS-1 from reporting every compliant
 * `.html` in the app, and what lets the `.ts` report the flip that strands focus. `set-editor` and
 * `layout-editor` are both written this way.
 */
function sibling(path, from, to, read) {
  if (!path.endsWith(from)) return '';
  return read(`${path.slice(0, -from.length)}${to}`) ?? '';
}

/**
 * Answers whether a component tag renders a focus trap, by reading the file its selector's basename
 * names. An unresolvable tag is not a trap — the safe direction, as `BUSY_STEMS` is for BUSY-1.
 *
 * <p>Judged on the child's markup and code, never its comments: `payout-statement.ts` names
 * `role="dialog"` and `trapFocusWithin` in its TSDoc as well, and a component whose prose merely
 * *discusses* a modal would otherwise turn every `@if` rendering it into a surface. Same discipline
 * as `movesFocus`, which is why a helper named only in a comment is not compliance either.
 *
 * <p>The index is one `git ls-files`, built only when a template actually renders an `<app-…>` child
 * and then cached for the process: the `PostToolUse` hook runs this guard on every edit (#621's R-6).
 *
 * @param {(path: string) => string | null} [read] disk, injectable for the test suite
 * @param {() => string[]} [list] the candidate paths, likewise
 */
export function focusTraps(read = readText, list = appPaths) {
  const answers = new Map();
  let index;

  return (tag) => {
    if (!answers.has(tag)) {
      index ??= list();
      const source = index.find((path) => path.endsWith(`/${tag.replace(/^app-/, '')}.ts`));
      answers.set(tag, source !== undefined && trapsFocus(source, read));
    }
    return answers.get(tag);
  };
}

function trapsFocus(source, read) {
  const regions = typescriptRegions((read(source) ?? '').split('\n'));
  const external = maskHtmlComments((read(source.replace(/\.ts$/, '.html')) ?? '').split('\n'));
  return FOCUS_TRAP.test(
    [...regions.code, ...regions.template, ...external].join('\n'),
  );
}

const resolveFocusTrap = focusTraps();

const ADVICE = {
  'BUSY-1':
    'BUSY-1: a <button>/<a> disabled by a flag its own activation set strands focus on <body> for ' +
    'the whole request (WCAG 2.4.3). Use [appBusy], and style it with the aria-disabled: variant. ' +
    'A binding that mixes busyness with validity splits, with the VALIDITY half left on [disabled] ' +
    '— the same flag on both is still this violation. Every other element is out of scope. ' +
    'See frontend/.claude/CLAUDE.md.',
  'BUSY-2':
    'BUSY-2: a text-entry field disabled by a flag its own (change)/(blur) set blurs the ' +
    'field focus is in — Enter fires change without leaving it, and a click-away disables the ' +
    'next field just as focus lands (WCAG 2.4.3, #625). Use [readonly] instead (style with the ' +
    'read-only: variant): it locks typing while keeping the field focused and in the tab order — ' +
    'pricing-tab.html is the live shape. The kinds readonly cannot lock (select, checkbox, radio, ' +
    'file, range, color) are out of scope: serialize in the handler instead of locking the ' +
    'control. See frontend/.claude/CLAUDE.md.',
  'FOCUS-1':
    'FOCUS-1: a transition that destroys the element focus sits on — a confirm prompt settling, a ' +
    'focus-trapped modal dismissed or torn down by a state reset — strands focus on <body> unless ' +
    'it is moved deliberately (WCAG 2.4.3). Give the surface all three legs — open, back-out and ' +
    "settled — via shared/focus-after-render.ts's focusMover(). The line reported is the branch " +
    'when the component moves focus nowhere at all; otherwise it is the flip that closes the ' +
    'surface while its own handler moves none — or the branch again in a file that holds no flip, ' +
    "as an external template's .html does whatever its component holds elsewhere. Judged per " +
    'gating signal, so moving focus for one surface no longer excuses another. Rendering ' +
    '<app-confirm-panel>/<app-confirm-with-reason> does NOT clear this: they own the open leg ' +
    'only. See frontend/.claude/CLAUDE.md.',
};

function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}  [${v.rule}]  ${v.text}`).join('\n');
}

function advise(violations) {
  return [...new Set(violations.map((v) => v.rule))].map((rule) => ADVICE[rule]).join('\n');
}

/**
 * Prints both kinds and fails only on the gating one.
 *
 * An advisory still reaches the log — a rule nobody sees is a rule nobody follows — but a build is
 * never red because a heuristic guessed wrong about how a component moves focus.
 *
 * @param {{ write: (text: string) => void }} [out] the streams, injectable so the posture itself is
 *   testable rather than asserted about
 */
export function settle(violations, headline, out = process.stdout, err = process.stderr) {
  const gating = violations.filter((v) => GATING.has(v.rule));
  const advisory = violations.filter((v) => !GATING.has(v.rule));

  if (advisory.length > 0) {
    out.write(`${headline} — advisory, not gating:\n${report(advisory)}\n${advise(advisory)}\n`);
  }
  if (gating.length === 0) return 0;
  err.write(`${headline}:\n${report(gating)}\n${advise(gating)}\n`);
  return 1;
}

/** git runs from the repository root, so a pathspec has to be expressed from there too. */
function toRepoRelative(argument) {
  return relative(repoRoot(), resolve(process.cwd(), argument)).split(sep).join('/');
}

function main(argv) {
  const mode = argv[0];

  if (mode === '--hook') {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const path = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
    if (!path) return 0;
    const edited = toRepoRelative(path);
    if (!IN_SCOPE.test(edited)) return 0;
    const violations = checkPaths([edited]);
    if (violations.length === 0) return 0;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Focus posture written by this edit:\n${report(violations)}\n${advise(violations)}`,
        },
      }),
    );
    return 0;
  }

  // An explicit request judges the named files whole; skipping committed ones would read as clean.
  if (mode === '--files') {
    const paths = argv.slice(1).map(toRepoRelative);
    return settle(paths.flatMap((path) => checkOne(path, null)), 'Focus posture');
  }

  if (mode === '--diff') {
    const violations = check([mergeBase(argv[1] ?? 'origin/main')]);
    return settle(violations, 'Focus posture written by this diff');
  }

  if (mode === '--all') {
    const violations = sweep();
    const counts = ['BUSY-1', 'BUSY-2', 'FOCUS-1']
      .map((rule) => `${rule}: ${violations.filter((v) => v.rule === rule).length}`)
      .join('  ');
    process.stdout.write(`${violations.length ? `${report(violations)}\n` : ''}${counts}\n`);
    return 0;
  }

  process.stderr.write(
    'usage: check-focus-posture.mjs (--diff <base> | --files <path…> | --all | --hook)\n',
  );
  return 2;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
