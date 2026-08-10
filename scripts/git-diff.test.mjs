import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changedPaths, parseAddedLines } from './git-diff.mjs';

test('maps each hunk to the line numbers it adds', () => {
  const diff = [
    'diff --git a/platform/src/main/java/ai/riviera/platform/SecurityConfig.java b/platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
    'index f44244c..eaa5661 100644',
    '--- a/platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
    '+++ b/platform/src/main/java/ai/riviera/platform/SecurityConfig.java',
    '@@ -419,2 +419,3 @@ class SecurityConfig {',
    '-\t\t// Venue commission rates (A7 #348) — ADMIN only; rationale on the constants.',
    '+\t\t// Venue commission rates (A7 #348) — ADMIN only; the platform sets the commercial',
    '+\t\t// term, not the venue (rationale on the constants).',
    '+\t\t.requestMatchers(HttpMethod.GET, ADMIN_VENUE_COMMISSIONS_PATH).hasRole(ADMIN_ROLE)',
    'diff --git a/frontend/src/styles.scss b/frontend/src/styles.scss',
    '--- a/frontend/src/styles.scss',
    '+++ b/frontend/src/styles.scss',
    '@@ -55,0 +56,1 @@',
    '+  --riv-chip-glass: rgba(255, 255, 255, 0.85);',
  ].join('\n');

  const added = parseAddedLines(diff);

  assert.deepEqual(
    [...added.get('platform/src/main/java/ai/riviera/platform/SecurityConfig.java')],
    [419, 420, 421],
  );
  assert.deepEqual([...added.get('frontend/src/styles.scss')], [56]);
});

test('skips a deleted file and keeps a renamed one', () => {
  const diff = [
    'diff --git a/frontend/src/app/venue-admin/venue-admin.ts b/frontend/src/app/venue-admin/venue-admin.ts',
    '--- a/frontend/src/app/venue-admin/venue-admin.ts',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-const a = 1;',
    '-const b = 2;',
    'diff --git a/scripts/old-name.mjs b/scripts/new-name.mjs',
    '--- a/scripts/old-name.mjs',
    '+++ b/scripts/new-name.mjs',
    '@@ -3,0 +4,1 @@',
    '+// a fresh one-liner',
  ].join('\n');

  const added = parseAddedLines(diff);

  assert.equal(added.has('frontend/src/app/venue-admin/venue-admin.ts'), false);
  assert.deepEqual([...added.get('scripts/new-name.mjs')], [4]);
});

test('changedPaths splits git -z output and drops the trailing empty field', () => {
  assert.deepEqual(changedPaths('a.ts\0docs/plans/p.md\0'), ['a.ts', 'docs/plans/p.md']);
  assert.deepEqual(changedPaths(''), []);
  assert.deepEqual(changedPaths('src/logo-\u{1F600}.png\0'), ['src/logo-\u{1F600}.png']);
});
