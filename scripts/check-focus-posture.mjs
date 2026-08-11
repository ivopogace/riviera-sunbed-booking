/**
 * Diff-scoped guard for the two focus postures `frontend/.claude/CLAUDE.md` states, both of them
 * causes of the same WCAG 2.4.3 stranded-focus class (#604, #614, #616 — twelve instances).
 *
 * - **BUSY-1** — a control disabled by a flag *its own activation set* blurs to `<body>` for the
 *   whole request. It belongs on `[appBusy]`, which announces the same state via `aria-disabled`.
 * - **FOCUS-1** — a confirm-before-destroy surface destroys the element focus is sitting on, so its
 *   component must move focus deliberately via `focusMover()`, or delegate to a shared confirm
 *   component that does.
 *
 * Only ever reasons about lines a diff **added**: ~12 legitimate `[disabled]` bindings and 8 standing
 * confirm surfaces must never fail the repo, and a guard that goes red on day one gets switched off
 * (issue #529). `--all` sweeps the whole tree for an audit instead.
 *
 * BUSY-1 discriminates on a curated busy-flag vocabulary rather than on a state/validity allow-list,
 * because the two error directions are not symmetric — a false negative leaves the status quo, a
 * false positive fails a build on correct code. Rationale and the derivation:
 * `docs/plans/focus-posture-guard.md`.
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

/** `aria-disabled` does not stop typing, and focus is on the clicked button, never the field. */
const TYPEABLE = new Set(['input', 'textarea', 'select']);

/**
 * Finds every posture violation the diff wrote in one file.
 *
 * @param {{ path: string, lines: string[], added: Set<number>, componentSource?: string }} input
 *   the file's new content, the 1-based line numbers the diff added, and — for an external template —
 *   the owning component's source, which is where its focus handling lives
 * @returns {{ path: string, line: number, rule: string, text: string }[]} one entry per violation
 */
export function findViolations({ path, lines, added, componentSource }) {
  if (!IN_SCOPE.test(path)) return [];

  const template = templateRegions(path, lines);
  const owner = path.endsWith('.html') ? (componentSource ?? '') : lines.join('\n');
  const violations = [
    ...busyViolations(path, lines, added, template),
    ...focusViolations(path, lines, added, template, owner),
  ];
  return violations.sort((a, b) => a.line - b.line);
}

/**
 * Blanks every character that is not Angular template markup, keeping line and column geometry so a
 * violation still reports its real position.
 *
 * An `.html` file is all template but for its comments. A `.ts` file is the opposite: only the
 * contents of a `template:` literal count, which is what keeps the `[disabled]` that
 * `shared/busy-action.ts` quotes in its own TSDoc — documenting the very form this rule bans — from
 * reading as code.
 */
function templateRegions(path, lines) {
  return path.endsWith('.html') ? maskHtmlComments(lines) : maskToInlineTemplates(lines);
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

function maskToInlineTemplates(lines) {
  const out = lines.map((line) => ' '.repeat(line.length).split(''));
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
          out[i][c] = ch;
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
        }
        pending = '';
        continue;
      }
      pending = /[\s\w:]/.test(ch) ? `${pending}${ch}`.slice(-40) : '';
    }
    if (state === 'code') pending = `${pending}\n`.slice(-40);
  }
  return out.map((chars) => chars.join(''));
}

/** Scans from the opening quote at `c` to just past its match, honouring backslash escapes. */
function skipString(chars, c) {
  const quote = chars[c];
  for (let i = c + 1; i < chars.length; i++) {
    if (chars[i] === '\\') i++;
    else if (chars[i] === quote) return i + 1;
  }
  return chars.length;
}

function busyViolations(path, lines, added, template) {
  const violations = [];

  for (const tag of startTags(template)) {
    if (TYPEABLE.has(tag.name)) continue;
    if (tag.attributes.has('[appBusy]')) continue;
    const disabled = tag.attributes.get('[disabled]');
    if (!disabled || !isBusyFlag(disabled.value)) continue;
    if (!added.has(disabled.line + 1)) continue;
    violations.push({
      path,
      line: disabled.line + 1,
      rule: 'BUSY-1',
      text: lines[disabled.line].trim(),
    });
  }
  return violations;
}

/** The helper every compliant confirm surface reaches for, however the component names its field. */
const MOVES_FOCUS = /focusMover\(|focusAfterRender/;

/** Both shared confirm components focus their own confirm button, so their users need no leg. */
const DELEGATES = /<app-confirm-panel|<app-confirm-with-reason/;

/**
 * Reports a confirm-before-destroy surface whose component moves focus nowhere.
 *
 * Judged per component rather than per signal flip: the flip-level shape cannot tell a prompt
 * closing under the user from the same signal being reset inside a bulk state-reset block (a venue
 * switch, a route change), where no focus move is wanted. Spike: `docs/plans/focus-posture-guard.md`.
 *
 * <p>One finding per component, not per `@if` — a surface routinely spans two blocks (the trigger's
 * and the prompt's), and the fix is one set of legs however many it spans.
 */
function focusViolations(path, lines, added, template, componentSource) {
  const markup = template.join('\n');
  if (DELEGATES.test(markup) || MOVES_FOCUS.test(componentSource)) return [];

  const surface = confirmSurfaces(template).find((found) => added.has(found.line + 1));
  if (surface === undefined) return [];
  return [{ path, line: surface.line + 1, rule: 'FOCUS-1', text: lines[surface.line].trim() }];
}

/** Every `@if` whose condition is a confirm-prompt flag rather than a domain value. */
function confirmSurfaces(lines) {
  const surfaces = [];

  for (let i = 0; i < lines.length; i++) {
    for (let c = lines[i].indexOf('@if'); c !== -1; c = lines[i].indexOf('@if', c + 1)) {
      const condition = readCondition(lines, i, c + 3);
      if (condition !== null && isConfirmPrompt(condition)) surfaces.push({ line: i });
    }
  }
  return surfaces;
}

/** The text between `@if (` and its matching `)`, or null when no parenthesis opens. */
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
    condition += ' ';
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
    const name = /^[^\s=>/'"]+/.exec(lines[i].slice(c))[0];
    c += name.length;
    if (lines[i][c] !== '=') {
      attributes.set(name, { value: '', line: i });
      continue;
    }
    const read = readValue(lines, i, c + 1);
    attributes.set(name, { value: read.value, line: i });
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
 * @param {string[]} [limitTo] when given, only these paths are considered
 */
export function check(range, limitTo) {
  const diff = git(diffArgs(...range));
  const violations = [];

  for (const [path, added] of parseAddedLines(diff)) {
    if (limitTo && !limitTo.includes(path)) continue;
    violations.push(...checkOne(path, added));
  }
  return violations;
}

/**
 * Sweeps every in-scope file in the working tree with the diff scoping lifted.
 *
 * The audit mode behind the plan's AC-11, deliberately **not** wired into CI: the standing tree
 * carries legitimate `[disabled]` bindings by design, so a repo-wide gate is exactly what the
 * diff-scoping exists to avoid.
 */
export function sweep() {
  const paths = changedPaths(git(['ls-files', '-z', 'frontend/src/app']));
  return paths.flatMap((path) => checkOne(path, null));
}

/** Checks one path; `added` of null lifts the diff scoping, which is what `sweep()` wants. */
function checkOne(path, added) {
  if (!IN_SCOPE.test(path)) return [];
  const text = readText(path);
  if (text === null) return [];
  const lines = text.split('\n');
  return findViolations({
    path,
    lines,
    added: added ?? new Set(lines.map((_, i) => i + 1)),
    componentSource: ownerSource(path),
  });
}

/**
 * The source of the component that owns a template.
 *
 * An external template's focus handling lives in its sibling `.ts`, so reading it is what keeps
 * FOCUS-1 from reporting every compliant `.html` in the app — `set-editor` and `layout-editor` both
 * have their confirm surface in one file and their `focusMover()` in the other.
 */
function ownerSource(path) {
  return path.endsWith('.html') ? (readText(path.replace(/\.html$/, '.ts')) ?? '') : '';
}

const ADVICE = {
  'BUSY-1':
    'BUSY-1: a control disabled by a flag its own activation set strands focus on <body> for the ' +
    'whole request (WCAG 2.4.3). Use [appBusy], and style it with the aria-disabled: variant. ' +
    'Inputs and validity/state bindings keep [disabled] — split a binding that mixes the two. ' +
    'See frontend/.claude/CLAUDE.md.',
  'FOCUS-1':
    'FOCUS-1: this component renders a confirm-before-destroy surface but moves focus nowhere, so ' +
    'each transition strands focus on <body> (WCAG 2.4.3). Give it all three legs — open, back-out ' +
    'and settled — via shared/focus-after-render.ts\'s focusMover(), or render the prompt with ' +
    '<app-confirm-panel>/<app-confirm-with-reason>, which focus themselves. ' +
    'See frontend/.claude/CLAUDE.md.',
};

function report(violations) {
  return violations.map((v) => `  ${v.path}:${v.line}  [${v.rule}]  ${v.text}`).join('\n');
}

function advise(violations) {
  return [...new Set(violations.map((v) => v.rule))].map((rule) => ADVICE[rule]).join('\n');
}

/** git runs from the repository root, so a pathspec has to be expressed from there too. */
function toRepoRelative(argument) {
  return relative(repoRoot(), resolve(process.cwd(), argument)).split(sep).join('/');
}

function main(argv) {
  const mode = argv[0];

  if (mode === '--files') {
    const paths = argv.slice(1).map(toRepoRelative);
    const violations = check(['HEAD', '--', ...paths], paths);
    if (violations.length === 0) return 0;
    process.stderr.write(`Focus-posture violations:\n${report(violations)}\n${advise(violations)}\n`);
    return 1;
  }

  if (mode === '--diff') {
    const violations = check([mergeBase(argv[1] ?? 'origin/main')]);
    if (violations.length === 0) return 0;
    process.stderr.write(
      `Focus-posture violations added by this diff:\n${report(violations)}\n${advise(violations)}\n`,
    );
    return 1;
  }

  if (mode === '--all') {
    const violations = sweep();
    const counts = ['BUSY-1', 'FOCUS-1']
      .map((rule) => `${rule}: ${violations.filter((v) => v.rule === rule).length}`)
      .join('  ');
    process.stdout.write(`${violations.length ? `${report(violations)}\n` : ''}${counts}\n`);
    return 0;
  }

  process.stderr.write(
    'usage: check-focus-posture.mjs (--diff <base> | --files <path…> | --all)\n',
  );
  return 2;
}

// Only run the CLI when invoked directly, so the test suite can import the detector.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
