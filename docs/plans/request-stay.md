# Request-to-Book stays: one request, answered whole — Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** At a Request-to-Book venue a same-set range is one pending request, shown as one card,
accepted or declined whole, and discovery never offers such a venue a stitched plan.

**Architecture:** After ADR-0025 the request path is already span-aware (the accept claims
`booking_date..last_date` all or nothing, termination releases nothing), so this slice lifts the
one-day fence for a single set, carries `last_date` through the queue, the three request events
and their mails, and clamps the stay verdict by giving a Request-to-Book venue a **move budget of
zero** — one rule in `itinerary`'s `MoveBudget`, read by both the coast verdict and the per-venue
plan — instead of a special case in the fit rule. A stitched stay at such a venue stays refused by
the reserve (`RANGE_NOT_OFFERED`, now meaning "several spots are not offered here").

**Source of intent:** `docs/architecture/multi-day-stays.md` stories 17–19, 25–27 (29 retired);
GitHub issue #1203; ADR-0025.

**Branch:** `claude/tailwind-angular-frontend-2r9m7m` (the cloud session's designated branch,
standing in for `feature/request-stay`)

## Acceptance criteria

- [ ] **AC-1:** Given a Request-to-Book venue and one online set free on every day of a 3-day span,
  when a guest reserves that set for the span, then one `PENDING_REQUEST` row with that
  `booking_date..last_date` and `amount = price × 3` exists, no `set_availability` row is written,
  and the outcome is `Requested` naming both days. *Seam:* `CreateBooking` / `POST /api/bookings`
  · *Pinned by:* `RangeBookingIT.aRequestVenueTakesOneSetForARange`,
  `CreateBookingServiceTest.aRequestVenueTakesOneSetForARange`,
  `BookingControllerIT.rangeAtRequestVenueIsOnePendingRequest`
- [ ] **AC-2:** Given a Request-to-Book venue, when a stitched plan is posted, then it is refused
  `RANGE_NOT_OFFERED` before any claim. *Seam:* `CreateStay` / `POST /api/stays` · *Pinned by:*
  `CreateStayIT.refusesAFencedPlanBeforeAnyClaim` (unchanged)
- [ ] **AC-3:** Given a pending 3-day request, when the operator lists the queue, then one row names
  the set, first day, last day, the whole amount and the competing count over the span. *Seam:*
  `PendingRequests.forVenue` / `GET /api/venues/{id}/booking-requests` · *Pinned by:*
  `RequestAcceptClaimsIT.theQueueShowsARangeAsOneRow`
- [ ] **AC-4:** Given a pending 3-day request, when the operator accepts, then every day is claimed
  and the row is `AWAITING_PAYMENT`; given one middle day taken meanwhile, the accept declines the
  request `SET_UNAVAILABLE` and claims nothing (no partial claim survives). *Seam:*
  `RespondToRequest.accept` · *Pinned by:* `RequestAcceptClaimsIT.acceptClaimsEveryDayOfARange`,
  `RequestAcceptClaimsIT.aTakenMiddleDayDeclinesTheWholeRangeAndClaimsNothing`
- [ ] **AC-5:** Given a pending 3-day request, when accept races expiry (and withdraw), then exactly
  one outcome stands and, if the accept lost, no day is claimed. *Seam:* `RespondToRequest.accept`
  vs `ExpireRequests` / `WithdrawRequest` · *Pinned by:*
  `RequestExpiryVsAcceptRaceIT.aRangeLeavesOneOutcomeAndNoPartialClaim`
- [ ] **AC-6:** Given an accepted 3-day request unpaid past its deadline (keyed to the first day's
  service-day end), when the abandoned sweep runs, then the booking is cancelled and every day of the
  span is free again. *Seam:* `ExpireAbandonedBookings` · *Pinned by:*
  `AbandonedBookingSweepIT.anUnpaidAcceptedRangeIsReleasedWhole`
- [ ] **AC-7:** Given a 3-day request declined, expired or accepted, when the mail goes out, then the
  decline, expiry and payment-due mails name the first and last day and the day count; a one-day
  request's mails are unchanged. *Seam:* `BookingRequestDeclined` / `BookingRequestExpired` /
  `BookingPaymentDue` → `Mailer` · *Pinned by:* `RequestDeclinedMailIT.namesTheStaysDays`,
  `RequestExpiredMailIT.namesTheStaysDays`, `RequestPaymentDueMailIT.namesTheStaysDays`,
  `SmtpMailerIT` rendering cases; an older payload without `lastDate` reads as one day
  (`RequestEventsLastDayTest`)
- [ ] **AC-8:** Given a Request-to-Book venue where no single set covers the span but a stitched plan
  within three moves exists, when discovery lists the coast, then its verdict is `CANNOT_HOST`
  (longest run reported), never `FITS_WITH_MOVES`; and `GET /api/venues/{id}/itinerary` answers a
  null plan. An Instant venue with the same grid still reports `FITS_WITH_MOVES`. *Seam:*
  `StayVerdicts.forCoast`, `PlanItinerary.plan` · *Pinned by:* `MoveBudgetTest`,
  `StayVerdictsIT.aRequestVenueIsNeverFitsWithMoves`, `PlanItineraryIT.aRequestVenueGetsNoPlan`
- [ ] **AC-9 (FE):** Given a Request-to-Book venue page, when the guest opens the calendar, then
  "Several days" is offered; given no single set covers the range, the page offers new dates or
  other beaches and never a plan (no itinerary read, no "Plan my stay around"); the dialog's request
  note says the venue accepts or declines the whole stay and quotes the stay total. *Pinned by:*
  `venue-map.spec.ts`, `booking-dialog.spec.ts`, `e2e/request-to-book.e2e.ts` (a stay request)
- [ ] **AC-10 (FE):** Given a pending range in the queue, when the operator opens Requests, then the
  card reads first day – last day · N days, the total, the set, and the competing hint, notice and
  accessible names speak of days, not a day. *Pinned by:* `requests-tab.spec.ts`,
  `e2e/operator-requests.e2e.ts`

## Non-goals

- Stitched stays at a Request-to-Book venue (refused; a follow-up per the issue).
- Any expiry curve by length (story 29 retired by ADR-0025); the response window and pay deadline
  stay first-day-keyed.
- The tourist "pending" banner and withdraw already act on the one row (whole by construction).
- A schema change: no Flyway migration (V67 is the latest; none claimed).

## Risks

- **R-1 (#2):** lifting the fence must not create a claim path — the request reserve reads
  `takenDaysBetween` and inserts a pending row only; AC-1 asserts zero availability rows. The accept's
  `SpanClaim` is the one claim primitive; AC-4/AC-5 assert all-or-nothing on a range.
- **R-2 (registry payloads):** the three events are persisted by the Modulith event registry; adding
  `lastDate` must tolerate an older payload — nullable field + `lastDay()` fallback, the
  `BookingConfirmed` precedent.
- **R-3 (#13):** queue, accept, decline stay behind `VenueOwnership.assertOwns`; unchanged.
- **R-4 (verdict drift):** the coast verdict and the per-venue plan must agree on the clamp — both
  read `MoveBudget.forVenue(mode)`; `StayVerdictsIT` and `PlanItineraryIT` pin each side.
- **R-5 (FE guard):** the dialog's amber request note class literal is registered in
  `fixed-fill-token-skins.contrast.spec.ts`; copy changes only, the class string stays.

## Open questions

### Resolved

- Where does the clamp live? — `itinerary` (`MoveBudget.forVenue`): venue booking mode reaches it
  through `venue::vocabulary` (`VenueStayFacts` gains `bookingMode`; `VenueMapView` already carries
  it). `StayFit` stays mode-blind. ← confirm?
- Keep `RANGE_NOT_OFFERED` for the stitched refusal rather than a new code — yes; its meaning narrows
  to "several spots are not offered at a Request-to-Book venue" and the copy follows. ← confirm?
- Day count on the wire? — no; `lastDate` only, the client counts (`daysBetween`), as other views do.

## Availability & concurrency

- **Write paths to `set_availability(set_id, booking_date)`:** unchanged — the accept's
  `SpanClaim.claimEveryDay` (claims), `RequestClaimService.revert` and the abandoned sweep's release
  (releases). The request reserve writes none.
- **Concurrency strategy:** `INSERT … ON CONFLICT DO NOTHING` per day inside the accept transaction,
  giving back the days won when one fails (ADR-0025 §2); the guarded `PENDING_REQUEST →
  AWAITING_PAYMENT` moves zero rows once expiry or withdraw got there first.
- **Pool (#3) and cutoff (#4):** unchanged fences in `ReserveFences` (online pool, season closure on
  every day, sales close on the first day, maximum stay).
- **Pinning tests:** `RequestAcceptClaimsIT` (range cases), `RequestExpiryVsAcceptRaceIT` (range case),
  `AbandonedBookingSweepIT` (range release).

## Modulith

- `venue::vocabulary.VenueStayFacts` gains `BookingMode bookingMode` (owner `venue`; consumer
  `itinerary`); `venue.api.SetBookingFacts#stayFactsOf` selects `v.booking_mode`. No new port.
- `booking.events.BookingRequestDeclined` / `BookingRequestExpired` / `BookingPaymentDue` gain a
  nullable `LocalDate lastDate` (owner `booking`; consumer `notification`).
- `itinerary.application.MoveBudget#forVenue(BookingMode)` — the clamp; `itinerary` already depends
  on `venue::vocabulary`.
- Structural net run after the change.

## FE↔BE contract

- `GET /api/venues/{id}/booking-requests`: `PendingRequestView` gains `lastDate` (ISO day).
- `POST /api/bookings` with `lastDate` at a Request-to-Book venue now answers `202 RequestedView`
  (already carries `lastDate`); `POST /api/stays` there keeps `422 RANGE_NOT_OFFERED`, detail
  reworded.
- `GET /api/venues?date&lastDate`: a Request-to-Book venue's `stay.verdict` is `SAME_SET` or
  `CANNOT_HOST`; `GET /api/venues/{id}/itinerary` there answers `maxMoves: 0`, `plan: null`.

## Phases

- **Phase 0 — one set for a range at a Request venue:** the fence lifts for one set, the stitched
  path keeps refusing · red `RangeBookingIT.aRequestVenueTakesOneSetForARange`,
  `CreateBookingServiceTest.aRequestVenueTakesOneSetForARange`, `BookingControllerIT.rangeAtRequestVenueIsOnePendingRequest`
- **Phase 1 — the queue shows the range:** `last_date` through row, record, view · red
  `RequestAcceptClaimsIT.theQueueShowsARangeAsOneRow`
- **Phase 2 — accept, race and sweep on a range:** · red `RequestAcceptClaimsIT` range cases,
  `RequestExpiryVsAcceptRaceIT.aRangeLeavesOneOutcomeAndNoPartialClaim`,
  `AbandonedBookingSweepIT.anUnpaidAcceptedRangeIsReleasedWhole`
- **Phase 3 — the three mails name the range:** events + mail records + `daysLine` · red the three
  `*MailIT.namesTheStaysDays` and `SmtpMailerIT` cases
- **Phase 4 — the verdict clamp:** `MoveBudget.forVenue`, `VenueStayFacts.bookingMode` · red
  `MoveBudgetTest`, `StayVerdictsIT.aRequestVenueIsNeverFitsWithMoves`, `PlanItineraryIT.aRequestVenueGetsNoPlan`
- **Phase 5 — FE venue page and dialog:** range picker at Request venues, no plan offer, request
  note copy + total · red `venue-map.spec.ts`, `booking-dialog.spec.ts`
- **Phase 6 — FE Requests queue:** range card + days wording · red `requests-tab.spec.ts`
- **Phase 7 — e2e + docs:** `request-to-book.e2e.ts` stay request, `operator-requests.e2e.ts` range
  card; `RESPONSIBILITIES.md` § booking / § itinerary, `CONTEXT.md`, the design doc's status line.

## Execution status

**Stage pointer:** `CI gate — awaiting the run on the pushed head, then merge origin/main and mark ready`

**Next action:** check CI on the pushed head; merge `origin/main`; ready for review; review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — one set for a range at a Request venue | ✅ | 7c3739b4 |
| 1 — the queue shows the range | ✅ | (phase 1+2 commit) |
| 2 — accept, race and sweep on a range | ✅ | (phase 1+2 commit) |
| 3 — the three mails name the range | ✅ | (phase 3 commit) |
| 4 — the verdict clamp | ✅ | (phase 4 commit) |
| 5 — FE venue page and dialog | ✅ | (phase 5 commit) |
| 6 — FE Requests queue | ✅ | (phase 6 commit) |
| 7 — e2e + docs | ✅ | (phase 7 commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
