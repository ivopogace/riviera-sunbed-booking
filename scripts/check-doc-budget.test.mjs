import test from 'node:test';
import assert from 'node:assert/strict';

import { areaOf, compare, overBudget, tally, total } from './check-doc-budget.mjs';

/** A member doc of `count` text lines on a method: over the budget of three from the fourth. */
const memberDoc = (count) =>
  [
    'class Probe {',
    '\t/**',
    ...Array.from({ length: count }, (_, k) => `\t * Line ${k + 1}.`),
    '\t */',
    '\tvoid run() {',
    '\t}',
    '}',
  ].join('\n');

const BOOKING = 'platform/src/main/java/ai/riviera/platform/booking/application/Probe.java';

test('areaOf books a path to its module or frontend folder', () => {
  assert.equal(areaOf(BOOKING), 'platform/booking');
  assert.equal(
    areaOf('platform/src/main/java/ai/riviera/platform/SecurityConfig.java'),
    'platform/(root)',
  );
  assert.equal(areaOf('frontend/src/app/operator/layout-editor.ts'), 'frontend/operator');
  assert.equal(areaOf('frontend/src/app/app.ts'), 'frontend/(app)');
  assert.equal(areaOf('frontend/src/main.ts'), 'frontend/(src)');
  assert.equal(areaOf('platform/src/main/java/org/elsewhere/Probe.java'), 'platform/(other)');
  assert.equal(areaOf('RESPONSIBILITIES.md'), 'RESPONSIBILITIES.md');
});

test('overBudget and tally count a RESPONSIBILITIES.md block over its budget of eight', () => {
  const text = ['## `booking`', '', '- **Rule.** One.', ...Array.from({ length: 10 }, (_, k) => `  ${k}.`)].join('\n');

  assert.deepEqual(
    overBudget('RESPONSIBILITIES.md', text).map(({ rule, excess }) => ({ rule, excess })),
    [{ rule: 'respbudget', excess: 3 }],
  );
  assert.deepEqual(tally([{ path: 'RESPONSIBILITIES.md', text }]), { 'RESPONSIBILITIES.md': 3 });
  assert.deepEqual(overBudget('CONTEXT.md', text), []);
});

test('overBudget judges the whole file, and ignores paths outside the budget', () => {
  assert.deepEqual(
    overBudget(BOOKING, memberDoc(5)).map(({ rule, excess }) => ({ rule, excess })),
    [{ rule: 'docbudget', excess: 2 }],
  );
  assert.deepEqual(overBudget(BOOKING, memberDoc(3)), []);
  assert.deepEqual(
    overBudget('platform/src/test/java/ai/riviera/platform/ProbeTest.java', memberDoc(9)),
    [],
  );
});

test('tally sums the excess per area, with sorted keys and no zero rows', () => {
  const areas = tally([
    { path: 'platform/src/main/java/ai/riviera/platform/venue/Probe.java', text: memberDoc(4) },
    { path: BOOKING, text: memberDoc(5) },
    { path: 'platform/src/main/java/ai/riviera/platform/booking/Other.java', text: memberDoc(6) },
    { path: 'frontend/src/app/venue/probe.ts', text: memberDoc(2) },
  ]);

  assert.deepEqual(areas, { 'platform/booking': 5, 'platform/venue': 1 });
  assert.deepEqual(Object.keys(areas), ['platform/booking', 'platform/venue']);
  assert.equal(total(areas), 6);
});

test('compare: an equal tree is ok', () => {
  assert.deepEqual(compare({ a: 3 }, { a: 3 }), { verdict: 'ok', moved: [] });
});

test('compare: a rising total grew, naming the area that rose', () => {
  assert.deepEqual(compare({ a: 3, b: 2 }, { a: 3 }), {
    verdict: 'grew',
    moved: [{ area: 'b', from: 0, to: 2 }],
  });
});

test('compare: a falling total, or a move between areas, is stale until the baseline is updated', () => {
  assert.equal(compare({ a: 1 }, { a: 3 }).verdict, 'stale');
  assert.equal(compare({}, { a: 3 }).verdict, 'stale');
  assert.deepEqual(compare({ b: 3 }, { a: 3 }), {
    verdict: 'stale',
    moved: [
      { area: 'a', from: 3, to: 0 },
      { area: 'b', from: 0, to: 3 },
    ],
  });
});
