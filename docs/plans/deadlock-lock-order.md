# One lock order per resource pair: the accept, the weather refund and token redemption Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the lock-order inversions still open on #1305 no longer deadlock (`40P01`). Each pair either
serializes or completes; no side answers `500` or loses its sweep batch.

**Architecture:** every pair gets one lock order, taken in a statement of its own before the read that
depends on it.
- The request accept takes its venue row `FOR SHARE` before any set lock, through a new
  `SetBookingFacts#lockVenueForClaim`. That matches the layout writes and, since #1314, the reserve.
- The weather refund locks every booking it will touch in one `(booking_date, id)`-ordered statement, then
  reads its candidates. That is the remodel's order, and the no-show sweep adopts it too by adding the `id`
  tiebreak.
- Token redemption locks the live account before consuming the token, which is erasure's account-first order.

**Source of intent:** #1305 (sweep for #1298). Pair 1 and the reserve side of pair 2 closed in #1314. The
remaining pairs are the accept side of pair 2, pairs 3 and 4, and pair 5.

**Branch:** `bugfix/deadlock-lock-order`

## Acceptance criteria

- [ ] **AC-1 (pair 2, accept side):** Given a stay request whose stretches claim set B then set A (B > A in
  id order), and an accept paused after its first claim, when a layout write over A and B runs, then both
  complete, one after the other. *Seam:* `RespondToRequestService.acceptStay` racing
  `VenueLayoutService` bulk save · *Pinned by:* `LockOrderDeadlockIT.aStayAcceptAndALayoutWriteSerialize`
  (`40P01` on `main`).
- [ ] **AC-2 (pair 3):** Given two past bookings covering the storm day, one with the lower id and the later
  `booking_date`, and a weather refund paused after its first booking write, when the no-show sweep runs,
  then both complete. *Seam:* `RefundForWeather.refundForWeather` racing `NoShowSweepService` ·
  *Pinned by:* `LockOrderDeadlockIT.aWeatherRefundAndTheNoShowSweepSerialize` (`40P01` on `main`).
- [ ] **AC-3 (pair 4):** The same two bookings, when a remodel commit moving both runs, then both complete.
  *Pinned by:* `LockOrderDeadlockIT.aWeatherRefundAndARemodelCommitSerialize` (`40P01` on `main`).
- [ ] **AC-4 (pair 5):** Given a password reset paused after consuming its token, when the account's
  erasure runs, then both complete, and the reset either lands before the erasure or finds the account
  erased. *Seam:* `CustomerAccountRecovery.resetPassword` racing `AccountErasure` · *Pinned by:*
  `LockOrderDeadlockIT.aResetAndAnErasureSerialize` (`40P01` on `main`). Likewise for `verifyEmail`.
- [ ] **AC-5:** The existing accept, weather-refund, sweep, remodel, recovery and erasure suites stay green,
  and so do the structural net and `VenueApiRoleSplitTests`.

## Non-goals

- #1307's own races (a token issued or an SSO identity linked after erasure, two live reset links). This
  slice only fixes the order in which the redemption takes its locks.

## Risks

- **R-1 (a new cycle):** each new lock must be checked against every writer of that row.
  - Venue `FOR SHARE`: the closure, profile, commission, rating and layout writers all take the venue first.
  - Bookings in `(booking_date, id)` order: check-in, cancel, day refund and remodel.
  - Account `FOR UPDATE`: erasure, sign-in and the token writes.
- **R-2 (stale reads):** the weather refund reads its candidates after the lock statement, so `attended` and
  `refunded` are post-wait. The per-booking writes keep their guards.
- **R-3 (Modulith #11):** `booking` takes the venue lock through `venue::api`
  (`SetBookingFacts#lockVenueForClaim`, the conversation of `poolForClaim`). The account lock is `customer`'s
  own.

## Modulith

- **Port:** `SetBookingFacts#lockVenueForClaim(VenueId)`. Owner: `venue`. Consumer: `booking`'s
  `RequestClaimService`. It joins the conversation of `poolForClaim` and `setBookingInfoForReserve`, so it adds
  no new port or grant.

## Availability & concurrency

- **Write paths to `set_availability`:** unchanged (`SpanClaim`). Only the order of locks taken before them
  changes.
- **Strategy:** locks in statements of their own, in one global order: venue, then sets, then bookings in
  `(booking_date, id)` order, then booking days. On the customer side: the account, then its tokens.
- **Pinning tests:** AC-1..4.

## Phases

- **Phase 0 — red:** the four deadlock ITs.
- **Phase 1 — accept venue-first:** AC-1.
- **Phase 2 — weather refund and sweep order:** AC-2, AC-3.
- **Phase 3 — account-first redemption:** AC-4.
- **Phase 4 — docs:** `RESPONSIBILITIES.md` §venue, §booking, §customer, and Javadoc.

## Execution status

**Stage pointer:** plan — intake done

**Next action:** Phase 0 red ITs.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — red | | |
| 1 — accept | | |
| 2 — weather | | |
| 3 — redemption | | |
| 4 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
