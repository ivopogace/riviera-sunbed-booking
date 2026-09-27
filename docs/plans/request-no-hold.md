# A pending request is not a hold — Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** A Request-to-Book request writes no `set_availability` row; the venue's accept claims every
day of the request all or nothing, declines the losers that overlap it, and every request-termination
leg releases nothing.

**Architecture:** The claim moves from the reserve to the accept, inside one transaction on the pending
row's lock (`SELECT … FOR UPDATE` on the booking, then the existing `INSERT … ON CONFLICT DO NOTHING`
claim per day), so invariant #2 keeps its one primitive and the accept can be answered `SET_UNAVAILABLE`
as a value. Everything that today "releases the soft-hold" (decline, expire, withdraw, remodel decline)
stops calling `AvailabilityClaim.release`, because `set_availability` cannot tell whose row it deletes.
Decision record: ADR-0025.

**Source of intent:** GitHub issue #1264 (epic #1096; split from #1203 at its intake gate).

**Branch:** `claude/tailwind-angular-frontend-5xjk4b` (the designated remote branch stands in for
`feature/request-no-hold`).

## Acceptance criteria

- [ ] **AC-1:** Given a Request-to-Book set free on D, when a guest requests it, then the booking is
  `PENDING_REQUEST` and `AvailabilityClaim.claim(set, D)` still answers `CLAIMED` for another party (no
  row was written). *Seam:* `CreateBooking` + `AvailabilityClaim` · *Pinned by:*
  `RequestHoldsNothingIT.aPendingRequestLeavesTheDayFree`
- [ ] **AC-2:** Given a set already taken on D (any `set_availability` row), when a guest requests it,
  then the outcome is `Rejected.SET_TAKEN` and no booking row is written. *Seam:* `CreateBooking` ·
  *Pinned by:* `RequestHoldsNothingIT.aTakenDayRefusesTheRequest`
- [ ] **AC-3:** Given two pending requests for the same set and day, when the venue lists its queue,
  then both rows appear and each names one competing request. *Seam:* `PendingRequests.forVenue` ·
  *Pinned by:* `RequestHoldsNothingIT.rivalsAreCountedPerRequest`
- [ ] **AC-4:** Given a pending request whose day is free, when the venue accepts, then the row is
  `AWAITING_PAYMENT` and `claim(set, D)` now answers `ALREADY_TAKEN`; after the transaction the claim
  stands. *Seam:* `RespondToRequest.accept` + `AvailabilityClaim` · *Pinned by:*
  `RequestAcceptClaimsIT.acceptClaimsEveryDay`
- [ ] **AC-5:** Given a pending request whose day was taken meanwhile (staff mark or an accepted
  rival), when the venue accepts, then the outcome is `Rejected.SET_UNAVAILABLE`, the row is
  `DECLINED` with `decline_reason = SET_UNAVAILABLE`, `BookingRequestDeclined` carries that reason, and
  no day was claimed. *Seam:* `RespondToRequest.accept` · *Pinned by:*
  `RequestAcceptClaimsIT.acceptOnATakenDayDeclinesWithSetUnavailable`
- [ ] **AC-6:** Given two pending requests A and B overlapping on set S, when the venue accepts A, then
  B is `DECLINED` with `decline_reason = ANOTHER_GUEST` in the same transaction and one
  `BookingRequestDeclined(B, ANOTHER_GUEST)` is published. *Seam:* `RespondToRequest.accept` + the
  event registry · *Pinned by:* `RequestAcceptClaimsIT.acceptDeclinesOverlappingRivals`,
  `RequestTerminationEventPublicationIT.rivalDeclineNamesItsReason`
- [ ] **AC-7:** Given two overlapping pending requests accepted concurrently by two operators, when both
  commit, then exactly one is `AWAITING_PAYMENT`, the other is `DECLINED` (`ANOTHER_GUEST` or
  `SET_UNAVAILABLE`), and `set_availability` holds exactly one row per day of S. *Seam:*
  `RespondToRequest.accept` under contention · *Pinned by:*
  `ConcurrentOverlappingAcceptIT.exactlyOneAcceptWins`
- [ ] **AC-8:** Given a pending request on set S for D while another booking holds `(S, D)`, when the
  request is declined, expires, is withdrawn, or is declined by a remodel, then the other booking's row
  survives (`claim(S, D)` still `ALREADY_TAKEN`). *Seam:* `RespondToRequest.decline`,
  `ExpireRequests`, `WithdrawRequest`, `RemodelClaims.commit` · *Pinned by:*
  `RequestHoldsNothingIT.{decline,expiry,withdraw,remodelDecline}ReleasesNothing`
- [ ] **AC-9:** Given an accepted request whose payment set-up fails, when the accept reverts, then the
  row is `PENDING_REQUEST` again and every day it claimed is free. *Seam:* `RespondToRequest.accept`
  with a failing `CheckoutPort` · *Pinned by:* `RespondToRequestServiceTest.failedPaymentRevertsAndReleases`
  (unit) and `RequestAcceptClaimsIT.aFailedPaymentSetUpReleasesTheClaim`
- [ ] **AC-10:** Given a pending request on a disturbed set, when a remodel commits, then the request is
  `DECLINED (SET_UNAVAILABLE)`, never moved, and nothing is released. *Seam:* `RemodelClaims.commit`
  · *Pinned by:* `RequestHoldsNothingIT.remodelDeclineReleasesNothing`, `RemodelClaimsServiceTest`
- [ ] **AC-11:** Given pending requests holding rows at deploy time, when V67 runs, then their
  `BOOKED_ONLINE` rows are gone and other bookings' rows stay. *Seam:* Flyway · *Pinned by:*
  `BookingMigrationIT.v67ReleasesPendingRequestRows`
- [ ] **AC-12:** Given a declined request, when the guest views it, then `declineReason` names one of
  `VENUE`, `SET_UNAVAILABLE`, `ANOTHER_GUEST`, and the decline mail's copy names the reason. *Seam:*
  `GET /api/bookings/{code}`, `RequestDeclinedMailListener` · *Pinned by:* `ViewBookingServiceTest`,
  `RequestDeclinedMailIT.namesTheReason`
- [ ] **AC-13 (FE):** The queue card shows the competing-request hint; an accept answered
  `SET_UNAVAILABLE` flips the card to its copy; the declined view picks copy by reason; the request
  dialog and the pending banner say the set is not held. *Seam:* the components' inputs and the
  mocked API · *Pinned by:* `requests-tab.spec.ts`, `booking-view.spec.ts`, `booking-dialog.spec.ts`,
  `e2e/operator-requests.e2e.ts`, `e2e/request-to-book.e2e.ts`

## Non-goals

- Ranges or stitched stays at a Request-to-Book venue (#1203).
- A per-length expiry curve (retired with the hold: story 29).
- Changing the layout-editor lock semantics: `JdbcBookingPresence.LIVE_STATUSES` keeps
  `PENDING_REQUEST`, so a pending request still locks its set in the editor exactly as today, and the
  remodel gate still finds it to decline it. Loosening that lock is a follow-up if venues ask.
- Showing pending-request counts to tourists on the map.
- `held_by_booking_id` on `set_availability`. The no-hold model removes the one writer that could not
  identify its row; adding the column stays deferred.

## Risks

- **R-1 (invariant #2, the release that isn't ours):** once a pending request holds nothing, any leg
  that still calls `release(set, date)` deletes a row another booking holds. → Every request leg stops
  releasing (phase 2) **before** the reserve stops claiming (phase 1 is red-green in the same PR, and
  the tests of AC-8 seed a foreign row on the same day). Grep gate before merge:
  `grep -rn "availability.release" booking/application/request booking/application/remodel` names only
  the remodel refund/release/move legs and the accept revert.
- **R-2 (stranded rows at deploy):** pending requests created before V67 hold rows the new legs will
  never free. → V67 deletes exactly those rows (join on `booking.status = 'PENDING_REQUEST'`, span
  overlap, `state = 'BOOKED_ONLINE'`). Sole-writer rule is Java-level (`ResponsibilitiesArchitectureTests`
  scans classes, not SQL) — confirmed at intake.
- **R-3 (accept race):** two accepts on overlapping requests, or an accept racing a withdraw/expire on
  the same row. → The accept takes the pending row's lock first (`SELECT … FOR UPDATE` guarded by
  status and deadline), then claims per day with `ON CONFLICT DO NOTHING`; the loser's claim answers
  `ALREADY_TAKEN` and it declines itself `SET_UNAVAILABLE`. The winner's rival-decline is a guarded
  `UPDATE … WHERE status = 'PENDING_REQUEST'`, so a row that already declined itself moves zero rows.
  Withdraw/expire on the locked row wait, then move zero rows. Pinned by AC-7 and the existing
  `RequestExpiryVsAcceptRaceIT`.
- **R-4 (transaction boundary vs the gateway):** the accept's claim must commit before
  `CheckoutPort.pay`, as the reserve does today. → `RespondToRequestService.accept` stays
  non-transactional; the claim-and-decide step is a new `@Transactional` bean method
  (`RequestClaimService.accept`) returning a value; `collect` runs after it commits. Payment failure →
  `revertAcceptToPending` **plus** span release (the claim is the accept's now). The auto-declined
  rivals stay declined: their mails are already sent, and the set is again free for a new request.
- **R-5 (event payload growth):** `BookingRequestDeclined` gains `reason`. → Null-tolerant accessor
  (`reasonOrVenue()`), the shape `BookingConfirmed.lastDay()` already uses for registry-persisted
  payloads; `notification` branches on it.
- **R-6 (#13 BOLA):** accept and decline stay behind `VenueOwnership.assertOwns` in the service;
  the rival decline is scoped to the accepted request's `set_id`, which is the venue's.
- **R-7 (parity):** four existing ITs assert the hold (`RequestToBookFlowIT.pendingHold*`,
  `SpanReleaseIT` request legs, `ConcurrentRequestTerminationIT.withdrawnSetIsImmediatelyRebookable`,
  `RespondToRequestServiceTest.…KeepsTheHold`). → Rewritten to the new behaviour, listed in the
  parity ledger; none deleted silently.

## Open questions

### Resolved

- Hold or no hold? — **No hold; accept claims** (owner, 2026-09-27). Booking.com's shape; Airbnb holds
  because the guest pre-pays.
- Losing overlapping requests? — **Auto-declined with reason `ANOTHER_GUEST`** inside the accept.
- Accept whose claim fails? — **Auto-declined `SET_UNAVAILABLE`**, operator told, guest told.
- Conflict hint on the operator card? — **Yes.** Tourist told the set is not held? — **Yes.**
- Remodel and a pending request — decline (`SET_UNAVAILABLE`), never move, release nothing (author's
  call; a request is not a claim to re-seat; the guest re-requests on the new layout).
- Layout lock semantics — unchanged (non-goal).

## Availability & concurrency

- **Write paths to `set_availability(set_id, booking_date)`:** the Instant reserve (unchanged), the
  stay reserve (unchanged), **the request accept (new)**, the remodel move (unchanged), staff mark
  (unchanged). Releases: guest cancel, weather refund, abandoned sweep, remodel refund/release/move,
  **accept revert (new)**. Removed: decline, expire, withdraw, remodel decline.
- **Concurrency strategy:** the accept locks the pending booking row (`SELECT … FOR UPDATE WHERE
  status = 'PENDING_REQUEST' AND request_expires_at > :now`), then `INSERT … ON CONFLICT DO NOTHING`
  per day; a lost day gives back the days won and the row declines itself. Rival decline is a guarded
  `UPDATE … RETURNING` on `status = 'PENDING_REQUEST'` and span overlap.
- **Pool (#3) and cutoff (#4):** the reserve fences are unchanged and still run before the pending
  insert; the accept's claim re-checks the pool through `ClaimOutcome.NOT_ONLINE_POOL` (declines
  `SET_UNAVAILABLE`); the accept guard `request_expires_at > now` is unchanged.
- **Pinning tests:** `ConcurrentOverlappingAcceptIT.exactlyOneAcceptWins`, `RequestAcceptClaimsIT`,
  `RequestHoldsNothingIT`, `RequestExpiryVsAcceptRaceIT` (kept).

## Modulith

- No new port or module. `booking` already lists `availability::api`. `booking/vocabulary` gains
  `DeclineReason` (published: `notification` reads it off the event). `booking/events`'
  `BookingRequestDeclined` gains the reason.
- `RequestReleaseService` → renamed `RequestTerminationService` (it releases nothing); a new
  package-private `RequestClaimService` in `application/request` holds the transactional accept step.
  Owner check: `booking` decides the request lifecycle and claims through `availability`'s port
  (`RESPONSIBILITIES.md` § `booking` Job); `availability` stays sole writer of `set_availability`.
- Structural net due after the rename and the new class.

## FE↔BE contract

- `GET /api/venues/{v}/booking-requests` rows gain `competingRequests: number`.
- `POST …/booking-requests/{id}/accept` gains `409 SET_UNAVAILABLE`.
- `GET /api/bookings/{code}` gains `declineReason: 'VENUE' | 'SET_UNAVAILABLE' | 'ANOTHER_GUEST' | null`.
- `POST /api/bookings` at a Request venue: `422 SET_TAKEN` now possible (was only via the claim).

## Behaviour-parity ledger

| Old-surface behaviour | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A pending request claims its `(set, date)` row at request time | changed | Nothing is claimed; the accept claims (ADR-0025) |
| `pendingHoldBlocksOnlineChannel`, `pendingHoldBlocksStaffMarkOnTheSameRow` | changed | `RequestHoldsNothingIT`: the day stays free for both channels |
| Decline / expire / withdraw release the span (`SpanReleaseIT`) | changed | They release nothing; `RequestHoldsNothingIT` proves a foreign row survives |
| Remodel moves a pending request to a candidate set when one exists | changed | Declined `SET_UNAVAILABLE`; a request is not a claim to re-seat |
| Payment set-up failure reverts to pending "so the hold survives" | changed | Reverts and releases the accept's claim |
| A request for an already-taken day loses the claim → `SET_TAKEN` | preserved | A read check before the insert answers `SET_TAKEN` |
| Response deadline `min(created + 24h, sales close)` | preserved | Unchanged |
| Pay window after accept, abandoned sweep on `accepted_at` | preserved | Unchanged; the sweep's cancel releases the accept's claim |
| Decline mail (plain record) | preserved + | Copy names the reason |
| Layout lock counts a pending request as live | preserved | Non-goal |

## Phases

- **Phase 0 — Vocabulary and schema:** `DeclineReason`, `booking.decline_reason` (V67, CHECK in lockstep,
  backfill `VENUE`), V67 releases pending requests' rows · red tests
  `BookingMigrationIT.v67ReleasesPendingRequestRows`, `BookingMigrationIT.everyDeclineReasonAccepted`
- **Phase 1 — Termination releases nothing:** decline, expire, withdraw, remodel decline stop releasing;
  `RequestReleaseService` → `RequestTerminationService`; `BookingRequestDeclined` carries the reason ·
  red tests `RequestHoldsNothingIT.*ReleasesNothing`, `RequestTerminationEventPublicationIT`
- **Phase 2 — The reserve claims nothing:** a Request-venue reserve checks taken days and inserts
  pending without a claim · red tests `RequestHoldsNothingIT.aPendingRequestLeavesTheDayFree`,
  `aTakenDayRefusesTheRequest`; `RequestToBookFlowIT` rewritten
- **Phase 3 — Accept claims, declines itself on a lost day, releases on revert:** `RequestClaimService`
  · red tests `RequestAcceptClaimsIT.acceptClaimsEveryDay`, `acceptOnATakenDayDeclinesWithSetUnavailable`,
  `aFailedPaymentSetUpReleasesTheClaim`; `RespondToRequestServiceTest` updated
- **Phase 4 — Rivals:** the winner declines overlapping pending requests; queue counts rivals; the
  concurrency proof · red tests `RequestAcceptClaimsIT.acceptDeclinesOverlappingRivals`,
  `ConcurrentOverlappingAcceptIT.exactlyOneAcceptWins`, `RequestHoldsNothingIT.rivalsAreCountedPerRequest`
- **Phase 5 — Reads and mails:** `declineReason` on the view, `competingRequests` on the queue row,
  `SET_UNAVAILABLE` on the accept endpoint, decline mail per reason · red tests
  `ViewBookingServiceTest`, `BookingRequestControllerTest`, `RequestDeclinedMailIT.namesTheReason`
- **Phase 6 — Frontend:** models, queue hint + `SET_UNAVAILABLE` copy, declined-by-reason copy,
  not-held copy in the dialog and pending banner, Vitest + mocked e2e
- **Phase 7 — Docs:** ADR-0025, `CONTEXT.md`, `RESPONSIBILITIES.md` § `booking`, design doc D5 / story 29 /
  D10 amendments; plan removed in the last commit

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** the reserve at a Request venue claims nothing; `RequestToBookFlowIT` and `ConcurrentRequestClaimIT` rewritten

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Vocabulary and schema | ✅ | phase 0–1 commit |
| 1 — Termination releases nothing | ✅ | phase 0–1 commit |
| 2 — The reserve claims nothing | | |
| 3 — Accept claims | | |
| 4 — Rivals | | |
| 5 — Reads and mails | | |
| 6 — Frontend | | |
| 7 — Docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
