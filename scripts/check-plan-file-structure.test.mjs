import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findOmissions } from './check-plan-file-structure.mjs';

const SECTION = `# A plan

## File structure

- \`src/a.ts\` — the thing
- \`src/b.ts\` — the other thing

## Phase 0 — something

- \`src/never-listed-here.ts\` — outside the section, so not a listing
`;

const doc = (text, path = 'docs/plans/p.md') => ({ path, text });
const paths = (omissions) => omissions.map((o) => o.path);

test('reports exactly the paths the section omits', () => {
  const omissions = findOmissions({
    docs: [doc(SECTION)],
    changed: ['docs/plans/p.md', 'src/a.ts', 'src/b.ts', 'src/c.ts'],
  });
  assert.deepEqual(paths(omissions), ['src/c.ts']);
});

test('a complete section passes', () => {
  const omissions = findOmissions({
    docs: [doc(SECTION)],
    changed: ['docs/plans/p.md', 'src/a.ts', 'src/b.ts'],
  });
  assert.deepEqual(omissions, []);
});

test('a slice with no plan doc passes cleanly', () => {
  const omissions = findOmissions({ docs: [], changed: ['src/a.ts', 'README.md'] });
  assert.deepEqual(omissions, []);
});

test('only the File structure section counts as a listing', () => {
  const omissions = findOmissions({
    docs: [doc(SECTION)],
    changed: ['src/a.ts', 'src/b.ts', 'src/never-listed-here.ts'],
  });
  assert.deepEqual(paths(omissions), ['src/never-listed-here.ts']);
});
