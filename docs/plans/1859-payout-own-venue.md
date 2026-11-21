# #1859 batch 4: the payout ITs own their venue

**Goal:** the eight payout ITs stop writing bookings and ledger rows on the seeded venue's first online set.
Each test seeds on a venue it creates and removes, and no class leaves a row behind.

**Architecture:**
- Each class takes a `StayFixtures.venue` per test (commission 1500 bps, the rate the assertions expect).
- `StayFixtures.cleanup` runs in `@AfterEach` where accruals or reversals are published, `cleanupNow` where
  rows are only stored.
- The re-delivery tests publish an identical event twice, and the registry's completion of the second can
  lose a race. Each re-drives its own stuck publication, so the cleanup's wait holds.
- Test code only.

**Source of intent:** #1859 (batch 4 of 5, scope agreed with the orchestrator).

**Branch:** `bugfix/1859-payout-own-venue`

## Acceptance criteria

- [ ] **AC-1:** Given the 8 classes in one fork, when each class finishes, then #1859's 13 tables hold the
  row counts they held before it. *Pinned by:* the uncommitted row-count listener (one fork on `main`
  and on the branch, each class alone).
- [ ] **AC-2:** green with no travel and at now + 12 years, none skipped.
- [ ] **AC-3:** Given the ledger's idempotency guard broken by an uncommitted mutation (the
  `payout_once_per_booking` constraint dropped and the insert's `ON CONFLICT` removed), the
  "exactly once" assertions go red. Any that stays green is reported.
- [ ] **AC-4:** No file under `platform/src/main` in the diff. The ledger's entry-type direction
  assertions are untouched.

## Risks

- **R-1 (#9):** a re-drive that re-runs a listener must not double-post. → The payout listeners are
  idempotent, and the guard mutation shows the assertions would catch a double post.
- **R-2:** the commission rate the assertions expect comes from the venue row. → The fixture venue
  carries 1500 bps, the seeded venue's rate.

## Open questions

## Phases

- **Phase 0:** the 8 classes; the row-count evidence both ways; the guard mutation.

## Execution status

- Phase 0: in progress.
