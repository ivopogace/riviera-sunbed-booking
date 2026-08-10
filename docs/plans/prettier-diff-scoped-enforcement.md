# Diff-scoped Prettier Enforcement Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend/.prettierrc` stops being advisory — a hard CI gate judges the formatting of
the lines a diff **writes**, so a PR can never introduce new drift, and never has to reformat a
long-dirty file to land an unrelated fix.

**Architecture:** A third dependency-free Node guard, `scripts/check-prettier-format.mjs`, in the
shape #529 and #533 established: a pure detector (`current lines + Prettier's output + the diff's
added lines → findings`) behind a thin git/Prettier front-end. The single significant decision is
**line-scoped, not file-scoped**: a file the diff touches is not required to be Prettier-clean, only
the lines the diff added are. That follows from measurement — `main` at `5f415a2` carries
**1 500 misformatted lines across 200 files** (2.3 % of 65 148 lines, 580 hunks, median 2 per file),
so a file-scoped gate would demand an unrelated whole-file reformat on most PRs, which is the exact
trade the review gate refused on #612. A `--fix` mode applies **only** the reported hunks, so the
fix carries no unrelated churn either.

**Persistence:** N/A — no database, no migration, no backend code. JDBC-only (invariant #1) is
untouched.

**Source of intent:** GitHub issue **#615**. Its two prior sightings are on the record:
`docs/plans/admin-suspend-audit-reason.md` F-1 (PR #520 — fixed) and
`docs/plans/shared-confirm-panel.md` F-5 (PR #612 — rejected as unrelated churn, correctly).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the blocker the
issue does not mention: the `Riviera Rule Set` keys required contexts by **job name**, so a new
`Prettier` job would report without blocking until a maintainer edits the ruleset, exactly the #534
lesson) · `riviera-plan-doc` (this template — forced the Non-goals that fix the check's scope at
`frontend/` and the risk register that surfaced the dependency-free-hygiene-job constraint R-4) ·
`tdd` (every detector rule is a red `node --test` case first; the two real-history fixtures come from
`main` rather than from imagination) · `riviera-review-overlay` (review gate — due at
ready-for-review; this slice also **adds** RV-STYLE-2 to it, which is the half of #615 that stops the
review-time cost) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, **5 findings, all
patched** — the counting sweep was the point: this is the **third** diff-scoped hygiene guard and the
**first** one that is not in the `Repo hygiene (diff-scoped)` job, so every doc phrased as "the two
diff-scoped checks" or "the guard has no dependencies" was a candidate, and four of the five sat in
files this diff would otherwise never have opened) · `riviera-local-debug`
(the `npm ci` + scoped-run recipe; the guard's own suite is dependency-free `node --test`, so neither
the Gradle recipe nor the OOM-scoping rule binds here)

> Routed skills the gate did **not** match, and why: `postgres` (no migration), `riviera-modulith` +
> `riviera-java-conventions` (no backend Java), `riviera-frontend` + `angular-developer` +
> `playwright-cli` (nothing under `frontend/src` or `frontend/e2e` — `frontend/package.json` and
> `frontend/.prettierignore` are build tooling, not an Angular surface, and the slice ships no
> user-observable behaviour to drive), `riviera-stripe-payments` (no money).

**Branch:** `claude/issue-615-v9oj1l` — the cloud session's designated remote branch stands in for
`feature/prettier-diff-scoped-enforcement` (`riviera-sdlc` §Remote/cloud session addendum).

---

## Acceptance criteria (testable)

> Written against the detector — the inner boundary — not against GitHub Actions. The CI wiring is
> asserted once, at the adapter level, by this PR's own run.

- [x] **AC-1:** Given a file whose content differs from Prettier's output only at lines the diff did
  **not** add, when the guard runs, then it reports nothing. *Pinned by:*
  `check-prettier-format.test.mjs` › `"pre-existing drift outside the added lines is not reported"`.
- [x] **AC-2:** Given a diff that adds a line Prettier would rewrite, when the guard runs, then it
  reports that line with both the text as written and the text Prettier expects. *Pinned by:*
  `check-prettier-format.test.mjs` › `"reports the added line and what Prettier expects"`.
- [x] **AC-3:** Given a file the diff creates, when the guard runs, then every misformatted hunk in
  it is reported — a new file has no pre-existing drift to protect. *Pinned by:*
  `check-prettier-format.test.mjs` › `"a file the diff creates is judged in full"`.
- [x] **AC-4:** Given a changed path outside `frontend/`, when the guard runs, then it is not
  checked. *Pinned by:* `check-prettier-format.test.mjs` › `"only frontend/ is in scope"`.
- [x] **AC-5:** Given `--fix` over a file that has one reported hunk **and** pre-existing drift
  elsewhere, when it runs, then the reported hunk is rewritten and every pre-existing-drift line is
  left byte-for-byte. *Pinned by:* `check-prettier-format.test.mjs` › `"--fix rewrites only the
  reported hunks"`. This is the property that makes the gate honest: the fix it asks for is never
  wider than the finding.
- [x] **AC-6:** Given a file Prettier cannot parse, when the guard runs, then it warns on stderr and
  the run's exit status is unaffected. *Pinned by:* `check-prettier-format.test.mjs` › `"an
  unparseable file warns instead of failing the gate"`.
- [x] **AC-7:** Given a pure insertion (Prettier adds a line rather than rewriting one), when the
  diff added the line on either side of it, then it is reported. *Pinned by:*
  `check-prettier-format.test.mjs` › `"an insertion is attributed to the lines it sits between"`.
- [x] **AC-8:** Given the shared git/diff helpers move to `scripts/git-diff.mjs`, when the whole
  guard suite runs, then both pre-existing guards behave exactly as before. *Pinned by:*
  `node --test "scripts/*.test.mjs"` — the #529 and #533 suites, unchanged in substance.
- [ ] **AC-9:** Given this PR, when CI runs, then the `Frontend (lint + test + build)` job executes
  the new format step and the job is green, **and** the `Repo hygiene (diff-scoped)` job — which
  installs nothing — still runs the new guard's suite. *Verified by:* this PR's own Actions run
  (recorded in *Acceptance-criteria verification*), not by a unit test.
- [x] **AC-10:** Given a reviewer reading a diff that touches a long-dirty file, when they consult
  `riviera-review-overlay`, then RV-STYLE-2 tells them formatting is machine-checked and that asking
  for a whole-file reformat is the wrong call. *Verified by:*
  `grep -c "RV-STYLE-2" .claude/skills/riviera-review-overlay/SKILL.md` ≥ 1.

## Non-goals

- **Changing any rule's value.** `printWidth`, `singleQuote` and the `.html` Angular-parser override
  ship byte-for-byte as they are (issue #615, *Out of scope*).
- **The big-bang `prettier --write` across `frontend/`.** Measured and rejected, not skipped: it is
  1 500 changed lines over 200 files, and `sonar.sources` includes `frontend/src`, so the reformat
  would present itself to the Sonar gate as ~1 500 lines of new code whose coverage is whatever those
  files already have. That is a merge-blocking bet on an unknown, paid to buy a property —
  "the tree is clean" — that line-scoping does not need. `.git-blame-ignore-revs` is therefore not
  added either; there is no revision to ignore.
- **Enforcing Prettier outside `frontend/`.** `.prettierrc` lives in `frontend/`, and
  `resolveConfig` returns `null` for `scripts/`, `docs/` and `platform/` — they would be judged
  against Prettier's *defaults* (`printWidth: 80`, double quotes), which is adopting new rules for
  three trees, and rule values are out of scope.
- **A `PostToolUse` hook.** RV-STYLE-1 has one because its fix is local to the line just written.
  Prettier's authoring-time control is the editor's format-on-save; a hook that ran
  `prettier --write` would reformat whole files, manufacturing precisely the churn this slice exists
  to avoid. `--files` covers the by-hand case.
- **Deleting `.prettierrc`** (issue #615 option 2). Defensible, and not chosen: two reviewers have
  already cited the config, and ESLint here carries no formatting rules to replace it with.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` Nothing runs Prettier today, so there is no old surface to
hold parity with. The one existing-surface change is the extraction of `git()` / `rangeFor()` /
`parseAddedLines()` / `changedPaths()` out of the two shipped guards into `scripts/git-diff.mjs` —
a pure move, with the functions' bodies unchanged and both suites (AC-8) as the parity proof.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The gate fires on drift the author did not write — the failure mode that gets a gate switched off (#529's own lesson, restated as #533's R-2) | high if file-scoped | high | Line-scoping by construction: only hunks overlapping the diff's added lines are reported, and `--fix` rewrites only those. Measured over real history before shipping (Generalization-audit log) rather than argued | this slice | **closed — measured, not argued.** Replayed over the last 40 `main` commits: **9 would have failed** (22.5 %), seven of them 1–4 hunks. Every hunk names a line that commit itself wrote, and `--fix` costs one command. File-scoped, for comparison, would have failed nearly all 40. `5783195` |
| R-2 | The `Frontend` job checks out at depth 1, so the PR's base commit is absent and `git diff <base>...HEAD` fails — the gate errors instead of judging | high | med | `fetch-depth: 0` on that job's checkout, as the `Repo hygiene` job already does for the same reason. Proven by this PR's own run | this slice | closed in the diff (`fetch-depth: 0` set, with the reason recorded above it); the run-time proof is AC-9 |
| R-3 | A **new** CI job would report without blocking: the `Riviera Rule Set` keys required status checks by job name, so a merge stays possible until a maintainer edits the ruleset (#534), and renaming a job makes every PR unmergeable (#413/#420) | certain if a new job | high | The check is a **step** inside `Frontend (lint + test + build)`, already a required context. No job is added or renamed; the ruleset is untouched | this slice | **closed** — verified against the parsed workflow: the job set and every `name:` are byte-for-byte unchanged, `Repo hygiene (diff-scoped)` included. `5783195` |
| R-4 | The `Repo hygiene (diff-scoped)` job runs `node --test "scripts/*.test.mjs"` with **no install step** — a top-level `import 'prettier'` in the new guard would break a required gate for every PR | med | high | Prettier is resolved lazily, inside the function that formats, via `createRequire` against `frontend/package.json`; the detector the suite imports is pure. That job's own green run on this PR is the proof | this slice | closed in the diff — the guard's import graph reaches `node:*` and `./git-diff.mjs` only, and the constraint is now written into the job's own comment so the next author does not undo it. Run-time proof is AC-9 |
| R-5 | A Prettier minor bump (Dependabot) changes formatting and reddens PRs that did not cause it | low | low | Accepted. Line-scoping bounds the blast radius to lines a PR actually writes, and a bump PR touches no frontend source. If it ever bites, the fix is `npm run format:check -- --fix` on the affected lines | this slice | closed as accepted — no change to the posture. Sharpened once by evidence: an `npx prettier` invocation during this slice silently fetched **3.9.6** from the registry while the lockfile pins 3.9.5, which is exactly why the guard resolves Prettier through `frontend/package.json` rather than through `npx` |
| R-6 | The line diff is an LCS; a large fully-reformatted file could cost O(n·m) time and memory | low | med | Common prefix/suffix trim first (which collapses the common case to a handful of lines), then a cell cap above which the whole differing middle is reported as one conservative hunk. The cap is documented where it lives | this slice | closed — `LCS_CELL_CAP` with the fallback, and the measured worst case in the tree is a 244-line differing region (`layout-editor.html`), four orders of magnitude under the cap |
| R-7 | Sonar's green badge is read as evidence about this slice | med | low | Recorded here, per #533's F-5: `sonar.sources=platform/src/main/java,frontend/src`, and this diff touches neither — every "new code" figure Sonar reports measures nothing about it. The guard's evidence is its `node --test` suite | this slice | closed as recorded — no action available, and the point is that none is mistaken for one |

## Open questions / Assumptions

- **Assumption:** the maintainer wants issue #615 option **1 (enforce), diff-scoped** rather than
  option 2 (delete `.prettierrc`). — *Owner:* this slice · *Resolves by:* phase 4 (recorded on the
  issue with the measurement that decides it).

### Resolved

- **Issue drift, found by the intake grill:** #615 lists four files as dirty at `5f415a23`, but
  `src/app/admin/admin-operators.ts` is **clean** — PR #520's own F-1 fixed it
  (`docs/plans/admin-suspend-audit-reason.md`), and the issue quotes a pre-#520 run. The other three
  are still dirty and the argument is unaffected; the tree-wide figure this plan uses (200 files) was
  measured fresh rather than taken from the issue.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `booking`, `availability`, or beach-map code is in scope;
the slice adds no write path to `availability(set_id, booking_date)` and no backend code at all.

## Spring Modulith — modules, interfaces, events

`N/A — no backend code in scope.` No module, `api/`/`spi/` port, domain event, or JDBC adapter is
touched; invariant #11 is not in play, and no Module-ownership table (§4a) is required — the slice
adds no application behaviour to any module.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; no Stripe, ledger, or commission code is touched.

## Angular — frontend surfaces touched

`N/A — no frontend surface.` `frontend/package.json` and `frontend/.prettierignore` are build
tooling; nothing under `frontend/src` or `frontend/e2e` changes, and no user-observable behaviour is
added (hence no e2e spec, and no `playwright-cli` row in the routing gate).

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire shape is touched.

## Execution status

**Stage pointer:** `PR` — all five phases built and locally verified; **no pull request exists yet**,
so the CI, Review and Sonar gates have not run and AC-9 is open.

**Next action:** Open the draft PR (`riviera-sdlc` rule 3 — CI fires on `pull_request` only), then
work the gates: CI → review via the `references/pr-gates.md` §1 ladder → Sonar issue list.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Shared git/diff helpers | ✅ | `133394a` |
| 1 — Detector core | ✅ | `75e64d7` |
| 2 — Prettier front-end, CLI, `--fix` | ✅ | `00d8576` |
| 3 — CI wiring, npm scripts, `.prettierignore` | ✅ | `5783195` |
| 4 — Docs sweep + close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix
touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet — the CI, review and Sonar gates have not run (no PR) | — |

**`riviera-docs-freshness` run** — range `origin/main...HEAD`, **5 findings, all patched**:

| Doc | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `CLAUDE.md`:106 | "**two** diff-scoped repo-hygiene checks", and a frontend job that runs "lint/test/build + e2e" | this slice makes three, and the third is a frontend-job step | patched — counts three, names where each runs, and records that both jobs are ruleset-required **by name** |
| `CLAUDE.md`:92 | the frontend command block listed `lint` / `test` / `test:a11y` / e2e / `build` | `format:check` now exists and CI runs it | patched |
| `.github/workflows/ci.yml`:174 | "no install step — **the guard** has no dependencies" | the job gates three suites now, and the newest guard *does* have a runtime dependency | patched — reworded as the constraint it actually is, so the next author does not add a top-level `import 'prettier'` |
| `.claude/skills/riviera-local-debug/SKILL.md`:103 | the frontend run recipe | same as `CLAUDE.md`:92 | patched |
| `docs/plans/ci-pipeline.md`:137 | "Since #533 that seventh context gates **two** diff-scoped hygiene guards" plus the reasoning about where a guard may live | a third guard now exists, deliberately in a different job | patched — a new paragraph stating the count, the placement, and that the context list is **still 7** |

> Checked and left alone: `riviera-java-conventions` and `riviera-plan-doc` cite their own guard by
> name and stay true; `riviera-frontend`, `riviera-tailwind` and `frontend/.claude/CLAUDE.md` state
> nothing about formatting; `README.md`'s CI sentence summarizes rather than enumerates, so it is
> incomplete, not false — and churning it is what Scope discipline forbids.

---

## File structure

> Held to the standard it ships. `node scripts/check-plan-file-structure.mjs --diff origin/main` is
> the check.

**New (6)**

- `scripts/git-diff.mjs` — the git/diff helpers the three guards share: `git()`, `rangeFor()`,
  `parseAddedLines()`, `changedPaths()`.
- `scripts/git-diff.test.mjs` — its `node --test` suite; inherits the parser cases the two existing
  suites owned.
- `scripts/check-prettier-format.mjs` — the new guard: pure detector, Prettier/git front-end, CLI.
- `scripts/check-prettier-format.test.mjs` — its `node --test` suite; owns AC-1…AC-8.
- `frontend/.prettierignore` — keeps `prettier --write .` off build output and the lockfile.
- `docs/plans/prettier-diff-scoped-enforcement.md` — this plan.

**Modified (9)**

- `frontend/package.json` — the `format` and `format:check` scripts issue #615 asks for.
- `.github/workflows/ci.yml` — `fetch-depth: 0` on the `frontend` job's checkout plus one new
  PR-only step running the guard; no job added, renamed, or removed.
- `scripts/check-inline-comments.mjs` — imports the extracted helpers instead of defining them.
- `scripts/check-inline-comments.test.mjs` — the moved parser cases removed.
- `scripts/check-plan-file-structure.mjs` — same extraction.
- `scripts/check-plan-file-structure.test.mjs` — the moved `changedPaths` cases removed.
- `.claude/skills/riviera-review-overlay/SKILL.md` — adds **RV-STYLE-2** (formatting is
  machine-checked; do not hand-flag it, and never ask for a whole-file reformat).
- `.claude/skills/riviera-local-debug/SKILL.md` — the frontend command block names
  `npm run format:check`.
- `CLAUDE.md` — the CI/CD paragraph counts the diff-scoped hygiene checks; there are now three, and
  the third is in a different job.
- `docs/plans/ci-pipeline.md` — the live pipeline description gains the frontend job's format step
  and the note that the required-context list is unchanged.

---

## Phase 0 — Shared git/diff helpers

**Files:** Create `scripts/git-diff.mjs` · Test `scripts/git-diff.test.mjs` · Modify
`scripts/check-inline-comments.mjs` · `scripts/check-inline-comments.test.mjs` ·
`scripts/check-plan-file-structure.mjs` · `scripts/check-plan-file-structure.test.mjs`

> This phase exists because #533's phase-2 audit row decided the duplication question conditionally:
> *"Revisit if a third guard appears, which is when the shared-module case actually earns itself."*
> This is the third guard. It ships as its own commit so the refactor of two merge-gating guards is
> reviewable apart from the feature riding on it.

- [ ] **Step 1: Write the failing test** — `scripts/git-diff.test.mjs` importing `parseAddedLines`
  and `changedPaths` from `./git-diff.mjs`, carrying the cases moved out of the two existing suites.
- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/git-diff.test.mjs` → FAIL with
  `Cannot find module … git-diff.mjs`
- [ ] **Step 3: Minimal implementation** — move `git()`, `rangeFor()`, `parseAddedLines()` and
  `changedPaths()` verbatim into the new module; both guards import them.
- [ ] **Step 4: Run it, verify it passes** — `node --test "scripts/*.test.mjs"` → all suites PASS,
  then `node scripts/check-inline-comments.mjs --diff origin/main` and
  `node scripts/check-plan-file-structure.mjs --diff origin/main` still behave.
- [ ] **Step 5: Generalization-audit pass** — record the extraction against #533's deferred decision.
- [ ] **Step 6: Commit** — `git commit -m "Extract the guards' shared git/diff helpers (#615)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Detector core

**Files:** Create `scripts/check-prettier-format.mjs` · Test `scripts/check-prettier-format.test.mjs`

- [ ] **Step 1: Write the failing test** — AC-1, AC-2, AC-3, AC-7 against
  `findMisformatted({ path, current, formatted, added })`, plus AC-4 against `inScope()`.

```js
test('pre-existing drift outside the added lines is not reported', () => {
  const findings = findMisformatted({
    path: 'frontend/src/a.ts',
    current: ["const a = 'x';", 'const b   =   2;', "const c = 'y';"],
    formatted: ["const a = 'x';", 'const b = 2;', "const c = 'y';"],
    added: new Set([1, 3]),
  });
  assert.deepEqual(findings, []);
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/check-prettier-format.test.mjs` →
  FAIL with `Cannot find module … check-prettier-format.mjs`
- [ ] **Step 3: Minimal implementation** — the line diff (common prefix/suffix trim, then LCS with a
  documented cell cap), hunk grouping, the added-line overlap rule, and `inScope(path)`.
- [ ] **Step 4: Run it, verify it passes** — `node --test scripts/check-prettier-format.test.mjs` →
  PASS
- [ ] **Step 5: Generalization-audit pass** — n/a for phase 1 (no bug fixed).
- [ ] **Step 6: Commit** — `git commit -m "Add the diff-scoped Prettier detector core (#615)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Prettier front-end, CLI, `--fix`

**Files:** Modify `scripts/check-prettier-format.mjs` · `scripts/check-prettier-format.test.mjs`

- [ ] **Step 1: Write the failing test** — AC-5 (`applyHunks` rewrites only the reported hunks) and
  AC-6 (an unparseable file warns rather than failing).
- [ ] **Step 2: Run it, verify it fails** — `node --test scripts/check-prettier-format.test.mjs` →
  FAIL with `applyHunks is not a function`
- [ ] **Step 3: Minimal implementation** — lazy Prettier resolution via `createRequire` against
  `frontend/package.json` (R-4), per-file `getFileInfo` + `resolveConfig` + `format`, repo-root
  anchoring via `git rev-parse --show-toplevel` so the CLI works from `frontend/` and from the root,
  the `--diff` / `--files` / `--fix` modes, and the report that prints both sides of each hunk.
- [ ] **Step 4: Run it, verify it passes** — the suite PASSes; then end-to-end by hand: a scratch
  commit that adds a misformatted line makes `--diff origin/main` exit 1 naming it, `--fix` clears it
  without touching the file's other drift, and the clean branch exits 0.
- [ ] **Step 5: Generalization-audit pass** — replay the guard over the last 40 `main` commits and
  count how often it would have fired; that number is R-1's evidence.
- [ ] **Step 6: Commit** — `git commit -m "Add the Prettier guard's front-end, CLI and --fix (#615)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — CI wiring, npm scripts, `.prettierignore`

**Files:** Modify `.github/workflows/ci.yml` · `frontend/package.json` · Create
`frontend/.prettierignore`

- [ ] **Step 1: Write the failing test** — no unit test; AC-9's signal is this PR's own run. The red
  state is `grep -c check-prettier-format .github/workflows/ci.yml` → `0`.
- [ ] **Step 2: Run it, verify it fails** — as above.
- [ ] **Step 3: Minimal implementation** — `fetch-depth: 0` on the `frontend` job's checkout (R-2);
  one step after `Lint`, carrying `if: ${{ !cancelled() && github.event_name == 'pull_request' }}`
  so a push to `main` skips it and one PR round trip surfaces both style gates; the `format` and
  `format:check` scripts; the ignore file.
- [ ] **Step 4: Run it, verify it passes** — `npm run format:check` from `frontend/` exits 0 on this
  branch, and the PR's run is green.
- [ ] **Step 5: Generalization-audit pass** — n/a (no bug fixed).
- [ ] **Step 6: Commit** — `git commit -m "Gate frontend formatting on the diff's own lines (#615)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Docs sweep + close-out

**Files:** Modify `CLAUDE.md` · `docs/plans/ci-pipeline.md` ·
`.claude/skills/riviera-review-overlay/SKILL.md` · `.claude/skills/riviera-local-debug/SKILL.md` ·
this plan

- [ ] **Step 1** — run `riviera-docs-freshness` over this PR's merge span. The counting sweep is the
  point: there are now **three** diff-scoped hygiene guards and the third is **not** in the
  `Repo hygiene (diff-scoped)` job, so both facts every such sentence states are candidates.
- [ ] **Step 2** — add RV-STYLE-2 to the review overlay (AC-10) and record the option-1 decision on
  issue #615 with the measurement behind it.
- [ ] **Step 3** — finalize Execution status, ACs, risk register; cite `merged via PR #NN`.
- [ ] **Step 4: Commit** — `git commit -m "Close out diff-scoped Prettier enforcement (#615)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | Phase 2 — the gate is about to bind every future frontend PR | How often the finished guard would have fired on work that already merged — R-1's evidence, measured rather than argued | Replayed the detector over the last **40** `main` commits (`git show <sha>:<path>` for each in-scope path with added lines, so history is judged as it stood) | **9 of 40** commits (22.5 %) would have failed: 5f415a2 (#612, the PR that raised the issue) 4 hunks, 7b2edca 1, e350e43 (#603, a large template slice) 40, b70171b 2, 5fce213 3, 03dcfe4 11, 9709fed 1, 3a77080 1, 8acf922 3 | **Accept and ship.** One frontend PR in four would need a `--fix` run, and every hunk it names is a line that PR itself wrote. The distribution is the reassuring part: seven of the nine are 1–4 hunks, and the two outliers are large slices that rewrote whole templates. The alternative measured for comparison — file-scoped — would have fired on essentially every one of the 40, since 200 of the tree's files are dirty |
| 2026-08-10 | Phase 0 — the third guard needs the same git glue | `git()`, `rangeFor()`, `parseAddedLines()`, `changedPaths()` across `scripts/check-*.mjs` | Read both guards side by side against #533's phase-2 audit row, which deferred this decision to "if a third guard appears" | Four helpers, duplicated or about to be: `git()` and `rangeFor()` in both guards, `parseAddedLines()` in `check-inline-comments.mjs` and needed here, `changedPaths()` in `check-plan-file-structure.mjs` | **Extracted** to `scripts/git-diff.mjs` — the condition #533 named has now occurred. Bodies moved verbatim; the one behavioural difference between the two `rangeFor`s (one returned `[range]`, the other `range`) is resolved in favour of the string, with the array wrap moved to its single caller. Both suites' cases for the moved functions moved with them, so `node --test "scripts/*.test.mjs"` counts the same 56 assertions before and after |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1…AC-8:** `node --test "scripts/*.test.mjs"` → **71 pass, 0 fail** (all three guards'
  suites; 15 of them this guard's, 3 the extracted helpers').
- [ ] **AC-9:** **not verified — no CI run exists yet.** `ci.yml` fires on the `pull_request` event
  only (#417), so this branch has had none. The wiring is verified as far as a diff can be: the
  workflow parses, the frontend job's step list carries `Format (diff-scoped Prettier, hard gate)`
  with `fetch-depth: 0` on its checkout, and every job `name:` is byte-for-byte unchanged. The
  remaining half — the step going red on a violation and green here, and the repo-hygiene job still
  running the new suite with no install — needs the PR's own run.
- [x] **AC-10:** `grep -c "RV-STYLE-2" .claude/skills/riviera-review-overlay/SKILL.md` → 1.

> Proven end-to-end by hand ahead of CI, which is the strongest evidence available without a run:
> against `frontend/src/app/admin/admin-venue-photos.ts` — prettier-dirty on `main` — a scratch
> misformatted line was reported **alone**, `--fix` rewrote it (`git diff --stat`: 1 insertion, 0
> deletions), the guard then exited 0, and `prettier --check` still exited 1 on the file. That last
> pair is the whole design in two exit codes: the lines this diff wrote are clean, the file is not,
> and only the first is the gate's business.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test — AC-9's verifier is a CI run, which
      has not happened yet (see above); every other AC is pinned by a passing `node --test` case.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — trivially held: no backend code.
- [x] **Availability** section justified `N/A` (invariant #2) — no app code.
- [x] Pool + cutoff rules (invariants #3, #4) — not in scope.
- [x] **Modulith** section justified `N/A` (invariant #11) — no module code.
- [x] **Payment/payout** section justified `N/A` (invariants #5, #8, #9).
- [x] Refund policy (invariant #10) — not in scope.
- [x] Timezone (invariant #6) — not in scope.
- [x] Booking codes (invariant #7) — not in scope.
- [x] Flyway (invariant #12) — no schema change, no version number claimed.
- [x] **Frontend** standards — `N/A`, no Angular surface.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; the one Open Question is the option-1 decision, which
      is answered by this slice's own measurement and is due to be recorded on issue #615.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN` — **cannot be, yet**: no pull
      request exists. This box is the merge close-out's, and it stays open until one does.
- [ ] **The review gate ran in full** — **it has not.** The gate is due at ready-for-review, and
      with no PR there is nothing to review against. Left unticked deliberately rather than
      substituting the overlay walk for it (`riviera-sdlc` rule 4).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
