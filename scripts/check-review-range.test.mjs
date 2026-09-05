/**
 * Detector and CLI coverage for `check-review-range.mjs` (issue #942).
 *
 * The detector half is cheap. The cases that earn the guard are the spawned-CLI ones below, because
 * the defect it exists to catch lives entirely in the git front-end: a remote-tracking ref nobody
 * refetched, and a shallow clone. Both are silent — neither produces an error, a warning, or an
 * implausible-looking result — so every case here asserts a **non-zero exit**, not a message.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { compare, parseNumstat } from './check-review-range.mjs';
import { withRepo } from './guard-cli-harness.mjs';

const GUARD = 'check-review-range.mjs';

/**
 * The #939 shape, built once: `main` gains a seven-file commit, the PR branches off that tip and
 * adds three files of its own. `origin/main` is left wherever the caller points it.
 *
 * @returns {{ staleBase: string, realBase: string }} the two candidate bases — the stale
 *   remote-tracking target and the PR's actual base
 */
function pullRequestOfThreeFiles(repo) {
  repo.write('seed.txt', 'seed\n');
  const staleBase = repo.commit('seed (#931)');

  for (let i = 1; i <= 7; i++) repo.write(`merged-${i}.txt`, `merged ${i}\n`);
  const realBase = repo.commit('a seven-file slice (#934)');

  repo.git(['checkout', '--quiet', '-b', 'feature']);
  for (let i = 1; i <= 3; i++) repo.write(`under-review-${i}.txt`, `under review ${i}\n`);
  repo.commit('the three files actually under review (#939)');

  return { staleBase, realBase };
}

/** Points `refs/remotes/origin/main` at `sha`, which is all a fetch does to the ref the gate reads. */
function setRemoteTrackingRef(repo, sha) {
  repo.git(['update-ref', 'refs/remotes/origin/main', sha]);
}

const scopeArgs = (files, additions, deletions) => [
  '--base-ref', 'main',
  '--files', String(files),
  '--additions', String(additions),
  '--deletions', String(deletions),
];

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

test('resolves the base from the fetched base branch, not from a stale ref', () => {
  withRepo((repo) => {
    const { realBase } = pullRequestOfThreeFiles(repo);
    setRemoteTrackingRef(repo, realBase);

    const result = repo.run(GUARD, scopeArgs(3, 3, 0));

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(realBase), 'the resolved base SHA must be printed');
  });
});

test('a file-count mismatch exits 1 and names both sides', () => {
  withRepo((repo) => {
    const { realBase } = pullRequestOfThreeFiles(repo);
    setRemoteTrackingRef(repo, realBase);

    const result = repo.run(GUARD, scopeArgs(2, 3, 0));

    assert.equal(result.status, 1);
    assert.match(result.stderr, /files: local 3, PR 2/);
  });
});

test('reproduces #939: a stale origin/main is caught by the count check', () => {
  withRepo((repo) => {
    const { staleBase, realBase } = pullRequestOfThreeFiles(repo);
    setRemoteTrackingRef(repo, staleBase);

    const stale = repo.run(GUARD, scopeArgs(3, 3, 0));

    assert.equal(stale.status, 1, 'ten local files against three on the PR must abort');
    assert.match(stale.stderr, /files: local 10, PR 3/);

    // What the missing fetch would have done: the same invocation must now pass, unaided.
    setRemoteTrackingRef(repo, realBase);
    assert.equal(repo.run(GUARD, scopeArgs(3, 3, 0)).status, 0);
  });
});

test('the shallow precondition refuses before resolving, and names the unshallow remedy', () => {
  withRepo((repo) => {
    const { realBase } = pullRequestOfThreeFiles(repo);
    setRemoteTrackingRef(repo, realBase);
    writeFileSync(join(repo.root, '.git', 'shallow'), `${realBase}\n`, 'utf8');

    // Counts that would otherwise pass: the refusal must not depend on the scope disagreeing.
    const result = repo.run(GUARD, scopeArgs(3, 3, 0));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /shallow/i);
    assert.match(result.stderr, /--unshallow/);
  });
});

test('an unknown base ref refuses rather than falling back to something diffable', () => {
  withRepo((repo) => {
    pullRequestOfThreeFiles(repo);

    const result = repo.run(GUARD, ['--base-ref', 'main', '--files', '3', '--additions', '3', '--deletions', '0']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /origin\/main/);
  });
});

test('missing PR counts refuse: an unverifiable range is not a verified one', () => {
  withRepo((repo) => {
    const { realBase } = pullRequestOfThreeFiles(repo);
    setRemoteTrackingRef(repo, realBase);

    const result = repo.run(GUARD, ['--base-ref', 'main']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--files/);
  });
});
