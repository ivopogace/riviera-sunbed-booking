# Review-gate range pinning Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The SDLC review gate resolves its diff range from a freshly-fetched base and
refuses to dispatch when that range disagrees with the PR's own file/line counts, so a stale
remote-tracking ref or a shallow clone can no longer produce a confident false clean.

**Architecture:** The single most significant decision is that the fix **mirrors what
`ci.yml` already does** rather than inventing a scheme. The `Repo hygiene (diff-scoped)` job
learned this exact lesson on PR #618 and encodes the answer in two steps — `fetch-depth: 0`
plus `git fetch --no-tags origin <base.ref>`, then `merge-base` against the base branch's
**current tip**, explicitly *not* `pull_request.base.sha`. The review gate is the last
diff-consumer in the tree that never learned it. The prose fix is paired with an executable
verifier (`scripts/check-review-range.mjs`) because AC-2's "refuses to dispatch" and AC-3's
"makes the gate abort" are claims prose cannot hold — the repo's seven-guard `check-*.mjs`
family is the established shape for a rule that must fail out loud.

**Persistence:** N/A — no database, migration, or SQL in scope. Invariant #1 untouched.

**Source of intent:** GitHub issue #942.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
AC-1's literal `base.sha` pin is contradicted by `ci.yml`'s own PR #618 fix, and that no open
PR overlaps these files) · `riviera-plan-doc` (this template — forced the Non-goals and the
generalization population below, which is what kept the six other `origin/main`-defaulting
guards from being silently swept into this diff) · `tdd` (the guard is built red-green
through `guard-cli-harness.mjs`, which spawns the CLI in a throwaway `git init` repo — the
only layer where a false clean has ever actually lived) · `riviera-review-overlay` (review
gate — runs at ready-for-review; RV-PROC items apply since this slice edits the SDLC skills
themselves) · `riviera-docs-freshness` (**will run** over `origin/main...HEAD` at close-out —
this slice changes what three `riviera-*` skills state about their own ranges, which is
squarely in its substrate-doc map).

Routing-gate detection recorded honestly: no DB, no backend Java, no Angular surface, no
money and no venue-scoped endpoint are touched, so `postgres`, `riviera-modulith`,
`riviera-java-conventions`, `riviera-frontend`, `riviera-tailwind`, `playwright-cli` and
`riviera-stripe-payments` did not fire. `riviera-local-debug` fired as an *edit target*
(AC-4), not as a build recipe.

**Branch:** `claude/sdlc-942-k7v71k` — the cloud session's designated remote branch stands in
for `bugfix/review-gate-range-pinning` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a PR whose base branch tip has moved since the local clone was made,
      when the review gate resolves its range, then the range is
      `merge-base(freshly-fetched origin/<base.ref>, HEAD)...HEAD` and the resolved base SHA
      appears in the gate's announcement string. *Seam:* `pr-gates.md` §1 step 2's
      resolve-then-announce procedure · *Pinned by:* `check-review-range.test.mjs`
      `resolves the base from the fetched base branch, not from a stale ref`
- [x] **AC-2:** Given a local range whose file count or line totals differ from the PR's
      reported `changed_files`/`additions`/`deletions`, when the scope check runs, then it
      exits non-zero naming both sides and the gate does not dispatch. *Seam:*
      `scripts/check-review-range.mjs` CLI exit code · *Pinned by:*
      `check-review-range.test.mjs` `a file-count mismatch exits 1 and names both sides`
- [x] **AC-3:** Given the #939 conditions reproduced literally — `origin/main` set one commit
      behind the PR's real base, so the three-dot range yields ten files where the PR reports
      three — when the scope check runs, then it exits 1 rather than reporting clean.
      *Seam:* the guard CLI spawned in a throwaway repo via `guard-cli-harness.mjs` ·
      *Pinned by:* `check-review-range.test.mjs` `reproduces #939: a stale origin/main is
      caught by the count check`
- [ ] **AC-4:** Given a session about to make a history claim in a cloud sandbox, when it
      reads `riviera-local-debug`, then it finds that cloud clones start shallow, the named
      set of commands whose output that corrupts, and the `git fetch --unshallow` remedy.
      *Seam:* `riviera-local-debug/SKILL.md` § *Git in a cloud session* · *Pinned by:*
      `check-review-range.test.mjs` `the shallow precondition names the unshallow remedy`
      (the guard's own refusal message is the executable half; the prose is verified by
      inspection at AC-verification below)

## Non-goals

- **Not** rewriting the six existing `check-*.mjs` guards that default their base to a local
  `origin/main`. They run in CI behind `fetch-depth: 0` + an explicit base fetch, so their
  exposure is the *local* hook path only — a different blast radius, and sweeping them here
  would put seven behaviour changes in a diff whose subject is the review gate. Recorded in
  the Generalization-audit log and routed to a follow-up issue.
- **Not** wiring the new guard into CI as a required check. It needs a PR's reported counts,
  which are not available to a diff-scoped job, and it governs a *review activity* rather
  than diff content. It is a by-hand verifier, exactly as `check-comment-only.mjs` is
  (`CLAUDE.md` § CI/CD says so of that one). Its `.test.mjs` sibling is picked up by the
  hygiene job's existing `scripts/*.test.mjs` glob with no workflow edit.
- **Not** changing the review gate's invocation ladder, effort-selection rules, or the
  overlay's bank items. Only how the range is established and verified.
- **Not** making the guard call the GitHub API. The hygiene job has no install step and no
  token guarantee; the agent supplies the PR's counts as arguments, which keeps the guard
  dependency-free (`node:` only) and testable offline.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior. The gate's existing range instruction is corrected in place; no surface,
endpoint, or flow is retired.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Pinning the range to the PR's `base.sha` (as issue #942 AC-1 literally suggests) breaks every PR that followed `riviera-sdlc`'s documented merge-from-main step: GitHub diffs against the base branch's current tip, so `base.sha` yields a **larger** range and the new AC-2 check would abort spuriously — turning the fix into a worse false alarm than the bug | high | high | Use `merge-base(freshly-fetched origin/<base.ref>, HEAD)`, which is what GitHub computes and what `ci.yml`'s base-fetch step already does for the same reason (PR #618). `base.sha` is used only as a reachability sanity check | this slice | open |
| R-2 | `git merge-base` on a shallow clone silently returns the wrong answer, and `git-diff.mjs:168`'s `mergeBase()` swallows the failure with `catch { return base; }` — a fail-**open** that hands back the stale base | high | high | The guard refuses (exit 2) when `git rev-parse --is-shallow-repository` is true, before it resolves anything; `mergeBase()`'s fail-open gets a Javadoc note naming the condition | this slice | phase 0 (guard half; note lands in phase 2) — verified live: the guard exits 2 on this session's own clone |
| R-3 | The count comparison false-alarms on binary files (`--numstat` emits `-` for both columns) or on a >300-file PR | low | med | Binaries are excluded from the line totals on both sides and counted only as files; `changed_files` stays exact above 300 even though the *listed* files are capped. Both stated in the guard header and covered by a case | this slice | open |
| R-4 | The guard becomes a box the gate ticks without running, reproducing the very failure #942 describes | med | med | The gate's announcement must carry the resolved SHA **and** the matched counts, so a transcript with a bare announcement is visibly non-compliant | this slice | open |

## Open questions / Assumptions

- **Assumption:** an executable verifier is in scope, not just prose. Issue #942 phrases its
  scope as documentation edits, but AC-2 ("refuses to dispatch") and AC-3 ("makes the gate
  abort") are not properties prose can have, and the repo's seven `check-*.mjs` guards — each
  with a `.test.mjs` sibling, each headed by the silent-false-clean it exists to prevent — are
  the house shape for exactly this. Stated in the PR body so it is reviewable. — *Owner:* this
  slice · *Resolves by:* review gate
- **Assumption:** AC-4's "the two commands" is a miscount in the issue, whose own Scope §3
  names three (`git log`, `git blame`, `git show`). The caveat will name the actual set rather
  than assert a count — writing "the two commands" into a skill would itself be the stale
  counting-fact `riviera-docs-freshness` step 2b exists to catch. — *Owner:* this slice ·
  *Resolves by:* phase 2

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice touches no runtime code: three skill markdown
files, one new Node verifier and its test, and one Javadoc note in a build-time script. No
path reaches `set_availability`, `booking`, or the beach map.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope. No module, `api/` port, event, or JDBC adapter is added,
moved, or changed, so `ApplicationModules.verify()`'s surface is untouched.

### Module ownership (§4a)

N/A — the slice adds no domain behavior. The only "ownership" question it settles is a
tooling one, recorded in Non-goals: the range-resolution rule lives in `pr-gates.md` (the
gate that uses it), the shallow-clone caveat in `riviera-local-debug` (the skill a session
loads before touching git in a sandbox), and neither duplicates the other — each points.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves and no ledger row is written.

## Angular — frontend surfaces touched

N/A — backend-only... more precisely, **tooling-only**: nothing under `frontend/` or
`platform/src` is in the diff.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or client type is touched.

## Execution status

**Stage pointer:** `implement — phase 0 done, entering phase 1`

**Next action:** Rewrite `pr-gates.md` §1 step 2 as resolve-then-verify, and make step 3's
re-review re-resolve rather than reuse the range.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the scope-check guard + its suite (AC-2, AC-3) | ✅ | phase-0 commit |
| 1 — `pr-gates.md` §1 steps 2 and 3 (AC-1, scope item 4) | ⏳ | |
| 2 — the shallow caveat + the two range citations (AC-4) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/review-gate-range-pinning.md` — this plan; deleted at the next close-out after the PR merges
- `scripts/check-review-range.mjs` — the verifier: refuses on a shallow clone, resolves the base by merge-base against the fetched base branch, compares local counts to the PR's
- `scripts/check-review-range.test.mjs` — detector cases plus the spawned-CLI cases, including the literal #939 reproduction
- `.claude/skills/riviera-sdlc/references/pr-gates.md` — §1 step 2 gains resolve-then-verify and the SHA-bearing announcement; step 3 re-resolves on re-review
- `.claude/skills/riviera-local-debug/SKILL.md` — new § *Git in a cloud session*: shallow clones, what they corrupt, the remedy
- `.claude/skills/riviera-docs-freshness/SKILL.md` — its `origin/main...HEAD` input points at the resolve rule instead of restating it
- `scripts/git-diff.mjs` — `mergeBase()`'s fail-open `catch` gains the note naming the shallow condition

---

## Phase 0 — The scope-check guard

**Files:** Create `scripts/check-review-range.mjs` · Create `scripts/check-review-range.test.mjs`

- [x] **Step 1: Write the failing test** — the mismatch case and the #939 reproduction, driven
      through `guard-cli-harness.mjs` so the git front-end is genuinely cold.
- [x] **Step 2: Run it, verify it fails** — `node --test scripts/check-review-range.test.mjs`
      → FAIL, `ERR_MODULE_NOT_FOUND`.
- [x] **Step 3: Minimal implementation** — shallow refusal, base resolution, numstat totals,
      comparison, exit codes 0/1/2.
- [x] **Step 4: Run it, verify it passes** — 9/9 pass; the whole `scripts/*.test.mjs` family is 232/232.
- [x] **Step 5: Generalization-audit pass** — population below.
- [x] **Step 6: Commit** — `git commit -m "Add the review-gate range scope check (#942)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — The gate resolves and announces its range

**Files:** Modify `.claude/skills/riviera-sdlc/references/pr-gates.md` §1 steps 2, 3

- [ ] **Step 1:** Replace the inline `origin/main...HEAD` with the resolve-then-verify block.
- [ ] **Step 2:** Extend the announcement to carry the resolved base SHA and the matched counts.
- [ ] **Step 3:** Make step 3's re-review re-resolve rather than reuse the range.
- [ ] **Step 4: Commit** — `git commit -m "Pin the review gate's range to the PR's fetched base (#942)"`

## Phase 2 — The shallow-clone caveat

**Files:** Modify `.claude/skills/riviera-local-debug/SKILL.md` · Modify
`.claude/skills/riviera-docs-freshness/SKILL.md` · Modify `scripts/git-diff.mjs`

- [ ] **Step 1:** Add § *Git in a cloud session* naming the corrupted commands and the remedy.
- [ ] **Step 2:** Point the docs-freshness range input at the resolve rule.
- [ ] **Step 3:** Note `mergeBase()`'s fail-open.
- [ ] **Step 4: Commit** — `git commit -m "Declare the shallow clone where history work reads it (#942)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | phase 0 (#942) | Every tool that resolves a diff/review range from a **local** `origin/main` ref without fetching it first | `grep -rn "origin/main" .claude/skills scripts .github/workflows` | 9: `pr-gates.md` ×2, `riviera-docs-freshness` ×2, `check-comment-only.mjs` (default base), `check-inline-comments.mjs`, `check-plan-file-structure.mjs`, `check-focus-posture.mjs`, `git-diff.mjs` `mergeBase()` | Fix the 4 gate-side sites (this slice's subject) + the `mergeBase()` fail-open note. The 4 guard defaults are CI-safe (`fetch-depth: 0` + an explicit base fetch in `ci.yml`) and locally hook-driven → follow-up issue, per Non-goals |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Inspect `pr-gates.md` §1 step 2 → announcement template contains the resolved
      SHA. Run `node scripts/check-review-range.mjs --base-ref main --files N --additions A
      --deletions D` on this PR → prints the resolved base.
- [ ] **AC-2:** `node --test scripts/check-review-range.test.mjs` → the mismatch case passes.
- [ ] **AC-3:** Same suite → the #939 reproduction case passes.
- [ ] **AC-4:** `grep -n "unshallow" .claude/skills/riviera-local-debug/SKILL.md` → the caveat
      and the named command set are present.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (N/A — no Java in the diff).
- [ ] **Availability** section justified N/A (no runtime code).
- [ ] Pool + cutoff rules honored (N/A).
- [ ] **Modulith** section justified N/A; no cross-module imports (no Java in the diff).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy (N/A).
- [ ] Timezone (N/A).
- [ ] Booking codes (N/A).
- [ ] Flyway migration (N/A — no schema change).
- [ ] **Frontend** standards (N/A — nothing under `frontend/`).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `references/pr-gates.md` §1
      *plus* `riviera-review-overlay`, not the overlay alone.
