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
themselves) · `riviera-docs-freshness` (**ran** over the resolved range at the review gate — 1 finding, the
CLAUDE.md by-hand-verifier count, patched into this PR; also ran at close-out —
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

- [x] **AC-1:** Given a PR whose base branch tip has moved since the local clone was made,
      when the review gate resolves its range, then the range is
      `merge-base(freshly-fetched origin/<base.ref>, HEAD)...HEAD` and the resolved base SHA
      appears in the gate's announcement string. *Seam:* `pr-gates.md` §1 step 2's
      resolve-then-announce procedure · *Pinned by:* `guard-cli.test.mjs`
      `check-review-range resolves the base from the fetched branch and prints the SHA`
- [x] **AC-2:** Given a local range whose file count or line totals differ from the PR's
      reported `changed_files`/`additions`/`deletions`, when the scope check runs, then it
      exits non-zero naming both sides and the gate does not dispatch. *Seam:*
      `scripts/check-review-range.mjs` CLI exit code · *Pinned by:*
      `guard-cli.test.mjs` `check-review-range exits 1 on a count mismatch and names both sides`
- [x] **AC-3:** Given the #939 conditions reproduced literally — `origin/main` set one commit
      behind the PR's real base, so the three-dot range yields ten files where the PR reports
      three — when the scope check runs, then it exits 1 rather than reporting clean.
      *Seam:* the guard CLI spawned in a throwaway repo via `guard-cli-harness.mjs` ·
      *Pinned by:* `guard-cli.test.mjs` `check-review-range reproduces #939: a stale
      origin/main is caught, then self-corrects`
- [x] **AC-4:** Given a session about to make a history claim in a cloud sandbox, when it
      reads `riviera-local-debug`, then it finds that cloud clones start shallow, the named
      set of commands whose output that corrupts, and the `git fetch --unshallow` remedy.
      *Seam:* `riviera-local-debug/SKILL.md` § *Git in a cloud session* · *Pinned by:*
      `guard-cli.test.mjs` `check-review-range refuses a shallow clone before resolving,
      naming the remedy` (the guard's refusal is the executable half; the prose is verified by
      inspection at AC-verification below)

## Non-goals

- **Not** rewriting the **five** existing guards that default their base to a local
  `origin/main` (`check-comment-only`, `check-inline-comments`, `check-plan-file-structure`,
  `check-focus-posture`, `check-touch-target`; the sixth, `check-cloud-node-pin`, takes no
  base), nor the six documented by-hand invocations that name the bare ref
  (`riviera-plan-doc` SKILL + template, `riviera-java-conventions`, `riviera-review-overlay`
  SKILL + frontend-conventions, `CONTRIBUTING.md`). All five route through `mergeBase()`, so
  this slice makes the shared function *say* the condition out loud rather than leave it to
  be re-earned five times — but changing five guards' defaults is five behaviour changes in a
  diff whose subject is the review gate. Recorded in the Generalization-audit log and
  routed to **#952**.
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
| R-1 | (closed in phase 1 — the gate resolves by merge-base against the fetched tip; `base.sha` is demoted to `--base-sha`) Pinning the range to the PR's `base.sha` (as issue #942 AC-1 literally suggests) breaks every PR that followed `riviera-sdlc`'s documented merge-from-main step: GitHub diffs against the base branch's current tip, so `base.sha` yields a **larger** range and the new AC-2 check would abort spuriously — turning the fix into a worse false alarm than the bug | high | high | Use `merge-base(freshly-fetched origin/<base.ref>, HEAD)`, which is what GitHub computes and what `ci.yml`'s base-fetch step already does for the same reason (PR #618). `base.sha` is used only as a reachability sanity check | this slice | phase 1 |
| R-2 | `git merge-base` on a shallow clone silently returns the wrong answer, and `git-diff.mjs`'s `mergeBase()` swallows the failure with `catch { return base; }` — a fail-**open** that hands back the stale base | high | high | The guard refuses (exit 2) when `git rev-parse --is-shallow-repository` is true, before it resolves anything; `mergeBase()`'s fail-open gets a Javadoc note naming the condition | this slice | phase 0 + phase 2 — verified live: the guard exited 2 on this session's own clone until `git fetch --unshallow` |
| R-3 | The count comparison false-alarms on binary files (`--numstat` emits `-` for both columns) or on a >300-file PR | low | med | Binaries are excluded from the line totals on both sides and counted only as files; `changed_files` stays exact above 300 even though the *listed* files are capped. Both stated in the guard header and covered by a case | this slice | phase 0 — `parseNumstat` case pins it |
| R-4 | The guard becomes a box the gate ticks without running, reproducing the very failure #942 describes | med | med | The gate's announcement must carry the resolved SHA **and** the matched counts, so a transcript with a bare announcement is visibly non-compliant | this slice | phase 1 — the announcement template names both, and says a bare one means the step did not run |
| R-5 | (surfaced by the review round, not foreseen) The guard's own inputs admit a false clean: `Number('')` is 0, so unsubstituted counts agree with an empty range | — | high | Counts validated as digit strings; empty range refused on both sides; `--head-sha`/`--base-sha` required and validated as ≥7 lowercase hex | this slice | F-4/F-5/F-17, pinned by four cases in `guard-cli.test.mjs` |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** an executable verifier is in scope, not just prose. Issue #942 phrases its
  scope as documentation edits, but AC-2 ("refuses to dispatch") and AC-3 ("makes the gate
  abort") are not properties prose can have, and the repo's seven `check-*.mjs` guards — each
  with a `.test.mjs` sibling, each headed by the silent-false-clean it exists to prevent — are
  the house shape for exactly this. Stated in the PR body so it is reviewable. — **Resolved:** taken, phase 0; the guard's
  suite reproduces #939 literally, which prose could not.
- **Assumption:** AC-4's "the two commands" is a miscount in the issue, whose own Scope §3
  names three (`git log`, `git blame`, `git show`). The caveat will name the actual set rather
  than assert a count — writing "the two commands" into a skill would itself be the stale
  counting-fact `riviera-docs-freshness` step 2b exists to catch. — **Resolved:** phase 2 names the set as a
  five-row table (`log`, `blame`, `show`, `merge-base`, `describe`), no count asserted.

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

**Stage pointer:** `merge close-out — all gates green; awaiting the merge decision`

**Next action:** Merge (the close-out below is written; steps 2-3 are GitHub-only edits after).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the scope-check guard + its suite (AC-2, AC-3) | ✅ | phase-0 commit |
| 1 — `pr-gates.md` §1 steps 2 and 3 (AC-1, scope item 4) | ✅ | phase-1 commit |
| 2 — the shallow caveat + the two range citations (AC-4) | ✅ | phase-2 commit |
| 3 — review-round fixes (F-1…F-20, two rounds) | ✅ | the four fix commits |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | local guard (RV-STYLE-1) | Three multi-line inline comments in the new guard and its suite | fixed in phase 2 — one line each, prose already in the doc comments |
| F-2 | review gate (RV-PROC-2c, self) | The fix stopped at §1. Close-out step 5's pre-merge smoke and `riviera-docs-freshness`' *When to run* bullet still named a bare `origin/main...HEAD` — the same unfetched ref, one section further down | fixed — both now resolve per §1 step 2 |
| F-3 | docs-freshness counting sweep | `CLAUDE.md` named `check-comment-only.mjs` as *the* by-hand verifier; this slice makes it two. The file is not in the diff, which is exactly why the counting sweep exists | fixed — both named |
| F-4 | review gate | **False clean in the guard itself:** `Number('')` is `0`, so unsubstituted count arguments against a HEAD still on the base agreed on every dimension and printed "verified" | fixed — counts validated as digit strings, and an empty range refused on both sides |
| F-5 | review gate | The guard verified the base but never the head, while the announcement claimed "matched against the PR" — matching counts on a different head SHA passed | fixed — `--head-sha` is required and checked against local HEAD |
| F-6 | review gate | A throwing `git()` escaped `main` and exited 1, the code reserved for a scope mismatch, sending the operator to the wrong remedy | fixed — `verify()` wrapped; git failures exit 2 |
| F-7 | review gate | `--numstat` flags were spelled inline, escaping `git-diff.test.mjs`' flag-pinning case; and `diff.renames=false` split a rename into two files, a permanent false alarm | fixed — `numstatArgs()` builder with `--find-renames`, asserted in the pinning case |
| F-8 | review gate | The spawned-CLI cases sat in the sibling suite, against the split `guard-cli.test.mjs`' header states, with no mutation proofs and no from-a-subdirectory case | fixed — moved, each with its mutation proof, plus cwd, rename, head-mismatch and dirty-tree cases |
| F-9 | review gate | My `mergeBase()` note stated the failure direction backwards ("a false clean rather than a false alarm"); the fallback's extra commits arrive as deletions, so it is a false **alarm** | fixed — note rewritten, and the function now warns on the shallow condition |
| F-10 | review gate | The generalization-audit population was under-enumerated (missed `check-touch-target`) and its counts disagreed with Non-goals and with the tree | fixed — re-enumerated by mechanism; the deferral rationale corrected |
| F-11 | review gate | `--base-sha` was absent from the documented command block, so the containment check was dead on the only path anyone copies | fixed — the block passes `--base-sha` and `--head-sha` |
| F-12 | review gate | The docs-freshness pointer promised a scope check that cannot run for two of its three range shapes | fixed — *Inputs* says what applies to every shape and what is PR-only |
| F-13 | review gate | `CLAUDE.md`'s "most also run as a local `PostToolUse` hook" — three of seven | fixed |
| F-14 | review gate | The documented `[ … ] && git fetch --unshallow` exits 1 on a healthy clone, aborting the block under `set -e` | fixed — written as an `if` |
| F-16 | re-review | AC-4's *Pinned by*, and the AC-1/2/3 verification commands, named a suite that no longer holds those cases — broken by this slice's own F-8 move; AC-1's command also omitted `--head-sha`, which F-5 made mandatory | fixed — all four re-pointed and re-run |
| F-17 | re-review | `--head-sha` accepted a 1-character value and was case-sensitive, so a truncated or uppercase SHA could satisfy the guard's stated proof of content; `--base-sha` was documented as required but optional in code | fixed — both validated as ≥7 lowercase hex and required |
| F-18 | re-review | `git status --porcelain` was the one fix-round git call not routed through a builder: `status.showUntrackedFiles=no` silenced the dirty-tree warning entirely, and an untracked directory counted as one path | fixed — `statusArgs()` pins `--untracked-files=all`, asserted in the flag-pinning case |
| F-20 | re-review | Both the plan and the PR said the deferral was "routed to a follow-up issue" with no issue filed — and the plan doc is deleted at close-out, so the deferral would have vanished with it | fixed — filed as #952 |
| F-19 | re-review | The plan overstated the `mergeBase()` mitigation: the warning fires only when `merge-base` throws, not when a shallow clone answers wrongly from the truncated graph | fixed — claim corrected |
| F-15 | user | Substrate edits were carrying narrative that does not change what a session does — "is this helpful for the LLM?" Applying it cut the `mergeBase()` note 14 lines → 4, `pr-gates` §1 step 2 by 11, and the guard header by 15; it also surfaced a real bug, the documented block using `$BASE_REF` without ever setting it | fixed — kept only what a session acts on or an edit would undo |

---

## File structure

- `docs/plans/review-gate-range-pinning.md` — this plan; deleted at the next close-out after the PR merges
- `scripts/check-review-range.mjs` — the verifier: refuses on a shallow clone, resolves the base by merge-base against the fetched base branch, compares local counts to the PR's
- `scripts/check-review-range.test.mjs` — the pure detector cases only; the CLI lives in the spawned suite, per the split `guard-cli.test.mjs`'s header states
- `scripts/guard-cli.test.mjs` — the guard's spawned-CLI cases, each with its mutation proof
- `scripts/git-diff.test.mjs` — the flag-pinning case reaches `numstatArgs`
- `.claude/skills/riviera-sdlc/references/pr-gates.md` — §1 step 2 gains resolve-then-verify and the SHA-bearing announcement; step 3 re-resolves on re-review
- `.claude/skills/riviera-local-debug/SKILL.md` — new § *Git in a cloud session*: shallow clones, what they corrupt, the remedy
- `.claude/skills/riviera-docs-freshness/SKILL.md` — its `origin/main...HEAD` input points at the resolve rule instead of restating it
- `scripts/git-diff.mjs` — `mergeBase()`'s fail-open `catch` gains the note naming the shallow condition
- `CLAUDE.md` — the CI/CD paragraph named one by-hand verifier; this slice makes it two, and only five of the seven guards are CI-gated (`riviera-docs-freshness` counting sweep)
- `README.md` — same sentence, un-carved: it said CI runs `scripts/check-*.mjs`, which is now two-sevenths false

---

## Phase 0 — The scope-check guard

**Files:** Create `scripts/check-review-range.mjs` · Create `scripts/check-review-range.test.mjs`

- [x] **Step 1: Write the failing test** — the mismatch case and the #939 reproduction, driven
      through `guard-cli-harness.mjs` so the git front-end is genuinely cold.
- [x] **Step 2: Run it, verify it fails** — `node --test scripts/check-review-range.test.mjs`
      → FAIL, `ERR_MODULE_NOT_FOUND`.
- [x] **Step 3: Minimal implementation** — shallow refusal, base resolution, numstat totals,
      comparison, exit codes 0/1/2.
- [x] **Step 4: Run it, verify it passes** — green; after the review round's F-8 move the guard's cases live in `guard-cli.test.mjs` and the family is 245/245.
- [x] **Step 5: Generalization-audit pass** — population below.
- [x] **Step 6: Commit** — `git commit -m "Add the review-gate range scope check (#942)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — The gate resolves and announces its range

**Files:** Modify `.claude/skills/riviera-sdlc/references/pr-gates.md` §1 steps 2, 3

- [x] **Step 1:** Replace the inline `origin/main...HEAD` with the resolve-then-verify block.
- [x] **Step 2:** Extend the announcement to carry the resolved base SHA and the matched counts.
- [x] **Step 3:** Make step 3's re-review re-resolve rather than reuse the range.
- [x] **Step 4: Commit** — `git commit -m "Pin the review gate's range to the PR's fetched base (#942)"`

## Phase 2 — The shallow-clone caveat

**Files:** Modify `.claude/skills/riviera-local-debug/SKILL.md` · Modify
`.claude/skills/riviera-docs-freshness/SKILL.md` · Modify `scripts/git-diff.mjs`

- [x] **Step 1:** Add § *Git in a cloud session* naming the corrupted commands and the remedy.
- [x] **Step 2:** Point the docs-freshness range input at the resolve rule.
- [x] **Step 3:** Note `mergeBase()`'s fail-open.
- [x] **Step 4: Commit** — `git commit -m "Declare the shallow clone where history work reads it (#942)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | phase 0 (#942) | Every tool that resolves a diff/review range from a **local** `origin/main` ref without fetching it first | `grep -rn "origin/main" .claude/skills scripts .github/workflows CONTRIBUTING.md` | 4 gate-side prose sites (`pr-gates.md` ×2, `riviera-docs-freshness` ×2); 5 guard defaults (`check-comment-only:250`, `check-inline-comments:327`, `check-plan-file-structure:365`, `check-focus-posture:1094`, `check-touch-target:481`); 6 documented by-hand invocations; 1 shared chokepoint (`git-diff.mjs` `mergeBase()`) | Fixed the 4 gate-side sites (this slice's subject) and the chokepoint — `mergeBase()` now warns on the shallow condition — but only when `merge-base` actually throws; a shallow clone that answers from the truncated graph returns a wrong base silently, and nothing catches that, which is why a review range refuses instead of calling it. The 5 defaults and 6 invocations → **#952** |
| 2026-09-05 | review round (#942) | Sentences that **count** guards or suites — the class PR #618's F-5 and this slice's own F-3 both landed in | `grep -rn "check-\*\.mjs\|by-hand verifier\|spawns each guard" CLAUDE.md CONTRIBUTING.md .github/workflows .claude/skills scripts` | `CLAUDE.md:63` (two claims: the by-hand verifier, and "most also run as a hook" — 3 of 7); `ci.yml:219` ("one that spawns each guard's CLI"); `guard-cli.test.mjs:2` | `CLAUDE.md` corrected on both clauses. `ci.yml:219` and `guard-cli.test.mjs:2` needed no edit once the CLI cases moved into `guard-cli.test.mjs` — the structure was made to match the sentence rather than the sentence patched, which is what #619 established |

---

## Acceptance-criteria verification (final)

Read the PR's `base.ref`, `base.sha`, `head.sha` and counts first; every flag is required.

- [x] **AC-1:** `node scripts/check-review-range.mjs --base-ref main --base-sha <base.sha>
      --head-sha <head.sha> --files <n> --additions <a> --deletions <d>` → prints the resolved
      base SHA; and `pr-gates.md` §1 step 2's announcement template carries it. Verified on this
      PR at each push.
- [x] **AC-2:** `node --test scripts/guard-cli.test.mjs` → `check-review-range exits 1 on a
      count mismatch and names both sides` passes.
- [x] **AC-3:** Same suite → `check-review-range reproduces #939: a stale origin/main is
      caught, then self-corrects` passes.
- [x] **AC-4:** `grep -n "unshallow" .claude/skills/riviera-local-debug/SKILL.md` → the caveat
      and the command table are present; the executable half is `check-review-range refuses a
      shallow clone before resolving, naming the remedy` in `guard-cli.test.mjs`.

## Gate results

- **CI:** all 8 checks green on `f75ac37` (Backend, Frontend, Repo hygiene, CodeQL ×2 + rollup,
  SonarCloud scan, SonarCloud Code Analysis).
- **Review gate:** `/code-review` at high effort with `riviera-review-overlay`, five agents pinned
  to the literal base SHA, plus a two-agent re-review of the fix round. **20 findings, all fixed**
  — register above.
- **Sonar:** quality gate passed; `api/issues/search` `total: 0`, measures non-empty, the
  `SonarCloud Code Analysis` check-run concluded `success`, so the zero is a real analysis and not
  an unanalyzed PR. **Caveat, stated rather than glossed:** `sonar-project.properties` sets
  `sonar.sources=platform/src/main/java,frontend/src`, so `scripts/` is outside the analysed scope
  — this diff has no new *analysable* lines, and "0.0% coverage on new code" therefore passes
  vacuously rather than by meeting the ≥80% bar. The new code is covered by
  `node --test "scripts/*.test.mjs"` (245/245, the guard's CLI cases mutation-proved), which is the
  suite CI actually gates on for this directory.

**Merged via PR #951.**

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (N/A — no Java in the diff).
- [x] **Availability** section justified N/A (no runtime code).
- [x] Pool + cutoff rules honored (N/A).
- [x] **Modulith** section justified N/A; no cross-module imports (no Java in the diff).
- [x] **Payment/payout** N/A.
- [x] Refund policy (N/A).
- [x] Timezone (N/A).
- [x] Booking codes (N/A).
- [x] Flyway migration (N/A — no schema change).
- [x] **Frontend** standards (N/A — nothing under `frontend/`).
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final state committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — rung 1 (`Skill("code-review:code-review")`) at high effort,
      *plus* `riviera-review-overlay`; not the overlay alone.
