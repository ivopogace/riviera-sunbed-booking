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
 *   node scripts/check-review-range.mjs --base-ref <ref> --files <n> --additions <n> --deletions <n>
 *                                       [--base-sha <sha>]
 *
 * The counts come from the PR itself (`changed_files`, `additions`, `deletions` — `gh api
 * repos/O/R/pulls/N`, or the GitHub MCP `pull_request_read`). They are arguments rather than
 * something this guard fetches: `scripts/*.test.mjs` runs in `Repo hygiene (diff-scoped)`, which has
 * no install step and no token, so a guard that reached the network could not be tested there.
 *
 * Exit codes: 0 the range is verified · 1 the scope disagrees with the PR · 2 a precondition failed
 * (shallow clone, unknown base ref, missing counts) — in every non-zero case the gate must NOT
 * dispatch.
 */

import { pathToFileURL } from 'node:url';

import { git } from './git-diff.mjs';

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

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) return { error: `unexpected argument: ${argv[i]}` };
    if (argv[i + 1] === undefined) return { error: `${argv[i]} needs a value` };
    options[argv[i].slice(2)] = argv[i + 1];
  }
  return { options };
}

function main(argv) {
  const { options, error } = parseArgs(argv);
  if (error) {
    process.stderr.write(`${error}\n`);
    return 2;
  }

  const baseRef = options['base-ref'];
  if (!baseRef) {
    process.stderr.write('--base-ref is required (the PR\'s base.ref — do not assume `main`).\n');
    return 2;
  }

  const missing = DIMENSIONS.filter((key) => options[key] === undefined);
  if (missing.length > 0) {
    process.stderr.write(
      `Missing the PR's own counts: ${missing.map((key) => `--${key}`).join(', ')}.\n` +
        'An unverifiable range is not a verified one — read changed_files/additions/deletions off ' +
        'the PR and pass them.\n',
    );
    return 2;
  }
  const reported = Object.fromEntries(DIMENSIONS.map((key) => [key, Number(options[key])]));

  // Cloud sessions start shallow, and merge-base then answers from the truncated graph, failing open.
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    process.stderr.write(
      'This clone is shallow — the merge base, and every history command, may be wrong.\n' +
        'Run `git fetch --unshallow` before the review gate resolves its range.\n',
    );
    return 2;
  }

  const tip = resolve(`origin/${baseRef}`);
  if (tip === null) {
    process.stderr.write(
      `origin/${baseRef} does not exist locally. Run \`git fetch --no-tags origin ${baseRef}\` ` +
        'first — this guard will not fall back to another ref, because a diffable wrong base is ' +
        'exactly the failure it exists to catch.\n',
    );
    return 2;
  }

  const baseSha = options['base-sha'];
  if (baseSha !== undefined && resolve(baseSha) === null) {
    process.stderr.write(
      `The PR reports base.sha ${baseSha}, which this clone does not contain — the fetch did not ` +
        'bring down the PR\'s history. Re-fetch before reviewing.\n',
    );
    return 2;
  }

  // The merge base against the branch's CURRENT tip is what GitHub diffs; see the header on base.sha.
  const base = git(['merge-base', `origin/${baseRef}`, 'HEAD']).trim();
  const local = parseNumstat(
    git(['diff', '--numstat', '--no-color', '--no-ext-diff', '--no-relative', `${base}...HEAD`]),
  );

  const mismatches = compare(local, reported);
  if (mismatches.length > 0) {
    process.stderr.write(
      `Review scope does NOT match PR — do not dispatch.\n${mismatches.join('\n')}\n` +
        `  range checked: ${base}...HEAD (merge-base with origin/${baseRef} @ ${tip})\n` +
        'A local range wider than the PR means the base is stale: re-fetch the base branch and ' +
        're-run. Reviewing this range would report on commits that are not part of this PR.\n',
    );
    return 1;
  }

  const binary = local.binary > 0 ? `, ${local.binary} binary` : '';
  process.stdout.write(
    `Review range verified: ${base}...HEAD\n` +
      `  base: origin/${baseRef} @ ${tip}, merge-base ${base}\n` +
      `  scope: ${local.files} files, +${local.additions} -${local.deletions}${binary} — matches PR\n`,
  );
  return 0;
}

// pathToFileURL, not concatenation: on Windows `C:\…` never equals the `file:///C:/…` form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
