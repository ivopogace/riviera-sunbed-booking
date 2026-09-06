import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CodeTail, INLINE_TEMPLATE_EXTENSIONS, interpolationStep } from './inline-template.mjs';

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
