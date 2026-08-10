/**
 * Diff-scoped guard for `frontend/.prettierrc` (issue #615, sibling of #529's RV-STYLE-1 guard and
 * #533's plan-doc guard): the config has been advisory since it landed, so files drift from it
 * silently and reviewers pay for it by hand — twice on the record (PR #520, PR #612).
 *
 * **Judges lines, not files.** A file the diff touches is not required to be Prettier-clean; only
 * the lines the diff *added* are. `main` at `5f415a2` carries 1 500 misformatted lines across 200
 * files — 2.3 % of the tree, but spread thin, a median of two hunks per dirty file. A file-scoped
 * gate over that tree would demand an unrelated whole-file reformat on most pull requests, which is
 * exactly the trade PR #612's review refused, and a gate that asks for churn is a gate that gets
 * switched off (#529's lesson, restated by #533's R-2).
 *
 * Scope is `frontend/` alone, because that is where `.prettierrc` lives: `resolveConfig` returns
 * `null` for `scripts/`, `docs/` and `platform/`, so checking them would impose Prettier's
 * *defaults* on three trees that never agreed to them. Rule values are out of scope (#615).
 */

/** The one tree `frontend/.prettierrc` governs. */
const SCOPE = 'frontend/';

/**
 * Above this many LCS cells the line diff stops being worth its memory, and the whole differing
 * region is reported as one hunk instead. Conservative in the safe direction — it over-reports a
 * region rather than missing one — and unreachable in practice: the trim below leaves the common
 * case a handful of lines, and the widest file in the tree differs by 244.
 */
const LCS_CELL_CAP = 4_000_000;

/** True when `.prettierrc` governs this path. */
export function inScope(path) {
  return path.startsWith(SCOPE);
}

/**
 * The hunks of `path` that Prettier would rewrite **and** the diff wrote.
 *
 * @param {{ path: string, current: string, formatted: string, added: Set<number> }} input the file
 *   as it stands, the file as Prettier would write it, and the 1-based lines the diff added
 * @returns {{ path: string, line: number, endLine: number, current: string[], expected: string[] }[]}
 *   one entry per hunk, in file order. A pure insertion carries `current: []` and `endLine` one
 *   below `line` — the empty range before the line the new content belongs above.
 */
export function findMisformatted({ path, current, formatted, added }) {
  if (current === formatted) return [];

  const before = current.split('\n');
  const after = formatted.split('\n');

  return hunksBetween(before, after)
    .filter((hunk) => wasWritten(hunk, added))
    .map((hunk) => ({
      path,
      line: hunk.start + 1,
      endLine: hunk.start + hunk.deleted,
      current: before.slice(hunk.start, hunk.start + hunk.deleted),
      expected: hunk.replacement,
    }));
}

/**
 * True when the diff wrote any line this hunk covers. An insertion covers no line of its own, so it
 * is attributed to the two lines it sits between — writing either of them is what invited it.
 */
function wasWritten(hunk, added) {
  if (hunk.deleted === 0) return added.has(hunk.start) || added.has(hunk.start + 1);
  for (let line = hunk.start + 1; line <= hunk.start + hunk.deleted; line++) {
    if (added.has(line)) return true;
  }
  return false;
}

/**
 * Line-diffs `before` against `after`, returning one hunk per contiguous edit:
 * `{ start, deleted, replacement }`, where `start` is a 0-based index into `before`.
 *
 * The common prefix and suffix are trimmed first. That is not only an optimization — it is what
 * keeps the quadratic middle small enough to matter, since Prettier's output shares almost all of
 * its lines with the input.
 */
export function hunksBetween(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  return alignedHunks(before.slice(start, endBefore), after.slice(start, endAfter), start);
}

/**
 * The edit script between two line arrays, grouped into contiguous hunks and shifted by `offset`.
 * Runs a longest-common-subsequence walk, so an unchanged line inside the differing region splits
 * the region into two hunks rather than swallowing it — which is what lets a pre-existing drift and
 * a freshly-written one in the same file be told apart.
 */
function alignedHunks(before, after, offset) {
  const n = before.length;
  const m = after.length;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > LCS_CELL_CAP) {
    return [{ start: offset, deleted: n, replacement: after.slice() }];
  }

  const width = m + 1;
  const lengths = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] =
        before[i] === after[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const hunks = [];
  let open = null;
  let i = 0;
  let j = 0;

  const openAt = (index) => {
    if (!open) {
      open = { start: index + offset, deleted: 0, replacement: [] };
      hunks.push(open);
    }
    return open;
  };

  while (i < n && j < m) {
    if (before[i] === after[j]) {
      open = null;
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      openAt(i).deleted++;
      i++;
    } else {
      openAt(i).replacement.push(after[j]);
      j++;
    }
  }
  while (i < n) {
    openAt(i).deleted++;
    i++;
  }
  while (j < m) {
    openAt(i).replacement.push(after[j]);
    j++;
  }
  return hunks;
}
