# Stitched stays at a Request-to-Book venue — Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** a guest at a Request-to-Book venue can request a stitched plan (several same-set stretches
on different sets) as one request, which the venue accepts or declines whole, and which the guest
pays once.

**Architecture:** A stitched request is a `stay` row with one `PENDING_REQUEST` booking per stretch
(ADR-0024 + ADR-0025). Every request leg (accept, decline, expiry, withdraw, remodel-decline, the
rival decline) acts on the **whole stay**: all its stretches move together or none do. A stretch's
own id is never accepted or declined alone. The accept claims every day of every stretch all or
nothing and collects under one PaymentIntent. Stay-level events (`StayRequestDeclined`,
`StayRequestExpired`, `StayPaymentDue`) each drive one mail, following the `StayConfirmed` /
`StayCancelled` pattern.

**Source of intent:** issue #1267 (epic #1096, stories 17–19, 25–27); intake grill 2026-09-28
(decisions below); `docs/architecture/multi-day-stays.md` § D6, D8, D13; ADR-0024; ADR-0025.

**Branch:** `claude/tailwind-angular-consult-04bzf9` (cloud session; stands in for `feature/stitched-stay-requests`)

### Intake decisions (owner, 2026-09-28)

- **Q1:** every Request-to-Book venue takes a stitched request, with no per-venue opt-in.
- **Q2:** the move budget is the same `riviera.itinerary.max-switches` as for Instant venues.
- **Q3:** the accept claims every stop's every day, all or nothing. A lost day makes the whole stay
  self-decline with `SET_UNAVAILABLE`. There is no re-plan at accept.
- **Q4:** a rival that is itself a stay declines **whole** with `ANOTHER_GUEST`.
- **Q5:** stay-level events are published, each driving one mail per stay. Per-booking request events
  stay for lone bookings only.
- **Q6:** accept and decline get stay-keyed endpoints, and the queue returns a `kind`-tagged item.
- **Q7:** one PR. The fence, the zero budget and the two frontend gates are lifted in the last
  phases.
- **My own calls:**
  - The accept collects once for the whole stay (`CheckoutPort.pay(List<CollectionShare>)`). A
    failed set-up reverts every stretch and releases every claim.
  - All stretches share one response deadline: `min(now + expiry-window, sales close of the first
    day)`.
  - The request mails keep the existing no-spot rule (`RESPONSIBILITIES.md` § notification): they
    name the stay's span, and the confirmation mail (#1255) names every stop.

## Acceptance criteria

- [ ] **AC-1 (a stretch is never answered alone):** Given a pending stay with stretches S1 and S2,
  when the operator accepts or declines S1 through the lone-request endpoint
  (`…/booking-requests/{bookingId}/…`), then the answer is `NO_SUCH_REQUEST` and no row changes.
  *Seam:* `RespondToRequest.accept/decline` · *Pinned by:* `StayRequestAcceptIT.aStretchIsNeverAnsweredAlone`
- [ ] **AC-2 (the queue shows one card per stay):** Given a pending stay of three stretches and one
  lone pending request at the venue, when the operator lists the queue, then it holds exactly two
  items:
  - a `STAY` item with the guest, span, total, one deadline and each stop (set, days, amount,
    rival count);
  - a `BOOKING` item.

  A foreign operator is refused with 403 (#13). No code appears anywhere (#7).
  *Seam:* `PendingRequests.forVenue` + `GET /api/venues/{id}/booking-requests` · *Pinned by:*
  `StayRequestQueueIT.oneItemPerStayWithEveryStop`, `BookingRequestControllerTest` (shape)
- [ ] **AC-3 (accept claims the whole stay and collects once):** Given a pending stay whose days
  are all free, when the owner accepts it, then:
  - every `(set, date)` of every stretch is claimed (#2);
  - every stretch is `AWAITING_PAYMENT` with the same `accepted_at`;
  - one PaymentIntent carries one share per stretch;
  - one `StayPaymentDue(stayId, payBy, …)` is published, with no per-booking `BookingPaymentDue`.

  *Seam:* `RespondToRequest.acceptStay` · *Pinned by:* `StayRequestAcceptPayIT.acceptCollectsOnceAndAnnouncesThePaymentDue` (stripe profile), `StayRequestAcceptIT.acceptClaimsEveryStretchAndCollectsOnce` (stub)
- [ ] **AC-4 (all or nothing):** Given a pending stay whose second stretch has a day taken since the
  request, when the owner accepts, then no day stays claimed, every stretch is `DECLINED` with
  `SET_UNAVAILABLE`, one `StayRequestDeclined` is published, and the answer is `SET_UNAVAILABLE`.
  *Seam:* `RespondToRequest.acceptStay` · *Pinned by:* `StayRequestAcceptIT.aLostDayDeclinesTheWholeStay`
- [ ] **AC-5 (rivals decline whole):**
  - Given an accepted stay or lone request overlapping one stretch of a rival pending stay, the
    rival stay's every stretch becomes `DECLINED` with `ANOTHER_GUEST`, including stretches on
    unrelated sets.
  - One `StayRequestDeclined` is published per rival stay, and a lone rival keeps its
    `BookingRequestDeclined`.
  - The accepted stay's own stretches are never its own rivals.

  *Seam:* `RespondToRequest.accept` / `acceptStay` · *Pinned by:* `StayRequestAcceptIT.rivalStaysDeclineWhole`, `StayRequestAcceptIT.aLoneAcceptDeclinesARivalStayWhole`
- [ ] **AC-6 (concurrent accepts never double-sell):** Given two pending stays sharing one
  `(set, date)`, when both are accepted concurrently, then exactly one is `AWAITING_PAYMENT`, the
  other is wholly `DECLINED`, and every contested row is claimed once (#2).
  *Seam:* `RespondToRequest.acceptStay` · *Pinned by:* `ConcurrentStayAcceptIT`
- [ ] **AC-7 (a failed collection reverts the stay):** Given the gateway fails the payment set-up,
  when the owner accepts, then every stretch is `PENDING_REQUEST` again with its deadline intact and
  no day stays claimed. The answer is `PAYMENT_INIT_FAILED`.
  *Seam:* `RespondToRequest.acceptStay` · *Pinned by:* `StayRequestAcceptPayIT.aFailedCollectionRevertsEveryStretch`
- [ ] **AC-8 (the venue declines whole):** Given a pending stay, when the owner declines it, then
  every stretch is `DECLINED` with `VENUE` and one `StayRequestDeclined(stayId, VENUE)` is
  published. A second decline answers `REQUEST_NOT_PENDING`, and another venue's operator gets 403.
  *Seam:* `RespondToRequest.declineStay` · *Pinned by:* `StayRequestDeclineIT.theVenueDeclinesAStayWhole`, `CrossVenueDenialIT`
- [ ] **AC-9 (expiry is whole):** Given a pending stay past its deadline, when the sweep runs, then
  every stretch is `EXPIRED` and exactly one `StayRequestExpired` is published, whichever stretch
  the sweep meets first. *Seam:* `ExpireRequests.sweep` · *Pinned by:* `StayRequestDeclineIT.theSweepExpiresAStayWholeAndSaysSoOnce`
- [ ] **AC-10 (withdraw by the stay's code):** Given a pending stay, when the guest withdraws with
  the stay's code, then every stretch is `WITHDRAWN` and nothing is published. The same code again
  answers `REQUEST_NOT_PENDING`, and a stretch's row code answers 404.
  *Seam:* `WithdrawRequest.withdraw` · *Pinned by:* `WithdrawRequestIT.aStayWithdrawsWholeByItsCodeAndNeverByARowCode`
- [ ] **AC-11 (a remodel declines the whole stay):** Given a pending stay with one stretch on a set
  the remodel disturbs, when the remodel commits, then every stretch is `DECLINED` with
  `SET_UNAVAILABLE`. The receipt records the disturbed stretch's `DECLINE`, and one
  `StayRequestDeclined` is published. *Seam:* the remodel commit port · *Pinned by:*
  `RemodelStayRequestIT`
- [ ] **AC-12 (the guest sees the request):** Given a stay in `PENDING_REQUEST` / `DECLINED` /
  `EXPIRED` / `WITHDRAWN`, when the guest opens it by code, then it reads that status. A pending
  stay also shows `withdrawable` and its deadline, and a declined one shows its reason. An accepted
  stay reads `AWAITING_PAYMENT` with the shared intent's credentials.
  *Seam:* `ViewBooking.byCode` / `StayStatus.of` · *Pinned by:* `ViewStayIT.aStayRequestReadsItsStatus`, `StayStatusTest`
- [ ] **AC-13 (one mail per stay):**
  - `StayRequestDeclined`, `StayRequestExpired` and `StayPaymentDue` each send exactly one mail
    under the stay's code and whole span.
  - The payment-due mail carries the total and the deadline, with no spot.
  - A missing fact is abandoned under the flow's existing counter.

  *Seam:* the listeners over `BookingNotificationFacts` · *Pinned by:* `StayRequestMailIT`
- [ ] **AC-14 (the reserve takes a plan):** Given a Request-to-Book venue and a stitched plan whose
  days are free, when the guest posts it to `/api/stays`, then:
  - a `stay` with one `PENDING_REQUEST` booking per stretch is created, claiming nothing
    (ADR-0025);
  - every stretch shares one deadline;
  - the response is `202` with the stay's code, status `PENDING_REQUEST`, its stops and
    `requestExpiresAt`.

  A taken day answers `SET_TAKEN`. A plan longer than the venue's maximum stay answers
  `STAY_TOO_LONG` (the fence that `RANGE_NOT_OFFERED` pre-empted).
  *Seam:* `CreateStay.create` · *Pinned by:* `CreateStayIT.aRequestVenueTakesAPlanAsOneRequest` (replaces
  `refusesAFencedPlanBeforeAnyClaim`'s request arm)
- [ ] **AC-15 (discovery offers plans):** Given a Request-to-Book venue, discovery reads it
  `FITS_WITH_MOVES` where a plan exists, and `/itinerary` answers the plan.
  *Seam:* `MoveBudget` / `PlanItinerary` / `StayVerdicts` · *Pinned by:* `MoveBudgetTest`,
  `PlanItineraryIT.aRequestToBookVenueGetsAPlan`, `StayVerdictsIT.aRequestToBookVenueFitsWithMoves`
- [ ] **AC-16 (frontend):**
  - The venue page offers the plan and "Plan my stay around" at a Request-to-Book venue.
  - Submitting a plan there shows "request sent" with every stop.
  - The operator's Requests tab shows one stay card with its stops and answers it through the stay
    endpoints.
  - The guest's booking page shows a pending stay with its deadline and a Withdraw button.

  *Seam:* components + `BookingService`/`OperatorConsoleService` · *Pinned by:* Vitest specs
  (`venue-map`, `booking-dialog`, `request-confirmation`, `requests-tab`, `booking-view`) + mocked
  e2e `e2e/stay-request.spec.ts`

## Non-goals

- A per-venue opt-in (Q1). A separate request-mode move budget (Q2). Re-planning at accept (Q3).
- Partial accept, or declining one stop.
- Listing a stay's stretches in the signed-in booking list (ADR-0024's later refinement).
- Any change to the `payment` module. The multi-share collection shipped in #1207/#1208.

## Risks

- **R-1: double-sell under concurrent accepts (#2).**
  - Mitigation: the accept claims with the existing `INSERT … ON CONFLICT DO NOTHING`, one row per
    `(set, date)`, in ascending day order (a stay has one set per day). Every claimer then acquires
    in one global order, so two overlapping accepts cannot deadlock. The loser self-declines whole.
  - Pinned by `ConcurrentStayAcceptIT`.
- **R-2: a half-answered stay.**
  - Every leg's guarded `UPDATE` is keyed by `stay_id` and moves every stretch or none.
  - The accept requires the transition to move exactly the stay's stretch count: zero means a lost
    race (release and `Missed`), and any other count throws and rolls back.
  - The lone-request SQL gains `stay_id IS NULL`, so a stretch can't be answered through it (AC-1).
- **R-3: a stretch's row code as a credential (#7).** Withdraw resolves the stay's code through
  `CODE_MATCH` and never honours `<code>-n`. Logs carry ids only.
- **R-4: accept past the first day's sales close (#4).** The shared deadline is capped at the first
  day's sales close, and the guarded accept checks `request_expires_at > now`, as for a lone
  request.
- **R-5: mails multiplied.** Stay stretches publish no per-booking request event. The stay event is
  published once, by the leg that moved the rows (a 0-row loser publishes nothing).
- **R-6: an unhandled `StayStatus` arm.** A pending stay would read `NO_SHOW` today. The new arms
  are pinned by `StayStatusTest`.
- **Flyway:** none expected. The latest is V67. If one appears, it claims the next free `V<n>`, and
  no open PR claims one today (the open PRs are dependabot bumps).

## Open questions

### Resolved

- May a Request-to-Book venue take a stitched stay at all? Yes, every such venue (Q1, owner).

## Availability & concurrency

- **Write paths to `set_availability`:**
  - The stay accept claims (new).
  - The failed-collection revert releases (new).
  - The lost-day self-decline releases what it had won (new, and it commits nothing else).
  - The request reserve and the termination legs still write nothing (ADR-0025).
  - Post-accept, the abandoned-payment sweep releases per stretch, as for an Instant stay.
- **Concurrency strategy:** `ON CONFLICT DO NOTHING` on the claim, in ascending day order. After it,
  a guarded `UPDATE … WHERE stay_id = :stay AND status = 'PENDING_REQUEST' AND request_expires_at >
  :now`, so the claim happens before the row lock, matching the lone accept and the remodel lock
  order.
- **Pool (#3) and cutoff (#4):** the reserve runs `ReserveFences.refuse` per stretch over the whole
  stay (online pool, season closure, first day's sales close, maximum stay). The deadline cap covers
  the accept.
- **Pinning test:** `ConcurrentStayAcceptIT`, plus `StayRequestAcceptIT.aLostDayDeclinesTheWholeStay`.

## Modulith

All inside `booking` except the three `notification` listeners. No new module dependency:
`notification` already reads `booking::events` + `booking::api`.

- **Events (`booking.events`, ids only, #7/#11), all consumed by `notification`:**
  - `StayRequestDeclined(StayId, DeclineReason)`
  - `StayRequestExpired(StayId)`
  - `StayPaymentDue(StayId, Instant payBy, long amountMinor, String currency, CancellationWindow windowAtBirth, int lateCancelRefundBps)`
- **`RespondToRequest`** gains `acceptStay(OperatorId, VenueId, StayId)` and
  `declineStay(OperatorId, VenueId, StayId)`: the same conversation joins the same port. Ownership
  is asserted first (#13).
- **`PendingRequest`** becomes a sealed interface with `Lone` and `Stay` variants.
  `PendingRequests.forVenue` keeps its signature.
- **Notification** reads `BookingNotificationFacts.stayConfirmationFacts(stayId)`, which is
  unfiltered by status, so no new port is needed. It re-uses `RequestDeclinedMail`,
  `RequestExpiredMail` and `PaymentDueMail` under the stay's code and span.
- **Owner check (`RESPONSIBILITIES.md`):**
  - request lifecycle → `booking`;
  - collection → `payment` via `CheckoutPort` (executes, decides nothing);
  - mails → `notification` (decides nothing).

## Payment & payout

- One PaymentIntent per accepted stay: `CheckoutPort.pay(List<CollectionShare>)`, one share per
  stretch. The idempotency key is the gateway's `booking-<firstBookingId>-pi`, so a retried accept
  after `PAYMENT_INIT_FAILED` replays it.
- Confirmation stays webhook-only (#8). The existing path confirms per stretch and publishes
  `StayConfirmed` when the last one confirms.
- Payout accrues per stretch on `BookingConfirmed`, as for an Instant stay (#9). There is no ledger
  change.
- The pay window runs from the shared `accepted_at`. The abandoned-payment sweep voids the shared
  intent on the first stretch and releases each one, as for an Instant stay.

## FE↔BE contract

- **`POST /api/stays`** at a Request-to-Book venue returns `202` with the `StayView` fields
  (`status: "PENDING_REQUEST"`) plus `requestExpiresAt` (ISO UTC), and no `clientSecret`.
- **`GET /api/venues/{venueId}/booking-requests`** returns items tagged by `kind`:
  - `{ kind: "BOOKING", bookingId, … }`, which is today's shape plus `kind`;
  - `{ kind: "STAY", stayId, guestName, firstDate, lastDate, total: MoneyView, requestedAt,
    requestExpiresAt, competingRequests, stops: [{ setId, firstDate, lastDate, amount: MoneyView,
    competingRequests }] }`.
- **`POST /api/venues/{venueId}/booking-requests/stays/{stayId}/accept|decline`** answers
  `{ stayId, status }`, with the same problem codes as the lone endpoints.
- **`GET /api/bookings/{code}`** for a stay adds the pending-request fields
  (`withdrawable`, `requestExpiresAt`, `declineReason`) that a lone booking already carries.

## Phases

- **Phase 0 — plan:** this document, the issue updated, a draft PR.
- **Phase 1 — the stay-request read side:**
  - `StayStatus` gains the request arms · red `StayStatusTest`.
  - Lone accept/decline ignore stretches · red `StayRequestAcceptIT.aStretchIsNeverAnsweredAlone`.
  - The queue groups by stay · red `StayRequestQueueIT`.
  - The guest view shows a pending stay · red `ViewStayIT.aStayRequestReadsItsStatus`.
- **Phase 2 — the stay accept:**
  - claim, transition, collect, `StayPaymentDue`;
  - self-decline on a lost day;
  - revert on a failed collection;
  - rivals decline whole;
  - the stay endpoints.

  Red `StayRequestAcceptIT`, `ConcurrentStayAcceptIT`.
- **Phase 3 — the other legs, whole:** the venue decline, the expiry sweep, withdraw by stay code
  and the remodel decline · red `StayRequestDeclineIT`, `StayRequestExpiryIT`,
  `WithdrawRequestIT.aStayWithdrawsWhole`, `RemodelStayRequestIT`.
- **Phase 4 — the mails:** three listeners · red `StayRequestMailIT`.
- **Phase 5 — lift the backend gate:**
  - the reserve creates a pending stay (drop `refuseStretch`'s request arm);
  - `MoveBudget` has no request branch;
  - the `202` view.

  Red `CreateStayIT.aRequestVenueTakesAPlanAsOneRequest`, `StayControllerIT`, `MoveBudgetTest`,
  `PlanItineraryIT`, `StayVerdictsIT`.
- **Phase 6 — the frontend:** the booking service and dialog "requested" branch, the confirmation's
  stops, the venue-map gates and copy, the requests-tab stay card, the booking-view pending stay,
  and the mocked e2e · red specs first per component.
- **Phase 7 — docs + close-out:**
  - `RESPONSIBILITIES.md` (§ booking, § notification);
  - the `CLAUDE.md` event list;
  - `CONTEXT.md`;
  - an ADR-0025 consequence line;
  - the design doc's status line;
  - the epic checklist.

## Execution status

**Stage pointer:** `implement (phase 4)`

**Next action:** phase 4 — red `StayRequestMailIT` (three stay-request listeners).

**Notes:**
- Local ITs need `postgres:17`. Docker Hub rate-limited the pull, so it was pulled from
  `mirror.gcr.io/library/postgres:17` and re-tagged.
- Phase 1 guards the lone-request SQL with `stay_id IS NULL`. Phase 3 routed the remodel,
  expiry and withdraw legs to the whole stay.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan | ✅ | (this commit) |
| 1 — read side | ✅ | (phase-1 commit) |
| 2 — stay accept | ✅ | (phase-2 commit) |
| 3 — other legs | ✅ | (phase-3 commit) |
| 4 — mails | | |
| 5 — backend gate | | |
| 6 — frontend | | |
| 7 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
