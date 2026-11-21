# Review ITs read the context clock (#1842, group C) Implementation Plan

> Test code only. Invariant numbers: `CLAUDE.md`.

**Goal:** with `RIVIERA_TEST_TRAVEL_TO=2038-01-01T10:00:00Z`, the five group-C review classes that #1842's triage
found red (18 tests) are green; with the real clock, the suite stays green.

**Architecture:** the review window is judged on the context `Clock` against the check-in stamp the test seeds, so
the seeds read the same clock: `clock.instant()` for check-in, `created_at` and `hidden_at`. `ReviewFixtures` takes
the clock in its constructor; clock-derived `static final` stamps become per-test fields set in `@BeforeEach`.

**Source of intent:** #1842 (triage comment, PR order).

**Branch:** `bugfix/review-window-clock-1842`

## Acceptance criteria

- [ ] **AC-1:** Given the clock at 2038-01-01T10:00Z, when the five group-C classes run, then the 18 tests red on
  `main` are green. *Seam:* the context `Clock` moved by `TestClockTravel` · *Pinned by:* the five classes.
- [ ] **AC-2:** Given the real clock, when the ten touched classes and the rest of the suite run, then they are
  green. *Seam:* same · *Pinned by:* the touched classes; the suite in package batches.
- [ ] **AC-3:** No file under `platform/src/main` in the diff.

## Non-goals

- Group F (`GuestContactRetentionIT`): its wall read is the production find-or-create's `updated_at = NOW()`
  against the sweep's application-clock cutoff; a test cannot fix it. Raised to the owner as a decision on #1842.
- Groups D–E, section 1's writers, #1846's residue, sections 3 and 4: later PRs on #1842.

## Risks

- **R-1:** a clock-derived `static final` reads an injected field → per-test field set in `@BeforeEach`
  (`ReviewUniquenessIT`, `JdbcCompletedStaysIT`).
- **R-2:** `JdbcCompletedStaysIT` asserts its stamp round-trips → kept truncated to micros, as before.

## Phases

- **Phase 0 — the review fixtures and the five classes read the clock:** red = the 18 tests at 2038 on `main`.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** open the draft PR; finish the batch at 2038 and the no-travel suite.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the review ITs read the clock | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
