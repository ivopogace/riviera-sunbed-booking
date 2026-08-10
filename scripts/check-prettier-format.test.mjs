import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findMisformatted, inScope } from './check-prettier-format.mjs';

const PATH = 'frontend/src/app/a.ts';

/** `findMisformatted` over one file, with the added-line set written as plain numbers. */
function findings({ current, formatted, added }) {
  return findMisformatted({ path: PATH, current, formatted, added: new Set(added) });
}

test('pre-existing drift outside the added lines is not reported', () => {
  assert.deepEqual(
    findings({
      current: "const a = 'x';\nconst b   =   2;\nconst c = 'y';\n",
      formatted: "const a = 'x';\nconst b = 2;\nconst c = 'y';\n",
      added: [1, 3],
    }),
    [],
  );
});

test('reports the added line and what Prettier expects', () => {
  const found = findings({
    current: "const a = 'x';\nconst b   =   2;\nconst c = 'y';\n",
    formatted: "const a = 'x';\nconst b = 2;\nconst c = 'y';\n",
    added: [2],
  });

  assert.deepEqual(found, [
    {
      path: PATH,
      line: 2,
      endLine: 2,
      current: ['const b   =   2;'],
      expected: ['const b = 2;'],
    },
  ]);
});

test('a file the diff creates is judged in full', () => {
  const current = "const a   = 1;\nconst b = 2;\nconst c   = 3;\n";
  const formatted = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';

  const found = findings({ current, formatted, added: [1, 2, 3, 4] });

  assert.deepEqual(
    found.map((f) => [f.line, f.endLine]),
    [
      [1, 1],
      [3, 3],
    ],
  );
});

test('only frontend/ is in scope', () => {
  assert.equal(inScope('frontend/src/app/a.ts'), true);
  assert.equal(inScope('frontend/package.json'), true);
  assert.equal(inScope('scripts/check-inline-comments.mjs'), false);
  assert.equal(inScope('docs/plans/p.md'), false);
  assert.equal(inScope('platform/src/main/java/ai/riviera/platform/Application.java'), false);
  assert.equal(inScope('frontend-notes/a.ts'), false);
});

test('an insertion is attributed to the lines it sits between', () => {
  const missingFinalNewline = { current: 'const a = 1;', formatted: 'const a = 1;\n' };

  assert.deepEqual(
    findings({ ...missingFinalNewline, added: [1] }),
    [{ path: PATH, line: 2, endLine: 1, current: [], expected: [''] }],
  );
  assert.deepEqual(findings({ ...missingFinalNewline, added: [7] }), []);
});

test('a file Prettier already formats reports nothing', () => {
  assert.deepEqual(
    findings({
      current: "const a = 'x';\n",
      formatted: "const a = 'x';\n",
      added: [1],
    }),
    [],
  );
});

test('one over-width line rewrapped into several is one finding', () => {
  const found = findings({
    current: 'call(argument1, argument2, argument3);\n',
    formatted: 'call(\n  argument1,\n  argument2,\n  argument3,\n);\n',
    added: [1],
  });

  assert.equal(found.length, 1);
  assert.deepEqual(found[0].current, ['call(argument1, argument2, argument3);']);
  assert.equal(found[0].expected.length, 5);
});

test('separate drifted regions are separate findings', () => {
  const found = findings({
    current: 'const a   = 1;\nconst b = 2;\nconst c = 3;\nconst d   = 4;\n',
    formatted: 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\n',
    added: [1, 4],
  });

  assert.deepEqual(
    found.map((f) => f.line),
    [1, 4],
  );
});
