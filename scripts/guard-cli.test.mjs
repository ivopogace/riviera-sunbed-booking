/**
 * End-to-end coverage for the `scripts/check-*.mjs` guards' **CLIs** (issue #619).
 *
 * Every case builds a throwaway repository, writes fixtures, and spawns a guard — asserting on its
 * exit code and streams rather than on an exported detector. The sibling `*.test.mjs` suites cover
 * the detectors; this one covers the git front-end and the `main` around it, which is where all five
 * false cleans PR #618 fixed actually lived.
 *
 * Each regression case names, in its own doc comment, the edit that makes it fail — its mutation
 * proof. A case never observed failing is decoration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { hookPayload, withRepo } from './guard-cli-harness.mjs';

const INLINE = 'check-inline-comments.mjs';
const FOCUS = 'check-focus-posture.mjs';
const COMMENT_ONLY = 'check-comment-only.mjs';
const TOUCH = 'check-touch-target.mjs';
const CLOUD_PIN = 'check-cloud-node-pin.mjs';

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
 * The defect this harness found on its first day. A component whose inline template opens on
 * a trailing backtick — 44 files under `frontend/src/app` — inverted the scanner's template state,
 * so everything after the template read as string content and no comment in it was ever reported.
 *
 * <p>Mutation: have `scan` clear `inTemplate` whenever `skipTemplate` reaches the end of a line, as
 * a close. This case then exits 0, which is what the whole tree's gate looked like before.
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
 * The scanner read a `template:` literal as opaque string content, so the HTML comments an Angular
 * inline template carries — where this repo writes most of its template comments — were never
 * judged at all: a two-line one with an issue number in it went through `--files` clean.
 *
 * <p>Mutation: make `inline-template.mjs`'s `OPENER` never match. This case then exits 0.
 */
test('check-inline-comments --files judges an HTML comment inside an inline template', () => {
  withRepo((repo) => {
    repo.write(TS, lines(
      '@Component({',
      '  template: `',
      '    <!-- A two-line HTML comment inside an inline template,',
      '         which no longer fits on one. -->',
      '    <p>Pricing</p>',
      '  `,',
      '})',
      'export class PricingTab {}',
    ));

    const result = repo.run(INLINE, ['--files', TS]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.ts:3-4  multiline/);
    assert.match(result.stdout, /pricing-tab\.ts:4-4  history/);
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

/**
 * The merge base is what keeps a moved base from handing this diff everyone else's merged lines.
 *
 * The base moves on the **remote**, which is where it moves in life — `main` gains a commit while
 * this branch is open. Since #952 that is also the only spelling a guard accepts, and the case is
 * the stronger for it: pointing a local branch by hand never modelled the fetch that has to happen.
 */
test('check-inline-comments --diff reports only what this branch added, not what the base gained', () => {
  withRepo((repo) => {
    repo.write(TS, lines('const base = 0;'));
    const forked = repo.commit('base');
    repo.git(['checkout', '--quiet', '-b', 'feature']);
    repo.write(TS, lines('const base = 0;', 'const mine = 1; // one line, so allowed'));
    repo.commit('my compliant change');

    repo.git(['checkout', '--quiet', 'main']);
    repo.write('frontend/src/app/venue/theirs.ts', lines('const theirs = 0;', ...TWO_LINE));
    const moved = repo.commit('someone else, merged meanwhile');
    repo.git(['checkout', '--quiet', 'feature']);
    repo.publish('main', moved);

    const result = repo.run(INLINE, ['--diff', 'origin/main']);

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /theirs\.ts/);
    assert.notEqual(forked, moved);
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

/** A TSDoc block whose third line cites a PR, on a line the diff will not touch. */
const TSDOC_WITH_ISSUE = [
  '/**',
  ' * Splices the rate write response back into the list this component holds.',
  ' * The PUT answers the same object shape as a list element (PR #521).',
  ' */',
  'export function apply() {}',
];

test('check-inline-comments --diff lets an issue number in a touched doc comment through', () => {
  withRepo((repo) => {
    repo.write(TS, lines(...TSDOC_WITH_ISSUE));
    const before = repo.commit('base');
    const touched = [...TSDOC_WITH_ISSUE];
    touched[1] = ' * Splices the rate write response back into the list.';
    repo.write(TS, lines(...touched));
    repo.commit('reword one line of the doc comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  });
});

test('check-inline-comments --diff only advises on a history phrase', () => {
  withRepo((repo) => {
    repo.write(TS, lines('const base = 0;'));
    const before = repo.commit('base');
    repo.write(TS, lines('const base = 0;', '/** The list this component holds; it no longer re-reads. */', 'export const x = 1;'));
    repo.commit('add a narrating doc comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /advisory/);
    assert.match(result.stdout, /pricing-tab\.ts:2-2 {2}history/);
  });
});

test('check-inline-comments --hook reports a history tell with the keep/drop test', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    repo.commit('base');
    repo.write(TS, lines('/**', ' * Splices the rate write response back into the list.', ' * It no longer re-reads the list.', ' */', 'export function apply() {}'));

    const result = repo.run(INLINE, ['--hook'], { stdin: hookPayload(TS) });

    assert.equal(result.status, 0);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /pricing-tab\.ts:3-3 {2}history/);
    assert.match(context, /fresh session/);
  });
});

test('check-inline-comments --diff only advises on a two-line comment in a spec', () => {
  withRepo((repo) => {
    const before = violatingDiff(repo, 'frontend/src/app/venue/pricing-tab.spec.ts');
    repo.commit('add the comment');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pricing-tab\.spec\.ts:2-3 {2}multiline-test/);
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
      [FOCUS, /--diff <base> \| --files/],
      [TOUCH, /--diff <base> \| --files/],
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

/** A control declaring neither the directive nor an exemption — the TT-1 shape. */
const BARE_BUTTON = '<button type="button" (click)="onSave()">Save</button>';

test('check-touch-target --diff gates on an undeclared control the diff added', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));
    repo.commit('add the control');

    const result = repo.run(TOUCH, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[TT-1\]/);
    assert.equal(result.stdout, '');
  });
});

test('check-touch-target --diff is silent once the control declares the floor', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(
      HTML,
      lines('<p>Pricing</p>', '<button type="button" appTouchTarget (click)="onSave()">Save</button>'),
    );
    repo.commit('declare the floor');

    const result = repo.run(TOUCH, ['--diff', before]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  });
});

test('check-touch-target --diff gates on an exemption that gives no reason', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', '<button type="button" data-touch-exempt>Save</button>'));
    repo.commit('exempt it without saying why');

    const result = repo.run(TOUCH, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[TT-2\]/);
  });
});

/** `--files` judges the named files whole, committed or not (#618/H-11) — see the sibling above. */
test('check-touch-target --files judges a committed file whole', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));
    repo.commit('base');

    const result = repo.run(TOUCH, ['--files', HTML]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[TT-1\]/);
  });
});

test('check-touch-target --files resolves its arguments from the repo root, not the cwd', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));
    repo.commit('base');

    const result = repo.run(TOUCH, ['--files', '../frontend/src/app/venue/pricing-tab.html'], {
      cwd: 'frontend',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[TT-1\]/);
  });
});

/** False clean #2: a contributor's own `diff.relative` re-spells every path git reports. */
test('check-touch-target: a contributor diff.relative cannot make the guard report clean', () => {
  withRepo((repo) => {
    repo.config('diff.relative', 'true');
    repo.write(HTML, lines('<p>Pricing</p>'));
    const before = repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));
    repo.commit('add the control');

    const result = repo.run(TOUCH, ['--diff', before], { cwd: 'frontend' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /pricing-tab\.html:2 {2}\[TT-1\]/);
  });
});

/** False clean #4: git C-quotes a non-ASCII path, so the hunk front-end must unquote it. */
test('check-touch-target: a non-ASCII path is still read by the hunk front-end', () => {
  const path = 'frontend/src/app/venue/çmimet-tab.html';
  withRepo((repo) => {
    repo.write(path, lines('<p>Çmimet</p>'));
    const before = repo.commit('base');
    repo.write(path, lines('<p>Çmimet</p>', BARE_BUTTON));
    repo.commit('add the control');

    const result = repo.run(TOUCH, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /tab\.html:2 {2}\[TT-1\]/);
  });
});

test('check-touch-target --all reports over the standing tree without gating', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));
    repo.commit('base');

    const result = repo.run(TOUCH, ['--all']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /TT-1: 1/);
    assert.match(result.stdout, /pricing-tab\.html:2 {2}\[TT-1\]/);
  });
});

test('check-touch-target --hook answers a PostToolUse payload with advisory JSON', () => {
  withRepo((repo) => {
    repo.write(HTML, lines('<p>Pricing</p>'));
    repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));

    const result = repo.run(TOUCH, ['--hook'], { stdin: hookPayload(HTML) });

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(payload.hookSpecificOutput.additionalContext, /\[TT-1\]/);
  });
});

/** A new component is exactly how an undeclared control enters the tree, and it has no diff. */
test('check-touch-target --hook judges a file git has never seen', () => {
  withRepo((repo) => {
    repo.write('README.md', lines('# Riviera'));
    repo.commit('base');
    repo.write(HTML, lines('<p>Pricing</p>', BARE_BUTTON));

    const result = repo.run(TOUCH, ['--hook'], { stdin: hookPayload(HTML) });

    assert.equal(result.status, 0);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /\[TT-1\]/);
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
 * The guard mixed three reference points: the file list from `merge-base(base,HEAD)...HEAD`, the
 * *before* side from the literal `base` **tip** via `git show`, and the *after* side from the working
 * tree. So once `base` moved, it compared this branch's working tree against commits the branch was
 * never based on, and blamed another branch's code on this one — the drift `resolveBase` exists to
 * prevent, and which the three sibling guards had already collapsed onto one commit (#618).
 *
 * <p>Mutation: take the file list from `${base}...HEAD` and the before side from `show(base, …)`
 * again. This case then exits 1, reporting the other branch's code change as this branch's.
 */
test('check-comment-only judges against the merge base, not a base that has moved', () => {
  withRepo((repo) => {
    repo.write(TS, lines('// the rate', 'const rate = 1;'));
    repo.commit('fork point');
    repo.git(['checkout', '--quiet', '-b', 'feature']);
    repo.write(TS, lines('// the commission rate', 'const rate = 1;'));
    repo.commit('trim a comment — this branch changes no code');

    repo.git(['checkout', '--quiet', 'main']);
    repo.write(TS, lines('// the rate', 'const rate = 999;'));
    const moved = repo.commit('someone else changes code, merged meanwhile');
    repo.git(['checkout', '--quiet', 'feature']);
    repo.publish('main', moved);

    const result = repo.run(COMMENT_ONLY, ['origin/main']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /verified code-identical/);
  });
});

/**
 * One reference point also means one *new* side. The file list used to come from committed history
 * while the content came from the working tree, so a code change that was only ever in the working
 * tree was never listed and never inspected — and the run still reported success.
 *
 * <p>Mutation: as above. Taking the list from `${base}...HEAD` drops the uncommitted file and this
 * case exits 0.
 */
test('check-comment-only inspects a code change that is only in the working tree', () => {
  withRepo((repo) => {
    repo.write(TS, lines('// the rate', 'const rate = 1;'));
    const before = repo.commit('base');
    repo.write(TS, lines('// the commission rate', 'const rate = 999;'));

    const result = repo.run(COMMENT_ONLY, [before]);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /Not comment-only/);
  });
});

/**
 * `strip` read a `template:` literal as opaque string content, so removing one `<!-- -->` line from
 * an inline Angular template left the stripped sides different and the by-hand verifier answered
 * "Not comment-only" on a diff whose every change was a comment.
 *
 * <p>Mutation: make `inline-template.mjs`'s `OPENER` never match. This case then exits 1.
 */
test('check-comment-only passes when only an HTML comment left an inline template', () => {
  withRepo((repo) => {
    const component = (...rows) =>
      lines('@Component({', '  template: `', ...rows, '    <p>Pricing</p>', '  `,', '})', 'export class PricingTab {}');
    repo.write(TS, component('    <!-- Above the @if on purpose: a live region must outlive its branch. -->'));
    const before = repo.commit('base');
    repo.write(TS, component());

    const result = repo.run(COMMENT_ONLY, [before]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Comment-only: 1 file\(s\) verified code-identical/);
  });
});

const CLOUD_DOC = 'docs/agents/cloud-environment.md';

/** Writes the two files the pin guard compares, plus a `frontend/` for the subdirectory case. */
function cloudPin(repo, pinned, recorded) {
  repo.write('.nvmrc', `${pinned}\n`);
  repo.write(CLOUD_DOC, lines(
    '<!-- cloud-setup-script:start -->',
    '```bash',
    `nvm install ${recorded}`,
    `NODE_BIN="$NVM_DIR/versions/node/v${recorded}/bin"`,
    '```',
    '<!-- cloud-setup-script:end -->',
  ));
  repo.write('frontend/package.json', lines('{}'));
  repo.commit('the cloud environment doc');
}

/**
 * The drift the guard exists for: `.nvmrc` bumped, the recorded setup script left behind. Run from
 * the repository root **and** from a subdirectory, which is where every other guard's false clean
 * has lived (#618/#641) and which this one avoids only by reading through `git-diff.mjs`.
 *
 * <p>Mutation: give the module a plain `readFileSync(path)` instead. The `frontend` case then reads
 * nothing, and a guard that cannot read the doc must not report a pass.
 */
test('check-cloud-node-pin fails on a doc the .nvmrc bump left behind, from any directory', () => {
  withRepo((repo) => {
    cloudPin(repo, '27.1.0', '26.0.0');

    for (const cwd of ['.', 'frontend']) {
      const result = repo.run(CLOUD_PIN, [], { cwd });

      assert.equal(result.status, 1, `from ${cwd}: ${result.stdout}`);
      assert.match(result.stderr, /records Node 26\.0\.0 but \.nvmrc pins 27\.1\.0/);
      assert.equal(result.stdout, '');
    }
  });
});

test('check-cloud-node-pin passes once the recorded script carries the pinned version', () => {
  withRepo((repo) => {
    cloudPin(repo, '26.0.0', '26.0.0');

    const result = repo.run(CLOUD_PIN, []);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /records Node 26\.0\.0 in 2 place\(s\)/);
  });
});

/** No doc means no reviewable copy of the field, which is the state #659 found — never a pass. */
test('check-cloud-node-pin fails closed when the doc is absent', () => {
  withRepo((repo) => {
    repo.write('.nvmrc', '26.0.0\n');
    repo.commit('base');

    const result = repo.run(CLOUD_PIN, []);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /cloud-environment\.md could not be read/);
  });
});

test('check-cloud-node-pin exits 2 with usage when given an argument', () => {
  withRepo((repo) => {
    cloudPin(repo, '26.0.0', '26.0.0');

    const result = repo.run(CLOUD_PIN, ['--diff', 'main']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /no arguments/);
  });
});

/**
 * Base resolution — issue #952.
 *
 * The base-resolving guards used to default to a **local** `origin/main` and diff against
 * whatever it happened to hold. In CI that cannot bite: the hygiene job checks out at
 * `fetch-depth: 0` and fetches the base branch before any guard runs. Locally it is the whole
 * exposure — a cloud session's clone is made once at container start and never refetched, so
 * `origin/main` is frozen at that moment and every range resolved from it silently widens onto
 * commits the branch never touched. `check-comment-only.mjs` is the sharpest case: neither a CI
 * gate nor a registered hook, so a by-hand run is its only invocation.
 *
 * **A case per guard, not one for the family.** The defect is in the shared resolver, but what
 * proves it fixed is each guard's own report, and they reach the base through argv shapes and
 * fixture shapes that have nothing in common — a positional base here, `--diff` there; a file list
 * for one rule, a modified file's code for another. A single case over `check-inline-comments`
 * would leave the others wired on faith. Hence the table: one row per guard, carrying the fixture
 * its rule needs, and a loop over it per case.
 *
 * `publish()` gives the repository a real `origin` on the filesystem, which is what lets a case
 * distinguish "fetched and corrected itself" from "read a ref someone pointed by hand" — the two
 * are indistinguishable from the tracking ref alone.
 */

const BUSY_HTML = 'frontend/src/app/venue/theirs.html';
const THEIRS_TS = 'frontend/src/app/venue/theirs.ts';

/**
 * One row per base-resolving guard.
 *
 * `theirs` is what `main` gains **after** this branch forks — a violation of that guard's own rule,
 * so a range resolved from a stale base reports it and a correctly-resolved one does not. `mine` is
 * this branch's own change, always clean. `outside` matches a path only a widened range can name;
 * `check-comment-only` has none, because its rule is about a modified file's code rather than a
 * file list, and there the exit status is what discriminates.
 */
const BASE_GUARDS = [
  {
    script: INLINE,
    argv: (ref) => ['--diff', ref],
    seed: (repo) => repo.write(TS, lines('const base = 0;')),
    theirs: (repo) => repo.write(THEIRS_TS, lines('const theirs = 0;', ...TWO_LINE)),
    mine: (repo) => repo.write(TS, lines('const base = 0;', 'const mine = 1; // one line, so allowed')),
    outside: /theirs\.ts/,
  },
  {
    script: FOCUS,
    argv: (ref) => ['--diff', ref],
    seed: (repo) => repo.write(HTML, lines('<p>Pricing</p>')),
    theirs: (repo) => repo.write(BUSY_HTML, lines(BUSY_BUTTON)),
    mine: (repo) =>
      repo.write(HTML, lines('<p>Pricing</p>', '<button (click)="save()" [appBusy]="saving()">Save</button>')),
    outside: /theirs\.html/,
  },
  {
    script: TOUCH,
    argv: (ref) => ['--diff', ref],
    seed: (repo) => repo.write(HTML, lines('<p>Pricing</p>')),
    theirs: (repo) => repo.write(BUSY_HTML, lines(BARE_BUTTON)),
    mine: (repo) =>
      repo.write(HTML, lines('<p>Pricing</p>', '<button type="button" appTouchTarget (click)="onSave()">Save</button>')),
    outside: /theirs\.html/,
  },
  {
    script: COMMENT_ONLY,
    argv: (ref) => [ref],
    seed: (repo) => repo.write(TS, lines('// the rate', 'const rate = 1;')),
    theirs: (repo) => repo.write(TS, lines('// the rate', 'const rate = 999;')),
    mine: (repo) => repo.write(TS, lines('// the commission rate', 'const rate = 999;')),
    outside: null,
  },
];

/**
 * Builds the #939 shape for one guard: `main` gains a violation after this branch forks, so the
 * two candidate bases give visibly different answers.
 *
 * @returns {{ staleBase: string, realBase: string }} the fork points before and after the violation
 */
function movedBase(repo, guard) {
  guard.seed(repo);
  const staleBase = repo.commit('seed');

  guard.theirs(repo);
  const realBase = repo.commit('someone else, merged meanwhile');

  repo.git(['checkout', '--quiet', '-b', 'feature']);
  guard.mine(repo);
  repo.commit('my own, compliant change');

  return { staleBase, realBase };
}

/** Points `refs/remotes/origin/main` at `sha` by hand — the stale ref a fetch has to correct. */
function trackStale(repo, sha) {
  repo.git(['update-ref', 'refs/remotes/origin/main', sha]);
}

/**
 * The whole point of the slice: the guard fetches the base branch itself, so a tracking ref left
 * behind by a container-start clone corrects itself rather than widening the range.
 *
 * <p>Mutation: drop the fetch from `resolveBase()`. Every row's range then starts at `staleBase`,
 * picks up the file `main` gained, and the guard reports another branch's violation as this one's.
 */
test('every base-resolving guard fetches a stale base and reports only this branch', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      const { staleBase, realBase } = movedBase(repo, guard);
      repo.publish('main', realBase);
      trackStale(repo, staleBase);

      const result = repo.run(guard.script, guard.argv('origin/main'));

      assert.equal(result.status, 0, `${guard.script}: ${result.stderr}`);
      if (guard.outside) assert.doesNotMatch(result.stderr, guard.outside, guard.script);
      assert.equal(repo.git(['rev-parse', 'origin/main']).trim(), realBase, `${guard.script} must fetch`);
    });
  }
});

/**
 * Fail-open is what #952 exists to remove: a guard that cannot fetch cannot know its base, and
 * "cannot know" must read as 2 (did not run), never as 0 (clean) or as a report.
 *
 * <p>Mutation: return the stale ref instead of an error when the fetch throws. Each row then
 * reports on a file outside the branch's diff — AC-2's exact wording.
 */
test('every base-resolving guard refuses a base it could not fetch', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      const { staleBase } = movedBase(repo, guard);
      repo.breakOrigin();
      trackStale(repo, staleBase);

      const result = repo.run(guard.script, guard.argv('origin/main'));

      assert.equal(result.status, 2, `${guard.script}: ${result.stderr}`);
      assert.match(result.stderr, /origin\/main/, guard.script);
      if (guard.outside) assert.doesNotMatch(result.stderr, guard.outside, guard.script);
    });
  }
});

/**
 * A fetch does not fix a shallow clone: `merge-base` still answers from the truncated graph, and it
 * answers *wrongly and silently* rather than throwing, which is why the warning the old
 * `mergeBase()` printed never covered this. The guards refuse here.
 *
 * <p>Mutation: move the shallow test below the fetch, or make it a warning. Each row then reports
 * on a base git cannot be trusted to have resolved.
 */
test('every base-resolving guard refuses a shallow clone before it resolves anything', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      const { realBase } = movedBase(repo, guard);
      repo.publish('main', realBase);
      repo.write('.git/shallow', `${realBase}\n`);

      const result = repo.run(guard.script, guard.argv('origin/main'));

      assert.equal(result.status, 2, `${guard.script}: ${result.stderr}`);
      assert.match(result.stderr, /shallow/i, guard.script);
      assert.match(result.stderr, /--unshallow/, guard.script);
    });
  }
});

/**
 * A bare local branch is a snapshot exactly as `origin/main` is — in a cloud session `main` is
 * whatever the clone captured, and nothing advances it. Accepting it would leave AC-1's hole open
 * under a different spelling, so it is refused with the two forms that can be trusted.
 *
 * <p>Mutation: fall through to `rev-parse` for any ref that resolves. Each row then exits 0 or 1
 * having diffed a ref no one fetched.
 */
test('a local branch is refused as the snapshot it is, naming both accepted forms', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      movedBase(repo, guard);

      const result = repo.run(guard.script, guard.argv('main'));

      assert.equal(result.status, 2, `${guard.script}: ${result.stderr}`);
      assert.match(result.stderr, /<remote>\/<branch>/, guard.script);
      assert.match(result.stderr, /SHA/, guard.script);
    });
  }
});

/**
 * The offline form, and the reason the refusal above is not a lock-out: a SHA names one commit and
 * cannot go stale, so it needs no remote at all.
 *
 * <p>Mutation: require a remote-tracking ref unconditionally. Every row then exits 2 and the guards
 * become unusable without network — including in this suite, which is why so many cases pass one.
 */
test('a SHA base resolves with no remote configured at all', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      const { realBase } = movedBase(repo, guard);

      const result = repo.run(guard.script, guard.argv(realBase));

      assert.equal(result.status, 0, `${guard.script}: ${result.stderr}`);
    });
  }
});

/**
 * PR #951's finding F-9, closed. The old `mergeBase()` caught a throwing `merge-base` and returned
 * the base unchanged — so two histories with no common ancestor yielded a range spanning all of
 * both, every file in it reading as this branch's addition.
 *
 * <p>Mutation: restore the `catch` that returns `base`. Each row then reports over an unrelated
 * history instead of refusing.
 */
test('unrelated histories are refused, not silently widened to the base tip', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      movedBase(repo, guard);
      repo.git(['checkout', '--quiet', '--orphan', 'unrelated']);
      repo.write('unrelated.txt', 'no shared ancestor\n');
      const alien = repo.commit('an unrelated root commit');
      repo.git(['checkout', '--quiet', 'feature']);

      const result = repo.run(guard.script, guard.argv(alien));

      assert.equal(result.status, 2, `${guard.script}: ${result.stderr}`);
      assert.match(result.stderr, /ancestor/i, guard.script);
    });
  }
});

/**
 * `git()` is `execFileSync`, which throws on a non-zero exit, and an escaping throw exits Node
 * with 1 — the code these guards' contract assigns to **violations found**, whose printed remedy
 * is to go and fix the code. A precondition that could not even be established has to read as 2,
 * the same as every other refusal `resolveBase` returns.
 *
 * <p>This is PR #951's finding F-6, which the guards inherited unfixed when they were pointed at
 * the shared resolver.
 *
 * <p>A bad `.git/config` is the portable way to make git refuse: *every* invocation then exits
 * 128, including the two calls that were unguarded — the shallow probe and the remote lookup —
 * and the `rev-parse --show-toplevel` behind `repoRoot()`, which runs before either.
 *
 * <p>Mutation: remove the try/catch around `resolveBase`'s body. Each row then exits 1 with a
 * stack trace on stderr instead of a sentence naming what failed.
 */
test('a git call that fails is reported as a precondition, not as a violation', () => {
  for (const guard of BASE_GUARDS) {
    withRepo((repo) => {
      const { realBase } = movedBase(repo, guard);
      repo.publish('main', realBase);
      repo.write('.git/config', 'this is not a valid config file\n');

      const result = repo.run(guard.script, guard.argv('origin/main'));

      assert.equal(result.status, 2, `${guard.script}: ${result.stderr}`);
      assert.doesNotMatch(result.stderr, /^\s+at .*\.mjs:\d+/m, `${guard.script} printed a stack`);
    });
  }
});

/**
 * The harness's own trap, found by this slice's review.
 *
 * `publish()` and `breakOrigin()` each wired `origin` with `git remote add`, which fails once the
 * remote exists — so a case combining them in either order died on the harness rather than on the
 * guard, and the failure would read as the guard's. No case combines them today; that is what makes
 * it a trap rather than a bug, and a fixture nobody can compose is worth less than one they can.
 *
 * <p>Mutation: restore either helper to a bare `remote add`. One of the two orders below then
 * throws `remote origin already exists` out of the harness.
 */
test('the harness can point origin at a real repository and at nowhere, in either order', () => {
  withRepo((repo) => {
    const { staleBase, realBase } = movedBase(repo, BASE_GUARDS[0]);

    repo.publish('main', realBase);
    repo.breakOrigin();
    trackStale(repo, staleBase);
    assert.equal(repo.run(INLINE, ['--diff', 'origin/main']).status, 2, 'broken after published');

    repo.publish('main', realBase);
    trackStale(repo, staleBase);
    const healed = repo.run(INLINE, ['--diff', 'origin/main']);

    assert.equal(healed.status, 0, `published after broken: ${healed.stderr}`);
    assert.equal(repo.git(['rev-parse', 'origin/main']).trim(), realBase);
  });
});

const DOC_BUDGET = 'check-doc-budget.mjs';
const BUDGETED_JAVA = 'platform/src/main/java/ai/riviera/platform/booking/Probe.java';

/** A class whose one method carries a doc comment of `count` text lines; the member budget is three. */
const probeClass = (count) =>
  lines(
    'class Probe {',
    '\t/**',
    ...Array.from({ length: count }, (_, k) => `\t * Line ${k + 1}.`),
    '\t */',
    '\tvoid run() {',
    '\t}',
    '}',
  );

/** Mutation proof: dropping `docbudget` from GATING turns this exit 0. */
test('check-inline-comments --diff gates a doc comment the diff wrote over budget', () => {
  withRepo((repo) => {
    repo.write(BUDGETED_JAVA, lines('class Probe {', '}'));
    const before = repo.commit('base');
    repo.write(BUDGETED_JAVA, probeClass(5));
    repo.commit('add an over-budget doc');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Probe\.java:2-8 {2}docbudget {2}member doc is 5 lines, budget 3: void run\(\) \{/);
    assert.match(result.stderr, /§6d/);
  });
});

/** Mutation proof: dropping `docbudget-touched` from GATING turns this exit 0. */
test('check-inline-comments --diff gates an old over-budget doc the diff edited', () => {
  withRepo((repo) => {
    repo.write(BUDGETED_JAVA, probeClass(5));
    const before = repo.commit('base');
    repo.write(BUDGETED_JAVA, probeClass(5).replace('Line 2.', 'Line two, reworded.'));
    repo.commit('reword one line');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Probe\.java:2-8 {2}docbudget-touched {2}member doc is 5 lines/);
    assert.match(result.stderr, /check-doc-budget\.mjs --update/);
    assert.equal(result.stdout, '');
  });
});

test('check-doc-budget ratchets: missing, created, grew, refused, stale, locked in', () => {
  withRepo((repo) => {
    repo.write(BUDGETED_JAVA, probeClass(6));
    repo.commit('base');

    const missing = repo.run(DOC_BUDGET, []);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /doc-budget-baseline\.json is missing/);

    const created = repo.run(DOC_BUDGET, ['--update']);
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /3 lines over budget/);
    assert.equal(repo.run(DOC_BUDGET, []).status, 0);
    assert.equal(repo.run(DOC_BUDGET, ['--update']).stdout, 'Baseline already matches the tree.\n');

    repo.write(BUDGETED_JAVA, probeClass(8));
    const grew = repo.run(DOC_BUDGET, ['--check']);
    assert.equal(grew.status, 1);
    assert.match(grew.stderr, /grew from 3 to 5:/);
    assert.match(grew.stderr, /platform\/booking: 3 → 5/);
    assert.equal(repo.run(DOC_BUDGET, ['--update']).status, 1, '--update must never raise the baseline');

    repo.write(BUDGETED_JAVA, probeClass(4));
    const stale = repo.run(DOC_BUDGET, []);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /stale/);

    const locked = repo.run(DOC_BUDGET, ['--update']);
    assert.equal(locked.status, 0);
    assert.match(locked.stdout, /Locked in: 3 → 1 lines over budget/);
    assert.equal(repo.run(DOC_BUDGET, []).status, 0);
  });
});

test('check-doc-budget --report lists the heaviest files; an unknown mode exits 2', () => {
  withRepo((repo) => {
    repo.write(BUDGETED_JAVA, probeClass(7));
    repo.commit('base');

    const report = repo.run(DOC_BUDGET, ['--report']);
    assert.equal(report.status, 0);
    assert.match(report.stdout, /over the §6d budget: 4/);
    assert.match(report.stdout, /4 {2}platform\/booking\n/);
    assert.match(report.stdout, /4 {2}platform\/src\/main\/java\/ai\/riviera\/platform\/booking\/Probe\.java/);

    const unknown = repo.run(DOC_BUDGET, ['--nonsense']);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /usage: check-doc-budget\.mjs/);
  });
});

/** Mutation proof: dropping `respbudget-touched` from GATING turns this exit 0. */
test('check-inline-comments --diff gates an old over-budget RESPONSIBILITIES.md block the diff edited', () => {
  withRepo((repo) => {
    const block = (edit) =>
      lines('## `booking`', '', `- **Rule.** ${edit}`, ...Array.from({ length: 9 }, (_, k) => `  Line ${k + 2}.`));
    repo.write('RESPONSIBILITIES.md', block('One.'));
    const before = repo.commit('base');
    repo.write('RESPONSIBILITIES.md', block('One, reworded.'));
    repo.commit('reword one line');

    const result = repo.run(INLINE, ['--diff', before]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /RESPONSIBILITIES\.md:3-12 {2}respbudget-touched {2}block is 10 lines, budget 8/);
    assert.match(result.stderr, /check-doc-budget\.mjs --update/);
  });
});

test('check-doc-budget ratchets RESPONSIBILITIES.md as its own area', () => {
  withRepo((repo) => {
    const doc = (count) =>
      lines('## `venue`', '', '- **Rule.** One.', ...Array.from({ length: count - 1 }, (_, k) => `  ${k}.`));
    repo.write('RESPONSIBILITIES.md', doc(11));
    repo.commit('base');
    assert.equal(repo.run(DOC_BUDGET, ['--update']).status, 0);

    repo.write('RESPONSIBILITIES.md', doc(12));
    const grew = repo.run(DOC_BUDGET, []);
    assert.equal(grew.status, 1);
    assert.match(grew.stderr, /RESPONSIBILITIES\.md: 3 → 4/);
  });
});
