# Prettier Wrapper Retirement (one-time tree-wide reformat) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `scripts/check-prettier-format.mjs` (+ its test, ~660 lines) by making the
tree it was a workaround for clean: one dedicated `prettier --write` commit over
`frontend/src/` + `frontend/e2e/`, recorded in `.git-blame-ignore-revs`, with CI flipped to
bare `prettier --check` (#631).

**Architecture:** The single most significant decision is **sequencing under squash-merge**:
this repo squash-merges every PR (verified: `git log --merges` on `main` is empty), so "one
dedicated reformat commit on `main`" and "a blame-ignore file naming that commit's SHA" force
**three sequential PRs on the designated branch**, restarted from `main` between each — PR 0
(precursor: 3 comment fixes + this plan), PR A (the pure reformat, nothing else), PR B (the
blame-ignore file with A's squash SHA + the CI flip + deletions + doc twins). A single PR
would squash mechanics into the reformat commit, breaking both its blame-hiding and its
"mechanically reproducible from `npx prettier --write`" review property.

**Persistence:** JDBC only (invariant #1). N/A — no tables or migrations touched.

**Source of intent:** GitHub issue #631 (follow-up from the PR #630 discussion).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
squash-merge sequencing constraint and, via a trial reformat, the 3 RV-STYLE-1 guard
collisions that force PR 0) · `riviera-plan-doc` (this template — forced the parity ledger
over the wrapper's behaviors and the phase/PR decomposition) · `tdd` (each phase is
guard-verified: the guards and `prettier --check` are the failing-then-passing checks; no
authored logic to unit-test) · `riviera-review-overlay` (review gate — due per PR at
ready-for-review; RV-STYLE-2 is itself a doc twin this slice rewrites) ·
`riviera-docs-freshness` (pre-merge smoke planned over PR B's range — the slice retires a
mechanism several substrate docs state) · `riviera-local-debug` (cloud npm recipe; scoped
local runs: lint + vitest + the three guards over the trial diff) · `grilling` (intake gate
interview against today's code) · `riviera-frontend` / `angular-developer` /
`playwright-cli`: **N/A — deliberate**: the frontend diff is mechanical formatter output
plus 3 comment shortenings; no file placement, no authored Angular/e2e behavior. `postgres`
/ `riviera-modulith` / `riviera-java-conventions` / `riviera-stripe-payments`: N/A — no
backend, schema, or money surface in scope.

**Branch:** `claude/sdlc-631-66taum` (cloud session — the designated remote branch stands in
for `feature/prettier-wrapper-retirement` per the `riviera-sdlc` remote addendum; restarted
from `origin/main` between PR 0 → PR A → PR B, same name each time).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given PR 0 is merged, when `npx prettier --write src e2e` is run in
  `frontend/` and the resulting diff is judged by the two remaining hard hygiene guards,
  then `node scripts/check-inline-comments.mjs --diff origin/main` and
  `node scripts/check-focus-posture.mjs --diff origin/main` both exit 0. *Pinned by:* the
  guard runs recorded in Execution status, then PR A's `Repo hygiene (diff-scoped)` job.
- [x] **AC-2:** Given PR A is merged, when `npx prettier --check src e2e` runs in
  `frontend/`, then it exits 0 — the whole scope is clean, which is the precondition for
  retiring line-scoping. *Pinned by:* the local check recorded in Execution status, then
  permanently by PR B's flipped CI step.
- [ ] **AC-3:** Given PR B, when the `frontend` CI job runs on a pull request, then its
  Format step executes bare `npx prettier --check src e2e` (no wrapper), the job's
  **name is unchanged** (`frontend` is a ruleset-required context by name), and
  `scripts/check-prettier-format.mjs` + its test no longer exist (the hygiene job's
  `node --test "scripts/*.test.mjs"` glob needs no edit). *Pinned by:* PR B's green CI run
  + `git ls-files scripts/ | grep prettier` returning nothing.
- [ ] **AC-4:** Given PR B, when `git blame` (or GitHub's blame view) is consulted for a
  file the reformat touched, then PR A's squash SHA is listed in `.git-blame-ignore-revs`
  at the repo root and `CONTRIBUTING.md` documents
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`. *Pinned by:* a recorded
  `git blame --ignore-revs-file` run attributing reformatted lines to pre-reformat commits.
- [ ] **AC-5:** Given PR B, when a developer runs `npm run format:check` (or
  `npm run format`) from `frontend/`, then it executes `prettier --check src e2e`
  (respectively `prettier --write src e2e`) — no `--diff`/`--fix` wrapper semantics.
  *Pinned by:* `frontend/package.json` scripts in PR B's diff + a recorded local run of each.
- [ ] **AC-6:** Given PR B, when the doc twins are read, then none still describes a
  diff-scoped Prettier gate: RV-STYLE-2 (review overlay) reframed to "formatting is
  `prettier --check`'s job", root `CLAUDE.md`'s CI paragraph, `riviera-local-debug`'s
  frontend recipe, `frontend/.prettierignore`'s header rationale, and `ci.yml`'s two
  comment blocks (frontend Format step + hygiene-job constraint note). *Pinned by:* a
  stale-phrase grep over those files recorded in Execution status (remaining "diff-scoped"
  hits may only be historical plan docs or the other guards, which stay diff-scoped).

## Non-goals

- **No reformat outside `frontend/src/` + `frontend/e2e/`** — `scripts/`, `docs/`,
  `platform/`, and `frontend/`'s own root (`angular.json`, `README.md`,
  `frontend/.claude/CLAUDE.md`, the Playwright configs) never agreed to Prettier's config
  (`resolveConfig` is null outside `frontend/`; the root files are tool- or prose-owned —
  PR #618's call, restated by #631).
- **No porting of the focus-posture or inline-comment guards to ESLint** — considered and
  deliberately not filed (#631 "Explicitly out of scope"; revisit trigger recorded on #628).
- **No change to the other three guard scripts or `git-diff.mjs`** — the shared diff library
  keeps its three remaining importers.
- **No Prettier version bump and no `.prettierrc` rule changes** — the pinned 3.9.5 does the
  reformat; rule values were out of scope for #615 and stay out.

## Behavior-parity ledger (retirement / replacement slices only)

The wrapper is a retired surface; its behaviors, each with a verdict:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Judges only the **lines the diff wrote** (added-line scoping) | dropped (reason: its premise dies) | Line-scoping existed solely because ~200 files carried drift; after PR A the tree is clean, so whole-scope `--check` imposes nothing unrelated |
| `--fix` rewrites exactly the reported hunks, preserving a file's pre-existing drift | dropped (reason: no drift left to preserve) | `npm run format` (`prettier --write src e2e`) — safe post-reformat, and "format on save" becomes safe too |
| `--files <path…>` mode (judge specific files vs HEAD) | dropped | Bare `npx prettier --check <path>` covers it with no wrapper |
| Scope limited to `frontend/src/` + `frontend/e2e/` | preserved | The scope is now the CI step's / npm scripts' explicit `src e2e` args |
| Parse-failure on one file warns + skips it (survivable), config errors propagate | changed (stricter, deliberate) | Bare `prettier --check` fails on an unparseable file — acceptable: an unparseable source file should fail CI anyway (lint/build would) |
| Lazily resolves Prettier so a tree that never ran `npm ci` passes vacuously | preserved by placement | The CI step stays in the `frontend` job **after** `npm ci` (`steps.install.outcome == 'success'` guard); locally the npm scripts already require an install |
| Coarse-hunk refusal in `--fix` (never rewrite an unresolvable region) | dropped (moot) | Whole-file writes are the intended behavior now |
| Runs on `pull_request` events only (a push to `main` had no meaningful diff base) | changed | Bare `--check` needs no base; the step now also runs on `main` pushes as a cheap post-merge invariant (the `if:` keeps only the install-succeeded guard) |
| CI red prints the offending hunks with expected output | changed (less detailed, standard) | `prettier --check` lists offending files; `npm run format` fixes them — the standard workflow every editor understands |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | PR A (196 files, ~2 856 insertions) fails the Sonar gate: reformatted lines count as *new code* via SCM blame, so new-code coverage < 80% or stray "new" issues on moved lines | med | med | Formatting-only PR — triage the reported list per pr-gates §2; a coverage shortfall on purely-moved lines is resolved-with-rationale (no logic changed, whole-file coverage unchanged); escalate to the maintainer only if SonarCloud UI access is needed | agent | **closed** — did not materialise: PR #634's gate passed with 0 issues and **95.9%** new-code coverage |
| R-2 | Squash-merge collapses "dedicated reformat commit" + mechanics into one commit; blame-ignore SHA unknowable pre-merge | high (certain) | high | The three-PR sequencing (this plan's Architecture); `.git-blame-ignore-revs` written in PR B, after PR A's squash SHA exists | agent | **closed** — sequencing held: PR 0 `653603a` → PR A `1a6933d` (pure reformat) → PR B names that SHA in `.git-blame-ignore-revs` |
| R-3 | The reformat conflicts with open branches (issue's "timing" caution) | low | med | Verified at plan time: the only open PRs are 17 Dependabot bumps touching `package.json`/lockfiles — outside the reformat scope entirely | agent | **closed** — verified 2026-08-11, no human branch in flight |
| R-4 | The reformat's re-indents drag pre-existing guard violations into the diff, failing the hygiene job on PR A | high (observed) | med | Trial reformat run at plan time: `check-focus-posture` exits 0; `check-inline-comments` flags exactly 3 pre-existing multi-line inline comments → PR 0 shortens each to one line **before** the reformat | agent | **closed** — PR 0 merged; guards re-ran exit 0 on the live PR A diff |
| R-5 | The reformat breaks tests or lint despite being "formatting only" | low | high | Verified at plan time on the trial reformat: ESLint passes, all 156 Vitest files / 1 372 tests pass; Playwright a11y e2e verified by PR A's CI | agent | **closed** — PR #634 CI green incl. the a11y e2e; local lint + 1 372 tests green on the reformatted tree |
| R-6 | Drift re-enters `main` between PR A and PR B (window where the tree is clean but CI still runs the wrapper) | low | low | The wrapper stays active until PR B flips the step; any interim PR's *added* lines are still gated, so the clean scope cannot regress through a gated merge | agent | **closed** — nothing merged in the window except PR A itself |
| R-7 | Prettier version skew between the trial, PR A, and CI produces different output | low | med | Prettier is pinned by `frontend/package-lock.json` (3.9.5) and CI installs via `npm ci`; no bump in scope (Non-goals) | agent | **closed** — the same pinned install produced the trial, PR A, and the CI checks |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Assumption:** the repo squash-merges all PRs (uniform single-commit-per-PR history, zero
  merge commits on `main`) — so the plan's three-PR sequencing is required, not optional.
  *Resolved at plan time:* verified via `git log --merges origin/main` (empty) and the
  `(#NNN)`-suffixed one-commit-per-PR history.
- **Decision (agent-made, recorded):** the new CI Format step drops the
  `github.event_name == 'pull_request'` condition — bare `--check` needs no diff base, and
  running it on `main` pushes is a free post-merge invariant. Kept: the
  `!cancelled() && steps.install.outcome == 'success'` guard (a failed `npm ci` must not
  produce a second misleading red). Ships in PR B.
- **Decision (agent-made, recorded):** add a `format` npm script (`prettier --write src e2e`)
  alongside the flipped `format:check`. `.prettierignore`'s "deliberately no `format`
  script" rationale dies with the drifted tree; its header comment is rewritten in PR B.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no backend, no booking/map surface; the diff is
formatter output, guard-script deletion, CI config, and docs.

## Spring Modulith — modules, interfaces, events

N/A — frontend-tooling-only. No backend code in scope; no module, port, or event touched.

### Module ownership (§4a)

N/A — no behavior added or moved in any backend module.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — 196 files under `frontend/src/` + `frontend/e2e/` are rewritten by Prettier and 3
comments shortened, but no component, route, service, form, template *behavior*, or file
placement changes. Verified behavior-neutral by lint + full Vitest suite at plan time
(trial reformat) and to be re-verified by CI (incl. the a11y e2e) on PR A.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** implement (phase B — PR B built; opening the PR, then gates)

**Next action:** open PR B, run CI + review + Sonar gates, write the final close-out (citing
`merged via PR #NN`) as PR B's last commit, merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — PR 0: precursor (3 comment shortenings + this plan doc) | ✅ | `38eb5c2` — merged via PR #633 (squash `653603a`) |
| A — PR A: the pure reformat commit | ✅ | merged via PR #634 (squash `1a6933d9a7778d7bec71b94d03a15357f2cf20b7`, recorded in `.git-blame-ignore-revs`) |
| B — PR B: blame file + CI flip + deletions + doc twins + close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Plan-time verification already run** (2026-08-11, recorded so no session re-derives it):
`npm ci` + trial `npx prettier --write src e2e` over `main`@`eb760a1` → 196 files,
+2 856/−1 466; on that diff: `check-focus-posture` exit 0, `check-prettier-format` (the
wrapper itself) exit 0, `check-inline-comments` exit 1 with exactly 3 findings
(`operator-venue.e2e.ts:115`, `app.html:135`, `booking-dialog.contrast.spec.ts:88`);
ESLint clean; Vitest 156 files / 1 372 tests green. Trial then reverted.

**PR A purity note (deliberate plan-doc-discipline deviation):** PR A is to contain the
reformat and nothing else — its Execution-status updates ride in PR 0 (pointer set to
"PR A next") and in PR B's first commit (recording A's squash SHA), because a plan-doc edit
inside PR A would land in the blame-ignored squash commit and break its "reproducible from
`npx prettier --write`" property.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-0 | CI wrapper (PR 0, pre-push) | the 3 shortened comments sat at the *old* indentation; Prettier targets the post-reformat indent, so the wrapper flagged the new lines | fixed pre-push via `npm run format:check -- --fix` (recorded in Phase 0 step 2) |
| — | review (PR #633, /code-review + overlay) | zero findings | closed |
| — | review (PR #634, /code-review + overlay; all 196 files byte-verified as pinned-Prettier output) | zero findings | closed |
| — | sonar (PR #633: 0 issues; PR #634: 0 issues, 95.9% new-code coverage) | zero findings — R-1 did not materialise | closed |

**Docs-freshness (pre-merge smoke, PR B's range):** rename/removal grep + counting sweep
("four hygiene checks" → three diff-scoped + one whole-scope; "200 prettier-dirty files"
premise) both clean after this diff's patches — zero additional findings. One issue-drift
note: #631 listed `frontend/.claude/CLAUDE.md` as a doc twin, but it contains no Prettier
reference (its guard sections cover RV-STYLE-1 and the focus guard only) — nothing to
update there. Also retired alongside the wrapper: the frontend job's
`Fetch the base branch` step and `fetch-depth: 0`, which existed solely as the wrapper's
diff base.

---

## File structure

- `docs/plans/prettier-wrapper-retirement.md` — this plan (PR 0; final state PR B)
- `frontend/e2e/operator-venue.e2e.ts` — PR 0: comment shortened; PR A: reformat
- `frontend/src/app/app.html` — PR 0: comment shortened; PR A: reformat
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — PR 0: comment shortened; PR A: reformat
- `frontend/src/**` — PR A: mechanical `prettier --write` output
- `frontend/e2e/**` — PR A: mechanical `prettier --write` output
- `.git-blame-ignore-revs` — PR B: created, names PR A's squash SHA
- `CONTRIBUTING.md` — PR B: setup pointer `git config blame.ignoreRevsFile`
- `.github/workflows/ci.yml` — PR B: Format step flipped to bare `prettier --check`; two stale comment blocks updated
- `scripts/check-prettier-format.mjs` — PR B: deleted
- `scripts/check-prettier-format.test.mjs` — PR B: deleted
- `frontend/package.json` — PR B: `format:check` flipped; `format` added
- `frontend/.prettierignore` — PR B: header rationale rewritten
- `CLAUDE.md` — PR B: CI-checks paragraph updated
- `.claude/skills/riviera-review-overlay/SKILL.md` — PR B: RV-STYLE-2 reframed
- `.claude/skills/riviera-local-debug/SKILL.md` — PR B: frontend recipe line updated

---

## Phase 0 — PR 0: precursor comment fixes + plan doc

**Files:** Create `docs/plans/prettier-wrapper-retirement.md` · Modify
`frontend/e2e/operator-venue.e2e.ts:115-116`, `frontend/src/app/app.html:135-136`,
`frontend/src/app/booking/booking-dialog.contrast.spec.ts:88-89`

- [x] **Step 1: The failing check** — trial reformat diff +
  `node scripts/check-inline-comments.mjs --diff origin/main` → FAIL (exit 1, 3 findings).
  Run at plan time (recorded above).
- [x] **Step 2: Minimal fix** — shorten each of the 3 multi-line inline comments to one
  line (RV-STYLE-1's own remedy), preserving meaning; no other edits. The wrapper then
  flagged the 3 new lines' *indentation* (Prettier targets the post-reformat indent), fixed
  with its own `npm run format:check -- --fix` — the supported remedy.
- [x] **Step 3: Verify** — all four guards exit 0 on PR 0's own diff; trial reformat on top
  re-run: `check-inline-comments` + `check-focus-posture` exit 0 on the trial diff (AC-1
  pre-verified); trial reverted.
- [x] **Step 4: Commit + draft PR** — commit `38eb5c2`, PR #633 (opened draft, marked ready
  the same hour — the slice was complete).
- [x] **Step 5: Gates + merge** — CI 8/8 green; review gate zero findings; Sonar clean
  (0 issues) → squash-merged as `653603a`.

## Phase A — PR A: the pure reformat

**Files:** every Prettier-dirty file under `frontend/src/` + `frontend/e2e/` (196 at plan
time), formatter output only.

- [x] **Step 1: Restart branch** from latest `origin/main` (same designated name) after
  PR 0's merge.
- [x] **Step 2: Reformat** — from `frontend/`: `npx prettier --write src e2e`. Nothing else
  in the commit; the commit message states the command.
- [x] **Step 3: Verify locally** — `npx prettier --check src e2e` → exit 0;
  `check-inline-comments` + `check-focus-posture` over the diff → exit 0; `npm run lint` →
  clean; `npm test` → 156 files / 1 372 green.
- [x] **Step 4: Commit + PR** — PR #634, body says "verify reproducibility, don't read
  lines".
- [x] **Step 5: Gates + merge** — CI 8/8 green; review gate: /code-review byte-verified all
  196 files as pinned-Prettier output, zero findings; Sonar clean (95.9% new-code
  coverage — R-1 did not materialise); squash-merged as `1a6933d`.

## Phase B — PR B: retire the wrapper

**Files:** Create `.git-blame-ignore-revs` · Modify `.github/workflows/ci.yml`,
`frontend/package.json`, `frontend/.prettierignore`, `CONTRIBUTING.md`, `CLAUDE.md`,
`.claude/skills/riviera-review-overlay/SKILL.md`,
`.claude/skills/riviera-local-debug/SKILL.md`, this plan · Delete
`scripts/check-prettier-format.mjs`, `scripts/check-prettier-format.test.mjs`

- [x] **Step 1: Restart branch** from latest `origin/main`; PR A's squash SHA recorded
  (`1a6933d9a7778d7bec71b94d03a15357f2cf20b7`).
- [x] **Step 2: Blame plumbing** — `.git-blame-ignore-revs` naming that SHA (+ context
  comment); CONTRIBUTING.md §2 gains the one-time
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` line.
- [x] **Step 3: CI flip** (also retired the frontend job's `Fetch the base branch` step +
  `fetch-depth: 0` — they existed solely as the wrapper's diff base) — Format step: `npx prettier --check src e2e`; comment block
  rewritten (why it lives in the `frontend` job: pinned install; job name is the required
  context — unchanged); `if:` per the parity-ledger row. Hygiene-job comment updated (the
  Prettier-guard sentence retired).
- [x] **Step 4: Deletions + scripts** — delete the wrapper + its test;
  `format:check` → `prettier --check src e2e`; add `format`; rewrite `.prettierignore`
  header.
- [x] **Step 5: Doc twins** — root `CLAUDE.md` CI paragraph; RV-STYLE-2 reframed
  ("formatting is `prettier --check`'s job, not the reviewer's" — the never-hand-flag rule
  survives; the never-ask-whole-file-reformat rule retires with its premise);
  `riviera-local-debug` recipe line.
- [x] **Step 6: Verify** (guard suite 28 tests green; both npm scripts clean; sweeps clean) — `node --test "scripts/*.test.mjs"` green;
  `npm run format:check` + `npm run format` run clean; `check-plan-file-structure` exit 0;
  the AC-6 stale-phrase grep clean.
- [ ] **Step 7: Close-out in-PR** — `riviera-docs-freshness` pre-merge smoke over PR B's
  range; plan final state citing `merged via PR #NN`; ready → review gate + Sonar gate →
  merge → close-out checklist (epic tick N/A — no parent epic; issue #631 closes via PR B).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Phase B (retiring one of four guards) | do the other three guards share the wrapper's retire-me property (an off-the-shelf tool already embedded)? | issue #631's own analysis re-checked against `.claude/settings.json` (the other three run as dependency-free `PostToolUse` hooks — an authoring-time role the wrapper never had) | 0 | none retired; the ESLint port stays deliberately unfiled, revisit trigger on #628 |
| 2026-08-11 | Phase 0 (the 3 flagged comments) | other multi-line inline comments the reformat would drag in | the trial reformat diff itself + `check-inline-comments.mjs --diff` (exhaustive for this diff by construction) | exactly 3 | all 3 fixed in PR 0; no wider sweep — standing-tree violations outside the reformat's blast radius stay grandfathered (#529's diff-scoped thesis) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** guard runs over the live reformat diff → exit 0. Verify at PR A.
- [ ] **AC-2:** `npx prettier --check src e2e` → exit 0. Verify at PR A / PR B.
- [ ] **AC-3:** PR B CI green with bare `--check`; wrapper + test absent from `git ls-files`.
- [ ] **AC-4:** `.git-blame-ignore-revs` names PR A's squash SHA; blame run recorded.
- [ ] **AC-5:** `npm run format:check` / `npm run format` run scoped and clean.
- [ ] **AC-6:** stale-phrase grep clean over the doc twins.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying check.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases. (N/A — no typed code authored.)
- [ ] **No JPA** introduced (invariant #1). (Nothing on the backend touched.)
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4). (N/A — untouched.)
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** justified N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone rules untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no Flyway migration (invariant #12).
- [ ] **Frontend** standards: no authored Angular; formatter output verified behavior-neutral.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the pr-gates §1 invocation ladder plus the
      `riviera-review-overlay` bank walk, on each of the three PRs.
