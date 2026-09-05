# Guard base: fetch-or-refuse Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** No `scripts/check-*.mjs` guard can resolve its diff range from a local ref it has not
just fetched — it fetches the base branch itself, or it refuses with the remedy, and never
silently widens the range onto commits the branch never touched.

**Architecture:** One shared resolver, `resolveBase()` in `scripts/git-diff.mjs`, replaces
`mergeBase()` at all five call sites: it refuses a shallow clone before resolving anything,
fetches a `<remote>/<branch>` base from that remote and refuses when the fetch fails, accepts a
commit SHA as-is (the pinned, offline form), and refuses every other spelling — including a bare
local branch, which is a snapshot exactly as `origin/main` is. The fail-open `catch` that returned
the base tip when `merge-base` threw (PR #951 finding F-9) becomes a refusal.

**Persistence:** N/A — no database, no schema, no Flyway migration. Repository tooling only.

**Source of intent:** GitHub issue #952 (successor to #942 / PR #951, which fixed the review
gate's half and deferred the guards' half here).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
`PostToolUse` hooks run `--hook`, which is path-based and never resolves a base, so the exposed
surface is by-hand `--diff` runs only, not the hooks the issue names) · `riviera-plan-doc` (this
template — forced the Non-goals boundary against re-opening the review gate, and the
Generalization-audit row that enumerates the population by mechanism) · `tdd` (each refusal is
written as a spawned-CLI case in `guard-cli.test.mjs` before the resolver learns to make it pass) ·
`riviera-review-overlay` (review gate — runs at ready-for-review; RV-PROC-1 checks this line) ·
`riviera-docs-freshness` (**ran** over `558bafb..HEAD` — 1 finding, F-1 below; the counting sweep
verified all seven "N of the M" facts, including `CLAUDE.md`'s "five of the seven guards", and
every one holds) · `riviera-local-debug` (the session's first `node --test`, and the
`git fetch --unshallow` precondition this slice turns from advice into an enforced refusal).

No `postgres`, `riviera-modulith`, `riviera-java-conventions`, `riviera-frontend`,
`riviera-tailwind`, `playwright-cli` or `riviera-stripe-payments`: the diff is `scripts/*.mjs`
(dependency-free Node ESM outside `frontend/`) and Markdown. Nothing under `platform/`,
`frontend/src`, `frontend/e2e`, or `db/migration` is touched.

**Branch:** `claude/sdlc-952-h1xe5n` — the cloud session's designated remote branch, standing in
for `bugfix/guard-base-fetch-or-refuse` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

> Every seam here is a guard's **CLI process boundary** — exit code plus streams, observed by
> spawning the script, which is the split `guard-cli.test.mjs`'s header states: the detectors have
> their own suites, and every false clean ever found lived in the git front-end instead. The one
> exception is AC-7, whose seam is the `git-diff.mjs` module export, matching the flag-pinning
> convention that file already enforces for `diffArgs`/`nameOnlyArgs`/`numstatArgs`/`untrackedArgs`.

- [x] **AC-1:** Given a shallow clone, when any of the five guards resolves a `--diff` base, then it
      exits 2 without resolving a range and names `git fetch --unshallow`. *Seam:* the guard CLI
      (exit code + stderr) · *Pinned by:* `guard-cli.test.mjs`
      `every base-resolving guard refuses a shallow clone before it resolves anything`
- [x] **AC-2:** Given `origin/main` set behind the branch's real base and no reachable `origin`,
      when any of the five guards runs `--diff` against it, then it exits 2 naming the failed fetch
      — and reports on no file outside the branch's own diff. *Seam:* the guard CLI · *Pinned by:*
      `guard-cli.test.mjs` `every base-resolving guard refuses a base it could not fetch`
- [x] **AC-3:** Given `origin/main` set behind the branch's real base and a reachable `origin` whose
      `main` holds the real base, when any of the five guards runs `--diff origin/main`, then it
      fetches, advances the ref, and reports only what this branch changed. *Seam:* the guard CLI ·
      *Pinned by:* `guard-cli.test.mjs` `every base-resolving guard fetches a stale base and reports
      only this branch`
- [x] **AC-4:** Given a base that is neither a configured remote's branch nor a commit SHA (a bare
      local branch `main`), when a guard resolves it, then it exits 2 naming both accepted forms
      rather than diffing a snapshot. *Seam:* the guard CLI · *Pinned by:* `guard-cli.test.mjs`
      `a local branch is refused as the snapshot it is, naming both accepted forms`
- [x] **AC-5:** Given a commit SHA as the base, when a guard resolves it, then it resolves the range
      with no fetch attempted and no network needed. *Seam:* the guard CLI · *Pinned by:*
      `guard-cli.test.mjs` `a SHA base resolves with no remote configured at all`
- [x] **AC-6:** Given a base sharing no ancestor with `HEAD`, when a guard resolves it, then it
      exits 2 rather than falling back to the base tip and reporting the whole unrelated history.
      *Seam:* the guard CLI · *Pinned by:* `guard-cli.test.mjs`
      `unrelated histories are refused, not silently widened to the base tip`
- [x] **AC-7:** Given `fetchArgs('origin', 'main')`, when its flags are read, then `--no-tags` is
      pinned and the ref pair is last. *Seam:* the `git-diff.mjs` module export · *Pinned by:*
      `git-diff.test.mjs` `the fetch invocation pins the flags that keep it cheap and scoped`
- [x] **AC-8:** Given `check-comment-only.mjs` — neither a CI gate nor a registered hook, so a
      by-hand run is its *only* invocation — when it is run any of the five ways above, then it
      behaves as AC-1 to AC-6 state. *Seam:* the guard CLI · *Pinned by:* the five loops above,
      each of which includes `check-comment-only.mjs` in its guard table.
- [x] **AC-9:** Given the six documented by-hand invocations issue #952 lists, when each is
      copy-pasted into a cloud session, then it is correct as written — verified site by site, with
      the shallow precondition stated where it is owned rather than repeated six times. *Seam:* the
      documented command text · *Pinned by:* manual verification recorded in the AC-verification
      section (a doc string has no executable pin; the executable half is AC-1 to AC-6).

## Non-goals

- **Re-opening the review gate.** `check-review-range.mjs` and `references/pr-gates.md` §1 are
  #942's settled answer; this slice adopts their posture, it does not revise them.
- **`check-cloud-node-pin.mjs`.** It takes no base and resolves no range — it exits 2 on any
  argument, and a case already pins that.
- **The `--hook`, `--files` and `--all` modes.** None resolves a base; the exposure is `--diff`
  (and `check-comment-only`'s positional base) alone.
- **Making the guards work offline against a moving branch.** A SHA base is the offline form; there
  is no flag, env var or acknowledgement that lets a run assert freshness it cannot prove.
- **Any change to what the five guards actually detect.** Their rules, thresholds and reports are
  untouched; only how the range's base is established changes.

## Behavior-parity ledger

| Old-surface behavior (`mergeBase()` + the five `argv[N] ?? 'origin/main'` defaults) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Default base `origin/main` when the caller names none | preserved | `resolveBase()` keeps the same default; it is now fetched before use |
| Resolve `merge-base(base, HEAD)` and diff `<base>...` against the working tree | preserved | unchanged — only the base's provenance is new |
| A `<remote>/<branch>` base used exactly as the local ref stands | **changed** | fetched from that remote first; a failed fetch refuses. This is the slice |
| A bare local branch (`--diff main`) accepted as a base | **changed** | refused, naming `origin/<branch>` and the SHA form. A local branch is a snapshot exactly as `origin/main` is (AC-1's letter); no production caller uses it — CI and all six documented invocations name `origin/…` |
| A commit SHA accepted as a base | preserved | accepted with no fetch — and now the documented offline form |
| `merge-base` throws → return `base` unchanged, warning only on a shallow clone | **changed** | refuses. The fail-open is PR #951's F-9; the warning never covered the silent case (a shallow clone that answers from the truncated graph) |
| No opinion about a shallow clone | **changed** | refused before resolving, matching `check-review-range.mjs` |
| Exit codes 0 clean / 1 violations / 2 usage | preserved | precondition refusals join 2, which is already "did not run", not "clean" |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Refusing a bare local branch breaks a caller this plan did not enumerate | low | med | Enumerated by mechanism, not memory: `grep -rn "check-\*.mjs" ` over `.github/workflows`, `.claude`, `docs`, `CONTRIBUTING.md`, `scripts` — CI passes `origin/${{ … base.ref }}` at all four steps, all six documented invocations name `origin/main`, and only two test cases pass a bare `main`. Those two are reworked to model a moved *remote*, which is the real scenario | claude | closed — no caller broke; `Repo hygiene (diff-scoped)` green on every push, and the two reworked cases pass |
| R-2 | The added fetch makes CI's four hygiene steps slower or flakier | low | low | Each is one `--no-tags` single-branch fetch of an already-fetched ref against GitHub from a GitHub runner; the job's budget is 10 min against an observed sub-minute green. The explicit `Fetch the base branch` step stays — belt and braces, and it is what makes the guard's own fetch a no-op | claude | closed — the hygiene job stayed sub-minute across all six PR runs |
| R-3 | The shallow refusal blocks a fresh cloud session's by-hand guard run until it unshallows | med | low | Accepted deliberately (user decision, this session): `riviera-local-debug` already makes `git fetch --unshallow` a session precondition, and the refusal message names the exact command. The alternative is the silent wrong base the issue exists to close | claude | closed — accepted; `riviera-local-debug` now states it, and the refusal names the command |
| R-4 | A test that fetches from a local path is slow or platform-dependent | low | med | The harness fetches from a second temp repository by filesystem path — no network, no credentials, and `GIT_TERMINAL_PROMPT=0` already set. Windows-safe: the harness resolves `--show-toplevel` rather than trusting the temp path | claude | closed — the suite runs in ~12s; F-2 additionally hardened the one CR-sensitive path |
| R-5 | Flyway version collision with an in-flight PR | n/a | n/a | No migration in scope. The three open PRs (#940, #943, #944) touch `docs/`, `platform/src/test/`, and `CONTRIBUTING.md`; the only overlap is `CONTRIBUTING.md` with #940/#944 → merge `origin/main` before ready-for-review | claude | closed — `main` never moved during the slice (still `558bafb`), so no merge was needed and no collision arose |
| R-6 | The review-gate/guard split drifts again — a later guard is added with the old default | low | med | The default lives in one function now, and a new guard that resolves a base must call it. Recorded in the Generalization-audit log with the enumerating command so the next audit re-runs it rather than re-guessing | claude | closed — logged with the command that found the population |

## Open questions / Assumptions

### Resolved

- **Open question:** fetch-or-refuse in the shared resolver, or guards take an already-resolved base
  and the caller fetches? — *Resolved (user, this session):* **fetch, then refuse if the fetch
  fails.** The six documented commands then stay correct as typed, hooks are unaffected (`--hook`
  resolves no base), and CI's existing fetch degrades to a cheap no-op. The refuse-only shape was
  rejected because a copy-paste becomes two commands and any "I fetched" acknowledgement can be
  given falsely; the warn-and-proceed shape was rejected as a repeat of PR #951's F-9 fail-open.
- **Open question:** should a shallow clone refuse, or warn and proceed? — *Resolved (user, this
  session):* **refuse**, the same as `check-review-range.mjs`. A fetch does not fix a shallow clone:
  `merge-base` can still answer wrong from the truncated graph, which is exactly the silent case the
  issue's *Why this is not already covered* section names.
- **Open question:** should `scripts/` join `sonar.sources`? The Sonar gate is structurally blind
  to every scripts-only PR, this one included, and the guards are the machinery the merge gates
  themselves run on. — *Resolved:* out of scope here (widening `sonar.sources` is a decision about
  gate coverage, not about #952, and it would light up the pre-existing tree in a change that fixes
  something unrelated). Filed as **#954** at the maintainer's direction, with the pulled measures
  and the four decisions a slice there has to make.
- **Assumption → verified:** the `PostToolUse` hooks are not exposed. `.claude/settings.json` runs
  all three with `--hook`, which reads one file path from the payload and never resolves a base.
  The issue's framing ("the `PostToolUse` hooks and every by-hand run") is drift; recorded here and
  in the PR body rather than silently planned around.

## Availability & concurrency (invariant #2)

N/A — repository tooling only. Nothing in scope reads or writes `set_availability`, `booking`, or
the beach map, and no guard has an opinion about a booking date.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope. The diff does not enter `platform/`.

### Module ownership (§4a)

N/A — no module owns `scripts/`. It is repository tooling outside the Modulith, deliberately
dependency-free (`Repo hygiene (diff-scoped)` runs it with no install step).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — no frontend in scope. `scripts/` is not under `frontend/` and ships in no bundle.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — merged via PR #953`

**Next action:** Nothing. Post-merge items are GitHub edits only (close-out steps 1, 6, 7).

**Review gate result.** All five agents reported. Agents 1 (CLAUDE.md adherence), 2 (shallow bug
scan) and 5 (code-comment guidance): no issues. Agent 4 found F-4, agent 3 found F-5; both fixed
test-first and mutation-proved. Agent 3 reviewed the pre-F-4 tree and independently reached the
same unguarded-`git()` observation, which is corroboration rather than a second finding.

**Review-gate re-entry (F-4).** Per the `riviera-sdlc` re-entry rule the fix went back through
Implement: routing gate re-run (the fix touches `scripts/*.mjs` only — `tdd` for the test-first
cycle, `riviera-review-overlay` for the re-review; no new area), red test first, then the wrap.

**CI:** all 8 checks green on `e46572d` (and on `2a3d20b` and `bd43f37` before it) — Backend, Frontend, Repo hygiene (diff-scoped), CodeQL
(both analyses), SonarCloud scan, SonarCloud Code Analysis.

**Sonar gate — green, and vacuous for this slice; recorded rather than ticked.** The list was
pulled, not the conclusion: 0 unresolved issues, 0 hotspots, `new_bugs`/`new_vulnerabilities`/
`new_code_smells`/`new_violations` all 0, quality gate `OK` on all four conditions. But
`sonar-project.properties` sets `sonar.sources=platform/src/main/java,frontend/src`, so `scripts/`
— which is the entire code half of this diff — is outside the analysed scope, and the absent
`new_lines`/`new_coverage` measures confirm it: nothing of this change was analysed. The zero is
therefore true and uninformative. This is a pre-existing gap in gate coverage, not one this slice
introduces (it applies to PR #951 and every scripts-only PR before it), so it is a follow-up rather
than a widening of this PR: filed as **#954**.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `resolveBase()`, and all five guards wired | ✅ | `9d4076b` |
| 1 — the per-guard matrix | ✅ | `91df1a1` |
| 2 — docs, usage strings, and close-out | ✅ | `c107516`, `2a3d20b` |
| review-fix — F-2/F-3, F-4, F-5 | ✅ | `1bc7b64`, `bd43f37`, `928499f` |

**Phase 0 scope note.** The plan split the wiring across phases 0 and 1, which would have left
phase 0's commit red: the four unwired guards import `mergeBase`, and deleting it breaks them at
import time. Wiring all five is therefore one atomic step, and phase 1 is now the per-guard test
matrix alone.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | docs-freshness (close-out sweep) | `guard-cli.test.mjs:1019` still said "the drift `mergeBase` exists to prevent" — the only surviving **present-tense** reference to a function this slice deleted. Its siblings all say "the old `mergeBase()`" / "used to" and are correct | fixed — reads `resolveBase` |
| F-2 | self-review (before the gate) | `remotes()` split on `\n` without trimming: a stray CR would leave `origin\r` unequal to `origin`, refusing a Windows contributor's base as naming no configured remote — fail-closed, but wrong and unexplainable from the message | fixed-in-`1bc7b64` |
| F-5 | review gate (agent 3 — git-history context) | `publish()` and `breakOrigin()` each wired `origin` with `git remote add`, which fails once the remote exists — so a case composing them in either order died inside the harness, and the failure would read as the guard's. Dormant (no case combines them today), but a trap in a fixture whose whole purpose is front-end fidelity | fixed — both go through one `pointOrigin` that adds or `set-url`s; pinned by `the harness can point origin at a real repository and at nowhere, in either order`, mutation-proved |
| F-4 | review gate (agent 4 — prior-PR comments) | `resolveBase()` could throw: `git(['rev-parse', '--is-shallow-repository'])` and `remotes()`' `git(['remote'])` were unguarded, as was the `rev-parse --show-toplevel` behind `repoRoot()` that precedes both. An escaping throw exits Node with **1** — the code these guards assign to *violations found* — with a stack trace, instead of the controlled 2. Exactly PR #951's finding F-6, which `check-review-range.mjs` guards against and the five inherited unfixed | fixed — the whole body is wrapped; pinned by `a git call that fails is reported as a precondition, not as a violation`, mutation-proved across all five rows |
| F-3 | self-review (before the gate) | The `merge-base` catch asserted "shares no ancestor" as the cause, but git exits non-zero there for other reasons too; a broken repository would have been reported as unrelated histories | fixed-in-`1bc7b64` — states it as the likely reading and carries git's own error |

---

## File structure

- `scripts/git-diff.mjs` — gains `fetchArgs()` and `resolveBase()`; loses `mergeBase()` and its
  fail-open `catch`
- `scripts/git-diff.test.mjs` — the flag-pinning case for `fetchArgs()`
- `scripts/check-comment-only.mjs` — positional base routed through `resolveBase()`; header states
  the base contract, and why this guard needs it most
- `scripts/check-inline-comments.mjs` — `--diff` base routed through `resolveBase()`
- `scripts/check-plan-file-structure.mjs` — same
- `scripts/check-focus-posture.mjs` — same
- `scripts/check-touch-target.mjs` — same
- `scripts/guard-cli-harness.mjs` — gains a way to give the throwaway repository a real `origin` on
  the filesystem, so a case can prove a fetch corrects a stale ref
- `scripts/guard-cli.test.mjs` — the per-guard refusal/fetch matrix; the two cases that passed a
  bare `main` reworked onto a moved remote
- `CONTRIBUTING.md` — the local-run instruction gains the base contract
- `.claude/skills/riviera-local-debug/SKILL.md` — the shallow-clone consequence table gains the
  guards, which now refuse rather than mislead
- `docs/plans/guard-base-fetch-or-refuse.md` — this plan
- `docs/plans/review-gate-range-pinning.md` — **deleted**: PR #951 merged, and
  `riviera-docs-freshness` § *Plan-doc retirement* deletes a plan doc at the next close-out after
  its PR merges. This slice is that close-out

---

## Phase 0 — `resolveBase()` and the first guard

**Files:** Modify `scripts/git-diff.mjs` · Modify `scripts/check-inline-comments.mjs` · Modify
`scripts/guard-cli-harness.mjs` · Test `scripts/guard-cli.test.mjs`, `scripts/git-diff.test.mjs`

- [x] **Step 1: Write the failing tests** — the harness gains an origin-on-disk helper; the cases
      assert the shallow refusal, the unfetchable refusal, the local-branch refusal, the
      unrelated-histories refusal, the SHA acceptance, and the fetch-corrects path, against
      `check-inline-comments.mjs` only.
- [x] **Step 2: Run them, verify they fail** — `node --test scripts/guard-cli.test.mjs` → FAIL
      (today the guard exits 0 or 1 having diffed the stale ref).
- [x] **Step 3: Minimal implementation** — `fetchArgs()` + `resolveBase()` in `scripts/git-diff.mjs`
      returning `{ base }` or `{ error }`; `check-inline-comments.mjs` writes the error and returns 2.
- [x] **Step 4: Run them, verify they pass** — `node --test scripts/git-diff.test.mjs
      scripts/guard-cli.test.mjs` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every script that resolves a diff range
      from a ref rather than a SHA. Append the enumerating command and the verdict to the log.
- [x] **Step 6: Commit** — `git commit -m "Resolve a guard's base by fetching it, or refuse (#952)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — the remaining four guards, and the per-guard matrix

**Files:** Modify `scripts/check-comment-only.mjs`, `scripts/check-plan-file-structure.mjs`,
`scripts/check-focus-posture.mjs`, `scripts/check-touch-target.mjs` · Test
`scripts/guard-cli.test.mjs`

- [x] **Step 1: Write the failing tests** — lift phase 0's cases into a table over all five guards
      (each row carrying its own fixture shape and argv, since `check-comment-only` judges modified
      files and `check-plan-file-structure` needs a plan doc), and rework the two cases that pass a
      bare `main` onto a moved remote.
- [x] **Step 2: Run them, verify they fail** — `node --test scripts/guard-cli.test.mjs` → FAIL for
      the four unwired guards.
- [x] **Step 3: Minimal implementation** — done in phase 0 instead: deleting `mergeBase()` breaks
      the four unwired guards at import time, so wiring all five had to be one atomic step (see the
      phase-0 scope note under Execution status). Phase 1 is the test matrix alone.
- [x] **Step 4: Run them, verify they pass** — `node --test "scripts/*.test.mjs"` → PASS (the whole
      guard suite is what CI runs, and it is seconds).
- [x] **Step 5: Generalization-audit pass** — confirm no `check-*.mjs` still imports `mergeBase`.
- [x] **Step 6: Commit** — `git commit -m "Route the four remaining guards through the fetched base (#952)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — docs, usage strings, and close-out

**Files:** Modify `CLAUDE.md`, `CONTRIBUTING.md`,
`.claude/skills/riviera-local-debug/SKILL.md` · Delete `docs/plans/review-gate-range-pinning.md`

- [x] **Step 1: Verify the six documented invocations site by site** (AC-9), recording each verdict.
- [x] **Step 2: State the precondition where it is owned** — `riviera-local-debug`'s shallow-clone
      table gains the guards; `CONTRIBUTING.md`'s local-run line gains the base contract;
      `CLAUDE.md`'s guard sentence is reconciled with what the guards now do.
- [x] **Step 3: Retire the merged plan doc** — delete `docs/plans/review-gate-range-pinning.md`
      (PR #951 merged; this is the next close-out).
- [x] **Step 4: Reconcile the File-structure section** — `node scripts/check-plan-file-structure.mjs
      --diff origin/main` → exit 0.
- [x] **Step 5: `riviera-docs-freshness` over `558bafb..HEAD`**, including the counting sweep for
      `CLAUDE.md`'s "five of the seven `scripts/check-*.mjs`" claim.
- [x] **Step 6: Commit** — `git commit -m "State the guards' base contract where it is owned (#952)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | phase 0 (#952) | Every script that resolves a diff range from a **ref** rather than a pinned SHA — the mechanism is a `merge-base` call, not a resemblance to a guard | `grep -rln "merge-base\|resolveBase" scripts/*.mjs \| grep -v test` | 7: the five guards, `check-review-range.mjs`, and `git-diff.mjs` itself | All five guards routed through `resolveBase()`; `check-review-range.mjs` already refuses on its own (#942) and stays as it is — Non-goal #1; `git-diff.mjs` is the chokepoint the fix lives in. `check-cloud-node-pin.mjs` is correctly absent: it resolves no range |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 to AC-8:** `node --test "scripts/*.test.mjs"` → 252 pass, 0 fail, including the six
      per-guard loops. Each loop was also observed *discriminating*: with the fetch removed from
      `resolveBase()`, all five rows exit 1 and the four with a distinct path name the file `main`
      gained after the branch forked; with the resolver's wrapper removed, all five exit 1 with a
      stack trace. Verified at commit `928499f`.
- [x] **AC-9:** All six sites re-read (verified at commit `c107516`). Every one names `--diff origin/main`, which
      `resolveBase()` now fetches — so all six are **correct as written**, with no edit needed:

      | Site | Command | Verdict |
      |---|---|---|
      | `riviera-plan-doc/SKILL.md:86` | `check-plan-file-structure.mjs --diff origin/main` | correct as written |
      | `riviera-plan-doc/references/plan-doc-template.md:236` | same | correct as written |
      | `riviera-java-conventions/SKILL.md:128` | `check-inline-comments.mjs --diff origin/main` | correct as written |
      | `riviera-review-overlay/SKILL.md:54` | same | correct as written |
      | `riviera-review-overlay/references/frontend-conventions.md:205` | `check-focus-posture.mjs --diff origin/main` | correct as written |
      | `CONTRIBUTING.md:127` | `check-inline-comments.mjs --diff origin/main` | correct as written; gains the base contract, since it is the contributor-facing one |

      A **seventh** site the issue did not enumerate: `check-comment-only.mjs`'s own usage line,
      which is the only documentation of the one guard with no CI or hook invocation. Updated.
      The shallow precondition is stated once, in `riviera-local-debug` — which already owns the
      cloud-session preconditions — rather than repeated at six call sites. The docs-freshness sweep
      raised the two procedural sites (`riviera-plan-doc/SKILL.md:86`, `plan-doc-template.md:236`)
      as a judgment call, since every cloud slice runs that one at self-review; left as they are
      deliberately, because the refusal names `git fetch --unshallow` at the point of failure and is
      self-correcting, and duplicating a session precondition at six call sites is what the
      cite-the-owner rule exists to avoid. Also left as it is: `ci.yml`'s explicit base-fetch step,
      now redundant but not false — `git-diff.mjs` cites it as the source of the `--no-tags` pin.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced — N/A, no backend code in the diff.
- [x] **Availability** section filled (justified N/A); no availability/booking/map change.
- [x] Pool + cutoff rules honored — N/A.
- [x] **Modulith** section filled (justified N/A); the diff does not enter `platform/`.
- [x] **Payment/payout** section filled (N/A — no money in scope).
- [x] Refund policy enforced server-side — N/A.
- [x] Timezone correct — N/A, no time arithmetic in scope.
- [x] Booking codes unguessable — N/A.
- [x] Flyway migration present for schema changes — N/A, no schema change.
- [x] **Frontend** standards — N/A, no frontend in scope.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (F-1 to F-5 all resolved).
- [x] Risk register has no stale `open` rows (R-1 to R-6 all closed); Open Questions empty (the Sonar-scope one deferred to #954).
- [x] **Close-out written in THIS PR** — this is that commit, citing `merged via PR #953`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
