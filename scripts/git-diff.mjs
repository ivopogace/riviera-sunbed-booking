/**
 * The git and unified-diff helpers the `scripts/check-*.mjs` guards share.
 *
 * Extracted at the third guard (#615), which is the trigger #533's own generalization audit set:
 * with two guards, ten lines of stable git glue did not justify a module that couples two
 * deliberately independent checks; with three, the duplication is the thing that drifts. Nothing
 * here knows what a guard checks — it answers "what did this diff touch, and where" and stops.
 *
 * Dependency-free on purpose: the `Repo hygiene (diff-scoped)` CI job runs the suites with no
 * install step, so a module in this directory may import nothing outside `node:`.
 *
 * **Every git call is made from the repository root with path output pinned.** Three ways a guard
 * can otherwise report a false clean, all found by PR #618's review and all fixed here rather than
 * three times over: a pathspec resolves against the *caller's* cwd (#615's since-retired wrapper
 * ran from `frontend/` and matched nothing), `diff.relative=true` in a contributor's config strips the
 * leading directory from every path (so a `frontend/` scope test rejects them all), and a path
 * holding a non-ASCII byte comes back C-quoted (`"b/src/caf\303\251.ts"`) and matches nothing at
 * all — the same defect PR #538 fixed for `changedPaths`, one function below, and which this module
 * inherited for the `+++` headers.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Pinned on every invocation, because each of these is a contributor-config setting that silently
 * re-spells the paths a guard keys on — and a guard that cannot recognise a path reports **clean**.
 * `core.quotepath` C-quotes any non-ASCII byte; `diff.mnemonicPrefix` swaps `a/`/`b/` for `w/`,
 * `i/`, `c/`; `diff.noprefix` drops the prefix entirely. All three found by PR #618's review.
 */
const PIN = [
  '-c',
  'core.quotepath=false',
  '-c',
  'diff.mnemonicPrefix=false',
  '-c',
  'diff.noprefix=false',
];

let root = null;

function run(args, cwd) {
  return execFileSync('git', [...PIN, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The repository root, resolved once from wherever the process happens to be. */
export function repoRoot() {
  if (root === null) root = run(['rev-parse', '--show-toplevel']).trim();
  return root;
}

/** Runs git **from the repository root** and returns its stdout. */
export function git(args) {
  return run(args, repoRoot());
}

/** The diff invocation the guards share: no context, no colour, no cwd-relative paths. */
export function diffArgs(...rest) {
  return ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-relative', ...rest];
}

/** The name-only form of the same invocation; `-z` so a non-ASCII path survives (PR #538). */
export function nameOnlyArgs(...rest) {
  return ['diff', '--name-only', '-z', '--no-color', '--no-ext-diff', '--no-relative', ...rest];
}

/**
 * The numstat form: per-file added/deleted line counts, for a caller totalling a range's size.
 *
 * A builder rather than the flags spelled inline at the call site, for the reason `untrackedArgs`
 * gives below — the flag-pinning case in `git-diff.test.mjs` reaches builders, and only builders,
 * so a set spelled in a guard is one no unit case can see a future edit remove.
 *
 * <p>`--find-renames` is the fourth setting of the class `PIN` exists for, and it is a flag rather
 * than a `-c` pair only because it belongs to this invocation alone: a contributor's
 * `diff.renames=false` splits one renamed file into an add plus a delete, so a caller comparing
 * this output against GitHub's counts — which always detect the rename — aborts over a difference
 * in git config rather than in the range.
 */
export function numstatArgs(...rest) {
  return [
    'diff',
    '--numstat',
    '--find-renames',
    '--no-color',
    '--no-ext-diff',
    '--no-relative',
    ...rest,
  ];
}

/**
 * Maps a unified diff to the 1-based line numbers each file gains. Files the diff deletes are
 * absent from the result: they have no new content to check.
 *
 * `+++` is honoured only **between** hunks, and every `diff --git` closes the file before it. An
 * added line whose content begins with `++ ` is emitted as `+++ …`, which is indistinguishable from
 * a header by prefix alone — a plan doc quoting a diff was enough to re-target every following added
 * line onto a file that does not exist, and to leave the real file's lines unchecked (PR #618).
 *
 * @param {string} diff output of `git diff --unified=0`
 * @returns {Map<string, Set<number>>} new-side path → added line numbers
 */
export function parseAddedLines(diff) {
  const added = new Map();
  let path = null;
  let next = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      path = null;
      next = 0;
      continue;
    }
    if (next === 0 && line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      path = target === '/dev/null' ? null : target.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('@@')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      next = hunk ? Number(hunk[1]) : 0;
      continue;
    }
    if (path && next && line.startsWith('+')) {
      if (!added.has(path)) added.set(path, new Set());
      added.get(path).add(next);
      next++;
    }
  }
  return added;
}

/**
 * Splits `git diff --name-only -z` output. The `-z` is not a detail: without it git C-quotes and
 * octal-escapes any path holding a non-ASCII byte (`"src/logo-\360\237\230\200.png"`), and that
 * literal can never match a token, so **every** diff touching such a file failed unconditionally
 * with no way to satisfy the check. Found by PR #538's review.
 */
export function changedPaths(raw) {
  return raw.split('\0').filter(Boolean);
}

/**
 * The porcelain status invocation, for a caller asking whether the working tree holds anything a
 * commit-to-commit range never saw.
 *
 * `--untracked-files=all` is the pin, and it covers two under-reports of the same thing:
 * `status.showUntrackedFiles=no` is a contributor setting that silences untracked paths entirely,
 * and by default an untracked *directory* collapses to one entry however many files it holds. Both
 * hide exactly the content a range cannot certify but a reader will read (issue #942).
 */
export function statusArgs(...rest) {
  return ['status', '--porcelain', '--untracked-files=all', ...rest];
}

/**
 * Every file the working tree holds that git has never been told about.
 *
 * A diff cannot report one: `git diff` compares an index or a commit against the tree, and an
 * untracked path is in neither side. A guard that reads its file list from a diff alone therefore
 * reports **clean** for a brand-new file — which is the likeliest omission there is (issue #654).
 *
 * <p>Lives here rather than in the one guard that calls it because it is the same pinning every
 * other call in this module exists for, and each miss is a false clean already paid for once: run
 * from the repository root, or a pathspec resolves against the caller's cwd and matches nothing;
 * `-z` plus `core.quotepath=false`, or a non-ASCII path comes back C-quoted and matches nothing
 * either (#538). Spelled inline in a guard, those are re-earned one at a time.
 *
 * <p>`--exclude-standard` is what keeps the answer meaningful rather than merely complete. Without
 * it every build artefact in a contributor's tree becomes something a guard has an opinion about,
 * and a gate that fires on `dist/` is one that gets switched off. What survives it is still the
 * whole tree, not a range: a caller folding this into a range-scoped answer is widening what it
 * **judges**, and must not thereby widen what it treats as **authoritative** (PR #662 review).
 *
 * <p>`--full-name` is `ls-files`' analogue of the `--no-relative` the diff builders pin: run from a
 * subdirectory a bare `ls-files` both truncates the prefix and omits everything above it — a double
 * false clean of the class this module's header enumerates. `git()` already pins `cwd`, so this is
 * belt-and-braces, which is exactly how `diffArgs`/`nameOnlyArgs` treat the same risk.
 *
 * <p>Split into an args builder so the flag-pinning case in `git-diff.test.mjs` can reach these
 * flags directly, as it does for `diffArgs`/`nameOnlyArgs` — this module exists to enforce exactly
 * that convention, and its newest invocation was the one no unit case could see.
 */
export function untrackedArgs() {
  return ['ls-files', '--others', '--exclude-standard', '--full-name', '-z'];
}

/** Every untracked path in the repository, ignore rules honoured. See `untrackedArgs` for the why. */
export function untrackedPaths() {
  return changedPaths(git(untrackedArgs()));
}

/**
 * The fetch invocation `resolveBase` corrects a stale tracking ref with.
 *
 * `--no-tags` is the pin, and it is the same one `ci.yml`'s explicit base-fetch step carries: a
 * guard needs one branch's tip, and pulling every tag on a large remote is work no check asks for.
 * A builder rather than flags spelled inline for the reason `untrackedArgs` gives — the
 * flag-pinning case in `git-diff.test.mjs` reaches builders, and only builders.
 */
export function fetchArgs(remote, branch) {
  return ['fetch', '--no-tags', '--quiet', remote, branch];
}

/** The two base spellings a range can be trusted to have been resolved from. */
const ACCEPTED_FORMS =
  'Pass `<remote>/<branch>` (fetched before use, e.g. `origin/main`) or a commit SHA (pinned, and ' +
  'the form to use with no network).';

/**
 * Every configured remote, so a `<prefix>/<rest>` base can be told from a branch holding a slash.
 *
 * Trimmed per line: a stray `\r` would leave `origin\r` failing to equal `origin`, and the base
 * would be refused as unrecognised on Windows alone. Fail-closed, but wrong.
 */
function remotes() {
  return git(['remote'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Resolves a ref to a commit SHA, or null when it does not exist. */
function resolveCommit(ref) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    return null;
  }
}

/**
 * Whether `ref` names a commit **by its hash** — hex-shaped, and resolving to a commit it prefixes.
 *
 * Both halves are load-bearing. Shape alone would accept a branch someone named `deadbeef`; the
 * prefix test alone would accept any ref at all, since every ref resolves to some SHA.
 */
function namesACommitSha(ref) {
  if (!/^[0-9a-f]{7,40}$/.test(ref.toLowerCase())) return false;
  const resolved = resolveCommit(ref);
  return resolved !== null && resolved.startsWith(ref.toLowerCase());
}

/**
 * The merge base to diff a guard's range from — **fetched, or refused** (issue #952).
 *
 * Staleness is not observable from inside a clone, so this does not try to detect it: it removes
 * the condition instead. A `<remote>/<branch>` base is fetched from that remote on every run, which
 * makes the tracking ref current by construction; anything that cannot be made current is refused.
 * The caller writes the error and exits 2 — "could not establish the range" has to read as *did not
 * run*, never as clean, because a guard's silence is what authorises not looking.
 *
 * <p>**Shallow is refused first, and a fetch does not fix it.** `merge-base` on a truncated graph
 * either throws or — worse — answers from what it has, a wrong base with no error and no warning.
 * That silent case is why this replaced a `mergeBase()` whose warning only ever fired on the throw
 * (PR #951 finding F-9), and why the fetch below cannot substitute for it.
 *
 * <p>**A bare local branch is refused too.** `main` in a session-old clone is a snapshot exactly as
 * `origin/main` is, and nothing advances it; accepting it would leave the same hole under a
 * different spelling. A SHA is the escape hatch, and the offline form.
 *
 * <p>**No common ancestor is refused rather than widened.** Falling back to the base tip — what
 * `mergeBase()` did — hands the guard a range spanning two unrelated histories, and every file in
 * it reads as this branch's addition.
 *
 * @param {string} ref the base as the caller spelled it
 * @returns {{ base: string } | { error: string }} the merge-base commit, or why there is none to trust
 */
export function resolveBase(ref) {
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    return {
      error:
        'This clone is shallow, so `git merge-base` answers from the truncated graph — a wrong ' +
        'base, with no error and no warning, and a fetch does not repair it.\n' +
        'Run `git fetch --unshallow` and re-run (issue #952).',
    };
  }

  const slash = ref.indexOf('/');
  const remote = slash === -1 ? null : ref.slice(0, slash);

  if (remote !== null && remotes().includes(remote)) {
    try {
      git(fetchArgs(remote, ref.slice(slash + 1)));
    } catch (cause) {
      return {
        error:
          `Could not fetch ${ref.slice(slash + 1)} from ${remote}, so ${ref} still holds whatever ` +
          'it did when this clone was made — and a range resolved from it silently widens onto ' +
          `commits this branch never touched (issue #952).\n${ACCEPTED_FORMS}\n${cause}`,
      };
    }
  } else if (!namesACommitSha(ref)) {
    return {
      error:
        `${ref} is not a base a range can be trusted to have been resolved from: it names no ` +
        'configured remote, and it is not a commit SHA. A local branch is a snapshot of the ' +
        'moment this clone was made, exactly as a tracking ref is.\n' +
        ACCEPTED_FORMS,
    };
  }

  const tip = resolveCommit(ref);
  if (tip === null) {
    return { error: `${ref} does not resolve to a commit here.\n${ACCEPTED_FORMS}` };
  }

  try {
    return { base: git(['merge-base', tip, 'HEAD']).trim() };
  } catch (cause) {
    return {
      error:
        `No merge base between ${ref} and HEAD. If they share no ancestor there is no range ` +
        `between them, and widening to ${ref} itself — which is what this used to do — reports ` +
        `every file in both histories as this branch's (PR #951 finding F-9).\n${cause}`,
    };
  }
}

/** Reads a repo-relative path from the working tree, or null when it is unreadable. */
export function readText(path) {
  try {
    return readFileSync(`${repoRoot()}/${path}`, 'utf8');
  } catch {
    return null;
  }
}
