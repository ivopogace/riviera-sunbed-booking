/**
 * Proves the SDLC review gate is about to review **this PR's diff** and not something wider
 * (issue #942).
 *
 * The gate used to name its range inline as `origin/main...HEAD`, with nothing anywhere telling it
 * to fetch first. A Claude Code cloud session clones once at container start and never refetches, so
 * both of that ref's failure modes are live, and both fired during the review of PR #939: a stale
 * `origin/main` turned a three-file PR into a ten-file range, five review agents were dispatched
 * against it, and none of them reported anything amiss — a larger diff looks exactly like a larger
 * PR. A gate that reviews the wrong diff and reports "no issues found" is worse than no gate,
 * because the PR then carries a ticked review box.
 *
 * So this guard does not trust a local ref to be current. It re-derives the base the way GitHub
 * does — `merge-base` against the base branch's **current tip** — and then refuses to agree that the
 * range is right until the file and line counts match what the PR itself reports. That comparison is
 * the whole point: staleness is not observable from inside a clone, but its *consequence* is.
 *
 * Deriving the base from the base branch's tip, rather than from the PR's `base.sha`, is the same
 * correction `ci.yml`'s base-fetch step already carries (PR #618). `base.sha` is the base branch's
 * tip *when the PR was opened*; `riviera-sdlc` tells a slice to merge latest `main` in before
 * ready-for-review, and after that merge GitHub diffs against the newer tip while `base.sha` does
 * not — so pinning to it would make this very check abort on correctly-prepared PRs. Passed as
 * `--base-sha` it is used for what it is good for: proving the clone actually contains the PR's
 * recorded base.
 *
 * Usage:
 *   node scripts/check-review-range.mjs --base-ref <ref> --head-sha <sha>
 *                                       --files <n> --additions <n> --deletions <n>
 *                                       [--base-sha <sha>]
 *
 * `--head-sha` is required, not optional: matching counts prove the range is the PR's **size**, and
 * only the head SHA proves it is the PR's **content**. A local branch one commit behind the pushed
 * head can agree on all three dimensions, and the gate would then announce "matched against the PR"
 * over a diff the PR does not contain.
 *
 * The counts come from the PR itself (`changed_files`, `additions`, `deletions` — `gh api
 * repos/O/R/pulls/N`, or the GitHub MCP `pull_request_read`). They are arguments rather than
 * something this guard fetches: `scripts/*.test.mjs` runs in `Repo hygiene (diff-scoped)`, which has
 * no install step and no token, so a guard that reached the network could not be tested there.
 *
 * Exit codes: 0 the range is verified · 1 the scope disagrees with the PR · 2 a precondition failed
 * (shallow clone, unknown base ref, missing/malformed counts, an empty range, or a git call that
 * failed) — in every non-zero case the gate must NOT dispatch.
 *
 * Counts are validated as digit strings rather than coerced, and an empty range is refused on both
 * sides, because `Number('')` is `0`: a substitution that silently produced nothing — `--files
 * "$(gh api … --jq .changed_files)"` when the call errors, or an unreplaced placeholder — would
 * otherwise compare `0/0/0` against a HEAD still sitting on the base and print "verified". That is
 * this guard's own version of the false clean it exists to prevent, so it is the one input class
 * checked before anything else.
 */

import { pathToFileURL } from 'node:url';

import { git, numstatArgs } from './git-diff.mjs';

/** The dimensions compared, in the order a mismatch report reads best. */
const DIMENSIONS = ['files', 'additions', 'deletions'];

/**
 * Totals `git diff --numstat`.
 *
 * A binary file is emitted as `-\t-\tpath`: it is a changed *file* but contributes no line counts,
 * and GitHub's `additions`/`deletions` omit it for the same reason, so the two sides agree only if
 * this does too. Counted separately so a report can say why the line totals look light.
 *
 * @param {string} raw stdout of `git diff --numstat`
 * @returns {{ files: number, additions: number, deletions: number, binary: number }}
 */
export function parseNumstat(raw) {
  const totals = { files: 0, additions: 0, deletions: 0, binary: 0 };

  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [added, deleted] = line.split('\t');
    totals.files++;
    if (added === '-' || deleted === '-') {
      totals.binary++;
      continue;
    }
    totals.additions += Number(added);
    totals.deletions += Number(deleted);
  }
  return totals;
}

/**
 * Every dimension on which the local range disagrees with the PR — all of them, not the first.
 * One report per run is one round trip; a mismatch on files usually comes with one on lines, and
 * seeing both is what tells the reader it is a stale base rather than an off-by-one.
 *
 * @returns {string[]} empty when the range is the PR's
 */
export function compare(local, reported) {
  return DIMENSIONS.filter((key) => local[key] !== reported[key]).map(
    (key) => `  ${key}: local ${local[key]}, PR ${reported[key]}`,
  );
}

/** Resolves a ref to a SHA, or null when it does not exist locally. */
function resolve(ref) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    return null;
  }
}

/**
 * `--flag value` pairs only. A `--flag=value` argument would otherwise be stored under the key
 * `flag=value` and reported as the flag being absent, which contradicts what the caller typed.
 */
function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) return { error: `unexpected argument: ${argv[i]}` };
    if (argv[i].includes('=')) {
      return { error: `use \`${argv[i].split('=')[0]} <value>\`, not \`${argv[i]}\`` };
    }
    if (argv[i + 1] === undefined) return { error: `${argv[i]} needs a value` };
    options[argv[i].slice(2)] = argv[i + 1];
  }
  return { options };
}

/** Resolves the range and compares it, or returns the exit code and message for a refusal. */
function verify(options) {
  const baseRef = options['base-ref'];
  if (!baseRef) {
    return { code: 2, error: "--base-ref is required (the PR's base.ref — do not assume `main`)." };
  }

  const headSha = options['head-sha'];
  if (!headSha) {
    return {
      code: 2,
      error:
        "--head-sha is required (the PR's head.sha). Counts prove the range's size; only this " +
        'proves it is the same content.',
    };
  }

  const missing = DIMENSIONS.filter((key) => options[key] === undefined);
  if (missing.length > 0) {
    return {
      code: 2,
      error:
        `Missing the PR's own counts: ${missing.map((key) => `--${key}`).join(', ')}.\n` +
        'An unverifiable range is not a verified one — read changed_files/additions/deletions off ' +
        'the PR and pass them.',
    };
  }

  // Number('') and Number(' ') are both 0, so the string is what decides, never the coercion.
  const malformed = DIMENSIONS.filter((key) => !/^\d+$/.test(options[key].trim()));
  if (malformed.length > 0) {
    return {
      code: 2,
      error:
        `Not a count: ${malformed.map((key) => `--${key} '${options[key]}'`).join(', ')}.\n` +
        'An empty or non-numeric count coerces to 0 and would agree with an empty range, which is ' +
        'exactly the false clean this guard exists to refuse.',
    };
  }
  const reported = Object.fromEntries(DIMENSIONS.map((key) => [key, Number(options[key])]));

  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    return {
      code: 2,
      error:
        'This clone is shallow — the merge base, and every history command, may be wrong.\n' +
        'Run `git fetch --unshallow` before the review gate resolves its range.',
    };
  }

  const tip = resolve(`origin/${baseRef}`);
  if (tip === null) {
    return {
      code: 2,
      error:
        `origin/${baseRef} does not exist locally. Run \`git fetch --no-tags origin ${baseRef}\` ` +
        'first — this guard will not fall back to another ref, because a diffable wrong base is ' +
        'exactly the failure it exists to catch.',
    };
  }

  const baseSha = options['base-sha'];
  if (baseSha !== undefined && resolve(baseSha) === null) {
    return {
      code: 2,
      error:
        `The PR reports base.sha ${baseSha}, which this clone does not contain — the fetch did ` +
        'not bring down the PR\'s history. Re-fetch before reviewing.',
    };
  }

  const head = git(['rev-parse', 'HEAD']).trim();
  if (!head.startsWith(headSha) && !headSha.startsWith(head)) {
    return {
      code: 2,
      error:
        `HEAD is ${head}, but the PR's head is ${headSha}.\n` +
        'The range would be built from a commit the PR does not point at — push what you have, or ' +
        'fetch and check out the PR head, before reviewing.',
    };
  }

  // The merge base against the branch's CURRENT tip is what GitHub diffs; see the header on base.sha.
  const base = git(['merge-base', `origin/${baseRef}`, 'HEAD']).trim();
  const local = parseNumstat(git(numstatArgs(`${base}...HEAD`)));

  if (local.files === 0 || reported.files === 0) {
    return {
      code: 2,
      error:
        `Empty range: ${local.files} local file(s) against ${reported.files} on the PR ` +
        `(${base}...HEAD).\n` +
        'A range with no files is not something a review can be run over — HEAD is probably still ' +
        'on the base branch, or the counts did not substitute.',
    };
  }

  const mismatches = compare(local, reported);
  if (mismatches.length > 0) {
    return {
      code: 1,
      error:
        `Review scope does NOT match PR — do not dispatch.\n${mismatches.join('\n')}\n` +
        `  range checked: ${base}...HEAD (merge-base with origin/${baseRef} @ ${tip})\n` +
        'WIDER than the PR means the base is stale: re-fetch the base branch and re-run — ' +
        'reviewing it would report on commits that are not part of this PR. NARROWER means your ' +
        'HEAD is not the PR head: commit or push what is missing, or pull what you lack.',
    };
  }

  const binary = local.binary > 0 ? `, ${local.binary} binary` : '';
  // Reviewers read file CONTENT from the working tree, which a commit-to-commit range never saw.
  const dirty = git(['status', '--porcelain']).trim();
  const warning = dirty
    ? `\n  WARNING: ${dirty.split('\n').length} uncommitted/untracked path(s). The range is ` +
      'commit-to-commit, but the review reads the working tree — commit or stash them first.'
    : '';
  return {
    code: 0,
    out:
      `Review range verified: ${base}...HEAD\n` +
      `  base: origin/${baseRef} @ ${tip}, merge-base ${base}\n` +
      `  head: ${head} (matches the PR's head.sha)\n` +
      `  scope: ${local.files} files, +${local.additions} -${local.deletions}${binary} — matches PR` +
      warning,
  };
}

function main(argv) {
  const { options, error } = parseArgs(argv);
  if (error) {
    process.stderr.write(`${error}\n`);
    return 2;
  }

  let result;
  try {
    result = verify(options);
  } catch (cause) {
    // A throwing git call is a precondition failure; escaping it would exit 1, the wrong remedy.
    process.stderr.write(`A git call failed, so the range was never established:\n${cause}\n`);
    return 2;
  }

  process[result.code === 0 ? 'stdout' : 'stderr'].write(`${result.out ?? result.error}\n`);
  return result.code;
}

// pathToFileURL, not concatenation: on Windows `C:\…` never equals the `file:///C:/…` form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
