# #1859 batch 5: availability, payment and root ITs own their venue — Implementation Plan

> Test code only. Invariant numbers: `CLAUDE.md`.

**Goal:** the six batch-5 ITs seed only on a `StayFixtures` venue each test creates and removes, so none of them
picks the seeded venue's first online set and none leaves a row behind.

**Architecture:** the batch 1–3 pattern: `StayFixtures.venue` in `@BeforeEach`; `cleanupNow` in `@AfterEach` where
nothing publishes (the claim, raw inserts), `cleanup` (waits out the venue's incomplete publications) where a
confirm, cancel or `BookingConfirmed` fans out. No shared fixture changes.

**Source of intent:** #1859 (triaged; batch records on the issue).

**Branch:** `bugfix/1859-availability-payment-root`

## Acceptance criteria

- **AC-1** Given each of `AvailabilityClaimIT`, `ConcurrentClaimIT`, `AvailabilityMigrationIT`,
  `PaymentReconciliationIT`, `AbandonedSweepSurvivesWedgedJobIT`, `EventRegistryDurabilityIT`, when it runs (batch in
  one fork, at the travelled clock, alone), then the row counts of the 13 probed tables are unchanged after the
  class — seam: an uncommitted row-count `TestExecutionListener`.
- **AC-2** Given the claim answering `CLAIMED` always, or without `ON CONFLICT DO NOTHING`, when `ConcurrentClaimIT`
  and `AvailabilityClaimIT` run on their own venues, then every race test and `claimingTakenSetIsRejected` go red
  (invariant #2) — seam: `JdbcAvailabilityClaim`, uncommitted mutation.
- **AC-3** Given the pool check removed, then `walkInSetIsNotClaimable` goes red (invariant #3).
- **AC-4** Given `set_availability_uniq` dropped by a local throwaway migration, then
  `uniqueConstraintRejectsDuplicateSetDate` goes red; no file under `db/migration` is committed (invariant #12).

## Risks

- `cleanup` waits 10 s for the venue's publications: a listener left failing would time out the `@AfterEach`.
- `AbandonedSweepSurvivesWedgedJobIT` keeps a whole-table sweep count; valid only while its property set is a
  container of its own.

## Availability & concurrency

The claim and the race are unchanged; only the set moves to the test's own venue. AC-2/AC-3/AC-4 show the
assertions still fail when the guard is broken.

## Phases

- **Phase 0 — own venue per test:** the six classes move to `StayFixtures.venue` + cleanup · evidence AC-1..AC-4.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** commit phase 0, open the draft PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — own venue per test | ⏳ | |
