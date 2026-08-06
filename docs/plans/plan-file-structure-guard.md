# Plan-doc File-structure Guard Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A diff-scoped check that reports every path a PR changed which the PR's plan-doc
**File structure** section does not list, wired as a hard CI gate and runnable by hand at
close-out.

**Architecture:** One dependency-free Node script, `scripts/check-plan-file-structure.mjs`,
built as a pure detector (`section text + changed paths → findings`) behind a thin git
front-end — the shape `scripts/check-inline-comments.mjs` established in #529, so the
detector is testable without a repository. The single significant decision is **where it
runs in CI**: it becomes a second step inside the existing `Inline comments (RV-STYLE-1)`
job rather than a new job, because that job name is a *required status check context* in the
`Riviera Rule Set` ruleset (#534) — a new job would report but not block until a maintainer
edits the ruleset, and a renamed job would make every PR unmergeable (`405 … N of N required
status checks are expected`, the #413/#420 failure).

**Persistence:** N/A — no database, no migration, no backend code. JDBC-only (invariant #1)
is untouched.

**Source of intent:** GitHub issue **#533** (split out of #529). Decision recorded on the
issue per its AC-1.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
blocker the issue does not mention: the CI job name is a ruleset-required context, which
rules out both a rename and, for a same-day hard gate, a new job) · `riviera-plan-doc` (this
template — forced the Non-goals section that fixes the check's direction as diff∖plan only,
and the risk register that surfaced the draft-PR red-while-lagging posture) · `tdd` (each
phase writes the failing `node --test` case first; every parser idiom is pinned as a
regression fixture *before* the parser learns it — six of them, the sixth found by the audit) · `riviera-review-overlay` (review gate
— due at ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`,
**2 findings, both patched** — the counting sweep was the point: this slice makes the *second*
diff-scoped hygiene check, so `CLAUDE.md`'s CI/CD paragraph and `docs/plans/ci-pipeline.md`'s
required-context note both described a job that runs one)

> Routed skills the gate did **not** match, and why: `postgres` (no migration), `riviera-modulith`
> + `riviera-java-conventions` (no backend Java), `riviera-frontend` + `angular-developer` +
> `playwright-cli` (nothing under `frontend/src` or `frontend/e2e` — `scripts/` is repo tooling,
> not the Angular app), `riviera-stripe-payments` (no money). `riviera-local-debug` loaded: the
> guard's suite is dependency-free `node --test`, so neither the Gradle recipe nor the OOM-scoping
> rule binds here.

**Branch:** `claude/sdlc-533-ald45m` — the cloud session's designated remote branch stands in
for `feature/plan-file-structure-guard` (`riviera-sdlc` §Remote/cloud session addendum).

---

## Acceptance criteria (testable)

> Written against the detector — the inner boundary — not against GitHub Actions. The CI
> wiring is asserted once, at the adapter level, by this PR's own run.

- [x] **AC-1:** Given a diff whose plan doc lists every changed path, when the guard runs, then it
  reports nothing and exits 0. *Pinned by:* `check-plan-file-structure.test.mjs` ›
  `"a complete section passes — PR #526 as merged"` (real data: the 11 paths of `a02c199`).
- [x] **AC-2:** Given a diff that changes a path the section omits, when the guard runs, then it
  names exactly that path and exits 1. *Pinned by:* `check-plan-file-structure.test.mjs` ›
  `"reports exactly the paths the section omits"`.
- [x] **AC-3:** Given a diff containing no `docs/plans/*.md`, when the guard runs, then it exits 0
  and reports nothing — a slice that legitimately skips the plan doc (`riviera-sdlc` rule 6) is
  not failed for a missing section. *Pinned by:* `check-plan-file-structure.test.mjs` ›
  `"a slice with no plan doc passes cleanly"`.
- [x] **AC-4:** Given the real merged diff of PR #522 (28 paths) and its plan doc's section, when the
  guard runs, then it flags exactly `CONTEXT.md` and
  `platform/…/venue/application/CommissionRateCommand.java` and exits 1. *Pinned by:*
  `check-plan-file-structure.test.mjs` › `"real case: PR #522 undercounts by two"`.
- [x] **AC-5:** Given PR #526's plan doc with the three bullets its review added (F-1/F-2/F-3)
  removed — the section as it stood *before* the review gate corrected it — when the guard runs,
  then it flags exactly `frontend/src/app/app.spec.ts`,
  `frontend/src/app/admin/admin-console-tabs.spec.ts` and
  `frontend/e2e/admin-console-tabs.e2e.ts`. *Pinned by:*
  `check-plan-file-structure.test.mjs` › `"real case: PR #526 before its review fixed the section"`.
- [x] **AC-6:** Given a section written in each of the **six** path idioms real plan docs already use
  — repo-relative suffix (`payout/application/DailyTakingsServiceTest.java`), sibling extension
  (`` `privacy-policy.ts` `` then `` `.html` ``), brace set (`{a,b}.e2e.ts`), pipe alternation
  (`venue-create-card.ts|.html`), a directory (`frontend/src/app/venue-admin/`), and `**` crossing
  directories (`frontend/src/app/**/*.contrast.spec.ts`) — when the guard runs over paths those
  forms denote, then it reports nothing, **and** a single `*` still does not cross a `/`.
  *Pinned by:* `check-plan-file-structure.test.mjs` › the six `"idiom: …"` cases. (The sixth came
  from phase 1's generalization audit, not the plan — see the audit log.)
- [x] **AC-7:** Given a plan doc with no `## File structure` section, when the diff changes only that
  doc, then the guard is clean; when the diff also changes other paths, then those paths are
  reported together with a `no "## File structure" section` note. *Pinned by:*
  `check-plan-file-structure.test.mjs` › `"a missing section reports the paths, not the section"`.
- [x] **AC-8:** Given a diff containing the plan doc itself and `frontend/package-lock.json`, when the
  guard runs, then neither is ever reported. *Pinned by:*
  `check-plan-file-structure.test.mjs` › `"the plan doc and lockfiles are exempt"`.
- [x] **AC-9:** Given this PR, when CI runs, then the `Inline comments (RV-STYLE-1)` job executes the
  new step and the job is green. *Verified by:* this PR's own Actions run (recorded in
  *Acceptance-criteria verification*), not by a unit test.
- [x] **AC-10:** Given a session at merge close-out, when it consults `riviera-plan-doc`, then the
  skill names the exact command instead of asking for the comparison by hand. *Verified by:*
  `grep -r "check-plan-file-structure" .claude/skills/riviera-plan-doc/` returning both SKILL.md
  and the template.

## Non-goals

- **The reverse direction.** A path listed in the plan but absent from the diff is *not* reported.
  A plan is written before the work; a file that turned out unnecessary is normal drift, and
  flagging it would punish planning ahead (issue #533, constraint 2).
- **Format enforcement.** The guard extracts paths; it does not require a particular heading
  shape, a New/Modified split, or a count in the heading.
- **A `Stop` hook.** The rule needs the whole diff, and mid-slice the plan legitimately lags the
  code; a per-turn hook would fire on nearly every turn. CI + the by-hand CLI is the decided
  surface.
- **Renaming the CI job to a generic hygiene name.** Correct end state, but the job name is a
  ruleset-required context — the rename and the ruleset edit must land together, which one PR
  cannot do. Deferred to **issue #539** (R-5).
- **Retro-fixing the 24 historical plan docs** the spike found undercounting. The guard is
  diff-scoped; history stays as it is.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` The existing `inline-comments` job keeps its name and its
trigger unchanged, and this slice only appends a step. Its two pre-existing steps keep their `run:`
commands byte-for-byte; both were **renamed** (`Test the guard itself` → `Test the guards
themselves`, `Check the diff (hard gate)` → `Check the diff for multi-line inline comments
(RV-STYLE-1, hard gate)`) because a job running two rules needs each step to say which one it is.
Step names are not check contexts, so nothing downstream reads them (F-3).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Renaming or replacing the `Inline comments (RV-STYLE-1)` job silently drops a ruleset-required context, and **every** PR becomes unmergeable (`405 … N of N required status checks are expected`, #413/#420) | low | high | The job's `name:` is not touched. The new step goes inside it; a comment above the `name:` records that the string is load-bearing and points at #534 and `docs/plans/ci-pipeline.md` | this slice | closed — `name:` byte-for-byte unchanged (asserted while wiring: the ruleset context still reads `Inline comments (RV-STYLE-1)`), and a `DO NOT RENAME` comment above it states what breaks. `c22bfd2` |
| R-2 | False positives from a path idiom the parser does not know — the failure mode that gets a gate switched off (#529's own lesson) | med | high | Five idioms harvested from real plan docs are pinned as red-first fixtures (AC-6) before the parser learns them; the spike measured 8/8 false positives on PR #464 from the sibling-extension idiom alone, which is now a fixture. Residual escape hatch: list the path — that is the fix the guard is asking for | this slice | **closed, and the risk fired twice** — once in phase 1's audit (`**` globs) and once on this PR's own CI run (dot-directory paths, F-1). Both became fixtures; the historical false-positive count fell 390 → 373. The mitigation is what caught them, so it is doing its job rather than being untested. `b8140d3`, `723a13c` |
| R-3 | The gate reds a draft PR mid-slice, when the plan legitimately has not caught up with the diff yet | high | low | Accepted, and identical to the red-TDD push posture `riviera-sdlc` already exempts from the CI gate. The check is only merge-blocking at ready-for-review | this slice | closed as accepted — it fired exactly once, on this PR, and was a real bug rather than lag (F-1). No change to the posture |
| R-4 | A red result surfaces under a check named `Inline comments (RV-STYLE-1)`, sending the author looking for a comment problem | med | med | The step name and the error message both say `plan doc` and name the file; the message leads with the fix. Structural fix deferred to R-5 | this slice | closed as accepted, mitigated — the step name reads `Check each plan doc lists what the diff changed (#533, hard gate)` and the message names the file and the fix. Structural fix tracked by **#539** |
| R-5 | The job name stays a misnomer once it gates two rules | high | low | Follow-up issue: rename the job **and** the ruleset context together (maintainer-only, the #534 shape). Not doable in a diff alone | maintainer | closed → **issue #539** (rename the job and the ruleset context together; sketched here as add-then-remove, executed by PR #540 as a single old→new swap instead — with both names required the rename PR itself, reporting only the new name, could never merge; rationale in `ci-pipeline.md` *Open questions*) |
| R-6 | A slice whose plan doc landed in an earlier PR has no `docs/plans/*.md` in this diff, so the guard passes vacuously | med | low | Accepted by design — indistinguishable from "no plan doc" (constraint 1), and the alternative (guessing the doc from the branch name) is worse. Recorded here so the limitation is not rediscovered | this slice | closed as accepted — documented limitation, not a defect. Recorded here and in the guard's header |
| R-7 | A docs-only close-out PR touching an *older* plan doc is read as that doc's slice and fails | med | med | Two mechanics remove it: plan docs in the diff are themselves exempt (AC-8), and multiple plan docs contribute a **union** of listed paths rather than being skipped. A close-out touching only plan docs therefore has nothing left to check | this slice | closed — verified by the union/exemption mechanics (`several plan docs in one diff contribute a union of listings`) and by this PR itself, whose first push was plan-doc-only and passed |

## Open questions / Assumptions

*Empty — every entry resolved below.*

### Resolved

- **Assumption:** `git diff --name-only` over the PR's base is the right path set, including
  deletions and renames. — **Confirmed** in phase 2 and exercised on every push since: a rename
  shows as its new path, a delete as its old, and listing a deleted path is still what a resuming
  reader needs. `572a92d`

- **Open question:** build the guard, or close #533 as `wontfix`? — **Resolved:** build it as a
  **hard CI gate**, with a by-hand CLI named in `riviera-plan-doc`. Decided by the maintainer
  after a spike over the last 60 `main` commits found **31** slices carrying a plan doc and only
  **7** listing every changed path — the recurrence is the norm, not the five slices #533 names.
- **Open question:** new CI job, or a second step in the existing one? — **Resolved:** second step.
  A new job cannot block a merge until the ruleset names it (#534), which would have delivered an
  advisory check under the label "hard gate".

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `booking`, `availability`, or beach-map code is in
scope; the slice adds no write path to `availability(set_id, booking_date)` and no backend code
at all.

## Spring Modulith — modules, interfaces, events

`N/A — no backend code in scope.` No module, `api/`/`spi/` port, domain event, or JDBC adapter
is touched; invariant #11 is not in play. No Module-ownership table (§4a) is required — the
slice adds no application behavior to any module.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; no Stripe, ledger, or commission code is touched.

## Angular — frontend surfaces touched

`N/A — no frontend surface.` `scripts/` is repo tooling that never ships in the SPA bundle;
nothing under `frontend/src` or `frontend/e2e` changes.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or wire shape is touched.

## Execution status

**Stage pointer:** `merge close-out` — every gate passed; awaiting the maintainer's merge call.

**Next action:** Merge PR #538, then the post-merge remainder, which is GitHub-only and needs no
commit: confirm #533 closed, and #539 already carries the deferred R-5 finding.

**Gate results (all on `86f5f39`, the fix-round head):**

| Gate | Result |
|---|---|
| CI | `Backend`, `Frontend`, `Inline comments (RV-STYLE-1)` all **success** |
| Review | **Ran in full** — rung-1 `code-review` fan-out + overlay; 5 findings, all fixed |
| Sonar | Gate **passed**; `api/issues/search` **total 0**, re-read after the fix push |
| Overlay re-walk | RV-STYLE-1 mechanical half clean; RV-PROC-1 covered; guard clean on its own diff |

> **Sonar's reach here is narrower than its badge suggests, and the plan says so rather than
> banking the green.** `sonar.sources=platform/src/main/java,frontend/src` excludes `scripts/`, so
> this PR's "0.0% coverage on new code" and "0.0% duplication on new code" measure *nothing* about
> the guard — they are not evidence it is untested (41 `node --test` cases) or un-duplicated (that
> call was made on merits, F-5). The Sonar gate is genuinely clear; it is simply clear about the
> Java and Angular trees, which this slice does not touch.

> Phase SHAs are recorded by the **next** phase's commit, not by amending the phase's own. A
> commit cannot contain its own hash; amending to insert it rewrites the hash again, which is how
> the `7957f43` this row first carried stopped existing.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Detector core: section parse + set comparison | ✅ | `6dd67d3` |
| 1 — Path idioms + exemptions + the real-case fixtures | ✅ | `b8140d3` |
| 2 — Git front-end and CLI | ✅ | `572a92d` |
| 3 — CI wiring + `riviera-plan-doc` names the command | ✅ | `c22bfd2` |
| 4 — Docs sweep + close-out | ✅ | `723a13c` (F-1/F-2 + the sweep) · `6e1644d` (close-out) |
| 5 — Review-gate findings F-3…F-7 | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run `31094385031`, the guard failing on its **own** PR) | Paths rooted at a dot-directory (`.github/…`, `.claude/…`) were invisible to the parser: a path had to open with a word character, while a leading dot was read as "sibling extension". All three of this slice's own tooling paths were flagged despite being listed. The two forms are told apart by the `/`, not by the dot | fixed — `isPath` now admits dot-rooted paths and extension-less dotfiles, and `SIBLING_EXT` applies only when a path precedes it on the line. Pinned by `a path rooted at a dot-directory is a path, not an extension` **and** `a bare extension is still an extension when a path precedes it`, so the widening did not undo the #464 idiom. Re-running the 60-commit audit dropped the historical flag count 390 → **373**: 17 paths that were false positives all along |
| F-2 | CodeQL (high, `check-plan-file-structure.mjs:122`) | `String#replace` without `/g` in `globBody` — "replaces only the first occurrence". Correct in practice only because it was handed one character at a time, which is an accident rather than a design | fixed — a `RESERVED` set membership test, no regex replace. `*` is deliberately **not** in the set: it is the one character that must never be escaped, and the scanner consumes it before this branch |
| F-3 | Review gate (agent: doc-claims-vs-code) | The Behavior-parity ledger said the job "keeps its existing two steps unchanged", but the diff renames both (their `run:` commands are untouched) | fixed — the ledger now says exactly that: `run:` byte-for-byte, names sharpened because a job running two rules needs each step to say which one it is, and step names are not check contexts |
| F-4 | Review gate (agent: git history) | The `ci-pipeline.md` insertion landed mid-paragraph, between two sentences both explaining the "returned to 7" count — factually right, but it read as a stutter | fixed — the #419-vs-#534 count explanation is left intact and the #533 note moved to its own paragraph |
| F-5 | Self-caught while reading the Sonar gate's own false-clean guard | The phase-2 audit row deferred the `git()`/`rangeFor()` duplication decision to "the Sonar gate as arbiter". `sonar-project.properties` sets `sonar.sources=platform/src/main/java,frontend/src` — **`scripts/` is outside Sonar's scope**, so its "0.0% duplication on new code" says nothing about these files. The referee was blind, and the PR's green Sonar badge would have looked like vindication | fixed — decided on merits instead and the row rewritten to say so. Same caveat applies to "0.0% coverage on new code": the guard has 41 `node --test` cases, but Sonar never analyzed `scripts/`, so that figure measures nothing here |
| F-6 | Review gate (agent: bug scan) | `git diff --name-only` C-quotes and octal-escapes any path holding a non-ASCII byte (`"src/logo-\360\237\230\200.png"`), so the literal could never match a listed token: **every** diff touching such a file failed unconditionally, with no way to satisfy the check. Reproduced in a scratch repo before fixing | fixed — `-z` plus `changedPaths()`, pinned by `changedPaths splits git -z output…` and re-verified end-to-end against the emoji-path repo (now clean) |
| F-7 | Review gate (agent: bug scan) | A bare filename was suffix-matched like any other token, so one common name blanket-covered every same-named path in the diff — a false **negative**, the one direction this guard cannot afford | fixed, after the **first fix was measured and rejected**. Requiring a `/` in every token false-flagged 11 legitimately bare-named files on PR #516 alone — the R-2 "noisy gate gets switched off" mode. The shipped rule instead resolves a bare name against the path before it on the line (`beside`) and treats a bare name matching 2+ changed paths as ambiguous (`unambiguous`). Measured over 33 real slices: **+2 newly flagged paths in all of history**, both on one slice that wrote a bare `CLAUDE.md` while two different `CLAUDE.md` files changed |

---

## File structure

> This slice's own section, held to the standard it ships. `git diff --name-only origin/main...HEAD`
> is the check — and from phase 3 on, `node scripts/check-plan-file-structure.mjs --diff` is.

**New (3)**

- `scripts/check-plan-file-structure.mjs` — the detector (pure: section text + changed paths →
  findings), the git front-end, and the CLI.
- `scripts/check-plan-file-structure.test.mjs` — the `node --test` suite; owns AC-1…AC-8,
  including the two real-history fixtures.
- `docs/plans/plan-file-structure-guard.md` — this plan.

**Modified (5)**

- `.github/workflows/ci.yml` — one step appended to the existing `inline-comments` job, plus a
  comment recording that the job's `name:` is a ruleset-required context and must not change.
- `.claude/skills/riviera-plan-doc/SKILL.md` — the execution-time workflow names the command
  (AC-10).
- `.claude/skills/riviera-plan-doc/references/plan-doc-template.md` — the File-structure section's
  blockquote names the command (AC-10).
- `CLAUDE.md` — the CI/CD paragraph said "a diff-scoped inline-comment check (RV-STYLE-1, #529)";
  with a second check in that job it is two. Found by the phase-4 counting sweep.
- `docs/plans/ci-pipeline.md` — the required-context list still reads **7** and stays true (this
  slice adds a step, not a job), but the seventh context now gates two guards. Same sweep. Listed
  here as a live doc, not as a historical plan record.

---

## Phase 0 — Detector core: section parse + set comparison

**Files:** Create `scripts/check-plan-file-structure.mjs` · Test
`scripts/check-plan-file-structure.test.mjs`

- [x] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOmissions } from './check-plan-file-structure.mjs';

const SECTION = `## File structure

- \`src/a.ts\` — the thing
- \`src/b.ts\` — the other thing

## Phase 0
`;

test('reports exactly the paths the section omits', () => {
  const omissions = findOmissions({
    docs: [{ path: 'docs/plans/p.md', text: SECTION }],
    changed: ['docs/plans/p.md', 'src/a.ts', 'src/b.ts', 'src/c.ts'],
  });
  assert.deepEqual(omissions.map((o) => o.path), ['src/c.ts']);
});

test('a complete section passes', () => {
  const omissions = findOmissions({
    docs: [{ path: 'docs/plans/p.md', text: SECTION }],
    changed: ['docs/plans/p.md', 'src/a.ts', 'src/b.ts'],
  });
  assert.deepEqual(omissions, []);
});

test('a slice with no plan doc passes cleanly', () => {
  assert.deepEqual(findOmissions({ docs: [], changed: ['src/a.ts', 'README.md'] }), []);
});
```

- [x] **Step 2: Run it, verify it fails** — `node --test scripts/check-plan-file-structure.test.mjs`
  → FAIL with `Cannot find module … check-plan-file-structure.mjs`

- [x] **Step 3: Minimal implementation** — `sectionOf(text)` (the lines under `## File structure`
  up to the next `## ` heading), `listedPaths(section)` (backticked spans that look like paths),
  `covered(path, listed)` (exact match only, for now), and `findOmissions({docs, changed})`
  returning `{ path }[]` for changed paths that are neither covered nor exempt. `docs: []` returns
  `[]` before anything else runs.

- [x] **Step 4: Run it, verify it passes** — `node --test scripts/check-plan-file-structure.test.mjs`
  → PASS (3/3)

- [x] **Step 5: Generalization-audit pass** — n/a for phase 0 (no bug fixed, no pattern beyond the
  one #529 already set).

- [x] **Step 6: Commit** — `git commit -m "Add the plan-doc File-structure detector core (#533)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Path idioms, exemptions, and the real-history fixtures

**Files:** Modify `scripts/check-plan-file-structure.mjs` · Test
`scripts/check-plan-file-structure.test.mjs`

> This is the phase R-2 lives in. Each idiom is a real one harvested from a merged plan doc,
> cited in the test name, and written red before the parser learns it.

- [x] **Step 1: Write the failing tests** — the `idiom: …` cases (AC-6), the exemption case
  (AC-8), the missing-section case (AC-7), and the two real-history fixtures (AC-4, AC-5), e.g.

```js
test('idiom: a bare extension attaches to the preceding path (PR #464)', () => {
  const section = '- `frontend/src/app/pages/legal/privacy-policy.ts` + `.html` `.spec.ts`\n';
  const omissions = findOmissions({
    docs: [{ path: 'docs/plans/p.md', text: `## File structure\n${section}` }],
    changed: [
      'frontend/src/app/pages/legal/privacy-policy.ts',
      'frontend/src/app/pages/legal/privacy-policy.html',
      'frontend/src/app/pages/legal/privacy-policy.spec.ts',
    ],
  });
  assert.deepEqual(omissions, []);
});

test('real case: PR #522 undercounts by two', () => {
  const omissions = findOmissions({ docs: [PR_522_DOC], changed: PR_522_PATHS });
  assert.deepEqual(omissions.map((o) => o.path), [
    'CONTEXT.md',
    'platform/src/main/java/ai/riviera/platform/venue/application/CommissionRateCommand.java',
  ]);
});
```

- [x] **Step 2: Run it, verify it fails** — `node --test scripts/check-plan-file-structure.test.mjs`
  → FAIL; the sibling-extension and repo-relative-suffix cases fail first.

- [x] **Step 3: Minimal implementation** — extend `listedPaths` with brace expansion, pipe
  alternation, and bare-extension attachment to the preceding full path on the same line; extend
  `covered` with segment-boundary suffix match, directory-prefix match, and `*` globbing; add the
  exemption predicate (any `docs/plans/*.md` in the diff, plus `package-lock.json`).

- [x] **Step 4: Run it, verify it passes** — `node --test scripts/check-plan-file-structure.test.mjs`
  → PASS (all AC-1…AC-8 cases)

- [x] **Step 5: Generalization-audit pass** — search the last 60 `main` commits with the finished
  detector and re-check the flagged set for parser artifacts; record the sites and the decision.

- [x] **Step 6: Commit** — `git commit -m "Teach the File-structure detector the real path idioms (#533)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Git front-end and CLI

**Files:** Modify `scripts/check-plan-file-structure.mjs` · Test
`scripts/check-plan-file-structure.test.mjs`

- [x] **Step 1: Write the failing test** — `rangeFor` falls back to a two-dot diff when the base has
  no merge base (the #529 behaviour, re-pinned here because it is copied), and `report()` renders
  one line per omission with the advice string.

- [x] **Step 2: Run it, verify it fails** — `node --test scripts/check-plan-file-structure.test.mjs`
  → FAIL with `report is not a function`

- [x] **Step 3: Minimal implementation** — `check(diffArgs)` running
  `git diff --name-only --no-color <range>` and reading each plan doc from the working tree;
  `main(argv)` supporting `--diff [base]` (default `origin/main`) and exiting 1 on findings, 0
  otherwise, 2 on a usage error. Guarded by the same
  `import.meta.url === \`file://${process.argv[1]}\`` check #529 uses, so the suite can import it.

- [x] **Step 4: Run it, verify it passes** — `node --test scripts/check-plan-file-structure.test.mjs`
  → PASS, then `node scripts/check-plan-file-structure.mjs --diff origin/main` against this branch
  → exits 0 (this plan's own section is complete).

- [x] **Step 5: Generalization-audit pass** — `rangeFor`, `git()` and `report()` are now duplicated
  across the two `scripts/check-*.mjs` guards. Decide extract-vs-duplicate and record it.

- [x] **Step 6: Commit** — `git commit -m "Add the File-structure guard's git front-end and CLI (#533)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — CI wiring + `riviera-plan-doc` names the command

**Files:** Modify `.github/workflows/ci.yml` · `.claude/skills/riviera-plan-doc/SKILL.md` ·
`.claude/skills/riviera-plan-doc/references/plan-doc-template.md`

- [x] **Step 1: Write the failing test** — no unit test; AC-9's signal is the PR's own CI run and
  AC-10's is a `grep`. The red state is the step not existing.

- [x] **Step 2: Run it, verify it fails** —
  `grep -c check-plan-file-structure .github/workflows/ci.yml` → `0`

- [x] **Step 3: Minimal implementation** — append to the `inline-comments` job:

```yaml
      - name: Check each plan doc's File structure section (hard gate)
        run: node scripts/check-plan-file-structure.mjs --diff ${{ github.event.pull_request.base.sha }}
```

  The existing `Test the guard itself` step already globs `scripts/*.test.mjs`, so the new suite is
  picked up with no change. Add the comment above the job's `name:` recording that the string is a
  ruleset-required context (R-1). Then name the command in the two `riviera-plan-doc` files.

- [x] **Step 4: Run it, verify it passes** — `grep -c check-plan-file-structure .github/workflows/ci.yml`
  → `1`; `grep -rc check-plan-file-structure .claude/skills/riviera-plan-doc/` → both files ≥ 1; the
  PR's CI run green.

- [x] **Step 5: Generalization-audit pass** — n/a (no bug fixed).

- [x] **Step 6: Commit** — `git commit -m "Gate the plan doc's File structure section in CI (#533)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Docs sweep + close-out

**Files:** Modify `CLAUDE.md` · this plan

- [x] **Step 1** — run `riviera-docs-freshness` over this PR's merge span. The counting sweep is the
  point: the job now runs **two** diff-scoped checks, so every doc phrased around the single
  inline-comment check is a candidate.
- [x] **Step 2** — open the R-5 follow-up issue (coordinated job + ruleset rename) and cite it.
- [x] **Step 3** — finalize Execution status, ACs, risk register; cite `merged via PR #NN`.
- [x] **Step 4: Commit** — `git commit -m "Close out the plan-doc File-structure guard (#533)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-06 | Phase 1 — the parser learned five path idioms | Any *other* idiom real plan docs use that the parser would false-positive on | Ran the finished detector over the last 60 `main` commits (34 plan-doc slices) and read every flagged path for artifacts | One: `frontend/src/app/**/*.contrast.spec.ts` (PR #478's plan doc) — a `**` glob, which the single-`*` matcher widened only within a segment | **Fixed all**: `globBody` now scans, so `**/` crosses directories, bare `**` matches anything, and a single `*` stays in one segment. Pinned by `idiom: \`**\` crosses directories, a single \`*\` does not (PR #478)`, whose second half proves the single-`*` case did **not** become permissive |
| 2026-08-06 | Phase 5 — F-7's fix (bare-name coverage) | Whether the new specificity rule false-flags paths across real history — the same question phase 1's audit asked, re-asked because F-7's first fix was a *coverage* change, the class most likely to over-report | Ran the detector over the last 60 `main` commits twice (before/after), diffing the flagged sets per slice | The first fix (require a `/` in every token) added **16** flags, 11 on PR #516 alone — all legitimate bare-named files | **Rejected that fix and reshaped it.** The shipped rule adds **2** flags across 33 slices, both genuinely ambiguous. Also excluded the repo's root commit from the audit harness: with no parent it diffs the whole tree (1361 paths) and was inflating every count |
| 2026-08-06 | Phase 2 — the git front-end | `git()`, `rangeFor()` and the report/advice shape, now written twice across `scripts/check-*.mjs` | Read both guards side by side | Two: `git()` (3 lines) and `rangeFor()` (7 lines), near-identical but not contiguous | **Skip — decided on merits, not deferred.** This row first named the Sonar gate as arbiter; that was wrong and is corrected here (F-5). `sonar-project.properties` sets `sonar.sources=platform/src/main/java,frontend/src`, so **`scripts/` is outside Sonar's analysis scope entirely** — its "0.0% duplication on new code" says nothing about these files, and waiting for it would have been waiting on a blind referee. Decided directly: ten lines of trivial, stable git glue do not justify a third file that couples two deliberately independent, dependency-free guards. Revisit if a third guard appears, which is when the shared-module case actually earns itself. |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [x] **AC-1…AC-8:** `node --test "scripts/*.test.mjs"` → **36 pass, 0 fail** (both guards' suites;
  19 of them this guard's). Verified at `723a13c`, and re-run inside CI by the job's own
  `Test the guards themselves` step.
- [x] **AC-9:** **Red then green, on this PR's own runs** — the strongest available evidence:
  - run `31094385031`: steps `success` / `success` / **`failure`** — the new step failing for a
    real defect (F-1) while the RV-STYLE-1 step beside it stayed green. The gate bites, and bites
    independently of its neighbour.
  - run `31094650471` (after the F-1/F-2 fixes): job **`success`**, all three steps green,
    including `Check each plan doc lists what the diff changed (#533, hard gate)`.

  The close-out commit's own run is what the merge gate ultimately reads; it is not cited here
  because a commit cannot name the run it triggers (the same reason step 4 of the merge close-out
  cites `merged via PR #NN` rather than a squash SHA).
- [x] **AC-10:** `grep -rl check-plan-file-structure .claude/skills/riviera-plan-doc/` → both
  `SKILL.md` and `references/plan-doc-template.md`. Verified at `c22bfd2`.

> The CLI leg was proven end-to-end by hand before CI saw it: a throwaway commit adding an unlisted
> `scripts/zz-proof.mjs` made `--diff origin/main` exit 1 naming exactly that path; the clean branch
> exits 0.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
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
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — the `code-review` plugin workflow via ladder **rung 1**
      (`Skill("code-review")` was accepted, so no fallback was needed), five-agent fan-out, with
      `riviera-review-overlay` layered on. Five findings (F-3…F-7), all fixed in `86f5f39`; the fix
      round itself re-cleared CI, Sonar and the overlay re-walk. Result posted on PR #538.
