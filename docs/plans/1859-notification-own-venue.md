# #1859 batch 1: the notification ITs own their venue

**Goal:** the 13 notification ITs and `PayoutSpineRetryIT` stop writing on the seeded venue's first online
set; each test seeds on a venue it creates and removes, and no class leaves a row behind.

**Architecture:** `BookingMailFixtures.onlineSet()` makes a `StayFixtures.venue` on first use and
`removeVenue()` runs `StayFixtures.cleanup` from the caller's `@AfterEach`; the six classes that query
the seeded venue directly take a `StayFixtures.venue` per test. Test code only.

**Source of intent:** #1859 (batch 1 of 5, scope agreed with the orchestrator).

**Branch:** `bugfix/1859-notification-own-venue`

## Acceptance criteria

- [ ] **AC-1:** Given the batch's 14 classes in one fork, when each finishes, then the row counts of
  `venue`, `set_position`, `set_availability`, `booking`, `stay`, `booking_day`, `customer`, `operator`,
  `operator_venue`, `remodel_receipt`, `payout_ledger_entry`, `booking_confirmation_mail_attempt`,
  `payment` are what they were before it. *Seam:* the shared Testcontainers database · *Pinned by:* the
  uncommitted row-count `TestExecutionListener` (one fork on `main` and on the branch, each class alone).
- [ ] **AC-2:** Given the same classes, when run with no travel and at `RIVIERA_TEST_TRAVEL_TO` = now + 12
  years, then every test is green and none skipped. *Pinned by:* the classes themselves.
- [ ] **AC-3:** No file under `platform/src/main` in the diff.

## Non-goals

- The booking, payout, availability, payment and root classes (batches 2–5).
- `email_suppression` rows (hashed, address-keyed, read by no other class).

## Risks

- **R-1:** `StayFixtures.cleanup` waits for the venue's incomplete publications; a test that leaves one
  outstanding on purpose would time out → heal or remove that publication inside the test, never weaken
  the wait.
- **R-2:** A blanket resubmit elsewhere (`StayConfirmationMailIT`) re-delivers other classes' outstanding
  publications; a booking deleted under one would fail its listener → cleanup only runs once the venue's
  publications are complete.

## Open questions

## Phases

- **Phase 0:** fixture + its 8 callers; the 6 direct classes; row-count evidence both ways.

## Execution status

- Phase 0: in progress.
