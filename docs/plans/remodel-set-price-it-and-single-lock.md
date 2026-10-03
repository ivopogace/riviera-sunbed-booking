# Remodel commit: set-price 400 IT, and one remainder lock per settled claim

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `RemodelCommitIT` pins the set-price rule (EUR, ≥ €0.50) as a 400 on commit, and every confirmed-end
settlement path in `RemodelClaimsService` takes the booking's remainder lock exactly once.

**Architecture:** No new structure. `applyConfirmedEnd` takes the `LockedRemainder` from its caller; each caller
(Move, Refund, NothingLeft) locks first, so the lock still precedes every read the settlement decides on.

**Source of intent:** #1420 (narrowed by its triage comment: commit only, the preview carries no price), #1402.

**Branch:** `feature/remodel-set-price-it-and-single-lock`

## Acceptance criteria

- [ ] **AC-1:** Given a venue with a layout, when a commit carries a cell priced 49 EUR minor units, or 3000 ALL,
  then it answers `400 INVALID_REQUEST` and the venue's `setVersion` and stored prices are unchanged.
  *Seam:* `POST /api/venues/{v}/beach-map/commit` · *Pinned by:* `RemodelCommitIT.aCellPricedBelowTheFloorOrOutsideEurIsRefusedAndWritesNothing`
- [ ] **AC-2:** Given the same venue, when a commit carries a cell at exactly 50 EUR minor units, then it applies
  and the set is stored at 50. *Seam:* same · *Pinned by:* `RemodelCommitIT.aCellPricedAtTheFloorCommits`
- [ ] **AC-3:** Given a Move, Refund or NothingLeft claim, when the commit settles it, then `Bookings#lockRemainder`
  is called exactly once for that booking, before `cancelConfirmed`. *Seam:* `RemodelClaims#commit`
  · *Pinned by:* `RemodelClaimsServiceTest` (`verify(bookings, times(1)).lockRemainder(id)` in the nothing-left,
  refund, move-to-nothing-left and move cases)

## Non-goals

- Changing the price rule; preview price checks (the preview request has no price).

## Risks

- **R-1:** a Refund/NothingLeft caller forgets to lock before passing a remainder → the settlement would decide on an
  unlocked read (#2 via a stale remainder). Mitigation: the signature makes the remainder a required argument, only
  `lockRemainder` produces one, and AC-3's in-order verifies pin lock-before-cancel per path.
- **R-2:** mutation weakness of AC-1 — mitigated by a manual mutation: removing `SetPrice.require` from `LayoutCell`
  must fail AC-1 (recorded in the PR).

## Availability & concurrency

- **Write paths to `set_availability`:** unchanged (release on confirmed end; claim/release on move).
- **Concurrency strategy:** unchanged: the booking row lock (`lockById` inside `lockRemainder`) is taken once per
  claim, before any read the leg decides on; the venue lock above it is `venue`'s commit transaction.

## Phases

- **Phase 0 — #1402:** red `RemodelClaimsServiceTest` count verifies (Move nothing-left case calls it twice today),
  then pass the remainder in.
- **Phase 1 — #1420:** `RemodelCommitIT` price cases; mutation check.

## Execution status

- [x] Phase 0 — remainder passed in; count verifies green
- [ ] Phase 1
