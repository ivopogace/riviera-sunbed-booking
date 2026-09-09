# Closed for season — own close/reopen endpoint with counts, the season closure inside the sales-open projection, advance-sales opt-in, the Discover badge, the reserve fence Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator closes a venue for the season from the Venue tab (optional reopen date, an
advance-sales opt-in that defaults off) and gets back how many future bookings and pending requests
still stand; tourists still see the venue, badged "Closed for season" and sorted after open venues,
with its page, photos, reviews, map and calendar browsable and every date unsellable — dates on or
after the reopen date sell only with the opt-in — and an online reserve for a closed date is refused
with its own code, `VENUE_CLOSED`.

**Architecture:** Closed-ness is a stored venue fact and a `booking` rule, exactly as sales close
is: `venue` stores `closed_at` / `reopen_on` / `advance_sales`, publishes them as one vocabulary
value (`SeasonClosure`) on the facts it already hands out (`SetBookingInfo`, the catalogue rows), and
`booking`'s `BookingCutoff` — the module-wide day-boundary authority — decides whether a closure is
still in effect at an instant and whether it admits a date; the existing `venue.spi.SalesWindow`
inversion carries that verdict back into the three catalogue reads, so `salesOpen` is one projection
computed by one rule and the client never ANDs a second flag. The write is its **own owner-asserted
state-transition endpoint** (`PUT`/`DELETE /api/venues/{venueId}/season-closure`), never the profile
full-replace: the profile PATCH has no version-token-free way to carry a state change and nowhere to
return the counts, which `booking` answers through one more method on the existing
`venue.spi.BookingPresence` port. Reads compare dates; there is no sweep.

**Persistence:** JDBC only (invariant #1). One migration, **V51**: three nullable-or-defaulted
columns on `venue` plus `venue_season_closure_check` (an open venue carries no reopen date and no
opt-in; the opt-in needs a reopen date). No index: the columns are read off the venue row by PK, and
the list read already scans the table.

**Source of intent:** GitHub issue #1028 (parent epic #1027, revision 3 — user stories 1–9).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced: (1) the
calendar read carries **no per-date sales verdict today** (`DailyAvailability(date, sets)` and
"reports availability, not bookability"), so "every date unavailable through the sales-open
projection" means the calendar gains a per-day `salesOpen` that the picker gates on, the same verdict
the map computes for its one date; (2) the reserve path already goes through one service for both
booking modes (`ReserveSetService`, the REQUEST branch is inside it), so one fence covers "instant
and request"; (3) `booking` reads the venue's facts through `SetBookingFacts#setBookingInfo`, not
`VenueCatalog`, and `VenueApiRoleSplitTests` forbids growing `VenueCatalog` for a sibling — so the
closure rides `SetBookingInfo`; (4) no IT overrides the Clock bean — the fixed-clock reopen-boundary
ITs mock it per class (`@MockitoBean Clock`, the `VenueAvailabilityCalendarControllerTest`
precedent) rather than adopting the midnight-assumption pattern, because a date-granular rule cannot
be pinned from the wall clock; (5) `EndpointRoleGateCoverageTest` fails a new route without its own
`SecurityConfig` matcher; (6) `daily-view-tab.ts` also consumes `salesOpen` — a closed venue's daily
view will read "online sales closed today", which is the truth and stays; (7) V51 is free on `main`
and unclaimed by the one open PR (#1047, frontend-only); the previous sibling #1031 closed out on
the epic with PR #1046 and `docs/plans/pinned-cells.md` retires in this PR's close-out) ·
`riviera-plan-doc` (this template — forced a seam per AC, the module-ownership table for a rule
that `venue` stores and `booking` decides, and the parity note for the calendar's changed today
behaviour) · `tdd` (each phase red first at the named seam: the cutoff unit test, the migration IT,
the SPI IT, the controller ITs, the Vitest specs, the mocked e2e) · `riviera-review-overlay`
(review gate — due at ready-for-review) · `riviera-docs-freshness` (**ran** over
`10faa3a4..HEAD` as the pre-merge smoke: four findings, all patched in place — `JdbcBookingPresence`'s
and `JdbcBookingPresenceIT`'s "four probes / two questions" (five and three now), the list IT's
"ordered rating desc" comment (open venues first), and the calendar endpoint's "reports availability,
not bookability" Javadoc (the per-day verdict rides beside the counts); the rename grep found the
widened `SalesWindow#isOpen` cited nowhere outside the tree; the counting sweep over probe, closure,
sales-window, catalogue-read and rejection vocabulary found nothing else stale; the frontend skill's
frozen-edge table is unchanged (the card imports the chip from `shared/`); `docs/plans/pinned-cells.md`
retired with no citation outside `docs/plans/`) · `grilling` (the intake questions answered from the code; the
product-flavoured calls — the counts' definition, the rejection of a reopen date not after today,
the closed-last ordering done server-side, the closure kept as stored state after an automatic
reopen — are recorded as resolved assumptions below) · `riviera-local-debug` (clone unshallowed;
system Gradle on the JDK 21 daemon compiling on the JDK 25 toolchain; scoped `--tests`; the
structural net after the SPI and vocabulary changes; dockerd present so single IT classes run
locally; the mocked e2e via `PW_CHROMIUM_EXECUTABLE`) · `postgres` (`TIMESTAMPTZ` for
`closed_at`, `DATE` for `reopen_on`, `BOOLEAN NOT NULL DEFAULT FALSE` for the opt-in, one CHECK
naming the state's shape, no index) · `riviera-modulith` (the closure value is `venue.vocabulary`
because it crosses into `booking`; the rule is `booking`'s `BookingCutoff`, reached by `venue`
through the existing `spi` inversion, never a `venue → booking` edge; the counts are one more method
on `BookingPresence`, not a new port; the new endpoint is its own driving adapter with its own port
in `application/`, ownership asserted in the service) · `riviera-java-conventions` (records for the
value and the outcomes, a sealed close outcome, `Optional` never on a field — the closure is a
non-null value with an `open()` state, package-private adapters, the error contract: `VENUE_CLOSED`
422 and `REOPEN_DATE_PASSED` 422 with condition-only details) · `codebase-design` (one rule holder
with three callers — the reserve fence, the catalogue verdict, the badge — is what earns the
extraction into `BookingCutoff`; the SPI stays two methods, not a per-read port) ·
`domain-modeling` (the glossary entry **Closed for season** stated against **Venue visibility**:
visible-and-unsellable versus derived-and-hidden; no ADR — the choice is reversible and follows the
sales-close precedent) · `riviera-frontend` (the chip is a `shared/` presentational primitive because
`pages/home` and `venue/` both render it; the close/reopen HTTP calls join `operator-console.service`
beside the profile read they pair with; nothing new crosses a feature edge) · `angular-developer` +
angular-cli MCP (`get_best_practices` for the workspace at Angular 22 and `search_documentation`
v22 for: `signal`/`computed` (the tab's closure state and the derived copy), `linkedSignal` (the
calendar's roving focus stays as is — verified that its `set` on a linked signal is the documented
override), `resource` (verified and **not** adopted: the tab loads through the existing
`Observable` + epoch pattern and a second loading idiom in one component would be drift),
Signal Forms (`form()`, `[formField]` on `<input type="date">` stores `YYYY-MM-DD` strings and on
`<input type="checkbox">` binds a boolean — verified, so the season form needs no parsing; `required`
is not applied because a blank date is a legal close), control flow (`@if`/`@for`, `@if … as`) —
nothing changed because of the check beyond confirming the date/checkbox bindings) ·
`riviera-tailwind` (verified against tailwindcss.com: `@theme inline` tokens as named utilities
(`bg-riv-*`, `text-riv-*`), arbitrary values `text-[11px]`, arbitrary variants; no `@apply`/`@utility`
— the chip shares its skin through the existing `appSemanticChip` directive; the season card reuses
the Venue tab's card and field classes verbatim; touch targets via `appTouchTarget`; the console
paints no `white`/`black` literals) · `playwright-cli` (the mocked spec follows
`operator-venue.e2e.ts`'s stateful `page.route` pattern; suite placement per RV-FE-E2E: the CI-safe
mocked suite, the ticket names no real-backend spec).

**Branch:** `claude/riviera-close-reopen-endpoint-2ehglz` (the session's designated remote branch
stands in for `feature/closed-for-season`, per the `riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

> These ACs ARE the pre-agreed seams. *Seam* names the public boundary the test observes through.

- [x] **AC-1:** Given V51 has run, when a venue row is inserted, then `closed_at`, `reopen_on` and
  `advance_sales` exist, `advance_sales` defaults `false`, and the CHECK refuses `reopen_on` or
  `advance_sales = true` on an open venue and `advance_sales = true` without `reopen_on`.
  *Seam:* the `venue` table through Flyway · *Pinned by:* `SeasonClosureMigrationIT`
- [x] **AC-2:** Given a closure reopening on 2027-05-15 with the opt-in off, when asked at
  2027-05-14 23:59 `Europe/Tirane`, then the closure is in effect and admits no date; with the opt-in
  on it admits 2027-05-20 and refuses 2027-05-14; at 2027-05-15 00:00 `Europe/Tirane` (22:00Z the
  day before) it is no longer in effect and admits every date; a closure with no reopen date is in
  effect until reopened by hand. *Seam:* `booking.application.BookingCutoff` (the module-wide
  day-boundary authority) · *Pinned by:* `BookingCutoffTest.seasonClosure*`
- [x] **AC-3:** Given the owning operator, when they `PUT /api/venues/{venueId}/season-closure` with
  `{reopenOn, advanceSales}` or `{reopenOn: null, advanceSales: false}`, then `200` with
  `closedForSeason: true`, the stored values, and `futureBookings` / `pendingRequests` counting the
  venue's bookings dated today (`Europe/Tirane`) or later; a non-owner gets `403 NOT_VENUE_OWNER`; a
  reopen date not after today gets `422 REOPEN_DATE_PASSED`; the opt-in without a date gets
  `400 INVALID_REQUEST`. *Seam:* `PUT /api/venues/{venueId}/season-closure` · *Pinned by:*
  `SeasonClosureControllerIT`
- [x] **AC-4:** Given a closed venue, when its owner `DELETE`s the closure, then `204`, the profile
  reads open, and the closure columns are cleared; a non-owner gets `403`. *Seam:*
  `DELETE /api/venues/{venueId}/season-closure` + `GET …/profile` · *Pinned by:*
  `SeasonClosureControllerIT`
- [x] **AC-5:** Given a closed venue and an open one, when the tourist list is read for a date, then
  the closed venue carries `closedForSeason: true`, `reopensOn`, `salesOpen: false`, and sorts after
  every open venue whatever its rating; with the opt-in on and a date on or after the reopen date it
  reads `salesOpen: true` and still `closedForSeason: true`. *Seam:* `VenueCatalog#listVenues` via
  `GET /api/venues?date=` · *Pinned by:* `SeasonClosureCatalogIT`
- [x] **AC-6:** Given a closed venue, when its map is read, then `200` with sets, photos and
  `salesOpen: false`, `closedForSeason: true`; an opted-in date on or after the reopen date reads
  `salesOpen: true`. *Seam:* `VenueCatalog#findVenueMap` via `GET /api/venues/{id}?date=` ·
  *Pinned by:* `SeasonClosureCatalogIT`
- [x] **AC-7:** Given a closed venue, when its calendar is read, then every day carries
  `salesOpen: false` with its counts unchanged; with the opt-in on, days on or after the reopen date
  carry `true`. *Seam:* `VenueCatalog#availabilityBetween` via
  `GET /api/venues/{id}/availability-calendar` · *Pinned by:* `SeasonClosureCatalogIT` (the verdict)
  + `VenueAvailabilityCalendarControllerTest` (the wire field)
- [x] **AC-8:** Given a closure reopening on date R, when the clock stands at R 00:00
  `Europe/Tirane` (the previous day 22:00Z in May), then the list and map read the venue open
  (`closedForSeason: false`, `salesOpen: true`) with nothing written. *Seam:*
  `VenueCatalog#listVenues` · *Pinned by:* `SeasonClosureCatalogIT.reopensByItselfOnTheReopenDate`
- [x] **AC-9:** Given a closed venue, when a guest posts a reserve for one of its online sets (an
  INSTANT venue and a REQUEST venue), then `422 VENUE_CLOSED` and no availability row; an opted-in
  date on or after the reopen date reserves normally; a hidden venue still answers
  `404 NO_SUCH_SET`. *Seam:* `CreateBooking#create` via `POST /api/bookings` · *Pinned by:*
  `SeasonClosureReserveIT` + `CreateBookingServiceTest`
- [x] **AC-10:** Given a venue with a confirmed booking, a staff hold and a pending request dated
  today or later, when the owner closes it, then the response counts the booking and the request,
  every row keeps its status, and the staff walk-in mark and the daily view still work. *Seam:*
  `PUT …/season-closure` + `POST …/sets/{setId}/availability` + `GET …/bookings` · *Pinned by:*
  `SeasonClosureControllerIT`
- [x] **AC-11:** Given bookings of every status across dates, when `liveBookingsFrom(venue, today)`
  is asked, then `futureBookings` counts `CONFIRMED` + `AWAITING_PAYMENT` dated today or later,
  `pendingRequests` counts `PENDING_REQUEST` dated today or later, and terminal or past rows count
  nowhere. *Seam:* `venue.spi.BookingPresence` · *Pinned by:*
  `JdbcBookingPresenceIT.liveBookingsFromCountsWhatAGuestIsStillOwed`
- [x] **AC-12:** Given a closed venue, when its reviews page and a photo are read, then both answer
  `200`. *Seam:* `GET /api/venues/{id}/reviews`, `GET /api/venues/{id}/photos/{hash}` · *Pinned by:*
  `SeasonClosureCatalogIT`
- [x] **AC-13:** Given a summary with `closedForSeason: true` and `reopensOn`, when the Discover list
  renders, then the card wears the "Closed for season · reopens 15 May" chip, its accessible name
  carries the closure, cards keep the served order, and a summary without the field is unbadged.
  *Seam:* `HomePage` through the mocked `GET /api/venues` · *Pinned by:* `home.spec.ts` +
  `closed-for-season-chip.spec.ts` / `.a11y.spec.ts` / `.contrast.spec.ts`
- [x] **AC-14:** Given a map with `closedForSeason: true, salesOpen: false`, when the venue page
  renders, then the header wears the chip, the closed-for-season notice replaces the sales-closed
  copy, and no tile is selectable. *Seam:* `VenueMap` through the mocked `GET /api/venues/{id}` ·
  *Pinned by:* `venue-map.spec.ts` + `venue-map.a11y.spec.ts`
- [x] **AC-15:** Given calendar days with `salesOpen: false`, when the picker renders, then those
  days are not selectable, draw no bar and speak "not bookable"; a day without the field keeps
  today's behaviour. *Seam:* `AvailabilityCalendar` through the mocked calendar read · *Pinned by:*
  `availability-calendar.spec.ts`
- [x] **AC-16:** Given the owner's profile, when the Venue tab renders, then an open venue shows the
  season card with "Close for season"; opening it reveals the reopen-date field and, once a date is
  set, the advance-sales checkbox; confirming `PUT`s `{reopenOn, advanceSales}` and the card shows
  the closed state with the counts; "Reopen now" `DELETE`s and the card returns to open; 403 and 422
  show their copy. *Seam:* `VenueTab` through the mocked profile and closure routes · *Pinned by:*
  `venue-tab.spec.ts` + `venue-tab.a11y.spec.ts` + `venue-tab.contrast.spec.ts`
- [x] **AC-17:** Given a reserve refused `VENUE_CLOSED`, when the booking dialog renders the
  failure, then it says the venue is closed for the season. *Seam:* `BookingDialog` through the
  mocked `POST /api/bookings` · *Pinned by:* `booking-dialog.spec.ts`
- [x] **AC-18:** Given the mocked console, when the operator closes with a reopen date, then the
  Discover list badges the venue and orders it last, and reopening clears the badge; axe clean on
  the tab and the list. *Seam:* the browser through `page.route` · *Pinned by:*
  `frontend/e2e/operator-venue-season.e2e.ts`
- [x] **AC-19:** `CONTEXT.md` gains **Closed for season** (visible-and-unsellable, distinct from
  **Venue visibility**); `RESPONSIBILITIES.md` § `venue` (the closure paragraph, the endpoint, the
  projection) and § `booking` (`BookingCutoff` and the reserve fence) updated;
  `docs/architecture/domain-model.md` § 3.1 shows the columns. *Seam:* the substrate docs ·
  *Pinned by:* `riviera-docs-freshness` at the pre-merge smoke

## Non-goals

- A sweep or scheduler for the reopen date — reads compare dates (epic decision).
- Refunding or moving bookings on close — closing touches no booking; #1033–#1035 own that.
- An admin surface for closures, or closing a venue on the operator's behalf.
- Effective-dated closures (close from date X), or a second closure window.
- Hiding a closed venue — that is venue visibility, derived from the operator's status, and stays.
- A version token on the closure endpoint — a replace-in-full of three fields whose stale form
  cannot silently reopen anything: closing twice re-closes, reopening is idempotent.
- Changing the calendar's server contract for past days beyond adding the verdict.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` One adjacent behaviour changes and is recorded here rather
than hidden: the tourist calendar today lets the current day be chosen until Tirane midnight even
after the venue's sales close (the picker gates on `minDate` alone). With the per-day verdict it
becomes unselectable once the server says today's window has shut — the same fact the map already
shows as the closed banner. Preserved: past days stay unselectable client-side (`minDate`), a day
whose payload lacks the field keeps today's behaviour, counts and the bar are unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The closure rule is stated twice — once for the catalogue verdict, once for the reserve fence — and drifts (invariant #4) | med | high | one holder, `BookingCutoff`, reached by `venue` through `SalesWindow`; `BookingCutoffSalesWindowTest` pins the delegation, `SeasonClosureCatalogIT` and `SeasonClosureReserveIT` pin the same boundary instant | agent | closed — `6669d155` |
| R-2 | Reopen-date arithmetic in the JVM zone (invariant #6): the boundary is R 00:00 `Europe/Tirane`, 22:00Z the day before in May | med | high | `LocalDate.ofInstant(now, TIRANE)`; unit test at 21:59Z / 22:00Z on 14 May; IT with a mocked Clock at both instants | agent | closed — `6669d155` |
| R-3 | A stale closure row after an automatic reopen misleads a later read | low | med | every read derives closed-ness through the rule (`closedForSeason(closure, now)`), never from `closed_at IS NOT NULL`; the profile response carries the verdict beside the stored values | agent | closed — `37d467d8` |
| R-4 | BOLA on the new venue-scoped endpoint (invariant #13) | low | high | `assertOwns` is the service's first act; `SeasonClosureControllerIT` pins 403 for a foreign operator on both verbs; `EndpointRoleGateCoverageTest` pins the OPERATOR matcher | agent | closed — `37d467d8` |
| R-5 | The counts race a concurrent reserve (a booking lands between the write and the count) | low | low | acceptable: the counts are informational; both run in one read-committed transaction after the write, and the response says "still stand" | agent | closed — `37d467d8` |
| R-6 | Widening `SalesWindow`, `SetBookingInfo`, `VenueSummaryView`, `VenueMapView`, `DailyAvailability`, `VenueProfileView` breaks every test fake and constructor call | high | low | the blast radius is enumerated in File structure (eight `SetBookingInfo` test callers, two `BookingPresence` fakes, one `DailyAvailability` controller test, one `VenueProfileView` service test); compile is the net | agent | closed — `f37442ce` |
| R-7 | Error contract: `VENUE_CLOSED` and `REOPEN_DATE_PASSED` details must state the condition, not a remedy (`riviera-java-conventions` §6b) | low | med | "The venue is closed for the season on this date." / "The reopen date is not after today." | agent | closed — `f37442ce` |
| R-8 | Flyway V51 collides with an in-flight PR | low | med | free on `main` at `10faa3a`; the one open PR (#1047) is frontend-only; the branch that merges second renumbers | agent | closed — V51 landed with no other migration in flight (#1047 carried none) |
| R-9 | The mocked Clock bean in the catalogue/reserve ITs starves a clock-backed edge bean (rate limiter, challenge registry) | med | med | the ITs read the clock through `when(clock.instant())` with a fixed instant per test and `getZone()` UTC, exactly as `VenueAvailabilityCalendarControllerTest`; logins use `SessionLoginSupport.uniqueClientIp()`; the reserve IT is driven through the same fenced-create helper the booking ITs use | agent | closed — `f37442ce` |
| R-10 | The frontend gates on a client clock (the house rule: clients never compare with a clock) | low | med | the badge keys on `closedForSeason`, the tiles and calendar on `salesOpen` — both server verdicts; `reopensOn` is display copy | agent | closed — `9a470e10` |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** "future bookings" = bookings a guest may still turn up on that are not requests
  (`CONFIRMED`, `AWAITING_PAYMENT`) dated today or later in `Europe/Tirane`; "pending requests" =
  `PENDING_REQUEST` dated today or later. Terminal rows and past dates count nowhere. `booking`
  decides the statuses. — *Owner:* agent · *Resolved:* `37d467d8` (`JdbcBookingPresence#liveBookingsFrom`; the console copy says "still stand").
- **Assumption:** a reopen date must be **after** today (`Europe/Tirane`); otherwise `422
  REOPEN_DATE_PASSED`. A closure that would be over the moment it is written is a mistake worth
  refusing. — *Owner:* agent · *Resolved:* `37d467d8`.
- **Assumption:** closed venues sort after open ones **server-side**, inside `listVenues` (open
  first, then rating desc, name asc), because the verdict needs the clock the server holds and the
  client must not re-sort on a fact it cannot derive. — *Owner:* agent · *Resolved:* `f37442ce`.
- **Assumption:** after the reopen date passes, the stored closure stays on the row until the
  operator closes again or reopens by hand; every read derives the open state through the rule
  (R-3). The Venue tab shows the open state with a "Close for season" control. — *Owner:* agent ·
  *Resolved:* `37d467d8`.
- **Assumption:** the profile response carries `seasonClosure: {closed, reopenOn, advanceSales}`
  where `closed` is the verdict at read time and the other two are the stored values — so the tab
  keys on `closed` and never compares dates. — *Owner:* agent · *Resolved:* `37d467d8`.
- **Assumption:** the PR is opened once the plan's ACs are checked off (the brief's rule), not at
  the first phase commit as `riviera-sdlc` prefers; CI runs on the PR event, so the phases are
  verified locally with scoped runs and the first CI run comes at PR time. — *Owner:* agent ·
  *Resolved:* the PR opens after phase 4's commit with every AC ticked.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged — online reserve (refused
  earlier for a closed date, before any claim), staff tap-to-mark (untouched by closing), the
  cancellation, decline, expiry and withdraw releases. Closing writes **no** availability row and
  releases none.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` — untouched.
- **Concurrency strategy:** unchanged; the fence runs before the `INSERT … ON CONFLICT` claim in
  the same `ReserveSetService` transaction, the same place the sales-close fence already runs. A
  closure written while a reserve is mid-transaction does not roll the reserve back: a booking that
  won its claim before the close stands, and closing answers with it in the counts.
- **Pool rule (invariant #3):** unchanged; the fence sits after the pool check, before the claim.
- **Cutoff rule (invariant #4):** the venue's `sales_close` fence on D stays exactly where it is;
  the closure is a second, earlier arm of the same `BookingCutoff` authority: a date sells iff the
  closure admits it **and** D's sales close has not passed. Both arms read one instant.
- **Pinning test:** `ConcurrentReservationIT` (existing, unchanged) still proves two reserves of one
  `(set, date)` cannot both succeed; `SeasonClosureReserveIT.closedDateIsRefusedBeforeAnyClaim`
  proves the refusal leaves no availability row.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue` (`closed_at`, `reopen_on`, `advance_sales`) | Job: the venue profile and its sales settings (sales close is the precedent); the owner-asserted endpoint lives with the other venue-scoped writes |
| M-2 | `booking` | existing | none | Job: `BookingCutoff` is the day-boundary authority — whether a closure is in effect and admits a date is that rule's second arm; the counts are its table's fact |
| M-3 | root (`SecurityConfig`) | existing | none | the two new matchers on the edge chain |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#setBookingInfo(s)` (unchanged signature; `SetBookingInfo` gains `seasonClosure`) | `SeasonClosure` (new, `venue.vocabulary`) | `booking` |
| NI-2 | `venue.spi` | `SalesWindow#isOpen(LocalTime, SeasonClosure, LocalDate, Instant)` (widened) + `#closedForSeason(SeasonClosure, Instant)` (new) | `SeasonClosure` | implemented by `booking` (`BookingCutoffSalesWindow`), called by `venue`'s catalogue adapters |
| NI-3 | `venue.spi` | `BookingPresence#liveBookingsFrom(VenueId, LocalDate)` (new method) | `LiveBookingCounts` (new, `venue.vocabulary`) | implemented by `booking` (`JdbcBookingPresence`), called by `venue`'s `SeasonClosureService` |

No grant changes: `booking` already lists `venue::api`, `venue::vocabulary`, `venue::spi`;
`venue` gains no dependency.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event.` Closing is a venue setting, not a lifecycle fact another module acts on;
nothing accrues, refunds or mails.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| store the closure (closed-at, reopen-on, opt-in) and the owner-asserted close/reopen write | `venue` | `venue` Job: "the sales-close setting" and every venue-scoped write; not `booking` (its Not-My-Job: "the venue map, pricing, or pool rules → venue") |
| decide whether a closure is in effect at an instant and whether it admits a date | `booking` | `booking` Job: `BookingCutoff` "is the module-wide day-boundary authority"; `venue`'s settled rule: "the port returns the verdict, never a close instant — I store the time and display the answer, `booking` keeps the rule" |
| project `salesOpen` / `closedForSeason` / `reopensOn` on the list, map and calendar; order closed venues last | `venue` | `venue` Job: the catalogue reads "project the open/closed verdict … through my `spi` port `SalesWindow`" — the same paragraph, one more input |
| count future bookings and pending requests | `booking` | sole owner/reader of `booking`; `venue` "never enumerates booking statuses" — the SPI answers a count, the statuses stay inside |
| refuse a closed date on reserve with `VENUE_CLOSED` | `booking` | `booking` Job: the reserve paths and their fences (`BOOKING_CLOSED`, `NO_SUCH_SET` for a hidden venue); the closure is one more refusal before the claim |
| the OPERATOR role gate on the two routes | root | the platform edge owns the security chain; the ownership check stays in the service (invariant #13) |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` Closing moves no money, publishes no event and touches no ledger
row; the epic's refunds arrive with #1034/#1035.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/venue-views.ts` | existing | model | — | — |
| FE-2 | `shared/closed-for-season-chip.ts` (+ `.spec`, `.a11y.spec`, `.contrast.spec`) | new | standalone component (attribute-less element, `class: 'contents'`), wears `appSemanticChip` | `input()` for `reopensOn`, `computed()` label | — |
| FE-3 | `pages/home/home.ts` / `.html` / specs | existing | component | `computed()` card view gains `closedForSeason`, `reopensOn` | — |
| FE-4 | `venue/venue-map.ts` / `.html` / specs | existing | component | `computed()` `closedForSeason`; the notice branches on it | — |
| FE-5 | `venue/availability-calendar.ts` / `day-availability.ts` / specs | existing | component + pure helpers | `computed()` weeks; `selectable` reads the day's `salesOpen` | — |
| FE-6 | `booking/booking.model.ts`, `booking.service.ts`, `booking-dialog.ts` / spec | existing | model + service + component | the `VENUE_CLOSED` code and its copy | — |
| FE-7 | `operator/operator-console.model.ts`, `operator-console.service.ts` / spec | existing | model + `@Service` | `closeForSeason()`, `reopenForSeason()`; the profile view's `seasonClosure` | — |
| FE-8 | `operator/venue-tab.ts` / `.html` / specs | existing | component | signals for the season card (`seasonClosure`, `seasonOpen`, `seasonBusy`, `seasonError`, `seasonCounts`), `focusMover()` on the confirm legs | Signal Forms: `form(signal({reopenOn: '', advanceSales: false}))`, `[formField]` on a date input and a checkbox |
| FE-9 | `frontend/e2e/operator-venue-season.e2e.ts` | new | mocked Playwright spec | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. No deviation.

## FE↔BE contract

- **New endpoints:**
  - `PUT /api/venues/{venueId}/season-closure` — body `{ "reopenOn": "2027-05-15" | null,
    "advanceSales": boolean }` → `200 { "closedForSeason": true, "reopenOn": "2027-05-15" | null,
    "advanceSales": boolean, "futureBookings": int, "pendingRequests": int }`; `403 NOT_VENUE_OWNER`,
    `404 NO_SUCH_VENUE`, `422 REOPEN_DATE_PASSED`, `400 INVALID_REQUEST` (bad date, opt-in without
    a date).
  - `DELETE /api/venues/{venueId}/season-closure` → `204`; `403`, `404 NO_SUCH_VENUE`.
- **Changed responses:**
  - `GET /api/venues` items and `GET /api/venues/{id}`: `+ closedForSeason: boolean, reopensOn:
    "YYYY-MM-DD" | null` (`reopensOn` non-null only while closed with a date); `salesOpen` now
    folds the closure in. Closed venues come last in the list.
  - `GET /api/venues/{id}/availability-calendar` items: `+ salesOpen: boolean`.
  - `GET /api/venues/{id}/profile`: `+ seasonClosure: { closed: boolean, reopenOn: "YYYY-MM-DD" |
    null, advanceSales: boolean }`.
  - `POST /api/bookings`: new rejection `422 VENUE_CLOSED`.
- **Client typing:** hand-written typed mirrors in `shared/venue-views.ts`,
  `operator/operator-console.model.ts`, `booking/booking.model.ts`; every new field optional on the
  read models (test doubles and older payloads), required on the write body. No `as any`.
- **Money/date on the wire:** dates as ISO `LocalDate` strings; no money moves.

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** phase 2 — red `CreateBookingServiceTest` (`VENUE_CLOSED`), `SeasonClosureCatalogIT`, `SeasonClosureReserveIT`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V51 + `SeasonClosure` + the `BookingCutoff` arm + `SalesWindow` widened | ✅ | `6669d155` |
| 1 — close/reopen endpoint, `SeasonClosureService`, `Venues` writes, `LiveBookingCounts` + `BookingPresence#liveBookingsFrom`, profile carries the closure, security matchers, ITs | ✅ | `37d467d8` |
| 2 — catalogue projection (list order, map, calendar `salesOpen`), `SetBookingInfo` closure, `VENUE_CLOSED` fence, ITs with the movable clock, structural net | ⏳ | |
| 3 — frontend: models, chip, Discover card, map notice, calendar, booking copy, Venue tab season card, specs + a11y + contrast, mocked e2e | | |
| 4 — docs: `CONTEXT.md`, `RESPONSIBILITIES.md`, domain-model, `CLAUDE.md` row, package Javadocs; retire `pinned-cells.md`; PR | ✅ | `3e954827`; `origin/main` (#1047) merged in `28f9c5bb` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (Repo hygiene, first push) | the plan's File structure did not list the two files the docs-freshness sweep patched (`VenueReadController`, `VenueListControllerIT`) | fixed in `cf3426b9` |
| F-2 | review (reviewers #4 and #5, RV-STYLE-1) | the new `closeForSeason`/`reopenForSeason` methods were inserted between `closeOnlineSalesNow` and its TSDoc, orphaning the block | fixed in the review-fix commit — the methods follow `closeOnlineSalesNow` |
| F-3 | review (reviewer #5, RV-STYLE-1) | the season tests in `VenueAdminServiceTest` were inserted between `MultiOwnership` and its Javadoc | fixed in the review-fix commit — the tests precede the Javadoc |
| F-4 | review (reviewer #4, cosmetic) | `WebSliceStubs`' four new imports out of alphabetical order | fixed in the review-fix commit |
| F-5 | review (reviewer #3) | the calendar's `focusedDate` doc said the position falls to the floor "when that day can no longer be booked", while a chosen day the server marks unsellable keeps the position — the truthful behaviour, since a season closure can leave no bookable day to fall to and the month must not jump | fixed in the review-fix commit — the TSDoc states the rule; behaviour unchanged |

---

## File structure

**Backend — new**
- `platform/src/main/resources/db/migration/V51__venue_season_closure.sql` — the three columns + CHECK
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SeasonClosure.java` — the published closure value (`open()` / `closed(reopenOn, advanceSales)`), mirrors the CHECK
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/LiveBookingCounts.java` — `(futureBookings, pendingRequests)`
- `platform/src/main/java/ai/riviera/platform/venue/application/CloseForSeason.java` — driving port: `close(operator, venue, closure)` / `reopen(operator, venue)`
- `platform/src/main/java/ai/riviera/platform/venue/application/CloseOutcome.java` — sealed: `Closed(SeasonClosure, LiveBookingCounts)` / `Rejected(reason)`
- `platform/src/main/java/ai/riviera/platform/venue/application/SeasonClosureRejection.java` — `NO_SUCH_VENUE`, `REOPEN_DATE_PASSED`
- `platform/src/main/java/ai/riviera/platform/venue/application/ReopenOutcome.java` — `REOPENED`, `NO_SUCH_VENUE`
- `platform/src/main/java/ai/riviera/platform/venue/application/SeasonClosureService.java` — assertOwns → exists → date check → write → counts
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SeasonClosureController.java` — `PUT`/`DELETE /api/venues/{venueId}/season-closure`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SeasonClosureRequest.java` — `{reopenOn, advanceSales}` → `SeasonClosure`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SeasonClosureResponse.java` — the close response
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SeasonClosureView.java` — the profile's `{closed, reopenOn, advanceSales}`
- `platform/src/test/java/ai/riviera/platform/venue/SeasonClosureMigrationIT.java`
- `platform/src/test/java/ai/riviera/platform/venue/SeasonClosureControllerIT.java`
- `platform/src/test/java/ai/riviera/platform/venue/SeasonClosureCatalogIT.java` — list/map/calendar/reviews/photo with a mocked Clock crossing the reopen date
- `platform/src/test/java/ai/riviera/platform/venue/vocabulary/SeasonClosureTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/SeasonClosureReserveIT.java`

**Backend — modified**
- `platform/src/main/java/ai/riviera/platform/venue/spi/SalesWindow.java` — widened `isOpen`, new `closedForSeason`
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — `liveBookingsFrom`
- `platform/src/main/java/ai/riviera/platform/venue/spi/package-info.java` — the inventory sentence
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetBookingInfo.java` — `+ seasonClosure`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueSummaryView.java` — `+ closedForSeason, reopensOn`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — `+ closedForSeason, reopensOn`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/DailyAvailability.java` — `+ salesOpen`
- `platform/src/main/java/ai/riviera/platform/venue/api/VenueCatalog.java` — ordering + verdict contract
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `closeForSeason`, `reopenForSeason`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileView.java` — `+ seasonClosure, closedForSeason`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the two writes, the profile read
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — the projection, the order, the calendar verdict
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcSetBookingFacts.java` — the closure columns
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — `+ seasonClosure`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/DailyAvailabilityView.java` — `+ salesOpen`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReadController.java` — the calendar endpoint's Javadoc (docs-freshness patch)
- `platform/src/main/java/ai/riviera/platform/booking/application/BookingCutoff.java` — `closedForSeason`, `admitsDate`, the four-arg `isBookable`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/BookingCutoffSalesWindow.java` — the two delegations
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — the counts query
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ReserveSetService.java` — the fence
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/BookingOutcome.java` — `VENUE_CLOSED`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingController.java` — the 422 mapping
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — `SEASON_CLOSURE_PATH` PUT/DELETE
- `platform/src/test/java/ai/riviera/platform/booking/application/BookingCutoffTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/BookingCutoffSalesWindowTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java`
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/BookingCreationViewsContractTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancelBookingServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancellationPolicyTermsTest.java`
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/notification/application/BookingMailFactsServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/notification/application/MailDeliveryLookupServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapReadServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/application/LiveClaimsTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/VenueAvailabilityCalendarControllerTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/VenueAvailabilityCalendarIT.java`
- `platform/src/test/java/ai/riviera/platform/venue/VenueListControllerIT.java` — the ordering comment (docs-freshness patch)
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the inert `CloseForSeason` bean the web slices need

**Frontend — new**
- `frontend/src/app/shared/closed-for-season-chip.ts` · `.spec.ts` · `.a11y.spec.ts` · `.contrast.spec.ts`
- `frontend/e2e/operator-venue-season.e2e.ts`

**Frontend — modified**
- `frontend/src/app/shared/venue-views.ts`
- `frontend/src/app/shared/booking-date.ts` · `booking-date.spec.ts` — `formatDayMonth` for the badge
- `frontend/src/app/pages/home/home.ts` · `home.html` · `home.spec.ts` · `home.a11y.spec.ts`
- `frontend/src/app/venue/venue-map.ts` · `venue-map.html` · `venue-map.spec.ts` · `venue-map.a11y.spec.ts`
- `frontend/src/app/venue/availability-calendar.ts` · `availability-calendar.spec.ts` · `day-availability.ts` · `day-availability.spec.ts`
- `frontend/src/app/booking/booking.model.ts` · `booking.service.ts` · `booking.service.spec.ts` · `booking-dialog.ts` · `booking-dialog.spec.ts`
- `frontend/src/app/operator/operator-console.model.ts` · `operator-console.service.ts` · `operator-console.service.spec.ts`
- `frontend/src/app/operator/venue-tab.ts` · `venue-tab.html` · `venue-tab.spec.ts` · `venue-tab.a11y.spec.ts` · `venue-tab.contrast.spec.ts`
- `frontend/e2e/operator-venue.e2e.ts` (the profile fixture gains `seasonClosure`)

**Docs**
- `CONTEXT.md` — **Closed for season**
- `RESPONSIBILITIES.md` — § `venue`, § `booking`, § *Invariants, long form* #4
- `docs/architecture/domain-model.md` — § 3.1 columns
- `CLAUDE.md` — the `venue` row ("season closure")
- `.claude/skills/riviera-frontend/SKILL.md` — only if a frozen-edge count changes (expected: no)
- `docs/plans/closed-for-season.md` — this plan
- `docs/plans/pinned-cells.md` — retired (deleted) at close-out

---

## Phase 0 — Schema, vocabulary, the rule, the SPI

**Files:** Create `V51__venue_season_closure.sql`, `SeasonClosure.java`, `LiveBookingCounts.java`,
`SeasonClosureMigrationIT`, `SeasonClosureTest` · Modify `BookingCutoff`, `BookingCutoffTest`,
`SalesWindow`, `BookingCutoffSalesWindow`, `BookingCutoffSalesWindowTest`, `JdbcVenueCatalog`
(compile only: pass `SeasonClosure.open()` until phase 2 reads the columns), `BookingPresence` +
its two test fakes.

- [ ] **Step 1: Write the failing tests** — `BookingCutoffTest.seasonClosure*` (AC-2: the four
  boundary cases at 2027-05-14T21:59Z / 22:00Z, the no-date closure, the opt-in), `SeasonClosureTest`
  (the value refuses an opt-in without a date and an open closure with either), `SeasonClosureMigrationIT`
  (AC-1), `BookingCutoffSalesWindowTest` (the two delegations).
- [ ] **Step 2: Run, verify red** — `gradle --no-daemon --console=plain test --tests "*BookingCutoffTest*" --tests "*SeasonClosureTest*"` → compile failure naming `SeasonClosure`.
- [ ] **Step 3: Minimal implementation** — the migration, the record with its compact constructor,
  `BookingCutoff#closedForSeason(closure, now)` / `#admitsDate(closure, date, now)` /
  `#isBookable(salesClose, closure, date, now)`, the widened SPI and its adapter, the counts record and
  the new SPI method (adapter implemented in phase 1; fakes return zero).
- [ ] **Step 4: Run, verify green** — the same command plus `--tests "*SeasonClosureMigrationIT*"` and `--tests "*BookingCutoffSalesWindowTest*"`.
- [ ] **Step 5: Generalization audit** — population: every caller of `SalesWindow#isOpen` and every constructor of `SetBookingInfo` (`grep -rn "isOpen(\|new SetBookingInfo(" platform/src`); decision: all updated in the phase that owns them.
- [ ] **Step 6: Commit** — `Add the season-closure value, its cutoff rule and the widened sales window (#1028)`
- [ ] **Step 7: Update the execution status.**

## Phase 1 — The close/reopen endpoint with counts

**Files:** Create `CloseForSeason`, `CloseOutcome`, `SeasonClosureRejection`, `ReopenOutcome`,
`SeasonClosureService`, `SeasonClosureController`, `SeasonClosureRequest`, `SeasonClosureResponse`,
`SeasonClosureView`, `SeasonClosureControllerIT` · Modify `Venues`,
`JdbcVenues`, `VenueProfileView`, `VenueProfileResponse`, `JdbcBookingPresence`,
`JdbcBookingPresenceIT`, `SecurityConfig`, `VenueAdminServiceTest`.

- [ ] **Step 1: Failing tests** — `VenueAdminServiceTest` (the closure service beside the profile service: assertOwns first, `NO_SUCH_VENUE`,
  `REOPEN_DATE_PASSED` at a Tirane boundary, the counts passed through), `JdbcBookingPresenceIT`
  (AC-11), `SeasonClosureControllerIT` (AC-3, AC-4, AC-10: seeds a venue owned by the bootstrap
  operator, a confirmed booking, a pending request, a staff hold, a past booking, a cancelled one;
  a second operator for the 403).
- [ ] **Step 2: Red** — `gradle … test --tests "*VenueAdminServiceTest*"` → compile failure.
- [ ] **Step 3: Implementation** — service (Tirane today from the injected Clock), adapter writes
  (`UPDATE venue SET closed_at = :closedAt, reopen_on = :reopenOn, advance_sales = :advanceSales WHERE id = :id`
  and the clearing twin), the profile read + response, the counts SQL with `COUNT(*) FILTER`, the
  controller, the two matchers.
- [ ] **Step 4: Green** — the three classes one at a time; then `--tests "*EndpointRoleGateCoverageTest*" --tests "*VenueWriteRoleGateTest*"`.
- [ ] **Step 5: Generalization audit** — population: every `/api/venues/*/…` non-GET matcher in `SecurityConfig` (`grep -n "hasRole(OPERATOR_ROLE)" SecurityConfig.java`) — the new pair joins the PUT block; every `@RestController` under `venue/adapter/in` reads the principal through `CurrentOperator#require` — the new one does.
- [ ] **Step 6: Commit** — `Close and reopen a venue for the season on its own owner-asserted endpoint, answering the counts (#1028)`
- [ ] **Step 7: Update the execution status.**

## Phase 2 — The projection and the reserve fence

**Files:** Modify `JdbcVenueCatalog`, `VenueCatalog`, `VenueSummaryView`, `VenueMapView`,
`DailyAvailability`, `DailyAvailabilityView`, `JdbcSetBookingFacts`, `SetBookingInfo`,
`ReserveSetService`, `BookingOutcome`, `BookingController`, the eight `SetBookingInfo` test
callers, `BeachMapReadServiceTest`, `VenueAvailabilityCalendarControllerTest`,
`VenueAvailabilityCalendarIT` · Create `SeasonClosureCatalogIT`, `SeasonClosureReserveIT`.

- [ ] **Step 1: Failing tests** — `SeasonClosureCatalogIT` (AC-5–8, AC-12 with `@MockitoBean Clock`
  at 2027-05-14T21:59Z and 22:00Z), `SeasonClosureReserveIT` (AC-9), `CreateBookingServiceTest`
  (the fence's typed outcome), `VenueAvailabilityCalendarControllerTest` (the `salesOpen` field).
- [ ] **Step 2: Red** — `gradle … test --tests "*CreateBookingServiceTest*"` → compile failure on `VENUE_CLOSED`.
- [ ] **Step 3: Implementation** — the catalogue rows read the three columns and build a
  `SeasonClosure`; `salesOpen = salesWindow.isOpen(salesClose, closure, date, now)`,
  `closedForSeason = salesWindow.closedForSeason(closure, now)`, `reopensOn` when closed; the list
  sorts open-first (stable); the calendar reads the venue row once and projects per day;
  `JdbcSetBookingFacts` carries the closure; `ReserveSetService` refuses `VENUE_CLOSED` after the
  visibility and pool checks, before the sales-close arm; the controller maps 422.
- [ ] **Step 4: Green** — the ITs one class at a time; `VenueListControllerIT`, `VenueReadControllerIT`,
  `BookingControllerIT`, `VenueCatalogVisibilityIT` as regression; then **the structural net**.
- [ ] **Step 5: Generalization audit** — population: every read that projects `salesOpen` (`grep -rn "salesOpen\|isOpen(" platform/src/main`); every `error(` arm in `BookingController` for a `Rejected` case (exhaustive switch — the compiler enumerates).
- [ ] **Step 6: Commit** — `Fold the season closure into the sales-open projection and refuse a closed date on reserve (#1028)`
- [ ] **Step 7: Update the execution status.**

## Phase 3 — Frontend

**Files:** per the Angular table above.

- [ ] **Step 1: Failing specs** — `closed-for-season-chip.spec.ts` (+ a11y, contrast), `home.spec.ts`
  (AC-13), `venue-map.spec.ts` (AC-14), `availability-calendar.spec.ts` + `day-availability.spec.ts`
  (AC-15), `venue-tab.spec.ts` (AC-16), `booking-dialog.spec.ts` (AC-17),
  `operator-console.service.spec.ts` (the two calls).
- [ ] **Step 2: Red** — `npm test -- --run src/app/shared/closed-for-season-chip.spec.ts` → module not found.
- [ ] **Step 3: Implementation** — models, the chip, the card and map wiring, the calendar gate, the
  booking copy, the service methods, the Venue tab season card (open → arm → form → confirm; closed →
  counts → reopen; `focusMover()` on both legs; `[appBusy]` on the pressed control; the field error
  for a rejected date via `[appFieldErrorFor]`).
- [ ] **Step 4: Green** — the touched specs; then `npm run lint`, `npm run format:check`, `npm test`,
  `npm run test:a11y`, `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- operator-venue-season` (AC-18), `npm run build`.
- [ ] **Step 5: Generalization audit** — population: every consumer of `salesOpen` in `frontend/src`
  (`grep -rn "salesOpen" frontend/src/app --include=*.ts -l`) — `daily-view-tab.ts` reads the same
  verdict and needs no change; every `BookingErrorCode` switch (`grep -rn "BOOKING_CLOSED" frontend/src/app`).
- [ ] **Step 6: Commit** — `Show a closed-for-season venue as such: the Discover badge, the map notice, the calendar, the Venue tab's close and reopen (#1028)`
- [ ] **Step 7: Update the execution status.**

## Phase 4 — Docs and the PR

- [ ] `CONTEXT.md` **Closed for season**; `RESPONSIBILITIES.md` § `venue` (the closure paragraph
  beside the sales-close one; the endpoint; the projection sentence gains the closure; the
  ordering), § `booking` (`BookingCutoff`'s list gains the closure arm; the reserve paths' refusal
  list gains `VENUE_CLOSED`), § *Invariants* #4 (one sentence); `domain-model.md` § 3.1; `CLAUDE.md`
  venue row; `venue.spi` package Javadoc; retire `docs/plans/pinned-cells.md`.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` and the inline-comment,
  focus-posture and touch-target guards over the diff.
- [ ] Merge latest `origin/main`; open the PR; subscribe; review gate; Sonar gate; close-out.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-09 | phase 0 — `SalesWindow` widened | every caller of the SPI and every `SetBookingInfo` constructor | `grep -rn "\.isOpen(\|new SetBookingInfo(" platform/src` | 2 callers (both in `JdbcVenueCatalog`), 8 constructors (1 main, 7 tests) | all updated in phases 0 and 2 |
| 2026-09-09 | phase 1 — a new operator route | every non-GET `/api/venues/*/…` matcher and every venue controller resolving the principal | `grep -n "hasRole(OPERATOR_ROLE)" SecurityConfig.java`; `grep -rn "currentOperator.require" venue/adapter/in` | the PUT block; 3 controllers | the pair joins the PUT block; the new controller uses `require` |
| 2026-09-09 | phase 1 — a root-edge bean dependency | every `@WebMvcTest` stub set | `grep -rl WebSliceStubs platform/src/test` | one stub configuration | the inert `CloseForSeason` bean added |
| 2026-09-09 | phase 2 — a new `Rejected` arm | every `switch` over `BookingOutcome.Rejected` | the compiler (exhaustive switch) | `BookingController` | mapped to 422 |
| 2026-09-09 | phase 3 — a new `BookingErrorCode` and `salesOpen` consumers | every `BOOKING_CLOSED` switch; every `salesOpen` reader | `grep -rn "BOOKING_CLOSED\|salesOpen" frontend/src/app --include=*.ts -l` | model, service, dialog; home, map, calendar, daily view | the three switches gain `VENUE_CLOSED`; `daily-view-tab` reads the same verdict and needs no change |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `gradle test --tests "*SeasonClosureMigrationIT*"` → 4 pass. Verified at `6669d155`.
- [x] **AC-2:** `gradle test --tests "*BookingCutoffTest*"` → the six `seasonClosure` cases pass. Verified at `6669d155`.
- [x] **AC-3, AC-4, AC-10:** `gradle test --tests "*SeasonClosureControllerIT*"` → 8 pass (403 on both verbs, 422 `REOPEN_DATE_PASSED`, 400 for the opt-in without a date, the staff mark and daily view while closed). Verified at `37d467d8`.
- [x] **AC-5 … AC-8, AC-12:** `gradle test --tests "*SeasonClosureCatalogIT*"` → 6 pass with the movable clock at 2027-05-14T21:59Z / 22:00Z / 2027-05-13T06:00Z. Verified at `f37442ce`.
- [x] **AC-9:** `gradle test --tests "*SeasonClosureReserveIT*" --tests "*CreateBookingServiceTest*"` → pass (422 `VENUE_CLOSED`, no availability row, both modes, the opted-in day, the hidden venue). Verified at `f37442ce`.
- [x] **AC-11:** `gradle test --tests "*JdbcBookingPresenceIT*"` → `liveBookingsFromCountsWhatAGuestIsStillOwed` passes. Verified at `37d467d8`.
- [x] **AC-13 … AC-17:** `npm test` → 244 files, 2974 tests pass; `npm run test:a11y` → 92 files, 979 pass. Verified at `9a470e10`; the four touched surfaces re-run green after the `origin/main` merge (`28f9c5bb`).
- [x] **AC-18:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts operator-venue-season discovery-flow operator-venue.e2e` → 13 pass. Verified at `9a470e10`.
- [x] **AC-19:** `riviera-docs-freshness` ran over `10faa3a4..HEAD` (Skills consulted). Verified at `3e954827`.
- Structural net after phases 1 and 2: green; `EndpointRoleGateCoverageTest`, `VenueWriteRoleGateTest`, `CrossVenueDenialIT`, `VenueAdminControllerIT`, `VenueListControllerIT`, `VenueReadControllerIT`, `BookingControllerIT`, `VenueCatalogVisibilityIT`, `VenueAvailabilityCalendarIT` green as regression.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
