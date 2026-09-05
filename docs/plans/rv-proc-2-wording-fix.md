# RV-PROC-2 wording fix — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** RV-PROC-2's checks b and c, read literally, give the verdict the item means: a
non-structural rule puts no substrate re-walk due, a grep hit is a finding only when the diff
falsified it, and the two check-b commands sweep one path set.

**Architecture:** Wording-only, one file. Check b names the five structural tests as the
re-walk trigger and binds both commands to one `SUBSTRATE` path list (the trigger's own set —
every Java fence under `docs/` outside `adr`/`agents` is in a research note, which the item
already skips). Check c defines removed/renamed wording as a name the tree after the diff does
not answer to, and makes "the diff falsified it" the finding test.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched.

**Source of intent:** GitHub issue #941.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the issue's three
defects re-verified against `main` after PR #957; the AC-3 choice settled by data, not by
preference) · `riviera-plan-doc` (this template — kept short by the owner's instruction) ·
`tdd` (the test is a replay: #939's squash `c0b7e61f` walked against the corrected text, transcript
in the PR body) · `riviera-review-overlay` (review gate — at ready for review; RV-PROC-2 over its
own edit) · `riviera-docs-freshness` (**ran** as check c over this diff — the diff retires no
name; retired `docs/plans/prose-gate.md`, merged via PR #957, no citations outside `docs/plans/`)
· `riviera-local-debug` (unshallowed the clone and fetched `main` before the replay and the
`--diff` guard runs).

**Branch:** `claude/rv-proc-2-wording-fix-2r1x87` (the session's designated remote branch
stands in for `bugfix/rv-proc-2-wording-fix`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a diff that adds a non-structural rule, when check b is read literally,
      then no substrate-wide re-walk is due — the trigger names the five structural tests.
      *Seam:* the item's text · *Pinned by:* replay of #939 (adds RV-PROC-2, touches no
      `platform/` path) → re-walk not due.
- [x] **AC-2:** Given a grep hit, when check c is applied, then it is a finding only if the diff
      falsified it; and the check says what counts as removed or renamed wording.
      *Seam:* the item's text · *Pinned by:* replay of #939 — `RV-PROC-1` → `RV-PROC-*` retires
      nothing (N/A); no retired name has a falsified hit.
- [x] **AC-3:** Given the two check-b commands, when both are run from the repo root, then they
      sweep the same paths (`$SUBSTRATE`) and the prose says why `docs/` beyond `adr`/`agents`
      is out. *Seam:* the command block · *Pinned by:* both commands run on `main`: 4 files
      located, 0 forbidden imports.
- [x] **AC-4:** Given #939's squash, when it is replayed against the corrected item, then checks
      b and c yield zero findings. *Seam:* the item's text, walked as a reviewer would ·
      *Pinned by:* the transcript in the PR body.

## Non-goals

- Any change to RV-PROC-2's trigger, check a, or check b's paragraph on commands ("A **command**
  is a worked example too…"). The two-command block under check b is in scope (AC-3).
- The membership rule behind the five structural tests (#945).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new wording, replaces no surface.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Narrowing check b's locate command to the trigger set hides a Java example outside it | low | med | measured: every fence under `docs/` outside `adr`/`agents` is in `docs/research/` or `docs/architecture/research/` | session | closed — the prose states the reason |
| R-2 | New skill lines trip the prose gate (PR #957) | med | low | `node scripts/check-inline-comments.mjs --diff origin/main` before each push | session | closed — exit 0, advisories reworded |

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

**Stage pointer:** PR — draft open, CI pending

**Next action:** mark ready for review once CI is green; run the review gate per
`riviera-sdlc` `references/pr-gates.md` §1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — reword checks b and c, replay #939 | ✅ | first commit on the branch |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `.claude/skills/riviera-review-overlay/SKILL.md` — RV-PROC-2 checks b and c
- `docs/plans/prose-gate.md` — retired (merged via PR #957)
- `docs/plans/rv-proc-2-wording-fix.md` — this plan

---

## Phase 0 — Reword checks b and c

**Files:** Modify `.claude/skills/riviera-review-overlay/SKILL.md`

- [x] **Step 1: Write the failing test** — the literal current text replayed against #939: check
      b obliges a substrate re-walk, check c yields five Majors on `RV-PROC-1` (issue #941 §3).
- [x] **Step 2: Run it, verify it fails** — the issue records the failure.
- [x] **Step 3: Minimal implementation** — the reworded checks.
- [x] **Step 4: Run it, verify it passes** — replay transcript: 0 findings from b and c.
- [x] **Step 5: Generalization-audit pass** — population: RV-PROC items stating what to look at
      without what makes a hit a finding; enumerated by reading RV-PROC-1 and RV-PROC-2 (the
      whole population); RV-PROC-1 names its finding ("a touched area with no matching skill
      listed") → no further sites.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status**

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | phase 0 | RV-PROC items in the overlay SKILL.md | `grep -n '^## RV-PROC' .claude/skills/riviera-review-overlay/SKILL.md` | 2 | RV-PROC-1 already names its finding; no change |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-4:** the replay transcript in the PR body, run at the first commit.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying replay.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Invariants #1–#13: N/A, docs-only.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — final state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
