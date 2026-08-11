# Guard CLI end-to-end coverage Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `scripts/check-*.mjs` guards' **git front-ends** a test harness that drives each
CLI end to end against a throwaway repository — exit code, stdout, stderr — so that reverting any
one of the five false-clean fixes PR #618 made turns a suite red instead of leaving 122 tests green.

**Architecture:** One dependency-free harness (`scripts/guard-cli-harness.mjs`) builds a real
repository with `mkdtemp` + `git init`, writes fixtures, commits them, and spawns the guard as a
**subprocess** with `cwd` inside it. A subprocess is the whole point: it is the only way to observe
an exit code, and it is also the only way to reset `git-diff.mjs`'s process-lifetime `repoRoot()`
cache — so each case gets a genuinely cold front-end rather than a mocked one.

**Persistence:** N/A — no backend, no database, no migration.

**Source of intent:** GitHub issue #619 (deferred from PR #618's review gate, finding G-8).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the issue's
premise had already expired: the guard whose Prettier dependency forced the harness out of the
hygiene job was retired three PRs ago, which settles scope bullet 4 the opposite way) ·
`riviera-plan-doc` (this template — forced the mutation-proof column in the AC table, which is what
turned "we added tests" into "we measured that each test can fail") · `tdd` (every case was written
against the *mutated* guard first: revert the fix, watch the case go red, restore it) ·
`riviera-review-overlay` (review gate — RV-CT items over the new suite, run inline; the
`/code-review` fan-out did not run, see the self-review checklist) ·
`riviera-docs-freshness` (**ran** over `origin/main..HEAD`, 1 finding — `ci.yml`'s test step said it
"globs both suites", written when there were two and true of neither five nor six; found by the
counting sweep, in a line the diff never went near) · `riviera-local-debug` (scoped runs — `node --test "scripts/*.test.mjs"`, never
the Gradle or Vitest suites, neither of which this slice touches).

> The routed table matched no other row: the slice adds no Java, no Angular, no SQL, no Flyway
> migration and no user-facing flow. `postgres` / `riviera-modulith` / `riviera-java-conventions` /
> `riviera-frontend` / `angular-developer` / `playwright-cli` / `riviera-stripe-payments` are all
> `N/A — repo tooling only, nothing under platform/ or frontend/src`.

**Branch:** `claude/issue-619-6zedet` — the cloud session's designated remote branch, standing in
for `feature/guard-cli-coverage` per `riviera-sdlc`'s remote-session addendum.

---

## Issue-intake grill (what the ticket got wrong)

The ticket is five days old and three of its statements no longer hold. Recorded here because two of
them change the work.

| # | The issue says | Today | Consequence |
|---|---|---|---|
| G-1 | the untested layer includes `formatterFor`, `check`, `applyToDisk` | those were `scripts/check-format.mjs`, the diff-scoped Prettier wrapper, **retired by #631 (PR #635)** — the tree is Prettier-clean and CI runs `npx prettier --check src e2e` bare | that guard is gone; nothing to cover |
| G-2 | "a real harness … needs Prettier for the third guard, so it cannot live in that job" — hence scope bullet 4, "decide where it runs" | with #635 landed, **no** remaining guard imports anything outside `node:`, and the harness itself is `node:test` + `node:child_process` + `node:fs` + `node:os` + `node:path` | the decision inverts: the suite belongs in `Repo hygiene (diff-scoped)`, whose `node --test "scripts/*.test.mjs"` step already globs it. **No `ci.yml` edit at all** |
| G-3 | "all three `scripts/check-*.mjs` guards" / "78 tests" | there are **four** (`check-comment-only.mjs` is a fourth, manual, with its own unpinned git front-end), and the suites are at **122** | `check-comment-only.mjs`'s CLI is in scope too |

**Why G-2 is the better answer and not just the cheaper one.** `Repo hygiene (diff-scoped)` is a
required status-check **context by name** in the `Riviera Rule Set`; a brand-new job would report
without blocking until a maintainer edited the ruleset (#534's lesson, and #413/#420's before it).
It already checks out with `fetch-depth: 0` and sets Node up from `.nvmrc`. Putting a *merge-gate*
suite behind an `npm ci` that exists for a different reason would also make the guards' green
contingent on the frontend's dependency tree, which is precisely the coupling that job's
"no install step" constraint exists to prevent.

## Acceptance criteria (testable)

Every AC below is pinned by a case in `scripts/guard-cli.test.mjs` that drives a **CLI**, and every
regression AC carries a **mutation proof**: the named edit to the guard under test makes that case
fail, recorded in the Mutation ledger at the bottom.

- [x] **AC-1:** Given a throwaway repository whose diff adds a two-line inline comment, when
  `check-inline-comments.mjs --diff <base>` is run as a subprocess, then it exits **1** and stderr
  names `frontend/src/app/<file>:2-3` plus the RV-STYLE-1 advice; and given a diff that adds none,
  it exits **0** and writes nothing. *Pinned by:* `guard-cli.test.mjs` › `--diff fails on a
  two-line inline comment the diff added` / `--diff is silent on a clean diff`.
- [x] **AC-2 (false-clean #1 — cwd pathspec):** Given a violation in the **working tree** and a
  process whose cwd is a subdirectory, when `--files ../frontend/src/app/a.ts` runs, then it exits
  **1**. *Pinned by:* `--files resolves its arguments from the repo root, not the caller's cwd`.
  *Mutation:* make `git()` inherit the caller's cwd → the guard exits 0.
- [x] **AC-3 (false-clean #2 — `diff.relative`):** Given `diff.relative=true` in the repository's
  own config and a process whose cwd is a subdirectory, when `--diff <base>` runs, then it exits
  **1** and reports the **full** repo-relative path. *Pinned by:* `a contributor's diff.relative
  cannot make the guard report clean`.
- [x] **AC-4 (false-clean #3 — prefix re-spelling):** Given `diff.mnemonicPrefix=true`, and
  separately `diff.noprefix=true`, when `--diff <base>` runs, then it exits **1** in both.
  *Pinned by:* `a re-spelled diff prefix cannot make the guard report clean` (one case per key).
  *Mutation:* drop `PIN` from `git-diff.mjs` → the `mnemonicPrefix` case exits 0.
- [x] **AC-5 (false-clean #4 — C-quoted path):** Given a file whose path holds a non-ASCII byte,
  when `check-inline-comments.mjs --diff` runs, then it exits **1** naming the path **unquoted**;
  and when `check-plan-file-structure.mjs --diff` runs over a diff that adds it with no plan-doc
  entry, then it exits **1** naming the same raw path (proving the `-z` name-only front-end, #538).
  *Pinned by:* `a non-ASCII path is still read by the hunk front-end` / `… by the name-only
  front-end`. *Mutation:* drop `core.quotepath=false` from `PIN` → the first exits 0.
- [x] **AC-6 (false-clean #5 — `++ ` read as `+++`):** Given a diff that adds a line whose content
  begins with `++ ` **and**, after it in the same file, a two-line inline comment, when `--diff`
  runs, then it exits **1** and reports the comment against the real file. *Pinned by:* `an added
  line beginning with "++ " does not re-target the lines after it`. *Mutation:* drop the
  `next === 0 &&` guard in `parseAddedLines` → exits 0.
- [x] **AC-7 (`--files`, the undocumented mode):** `check-focus-posture.mjs --files <path>` judges
  the named file **whole**, so it exits 1 on a **committed** violation (the #618/H-11 contract),
  while `check-inline-comments.mjs --files <path>` is scoped to what the working tree adds against
  `HEAD`, so it exits 0 on the same committed file. *Pinned by:* `--files judges a committed file
  whole (focus posture)` / `--files is scoped to the working tree (inline comments)`.
- [x] **AC-8 (`--hook`):** Given a `PostToolUse` payload on stdin naming a file with a violation,
  when `--hook` runs, then it exits **0** and stdout parses as JSON carrying
  `hookSpecificOutput.hookEventName === 'PostToolUse'` and the violation in `additionalContext`;
  given a payload naming an out-of-scope file, it exits 0 and writes nothing. *Pinned by:* `--hook
  answers a PostToolUse payload with advisory JSON` (both guards).
- [x] **AC-9 (loud failure):** An unknown mode, and a missing mode, exit **2** with the usage line on
  stderr; and an unresolvable `--diff` base exits **non-zero with output** rather than reporting
  clean. *Pinned by:* `an unknown mode exits 2 with usage` / `an unresolvable base fails loudly
  rather than clean`.
- [x] **AC-10 (focus posture's split verdict):** `--diff` over an added BUSY-1 binding exits **1**
  with `[BUSY-1]` on **stderr**; over a FOCUS-1-only diff it exits **0** with `advisory, not
  gating` on **stdout**; `--all` exits **0** and prints a per-rule count line. *Pinned by:* `--diff
  gates on BUSY-1` / `--diff only advises on FOCUS-1` / `--all reports without gating`.
- [x] **AC-11 (plan file structure):** `--diff` exits **1** naming a changed path the plan doc's
  `## File structure` section omits; exits **0** when the section lists it; exits **0** when the
  diff carries no plan doc at all. *Pinned by:* three cases under `check-plan-file-structure`.
- [x] **AC-12 (comment-only):** `check-comment-only.mjs <base>` exits **1** naming the file when a
  diff changes code, exits **0** with the verified-count line when it changes only comments, and
  reports the count it **skipped** for an unsupported extension. *Pinned by:* three cases under
  `check-comment-only`.
- [x] **AC-13 (the defect this coverage found):** Given a TypeScript file whose inline Angular
  template is opened by a backtick that is the **last character of its line** — the shape 44 files
  under `frontend/src/app` are written in — when a two-line inline comment is added after it, then
  `check-inline-comments.mjs` reports it. *Pinned by:* `check-inline-comments.test.mjs` › `a
  template literal opened at end of line does not invert the scanner` **and** `guard-cli.test.mjs`
  › `an inline Angular template does not hide a later comment`.
- [x] **AC-14 (where it runs):** The whole suite passes with **no `node_modules` reachable** and is
  collected by the existing `node --test "scripts/*.test.mjs"` step, so `ci.yml` is unchanged.
  *Verified by:* running the suite from a scratch cwd with the repo's `node_modules` absent from the
  resolution path, and by the green `Repo hygiene (diff-scoped)` job on this PR.

## Non-goals

- **Changing what any guard checks** — no rule is added, widened or narrowed. The one guard edit in
  this slice (AC-13) fixes a *scanner* that mis-reads TypeScript; it does not change the rule.
- **Fixing `check-plan-file-structure.mjs`'s non-ASCII token grammar.** `PATH_LIKE` / `DIR_LIKE` are
  built on `\w`, so `` `frontend/src/app/café.ts` `` can never be *listed* — the guard is
  unsatisfiable for such a path. That is a token-grammar change, i.e. exactly what this slice's
  non-goal excludes, and no such path exists in the tree. Filed as a follow-up (see Open questions).
- **Hardening `check-comment-only.mjs`'s git front-end.** It pins none of the three config settings
  and reads the new side cwd-relatively. Its CLI gets coverage for its documented contract (run from
  the repo root); the hardening is a behaviour change, deferred with the item above.
- Porting the existing pure-detector suites to the harness. They are fast, focused, and testing a
  different thing.

## Behavior-parity ledger

`N/A — new coverage, replaces nothing.` The existing suites are kept verbatim; the one guard line
this slice changes is covered by a new RED-first unit test alongside them.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The harness passes for the wrong reason** — a case that would go green against a broken guard is worse than no case, because it certifies the very layer it cannot see | med | high | every regression AC carries a **mutation proof**: revert the fix, watch the case fail, restore. Recorded in the Mutation ledger with the exact edit | Ivo | open |
| R-2 | A developer's **global git config** (`diff.relative`, `commit.gpgsign`, a template dir) leaks into the throwaway repo and makes the suite pass or fail for a reason the test never states | med | med | the harness points `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` at an empty file inside the temp dir for **every** git call *and* for the spawned guard, so only config the case sets itself is in play | Ivo | closed — `environment()` in `guard-cli-harness.mjs`; the identity and commit dates are pinned there too |
| R-3 | The suite is slow enough that `Repo hygiene (diff-scoped)` stops being the sub-minute job whose speed is why it has no install step | med | med | one repo per case, built with ~5 git invocations; measure the wall clock before and after and record it here. Budget: the whole `scripts/*.test.mjs` step stays well under a minute | Ivo | closed — **0.21 s → 2.91 s** for 154 tests, against a job whose observed green is under a minute |
| R-4 | Temp repositories leak on a failing assertion and fill the runner's disk | low | low | creation and teardown bracket each case in `try`/`finally`, under the OS temp dir | Ivo | closed — `withRepo` disposes in a `finally`, and every case goes through it |
| R-5 | `git init` defaults differ across versions/platforms (`master` vs `main`, hooks, templates) and the suite reads as flaky | low | med | `--initial-branch=main` is passed explicitly and no case depends on a branch **name** — every base is a captured SHA | Ivo | closed — the one case that needs a branch creates it itself (`checkout -b feature`) rather than assuming the default's name |
| R-6 | The AC-13 fix is a one-character-class change in a **gating** guard, so getting it wrong turns a false clean into a false red on the whole tree | low | high | after the fix, re-run every existing suite **and** sweep the standing tree: the guard must still report zero over `git ls-files` for `frontend/src` and `platform/src` | Ivo | closed — the sweep newly reports 15 pre-existing comments across 10 files and stops reporting 0; the gate is diff-scoped, so no build changes colour |

## Open questions / Assumptions

None open.

### Resolved

- **Open question:** should `check-plan-file-structure.mjs`'s token grammar and
  `check-comment-only.mjs`'s git front-end be hardened now or as a follow-up? — **follow-up**, filed
  as issue #641. Both are behaviour changes to a guard, which #619 scopes out, and neither is
  reachable by the tree as it stands: no tracked path holds a non-ASCII byte, and
  `check-comment-only.mjs` is a by-hand review tool rather than a merge gate. Resolved at `efcf0ae`.
- **Assumption:** the `Repo hygiene (diff-scoped)` runner has `git` on `PATH` and a writable OS temp
  dir — confirmed by this PR's green run of that job; its other four steps are git invocations.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice adds no runtime code: nothing under `platform/` or
`frontend/src` changes, so no channel writes `availability(set_id, booking_date)`.

## Spring Modulith — modules, interfaces, events

`N/A — no backend code in scope.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.`

## Angular — frontend surfaces touched

`N/A — no frontend surface in scope.` The slice touches `scripts/` only; the fixtures it writes are
Angular-shaped strings inside a throwaway repository, never files under `frontend/src`.

## FE↔BE contract

`N/A — no contract change.`

## Execution status

**Stage pointer:** `merge close-out`

**Next action:** none — merged via PR #640. The two deferred guard defects are tracked by issue #641.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The harness + the first CLI case (RED → GREEN) | ✅ | `efcf0ae` |
| 1 — The five false-clean regressions, each mutation-proved | ✅ | `efcf0ae` |
| 2 — Mode coverage: `--files`, `--hook`, `--all`, usage, loud failure | ✅ | `efcf0ae` |
| 3 — The other three guards' CLIs | ✅ | `efcf0ae` |
| 4 — AC-13: the template-literal scan defect the coverage found | ✅ | `efcf0ae` |
| 5 — Close-out: docs freshness, timings, mutation ledger | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | plan-stage grill (this doc) | the issue's CI-shape question was settled the other way by #635 | closed — no `ci.yml` change; rationale under *Issue-intake grill* |
| F-2 | harness spike (phase 0) | `check-inline-comments.mjs` reads a backtick that **opens** a template literal at end of line as one that closes it, inverting the scanner for the rest of the file — 44 files under `frontend/src/app` are written that way | fixed — AC-13 |
| F-3 | plan-stage spike | `check-plan-file-structure.mjs` cannot be *satisfied* for a non-ASCII path: `PATH_LIKE`/`DIR_LIKE` are `\w`-based, so the token never matches | deferred → issue #641 (token grammar = the slice's non-goal) |
| F-4 | plan-stage spike | `check-comment-only.mjs` pins none of the three git config settings and reads the new side cwd-relatively — the same false-clean class #618 fixed in the other three | deferred → issue #641 |
| F-5 | `riviera-docs-freshness` (close-out) | `ci.yml`'s guard-suite step said it "globs **both** suites" — written at two, false at five and at six | fixed in this commit |
| F-6 | `riviera-review-overlay` (inline; the `/code-review` fan-out did not run — see the self-review checklist) | the harness returned an unused `env` field and bound the object to a local only to return it; `git(args, cwd = root)` advertised a subdirectory parameter no case used | fixed in this commit — RV-STYLE-1 and RV-STYLE-2 are clean (`scripts/` resolves no Prettier config), RV-PROC-1 re-walked against the final diff, and the RV-BE/RV-FE banks are out of scope: the diff touches no Java, no `frontend/src`, and no wire shape |

---

## File structure

- `docs/plans/guard-cli-coverage.md` — this plan.
- `scripts/guard-cli-harness.mjs` — new: builds a throwaway repository and spawns a guard's CLI in
  it. Dependency-free (`node:` only), so it runs in the install-less hygiene job.
- `scripts/guard-cli.test.mjs` — new: the end-to-end suite, one case per AC.
- `scripts/check-inline-comments.mjs` — modified: the AC-13 scanner fix (one condition).
- `scripts/check-inline-comments.test.mjs` — modified: the RED-first unit case for AC-13.
- `.github/workflows/ci.yml` — modified: **one comment line**, the `riviera-docs-freshness` finding.
  "Globs both suites" was written when there were two and the tree now holds six; the job's steps,
  names and commands are untouched.

---

## Phase 0 — The harness, and the first CLI case

**Files:** Create `scripts/guard-cli-harness.mjs` · Create `scripts/guard-cli.test.mjs`

- [x] **Step 1: Write the failing test** — a case that runs `check-inline-comments.mjs --diff` in a
  throwaway repo and expects exit 1. It fails first because the harness does not exist.
- [x] **Step 2: Run it, verify it fails** — `node --test "scripts/guard-cli.test.mjs"` → FAIL
  (`Cannot find module … guard-cli-harness.mjs`).
- [x] **Step 3: Minimal implementation** — `createRepo()` returning `{ root, git, write, remove,
  commit, run, dispose }`; `run` spawns `process.execPath` with the guard's absolute path and the
  temp root as cwd, and returns `{ status, stdout, stderr }`.
- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit.**
- [x] **Step 7: Update plan-doc execution status.**

## Phase 1 — The five false-clean regressions

**Files:** Modify `scripts/guard-cli.test.mjs`

One case per AC-2…AC-6. Each is written, run RED against the **mutated** guard (the exact edit named
in the AC), then run GREEN against the restored one, and the pair is recorded in the Mutation ledger.

## Phase 2 — Mode coverage

**Files:** Modify `scripts/guard-cli.test.mjs`

AC-7 (`--files`, both contracts), AC-8 (`--hook`, both guards), AC-9 (usage + loud failure).

## Phase 3 — The other three guards' CLIs

**Files:** Modify `scripts/guard-cli.test.mjs`

AC-10 (focus posture's gate/advise split and `--all`), AC-11 (plan file structure), AC-12
(comment-only).

## Phase 4 — The defect the coverage found

**Files:** Modify `scripts/check-inline-comments.test.mjs` · Modify `scripts/check-inline-comments.mjs`

- [x] **Step 1:** the RED unit case — a backtick-terminated line followed by a two-line comment.
- [x] **Step 2:** run → FAIL (0 violations).
- [x] **Step 3:** decide the template-open condition from the **start** offset rather than the
  character before the returned index, which is the opening backtick itself when it is last on the
  line.
- [x] **Step 4:** run the full `scripts/*.test.mjs` → PASS, and sweep the standing tree for R-6.

## Phase 5 — Close-out

`riviera-docs-freshness` over the branch range; wall-clock before/after for R-3; the Mutation ledger
filled in; the follow-up issue filed for F-3/F-4.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 4 (F-2 fix) | other places a scanner decides "did this delimiter close?" from the character *before* the returned index, where that character can be the delimiter that opened it | read every `skipString` / `stringEnd` caller in `check-inline-comments.mjs` and `check-focus-posture.mjs` | 3 call sites — `scan`'s open branch (the defect), `scan`'s `inTemplate` re-entry branch, and `check-focus-posture.mjs`'s `stringEnd` | only the first is reachable: the `inTemplate` branch starts at the line's own offset, never at a delimiter it just consumed, and `stringEnd` returns the index of the terminator itself rather than one past it. Fixed the one, added the unit case, left the other two |

---

## Acceptance-criteria verification (final)

One command covers AC-1…AC-13, since every case lives under the glob CI runs:

```
$ node --test "scripts/*.test.mjs"
ℹ tests 154   ℹ pass 154   ℹ fail 0   ℹ duration_ms 2876
```

122 of those existed before the slice; the 32 new ones are the 29 CLI cases in
`guard-cli.test.mjs` plus 3 unit cases in `check-inline-comments.test.mjs` (2 for AC-13 and its
over-correction guard, and the existing suite unchanged otherwise). Verified at `efcf0ae`.

- **AC-2…AC-6, AC-13** additionally carry a recorded RED run — the Mutation ledger above.
- **AC-14 (where it runs):** the new files import `node:test`, `node:assert/strict`,
  `node:child_process`, `node:fs`, `node:os`, `node:path` and `./guard-cli-harness.mjs` — nothing
  else, so the `Repo hygiene (diff-scoped)` job's no-install constraint holds. `ci.yml`'s only edit
  is a comment. Wall clock for the whole step: **0.21 s → 2.91 s**, against a job whose observed
  green is well under a minute and whose cap is 10.
- **R-6 (the AC-13 fix cannot turn the tree red):** judging every tracked file under
  `frontend/src`, `platform/src` and `scripts` with the diff scoping lifted, the fix newly reports
  **15** comments across **10** files and stops reporting **0**. All 15 are pre-existing, and the
  gate is diff-scoped, so no build changes colour — the fix strictly widens what a *diff* can be
  caught on. The three CI guards all exit 0 over `origin/main..HEAD`.

## Docs-freshness run (close-out step 5)

Range `origin/main..HEAD`. **1 finding, patched:**

- `.github/workflows/ci.yml:209` — stated "Globs **both** suites", written when there were two;
  the tree held five before this slice and six after. Contradicted by the counting sweep, not by
  the diff — the line is in a file the slice otherwise never touches, which is exactly why step 2b
  exists. Patched to name what actually runs under the glob.

Checked and unchanged: `CLAUDE.md`'s CI paragraph ("the three diff-scoped checks share the
`Repo hygiene (diff-scoped)` job" — still three; this slice adds no check), `frontend/.claude/CLAUDE.md`
(which already documents `--files` for both guards, so the issue's "undocumented in CLAUDE.md" is a
third expired premise), `CONTEXT.md`, `RESPONSIBILITIES.md`, `docs/adr/`, `docs/agents/`, and the
`riviera-*` skills. `riviera-sdlc`'s "the two suites" is the Playwright e2e split — a different
subject, still true.

## Mutation ledger (R-1)

The proof each regression case can fail. Each row was run against the committed tree at `efcf0ae`:
apply the revert, `node --test "scripts/*.test.mjs"`, `git checkout -- scripts/`.

| AC | The revert | Cases that go RED | Restored |
|---|---|---|---|
| AC-2 | `git-diff.mjs` — `run` no longer passes `cwd`, so git inherits the caller's | `--files resolves its arguments from the repo root, not the cwd` | ✅ 153 pass / 1 fail |
| AC-3 | `git-diff.mjs` — **both** legs at once: `--no-relative` out of `diffArgs` **and** `cwd` out of `run` | `a contributor diff.relative cannot make the guard report clean` (+ 2 others) | ✅ 151 pass / 3 fail |
| AC-4 | `git-diff.mjs` — `PIN` emptied | `diff.mnemonicPrefix cannot make the guard report clean`; `a non-ASCII path is still read by the hunk front-end` | ✅ 152 pass / 2 fail |
| AC-5a | `git-diff.mjs` — only `core.quotepath=false` dropped from `PIN` | `a non-ASCII path is still read by the hunk front-end` | ✅ 153 pass / 1 fail |
| AC-5b | `git-diff.mjs` — `-z` dropped from `nameOnlyArgs` | `a non-ASCII path is reported raw by the name-only front-end`; `--diff fails on a changed path the plan doc omits` | ✅ 151 pass / 3 fail |
| AC-6 | `git-diff.mjs` — `next === 0 &&` dropped from `parseAddedLines` | `an added "++ " line does not re-target the lines after it` | ✅ 152 pass / 2 fail |
| AC-13 | `check-inline-comments.mjs` — `line[c - 1] !== '\`'` restored as the sole open condition | `a template literal opened at end of line does not invert the scanner`; `an inline Angular template does not hide a later comment` | ✅ 152 pass / 2 fail |

**AC-3 is the honest row.** Two independent mechanisms defeat `diff.relative` — running git from
`repoRoot()` and pinning `--no-relative` — so reverting either alone leaves the case green, and only
reverting both turns it red. That is defence in depth working as intended; the case pins the
*behaviour* rather than one of its two causes, which is the property that survives either fix being
refactored away.

**One mutation initially read as a miss and was the ledger's own first catch:** AC-6's revert was
first applied to `check-inline-comments.mjs`, where `parseAddedLines` does not live, so nothing
changed and the case "survived". Re-applied to `git-diff.mjs` it went red immediately. Recorded
because a mutation run that silently no-ops is indistinguishable from a weak test — the failure mode
this ledger exists to expose, arriving first in the ledger itself.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Every regression AC has a filled Mutation-ledger row — a case never observed failing is not
      coverage, it is decoration (R-1).
- [x] **No JPA** introduced (invariant #1) — trivially, no Java in scope.
- [x] **Availability** section justified N/A (invariants #2, #3, #4).
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9, #10).
- [x] The suite imports nothing outside `node:` — the `Repo hygiene (diff-scoped)` constraint.
- [x] `ci.yml` gains **one comment line** (the docs-freshness finding) and no step, name or command;
      the new suite is collected by the existing glob.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #640`.
- [ ] **The review gate ran in full** — **left unticked deliberately.** `riviera-review-overlay`
      ran over the diff (RV-CT/RV-STYLE bank items; findings below), but the `/code-review`
      subagent fan-out at the top of the `references/pr-gates.md` §1 ladder did **not**: this
      session is directed not to spawn agents. The overlay alone is not the review, so the box
      stays unticked and PR #640 says so rather than claiming a gate that did not run.
