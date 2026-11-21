# Stay fixtures read the context clock (#1842, group A) Implementation Plan

> Test code only. Invariant numbers: `CLAUDE.md`.

**Goal:** with `RIVIERA_TEST_TRAVEL_TO=2038-01-01T10:00:00Z`, the 15 group-A classes that #1842's triage
found red (54 tests) are green, and they stay green with the real clock.

**Architecture:** `StayFixtures.firstDay(Clock)` reads `TiraneDaytimeClock.today(clock)`; every caller passes
its context's `Clock`. The wall reads left in the 15 red classes (`Instant.now()`, `LocalDate.now(TIRANE)`,
seed SQL `now()`) read the same clock, so the test and the application agree on "now" under travel.

**Source of intent:** #1842 (triage comment: groups A–F, the PR order).

**Branch:** `bugfix/stay-fixtures-clock-1842`

## Acceptance criteria

- [ ] **AC-1:** Given the clock at 2038-01-01T10:00Z, when group A's 15 classes run, then all 54 tests red on
  `main` are green. *Seam:* the context `Clock` bean moved by `TestClockTravel` · *Pinned by:* the 15 classes.
- [ ] **AC-2:** Given the real clock, when every caller of `StayFixtures.firstDay` (22 classes) and the rest of
  the suite run, then they are green. *Seam:* same · *Pinned by:* the 22 classes; the suite in package batches.
- [ ] **AC-3:** No file under `platform/src/main` in the diff.

## Non-goals

- Groups B–F, section 1's writers, #1846's residue, section 3 and section 4: later PRs on #1842.
- `StayFixtures.insertStay`'s SQL `now()` for `confirmed_at`: production reads it only as `IS NOT NULL`, and the
  signature change reaches 12 files, 8 of them in group B. It moves with group B's PR.

## Risks

- **R-1:** a signature change that only compiles hides a behaviour change in a green caller → the seven green
  callers run in the no-travel suite pass.
- **R-2:** a clock-derived day collides with another class's rows (#2) → every caller already runs on its own
  `StayFixtures.venue`, removed after each test.

## Phases

- **Phase 0 — `firstDay(Clock)` and the callers' wall reads:** red = the 54 tests at 2038 on `main`.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** open the draft PR once the no-travel suite is green.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `firstDay(Clock)` and the callers' wall reads | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
