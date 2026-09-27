# Stitched itineraries (multi-day stays 10/12) Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** When no single online set is free for every day of a stay, the venue page offers a plan of
at most `max-switches` (default and ceiling 3) same-set stretches with the fewest moves first and
the shortest second; booking it claims every day of every stretch all-or-nothing, yields one code
and one payment, and the discovery verdict gains "fits with N moves".

**Architecture:** A stay is a **group of bookings** (design D6): one `booking` row per stretch,
each an ordinary booking (one set, one span, one price, one accrual, one refund), grouped by a new
`booking`-owned `stay` row that carries the guest-facing **code**. The search is a pure shortest
path over `(day, set)` in `itinerary/domain` (D7, ADR-0018), served by a new `itinerary` read
(`GET /api/venues/{id}/itinerary`) and folded into the coast verdict as a third tier. `payment`'s
`CheckoutPort` grows a group form that opens **one** PaymentIntent with one `payment_booking` share
per stretch (D8; persistence and webhook fan-out already group-capable since #1207).

**Source of intent:** issue #1208 · `docs/architecture/multi-day-stays.md` § D6, D7, D8, D11, D13 ·
epic #1096 stories 6–10, 12, 40, 41.

**Branch:** `claude/tailwind-angular-docs-o068cv` (cloud session branch standing in for
`feature/stitched-itinerary`).

## Intake outcome (2026-09-27)

Grilled against `main` @ `bae2bbf4`. Blockers #1199, #1206, #1207 merged (PRs #1214, #1250, #1221);
epic checklist ticked for each. Open PRs: dependabot only, none touching `booking`, `payment`,
`itinerary`, `SecurityConfig` or a migration. **Next Flyway: `V65`** (free on `main`, unclaimed).
Next ADR: **ADR-0024** (D6's "ADR-0022" is taken by the map resources ADR).

Owner decisions (AskUserQuestion, 2026-09-27):

1. **Refund window of a stitched stay = the stay's first day** for every stretch, so stitching
   never changes the money a same-set stay of the same dates would refund (invariant #10).
2. **Confirmation mail stays per booking** in this slice; each mail carries the **stay code** and its
   stretch. A follow-up issue collapses them into one stay mail (story 15).
3. **Anchored plan wins within the budget**: when the tourist plans around a tapped set, a plan that
   starts or ends there is shown even if an unanchored plan has fewer moves; only when no anchored
   plan fits the budget does the unanchored best show, and the copy says so.
4. **Discovery pins stay two-state**: a "fits with moves" venue is a filled pin; cards and rows
   carry the moves label; sort order same-set → moves → can't host.

Facts settled from the code (← confirm? marks a reading to re-check when the phase lands):

- `booking.code` is `UNIQUE (code)` and every guest path resolves a code to **one** row
  (`JdbcClient…optional()` throws on two). The group therefore needs its own row: `stay`.
- `CheckoutPort.pay(BookingRef, Money)` is single-booking; `NewPayment(shares)` and the webhook's
  per-share `PaymentConfirmed`/`PaymentCanceled` fan-out are already group-capable.
- `itinerary` publishes no surface; `booking` has no grant on it and needs none here: the reserve
  validates a plan's **shape** (contiguous, ≥ 2 stretches, consecutive stretches on different sets,
  one venue), not its move count. The budget is what the search *offers*; a client-built plan with
  more stretches is still N valid bookings, bounded by `StaySpan.MAX_DAYS`.
- Request-to-Book venues refuse any range (`RANGE_NOT_OFFERED`, until #1203), so a stitched stay is
  Instant-only here; no withdraw path takes a stay code.
- The sea is at low `gridY` (the canvas washes sea at the top) ← confirm? in phase F3 against
  `beach-grid-frame.ts` before wording "back" / "closer to the sea".
- #1209 owns "your spot today", the move reminder and the staff scan's today-set display; this
  slice makes a stay code **resolve** everywhere (view, cancel, check-in, review eligibility) and
  renders the stops list on the booking page, nothing more.

## Acceptance criteria

> Given/When/Then in domain terms. *Seam* is the public boundary observed through.

**Search (domain, pure)**

- [ ] **AC-1:** Given a span and a grid where no set is free every day but sets A (days 1–3) and B
  (days 4–7) are, when the search runs with budget 3, then the plan is `[A 1–3, B 4–7]` with 1 move.
  *Seam:* `itinerary.domain.ItinerarySearch.plan` · *Pinned by:* `ItinerarySearchTest.stitchesTwoStretchesWithOneMove`
- [ ] **AC-2:** Given a grid where some day has no free set, when the search runs, then the result is
  empty (no coverage). *Pinned by:* `ItinerarySearchTest.noPlanWhenADayHasNoFreeSet`
- [ ] **AC-3:** Given a grid coverable only with 4 moves, when the budget is 3, then the result is
  empty; with budget 4 it is the 4-move plan. *Pinned by:* `ItinerarySearchTest.coverageAboveTheBudgetIsNoPlan`
- [ ] **AC-4:** Given two 1-move plans, one moving one position along the same row and one moving a
  row back, when the search runs, then the same-row plan wins (MoveRanking's rule: same row, then
  closest position, then closest row, lowest id last). *Pinned by:* `ItinerarySearchTest.aTieOnMovesIsBrokenByDistance`
- [ ] **AC-5:** Given an anchor set free on the first days only, when the search runs anchored, then
  the plan starts on it; anchored on a set free on the last days only, the plan ends on it; when no
  anchored plan fits the budget the unanchored best is returned and marked so. *Pinned by:*
  `ItinerarySearchTest.anAnchorStartsOrEndsThePlan`, `…anchorThatFitsNoPlanFallsBackUnanchored`
- [ ] **AC-6:** Given a same-set-free grid, when the coast verdict runs, then `SAME_SET` (unchanged);
  given a grid coverable with 2 moves, then `FITS_WITH_MOVES` with `moves = 2`; above the budget or
  over the maximum stay, `CANNOT_HOST` as today. *Seam:* `StayFit.verdict` · *Pinned by:*
  `StayFitTest.fitsWithMovesBetweenSameSetAndCannotHost`

**Itinerary read (port + HTTP)**

- [ ] **AC-7:** Given real map and availability rows for a venue no set covers, when
  `GET /api/venues/{id}/itinerary?date&lastDate` is called, then 200 with stretches (set, row,
  position, grid, days, per-day price, amount), each move's day and distance, total, and the
  budget; a hidden venue is 404; no plan within budget is 200 with `plan: null`. *Seam:*
  `itinerary.application.PlanItinerary` + the route · *Pinned by:* `PlanItineraryIT`,
  `ItineraryControllerIT`
- [ ] **AC-8:** Given `riviera.itinerary.max-switches=2`, then a 3-move grid is `CANNOT_HOST` and
  the itinerary read offers no plan; a value above 3 or below 1 fails startup.
  *Pinned by:* `ItineraryPropertiesBindingTest`

**Booking a plan (`booking`)**

- [ ] **AC-9:** Given a valid plan at an Instant venue, when `POST /api/stays` is called, then one
  `stay` row and one booking per stretch (`AWAITING_PAYMENT`, amount = price × days each) exist,
  every `(set, date)` of every stretch is claimed, and the response is 202 with the stay code, the
  stretches, the total and one `clientSecret` (invariant #2, #5). *Seam:* `CreateStay` ·
  *Pinned by:* `CreateStayIT.reservesEveryStretchUnderOneCodeAndOnePayment`
- [ ] **AC-10:** Given a concurrent one-day booking wins one day of one stretch, when the plan is
  reserved, then every day already won is released, no `stay` or `booking` row remains and the
  answer is `409 SET_TAKEN`. *Pinned by:* `ConcurrentStayReservationIT`
- [ ] **AC-11:** Given a plan with a gap, an overlap, one stretch, a set from another venue, a
  walk-in set, a hidden venue, a closed day, a REQUEST venue or a span over the maximum, when
  reserved, then the same refusal a single booking gets (`400`, `422 NOT_ONLINE_POOL`, `404
  NO_SUCH_SET`, `422 VENUE_CLOSED`, `422 RANGE_NOT_OFFERED`, `422 STAY_TOO_LONG`) and nothing is
  written. *Pinned by:* `CreateStayIT.refusesAMalformedOrFencedPlan`
- [ ] **AC-12:** Given the stub gateway, when a plan is reserved, then every stretch is `CONFIRMED`,
  one `BookingConfirmed` per stretch is published and the response is 201. Given Stripe, the group
  is one PaymentIntent with one `payment_booking` share per stretch under one idempotency key.
  *Seam:* `payment.api.CheckoutPort.pay(shares)` · *Pinned by:* `CreateStayIT`, `StripePaymentGatewayGroupIT`
- [ ] **AC-13:** Given a failed collection, when the plan was reserved, then every stretch is
  released (`releaseAbandoned` per booking) and no day stays claimed. *Pinned by:* `CreateStayIT.releasesEveryStretchWhenCollectionFails`

**Living with the code**

- [ ] **AC-14:** Given a confirmed stay, when staff check the stay code in on a move day, then
  today's stretch's `booking_day` is stamped and `CheckedIn(setId of today's stretch)` answers; a
  second scan is `AlreadyCheckedIn`; a day outside the stay is `WrongServiceDate`. *Seam:*
  `CheckInBooking` · *Pinned by:* `StayCheckInIT`
- [ ] **AC-15:** Given a confirmed stay, when the guest cancels by the stay code, then every stretch
  is `CANCELLED` with its refund quoted off the **stay's first day**, every `(set, date)` is
  released, one `BookingCancelled` per stretch is published, and payout writes exactly one
  reversal per stretch (invariant #9). *Seam:* `CancelBooking` · *Pinned by:* `CancelStayIT`,
  `PayoutReversalIT` (per-booking pin from #1207, re-run)
- [ ] **AC-16:** Given a stay, when `GET /api/bookings/{stayCode}` is read, then the view carries the
  stay code, the span, the total, the aggregated status and a `stretches` list; the confirmation
  mail for each stretch names the stay code (never a row code). *Seam:* `ViewBooking`,
  `BookingNotificationFacts` · *Pinned by:* `ViewStayIT`, `BookingConfirmationMailListenerTest`

**Frontend**

- [ ] **AC-17:** Given a venue with `verdict: FITS_WITH_MOVES, moves: 2`, when the discovery page
  renders, then the card and row read "Fits with 2 moves", the venue sorts after same-set and
  before can't-host venues in its beach, and its pin is filled. *Pinned by:* `stay-label.spec.ts`,
  `place-groups.spec.ts`, `home.spec.ts`, `e2e/discovery-stay.e2e.ts`
- [ ] **AC-18:** Given a venue page for a stay no set covers, when the itinerary read returns a
  2-move plan, then the banner reads "No single spot is free for all N days — see a 2-move plan";
  opening it shows the day strip coloured by stretch, the stop list with each move's day and
  distance ("1 row back, 2 spots along"), the plan's sets numbered on the map, per-day and total
  price, and "Prefer not to move? Shorten my stay". *Pinned by:* `venue-map.spec.ts`,
  `stay-plan.spec.ts`, `e2e/stitched-stay.e2e.ts`
- [ ] **AC-19:** Given a partly-free set is tapped, when "Plan my stay around {set}" is chosen, then
  the plan is fetched with `anchorSetId` and the intro names the anchor's role. *Pinned by:*
  `partly-free-sheet.spec.ts`, `venue-map.spec.ts`
- [ ] **AC-20:** Given a plan, when "Review & pay" completes the dialog, then `POST /api/stays` is
  sent with the stretches and the pay page mounts the one `clientSecret`; confirmation shows one
  code and the stops. *Pinned by:* `booking-dialog.spec.ts`, `booking-pay.spec.ts`,
  `e2e/stitched-stay.e2e.ts`
- [ ] **AC-21:** The stretch fills and their ink pass the contrast specs in all three themes; the
  numbered tile disc is `aria-hidden` inside the existing tile button (no new touch target).
  *Pinned by:* `stay-plan.contrast.spec.ts`, `e2e/touch-targets*.e2e.ts`

## Non-goals

- "Your spot today", the move reminder and the staff scan's today-set display (#1209).
- One confirmation mail for the whole stay (follow-up issue, owner decision 2).
- Refunding one day of a stay (#1210); Request-to-Book stays (#1203); operator daily view (#1205).
- Consolidation offers, held-back inventory, cross-venue itineraries (design § Out of scope).
- A "show a plan anyway" past the ceiling (D13: past 3 the answer is the longest run).
- Enforcing the move budget on the reserve path (see intake facts).

## Risks

- **R-1 (#2):** a stay claims N stretches × days in one transaction; a lost day must release every
  day won across **all** stretches → `claimEveryDay` generalised to the plan, one transaction, all
  releases before the `SET_TAKEN` answer; `ConcurrentStayReservationIT`.
- **R-2 (#7):** a stitched booking's row code must never reach a guest, staff or a mail →
  stitched rows get a derived row code `<stayCode>-<n>` that no code normaliser can produce, and
  every code-rendering read (`notificationInfo`, `findSettledForVenueOn`, the view) answers
  `COALESCE(stay.code, booking.code)`; `BookingConfirmationMailListenerTest` pins the mail.
- **R-3 (#8/#9):** one intent, N shares — a `succeeded` webhook confirms each stretch in its own
  listener transaction, so the stay's aggregated status is `AWAITING_PAYMENT` until the last lands
  (the pay page already polls). Payout accrues once per stretch on each `BookingConfirmed`
  (`payout_once_per_booking`). No new event.
- **R-4:** abandoned-payment sweep on a stay: the sweep voids the intent via the first stretch it
  sweeps; `PaymentCanceled` fans out per share and releases the siblings (#1207's behaviour). Pin
  with one IT re-using `AbandonedBookingSweepIT`'s shape ← confirm? existing coverage first.
- **R-5 (#10):** per-stretch quotes anchored on the stay's first day → `CancellationPolicy.quote`
  gains the anchor day parameter; the single-booking path passes its own first day (unchanged).
- **R-6 (cost):** the coast verdict now runs the DP per venue (D × S²; 14 × 60² × 40 ≈ 2M steps);
  `CoastVerdictCostIT` re-run and its numbers recorded here before merge.
- **R-7 (FE boundary):** `venue/venue-map.ts` may import only `booking/booking-dialog` from
  `booking/` → the dialog gains a `plan` input instead of a new cross-feature edge (RV-FE-8).
- **R-8 (structural net):** new `stay` table → sole-writer rule in
  `ResponsibilitiesArchitectureTests`; new `itinerary` port + result records split `api` /
  `vocabulary` (`PublishedSurfacePlacementArchitectureTests`); new endpoints in
  `EndpointRoleGateCoverageTest`, `SecurityConfig` CSRF-ignore + permitAll, `RateLimitFilter`,
  `ChallengeVerificationFilter` (one proof of work per stay, story 16).
- **R-9 (#4):** sales close judged on the stay's first day, season closure on every day, maximum
  stay on the whole span — the same order as `ReserveSetService`, extracted and shared, not copied.

## Open questions

### Resolved

- Refund window · confirmation mail · anchor binding · pins — owner decisions above.
- Group representation — `stay` table with the code, `booking.stay_id` (facts above).

## Availability & concurrency

- **Write paths to `set_availability(set_id, booking_date)`:** the stay reserve (N stretches ×
  days, `AvailabilityClaim.claim` per day), its all-or-nothing release, the stay cancel's release
  of every day of every stretch, the abandoned sweep's release per stretch. No new channel: every
  path is the existing per-day claim/release.
- **Concurrency strategy:** unchanged — `INSERT … ON CONFLICT DO NOTHING` per `(set, date)` under
  `UNIQUE (set_id, booking_date)`; the reserve's transaction releases every day won on the first
  loss. The search is a snapshot, never a hold: a plan can lose a day between read and reserve and
  answers `SET_TAKEN`; the page then re-reads.
- **Pool (#3) and cutoff (#4):** every stretch's set must be `ONLINE` (`poolForClaim` under
  `FOR KEY SHARE`); sales close judged on the stay's first day; season closure on every day.
- **Pinning tests:** `ConcurrentStayReservationIT`, `CreateStayIT`, `CancelStayIT` (re-claims the
  whole span after cancel, `SpanReleaseIT`'s shape).

## Modulith

- **`itinerary`** gains the `application/PlanItinerary` port (its own `adapter/in` is the only
  caller, so no `api/`; `riviera-modulith`: "api/ ONLY if a sibling calls a port here") with its
  result records in `domain/` (`ItinerarySearch.Itinerary`/`Stretch`); #1209 promotes it to `api/`
  + `vocabulary/` if its reminder needs it. Reads `venue.api.SetBookingFacts.activeSetsOf` (placements) + `setBookingInfos`
  (prices) + `VenueCatalog.findVenueMap` (visibility fence, 404) and
  `availability.api.SetAvailabilityFacts`. Grants unchanged. `StayVerdict.Fit` gains
  `FITS_WITH_MOVES` + `moves`. Budget: `riviera.itinerary.max-switches` (`ItineraryProperties`
  record, default 3, range 1..3, compact-constructor validation as `RemodelProperties`).
- **`booking`** owns `stay` (sole writer) and the `CreateStay` port (`application/reserve`), the
  stay-aware `CheckInBooking`, `CancelBooking`, `ViewBooking`, `BookingNotificationFacts`. No new
  event: `BookingConfirmed`/`BookingCancelled` per stretch carry everything `payout` and
  `notification` need (ids only, rule 3).
- **`payment`** `api/CheckoutPort` gains `PaymentOutcome pay(List<Share> shares)` (`Share(BookingRef,
  Money)`); the one-booking form delegates to it. Idempotency key `booking-<firstBookingId>-pi`,
  metadata `bookingRefs`. `PaymentGateway.initiate(shares)`; `StubPaymentGateway` unchanged in
  behaviour. Owner check: `booking` decides the plan and the refund; `payment` collects; `venue`
  answers placements and prices; `availability` the rows.
- **ADR-0024** — *A stay is a group of bookings, not one booking with segments* (D6), linked from
  `multi-day-stays.md`.

## Payment & payout

- One PaymentIntent per stay: `CheckoutPort.pay(shares)` → `StripePaymentGateway.initiate` creates
  the intent for Σ shares, registers `NewPayment(shares)` (one `payment_booking` row per stretch,
  `UNIQUE (booking_ref)`). Key `booking-<firstBookingId>-pi` (unique per group, same namespace as
  today); metadata `bookingRefs=<id,id,…>`, and `bookingRef` kept for a one-share intent.
- Webhook `payment_intent.succeeded` → `PaymentConfirmed` per share → each stretch `CONFIRMED` →
  `BookingConfirmed` per stretch → `payout` accrues once per stretch (`payout_once_per_booking`).
- Cancel: `BookingCancelled` per stretch → `RefundPort.refund(BookingRef, share refund)` with key
  `booking-<id>-refund`, adopted by tag on the shared intent (#1207) → `payout` reverses once per
  stretch. Amounts: per-stretch `refundMinor` from the quote anchored on the stay's first day; the
  stay total is the sum, currency the venue's.
- Pinning: `StripePaymentGatewayGroupIT` (one intent, N shares, key), `CreateStayIT`,
  `CancelStayIT` + `PayoutReversalIT`.

## FE↔BE contract

- `GET /api/venues` — `stay.verdict` adds `FITS_WITH_MOVES`; `stay.moves` (int, present for that tier).
- **New** `GET /api/venues/{venueId}/itinerary?date&lastDate[&anchorSetId]` → 200
  `ItineraryView { maxMoves, anchor: 'START'|'END'|'NONE'|'UNANCHORABLE'|null, plan: PlanView|null }`;
  `PlanView { moves, stretches: [{ setId, rowLabel, positionNo, gridX, gridY, tier, firstDate,
  lastDate, days, pricePerDay: Money, amount: Money }], movesBetween: [{ onDate, rowsAway,
  positionsAway, towardSea }], total: Money, currency }`; 400 on a bad span or a one-day span, 404
  hidden/unknown venue.
- **New** `POST /api/stays` `{ stretches: [{ setId, firstDate, lastDate }], contact }` (proof of
  work header as `/api/bookings`) → 201 `StayView` (stub) / 202 `StayView + clientSecret,
  paymentIntentId` / 400 malformed plan / 404 `NO_SUCH_SET` / 409 `SET_TAKEN` / 422 as the single
  reserve. `StayView { code, status, venueId, venueName, firstDate, lastDate, total: Money,
  stretches: [{ setId, rowLabel, positionNo, firstDate, lastDate, amount }] }`.
- `GET /api/bookings/{code}` — a stay code answers `BookingDetailView` with `stretches` (as above),
  `rowLabel/positionNo` = first stretch, `bookingDate/lastDate` = the span, `amount` = total,
  aggregated `status`; `POST /api/bookings/{code}/cancel` with a stay code cancels the group and
  answers the summed refund.
- Client: `venue-views.ts` mirrors `StayFit`/`ItineraryView`; `booking.model.ts` mirrors
  `CreateStayRequest`/`StayView`; never `as any`.

## Phases

> One reviewable behaviour per phase: the red test first, then the code.

**Backend**

- **Phase 0 — Search domain:** `ItinerarySearch` DP + `StayFit` third tier · red
  `ItinerarySearchTest.*` (AC-1..5), `StayFitTest.fitsWithMoves…` (AC-6).
- **Phase 1 — Budget + coast tier:** `ItineraryProperties`, `StayVerdictsService` passes the budget,
  `StayVerdictView.moves`, `DiscoveryListControllerIT` · red `ItineraryPropertiesBindingTest`,
  `StayVerdictsIT.fitsWithMoves` (AC-6, AC-8); `CoastVerdictCostIT` re-run, numbers below (R-6).
- **Phase 2 — Itinerary read:** `PlanItinerary` port + vocabulary, service, controller · red
  `PlanItineraryIT`, `ItineraryControllerIT` (AC-7); structural net.
- **Phase 3 — Stay schema + group checkout:** `V65__stay.sql`, sole-writer rule,
  `CheckoutPort.pay(shares)`, `StripePaymentGateway.initiate(shares)` · red
  `ResponsibilitiesArchitectureTests` rule, `StripePaymentGatewayGroupIT` (AC-12 payment half).
- **Phase 4 — Reserve a plan:** extract the stretch fences/claims from `ReserveSetService`,
  `CreateStay` + `StayController`, `SecurityConfig`/filters, release-on-failure · red `CreateStayIT`
  (AC-9, 11, 12, 13), `ConcurrentStayReservationIT` (AC-10).
- **Phase 5 — Stay code resolves:** check-in today's stretch, cancel the group (anchor day), view
  with `stretches`, notification/staff code reads · red `StayCheckInIT` (AC-14), `CancelStayIT`
  (AC-15), `ViewStayIT`, `BookingConfirmationMailListenerTest` (AC-16).
- **Phase 6 — ADR-0024** + design-doc link + `RESPONSIBILITIES.md` §booking/§itinerary/§payment,
  `CLAUDE.md` module table, `CONTEXT.md` glossary (*Stay*, *Stretch*, *Move budget*).

**Frontend** (`riviera-frontend`, `angular-developer`, `riviera-tailwind`; angular-cli MCP docs
consulted per API)

- **Phase F1 — Discovery tier:** `StayFit` union + `moves`, `stayLabel` "Fits with N moves",
  `canHost`, three-tier sort in `place-groups.ts` · red `stay-label.spec.ts`, `place-groups.spec.ts`,
  `home.spec.ts`; `e2e/discovery-stay.e2e.ts` (AC-17).
- **Phase F2 — Itinerary fetch + banner:** `venue.service.ts#itinerary`, `venue-views.ts` types,
  the no-cover banner's "see a K-move plan" and the partly sheet's "Plan my stay around {set}" · red
  `venue.service.spec.ts`, `venue-map.spec.ts`, `partly-free-sheet.spec.ts` (AC-18 banner, AC-19).
- **Phase F3 — Plan view:** `venue/stay-plan.ts` (strip, stops, prices, shorten), stretch tokens
  `--riv-stretch-{1..4}-fill/-ink` in three themes, numbered tile disc, `set-distance.ts` gains the
  directional "row back / closer to the sea, spots along" form (existing callers unchanged) · red
  `stay-plan.spec.ts`, `stay-plan.contrast.spec.ts`, `set-distance.spec.ts`, `venue-map.spec.ts`
  (AC-18, AC-21).
- **Phase F4 — Book the plan:** `booking-dialog` `plan` input, `booking.service.ts#createStay`,
  pay page + confirmation + booking view render `stretches` · red `booking-dialog.spec.ts`,
  `booking.service.spec.ts`, `booking-pay.spec.ts`, `booking-confirmation.spec.ts`,
  `booking-view.spec.ts` (AC-20).
- **Phase F5 — Mocked e2e:** `e2e/stitched-stay.e2e.ts` (banner → plan → dialog → pay → code),
  touch-target + axe passes (AC-18, AC-20, AC-21).

**Close-out** — plan retired, epic ticked, follow-up issue for the one-mail stay confirmation.

## Execution status

**Stage pointer:** `implement (phase 2) — itinerary read`

**Next action:** red `PlanItineraryIT` / `ItineraryControllerIT`; the port stays in `application/` (no sibling calls it) and its records in `domain/` — the plan's Modulith section is amended accordingly.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Search domain | ✅ | phase-0/1 commit |
| 1 — Budget + coast tier | ✅ | phase-0/1 commit |
| 2 — Itinerary read | | |
| 3 — Stay schema + group checkout | | |
| 4 — Reserve a plan | | |
| 5 — Stay code resolves | | |
| 6 — ADR + docs | | |
| F1 — Discovery tier | | |
| F2 — Fetch + banner | | |
| F3 — Plan view | | |
| F4 — Book the plan | | |
| F5 — Mocked e2e | | |

**Cost numbers (R-6):** `CoastVerdictCostIT` after the DP tier: 40 venues × 60 sets × 14 days at 70 % occupancy = 23,557 rows, times 110/63/43/39/35 ms, **median 43 ms** (was 29 ms before the third tier; the DP adds CPU only, no rows).

Legend: blank = not started, ⏳ = in progress, ✅ = done.
