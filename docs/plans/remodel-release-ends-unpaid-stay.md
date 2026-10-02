# Remodel release of one unpaid stretch ends the stay's other unpaid stretches (#1292)

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A remodel that releases one `AWAITING_PAYMENT` stretch of a stitched stay ends the stay's
other unpaid stretches in the same commit: their days are freed now, each exactly once (#2), they
appear on the receipt as `RELEASE` lines, and the guest gets one mail; the intent void stays after
commit, as today.

**Architecture:** The all-or-nothing rule (ADR-0024 Decision 3: one PaymentIntent per stay, so
`CancelPaymentPort#cancel` voids the whole group) is made visible where the remodel decides:
`RemodelClaims#classify` folds every other unpaid stretch of a released stretch's stay into the
picture as a `RELEASE` claim (so the preview, the token and the commit agree), and the commit's
release leg settles each the way it settles the disturbed one. A stay every live stretch of which
ends in the commit publishes one `StayCancelled` (refund 0, `VENUE_CHANGE`) after the stretches'
stamped `BookingCancelled`s, which is how the guest-cancel path already gets one mail per stay.

**Source of intent:** issue #1292 and its owner decision comment (2026-10-02); `RESPONSIBILITIES.md`
§ `booking` (the commit's legs, the release void), § `payment` (`CancelPaymentPort`); ADR-0020,
ADR-0024, ADR-0028; `docs/architecture/multi-day-stays.md` D5/D6/D8.

**Branch:** `bugfix/remodel-release-ends-unpaid-stay` — draft PR #1374

## Acceptance criteria

- [ ] **AC-1:** Given a stay of two `AWAITING_PAYMENT` stretches on sets A1 and A2, when a remodel
  disturbs A1 only and A1's stretch has no move candidate, then `classify` answers both stretches as
  `RELEASE` (A2's with its own spot), and the token covers both. *Seam:* `booking.api.RemodelClaims`
  · *Pinned by:* `RemodelClaimsServiceTest.releasingOneUnpaidStretchReleasesTheStaysOtherUnpaidStretches`
- [ ] **AC-2:** Given AC-1's picture, when the commit applies, then both stretches are `CANCELLED`,
  every `(set, date)` row of both spans is released exactly once, the receipt carries two `RELEASE`
  lines, each stretch's `BookingCancelled` (refund 0, `VENUE_CHANGE`) names the stay, and one
  `StayCancelled(stay, 0, EUR, VENUE_CHANGE)` follows. *Seam:* `RemodelClaims#commit`, `Bookings`,
  `AvailabilityClaim`, `RemodelReceipts`, the events · *Pinned by:*
  `RemodelClaimsServiceTest.commitEndsTheStaysOtherUnpaidStretchesAndMailsTheStayOnce`,
  `RemodelReleaseStayIT.disturbingOneUnpaidStretchEndsTheStay`
- [ ] **AC-3:** Given a stay whose other stretch is on another *disturbed* set with a move
  candidate (or in the frozen zone), when the first stretch releases, then the other is `RELEASE`
  too, never `MOVE`/`BLOCKED`, and takes no candidate from a later claim. *Seam:*
  `RemodelClaims#classify` · *Pinned by:*
  `RemodelClaimsServiceTest.aReleasedStaysSiblingOnADisturbedSetIsReleasedNotMovedAndTakesNoCandidate`
- [ ] **AC-4:** Given a stay with one `CONFIRMED` and one `AWAITING_PAYMENT` stretch, when the
  unpaid one releases, then the confirmed one is untouched, the released stretch's
  `BookingCancelled` names no stay and no `StayCancelled` is published (the stretch mails alone, as
  today). *Seam:* `RemodelClaims#commit` · *Pinned by:*
  `RemodelClaimsServiceTest.aStayWithAConfirmedStretchLeftMailsTheReleasedStretchAlone`
- [ ] **AC-5:** Given a stay stretch with a move candidate, when the remodel disturbs it, then it
  moves and nothing of its stay is released (unchanged behaviour). *Seam:* `RemodelClaims#classify`
  · *Pinned by:* existing `RemodelClaimsServiceTest.aStayMovesOnlyToASetFreeOnEveryDayOfItsSpan`
- [ ] **AC-6:** Given `StayCancelled(stay, 0, EUR, VENUE_CHANGE)` for a stay a remodel released,
  when `notification` mails it, then one `BOOKING_CANCELLATION` goes out under the stay's code and
  span with refund 0 and a rebook link; a guest's own stay cancel still gets none. *Seam:*
  `StayCancelled` → `StayCancellationMailListener`, `BookingNotificationFacts#endedByRemodel` ·
  *Pinned by:* `StayCancellationMailListenerTest.aStayARemodelReleasedCarriesARebookLink`,
  `StayCancellationMailIT.mailsAStayARemodelReleasedOnceWithItsRebookLink`
- [ ] **AC-7:** Given the sibling `RELEASE` lines, when `RemodelReceipts#releasedByRemodel` and
  `#endedByRemodel` are asked for a sibling, then both answer true (the void listener and #1290's
  guest-cancel rule see them as the disturbed stretch). *Seam:* `RemodelReceipts` · *Pinned by:*
  existing `JdbcRemodelReceiptsIT` (same line shape) + `RemodelReleaseStayIT`
- [ ] **AC-8:** `Bookings#findLiveStretchesOf(StayId)` answers the stay's live stretches in day
  order with status and stay id; a lone booking or an unknown stay answers empty. *Seam:*
  `Bookings` · *Pinned by:* `JdbcBookingsLiveClaimsIT.answersAStaysLiveStretchesInDayOrder`

## Non-goals

- Re-quoting or recreating the intent for the remaining stretches (the rejected alternative on the
  issue).
- Changing `payment::api`, `CancelPaymentPort`, or any Flyway migration.
- Changing the void's timing: it stays on `RemodelReleasePaymentListener` after commit; one void per
  stretch's `BookingCancelled`, idempotent at the gateway (an already-canceled intent is `Canceled`).
- Frontend changes: the preview's and receipt's `releases` lists already render any `RELEASE` line
  with its own spot.

## Risks

- **R-1 (#2):** a sibling released twice (once as a disturbed claim, once as a sibling) would
  double-release its rows → the sibling is one claim in the picture (deduplicated by booking id);
  the release leg is the guarded `cancelAwaitingPayment`, which releases only when a row moved.
- **R-2 (preview ≠ commit):** the commit must not end a stretch the operator never saw → the
  siblings are classified, so `PreviewToken#covers` is `Stale` on any difference.
- **R-3 (candidate starvation):** a sibling classified `MOVE` before its stay is known to release
  would take a candidate from a later claim → classification iterates to a fixpoint over the set of
  released stays; a forced release takes no candidate.
- **R-4 (mail):** one stamped `BookingCancelled` per stretch and one `StayCancelled` only when every
  live stretch ends; a stay with a `CONFIRMED` stretch left mails the released stretch alone with
  its rebook link (unchanged).
- **R-5 (#1290 sibling slice):** its guest-cancel rule keys on `RemodelReceipts#endedByRemodel` and
  the outcome lines; the siblings use the same `ReceiptOutcome(RELEASE)` shape.
- **R-6 (`@ApplicationModuleTest` blast radius):** no bean moves; `Bookings` gains a method on an
  existing port; `StayCancellationMailListener` gains `RebookLinks`, already a `notification` bean.

## Open questions

### Resolved

- Whether the other stretches appear on the preview and so in the token — **option A** (owner,
  2026-10-02, recorded on #1292): they do, as built.

## Availability & concurrency

- **Write paths to `set_availability`:** `AvailabilityClaim#release` per `(set, date)` of each
  released stretch's span, from `RemodelClaimsService#applyRelease` inside `venue`'s commit
  transaction, after `venue` has locked every set row of the venue.
- **Concurrency strategy:** the guarded `UPDATE booking … WHERE status = 'AWAITING_PAYMENT'
  RETURNING` decides who releases; a 0-row result throws under the lock (the picture changed) and
  the whole commit rolls back. A sibling appears once in the picture.
- **Pool (#3) and cutoff (#4):** untouched.
- **Pinning tests:** `RemodelReleaseStayIT` (rows gone once, statuses), `RemodelClaimsServiceTest`
  (release called once per day per stretch).

## Modulith

- `booking.application.Bookings#findLiveStretchesOf(StayId)` — internal driven port, JDBC adapter.
- `booking.api.RemodelClaims#classify` contract widens: the picture includes the unpaid stretches a
  released stretch takes with it. Owner: `booking` (what a booking becomes is its job).
- `booking.events.StayCancelled` is now also published by the remodel release (payload unchanged);
  `BookingCancelled#cancelledWithStay` set by the remodel release of a stay ending whole.
- `notification.adapter.in.StayCancellationMailListener` asks `booking.api.BookingNotificationFacts#endedByRemodel`
  for the rebook link, as `BookingCancellationMailListener` does. No new grant.

## Payment & payout

- No money moves: a release refunds 0; `payout` has nothing to reverse (no accrual).
- The intent is voided after commit by `RemodelReleasePaymentListener` on each stretch's
  `BookingCancelled`; `CancelPaymentPort` is idempotent (already-canceled → `Canceled`), so the
  second void is benign and counts nothing.

## Phases

- **Phase 0 — the stay query:** `Bookings#findLiveStretchesOf` · red test
  `JdbcBookingsLiveClaimsIT.answersAStaysLiveStretchesInDayOrder`
- **Phase 1 — classification:** siblings folded in as `RELEASE`, fixpoint, no candidate taken · red
  tests AC-1, AC-3
- **Phase 2 — commit:** sibling release leg, stamped events, one `StayCancelled`, confirmed-stretch
  edge · red tests AC-2 (unit), AC-4
- **Phase 3 — the IT:** `RemodelReleaseStayIT` · red test AC-2 (IT)
- **Phase 4 — the mail:** rebook link on a remodel-released stay's mail · red tests AC-6
- **Phase 5 — docs:** `RESPONSIBILITIES.md` § booking, § notification; `CONTEXT.md`; ADR-0024
  pointer; `multi-day-stays.md`; Javadoc of `StayCancelled`, `BookingCancelled`, `RemodelClaims`.

## Execution status

> The session-recovery anchor: re-read it (plus the current stage's `riviera-sdlc` reference)
> after a compaction or when unsure. Update in the same commit window as what it records.

**Stage pointer:** `CI gate — draft PR #1374 open; owner chose option A (as built)`

**Next action:** CI green → mark ready for review → review gate at high effort → Sonar gate → remove
this plan in the last commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the stay query | ✅ | phases 0–3 commit |
| 1 — classification | ✅ | phases 0–3 commit |
| 2 — commit | ✅ | phases 0–3 commit |
| 3 — the IT | ✅ | phases 0–3 commit |
| 4 — the mail | ✅ | phase 4 commit |
| 5 — docs | ✅ | phase 5 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
