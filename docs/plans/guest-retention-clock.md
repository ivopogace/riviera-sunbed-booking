# Guest-contact retention basis on the application clock — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `CustomerDirectory.findOrCreate` stamps `customer.updated_at` from the injected `Clock` on both
the insert and the conflict path, so the retention gate (`updated_at < :olderThan`, cutoff from the same
`Clock`) compares one clock with itself.

**Architecture:** One statement changes: the find-or-create upsert binds a single `:now`
(`Timestamp.from(clock.instant())`) into the insert's `updated_at` and reuses it on conflict through
`EXCLUDED.updated_at`. The adapter takes the application `Clock` bean. No class, port, grant or migration.

**Source of intent:** #1854 (triage comment holds the owner's decisions: option 1, both paths, one
statement; `created_at` keeps its database default). Found by #1842 group F.

**Branch:** `bugfix/guest-retention-clock`

## Acceptance criteria

- [ ] **AC-1:** Given the application clock moved to 2038 and an aged guest row, when a booking's
  find-or-create refreshes that row while the retention sweep waits on its lock, then the sweep does not
  scrub it. *Seam:* `CustomerDirectory.findOrCreate` + `ExpireGuestContacts.sweep` · *Pinned by:*
  `GuestContactRetentionIT.aGuestWhoBooksWhileTheSweepReachesTheirRowIsNotScrubbed` (red under
  `RIVIERA_TEST_TRAVEL_TO=2038-01-01T10:00:00Z` before the fix, green after; green on the real clock).
- [ ] **AC-2:** Given the context clock set to an instant years from the database's `now()`, when
  find-or-create inserts a new guest and later refreshes it with the clock moved on, then `updated_at`
  equals the clock's instant both times. *Seam:* `CustomerDirectory.findOrCreate` · *Pinned by:*
  `CustomerDirectoryIT.stampsTheRetentionBasisFromTheApplicationClockOnInsertAndOnRefresh`.
- [ ] **AC-3:** The whole backend suite is green with no travel, and at 2038 (with #1855 on main, the only
  known red at 2038 is AC-1's test).

## Non-goals

- The recovery-token clock mix (`JdbcCustomerAccountTokens`, `JdbcOperatorResetTokens`): #1857.
- The guest tombstone's `erased_at = NOW(), updated_at = NOW()`: an erased row is excluded by gate 1's
  `erased_at IS NULL` before `updated_at` is compared.
- `created_at` (no reader) and the column defaults (no migration).
- The runbook's hand-run dry-run query (database `NOW()` / `CURRENT_DATE`, an operator's estimate).

## Risks

- **R-1: behaviour on a real clock changes (GDPR retention, #1303).** → The only reader of `updated_at`
  is the retention gate. What differs: host↔database skew (seconds) and the bound instant being read just
  before the statement rather than the transaction's start (`NOW()`); both are noise against a window in
  years and a cutoff at a Tirane day boundary. The #1303 lock-wait re-read is unchanged: the scrub's
  `UPDATE` still re-evaluates gate 1 on the row version the booking committed. Argued in the PR body.
- **R-2: the bind loses precision or zone.** → `Timestamp.from(Instant)` into `TIMESTAMPTZ`, the precedent
  in `JdbcAccountErasure`/`JdbcBookings`; spring-jdbc 7.0.10 `StatementCreatorUtils` passes a
  `java.sql.Timestamp` of unknown SQL type to `setObject` (it excludes `Timestamp` from its `Date`
  re-wrap); Postgres keeps microseconds. AC-2 asserts exact equality with micro-precision instants.
- **R-3: the new test moves a shared context's clock.** → `CustomerDirectoryIT` imports
  `TiraneDaytimeClock` and restores the `MovableClock` in `finally`; instants are in the past, so no sweep
  reaches further.

## Open questions

### Resolved

- Insert path too? — Owner, 2026-11-21: yes, one statement, one `:now`.
- Token expiry mix? — Orchestrator: out of scope, filed #1857.

## Phases

- **Phase 0 — red:** AC-2's test (red: the stamps are the database's time); AC-1 red under travel
  (reproduced on main @ `06f6680`).
- **Phase 1 — fix:** bind `:now` from the `Clock` in the upsert · AC-1 + AC-2 green, both clocks.
- **Phase 2 — suite:** the whole backend suite, no travel and at 2038 (in batches).

## Execution status

**Stage pointer:** implement (phase 2)

**Next action:** whole backend suite in batches, no travel and at 2038; then ready for review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — red | ✅ | 8dd0824 |
| 1 — fix | ✅ | (this commit) |
| 2 — suite | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
