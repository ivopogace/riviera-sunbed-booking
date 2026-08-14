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
counting sweep, in a line the diff never went near; re-run after AC-15 landed, 2 further findings —
the "diff-scoped, always" claim in `frontend/.claude/CLAUDE.md` and `riviera-java-conventions` §6c,
both patched) · `riviera-local-debug` (scoped runs — `node --test "scripts/*.test.mjs"`, never
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
- [x] **AC-15 (the second defect the coverage found):** Given a file git has never seen, when
  `check-inline-comments.mjs --files` or `--hook` runs over it, then the violations it holds are
  reported — while a **tracked** file stays diff-scoped, so a committed file's pre-existing comments
  are never surfaced. *Pinned by:* `--files judges a file git has never seen`, `--hook judges a file
  git has never seen`, `--files reports a tracked and an untracked path in one call`, against the
  standing `--files is scoped to what the working tree adds against HEAD`.
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

**Next action:** none. Merged via PR #640; the one deferred defect that survived scrutiny closed via
PR #642, and the sixth false clean in this layer via PR #662 — see the two *Follow-up* sections below.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The harness + the first CLI case (RED → GREEN) | ✅ | `efcf0ae` |
| 1 — The five false-clean regressions, each mutation-proved | ✅ | `efcf0ae` |
| 2 — Mode coverage: `--files`, `--hook`, `--all`, usage, loud failure | ✅ | `efcf0ae` |
| 3 — The other three guards' CLIs | ✅ | `efcf0ae` |
| 4 — AC-13: the template-literal scan defect the coverage found | ✅ | `efcf0ae` |
| 5 — Close-out: docs freshness, timings, mutation ledger | ✅ | `86f93d8` |
| 6 — AC-15: the untracked-file gap the redundancy question surfaced | ✅ | `02688cf`, `5b45bd8` |
| 7 — #654: the same gap in the plan-doc guard, which had no `--files` half to close it | ✅ | `7663f76`, `b582223`, `+ review round 2` (PR #662) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | plan-stage grill (this doc) | the issue's CI-shape question was settled the other way by #635 | closed — no `ci.yml` change; rationale under *Issue-intake grill* |
| F-2 | harness spike (phase 0) | `check-inline-comments.mjs` reads a backtick that **opens** a template literal at end of line as one that closes it, inverting the scanner for the rest of the file — 44 files under `frontend/src/app` are written that way | fixed — AC-13 |
| F-3 | plan-stage spike | `check-plan-file-structure.mjs` cannot be *satisfied* for a non-ASCII path: `PATH_LIKE`/`DIR_LIKE` are `\w`-based, so the token never matches | **withdrawn — the finding was wrong.** Only the literal path token fails; `frontend/src/app/venue/`, `frontend/src/app/**/*.ts` and `frontend/src/app/venue/*.ts` all satisfy the guard for `café.ts`. Tested when #641 was re-scoped |
| F-4 | plan-stage spike | `check-comment-only.mjs` pins none of the three git config settings and reads the new side cwd-relatively — the same false-clean class #618 fixed in the other three | fixed — issue #641, PR #642. Mutation rows in *Follow-up*, below |
| F-5 | `riviera-docs-freshness` (close-out) | `ci.yml`'s guard-suite step said it "globs **both** suites" — written at two, false at five and at six | fixed in `86f93d8` |
| F-6 | `riviera-review-overlay` (inline; the `/code-review` fan-out did not run — see the self-review checklist) | the harness returned an unused `env` field and bound the object to a local only to return it; `git(args, cwd = root)` advertised a subdirectory parameter no case used | fixed in `86f93d8` — RV-STYLE-1 and RV-STYLE-2 are clean (`scripts/` resolves no Prettier config), RV-PROC-1 re-walked against the final diff, and the RV-BE/RV-FE banks are out of scope: the diff touches no Java, no `frontend/src`, and no wire shape |
| F-7 | post-merge-readiness question from the maintainer: *are these guards redundant now that Prettier and type-aware ESLint are in place?* | **No** — probed rather than argued: 128 enabled ESLint rules, of which the only comment-related two are `ban-ts-comment`/`ban-tslint-comment` and none touch focus posture; `eslint` and `prettier --check` both exit 0 on a file carrying BUSY-1 + FOCUS-1 + a multi-line inline comment that both guards catch. Chasing it surfaced a real gap: this guard's `--hook`/`--files` were diff-against-`HEAD`, so a file git had **never seen** read clean — the commonest way a violation enters the tree, and the gap `check-focus-posture` closed in #618 | fixed — AC-15, `02688cf`; the three substrate sentences it falsified patched in `5b45bd8` |
| F-8 | field use, during PR #652 | `check-plan-file-structure --diff` reports clean for a path the slice **adds** but has not staged — `git diff` cannot see an untracked file, so the guard false-cleaned in the one case it exists for. AC-15's fix covered the sibling guards' `--files`/`--hook` halves; this guard has no such half, so nothing closed it here | fixed — issue #654, PR #662. Mutation rows in *Follow-up — #654 / PR #662*, below |

---

## File structure

- `docs/plans/guard-cli-coverage.md` — this plan.
- `scripts/guard-cli-harness.mjs` — new: builds a throwaway repository and spawns a guard's CLI in
  it. Dependency-free (`node:` only), so it runs in the install-less hygiene job.
- `scripts/guard-cli.test.mjs` — new: the end-to-end suite, one case per AC.
- `scripts/check-inline-comments.mjs` — modified: the AC-13 scanner fix (one condition).
- `scripts/check-inline-comments.test.mjs` — modified: the RED-first unit case for AC-13.
- `scripts/check-comment-only.mjs` — modified by the **follow-up** (#641 / PR #642, see *Follow-up*
  below), which routes its git calls and reads through `git-diff.mjs` and tallies verifications
  instead of deriving the count. Listed here because that PR edits this plan doc, which puts both
  in one diff and so under this section's guard.
- `scripts/git-diff.mjs` · `scripts/check-plan-file-structure.mjs` · `scripts/git-diff.test.mjs` —
  modified by the **#654 follow-up** (see *Follow-up — #654 / PR #662* below): `untrackedArgs()` /
  `untrackedPaths()` join the shared helper and the plan-doc guard unions the untracked tree into the
  paths it **judges** — while `planDocsIn` and `usable`'s floor stay on the diff, which is the seam
  the review round put there. Listed here for the same reason `check-comment-only.mjs` is — that work
  edits this plan doc, which puts every path in one diff and so under this section's own guard.
- `CLAUDE.md` — modified by the follow-up's docs-freshness pass: the CI bullet classed all four
  hygiene guards as diff-scoped, which #654 makes false for the plan-doc one.
- `frontend/.claude/CLAUDE.md` · `.claude/skills/riviera-java-conventions/SKILL.md` — modified: both
  stated the inline-comment guard is "diff-scoped, always", which AC-15 makes false for an untracked
  file. Same sentence in two places, both patched.
- `.claude/skills/riviera-plan-doc/SKILL.md` · `.claude/skills/riviera-plan-doc/references/plan-doc-template.md`
  — modified by the follow-up: the generalization audit must enumerate its population by **mechanism**,
  not by resemblance. The rule this slice's own history produced; see *Follow-up*.
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

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase 4 (F-2 fix) | every caller that decides "did this delimiter close?" from the character *before* the returned index, where that character can be the delimiter that opened it | read every `skipString` / `stringEnd` caller in `check-inline-comments.mjs` and `check-focus-posture.mjs` | 3 call sites — `scan`'s open branch (the defect), `scan`'s `inTemplate` re-entry branch, and `check-focus-posture.mjs`'s `stringEnd` | only the first is reachable: the `inTemplate` branch starts at the line's own offset, never at a delimiter it just consumed, and `stringEnd` returns the index of the terminator itself rather than one past it. Fixed the one, added the unit case, left the other two |

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
| AC-15 | `check-inline-comments.mjs` — `--hook`/`--files` back to `check(['HEAD', '--', …paths], paths)` | all three AC-15 cases | ✅ 154 pass / 3 fail |
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

## Follow-up — #641 / PR #642

The slice deferred two findings. Re-tested before implementing either, only one survived: F-3 was
simply wrong (three token spellings satisfy the guard), so #641 was rewritten down to F-4 alone.

PR #642 routes `check-comment-only.mjs`'s git calls and reads through `git-diff.mjs`, and replaces
the derived success count with a tally of actual comparisons — the derivation was what turned a read
failure into "verified code-identical". Its two cases extend this slice's ledger, same discipline:

| AC | The revert | Case that goes RED | Restored |
|---|---|---|---|
| #642 AC-1 | `check-comment-only.mjs` — restore its private `git()` and cwd-relative `readFileSync(path)` | `check-comment-only resolves paths from the repo root, not the caller cwd` | ✅ 158 pass / 1 fail |
| #642 AC-2 | `check-comment-only.mjs` — restore the three reference points: file list from `${base}...HEAD` and before side from `show(base, …)` | `judges against the merge base, not a base that has moved`; `inspects a code change that is only in the working tree` | ✅ 158 pass / 2 fail |

**Raised by #642's review gate, then fixed there.** The guard mixed three reference points — the file
list from `merge-base(base,HEAD)...HEAD`, the *before* side from the literal `base` **tip** via
`git show`, and the *after* side from the working tree — where the three sibling guards collapse onto
one `mergeBase()`-resolved commit (#618). Reproduced: a comment-only branch reported
**`Not comment-only`** once `main` gained an unrelated code change to the same file. It now judges
from one commit on both sides, which also closes a second hole the split created — a code change
living only in the working tree was never listed, because the list came from committed history while
the content came from disk.

**What that cost, recorded because it is a real trade:** with the list taken against the working tree,
`--diff-filter=M` guarantees both sides of every listed path exist, so the `unreadable` branch is now
unreachable by construction. It is kept as a fail-closed backstop and says so in a comment, but its
dedicated CLI case was **removed rather than left passing vacuously** — a case that can no longer go
red is the decoration this ledger exists to prevent. The two cases above replace it and cover more.

**Why it was in scope after all.** It was first recorded as a separate axis, on the grounds that #641
was scoped to the cwd/pin/quoting one. That reasoning was thin: `mergeBase` is the fifth export of the
module this PR was already importing four things from, the fix is three lines, and treating it as
separate would have repeated the exact framing error that let this whole guard be missed for eight
PRs — see below.

**The rule that came out of it, and the sweep that validated it.** `riviera-plan-doc` now requires the
generalization audit to enumerate its population by **mechanism** rather than resemblance, with the
recorded search command being the one that *found* the population. Run that way here for the first
time — `git ls-files 'scripts/*.mjs' | xargs grep -l "execFileSync('git'|from './git-diff.mjs'"` —
the population is **six**: the four guards, the shared helper, and its test. All four guards now hold
zero private `git()` calls and zero path-taking `readFileSync`; the only two raw reads left are
`readFileSync(0, …)` on **stdin** for `--hook`, which take no path and so cannot drift with cwd. First
time this population has been uniform.

**The framing error worth keeping.** `check-comment-only.mjs` was not known-and-dropped before #619;
it was never enumerated. PR #618's plan doc — which fixed all five false cleans in this layer — does
not mention it once, and its generalization-audit log asks twice whether a defect is "true of the
other two guards as well", answering "all three" both times. The population was set by resemblance
(*the diff-scoped guards*, which is what `git-diff.mjs` was extracted for) rather than by mechanism
(*which files under `scripts/` invoke git*), and this guard is whole-file rather than diff-scoped, so
it fell outside the frame. #619's issue text inherited the same count. **Define the audit population
by mechanism, not by resemblance.**

## Follow-up — #654 / PR #662

The sixth false clean in this layer, and the first found by *using* the guards rather than by
auditing them: during PR #652 a review finding moved a test into a new file, and
`check-plan-file-structure --diff` reported clean because `git diff` cannot see a path git has
never been told about. It inverted the guard in precisely the case it exists for — the plan-doc
rule is written because *the omissions are never the interesting files*, and an added file is the
likeliest omission there is.

`untrackedPaths()` joins `git-diff.mjs` (`ls-files --others --exclude-standard -z`) and
`check-plan-file-structure.mjs`'s `check` unions it into the paths it judges. Four cases, same
discipline:

| AC | The revert | Cases that go RED | Restored |
|---|---|---|---|
| #654 AC-1 | `check-plan-file-structure.mjs` — `check` back to `changedPaths(git(nameOnlyArgs(range)))` alone | `--diff sees a file the slice adds but has not staged`; `--diff reads a plan doc that is itself untracked` | ✅ 215 pass / 2 fail |
| #654 AC-2 | `git-diff.mjs` — `--exclude-standard` dropped from `untrackedPaths` | `--diff ignores an untracked path git is told to ignore` | ✅ 216 pass / 1 fail |
| #654 AC-3 | `git-diff.mjs` — `-z` dropped from `untrackedPaths` | both AC-1 cases (the whole listing arrives as one newline-joined token) | ✅ 215 pass / 2 fail |
| #654 AC-4 | `check-plan-file-structure.mjs` — untracked paths appended to `findOmissions`' **result** instead of to its input | `--diff passes when the section lists the unstaged path`; `… never reports a plan doc as its own omission`; `… reports a path in both lists exactly once`; `… sees a file the slice adds but has not staged` | ✅ 219 pass / 4 fail |

### The review round — where the first cut was wrong

**The `/code-review` fan-out ran on PR #662 and found the fix had opened a worse hole than it
closed.** Recorded at length because the failure is the instructive kind: every finding below was
reproduced in a throwaway repo before being accepted, and the first three were invisible to a suite
that was 217/217 green.

| # | Finding | Verified | Fix |
|---|---|---|---|
| R-1 | **False clean #7.** The union fed `planDocsIn`, so any untracked markdown under `docs/plans/` became authoritative for the whole range — an unrelated draft whose section named a changed path turned a red gate **green**. Real sections carry directory tokens and globs, so one draft could blanket-satisfy an entire diff | exit 1 → **0** | `planDocsIn` reads the **diff only** |
| R-2 | The same widening in reverse: a slice with **no plan doc** stopped passing cleanly, because any untracked draft anywhere switched the guard on — contradicting this guard's own header contract and `riviera-sdlc` rule 6 | exit 0 → **1** | same |
| R-3 | `usable`'s ambiguity floor counted the union, so an unstaged `scratch/SecurityConfig.java` dropped the bare token `SecurityConfig.java` and reported the **correctly listed** path as missing | exit 0 → **1** | floor measured against the diff |
| R-4 | "The two lists cannot overlap" — asserted in the docstring — is **false**: `git rm --cached` leaves a path in the tree and out of the index, so the diff reports it deleted while `ls-files --others` reports it untracked. Reported twice, and double-counted by `usable`'s `length <= 1` | reported **2×** | dedupe the union |
| R-5 | The four original cases pinned only the happy path; the over-reach direction was pinned by nothing | — | four cases added, each mutation-proved below |
| R-6 | No docs-freshness pass, though the change falsifies the same sentence class AC-15 patched | — | `ci.yml`, `CLAUDE.md`, `riviera-plan-doc` SKILL + template patched |
| R-7 | `untrackedPaths` inlined its argv, so `git-diff.test.mjs`'s flag-pinning case could not reach `--exclude-standard`/`-z` — the one convention this module exists to enforce | — | `untrackedArgs()` extracted; case added |
| R-8 | The F-8 row was inserted between F-6 and F-7 | — | moved |

**The seam that came out of it: judged ≠ authoritative.** The union widens which paths get
**judged**; it must not widen which docs confer **authority**, nor which population **measures**
ambiguity. One list serving all three purposes is what produced R-1, R-2 and R-3 from a single
four-token change. `check` now derives the three separately, and `findOmissions` takes `untracked`
as its own parameter so the asymmetry is in the signature rather than in a comment.

**What this says about the original fix's confidence.** The PR body argued the union was safe
because `git ls-files --others --exclude-standard` returned **zero** in this container — a clean
CI-shaped checkout — and generalized from that to contributors' trees. That reasoning was the
common cause of R-1 through R-4: a sample of one, taken in the environment least like the one the
change was for. The guard exists for the local mid-slice run, which is exactly where scratch files,
drafts and half-staged work live.

| AC | The revert | Cases that go RED | Restored |
|---|---|---|---|
| #654 AC-5 | `check-plan-file-structure.mjs` — `planDocsIn(changed)` back to the union | `--diff ignores an untracked plan doc outside the range`; `--diff stays off when only an untracked plan doc exists` | ✅ 219 pass / 2 fail |
| #654 AC-6 | `check-plan-file-structure.mjs` — dedupe filter dropped from `untracked` | `--diff reports a path in both lists exactly once` | ✅ 220 pass / 1 fail |
| #654 AC-7 | `check-plan-file-structure.mjs` — `usable`'s population back to the union | `--diff keeps a bare token an untracked file would shadow` | ✅ 220 pass / 1 fail |
| #654 AC-8 | `git-diff.mjs` — `--exclude-standard` dropped from `untrackedArgs` | `the untracked listing pins the two flags that decide what it can report` (unit) + the ignore case (CLI) | ✅ 219 pass / 2 fail |

### The second review round — where the scoping was still wrong

**Re-review of the R-1…R-8 rework found twelve more, four of them behavioural.** Recorded because
the pattern is the point: each round's fix was locally reasonable and globally incomplete, and a
221/221 green suite hid all four. This layer's defects have never been visible to a green suite —
the plan doc said so at #619 and it has now been demonstrated twice more.

| # | Finding | Fix |
|---|---|---|
| S-1 | The R-3 fix left its mirror open. `usable`'s floor moved to the diff, but `covers` still ran over the union, so a bare token the diff blessed **absorbed** a new file sharing its basename — `shared/SecurityConfig.java` listed, `booking/SecurityConfig.java` added, exit 0. Within a diff alone two matches drop the token, so the union had broken the invariant `usable` encodes | untracked paths need the **stricter** token: unambiguous across the union. Changed paths keep the diff's floor, so R-3 stays fixed |
| S-2 | `isExempt` keyed off `docs` — the *authoritative* set — so an untracked draft for the **next** slice was reported as this slice's omission, advising the author to list it here or ignore a file meant to be committed. Same root cause for a plan doc the diff **deletes** | exemption keys off plan-doc **shape** |
| S-3 | The commonest #654 shape — a brand-new slice whose plan doc is *itself* unstaged — still passes vacuously, because R-1 scoped `planDocsIn` to the diff. `riviera-plan-doc` and its template, patched in the same round, advertised the catch unconditionally | **behaviour kept, docs corrected.** Staging is the author's own signal that a doc belongs to the change, and it is the only signal git offers: the alternative — treating any untracked draft as authoritative — is exactly R-1/R-2. Both docs now say the plan doc must be staged |
| S-4 | `--diff passes when the section lists the unstaged path` was **vacuous**: it wrote the plan doc unstaged, so the guard short-circuited before reading a token and the case passed against any implementation | fixture stages the doc; the case now fails under AC-4's mutation |
| S-5 | `untrackedArgs` omitted `--full-name`, `ls-files`' analogue of the `--no-relative` the diff builders pin — from a subdirectory a bare `ls-files` truncates the prefix *and* omits everything above it | pinned, and asserted |
| S-6 | `report()`'s header still said "Paths changed by this diff", sending the author to look for an untracked path in a diff that cannot contain it — the #539 failure mode | header now reads "Paths this slice touches" |
| S-7 | The dedupe rationale claimed the duplicate was "counted twice by `usable`". False for the shipped code: the floor is measured against `changed`, where such a path appears once either way | docstring and the mirrored test docstring corrected to the double-**report** |
| S-8 | The AC-4 mutation row recorded 214/3 — measured against the pre-review code and never re-run after R-1/R-3 changed `planDocsIn` and `usable` | re-measured: 219/4 |
| S-9 | `untrackedPaths()` walked the whole tree before `check` knew a plan doc existed, discarding it in the majority case; dedupe was an `Array.includes` scan per path | walk hoisted below the `docs.length === 0` return; dedupe via a `Set` |
| S-10 | The advice sent personal scratch files to the **committed** `.gitignore`, when `--exclude-standard` already honours `.git/info/exclude` and `core.excludesFile` | advice names all three, in the right order |
| S-11 | `untrackedPaths()` carried no doc comment while the block above it documented `untrackedArgs()` in its own voice | doc comment added |
| S-12 | Phase row 7 cited only the first, superseded commit | both commits listed |

| AC | The revert | Cases that go RED | Restored |
|---|---|---|---|
| #654 AC-9 | `check-plan-file-structure.mjs` — untracked coverage judged with `general` rather than `strict` | `--diff reports a new file a bare token would absorb` | ✅ 222 pass / 1 fail |
| #654 AC-10 | `check-plan-file-structure.mjs` — `isExempt` keyed off `docs` again | `--diff never reports a plan doc as its own omission` | ✅ 222 pass / 1 fail |
| #654 AC-11 | `git-diff.mjs` — `--full-name` dropped from `untrackedArgs` | `the untracked listing pins the two flags that decide what it can report` | ✅ 222 pass / 1 fail |

**What two rounds of this say.** Both rounds found the same *shape* of error: one list, or one floor,
serving purposes that had quietly diverged. The four-token union broke three contracts; scoping it
broke two more in the opposite direction. The seam that finally holds is stated in `findOmissions`'
signature — `changed` and `untracked` arrive separately and are measured by different floors — rather
than in a comment above a single list. A reviewer should check that the two floors still differ.

**The residual, stated rather than hidden.** With plan docs scoped to the diff, an unrelated
untracked scratch file is still judged **when the slice has a plan doc in its diff** — git cannot
tell a draft of this slice's new file from a stray download. That is the trade #654 asked for, and
the guard now says so in its own advice line: `.gitignore` is where a file you never intend to commit
belongs. CI is unaffected in either direction — a fresh checkout has no untracked files.

**AC-4 is this ledger's honest row.** Dropping the union (AC-1) leaves the two exit-0 cases green,
because a guard that sees nothing also exits 0 — they would have been decoration against that
mutation alone. AC-4 is the wrong implementation they actually pin: unioning into the *verdicts*
rather than into the *paths to judge*, which reports every untracked file whether or not the plan
doc lists it. The union adds paths to check, not findings.

**Only a path-scoped guard could take this fix.** The three sibling `--diff` modes share the blind
spot, and none is changed here: they key on added **line numbers**, which a file with no diff cannot
supply, so they answer the new-file case with a whole-file verdict behind `--files`/`--hook`
instead (AC-15 above, and #618 before it). This guard needs names alone, so the union is four
tokens. What made it the urgent one is that it is the only member of the four with **no**
`PostToolUse` half — CLAUDE.md's "most with a local `PostToolUse` half" is this guard being the
exception — so nothing else was catching the case locally.

**Not done, and why.** A `.husky/pre-commit` call was considered once F-7's question resurfaced
(below) and rejected: everything is staged by then, so it cannot see the window the bug lives in,
and it would red every WIP commit whose plan doc has not caught up. CI is unaffected either way —
it diffs committed history on a clean checkout, where `ls-files --others` is empty — which is why
this was a local-feedback defect and never a merge-gate hole.

**F-7, asked again and answered the same way.** The maintainer's post-merge question — *are these
guards redundant now that Prettier and type-aware ESLint are in place?* — came up again against the
Husky/lint-staged wiring added in #639, which is new since F-7 was closed. Still no, and now for a
third reason on top of F-7's two: `lint-staged` operates on the **staged** set, which is the far
side of exactly this bug. Its globs are frontend-only (`{src,e2e}/**`), so neither `platform/` nor
`docs/plans/` is in scope, and no ESLint rule can express "is this path named in a markdown
section" — a cross-file relationship rather than an in-file one.

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
