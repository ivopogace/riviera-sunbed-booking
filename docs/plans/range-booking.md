# Multi-day stays 4/12 — book one set for a range of days (Instant venues) Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** At an Instant venue a tourist picks a first and a last day, sees on the map which sets
are free for every day, partly free, or taken, and books one set for the whole range as one
booking: one code, one payment for the total, one confirmation mail naming the days, one
proof-of-work challenge, one cancellation that frees every day. A one-day booking behaves exactly
as before.

**Architecture:** The span already exists in the schema (`booking.last_date`, V61) and every
terminal transition already releases it (slice 3). This slice makes the reserve path *create* a
span: the command carries a last day, the reserve transaction claims every service day through
the existing `AvailabilityClaim` port and gives back what it won when a day loses, so the range is
all-or-nothing without a new concurrency primitive (D3). The map read answers a range with a per-set
free-day count and taken-day list off one new `availability` read behind `venue::spi`, and the
frontend renders D12's third tile state from it. Stitching, the venue stay cap (D10, #1204), the
discovery verdict (D11, #1206) and Request-to-Book stays (#1203) stay out; a REQUEST venue refuses
a range with its own code so the guard never rests on the UI.

**Persistence:** JDBC only (invariant #1). No migration: `booking.last_date`, `booking_span_check`
and the `booking_day` trigger already carry a span. `set_availability` is unchanged; one new read
over its `UNIQUE (set_id, booking_date)` index. V63 stays free.

**Source of intent:** GitHub issue #1202 (epic #1096); `docs/architecture/multi-day-stays.md`
§ D3, D5, D12 and stories 1–5, 13–16, 20, 37–39.

**Skills consulted:** `riviera-sdlc` (intake gate: siblings #1200/#1201 merged and counted on the
epic; slice 1's plan `docs/plans/remodel-per-claim.md` still on `main` after PR #1214, retired at
this close-out; the open PRs are all dependabot's, V63 free and not needed; four product decisions
put to the user — see § Open questions › Resolved) · `riviera-plan-doc` (forced the module
ownership table, the all-or-nothing claim into the availability section, the range ceiling into
the risk register) · `tdd` (each phase red-green at a driving port or a component seam; the
existing single-day ITs are the equivalence oracle) · `riviera-review-overlay` (at
ready-for-review) · `riviera-docs-freshness` (at close-out: `RESPONSIBILITIES.md` § booking says
"a reserve is still one day"; `CONTEXT.md` gains the range vocabulary) · `riviera-local-debug`
(JDK 25 at `/opt/jdk-25`, scoped test runs, the hook's dockerd, unshallow before history claims)
· `grilling` (Q1 REQUEST venues stay single-day and the server refuses a range there · Q2 the
range is bounded at 62 days like the calendar window · Q3 the mail renders the range and the
count on one line · Q4 "other venues" is a link back to Discover with the first day kept) ·
`riviera-modulith` (the new read is a `venue::spi` method `availability` implements, no new
port; `RANGE_NOT_OFFERED` joins the sealed `BookingOutcome.Rejected`) · `riviera-java-conventions`
(outcomes as values, the compensating release stays inside the `@Transactional` reserve, error
contract §6b for the new 400/422 codes) · `codebase-design` (the range stays behind
`CreateBooking`'s one method; the map read's per-set list keeps the tap-to-see-days flow off a
second request) · `domain-modeling` (`CONTEXT.md`: *stay*, *partly free*, *longest free run*)
· `postgres` (the new read is one index-range scan per venue map, `BETWEEN` on the unique index)
· `riviera-stripe-payments` (one PaymentIntent for the total; the refund is one decision on the
whole amount under the first day's window) · `riviera-frontend` (everything lands in `venue/`,
`booking/` and `shared/`; the one frozen `venue → booking` edge carries the new `lastDate`
input) · `angular-developer` + angular-cli MCP (signals, `linkedSignal` for the picker mode,
`input()`/`output()`) · `riviera-tailwind` (three new tokens per theme, the 2px dotted width via
an attribute variant on the consumer, the badge inside the existing button so no new touch
target) · `playwright-cli` (the range journey and the tile geometry in the mocked suite).

**Branch:** `claude/sdlc-1202-xe36zs` (the designated cloud branch, standing in for
`feature/range-booking`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given set S is free on D1..D3 and a second client books S on D2 concurrently, when
  a client reserves S for D1..D3, then exactly one of the two is `Confirmed`, the other is
  `Rejected.SET_TAKEN`, and `set_availability` holds either three rows for S (range won) or one
  row on D2 (single day won), never two. *Seam:* `CreateBooking.create` · *Pinned by:*
  `ConcurrentRangeReservationIT.rangeAndSingleDayNeverBothWin`
- [ ] **AC-2:** Given S is already held on D2, when a client reserves S for D1..D3, then the outcome
  is `Rejected.SET_TAKEN` and S holds no row on D1 or D3 afterwards. *Seam:*
  `CreateBooking.create` · *Pinned by:* `ConcurrentRangeReservationIT.aLostDayLeavesNoPartialClaim`
- [ ] **AC-3:** Given an Instant venue whose set costs 4500 minor units, when a client reserves it
  for D1..D3, then one booking row exists with `booking_date = D1`, `last_date = D3`,
  `amount_minor = 13500`, one code, and the checkout port is asked once for 13500. *Seam:*
  `CreateBooking.create` + `CheckoutPort.pay` · *Pinned by:*
  `RangeBookingIT.aRangeIsOneBookingAtTheTotal` and
  `CreateBookingServiceTest.paysTheStayTotalOnce`
- [ ] **AC-4:** Given a confirmed range booking D1..D3, when `BookingConfirmed` is handled, then
  exactly one confirmation mail is sent and its body carries `Days: <D1> – <D3> (3 days)`; a
  one-day booking's mail still carries `Date: <D1>`. *Seam:* `BookingConfirmed` → `Mailer` ·
  *Pinned by:* `BookingConfirmationMailIT.aStayNamesItsDays`, `SmtpMailerTest.rangeRendersDaysLine`
- [ ] **AC-5:** Given a confirmed range booking D1..D3, when the guest cancels it, then every day
  is released: reserving the same set for D1..D3 again is `Confirmed`. *Seam:*
  `CancelBooking.cancel` + `CreateBooking.create` · *Pinned by:*
  `RangeBookingIT.cancellingFreesTheWholeRangeForReclaim`
- [ ] **AC-6:** Given a REQUEST venue, when a client reserves a set for D1..D2, then the outcome is
  `Rejected.RANGE_NOT_OFFERED` and no claim is made; the edge answers `422` code
  `RANGE_NOT_OFFERED`. *Seam:* `CreateBooking.create`, `POST /api/bookings` · *Pinned by:*
  `RangeBookingIT.aRequestVenueRefusesARange`, `BookingControllerIT.rangeAtRequestVenueIs422`
- [ ] **AC-7:** Given the venue's season closure admits D1 but not D3, when a client reserves
  D1..D3, then `Rejected.VENUE_CLOSED`; given sales for D1 have closed, then
  `Rejected.BOOKING_CLOSED` (the first day's close is the fence, invariant #4). *Seam:*
  `CreateBooking.create` · *Pinned by:* `SeasonClosureReserveIT.aRangeNeedsEveryDayAdmitted`,
  `BookingControllerIT.rangeSalesCloseIsJudgedOnTheFirstDay`
- [ ] **AC-8:** Given `lastDate` before `bookingDate`, or a span over 62 days, when
  `POST /api/bookings` is called, then `400` with the typed problem and no claim. *Seam:*
  `POST /api/bookings` · *Pinned by:* `BookingControllerIT.rangeBoundsAre400`
- [ ] **AC-9:** Given sets A (free all of D1..D3), B (held on D2), C (held every day), when the map
  is read for D1..D3, then A is `FREE` with `freeDays 3`, B is `PARTLY_FREE` with `freeDays 2`
  and `takenDates [D2]`, C is `TAKEN` with `freeDays 0`; read for D1 alone, every set is `FREE`
  or `TAKEN` with `freeDays` 1 or 0. *Seam:* `VenueCatalog.findVenueMap`,
  `GET /api/venues/{id}?date&lastDate` · *Pinned by:* `VenueRangeMapIT.rangeStatesPerSet`,
  `VenueReadControllerIT.lastDateBoundsAre400`
- [ ] **AC-10:** Given the lookup asked for sets over D1..D3, then it answers the taken days per
  set, ascending, held sets only. *Seam:* `SetAvailabilityLookup.takenDaysBetween` · *Pinned by:*
  `AvailabilityLookupIT.takenDaysBetweenListsHeldDaysPerSet`
- [ ] **AC-11:** Given a `SetView` with `availability PARTLY_FREE`, when the tile renders, then its
  state is `partly`, its classes are exactly the pinned set (available fill and ink, dotted
  border token), the badge shows `freeDays` and is `aria-hidden`, and the tile's accessible name
  carries "free 2 of 3 days". *Seam:* `mapTileState` + `[appMapTile]` + the venue page's tile
  view · *Pinned by:* `map-tile.spec.ts` ("partly free"), `venue-map.spec.ts` ("a partly-free
  set…")
- [ ] **AC-12:** Given the three themes, the partly border token is ≥ 3:1 against the available
  fill over every wash stop and the badge ink ≥ 4.5:1 on the badge fill. *Seam:* token maths
  (`testing/contrast.ts`) · *Pinned by:* `venue-map.contrast.spec.ts` ("partly-free dotted
  border", "free-day badge")
- [ ] **AC-13:** Given the calendar in "Several days" mode, when the tourist taps D1 then D3, then
  `chosen` emits `{ first: D1, last: D3 }` and the trigger reads the range with "3 days"; in
  "One day" mode a single tap emits `{ first: D1, last: D1 }` and closes, as today; a last day
  more than 61 days after the first is not selectable; a REQUEST venue offers no mode switch.
  *Seam:* `app-availability-calendar` inputs/outputs · *Pinned by:*
  `availability-calendar.spec.ts` ("range mode…"), `venue-map.spec.ts` ("REQUEST venue…")
- [ ] **AC-14:** Given a partly-free set is tapped, then the page names the days it covers and
  offers "Shorten my stay to <run>"; accepting reloads the map for that run and opens the booking
  dialog on that set. Given no set is free for the whole range but some are partly free, the page
  names the longest single-set run with the same offer and a link to Discover carrying the first
  day. *Seam:* the venue page (`venue-map.ts`) and `longestFreeRun` · *Pinned by:*
  `stay-runs.spec.ts`, `venue-map.spec.ts` ("shorten…", "no set covers…")
- [ ] **AC-15:** Given a range D1..D3 and a set at €45, when the dialog opens, then it shows
  "€45 per day × 3 days" and a total of €135, the POST body carries `lastDate: D3`, and the
  confirmation and pay pages show the range. *Seam:* `app-booking-dialog`, `BookingService` ·
  *Pinned by:* `booking-dialog.spec.ts` ("a stay…"), `booking-confirmation.spec.ts`
- [ ] **AC-16:** The whole range journey — pick a range, read the tile states and the 2px dotted
  computed border in each theme, shorten from a partly-free set, book, land on the confirmation —
  runs in the mocked Playwright suite with no serious axe violation. *Seam:* the SPA over mocked
  routes · *Pinned by:* `e2e/range-booking.e2e.ts`
- [ ] **AC-17:** Every existing single-day IT and spec passes untouched (the equivalence oracle:
  `ConcurrentReservationIT`, `BookingControllerIT`, `SpanReleaseIT`, `venue-map.spec.ts`,
  `booking-flow.e2e.ts`, `same-day-booking.e2e.ts`).

## Non-goals

- Stitched itineraries (#1208), the venue stay cap (#1204), the discovery verdict (#1206).
- Request-to-Book stays (#1203): a REQUEST venue refuses a range (`RANGE_NOT_OFFERED`).
- Per-day daily takings (D4, #1205) and the per-day weather refund (#1210).
- Any change to `set_availability`, `AvailabilityClaim`'s signature or the claim primitive.
- A remodel move's mail for a stay (`BookingMoved` still names the first day): follow-up.

## Behavior-parity ledger (retirement / replacement slices only)

The single-day picker and tile are extended, not replaced; every old behaviour is kept and AC-17
pins it. Rows here cover the calendar, whose contract changes shape.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| One tap on a day applies it and closes the picker | preserved | "One day" mode (the default when the selection is one day, and the only mode at a REQUEST venue) does exactly this |
| `chosen` emits an ISO string | changed | emits `{ first, last }`; the one consumer (`venue-map`) maps a one-day pick to `first === last` |
| `?date` seeds the map | preserved | `?lastDate` seeds beside it; absent or invalid → one day, as before |
| Trigger label "Tue 30 Jun 2026" | preserved | a range reads "Tue 30 Jun – Sat 4 Jul 2026 · 5 days" |
| "N of M sets free on {date}" | preserved for one day | a range reads "N of M sets free for all 5 days · K partly free" |
| `SetView.availability` FREE/TAKEN | preserved | `PARTLY_FREE` appears only when `lastDate > date`; `mapTileState` still fails closed on an unknown token |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A lost day mid-range commits the days already won (`Rejected` is a normal return; the claim joins the reserve transaction) — a partial claim nothing can identify (#2, D5) | high without care | high | The reserve loop releases every day it won before returning `SET_TAKEN`, inside the same transaction; AC-2 pins zero rows on the other days, AC-1 the race | booking | open |
| R-2 | A race between a range and a single day double-sells a day | low | high | Unchanged primitive: `UNIQUE (set_id, booking_date)` + `ON CONFLICT DO NOTHING` per day; `ConcurrentRangeReservationIT` | availability | open |
| R-3 | The season closure fence judged on the first day alone admits a stay running into a closure | medium | medium | `admitsDate` for every day (VENUE_CLOSED); sales close on the first day only (#4); AC-7 | booking | open |
| R-4 | An unbounded range makes the map read ship a per-set taken-day list with no ceiling and the reserve loop unbounded | medium | medium | `MAX_STAY_DAYS = 62`, the calendar's window, on the map read (400) and the reserve (400); documented as a technical bound, not a product maximum (D10, #1204) | venue + booking | open |
| R-5 | Total = price × days overflows or rounds | low | high | `Math.multiplyExact` on integer minor units (#5); ≤ 62 × a 64-bit price cannot overflow; no rounding exists | booking | open |
| R-6 | Registry-persisted event payloads (`BookingConfirmed`, `BookingCancelled`) predate `lastDate` | certain | low | Field added last, nullable; every consumer treats `null` as `bookingDate` (one-day) | booking / notification / payout | open |
| R-7 | The frontend's "shorten" reloads the map and opens the dialog on a set whose day may have been taken meanwhile | medium | low | The dialog opens only if the reloaded set is `FREE`; otherwise the page simply shows the new map (the server still decides, #2) | frontend | open |
| R-8 | Dotted (partly) and dashed (taken) borders read alike at hairline widths; forced-colors drops fills | medium | medium | 2px dotted via `[&[data-state=partly]]:border-2` on the tile and swatch; the badge count and the fill carry the difference; the e2e asserts the computed `border-top-style: dotted` and `2px`; the contrast spec measures the border in all three themes | frontend | open |
| R-9 | The badge adds a touch target or breaks the tile's `[appTouchTarget]` box | low | low | `aria-hidden` span positioned inside the existing button; `check-touch-target.mjs` and `touch-targets-tourist.e2e.ts` | frontend | open |
| R-10 | Error contract: two new codes (`RANGE_NOT_OFFERED` 422; the 400 for bad bounds reuses the typed parsing 400) | certain | low | Built in `ApiProblem`'s switch only; `ErrorContractArchitectureTests` stays green; FE `BookingErrorCode` gains the code with copy | booking | open |
| R-11 | Sonar: new-code coverage on the FE range code and the JDBC read | medium | low | Vitest units on every new pure function and component branch; `AvailabilityLookupIT` for the read | — | open |

## Open questions / Assumptions

- **Assumption:** the stay's price is the set's price × the number of days, with no seasonal or
  length pricing (spec: dynamic pricing is "later"). — *Owner:* booking · *Resolves by:* AC-3
- **Assumption:** the refund on cancelling a stay is one decision on the whole amount under the
  **first day's** cancellation window (story 20, D5). `CancellationPolicy.quote` already does
  this. — *Owner:* booking · *Resolves by:* AC-5 (no code change)
- **Assumption:** the map read for a range returns `takenDates` for every held set (empty for a
  fully free set), bounded by the 62-day ceiling, so the tap-to-see-days flow needs no second
  request. — *Owner:* venue · *Resolves by:* AC-9
- **Assumption:** the code-gated booking view and the tourist's "my bookings" list gain
  `lastDate` and render a range, since a stay shown as one day would be wrong; nothing else
  about them changes. — *Owner:* booking · *Resolves by:* phase 2

### Resolved

- **Q1 (user, 2026-09-25):** a REQUEST venue's page keeps the one-day picker and the server refuses
  a range there with `422 RANGE_NOT_OFFERED`.
- **Q2 (user, 2026-09-25):** the range is bounded at 62 days, the calendar's window, as a technical
  bound on the map read and the reserve; the per-venue cap is #1204.
- **Q3 (user, 2026-09-25):** the confirmation and cancellation mails render a stay as
  `Days: 3 July – 7 July 2027 (5 days)`; a one-day booking keeps `Date: …`.
- **Q4 (user, 2026-09-25):** when no set covers the range, the page shows the longest single-set
  run with the shorten offer and a "See other beaches" link to Discover carrying the first day.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** the online reserve (`ReserveSetService`),
  now once per service day of the range through `AvailabilityClaim.claim`; the compensating
  `release` of the days a lost range already won, inside the same transaction; every terminal
  transition's span release (slice 3, unchanged); the staff mark and the remodel move (unchanged).
- **Uniqueness guarantee:** `UNIQUE (set_id, booking_date)` on `set_availability` (V4), one row per
  service day.
- **Concurrency strategy:** `INSERT … ON CONFLICT DO NOTHING` per day, unchanged. A range is
  all-or-nothing by the transaction plus the compensating release: a day that loses returns the
  days already won and the reserve answers `SET_TAKEN` with nothing committed. A concurrent
  single-day claim on one of the days either commits first (the range loses whole) or blocks on
  the range's uncommitted row until it commits (the single day loses). No new lock, no
  `FOR UPDATE`.
- **Pool rule (#3):** unchanged — `poolForClaim` inside the claim; the reserve refuses a non-online
  set before any claim.
- **Cutoff rule (#4):** the venue's `sales_close` on the **first** day, `Europe/Tirane`; the season
  closure must admit **every** day. The cancellation window stays keyed on the first day.
- **Pinning test:** `ConcurrentRangeReservationIT.rangeAndSingleDayNeverBothWin` and
  `.aLostDayLeavesNoPartialClaim`; `RangeBookingIT.cancellingFreesTheWholeRangeForReclaim` (D5).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `booking` (now with a real `last_date`) | Owns bookings and the reserve lifecycle; decides the range's fences and its total |
| M-2 | `availability` | existing | none new (`set_availability` via the existing claim) | Sole writer and reader of `(set, date)` state; answers the per-set taken days |
| M-3 | `venue` | existing | none | Composes the map read; overlays the range state per set |
| M-4 | `notification` | existing | none | Renders the days line in the confirmation and cancellation mails |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability::api` | `AvailabilityClaim` (unchanged; called once per day) | `ClaimOutcome` | `booking` |
| NI-2 | `venue::spi` | `SetAvailabilityLookup.takenDaysBetween(setIds, from, to)` **new method** | `Map<SetId, List<LocalDate>>` | `venue` (implemented by `availability`) |
| NI-3 | `venue::api` | `VenueCatalog.findVenueMap(VenueId, LocalDate first, LocalDate last)` **changed** | `VenueMapView`, `SetView` (+ `freeDays`, `takenDates`, `PARTLY_FREE`) | the root edge (`VenueReadController`) |
| NI-4 | `payment::api` | `CheckoutPort.pay(BookingRef, Money)` (unchanged; the amount is the total) | `Money` | `booking` |
| NI-5 | `booking::vocabulary` | `BookingOutcome.Rejected.RANGE_NOT_OFFERED` **new constant**; `BookingConfirmationFacts` + `lastDate` | — | the edge, `notification` |

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` (+ `lastDate`, nullable) | `booking` | bookingId, venueId, setId, bookingDate, lastDate, amount | `payout`, `notification`, `booking` | async (registry) | `BookingConfirmationMailIT`, `PayoutAccrualIT` (unchanged) |
| EV-2 | `BookingCancelled` (+ `lastDate`, nullable) | `booking` | bookingId, venueId, setId, bookingDate, lastDate, refund | `payout`, `notification`, `booking` | async | `BookingCancellationMailIT` |

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| The range's fences (every day admitted; first day's sales close; 62-day bound; REQUEST refusal) | `booking` | Job: "own bookings … the lifecycle"; `availability`'s Not-My-Job: "deciding whether bookings are even open for a date → booking" |
| The N claims and the compensating release | `booking` calls, `availability` executes | `availability` Job: "the only writer of that table"; `booking` Not-My-Job: "owning the (set, date) state → availability (I ask it to claim)" |
| The stay total | `booking` (reserve) | A money calculation with one caller stays inline (ADR-0018 §1); `venue` still owns the per-day price, `payout` the commission |
| The per-set taken days over a range | `availability` behind `venue::spi` | `availability` Job: "answer the read-side facts through `venue::spi`"; the same inversion as `takenOn` |
| The map's `PARTLY_FREE` / `freeDays` composition | `venue` | Job: "venue composes; I answer state" (availability); the layout is venue's |
| The days line in mails | `notification` | Job: transactional mail; the facts ride the event |
| Which day's window prices a stay's refund | `booking` (`CancellationPolicy`, unchanged) | Invariant #10: server-side refund policy |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, no Connect; payout via manual BKT batch.
- **Confirmation trigger:** signature-verified webhook (unchanged).
- **Idempotency:** the intent's key stays the booking id; a stay is one booking, one intent.
- **Money:** integer minor units, EUR; `amount_minor = price × days` via `Math.multiplyExact`.
- **Payout-ledger effect:** one `ACCRUAL` for the total on `BookingConfirmed`, one `REVERSAL` on
  `BookingCancelled` — unchanged code, the amount is simply the total.
- **Refund policy applied:** `CancellationPolicy.quote` on the whole amount under the first day's
  window (D5, story 20).
- **Pinning tests:** `CreateBookingServiceTest.paysTheStayTotalOnce`,
  `RangeBookingIT.aRangeIsOneBookingAtTheTotal`; the existing `PayoutAccrualIT` /
  `PayoutReversalIT` stay the ledger oracle.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.ts` + `.html` | existing | page | `selectedDate` + new `selectedLastDate` signals seeded from `?date`/`?lastDate`; `dayCount`, `partlyCount`, `noSetCovers`, `longestRun` computeds; `pendingSelectSetId` for the shorten flow | none |
| FE-2 | `venue/availability-calendar.ts` + `.html` | existing | modal picker | `mode` (`'day' \| 'stay'`) `linkedSignal` off the selection and `rangeAllowed` input; `pendingFirst` signal; `chosen` emits `{ first, last }` | none |
| FE-3 | `venue/map-tile.ts` | existing | directive + vocabulary | `partly` state, class, meaning, legend row | — |
| FE-4 | `venue/stay-runs.ts` | new | pure functions | `freeRuns(set, first, last)`, `longestFreeRun(sets, first, last)` | — |
| FE-5 | `venue/partly-free-sheet.ts` | new | modal (the calendar's `<dialog open>` + `focus-trap` shape) | inputs: set, first, last, takenDates; outputs: `shorten({first,last,setId})`, `dismissed` | none |
| FE-6 | `booking/booking-dialog.ts` | existing | modal | new `lastDate` input; `dayCount`, `total` computeds; POST carries `lastDate` | existing Signal Form |
| FE-7 | `booking/booking-confirmation.ts`, `booking-pay.ts`, `request-confirmation.ts`, `booking-view.ts`, `my-bookings.ts` | existing | pages | render `formatStay(first, last)` | — |
| FE-8 | `shared/booking-date-label.ts` | existing | pure | `formatStay(first, last, opts)` | — |
| FE-9 | `shared/venue-views.ts`, `booking/booking.model.ts` | existing | types | `SeatAvailability` + `PARTLY_FREE`, `SetView.freeDays/takenDates`, `lastDate` on the booking DTOs, `RANGE_NOT_OFFERED` | — |
| FE-10 | `src/tailwind.css` | existing | tokens | `--riv-tile-partly-border`, `--riv-tile-badge-fill`, `--riv-tile-badge-ink` per theme + `@theme inline` | — |

## FE↔BE contract

- **New/changed endpoints:**
  - `GET /api/venues/{id}?date=&lastDate=` — `lastDate` optional (default `date`); `lastDate < date`
    or a span over 62 days → `400`. `SetView` gains `availability: FREE | PARTLY_FREE | TAKEN`,
    `freeDays: int`, `takenDates: ISO date[]` (ascending; empty when free). `salesOpen` is the
    first day's verdict and every day admitted by the season closure.
  - `POST /api/bookings` — body gains optional `lastDate` (ISO; absent = `bookingDate`); the same
    bounds → `400`; a REQUEST venue with `lastDate > bookingDate` → `422 RANGE_NOT_OFFERED`.
    Every creation outcome view and `GET /api/bookings/{code}` gain `lastDate`; `amount` is the
    stay total.
- **Client typing:** hand-typed mirrors in `shared/venue-views.ts` and `booking/booking.model.ts`;
  never `as any`.
- **Money/date on the wire:** minor units + currency; ISO `LocalDate` strings.

## Execution status

**Stage pointer:** `implement (phase 4)`

**Next action:** phase 4, the partly-free tile, the shorten flow and the no-cover banner.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The map read answers a range | ✅ | `cc793e1` |
| 1 — The reserve claims every day, all-or-nothing | ✅ | `c1d6894` |
| 2 — Events, mails and the booking view carry the span | ✅ | `788ea3b` |
| 3 — Range picker and the venue page's range state | ✅ | phase-3 commit |
| 4 — The partly-free tile, the shorten flow, the no-cover banner | ⏳ | |
| 5 — Dialog, pay and confirmation for a stay; the mocked e2e | | |
| 6 — Docs, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — `takenDaysBetween`
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — the read
- `platform/src/main/java/ai/riviera/platform/venue/api/VenueCatalog.java` — `findVenueMap(id, first, last)`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — range overlay
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetView.java` — `freeDays`, `takenDates`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/StayBounds.java` — the 62-day bound, the one home of the ceiling
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReadController.java` — `lastDate` param
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapReadService.java` — one-day caller of the catalogue
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/CreateBookingRequest.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/CreatedBookingView.java` — `lastDate`, the total
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingController.java` — `RANGE_NOT_OFFERED` → 422
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — insert binds `last_date`; confirm/cancel return it
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingNotificationFacts.java` — facts carry `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/{CreateBookingCommand,NewBooking,ReserveOutcome,ReserveSetService,CreateBookingService,BookingConfirmation,ConfirmedBooking,ConfirmBookingService}.java` — the range reserve
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` — publishes `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — publishes `lastDate` on its cancels
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/WeatherRefundService.java` — publishes `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/{BookingOutcome,BookingConfirmationFacts,BookingRecord}.java` — the new constant, the span
- `platform/src/main/java/ai/riviera/platform/booking/events/{BookingConfirmed,BookingCancelled}.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/shared/ApiProblem.java` — `RANGE_NOT_OFFERED`
- `platform/src/main/java/ai/riviera/platform/notification/application/{BookingConfirmationMail,BookingCancellationMail,BookingConfirmationResendService}.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/{BookingConfirmationMailListener,BookingCancellationMailListener}.java` — pass it
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — the days line
- `platform/src/test/java/ai/riviera/platform/booking/{ConcurrentRangeReservationIT,RangeBookingIT,BookingControllerIT,SeasonClosureReserveIT}.java`
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/BookingCreationViewsContractTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/{VenueRangeMapIT,VenueReadControllerIT}.java`
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapReadServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java`
- `platform/src/test/java/ai/riviera/platform/notification/{BookingConfirmationMailIT,BookingCancellationMailIT,BookingMailFixtures}.java`
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SmtpMailerTest.java`
- `platform/src/test/java/ai/riviera/platform/**/*Test.java|*IT.java` — every fixture that builds one of the widened records (enumerated in phase 1 step 5)
- `frontend/src/app/shared/{venue-views,booking-date-label,booking-date-label.spec}.ts`
- `frontend/src/app/venue/{map-tile,map-tile.spec,stay-runs,stay-runs.spec,partly-free-sheet,partly-free-sheet.spec,venue-map,venue-map.spec,venue-map.contrast.spec,availability-calendar,availability-calendar.spec,venue.service,venue.service.spec}.ts`
- `frontend/src/app/venue/{venue-map,availability-calendar}.html`
- `frontend/src/app/booking/{booking.model,booking-dialog,booking-dialog.spec,booking-confirmation,booking-confirmation.spec,booking-pay,booking-pay.spec,request-confirmation,booking-view,my-bookings}.ts`
- `frontend/src/tailwind.css` — the three tokens
- `frontend/e2e/range-booking.e2e.ts`
- `frontend/e2e/venue-map-pan.e2e.ts` — the legend gains a row
- `RESPONSIBILITIES.md`, `CONTEXT.md`, `docs/plans/range-booking.md`
- `docs/plans/remodel-per-claim.md` — retired (merged via PR #1214)

---

## Phase 0 — The map read answers a range

**Files:** Modify `SetAvailabilityLookup`, `JdbcSetAvailabilityLookup`, `VenueCatalog`,
`JdbcVenueCatalog`, `SetView`, `VenueReadController`, `BeachMapReadService` · Create `StayBounds` ·
Test `AvailabilityLookupIT`, `VenueRangeMapIT`, `VenueReadControllerIT`, `BeachMapReadServiceTest`

- [ ] **Step 1:** `AvailabilityLookupIT.takenDaysBetweenListsHeldDaysPerSet` — seed A free, B held D2,
  C held D1..D3; expect `{B: [D2], C: [D1, D2, D3]}`; an empty id list answers empty without SQL.
- [ ] **Step 2:** run → FAIL (no such method).
- [ ] **Step 3:** the SPI method + the JDBC read (`WHERE set_id IN (:ids) AND booking_date BETWEEN
  :from AND :to ORDER BY set_id, booking_date`).
- [ ] **Step 4:** `VenueRangeMapIT.rangeStatesPerSet` (AC-9) → FAIL → `findVenueMap(id, first, last)`
  composes `freeDays = days − taken.size()`, the token; `StayBounds.MAX_DAYS = 62` and the
  controller's `lastDate` param with the two 400s; `BeachMapReadService` passes `date, date`.
- [ ] **Step 5:** `./gradlew --console=plain test --tests "*AvailabilityLookupIT*" --tests
  "*VenueRangeMapIT*" --tests "*VenueReadControllerIT*" --tests "*BeachMapReadServiceTest*"
  --tests "*VenueCatalogVisibilityIT*"` → PASS; the structural net → PASS.
- [ ] **Step 6:** Commit `Multi-day stays 4/12: the map read answers a range per set (#1202)`.
- [ ] **Step 7:** Execution status.

## Phase 1 — The reserve claims every day, all-or-nothing

**Files:** Modify `CreateBookingRequest`, `CreateBookingCommand`, `NewBooking`, `ReserveOutcome`,
`ReserveSetService`, `CreateBookingService`, `BookingConfirmation`, `CreatedBookingView`,
`BookingController`, `ApiProblem`, `BookingOutcome`, `JdbcBookings` · Test
`ConcurrentRangeReservationIT` (new), `RangeBookingIT` (new), `CreateBookingServiceTest`,
`BookingControllerIT`, `SeasonClosureReserveIT`, `BookingCreationViewsContractTest`

- [ ] **Step 1:** `RangeBookingIT.aRangeIsOneBookingAtTheTotal` (AC-3) at `CreateBooking.create`
  with `new CreateBookingCommand(set, D1, D3, contact)`.
- [ ] **Step 2:** run → FAIL (no such constructor).
- [ ] **Step 3:** the command gains `lastDate` (three- and four-arg constructors stay one-day);
  `ReserveSetService`: every day admitted (VENUE_CLOSED), first day bookable (BOOKING_CLOSED),
  REQUEST + span > 1 → `RANGE_NOT_OFFERED`, the claim loop with the compensating release, the
  total via `Math.multiplyExact`; `NewBooking.lastDate`; `JdbcBookings.insert` binds `:last`;
  `ReserveOutcome.Reserved.amountMinor`; `CreateBookingService.collect` pays the total;
  `BookingConfirmation.lastDate` + `amount`.
- [ ] **Step 4:** `ConcurrentRangeReservationIT` (AC-1, AC-2), `RangeBookingIT` (AC-5, AC-6,
  AC-7's sales close), `SeasonClosureReserveIT.aRangeNeedsEveryDayAdmitted`,
  `BookingControllerIT` (AC-6's 422, AC-8's 400s), `BookingCreationViewsContractTest`
  (`lastDate` on the wire), `CreateBookingServiceTest.paysTheStayTotalOnce`.
- [ ] **Step 5:** Generalization pass — population: every constructor of a widened record
  (`grep -rln "new CreateBookingCommand(\|new NewBooking(\|new BookingConfirmation(\|new
  ReserveOutcome.Reserved(" platform/src`); every mail/view that prints a booking's date.
- [ ] **Step 6:** Commit `Multi-day stays 4/12: the reserve claims every day of a range, all or
  nothing (#1202)`.
- [ ] **Step 7:** Execution status.

## Phase 2 — Events, mails and the booking view carry the span

**Files:** Modify `BookingConfirmed`, `BookingCancelled`, `ConfirmedBooking`,
`ConfirmBookingService`, `CancelBookingService`, `RemodelClaimsService`, `WeatherRefundService`,
`BookingRecord`, `BookingConfirmationFacts`, `JdbcBookingNotificationFacts`, `JdbcBookings`,
`BookingDetail`, `BookingDetailView`, `BookingConfirmationMail`, `BookingCancellationMail`,
`BookingConfirmationResendService`, the two mail listeners, `SmtpMailer` · Test
`SmtpMailerTest`, `BookingConfirmationMailIT`, `BookingCancellationMailIT`, the listener tests

- [ ] **Step 1:** `SmtpMailerTest.rangeRendersDaysLine` (AC-4's rendering) and
  `BookingConfirmationMailIT.aStayNamesItsDays`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** `lastDate` last on both events (nullable, `null` reads as one day); the confirm
  and cancel `RETURNING` clauses yield `last_date`; the mail DTOs and `SmtpMailer`'s `Days:` line
  (`d MMMM yyyy` on both ends, the count); `BookingDetail.lastDate` from `BookingRecord`.
- [ ] **Step 4:** `./gradlew --console=plain test --tests "*SmtpMailerTest*" --tests
  "*BookingConfirmationMailIT*" --tests "*BookingCancellationMailIT*" --tests
  "*BookingConfirmationMailListenerTest*" --tests "*BookingCancellationMailListenerTest*" --tests
  "*BookingViewIT*" --tests "*EventRegistryDurabilityIT*"` → PASS.
- [ ] **Step 5:** Generalization pass — population: every `new BookingConfirmed(`/`new
  BookingCancelled(` in tests (`grep -rln` above).
- [ ] **Step 6:** Commit `Multi-day stays 4/12: the confirmed and cancelled events, the mails and
  the booking view name the stay's days (#1202)`.
- [ ] **Step 7:** Execution status.

## Phase 3 — Range picker and the venue page's range state

**Files:** Modify `shared/venue-views.ts`, `shared/booking-date-label.ts`, `venue/venue.service.ts`,
`venue/availability-calendar.ts|.html`, `venue/venue-map.ts|.html` · Test the matching specs

- [ ] **Step 1:** `booking-date-label.spec.ts` (`formatStay`), `availability-calendar.spec.ts`
  "range mode: first tap then last tap emits the range" (AC-13), `venue-map.spec.ts` "?lastDate
  seeds a range and the trigger reads it", "a REQUEST venue offers no stay mode".
- [ ] **Step 2:** `npm test -- --include src/app/venue/availability-calendar.spec.ts` → FAIL.
- [ ] **Step 3:** `chosen` emits `{ first, last }`; the `rangeAllowed` input; the mode segmented
  control (`shared/segmented-control.ts`); `pendingFirst`; cells beyond `first + 61` not
  selectable in stay mode; the footer copy; `venue-map`: `selectedLastDate`, `routeKey` with
  `lastDate`, `load()` with both, the trigger and count copy, `getVenueMap(id, first, last)`.
- [ ] **Step 4:** `npm test -- --include src/app/venue/**` and `npm run lint` → PASS.
- [ ] **Step 5:** Commit `Multi-day stays 4/12: the venue page picks a first and a last day (#1202)`.
- [ ] **Step 6:** Execution status.

## Phase 4 — The partly-free tile, the shorten flow, the no-cover banner

**Files:** Modify `venue/map-tile.ts`, `venue/venue-map.ts|.html`, `src/tailwind.css`,
`venue/venue-map.contrast.spec.ts` · Create `venue/stay-runs.ts`, `venue/partly-free-sheet.ts` ·
Test `map-tile.spec.ts`, `stay-runs.spec.ts`, `partly-free-sheet.spec.ts`, `venue-map.spec.ts`

- [ ] **Step 1:** `map-tile.spec.ts` "partly free" (AC-11: state, pinned class string, legend
  row); `stay-runs.spec.ts` (runs from `takenDates`; longest run, ties by earliest start);
  `venue-map.contrast.spec.ts` (AC-12); `venue-map.spec.ts` "a partly-free set carries 'free k of
  N days' and opens the sheet", "shorten reloads and opens the dialog", "no set covers → longest
  run + Discover link".
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** the state + tokens + badge; the sheet; the banner; `pendingSelectSetId`.
- [ ] **Step 4:** `npm test -- --include src/app/venue/**`, `npm run test:a11y`, `npm run lint`,
  `node scripts/check-touch-target.mjs --files …`, `node scripts/check-focus-posture.mjs` → PASS.
- [ ] **Step 5:** Commit `Multi-day stays 4/12: a partly-free set is a dotted tile with a free-day
  count (#1202)`.
- [ ] **Step 6:** Execution status.

## Phase 5 — Dialog, pay and confirmation for a stay; the mocked e2e

**Files:** Modify `booking/booking.model.ts`, `booking-dialog.ts`, `booking-confirmation.ts`,
`booking-pay.ts`, `request-confirmation.ts`, `booking-view.ts`, `my-bookings.ts` · Create
`e2e/range-booking.e2e.ts` · Test the matching specs, `e2e/venue-map-pan.e2e.ts` (legend row)

- [ ] **Step 1:** `booking-dialog.spec.ts` "a stay shows the per-day price and the total and posts
  lastDate" (AC-15); `booking-confirmation.spec.ts` "a stay reads its range".
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** the `lastDate` input, `dayCount`/`total`; the pages render `formatStay`.
- [ ] **Step 4:** `e2e/range-booking.e2e.ts` (AC-16) with
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- range-booking` and
  the touched suites (`booking-flow`, `same-day-booking`, `venue-map-pan`, `touch-targets-tourist`).
- [ ] **Step 5:** Commit `Multi-day stays 4/12: a stay is booked, paid and confirmed as one (#1202)`.
- [ ] **Step 6:** Execution status.

## Phase 6 — Docs, close-out

- [ ] `RESPONSIBILITIES.md` § booking ("a reserve is still one day" → the range rule), § availability
  (the per-set range read), § venue (the range map read); `CONTEXT.md` (*stay*, *partly free*,
  *longest free run*); `git rm docs/plans/remodel-per-claim.md`.
- [ ] `riviera-docs-freshness` over the PR range; the counting sweep for `SetAvailabilityLookup`'s
  method count and `BookingOutcome.Rejected`'s constants.
- [ ] Draft PR at the first phase commit → ready for review once built and `origin/main` merged;
  review gate; Sonar gate; close-out per `pr-gates.md` §3.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-10:** `./gradlew --console=plain test --tests "*ConcurrentRangeReservationIT*"
  --tests "*RangeBookingIT*" --tests "*BookingControllerIT*" --tests "*SeasonClosureReserveIT*"
  --tests "*VenueRangeMapIT*" --tests "*VenueReadControllerIT*" --tests "*AvailabilityLookupIT*"
  --tests "*BookingConfirmationMailIT*" --tests "*SmtpMailerTest*" --tests
  "*CreateBookingServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-11..AC-15:** `npm test` + `npm run test:a11y` → PASS. Verified at commit `<sha>`.
- [ ] **AC-16:** `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.
- [ ] **AC-17:** CI green on the PR head.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12). — none needed, V63 free.
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
