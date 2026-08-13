/**
 * Proves the cloud setup script recorded in `docs/agents/cloud-environment.md` still pins the Node
 * version in `.nvmrc` (issue #659).
 *
 * The environment's *Setup script* field lives on claude.ai, outside version control, and hardcodes a
 * Node version where the deleted `scripts/web-setup.sh` used to read `.nvmrc`. That is the one real
 * defect #659 found: bumping `.nvmrc` changes CI, the Dockerfile and every contributor toolchain, and
 * silently does nothing in cloud. The doc is the reviewable mirror of that field; this guard is what
 * keeps the mirror honest.
 *
 * It proves two of the pin's three homes agree. The third — the field itself — is unreachable from a
 * diff, which is why the doc spells the bump out as three steps rather than two.
 *
 * Usage: `node scripts/check-cloud-node-pin.mjs`  (no arguments)
 *
 * **Standing-tree, not diff-scoped**, unlike its four siblings in the same CI job: a stale mirror is
 * stale whether or not this pull request went near it, and there is no day-one red to avoid because
 * the two agree the moment the doc is written.
 *
 * **Fail-closed everywhere.** A missing file, a renamed marker, a reformatted block with no version
 * left in it — each returns a problem rather than a pass. A consistency guard that silently verifies
 * nothing is worse than no guard, because the doc then reads as checked (the #641 lesson).
 */

import { pathToFileURL } from 'node:url';

import { readText } from './git-diff.mjs';

/** The pin's source of truth: CI's `node-version-file`, the Dockerfile's base, the contributor pin. */
export const NVMRC = '.nvmrc';

/** The reviewable mirror of the out-of-repo *Setup script* field. */
export const DOC = 'docs/agents/cloud-environment.md';

/** Delimiters around the verbatim block, so prose elsewhere in the doc is not scanned for versions. */
export const START = '<!-- cloud-setup-script:start -->';
export const END = '<!-- cloud-setup-script:end -->';

/** A three-part version token, with or without git-style `v` prefix — `26.0.0` and `v26.0.0` both. */
const VERSION = /\bv?(\d+\.\d+\.\d+)\b/g;

const EXACT = /^\d+\.\d+\.\d+$/;

/**
 * Returns one message per problem found, empty when the mirror is faithful, plus what was verified so
 * a passing run can say how much it actually looked at.
 *
 * @param {string | null} nvmrcText contents of `.nvmrc`, or null when it could not be read
 * @param {string | null} docText contents of the doc, or null when it could not be read
 * @returns {{ problems: string[], pinned: string | null, matched: number }}
 */
export function check(nvmrcText, docText) {
  const problems = [];
  const pinned = nvmrcText === null ? null : nvmrcText.trim();

  if (pinned === null) problems.push(`${NVMRC} could not be read.`);
  else if (!EXACT.test(pinned)) problems.push(`${NVMRC} holds ${JSON.stringify(pinned)}, not an x.y.z version.`);

  if (docText === null) {
    problems.push(`${DOC} could not be read — the cloud setup script has no reviewable copy.`);
    return { problems, pinned, matched: 0 };
  }

  const from = docText.indexOf(START);
  const to = docText.indexOf(END);
  if (from === -1 || to === -1 || to < from) {
    problems.push(
      `${DOC} does not delimit the recorded setup script with ${START} … ${END}, so its Node pin was not verified.`,
    );
    return { problems, pinned, matched: 0 };
  }

  const found = [...docText.slice(from + START.length, to).matchAll(VERSION)].map((m) => m[1]);
  if (found.length === 0) {
    problems.push(`${DOC} records no Node version between its markers, so nothing was verified.`);
    return { problems, pinned, matched: 0 };
  }

  const stale = [...new Set(found.filter((version) => version !== pinned))];
  if (stale.length > 0) {
    problems.push(
      `${DOC} records Node ${stale.join(', ')} but ${NVMRC} pins ${pinned} — ` +
        'update the recorded script AND paste it into the environment\'s Setup script field.',
    );
  }
  return { problems, pinned, matched: found.length - stale.length };
}

function main(argv) {
  if (argv.length > 0) {
    process.stderr.write('usage: node scripts/check-cloud-node-pin.mjs   (no arguments)\n');
    return 2;
  }

  const { problems, pinned, matched } = check(readText(NVMRC), readText(DOC));
  if (problems.length > 0) {
    process.stderr.write(`${problems.map((problem) => `  ${problem}`).join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`Cloud setup script records Node ${pinned} in ${matched} place(s), matching ${NVMRC}.\n`);
  return 0;
}

// pathToFileURL, not concatenation: on Windows `C:\…` never equals the `file:///C:/…` form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
