# Trim comment and Javadoc volume across backend and frontend

**Issue:** #544 · **Branch:** `chore/trim-comment-volume` · **Type:** repo-wide mechanical sweep (comment-only)

## Problem

Comments reached **24,718 lines across 1,069 files**, and **42% of `platform/src/main`** (11,895
comment lines against 13,074 code lines). Measured at branch point:

| Area | Files | Comment lines | Share of tree |
|---|---|---|---|
| `platform/src/main` | 481 | 11,895 | 42% |
| `platform/src/test` | 309 | 7,517 | 17% |
| `frontend/src` (ts + html) | 268 | 5,204 | 13% |
| `frontend/e2e` | 11 | 255 | 21% |

Almost none is contract documentation: **53 of 1,280** backend doc blocks carry a
`@param`/`@return`/`@throws`. **683 cite a GitHub issue number**; ~14,900 lines sit in ≥7-line blocks
that are decision archaeology.

**Cause — a rule working as specified, not drift.** `riviera-java-conventions` §6c makes an inline
comment one line "or it is not written", with the carve-out *"move the prose to the Javadoc, which is
exempt"*. The RV-STYLE-1 guard measures inline comments; nothing measured Javadoc. It became the
pressure valve.

**Much of it is a third copy.** `ObservabilityMetrics`' 214 comment lines restated what
`RESPONSIBILITIES.md` §`shared` *and* `docs/runbooks/observability.md` (505 lines) already document
in more depth.

## Solution

`riviera-java-conventions` **§6d — Javadoc: the contract, not the changelog** (+ the twin in
`frontend/.claude/CLAUDE.md`), then applied file by file:

- Javadoc says what a caller must know, not how the code came to be.
- No issue numbers — `git blame` and the tracker hold provenance.
- No decision history; relocate load-bearing rationale to `RESPONSIBILITIES.md` / an ADR / a runbook
  and leave a one-line pointer.
- Keep short operational warnings needed at the point of use ("do not sum them").
- Budget as a smell test: ~6 lines on a type, 3 on a member.

## Acceptance criteria (testable)

- [x] AC-1 §6d exists; `frontend/.claude/CLAUDE.md` carries the twin rule.
- [x] AC-2 `node scripts/check-comment-only.mjs main` exits 0 — every touched source file is
      code-identical after comment stripping.
- [x] AC-3 `node --test scripts/*.test.mjs` green (8 new cases for the verifier).
- [ ] AC-4 Full CI green (backend build + test, frontend lint/test/build + e2e, both hygiene checks).
- [ ] AC-5 Every file in the sweep scope trimmed to §6d.
- [ ] AC-6 No rationale lost: anything load-bearing that was removed exists in a substrate doc.

## Non-goals

- **Machine-enforcing a Javadoc line budget.** A budget invites six useless lines as readily as it
  stops sixty. §6d is a review item; `check-comment-only.mjs` verifies *inertness*, not brevity.
- **`#` and SQL `--` comment syntaxes** — outside RV-STYLE-1 scope by the #522/F-6 precedent.
- **Any behaviour change.** Not a refactor; if code must change, that is a separate slice.

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| R-1 | A "comment-only" edit silently changes code — worst case in `SecurityConfig`, where a dropped matcher is a vulnerability | `check-comment-only.mjs` strips comments from both sides and diffs the remainder; run per batch, and it is the AC-2 gate |
| R-2 | Load-bearing rationale deleted rather than relocated, losing knowledge review paid for | Check the substrate docs **first** — most of it is already duplicated there. Relocate before deleting; keep point-of-use warnings |
| R-3 | A 1,000-file diff is unreviewable, so review rubber-stamps it | Batched commits by area with an inertness proof per batch; the diff is large but provably inert |
| R-4 | Ordering-sensitive security comments lost from `SecurityConfig` | First-match-wins rule stated **once** at the `authorizeHttpRequests` block; each order-sensitive matcher keeps a one-line marker |
| R-5 | The sweep spans sessions and loses its place | This doc is the state store (SDLC rule 11); the ledger below is updated per batch |

## Open questions / Assumptions

- **A-1** Trim level and scope were decided by the maintainer up front: *contract-only Javadoc with
  rationale relocated* (not deleted), across all four trees. Recorded so no session re-derives it.
- **A-2** Test-tree doc blocks that justify *why a test exists* are more defensible than production
  archaeology; they still lose issue numbers and history, but the "why this test" sentence stays.

## Availability & concurrency (invariant #2)

Not touched. No SQL, no transaction, no claim path changes — comment-only by construction, proved by
AC-2.

## Spring Modulith — modules, interfaces, events

No module boundary, published surface, event or dependency changes. No class moves, so
`riviera-modulith` placement rules are not engaged and `ModularityTests` /
`PackageShapeArchitectureTests` should be unaffected.

## Payment & payout (invariants #5, #8, #9, #10)

Not touched. `ObservabilityMetrics` money-path metric **names** keep their exact string values
(verified by AC-2), so `MoneyPathAlertCheck` and every dashboard reading them are unaffected.

## Angular — frontend surfaces touched

No component, template binding, route or service behaviour changes. TSDoc and HTML comments only.

## Execution status

**Stage:** Implement (batched) · **Next action:** continue the ledger below, heaviest files first.

| Phase | Scope | Status |
|---|---|---|
| 0 | §6d + frontend twin | ✅ committed `1109c2f` |
| 1 | `check-comment-only.mjs` + test | ✅ committed |
| 2 | `platform/src/main` — heaviest files | 🔄 in progress (3 of 481) |
| 3 | `platform/src/main` — remainder | ⬜ not started |
| 4 | `platform/src/test` | ⬜ not started |
| 5 | `frontend/src` + `frontend/e2e` | ⬜ not started |

### Trim ledger

| File | Before | After | Note |
|---|---|---|---|
| `shared/ObservabilityMetrics.java` | 245 | 92 | Third copy of RESPONSIBILITIES §`shared` + the observability runbook |
| `SecurityConfig.java` | 635 | 487 | Ordering rule stated once, not eight times |
| `shared/MdcTaskDecorator.java` | 127 | 100 | Kept all three traps; dropped the #455/#410 argument |

**Remaining heaviest** (comment lines, from `concentration.mjs`): `RateLimitFilter.java` 273 ·
`AsyncMailDispatcher.java` 189 · `RateLimitFilterTest.java` 178 · `TransactionalMailService.java` 153 ·
`TransactionalMailServiceTest.java` 143 · `Bookings.java` 141 · `operator-console.model.ts` 133 ·
`RefundExecutorConfig.java` 131 · `RegistryMailExecutorConfig.java` 128.

Concentration is long-tailed — top 100 files hold 34%, top 400 hold 72% — so there is no shortcut
set. Expect the full sweep to span sessions; work heaviest-first so each session lands real volume.

## File structure

Comment-only edits across the source trees; globs stand in for the mechanical sweep, as the #533
guard sanctions.

- `.claude/skills/riviera-java-conventions/SKILL.md` — **modified**: adds §6d, bounds §6c's exemption
- `frontend/.claude/CLAUDE.md` — **modified**: the TSDoc twin of §6d
- `scripts/check-comment-only.mjs` — **new**: proves a trim diff changed only comments
- `scripts/check-comment-only.test.mjs` — **new**: 8 cases incl. string/text-block false positives
- `docs/plans/comment-volume-trim.md` — **new**: this doc
- `platform/src/main/java/` — **modified**: Javadoc trimmed to §6d, comment-only
- `platform/src/test/java/` — **modified**: Javadoc trimmed to §6d, comment-only
- `frontend/src/` — **modified**: TSDoc + HTML comments trimmed, comment-only
- `frontend/e2e/` — **modified**: TSDoc trimmed, comment-only

## Skills consulted

- **`riviera-sdlc`** — routed the work; this doc is the rule-11 state store.
- **`riviera-java-conventions`** — the authority being amended (§6c→§6d); read before any Java edit.
- **`riviera-plan-doc`** — this doc's shape.
- **`riviera-review-overlay`** — RV-STYLE-1 is the review item §6d extends; due at the review gate.
- `riviera-modulith` **not** loaded: no class moves, no published-surface or boundary changes, so the
  placement authority is not engaged. Recorded explicitly because the routing gate would otherwise
  read the backend-Java row as triggered.

## Self-review checklist (before merge / PR)

- [ ] `node scripts/check-comment-only.mjs origin/main` exits 0
- [ ] `node --test "scripts/*.test.mjs"` green
- [ ] `node scripts/check-inline-comments.mjs --diff origin/main` exits 0 (the trim must not itself
      write a multi-line inline comment)
- [ ] Backend build + full test suite green in CI
- [ ] Frontend lint + test + build + e2e green in CI
- [ ] Spot-check that no removed rationale is unrecorded (R-2)
