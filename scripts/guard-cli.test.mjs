/**
 * End-to-end coverage for the `scripts/check-*.mjs` guards' **CLIs** (issue #619).
 *
 * Every case builds a throwaway repository, writes fixtures, and spawns a guard — asserting on its
 * exit code and streams rather than on an exported detector. The sibling `*.test.mjs` suites cover
 * the detectors; this one covers the git front-end and the `main` around it, which is where all five
 * false cleans PR #618 fixed actually lived.
 *
 * Each regression case names, in its own doc comment, the edit that makes it fail — the mutation
 * proof recorded in `docs/plans/guard-cli-coverage.md`. A case never observed failing is decoration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { hookPayload, withRepo } from './guard-cli-harness.mjs';

const INLINE = 'check-inline-comments.mjs';
const PLAN = 'check-plan-file-structure.mjs';
const FOCUS = 'check-focus-posture.mjs';
const COMMENT_ONLY = 'check-comment-only.mjs';

const TS = 'frontend/src/app/venue/pricing-tab.ts';
const HTML = 'frontend/src/app/venue/pricing-tab.html';

/** A two-line block comment sitting after code — the RV-STYLE-1 shape, in TypeScript. */
const TWO_LINE = ['const rate = 1; /* the commission, in basis points —', '   set per venue */'];

const lines = (...rows) => `${rows.join('\n')}\n`;

/** Commits a one-line file, then leaves a two-line inline comment added on top of it. */
function violatingDiff(repo, path = TS) {
  repo.write(path, lines('const base = 0;'));
  const before = repo.commit('base');
  repo.write(path, lines('const base = 0;', ...TWO_LINE));
  return before;
}

test('check-inline-comments --diff fails on a two-line comment the diff added', () => {
  withRepo((repo) => {
    const before = violatingDiff(repo);
    repo.commit('add the comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:2-3/);
    assert.match(result.stderr, /RV-STYLE-1/);
    assert.equal(result.stdout, '');
  });
});

test('check-inline-comments --diff is silent on a diff that adds none', () => {
  withRepo((repo) => {
    repo.write(TS, lines('const base = 0;'));
    const before = repo.commit('base');
    repo.write(TS, lines('const base = 0;', 'const next = 1; // one line, so allowed'));
    repo.commit('add a compliant comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  });
});

/**
 * False clean #1. `--files` converts its arguments to repo-relative paths and hands them to git as
 * pathspecs, which resolve against the **caller's** cwd — and `npm run format:check` ran from
 * `frontend/`, where they matched nothing and the guard exited 0.
 *
 * <p>Mutation: drop the `cwd: repoRoot()` from `git-diff.mjs`'s `run`, or the `resolve(cwd, …)`
 * from `toRepoRelative`. Either makes this case exit 0.
 */
test('check-inline-comments --files resolves its arguments from the repo root, not the cwd', () => {
  withRepo((repo) => {
    violatingDiff(repo);

    const result = repo.run(INLINE, ['--files', '../frontend/src/app/venue/pricing-tab.ts'], {
      cwd: 'frontend',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:2-3/);
  });
});

/**
 * False clean #2. `diff.relative=true` in a contributor's config strips the leading directory from
 * every path, so a guard keyed on repo-relative paths recognises none of them.
 *
 * <p>Two independent mechanisms hold this today — git always runs from `repoRoot()`, and every
 * invocation pins `--no-relative`. The case pins the **behaviour**, so removing both is what turns
 * it red; that is the property worth guarding either way.
 */
test('check-inline-comments: a contributor diff.relative cannot make the guard report clean', () => {
  withRepo((repo) => {
    const before = violatingDiff(repo);
    repo.commit('add the comment');
    repo.config('diff.relative', 'true');

    const result = repo.run(INLINE, ['--diff', before], { cwd: 'frontend' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /frontend\/src\/app\/venue\/pricing-tab\.ts:2-3/);
  });
});

/**
 * False clean #3. `diff.mnemonicPrefix` re-spells the `b/` prefix as `w/`, `i/` or `c/`, so
 * stripping `^b/` leaves a path that reads nothing from disk; `diff.noprefix` drops it entirely.
 *
 * <p>Mutation: drop `PIN` from `git-diff.mjs`. The `mnemonicPrefix` case then exits 0.
 */
for (const key of ['diff.mnemonicPrefix', 'diff.noprefix']) {
  test(`check-inline-comments: ${key} cannot make the guard report clean`, () => {
    withRepo((repo) => {
      const before = violatingDiff(repo);
      repo.commit('add the comment');
      repo.config(key, 'true');

      const result = repo.run(INLINE, ['--diff', before]);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /pricing-tab\.ts:2-3/);
    });
  });
}

const ACCENTED = 'frontend/src/app/venue/café-tab.ts';

/**
 * False clean #4. Without `core.quotepath=false` git C-quotes any path holding a non-ASCII byte
 * (`"b/frontend/src/app/venue/caf\303\251-tab.ts"`), which strips to nothing recognisable and reads
 * nothing from disk.
 *
 * <p>Mutation: drop `core.quotepath=false` from `PIN`. This case then exits 0.
 */
test('check-inline-comments: a non-ASCII path is still read by the hunk front-end', () => {
  withRepo((repo) => {
    const before = violatingDiff(repo, ACCENTED);
    repo.commit('add the comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /café-tab\.ts:2-3/);
    assert.doesNotMatch(result.stderr, /\\303/);
  });
});

/**
 * False clean #5. An added line whose content begins with `++ ` is emitted as `+++ …`, which by
 * prefix alone is indistinguishable from a file header — so every added line after it was
 * attributed to a file that does not exist, and the real file's lines went unchecked.
 *
 * <p>Mutation: drop the `next === 0 &&` guard from `parseAddedLines`. This case then exits 0,
 * because the comment on lines 4-5 is credited to `ghost.html`.
 */
test('check-inline-comments: an added "++ " line does not re-target the lines after it', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<pre>', '</pre>'));
    const before = repo.commit('base');
    repo.write(
      HTML,
      lines(
        '<pre>',
        '++ b/frontend/src/app/venue/ghost.html',
        '</pre>',
        '<!-- the commission, in basis points —',
        '     set per venue -->',
      ),
    );
    repo.commit('quote a diff, then comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:4-5/);
    assert.doesNotMatch(result.stderr, /ghost\.html/);
  });
});

/**
 * The defect this harness found on its first day (#619). A component whose inline template opens on
 * a trailing backtick — 44 files under `frontend/src/app` — inverted the scanner's template state,
 * so everything after the template read as string content and no comment in it was ever reported.
 *
 * <p>Mutation: restore `line[c - 1] !== '`'` as the sole open condition in `scan`. This case then
 * exits 0, which is what the whole tree's gate looked like before.
 */
test('check-inline-comments: an inline Angular template does not hide a later comment', () => {
  withRepo((repo) => {
    const component = (...tail) =>
      lines(
        '@Component({',
        '  selector: \'app-pricing-tab\',',
        '  template: `',
        '    <p>Pricing</p>',
        '  `,',
        '})',
        'export class PricingTab {',
        ...tail,
        '}',
      );
    repo.write(TS, component());
    const before = repo.commit('base');
    repo.write(TS, component(...TWO_LINE.map((row) => `  ${row}`)));
    repo.commit('add the comment below the template');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:8-9/);
  });
});

/**
 * The diff base is a **commit**, not a `base...HEAD` range, so the new side is the working tree —
 * which is the side the guards read their file content from. With a range the two drift apart the
 * moment anything is uncommitted, and line numbers from one get applied to the other.
 */
test('check-inline-comments --diff judges the working tree, not the last commit', () => {
  withRepo((repo) => {
    const before = violatingDiff(repo);

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:2-3/);
  });
});

/** `mergeBase` is what keeps a moved base from handing this diff everyone else's merged lines. */
test('check-inline-comments --diff reports only what this branch added, not what the base gained', () => {
  withRepo((repo) => {
    repo.write(TS, lines('const base = 0;'));
    const forked = repo.commit('base');
    repo.git(['checkout', '--quiet', '-b', 'feature']);
    repo.write(TS, lines('const base = 0;', 'const mine = 1; // one line, so allowed'));
    repo.commit('my compliant change');

    repo.git(['checkout', '--quiet', 'main']);
    repo.write('frontend/src/app/venue/theirs.ts', lines('const theirs = 0;', ...TWO_LINE));
    repo.commit('someone else, merged meanwhile');
    repo.git(['checkout', '--quiet', 'feature']);

    const result = repo.run(INLINE, ['--diff', 'main']);

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /theirs\.ts/);
    assert.notEqual(forked, repo.git(['rev-parse', 'main']).trim());
  });
});

test('check-inline-comments --files is scoped to what the working tree adds against HEAD', () => {
  withRepo((repo) => {
    violatingDiff(repo);
    repo.commit('commit the comment too');

    const result = repo.run(INLINE, ['--files', TS]);

    assert.equal(result.status, 0, result.stderr);
  });
});

/**
 * A file git has never seen has no diff against `HEAD`, so the diff-scoped path reported it clean —
 * and a brand-new file is the commonest way a violation enters the tree, on the very `Write` the
 * hook fires for. `check-focus-posture` closed this in #618; this guard never got the same
 * treatment, so its two authoring-time modes were silent exactly when they were most needed.
 *
 * <p>Untracked files are judged **whole**; tracked ones stay diff-scoped, which is the opposite of
 * `check-focus-posture`'s `--files`. Deliberate: ~460 pre-existing multi-line comments stand in the
 * tree by design, so judging a committed file whole would bury the author in other people's lines —
 * the day-one red #529 exists to avoid. The case above pins that half.
 */
test('check-inline-comments --files judges a file git has never seen', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    repo.commit('base');
    repo.write(TS, lines('const base = 0;', ...TWO_LINE));

    const result = repo.run(INLINE, ['--files', TS]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:2-3/);
  });
});

test('check-inline-comments --hook judges a file git has never seen', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    repo.commit('base');
    repo.write(TS, lines('const base = 0;', ...TWO_LINE));

    const result = repo.run(INLINE, ['--hook'], { stdin: hookPayload(TS) });

    assert.equal(result.status, 0);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /pricing-tab\.ts:2-3/);
  });
});

test('check-inline-comments --files reports a tracked and an untracked path in one call', () => {
  withRepo((repo) => {
    const tracked = violatingDiff(repo);
    repo.write(HTML, lines('<p>Pricing</p>', '<!-- the commission, in basis points —', '     set per venue -->'));

    const result = repo.run(INLINE, ['--files', TS, HTML]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:2-3/);
    assert.match(result.stderr, /pricing-tab\.html:2-3/);
    assert.notEqual(tracked, '');
  });
});

test('check-inline-comments --hook answers a PostToolUse payload with advisory JSON', () => {
  withRepo((repo) => {
    violatingDiff(repo);

    const result = repo.run(INLINE, ['--hook'], { stdin: hookPayload(TS) });

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(payload.hookSpecificOutput.additionalContext, /pricing-tab\.ts:2-3/);
  });
});

test('check-inline-comments --hook stays silent about a file it does not check', () => {
  withRepo((repo) => {
    repo.write('docs/plans/whatever.md', lines('<!-- two', '     lines -->'));
    repo.commit('base');

    const result = repo.run(INLINE, ['--hook'], { stdin: hookPayload('docs/plans/whatever.md') });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  });
});

test('each guard exits 2 with usage when the mode is unknown or missing', () => {
  withRepo((repo) => {
    repo.write(TS, lines('const base = 0;'));
    repo.commit('base');

    for (const [guard, usage] of [
      [INLINE, /--diff <base> \| --files/],
      [PLAN, /--diff \[<base>\]/],
      [FOCUS, /--diff <base> \| --files/],
    ]) {
      for (const argv of [[], ['--nonsense']]) {
        const result = repo.run(guard, argv);
        assert.equal(result.status, 2, `${guard} ${argv.join(' ')}: ${result.stderr}`);
        assert.match(result.stderr, usage);
      }
    }
  });
});

/** A base git cannot resolve must fail loudly. Silence would be indistinguishable from a pass. */
test('an unresolvable --diff base fails loudly rather than reporting clean', () => {
  withRepo((repo) => {
    violatingDiff(repo);
    repo.commit('add the comment');

    const result = repo.run(INLINE, ['--diff', 'origin/no-such-branch']);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no-such-branch/);
  });
});

const PLAN_DOC = 'docs/plans/some-slice.md';

const planDoc = (...listed) =>
  lines(
    '# Some slice',
    '',
    '## File structure',
    '',
    ...listed.map((path) => `- \`${path}\` — what it does`),
    '',
    '## Phase 0 — do the thing',
  );

test('check-plan-file-structure --diff fails on a changed path the plan doc omits', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    const before = repo.commit('base');
    repo.write(TS, lines('const base = 0;'));
    repo.write(PLAN_DOC, planDoc('frontend/src/app/venue/something-else.ts'));
    repo.commit('the slice');

    const result = repo.run(PLAN, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts {2}— not listed in the File structure section/);
  });
});

test('check-plan-file-structure --diff passes once the section lists the path', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    const before = repo.commit('base');
    repo.write(TS, lines('const base = 0;'));
    repo.write(PLAN_DOC, planDoc(TS));
    repo.commit('the slice');

    const result = repo.run(PLAN, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr);
  });
});

test('check-plan-file-structure --diff ignores a slice with no plan doc', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    const before = repo.commit('base');
    repo.write(TS, lines('const base = 0;'));
    repo.commit('a one-line fix, no plan doc');

    const result = repo.run(PLAN, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr);
  });
});

/**
 * The name-only front-end's half of false clean #4 (PR #538). Without `-z` the C-quoted literal
 * `"frontend/src/app/venue/caf\303\251-tab.ts"` is what the guard reports and what the author would
 * have to paste into the plan doc, which never matches — the guard becomes unsatisfiable.
 *
 * <p>Mutation: drop `-z` from `nameOnlyArgs` and the reported path gains its quoting and escapes.
 */
test('check-plan-file-structure: a non-ASCII path is reported raw by the name-only front-end', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    const before = repo.commit('base');
    repo.write(ACCENTED, lines('const base = 0;'));
    repo.write(PLAN_DOC, planDoc('frontend/src/app/venue/something-else.ts'));
    repo.commit('the slice');

    const result = repo.run(PLAN, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /frontend\/src\/app\/venue\/café-tab\.ts/);
    assert.doesNotMatch(result.stderr, /\\303/);
  });
});

const BUSY_BUTTON = '<button (click)="save()" [disabled]="saving()">Save</button>';

test('check-focus-posture --diff gates on a BUSY-1 binding the diff added', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BUSY_BUTTON));
    repo.commit('add the button');

    const result = repo.run(FOCUS, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[BUSY-1\]/);
  });
});

test('check-focus-posture --diff is silent on a diff with no posture violation', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', '<button (click)="save()" [appBusy]="saving()">Save</button>'));
    repo.commit('add the button');

    const result = repo.run(FOCUS, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(result.stdout, '');
  });
});

/**
 * FOCUS-1 asks whether a component *moves focus*, a runtime property approximated over source, so
 * it reports on stdout and returns 0 — a build is never red because a heuristic guessed wrong. The
 * split verdict is the guard's whole posture, and it lives in `settle`, which nothing else drives.
 */
test('check-focus-posture --diff only advises on a FOCUS-1 surface', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(
      HTML,
      lines('<p>Pricing</p>', '@if (confirmDelete()) {', '  <p>Delete this set?</p>', '}'),
    );
    repo.commit('add the confirm prompt');

    const result = repo.run(FOCUS, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /advisory, not gating/);
    assert.match(result.stdout, /pricing-tab\.html:2 {2}\[FOCUS-1\]/);
    assert.equal(result.stderr, '');
  });
});

/**
 * `--files` judges the named files **whole**, committed or not (#618/H-11): a by-hand check that
 * printed nothing whether or not the file was clean is indistinguishable from a pass. Its sibling
 * above pins the opposite contract for `check-inline-comments`, whose `--files` is diff-scoped.
 */
test('check-focus-posture --files judges a committed file whole', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>', BUSY_BUTTON));
    repo.commit('base');

    const result = repo.run(FOCUS, ['--files', HTML]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[BUSY-1\]/);
  });
});

test('check-focus-posture --files resolves its arguments from the repo root, not the cwd', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>', BUSY_BUTTON));
    repo.commit('base');

    const result = repo.run(FOCUS, ['--files', '../frontend/src/app/venue/pricing-tab.html'], {
      cwd: 'frontend',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[BUSY-1\]/);
  });
});

test('check-focus-posture --all reports over the standing tree without gating', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>', BUSY_BUTTON));
    repo.commit('base');

    const result = repo.run(FOCUS, ['--all']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BUSY-1: 1/);
    assert.match(result.stdout, /pricing-tab\.html:2 {2}\[BUSY-1\]/);
  });
});

test('check-focus-posture --hook answers a PostToolUse payload with advisory JSON', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BUSY_BUTTON));

    const result = repo.run(FOCUS, ['--hook'], { stdin: hookPayload(HTML) });

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(payload.hookSpecificOutput.additionalContext, /\[BUSY-1\]/);
  });
});

/**
 * An **untracked** file has no diff against `HEAD`, so the diff-scoped path reports it clean — and
 * a brand-new component is exactly how a violation enters the tree, on the `Write` the hook fires
 * for. `checkPaths` judges such a file whole instead.
 */
test('check-focus-posture --hook judges a file git has never seen', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BUSY_BUTTON));

    const result = repo.run(FOCUS, ['--hook'], { stdin: hookPayload(HTML) });

    assert.equal(result.status, 0);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /\[BUSY-1\]/);
  });
});

test('check-comment-only fails when a diff changes code as well as comments', () => {
  withRepo((repo) => {
    repo.write(TS, lines('// the rate', 'const rate = 1;'));
    const before = repo.commit('base');
    repo.write(TS, lines('// the commission rate', 'const rate = 2;'));
    repo.commit('trim the comment, and change a number');

    const result = repo.run(COMMENT_ONLY, [before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Not comment-only/);
    assert.match(result.stderr, /pricing-tab\.ts/);
  });
});

test('check-comment-only passes when only the comments moved, and counts what it skipped', () => {
  withRepo((repo) => {
    repo.write(TS, lines('// the rate', 'const rate = 1;'));
    repo.write('docs/plans/some-slice.md', lines('# before'));
    const before = repo.commit('base');
    repo.write(TS, lines('// the commission rate, in basis points', 'const rate = 1;'));
    repo.write('docs/plans/some-slice.md', lines('# after'));
    repo.commit('trim the comment');

    const result = repo.run(COMMENT_ONLY, [before]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Comment-only: 1 file\(s\) verified code-identical/);
    assert.match(result.stdout, /Skipped 1 file\(s\) with unsupported comment syntax/);
  });
});

/**
 * The guard ran `git` and read the new side against the **caller's cwd**, so from a subdirectory
 * every read threw, the `catch` around it `continue`d, and the file dropped out of the loop — while
 * the printed count still included it. It did not skip quietly or warn: it announced that it had
 * verified a file it never opened, in a tool whose whole job is to authorise *not* reading a diff.
 *
 * <p>The same defect class PR #618 removed from the other three guards, reachable for the same
 * reason it was reachable there — tooling in this repo gets run from `frontend/` (issue #641).
 *
 * <p>Mutation: give the module back its private `git()` and `readFileSync(path)`. The subdirectory
 * case then exits 0, reporting "1 file(s) verified code-identical".
 */
test('check-comment-only resolves paths from the repo root, not the caller cwd', () => {
  withRepo((repo) => {
    repo.write(TS, lines('// the rate', 'const rate = 1;'));
    const before = repo.commit('base');
    repo.write(TS, lines('// the commission rate', 'const rate = 999;'));
    repo.commit('claims to be a comment trim');

    for (const cwd of ['.', 'frontend']) {
      const result = repo.run(COMMENT_ONLY, [before], { cwd });

      assert.equal(result.status, 1, `from ${cwd}: ${result.stdout}`);
      assert.match(result.stderr, /Not comment-only/);
      assert.match(result.stderr, /pricing-tab\.ts/);
    }
  });
});

/**
 * "Could not read it" must never render as "verified code-identical". The count printed on success
 * was `changed - skipped`, which included every file the loop had bailed on, so an unverifiable file
 * was indistinguishable from a checked one.
 *
 * <p>Mutation: drop the `unreadable` bucket so an unreadable file `continue`s silently again, and
 * derive the printed count as `changed.length - skipped.length` instead of tallying comparisons.
 * This case then exits 0.
 */
test('check-comment-only fails loudly on a file it cannot read rather than counting it', () => {
  withRepo((repo) => {
    repo.write(TS, lines('// the rate', 'const rate = 1;'));
    const before = repo.commit('base');
    repo.write(TS, lines('// the commission rate', 'const rate = 1;'));
    repo.commit('trim the comment');
    repo.git(['rm', '--quiet', '--cached', TS]);
    rmSync(join(repo.root, TS));

    const result = repo.run(COMMENT_ONLY, [before]);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /could not be read/i);
    assert.doesNotMatch(result.stdout, /verified code-identical/);
  });
});
