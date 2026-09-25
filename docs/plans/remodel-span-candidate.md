# Multi-day stays: a remodel move candidate is free for the stay's whole span Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** A remodel moves a disturbed stay only to a set free on **every** day of its span; a stay
whose only first-day candidates are held on a later day falls through to the no-candidate outcome
(kept in the move-only zone), so the commit answers normally instead of a 500.

**Architecture:** `RemodelClaimsService` keeps one free pool per distinct date (read once, lazily,
through `SetBookingFacts#freeOnlineSetsOn`) and hands `MoveRanking` only the spots present in the
pool of every day of the claim's span; a picked set leaves the pool of every day of that span, so
an overlapping later claim cannot pick it. `MoveRanking` stays pure and unchanged in shape.

**Persistence:** JDBC only (invariant #1). No table, migration or new query.

**Source of intent:** GitHub issue #1217 (epic #1096); found by the review gate on #1202.

**Skills consulted:** `riviera-sdlc` (intake gate: the issue says a span with no candidate is
`Blocked`, but the existing rule blocks only in the move-only zone and refunds/releases/declines
beyond the floor — kept that split, AC-2; it also missed that the per-date pool let two overlapping
stays pick the same set, AC-3; open PRs are all dependabot's; no Flyway; previous sibling #1215's
plan is merged via PR #1218 and retires at this close-out) · `riviera-plan-doc` (forced the
overlapping-claims case into the risk register) · `tdd` (AC-1..AC-3 red first at `RemodelClaims`; AC-4
red at the HTTP seam against the old service — the preview proposed the move) · `riviera-review-overlay` (pending) · `riviera-docs-freshness` (pending) ·
`riviera-java-conventions` (Javadoc re-read whole on each touched type; no inline comments) ·
`riviera-modulith` (no port or package change; the span read stays on `venue::api`'s
`SetBookingFacts`, not the `venue.spi` `takenDaysBetween` the issue named, which `booking` may not
call) · `riviera-local-debug` (JDK 25 at `/opt/jdk-25`, scoped test runs only)

**Branch:** `claude/sdlc-1217-sooo1k` (the designated cloud branch stands in for
`bugfix/remodel-span-candidate`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a stay D..D+2 beyond the floor and a set free on D and D+2 but held on D+1,
  plus a farther set free all three days, when classified, then the stay moves to the farther set.
  *Seam:* `RemodelClaims.classify` · *Pinned by:*
  `RemodelClaimsServiceTest.aStayMovesOnlyToASetFreeOnEveryDayOfItsSpan`
- [x] **AC-2:** Given a move-only stay whose only first-day candidate is held on a later day, when
  classified then committed, then it is `Blocked(NO_MOVE_CANDIDATE)`, the commit claims and releases
  nothing and answers `Applied` with the claim kept. *Seam:* `RemodelClaims.commit` · *Pinned by:*
  `RemodelClaimsServiceTest.aMoveOnlyStayWithNoWholeSpanCandidateIsKeptAndTheCommitAnswersNormally`
- [x] **AC-3:** Given two stays D..D+2 and D+1..D+3 and one set free on all four days, when
  classified, then only the first moves there; the second, starting on D+1, does not get it.
  *Seam:* `RemodelClaims.classify` · *Pinned by:*
  `RemodelClaimsServiceTest.aSetPickedForAStayLeavesEveryDayOfItsSpan`
- [x] **AC-4:** Given a live confirmed stay today+3..today+5 on A1 and A2 held on today+4, when the
  operator previews and commits a layout that drops A1, then the preview shows the stay kept
  (`NO_MOVE_CANDIDATE`), the commit answers `200` with it kept, and the booking, its three rows and
  A1 are unchanged. *Seam:* `POST /api/venues/{v}/beach-map/preview` + `/commit` · *Pinned by:*
  `RemodelCommitIT.aStayWhoseFirstDayCandidateIsHeldLaterIsKeptAndTheCommitAnswersNormally`

## Non-goals

- Per-segment settlement of a stay (story 41, a later slice).
- The zone of a stay: still its first day's.
- Counting rows freed by an earlier claim of the same commit as candidates (unchanged).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two overlapping stays pick the same set because the pool is per first date; the second claim's commit loses its row and throws | High once stays exist | 500 on commit | A pick leaves every day's pool of its span (AC-3) | booking | phase 0 |
| R-2 | One `freeOnlineSetsOn` read per day of each span multiplies queries | Low | Slower preview | Cached per distinct date across all claims; frozen claims read nothing | booking | phase 0 |
| R-3 | A one-day claim's behaviour drifts | Low | Wrong moves | Existing `RemodelClaimsServiceTest`/ITs unchanged and green | booking | phase 0 |

## Open questions / Assumptions

- **Assumption:** a stay with no whole-span candidate follows the one-day no-candidate rule (kept in
  the move-only zone; refunded, released or declined beyond the floor), not always kept as the
  issue's wording reads — *Owner:* booking · *Resolves by:* PR review ← confirm?

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** the remodel commit's move (claim every
  day of the span on the candidate, then release the old rows) — unchanged.
- **Uniqueness guarantee:** `set_availability` primary key `(set_id, booking_date)` — unchanged.
- **Concurrency strategy:** the commit re-classifies under `venue`'s set locks; the candidate is now
  free on every day in that locked read, so the claim wins each day unless a concurrent writer
  bypasses the lock, which still throws and rolls back.
- **Pool rule (#3):** candidates come from `freeOnlineSetsOn` (online pool only) — unchanged.
- **Cutoff rule (#4):** N/A — sales close plays no role in a remodel.
- **Pinning test:** `RemodelCommitIT.aStayWhoseFirstDayCandidateIsHeldLaterIsKeptAndTheCommitAnswersNormally`

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | none new | the remodel classification is `booking`'s |

**Cross-module `api/` ports:** none new or changed.

**Domain events:** none new or changed.

### Module ownership (§4a)

`booking` only, no boundary change: the move candidate is `booking`'s rule (RESPONSIBILITIES.md §
booking, remodel classification).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope (a refund outcome is chosen by the unchanged status split).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** PR (draft) → review gate

**Next action:** open the PR, confirm CI green, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — span-aware candidate (AC-1..AC-4 red then green; structural net green) | ✅ | this commit |

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — the span-aware pool
- `platform/src/main/java/ai/riviera/platform/booking/domain/{MoveRanking,FreeSpot}.java` — contract Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/api/RemodelClaims.java` — contract Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/BlockReason.java` — contract Javadoc
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsServiceTest.java` — AC-1..AC-3
- `platform/src/test/java/ai/riviera/platform/booking/domain/MoveRankingTest.java` — contract Javadoc
- `platform/src/test/java/ai/riviera/platform/RemodelCommitIT.java` — AC-4
- `RESPONSIBILITIES.md`, `CONTEXT.md` — the move candidate is free on every day
- `docs/plans/moved-mail-days.md` — retired (merged via PR #1218)

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-25 | span-blind candidate | every read of a free set/pool in `booking` that picks for a claim | `git grep -n "freeOnlineSetsOn\|MoveRanking.pick" platform/src/main` | `RemodelClaimsService` only (the reserve path claims per day itself) | fixed here |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3:** `./gradlew test --tests "*RemodelClaimsServiceTest*"` → PASS.
- [ ] **AC-4:** `./gradlew test --tests "*RemodelCommitIT*"` → PASS.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No JPA (#1). Availability section filled (#2).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports (#11).
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] The review gate ran in full.
