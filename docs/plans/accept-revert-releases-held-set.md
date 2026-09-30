# Accept-revert releases what the booking holds Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a failed payment set-up after an accept gives back exactly the claim the request holds at revert
time, never the set it was accepted on, and a stay the revert cannot restore whole is declined whole.

**Architecture:** `Bookings.revertAcceptToPending` RETURNs the set and span the booking holds (as
`cancelAwaitingPayment` does), and `RequestClaimService.revert` releases that. `revertStay` reverts every
still-awaiting stretch, then declines the stay (`SET_UNAVAILABLE`) when any stretch could not be reverted.
That is what the remodel does to a pending stay it disturbs.

**Source of intent:** #1302 (the owner's decision on the stay variant is in its comments).

**Branch:** `bugfix/accept-revert-releases-held-set`

## Acceptance criteria

- [x] **AC-1:** Given an accepted request that a remodel moved from S to C during the payment call, and a
  guest who then claimed (S, d), when the payment set-up fails, then the request is pending on C, (C, d) is
  released, and (S, d) still stands (#2). *Seam:* `RespondToRequest.accept` · *Pinned by:*
  `RequestAcceptRevertIT.aRevertAfterARemodelMoveReleasesTheMovedToSetOnly` (red on `main`).
- [ ] **AC-2:** Given an accepted two-stretch stay whose second stretch a remodel released during the payment
  call, when the payment set-up fails, then the first stretch is declined `SET_UNAVAILABLE`, the second stays
  cancelled, no day of either is held, and one `StayRequestDeclined` is published. *Seam:*
  `RespondToRequest.acceptStay` · *Pinned by:*
  `StayRequestAcceptPayIT.aFailedCollectionAfterARemodelReleaseDeclinesTheStay` (red on `main`).
- [ ] **AC-3:** The existing revert paths are unchanged: a plain failure reverts to pending and frees the
  day (`RequestAcceptRevertIT`, `StayRequestAcceptPayIT.aFailedCollectionRevertsEveryStretch`), and
  `JdbcBookingTransitionTableIT` and `RespondToRequestServiceTest` stay green.

## Non-goals

- The `BookingPaymentDue`/`StayPaymentDue` announce on a *successful* set-up naming the accepted set after a
  mid-call remodel move. It is a mail detail, not an inventory fault; filed separately if wanted.
- The lock-order deadlocks between stay claims and layout writes (#1305).

## Risks

- **R-1 (#2):** releasing a day the booking no longer holds deletes another guest's claim. → The release
  uses only what the guarded UPDATE returns, in the same transaction, so the booking's current `set_id` is
  read under its row lock.
- **R-2:** declining a stay whose other stretches a concurrent actor is also moving. → `declinePendingStay`
  is a guarded single statement over the stay's pending stretches. A miss returns false and publishes nothing.

## Availability & concurrency

- **Write paths to `set_availability`:** only `SpanClaim.releaseEveryDay` on the set and span that the revert
  UPDATE returns.
- **Strategy:** the guarded `UPDATE … WHERE status = AWAITING_PAYMENT RETURNING set_id, booking_date,
  last_date` takes the booking row lock. A remodel move that committed first is visible to its re-check, and
  one still in flight makes it wait, so the RETURNed set is the one the booking holds.
- **Pinning tests:** AC-1 and AC-2.

## Phases

- **Phase 0 — lone revert releases the held set:** AC-1 · red `RequestAcceptRevertIT.aRevertAfterARemodelMoveReleasesTheMovedToSetOnly`.
- **Phase 1 — a stay that cannot revert whole is declined:** AC-2 · red `StayRequestAcceptPayIT.aFailedCollectionAfterARemodelReleaseDeclinesTheStay`.

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** red IT for AC-2 (stay decline).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — lone revert | ✅ | (this commit) |
| 1 — stay decline | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
