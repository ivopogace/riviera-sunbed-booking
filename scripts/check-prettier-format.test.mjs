import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyHunks,
  findMisformatted,
  inScope,
  inspect,
  partitionFixable,
  report,
} from './check-prettier-format.mjs';

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

test('--fix rewrites only the reported hunks', () => {
  const current = 'const a   = 1;\nconst b = 2;\nconst c   = 3;\n';
  const formatted = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';

  const found = findings({ current, formatted, added: [3] });

  assert.equal(applyHunks(current, found), 'const a   = 1;\nconst b = 2;\nconst c = 3;\n');
});

test('--fix closes an insertion the same way', () => {
  const found = findings({ current: 'const a = 1;', formatted: 'const a = 1;\n', added: [1] });

  assert.equal(applyHunks('const a = 1;', found), 'const a = 1;\n');
});

test('an unparseable file warns instead of failing the gate', async () => {
  const warnings = [];
  const found = await inspect({
    path: PATH,
    current: 'const a = ;',
    added: new Set([1]),
    format: () => {
      throw new SyntaxError('Unexpected token (1:11)');
    },
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(found, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /a\.ts/);
  assert.match(warnings[0], /Unexpected token \(1:11\)/);
});

test('a file Prettier does not handle is skipped silently', async () => {
  const warnings = [];
  const found = await inspect({
    path: 'frontend/public/favicon.ico',
    current: ' ',
    added: new Set([1]),
    format: () => null,
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(found, []);
  assert.deepEqual(warnings, []);
});

test('inspect reports what the formatter would write', async () => {
  const found = await inspect({
    path: PATH,
    current: 'const a   = 1;\n',
    added: new Set([1]),
    format: () => 'const a = 1;\n',
    warn: () => assert.fail('should not warn'),
  });

  assert.deepEqual(found, [
    { path: PATH, line: 1, endLine: 1, current: ['const a   = 1;'], expected: ['const a = 1;'] },
  ]);
});

test('the report shows both sides of each hunk and names the fix', () => {
  const text = report([
    { path: PATH, line: 4, endLine: 4, current: ['const a   = 1;'], expected: ['const a = 1;'] },
  ]);

  assert.match(text, /frontend\/src\/app\/a\.ts:4/);
  assert.match(text, /- const a {3}= 1;/);
  assert.match(text, /\+ const a = 1;/);
  assert.match(text, /--fix/);
});

test('--fix refuses a coarse hunk instead of rewriting the region it spans', () => {
  const { fixable, refused } = partitionFixable([
    { path: 'frontend/src/a.ts', line: 1, endLine: 1, current: ['a'], expected: ['b'] },
    { path: 'frontend/src/big.html', line: 1, endLine: 900, current: [], expected: [], coarse: true },
  ]);

  assert.deepEqual([...fixable.keys()], ['frontend/src/a.ts']);
  assert.deepEqual(refused, ['frontend/src/big.html']);
});

test('a file with any coarse hunk is left alone entirely', () => {
  const { fixable, refused } = partitionFixable([
    { path: 'frontend/src/big.html', line: 1, endLine: 2, current: ['a'], expected: ['b'] },
    { path: 'frontend/src/big.html', line: 9, endLine: 900, current: [], expected: [], coarse: true },
  ]);

  assert.equal(fixable.size, 0);
  assert.deepEqual(refused, ['frontend/src/big.html']);
});

test('the report keeps a large hunk readable', () => {
  const expected = Array.from({ length: 40 }, (_, index) => `  line${index},`);
  const text = report([{ path: PATH, line: 1, endLine: 1, current: ['call(a);'], expected }]);

  assert.match(text, /34 more/);
  assert.ok(text.split('\n').length < 20);
});
