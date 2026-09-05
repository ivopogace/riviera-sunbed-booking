/**
 * A throwaway git repository, and a way to run a `scripts/check-*.mjs` guard's **CLI** inside it
 * (issue #619).
 *
 * The guards' own suites test them as pure detectors — `findViolations`, `findOmissions`,
 * `parseAddedLines` — and that is the one layer where no defect has ever lived. Every false clean
 * found so far has been in the git front-end: a pathspec resolved against the caller's cwd, a
 * contributor's `diff.relative`, a re-spelled `b/` prefix, a C-quoted non-ASCII path, an added line
 * beginning with `++ ` read as a `+++` header. PR #618 fixed five of them, and reverting any one
 * left every test green. This is what makes that layer fail out loud instead.
 *
 * **The guard is spawned, never imported.** An exit code is only observable across a process
 * boundary, and `git-diff.mjs` caches `repoRoot()` for the lifetime of the process — so an
 * in-process call would answer for whichever repository asked first. One subprocess per case is a
 * genuinely cold front-end.
 *
 * Dependency-free on purpose: this runs in `Repo hygiene (diff-scoped)`, which deliberately has no
 * install step, so nothing here may import outside `node:`.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** The directory holding the guards, resolved from this file rather than from the caller's cwd. */
const SCRIPTS = import.meta.dirname;

/**
 * The environment every git call and every spawned guard runs under.
 *
 * `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` point at an empty file inside the temp directory, so the
 * developer's own `diff.relative`, `commit.gpgsign` or `init.templateDir` cannot decide whether a
 * case passes — only config a case sets on the throwaway repository itself is in play. An empty
 * file rather than `/dev/null`, which does not exist on Windows. The identity and dates are pinned
 * for the same reason: a repository with no committer configured cannot commit at all.
 */
function environment(configFile) {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: configFile,
    GIT_CONFIG_SYSTEM: configFile,
    GIT_AUTHOR_NAME: 'Guard Harness',
    GIT_AUTHOR_EMAIL: 'harness@riviera.invalid',
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00+00:00',
    GIT_COMMITTER_NAME: 'Guard Harness',
    GIT_COMMITTER_EMAIL: 'harness@riviera.invalid',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00+00:00',
    GIT_TERMINAL_PROMPT: '0',
  };
}

/**
 * Creates an initialised repository under the OS temp directory and returns the handle the cases
 * drive it with. Always `dispose()` it — `withRepo` does that for you.
 */
export function createRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'riviera-guard-'));
  const configFile = join(dir, 'empty-gitconfig');
  writeFileSync(configFile, '', 'utf8');
  const env = environment(configFile);

  const raw = (args, cwd) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed (${result.status}): ${result.stderr}`);
    }
    return result.stdout;
  };

  raw(['init', '--initial-branch=main', '--quiet'], dir);

  /** git resolves symlinks in the temp path on some platforms, so ask it where the root really is. */
  const root = raw(['rev-parse', '--show-toplevel'], dir).trim();

  let originDir = null;
  let remoteExists = false;

  /**
   * Points `origin` at `url`, whether or not the remote is already wired.
   *
   * `remote add` fails once `origin` exists, so both helpers below go through this rather than
   * each running their own `add`: a case that composes them — publish then break, or break then
   * publish — would otherwise die inside the harness, and the failure would read as the guard's.
   */
  const pointOrigin = (url) => {
    raw(['remote', remoteExists ? 'set-url' : 'add', 'origin', url], root);
    remoteExists = true;
  };

  /**
   * Creates the bare repository on first use and wires it as `origin`.
   *
   * **Outside the working tree, deliberately.** A bare repository under `root` would be an
   * untracked directory inside the repository under test, and the plan-doc guard judges untracked
   * paths — a fixture that changes what a guard reports is not a fixture.
   */
  const ensureOrigin = () => {
    if (originDir === null) {
      originDir = mkdtempSync(join(tmpdir(), 'riviera-guard-origin-'));
      raw(['init', '--bare', '--quiet', originDir], dir);
    }
    pointOrigin(originDir);
    return originDir;
  };

  return {
    root,

    /** Runs git at the repository root and returns stdout, throwing on a non-zero exit. */
    git: (args) => raw(args, root),

    /**
     * Points `origin`'s `branch` at `sha`, in a real repository this one can fetch from.
     *
     * A filesystem path, not a URL: `git fetch` over one needs no network and no credentials, so a
     * case can prove a guard *fetched* — which no amount of `update-ref` can show, because pointing
     * the tracking ref by hand is exactly what a fetch is being asked to correct. Push updates the
     * tracking ref too, so a case wanting a **stale** one sets it after publishing, never before.
     */
    publish: (branch, sha) => {
      ensureOrigin();
      raw(['push', '--quiet', '--force', 'origin', `${sha}:refs/heads/${branch}`], root);
    },

    /**
     * Repoints `origin` at a path holding no repository, so a fetch fails rather than hangs.
     *
     * Reversible: a later `publish()` points it back at the real one, so a case can model a remote
     * that goes away and comes back without building two repositories.
     */
    breakOrigin: () => pointOrigin(join(dir, 'no-such-origin.git')),

    /** Sets a repository-local config value — the contributor-config regressions' input. */
    config: (key, value) => raw(['config', key, value], root),

    /** Writes a repo-relative file, creating its parent directories. */
    write: (path, text) => {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, text, 'utf8');
      return absolute;
    },

    /** Stages everything and commits it, returning the new HEAD. */
    commit: (message) => {
      raw(['add', '--all'], root);
      raw(['commit', '--quiet', '--message', message], root);
      return raw(['rev-parse', 'HEAD'], root).trim();
    },

    /**
     * Spawns a guard's CLI.
     *
     * @param {string} script the guard's filename, e.g. `check-inline-comments.mjs`
     * @param {string[]} args its argv
     * @param {{ cwd?: string, stdin?: string }} [options] `cwd` is a repo-relative subdirectory,
     *   which is how the caller's-cwd regressions are expressed; `stdin` feeds `--hook` its payload
     * @returns {{ status: number, stdout: string, stderr: string }}
     */
    run: (script, args, options = {}) => {
      const { cwd = '.', stdin = '' } = options;
      const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
        cwd: join(root, cwd),
        env,
        encoding: 'utf8',
        input: stdin,
      });
      if (result.error) throw result.error;
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    },

    dispose: () => {
      rmSync(dir, { recursive: true, force: true });
      if (originDir !== null) rmSync(originDir, { recursive: true, force: true });
    },
  };
}

/** Runs `body` against a fresh repository and disposes of it however the body ends. */
export function withRepo(body) {
  const repo = createRepo();
  try {
    return body(repo);
  } finally {
    repo.dispose();
  }
}

/**
 * The `PostToolUse` payload Claude Code hands a guard on stdin, as the hook in
 * `.claude/settings.json` invokes it.
 */
export function hookPayload(path) {
  return JSON.stringify({ tool_input: { file_path: path }, tool_response: { filePath: path } });
}
