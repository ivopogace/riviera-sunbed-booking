/**
 * Detector coverage for `check-review-range.mjs` (issue #942).
 *
 * Only the pure detectors live here. The guard's CLI — the git front-end and the `main` around it,
 * which is where every false clean these guards have ever had actually lived — is spawned against a
 * throwaway repository in `guard-cli.test.mjs`, per the split that file's header states. Importing
 * the module here is safe precisely because nothing below reaches `git()`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compare, parseNumstat } from './check-review-range.mjs';

test('parseNumstat totals the text files and counts binaries without line totals', () => {
  const raw = ['3\t1\ta.ts', '10\t0\tb.md', '-\t-\tlogo.png'].join('\n');
  assert.deepEqual(parseNumstat(raw), { files: 3, additions: 13, deletions: 1, binary: 1 });
});

test('compare reports every disagreeing dimension, not just the first', () => {
  const local = { files: 10, additions: 200, deletions: 5, binary: 0 };
  const mismatches = compare(local, { files: 3, additions: 40, deletions: 5 });
  assert.equal(mismatches.length, 2);
  assert.match(mismatches.join('\n'), /files: local 10, PR 3/);
  assert.match(mismatches.join('\n'), /additions: local 200, PR 40/);
});

test('compare is silent when every dimension agrees', () => {
  const local = { files: 3, additions: 40, deletions: 12, binary: 0 };
  assert.deepEqual(compare(local, { files: 3, additions: 40, deletions: 12 }), []);
});
