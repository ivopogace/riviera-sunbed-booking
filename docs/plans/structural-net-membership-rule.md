# Structural-net membership rule — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** One stated rule says what makes a test a member of the structural net, the five current
members and every exclusion follow from it, and every other mention of the net points at the rule
instead of restating a roster.

**Architecture:** Docs-only, four files. The rule lives beside the command in `CLAUDE.md`
(canonical for the module list and the invariants): a member holds the whole tree to one rule keyed
on package, kind or imports alone, names no module, table, class, port or bean, runs without a
Spring context, and fails on a violation — the set any structure change anywhere can break. Every
fitness function that names its target is out for the stated reason. `riviera-local-debug`,
`riviera-review-overlay` RV-PROC-2 and `RESPONSIBILITIES.md`'s roster point at the rule.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched.

**Source of intent:** GitHub issue #945 (and the deferral comment from PR #958's review gate).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the population is
wider than the issue's ten: four singular `*ArchitectureTest` guards, four module-local ones,
`DocumentationTests` and a `@WebMvcTest`; the rule was tested against all of them) ·
`riviera-plan-doc` (this template — forced the rule to be written before the roster was touched)
· `tdd` (the test is the criterion applied to every structural test in the tree: read out of the
test code, not the Javadoc — the five members' code names no module, table, class or port; each
excluded class names one) · `riviera-review-overlay` (review gate — at ready for review; RV-PROC-2
over its own edit) · `riviera-docs-freshness` (**ran** as check c over this diff — the diff retires
the five-name list from check b; its only other restatements were the two commands, unchanged) ·
`riviera-local-debug` (unshallowed the clone, registered the JDK 25 toolchain, ran the net once
for AC-3).

**Branch:** `claude/sdlc-945-fvbf1g` (the session's designated remote branch stands in for
`feature/structural-net-membership-rule`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the substrate, when every mention of "the structural net" is grepped, then
      exactly one states membership (the rule in `CLAUDE.md` §Commands) and every other points at
      it. *Seam:* `grep -rni 'structural net'` over the substrate · *Pinned by:* the grep, run at
      the close-out commit.
- [x] **AC-2:** Given the rule, when it is applied to every structural test in the tree, then the
      five command members satisfy it and each of the other classes fails one clause (names a
      target, boots a context, or asserts nothing). *Seam:* the test classes' code · *Pinned by:*
      the table in the PR body.
- [x] **AC-3:** Given `CLAUDE.md` and `riviera-local-debug`, when their `--tests` sets are diffed,
      then they are identical, and the command runs green once. *Seam:* the two command blocks ·
      *Pinned by:* the run recorded in the PR body.
- [x] **AC-4:** Given RV-PROC-2, when its trigger and check b are read, then check b uses the same
      rule (by pointer) and says what a tightened non-member puts due instead. *Seam:* the item's
      text · *Pinned by:* reading the item against the deferral comment on #945.
- [x] **AC-5:** Given `docs/agents/gradle-proxy-trust.md` and ADR-0017, when the diff is read,
      then neither is touched and the rule's paragraph records why. *Seam:* the diff ·
      *Pinned by:* `git diff --stat origin/main` lists neither.

## Non-goals

- Changing the net's membership. The rule explains the five; it does not admit or remove any.
- Amending ADR-0017's "structural nets" list or `gradle-proxy-trust.md`'s recorded run (#945
  says why; the paragraph in `CLAUDE.md` now says it too).
- A guard script keeping the two commands in step. RV-PROC-2's command clause covers it at
  review; a script is a separate issue if the drift recurs.
- Research notes (`docs/research/`) that mention the net — not substrate, per RV-PROC-2.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new wording, replaces no surface.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The rule admits a class the command omits, or excludes one it names | low | high | applied to all 22 structural test files (`git ls-files` over `platform/src/test`), by reading code not Javadoc | session | closed — the table in the PR body |
| R-2 | New skill/CLAUDE.md prose trips the prose gate | med | low | `node scripts/check-inline-comments.mjs --diff origin/main` before each push | session | closed — exit 0 |
| R-3 | RV-PROC-2's narrower walk for a non-member reads as widening the item | low | low | it replaces a glob that already matched two non-members; the narrower walk is the honest reading of that glob | session | closed |

## Open questions / Assumptions

None.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; docs-only.

## Spring Modulith — modules, interfaces, events

N/A — no backend code in scope.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — docs-only, no frontend surface.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** DONE — merged via PR #962

**Next action:** none; this plan is deleted at the next close-out after PR #962 merges.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — state the rule, point the mentions at it, run the net | ✅ | 44eff409 |
| 1 — review-gate fixes, close-out | ✅ | the close-out commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (75) | `CLAUDE.md` called the `RESPONSIBILITIES.md` table "the full roster" and RV-PROC-2's trigger keyed on it, but the table omits `ErrorContractArchitectureTests`, `ScheduledWorkArchitectureTest`, `PaymentGatewayContractCoverageArchitectureTest`, `EndpointRoleGateCoverageTest` — the trigger lost coverage the old glob had | fixed in the close-out commit: the table is "the ones that enforce a clause of that file", and the trigger recognises a fitness function by mechanism, never by list |
| F-2 | review (75) | the rule's "names no class" has no carve-out for `ModularityTests`' `PlatformApplication.class`, a base-package anchor | fixed in the close-out commit: a member names no *target*; an anchor is not one |
| S-1 | sonar | quality gate passed, 0 new issues, 0 duplication; no new-lines or coverage measure (prose only) | clear |

---

## File structure

- `CLAUDE.md` — the membership rule beside the command
- `.claude/skills/riviera-local-debug/SKILL.md` — the command's comment points at the rule
- `.claude/skills/riviera-review-overlay/SKILL.md` — RV-PROC-2 trigger + check b
- `RESPONSIBILITIES.md` — the machine-checked roster points at the rule
- `docs/plans/structural-net-membership-rule.md` — this plan

---

## Phase 0 — State the rule, point the mentions at it

**Files:** Modify `CLAUDE.md`, `.claude/skills/riviera-local-debug/SKILL.md`,
`.claude/skills/riviera-review-overlay/SKILL.md`, `RESPONSIBILITIES.md`

- [x] **Step 1: Write the failing test** — the criterion candidates applied to the 22 structural
      test files. "Context-free" (the label's own words) admits ten and misses `ModularityTests`;
      "names no target" admits exactly the five and excludes each of the rest by a clause.
- [x] **Step 2: Run it, verify it fails** — the issue's table records the label's failure.
- [x] **Step 3: Minimal implementation** — the rule paragraph and the three pointers.
- [x] **Step 4: Run it, verify it passes** — the net run green once; the grep shows one definition.
- [x] **Step 5: Generalization-audit pass** — population: substrate lines that restate the net's
      membership; enumerated by `grep -rni 'structural net'` plus the five class names over the
      substrate set; the two commands and check b were the restatements → all point at the rule.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | phase 0 | substrate lines restating the net's membership | `grep -rni 'structural net' CLAUDE.md RESPONSIBILITIES.md .claude/skills docs/adr docs/agents` | 3 restatements (two commands, check b) + 2 lookalikes | commands keep the roster and point at the rule; check b points; lookalikes recorded, unchanged |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-5:** recorded in the PR body; AC-3's run at 44eff409 (5 suites, 23 tests, 0 failures), the command unchanged since.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying check.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A, docs-only.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR** — final state committed here, citing `merged via PR #962`.
- [x] **The review gate ran in full** — rung 1 (`code-review:code-review`, five reviewers + scorers) *plus* `riviera-review-overlay`, over `6dcbe114..44eff409`; outcome in a comment on PR #962.
