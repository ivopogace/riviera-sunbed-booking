# CI: a docs-only push costs a runner start, not a build — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A pull-request push whose `platform/` and `frontend/` trees were already built green
completes the `CI` workflow in about two minutes with every one of its contexts reporting as
today, while a push that changes either tree still runs the full build, tests and scans.

**Architecture:** The two build jobs keep running on every push (no `paths-ignore`, no job-level
`if:` — the seven required status-check contexts must keep reporting) and each restores its Sonar
inputs (JaCoCo XML + compiled classes; the Vitest lcov) from `actions/cache` under a key that is
the hash of everything its build reads. An exact hit means the identical tree already built green
somewhere this PR can see, so the setup/build/test steps are skipped and the restored files are
uploaded exactly as before — the `sonar` job and the Sonar app's `SonarCloud Code Analysis` check
are untouched. A miss builds, then saves after green. Restore runs only on `pull_request`; a push
to `main` always builds and seeds the cache every later PR can read. The hash *is* the change
detection: it is conservative by construction (a `main` move under the PR, a revert to a known tree,
a file the build reads outside its own folder — all answered by content, not by a path list).

**Persistence:** JDBC only (invariant #1). No tables or migrations touched.

**Source of intent:** GitHub issue #955 (measured on PR #953). Neighbour: #954 (read; Sonar's
`scripts/` blindness is out of scope here).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
`CodeQL` workflow, absent from the issue's timing table, posts three of the seven required
contexts and takes 2–4 min per PR push, so AC-1 as written could not hold; caught that a Vitest
spec reads `docs/design/non-text-contrast.md`, so "docs-only" is not build-neutral by path; both
put to the maintainer, who chose the hash-keyed cache, the reframed AC-1, the in-PR temporary
commit for AC-3 and the two-doc AC-5) · `riviera-plan-doc` (this template — forced the
build-input enumeration in R-3 and the honest pin for ACs whose only seam is a real CI run) ·
`tdd` (no unit seam exists for a workflow file; each AC is pinned red→green by a real run on this
PR: the first push is the red (a miss, full build), the docs-only push is the green; the phase-2
pair proves the miss path discriminates) · `riviera-review-overlay` (review gate — at ready for
review) · `riviera-docs-freshness` (**ran** over the PR range at close-out — see Execution status)
· `riviera-local-debug` (unshallowed the clone before any guard or history claim; no local
`./gradlew`/`npm` run is needed for this slice).

**Branch:** `claude/sdlc-955-nbcpdd` — the session's designated remote branch stands in for
`feature/ci-docs-only-push` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

> The seam for AC-1 to AC-3 is the real `CI` workflow run on this PR — the only place a workflow
> file's behaviour is observable. Each is pinned by a run URL recorded in *Acceptance-criteria
> verification*, never reasoned about. The `CodeQL` workflow bounds the whole check suite at
> 2–4 min and is out of scope (Non-goals), so AC-1 measures the `CI` workflow.

- [ ] **AC-1:** Given a PR push whose diff touches only `docs/**` and whose `platform/` and
      `frontend/` trees match a build this PR already ran green, when `CI` runs, then both build
      jobs report an exact cache hit, skip their setup/build/test steps, upload the restored Sonar
      inputs, and the `CI` workflow completes in ≤ 2 min with `Backend (build + test)`,
      `Frontend (lint + test + build)`, `Repo hygiene (diff-scoped)` and `SonarCloud scan` green.
      *Seam:* the `CI` workflow run on this PR · *Pinned by:* phase-1 run URL + job timings.
- [ ] **AC-2:** Given the same push, then `SonarCloud Code Analysis` reports green on that SHA,
      and `ci.yml` says what the scan consumed (the restored artifacts of the identical tree) and
      why the scan cannot be skipped (the context exists only when an analysis is uploaded for the
      SHA). *Seam:* the PR's check runs + `ci.yml` · *Pinned by:* phase-1 check run + the comment.
- [ ] **AC-3:** Given a push that changes one file under `platform/` and one under `frontend/`,
      when `CI` runs, then both build jobs report a cache miss, run every build/test step as today,
      and save their outputs; and the following push that reverts both files reports a hit again.
      *Seam:* the `CI` workflow run on this PR · *Pinned by:* phase-2 run URLs (miss, then hit).
- [ ] **AC-4:** `ci.yml` carries a comment naming the `paths-ignore` trap (a workflow-level skip
      never posts the required contexts), why job-level `if:` was not used (skipped-check
      semantics are a bet the ruleset should not depend on), and how the cache key doubles as the
      change detector. *Seam:* the file · *Pinned by:* `grep -n "paths-ignore" .github/workflows/ci.yml`.
- [ ] **AC-5:** `riviera-sdlc` `references/pr-gates.md` §3 step 4 and the plan-doc template's
      Execution-status note say the close-out belongs in the PR's last **code-touching** commit,
      not a commit of its own, and why (CI bills per push; a docs-only last push is a full cycle
      that can only come back green). *Seam:* the two files · *Pinned by:*
      `grep -n "code-touching" .claude/skills/riviera-sdlc/references/pr-gates.md .claude/skills/riviera-plan-doc/references/plan-doc-template.md`.
- [ ] **AC-6:** Given a push to `main`, then neither build job attempts a restore (the restore
      step's `if:` names `pull_request`), so `main` always builds and the Sonar main-branch
      analysis and the `CD` gate read a fresh build. *Seam:* `ci.yml` · *Pinned by:* the `if:` on
      both restore steps; observed on the first `main` run after merge (outside the PR by nature).

## Non-goals

- The `CodeQL` workflow (`codeql.yml`): its two `Analyze (…)` jobs and the `CodeQL` check are
  required contexts that exist only when SARIF is uploaded for the SHA, so nothing there can be
  skipped; measured 2–4 min per PR push, it is the floor of the whole check suite. Recorded, not
  changed.
- Sonar's scope over `scripts/` (#954) — a separate decision about gate coverage.
- Any edit to the `Riviera Rule Set` ruleset or to a job name.
- Reducing the cost of a cache **miss** (the a11y e2e is ~7.5 min of the frontend job) — the
  issue is about pushes that have nothing to build.
- A third-party path-filter action; the hash key needs none.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing; on a miss every job runs the exact steps it runs today.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Key drift: `hashFiles('platform/**')` evaluated at save time includes `platform/build/**`, so save and restore never agree and the cache never hits | high (if naive) | high (silent — always a miss) | One `key` step right after checkout computes the hash once into `$GITHUB_OUTPUT`; restore and save both use that output; the globs also negate `platform/build/**`, `frontend/node_modules/**`, `frontend/coverage/**`, `frontend/dist/**`, `frontend/.angular/**` defensively | agent | open |
| R-2 | A hit restores stale or incomplete artifacts and Sonar scans garbage | low | high | Save only after the build+test steps passed (`actions/cache/save` is the step after the last gate); upload keeps `if-no-files-found: error`, so an empty restore is a red job, not a red Sonar; a `v1-` key prefix invalidates every entry if the artifact layout changes | agent | open |
| R-3 | A build input outside the hashed tree changes and the hit is wrong | med | high | Population enumerated by mechanism, not resemblance — "a spec/config/action that reads a path outside its own folder": `grep -rnE "'\.\./|\"\.\./" frontend/src frontend/e2e frontend/*.ts` (minus imports) → `focus-ring-baseline.spec.ts` reads `docs/design/non-text-contrast.md`; `playwright.config.ts` `cwd: '../platform'` (real-backend suite, not run in CI); `setup-node` reads root `.nvmrc`; backend: `grep -rnE "Path\.of\(|Paths\.get\(" platform/src/test` → all under `platform/`. Frontend key = `frontend/**` + `.nvmrc` + `docs/design/non-text-contrast.md`; backend key = `platform/**`. Toolchain/runner drift is accepted (it is the same exposure every cache carries) | agent | open |
| R-4 | Sonar's ≥80% new-code coverage on a docs-only push | low | med | Identical tree → identical JaCoCo/lcov → identical measures; the scan itself runs unchanged | agent | open |
| R-5 | A skipped check masks a required context (the #413/#420 class) | low | high | No job gains an `if:`; no `paths-ignore`; only steps inside always-running jobs are conditional, so all seven contexts report exactly as today | agent | open |
| R-6 | Cache evicted (7 days unused, 10 GB repo cap) | med | low | A miss is a full build — today's behaviour; correctness never depends on a hit | agent | open |
| R-7 | `hashFiles` patterns resolve from `GITHUB_WORKSPACE`, not the job's `working-directory: platform` | med | med (never hits) | Patterns are written repo-relative (`platform/**`), as the existing `node-version-file: .nvmrc` comment already warns for `uses:` steps | agent | open |
| R-8 | The Prettier step's `if:` (`steps.install.outcome == 'success'`) misbehaves when install is skipped | low | low | `skipped` ≠ `success`, so Format is skipped with the rest on a hit; verified in the phase-1 run's step list | agent | open |
| R-9 | RV-STYLE-1 on the two skill-markdown edits (an issue/PR number in an added skill line gates) | med | low | Write the rule without numbers; run `node scripts/check-inline-comments.mjs --diff origin/main` before every push | agent | open |
| R-10 | PR-scoped caches are invisible to `main`, and a docs-only squash onto `main` would otherwise skip the deploy gate's build | low | med | Restore is `if: github.event_name == 'pull_request'` — `main` never restores, always builds and saves (AC-6) | agent | open |
| R-11 | The temporary AC-3 commit trips a hygiene guard or leaves residue | low | low | Comment-only one-line edits in one Java test file and one spec; reverted by the very next commit; both paths listed under File structure | agent | open |

## Open questions / Assumptions

- **Assumption:** `actions/cache/restore` reports `cache-hit == 'true'` only on an exact primary-key
  match (no `restore-keys` are given, so any hit is exact). — *Owner:* agent · *Resolves by:* phase 1
  (the run's restore-step log).
- **Assumption:** `hashFiles()` accepts `!`-negated patterns (it is built on `@actions/glob`). Not
  load-bearing: the single early `key` step already fixes the hash before any build output exists.
  — *Owner:* agent · *Resolves by:* phase 0 (the key step's log prints a non-empty hash).

### Resolved

- **AC-1's "well under two minutes with all seven contexts"** cannot hold as written: `CodeQL`
  posts three of the seven and takes 2–4 min. Maintainer chose to measure the `CI` workflow and
  record the `CodeQL` floor as a non-goal (intake grill, this session).
- **Mechanism**: hash-keyed build-output cache over a `git diff` path filter (the filter leaves the
  Sonar job without artifacts on a docs-only push). Maintainer's choice (intake grill).
- **AC-3 proof**: a temporary code-touching commit in this PR, reverted next push. Maintainer's
  choice (intake grill).
- **AC-5 scope**: `pr-gates.md` §3 step 4 and the plan-doc template together; `CONTRIBUTING.md`
  does not state the rule and stays. Maintainer's choice (intake grill).

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no runtime code changes; the diff is a workflow file and
two skill documents.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope (the phase-2 temporary edit is a one-line comment in a test,
reverted in the next commit).

### Module ownership (§4a)

N/A — no behaviour added or moved in any module.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — no frontend code in scope (the phase-2 temporary edit is a one-line comment in a spec,
reverted in the next commit).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** edit `ci.yml`, the two skill docs; run the guards; commit; push; open the draft PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `ci.yml` cache-by-tree-hash + AC-4 comment + AC-5 docs; draft PR (the miss run) | ⏳ | |
| 1 — docs-only push: measure AC-1 / AC-2 (the hit run) | | |
| 2 — temporary `platform/` + `frontend/` edit (miss), then its revert (hit): AC-3 | | |
| 3 — merge `main`, ready for review, review gate, Sonar gate, close-out in the last code-touching commit | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `.github/workflows/ci.yml` — the `key` / restore / conditional-step / save changes in the
  `backend` and `frontend` jobs; the AC-4 comment above `jobs:`; the AC-2 note on the `sonar` job.
- `.claude/skills/riviera-sdlc/references/pr-gates.md` — §3 step 4: the close-out rides in the
  last code-touching commit.
- `.claude/skills/riviera-plan-doc/references/plan-doc-template.md` — the Execution-status note
  and the self-review line say the same.
- `docs/plans/ci-docs-only-push.md` — this plan.
- `docs/plans/rv-proc-2-wording-fix.md` — retired at close-out (merged via PR #958; no citations
  outside `docs/plans/`).
- `platform/src/test/java/ai/riviera/platform/ScheduledWorkArchitectureTest.java` — phase 2
  temporary one-line comment edit, reverted in the next commit (absent from the final diff).
- `frontend/src/app/shared/focus-ring-baseline.spec.ts` — phase 2 temporary one-line comment
  edit, reverted in the next commit (absent from the final diff).

---

## Phase 0 — `ci.yml` cache-by-tree-hash, AC-4 comment, AC-5 docs, draft PR

**Files:** Modify `.github/workflows/ci.yml` · Modify
`.claude/skills/riviera-sdlc/references/pr-gates.md` · Modify
`.claude/skills/riviera-plan-doc/references/plan-doc-template.md` · Create this plan.

- [ ] **Step 1: The red.** The first push of this PR changes no `platform/`/`frontend/` file, yet
      no cache exists for the trees (the new steps never ran on `main`), so both jobs must report a
      **miss** and run the full build — today's ~10 min. That run is the baseline the phase-1 hit is
      measured against, and the proof the save step works (its log shows the key saved).
- [ ] **Step 2: Backend job.** After Checkout: a `key` step
      (`echo "key=v1-backend-sonar-${{ hashFiles('platform/**', '!platform/build/**') }}" >> "$GITHUB_OUTPUT"`);
      `actions/cache/restore@v6` with `path` = the two upload paths and `key: ${{ steps.key.outputs.key }}`,
      `if: github.event_name == 'pull_request'`; `if: steps.restore.outputs.cache-hit != 'true'` on
      Set up JDK, Set up Gradle, Build and test; `actions/cache/save@v6` with the same path/key under
      the same `if:`; the upload step unchanged.
- [ ] **Step 3: Frontend job.** Same shape with
      `hashFiles('frontend/**', '.nvmrc', 'docs/design/non-text-contrast.md', '!frontend/node_modules/**', '!frontend/coverage/**', '!frontend/dist/**', '!frontend/.angular/**')`;
      conditional Set up Node, Install, Lint, Test, Playwright install, A11y e2e, Build; the Format
      step keeps its own `if:` (skipped install ⇒ skipped format); save after Build; upload unchanged.
- [ ] **Step 4: AC-4 comment** above `jobs:`, in the style of the existing trap comments: the
      `paths-ignore` trap, the job-level `if:` bet, the hash-as-detector, the `main` rule, the
      `CodeQL` floor. **AC-2 note** on the `sonar` job: why it runs on every push and what it consumes.
- [ ] **Step 5: AC-5 wording** in `pr-gates.md` §3 step 4 and the template (no issue/PR numbers in
      the added skill lines — RV-STYLE-1).
- [ ] **Step 6: Guards** — `node scripts/check-inline-comments.mjs --diff origin/main` and
      `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc staged) → both exit 0.
- [ ] **Step 7: Commit** — `git commit -m "Restore a docs-only push's Sonar inputs from a tree-hash cache (#955)"`;
      push; open the draft PR; subscribe; wait for the run; record the miss.
- [ ] **Step 8: Update plan-doc execution status** — folded into the phase-1 docs-only push.

## Phase 1 — the docs-only push (AC-1, AC-2)

- [ ] **Step 1:** Commit only this plan doc (Execution status: phase 0 ✅ with its run URL and the
      saved keys). Push. This is the hit run.
- [ ] **Step 2:** Record: run URL, `CI` wall time, both jobs' restore-step outcome (`Cache hit`),
      the skipped steps, the upload steps green, `SonarCloud scan` green, `SonarCloud Code Analysis`
      green on the SHA. → AC-1, AC-2.

## Phase 2 — the miss/hit pair (AC-3)

- [ ] **Step 1:** One-line comment edits in `ScheduledWorkArchitectureTest.java` and
      `focus-ring-baseline.spec.ts`; commit `Temporarily touch one platform and one frontend file to prove the miss path (#955)`;
      push; record the run (both jobs miss, full steps, save).
- [ ] **Step 2:** `git revert` that commit; push; record the run (both jobs hit — the trees are the
      ones phase 0 built). → AC-3.

## Phase 3 — gates and close-out

- [ ] Merge latest `origin/main` (routing gate on what the integration touches); mark ready for
      review; `pr-gates.md` §1 (review), §2 (Sonar list, with the false-zero check — this PR's
      code is `ci.yml`, outside `sonar.sources`, so the measures will be absent by construction and
      that is recorded, not relied on), §3 close-out written in the **last code-touching commit**
      per the rule this slice writes; retire `docs/plans/rv-proc-2-wording-fix.md` in that commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | plan (R-3) | every file the frontend job reads from outside `frontend/` — a spec/config reading a `../` path, or an action input naming a root file | `grep -rnE "'\.\./\|\"\.\./" frontend/src frontend/e2e frontend/*.ts` (imports excluded); `grep -n "node-version-file" .github/workflows/ci.yml` | `focus-ring-baseline.spec.ts` → `docs/design/non-text-contrast.md`; `playwright.config.ts` → `../platform` (real-backend suite, not in CI); `setup-node` → `.nvmrc` | the two CI-relevant files join the frontend key |
| 2026-09-05 | plan (R-3) | every file the backend job reads from outside `platform/` | `grep -rnE "Path\.of\(\|Paths\.get\(\|new File\(" platform/src/test/java`; `grep -n "rootDir\|\.\./" platform/build.gradle platform/settings.gradle` | none outside `platform/` | backend key = `platform/**` |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** phase-1 run — URL, wall time, restore/skip/upload evidence. Verified at commit `<sha>`.
- [ ] **AC-2:** phase-1 `SonarCloud Code Analysis` check run on the SHA + the `sonar` comment.
- [ ] **AC-3:** phase-2 miss run URL, then the revert's hit run URL.
- [ ] **AC-4:** `grep -n "paths-ignore" .github/workflows/ci.yml` → the comment.
- [ ] **AC-5:** `grep -n "code-touching" .claude/skills/riviera-sdlc/references/pr-gates.md .claude/skills/riviera-plan-doc/references/plan-doc-template.md` → both files.
- [ ] **AC-6:** both restore steps carry `if: github.event_name == 'pull_request'`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
