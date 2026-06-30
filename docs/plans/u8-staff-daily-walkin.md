# U8 — Staff daily view + tap-to-mark walk-in — Implementation Plan

**Goal:** A venue operator opens a daily view (a chosen date, default today in
`Europe/Tirane`) and sees that day's confirmed bookings (set + booking code) plus a live
beach map; tapping a **free** set marks it `STAFF_MARKED` for that date (second writer to
the availability source of truth), and tapping a staff-marked set releases it — never
touching an online booking's row.

**Architecture:** The "staff daily view" is a **frontend composition of three
module-owned endpoints**, not a new cross-module backend seam. The `availability` module
gains a staff write path (mark/release) as its first driving (REST) adapter; the `booking`
module gains an operator read for "today's confirmed bookings"; the existing public venue
map read supplies the layout + live availability. Putting a bookings-read inside
`availability` was rejected — `booking` already depends on `availability::api` (the online
claim), so the reverse edge would create a module **cycle**. Each module owns and gates its
own endpoint instead.

**Persistence:** JDBC only (invariant #1). **No new migration** — V4's
`set_availability` CHECK already admits `STAFF_MARKED` and its `UNIQUE(set_id,
booking_date)` is the double-booking guard the staff claim reuses (invariant #2). The
daily-bookings read reuses `booking_venue_id_idx` (V5).

**Source of intent:** GitHub issue **#10**; design spec §4.2 step 2 and §7 (the shared
real-time map both channels write to).

**Skills consulted:**
- `riviera-modulith` — placed the staff write path as the availability module's first
  `infrastructure.in` adapter behind an internal `application.in` driving port; kept the
  bookings read in `booking` to avoid an `availability → booking` cycle; Security/URL
  namespace ≠ module.
- `riviera-java-conventions` — typed-outcome enums (`MarkOutcome`/`ReleaseOutcome`) over
  exceptions, `JdbcClient` + text-block SQL, package-private adapters, `Clock` for the
  Tirane date validation, named state tokens (`STAFF_MARKED`).
- `codebase-design` — `StaffAvailability` is one deep port (mark+release = one purposeful
  conversation); the release guard lives behind it; FE distinguishes tile states from the
  bookings list rather than a new read endpoint (server guard is the real protection).
- `postgres` — confirmed the mark `INSERT … ON CONFLICT (set_id,booking_date) DO NOTHING`
  / guarded `DELETE … state='STAFF_MARKED'` reuse the V4 UNIQUE index, and the daily read
  is served by `booking_venue_id_idx`; **no new migration/index** needed.
- `angular-developer` + angular-cli MCP — standalone signals component, optimistic-but-
  reconciled tap state, WCAG-AA (state not by colour alone, axe + contrast specs).
- `playwright-cli` — CI-safe mocked-a11y e2e for the daily view (correct suite split).

**Branch:** `claude/staff-daily-walkin-l2ljiq` *(exists)*

---

## Acceptance criteria (testable)

- [ ] **AC-1 (availability, headline):** Given a free online-pool set on date D, when a
  staff mark and an online claim race for the same `(set, D)`, then exactly one wins and
  exactly one row exists — never both. *Pinned by:*
  `StaffMarkVsOnlineClaimConcurrencyIT.staffMarkAndOnlineClaimCannotBothWin`
- [ ] **AC-2:** Given a free set on date D, when the operator marks it, then a
  `STAFF_MARKED` row exists for `(set, D)` and the outcome is `MARKED`. *Pinned by:*
  `StaffAvailabilityIT.markingFreeSetSucceeds`
- [ ] **AC-3:** Given a set already held (online or staff) on D, when the operator marks
  it, then the outcome is `ALREADY_TAKEN` and no second row is created. *Pinned by:*
  `StaffAvailabilityIT.markingTakenSetIsRejected`
- [ ] **AC-4:** Given a `STAFF_MARKED` set on D, when the operator releases it, then the
  row is deleted (set returns to FREE) and the outcome is `RELEASED`. *Pinned by:*
  `StaffAvailabilityIT.releasingStaffMarkedSetFreesIt`
- [ ] **AC-5 (guard):** Given a `BOOKED_ONLINE` set on D, when the operator releases it,
  then the online row is untouched and the outcome is `NOT_MARKED`. *Pinned by:*
  `StaffAvailabilityIT.releaseNeverDeletesOnlineRow`
- [ ] **AC-6:** Given a set marked on D, when a tourist tries to claim it online for D,
  then the online claim loses with `ALREADY_TAKEN`. *Pinned by:*
  `StaffAvailabilityIT.staffMarkBlocksOnlineClaim`
- [ ] **AC-7 (cutoff/past guard, invariant #4/#6):** Given a date before today in
  `Europe/Tirane`, when the operator marks a set, then the outcome is `DATE_IN_PAST` and
  no row is written. *Pinned by:* `StaffAvailabilityIT.markingPastDateIsRejected`
- [ ] **AC-8 (read):** Given two CONFIRMED bookings for venue V on D (and an
  AWAITING_PAYMENT and a CANCELLED one), when the operator reads today's bookings for V on
  D, then exactly the two confirmed `(setId, code)` pairs are returned. *Pinned by:*
  `StaffBookingControllerIT.listsOnlyConfirmedBookingsForVenueAndDate`
- [ ] **AC-9 (auth, invariant #7):** Given no operator credential, when `GET
  /api/venues/{id}/bookings` is called, then it is `401` (booking codes are never public).
  *Pinned by:* `StaffBookingControllerIT.bookingsListRequiresOperator`
- [ ] **AC-10 (auth):** Given no operator credential, when the mark/release endpoints are
  called, then they are `401`. *Pinned by:* `StaffAvailabilityControllerIT.writesRequireOperator`
- [ ] **AC-11 (FE):** Given the daily view loads, when the operator taps a free set, then
  the tile shows marked optimistically and a `POST …/availability` is sent; on
  `ALREADY_TAKEN` the optimistic change reconciles back. *Pinned by:* `staff-daily.spec.ts`
- [ ] **AC-12 (FE a11y):** The daily view passes axe with no violations and meets AA
  contrast; tile state is conveyed by an accessible name, not colour alone. *Pinned by:*
  `staff-daily.a11y.spec.ts`, `staff-daily.contrast.spec.ts`

## Non-goals

- No same-day-booking change for the **online** channel (invariant #4 unchanged); staff
  acting on today is the only same-day write.
- No domain event on a staff mark/release (no downstream consumer — payout/booking are
  unaffected). Pure availability write, mirroring the non-evented online claim. Reversible.
- No per-operator→venue binding; the single configured operator may view any venue
  (venue-scoped by path param). Real staff/admin identity is still deferred.
- No new tourist-visible distinction between `BOOKED_ONLINE` and `STAFF_MARKED` (public
  `SetView` stays FREE/TAKEN).
- No `completed`/`no-show` lifecycle handling in the daily list (only CONFIRMED shown).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Staff mark + online claim double-sell the same `(set, date)` | med | high | Same atomic `INSERT … ON CONFLICT (set_id,booking_date) DO NOTHING` against the V4 UNIQUE index as the online claim; real concurrency IT (AC-1) | agent | open |
| R-2 | Release deletes an online booking's row | low | high | `DELETE … WHERE state='STAFF_MARKED'` only; typed `NOT_MARKED` outcome; AC-5 | agent | open |
| R-3 | Booking codes leak publicly via the new GET | med | high | Explicit OPERATOR matcher placed **before** the `GET /api/venues/**` permitAll; AC-9 | agent | open |
| R-4 | FE misclassifies a `BOOKED_ONLINE` (AWAITING_PAYMENT, not in confirmed list) tile as staff-marked and offers release | low | low | Server guard makes release a no-op (`NOT_MARKED`) + optimistic-reconcile reverts; documented edge | agent | open |
| R-5 | Date reasoned in JVM zone, not Tirane (#6) | low | med | `Clock` injected; `LocalDate.ofInstant(clock.instant(), Europe/Tirane)`; AC-7 | agent | open |
| R-6 | Bookings GET sent without creds (interceptor skips GET) | med | med | Extend `operatorAuthInterceptor` to authenticate the `/bookings` read; unit spec | agent | open |

## Open questions / Assumptions

### Resolved

- **Pool rule (invariant #3):** Staff may mark **any free set, including online-pool**
  sets — that is the collision-relevant case the AC/concurrency-IT target. *Resolved by
  user grill, 2026-06-30.* (Issue body's "walk-in-pool set" wording is stale.)
- **Mark date scope:** **client-supplied date, validated** not-in-the-past in
  `Europe/Tirane`. *Resolved by user grill, 2026-06-30.*
- **Release semantics:** deletes only a `STAFF_MARKED` row; an online row is never
  touched (mirrors the existing `AvailabilityClaim#release`). *Resolved from design.*
- **Venue scope:** venue-scoped by path param (no per-operator venue exists). *Resolved
  from code.*
- **Domain event on mark:** none in v1 (no consumer). *Resolved — see Non-goals.*

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** the **staff
  tap-to-mark** (new `INSERT … STAFF_MARKED`) and the **staff release** (new guarded
  `DELETE` of a `STAFF_MARKED` row). The existing online claim/release are unchanged.
- **Uniqueness guarantee:** V4 `UNIQUE(set_id, booking_date)` — a set is holdable by at
  most one party per date, regardless of channel.
- **Concurrency strategy:** `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING`,
  rows-affected decides the winner (`1`=MARKED, `0`=ALREADY_TAKEN) — the same single-
  statement primitive the online claim uses; no `SELECT … FOR UPDATE` needed because the
  row's creation is the claim. Release is a single guarded `DELETE`.
- **Pool rule (invariant #3):** staff mark is **pool-agnostic** by decision (any free
  set); the online claim still rejects non-online sets. Set existence is checked via
  `VenueCatalog#poolOf` (empty ⇒ `NO_SUCH_SET`) so a bad id is a typed outcome, not a FK
  exception.
- **Cutoff rule (invariant #4/#6):** staff act on "today" and beyond; a date **before**
  today in `Europe/Tirane` is rejected `DATE_IN_PAST` (`Clock`-based, never JVM zone).
- **Pinning test:** `StaffMarkVsOnlineClaimConcurrencyIT.staffMarkAndOnlineClaimCannotBothWin`
  — N staff-mark + online-claim attempts race one `(set, date)`; exactly one wins, one row.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `availability` | existing | `SetAvailability` | sole writer of `set_availability`; staff mark is the 2nd writer |
| M-2 | `booking` | existing | `Booking` | owns bookings + codes; "today's confirmed bookings" is its read |
| M-3 | root (`SecurityConfig`) | existing | — | operator gate for the new endpoints |

**Cross-module named interfaces (`api/` ports)** — *none added.* The staff mark/release
port and the daily-bookings read are **internal** `application.in` driving ports (each
called only by its own module's REST adapter). `availability` continues to use
`venue.api.VenueCatalog#poolOf` for set existence; no new `api/` surface.

**Domain events:** *none* — see Non-goals.

## Payment & payout

N/A — no money moves in this slice (staff marks carry no amount; no booking, charge,
refund, or payout effect).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `staff/staff-daily.ts` + `.html` + `.scss` | new | standalone component | signals; optimistic-reconciled mark/release | none (tap actions) |
| FE-2 | `staff/staff.service.ts` | new | injectable service | — | — |
| FE-3 | `staff/staff.model.ts` | new | typed DTOs | — | — |
| FE-4 | `venue/booking-date.ts` | modify | add `todayBookingDate(now)` (today in Tirane) | — | — |
| FE-5 | `core/operator-auth.interceptor.ts` | modify | authenticate the `/bookings` operator GET | — | — |
| FE-6 | `app.routes.ts` | modify | add `/venue-admin/daily/:venueId` | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`,
signals; tile state announced via accessible name (WCAG AA). Money via `formatMoney`.

## FE↔BE contract

- **New endpoints:**
  - `POST /api/venues/{venueId}/sets/{setId}/availability` body `{ "date": "YYYY-MM-DD" }`
    → `200 {state:"STAFF_MARKED"}` (MARKED) · `409 {error:"ALREADY_TAKEN"}` ·
    `404 {error:"NO_SUCH_SET"}` · `422 {error:"DATE_IN_PAST"}` (operator).
  - `DELETE /api/venues/{venueId}/sets/{setId}/availability?date=YYYY-MM-DD`
    → `204` (RELEASED) · `409 {error:"NOT_MARKED"}` (operator).
  - `GET /api/venues/{venueId}/bookings?date=YYYY-MM-DD` → `200 [{setId, code}]`
    (operator; date defaults to today in Tirane).
- **Client typing:** hand-written typed `StaffService`; no `as any`.
- **Money/date on the wire:** dates as ISO `LocalDate`; no money in these payloads.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — availability staff mark/release (port, service, ITs) | ✅ | backend commit |
| 1 — availability staff REST adapter + security gate | ✅ | backend commit |
| 2 — booking today's-bookings read (port, JDBC, controller) | ✅ | backend commit |
| 3 — frontend daily view (service, component, a11y, e2e) | ✅ | frontend commit |
| 4 — CI green + review gate | ✅ | review-fix commit |

### Review note (SDD review gate)

Ran `/code-review origin/main...HEAD` + `riviera-review-overlay` (8 finder angles → verify).
RV-BE-1 (availability single-source-of-truth) confirmed upheld; backend, tests, and conventions
banks returned clean. One frontend finding raised — the operator interceptor's
`endsWith('/bookings')` check would skip auth if `HttpRequest.url` carried the query string.
**Verdict: REFUTED** — in Angular, `HttpRequest.url` excludes serialized params inside an
interceptor (they live in `req.params`, serialized at the XHR backend after interceptors), so auth
attaches correctly. The reviewer's coverage-gap point stood: added two interceptor regression tests
(bookings GET with a `date` param → authed; public map GET with `date` → unauthed) and removed a
`$any()` cast from the sign-in inputs (type-safe template refs). Re-ran the routing gate (frontend
fix → `angular-developer`, already loaded); lint + vitest (185) + build green.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Backend — availability**
- `availability/application/in/StaffAvailability.java` — driving port (mark/release)
- `availability/application/in/MarkOutcome.java` — enum (MARKED, ALREADY_TAKEN, NO_SUCH_SET, DATE_IN_PAST)
- `availability/application/in/ReleaseOutcome.java` — enum (RELEASED, NOT_MARKED)
- `availability/application/StaffAvailabilityService.java` — Clock validate + atomic SQL (package-private @Service)
- `availability/infrastructure/in/StaffAvailabilityController.java` — operator REST adapter
- `availability/infrastructure/in/MarkRequest.java` — `{date}` body record
- `availability/package-info.java` — keep allowedDependencies (still only venue::api/spi)

**Backend — booking**
- `booking/application/in/ListDailyBookings.java` — driving port
- `booking/application/in/DailyBooking.java` — `(SetId setId, String code)` record
- `booking/application/DailyBookingsService.java` — package-private @Service
- `booking/application/out/Bookings.java` — add `findConfirmedForVenueOn(VenueId, LocalDate)`
- `booking/application/out/DailyBookingRow.java` — out-port row `(SetId, String code)` (or reuse)
- `booking/infrastructure/out/JdbcBookings.java` — implement the new read
- `booking/infrastructure/in/StaffBookingController.java` — `GET /api/venues/{id}/bookings`
- `booking/infrastructure/in/DailyBookingView.java` — `{setId, code}` JSON view

**Backend — root**
- `SecurityConfig.java` — OPERATOR matchers (write + bookings GET before permitAll) + CSRF exempt

**Frontend**
- `staff/staff-daily.ts|html|scss`, `staff/staff.service.ts`, `staff/staff.model.ts`
- `venue/booking-date.ts` (+ `todayBookingDate`), `core/operator-auth.interceptor.ts`, `app.routes.ts`
- specs: `staff-daily.spec.ts`, `staff.service.spec.ts`, `staff-daily.a11y.spec.ts`,
  `staff-daily.contrast.spec.ts`, `booking-date.spec.ts` (extend); e2e `e2e/staff-daily.e2e.ts`

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-7 — `./gradlew test --tests "*StaffAvailability*" --tests "*StaffMarkVsOnlineClaim*"`
- [ ] AC-8..AC-10 — `./gradlew test --tests "*StaffBookingController*" --tests "*StaffAvailabilityController*"`
- [ ] AC-11..AC-12 — `npm run test` (vitest: staff-daily specs) + `npm run lint` + `npm run build`
- [ ] Full pre-merge: `./gradlew build` green; CI green; Sonar gate green.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No JPA; `JdbcClient` + SQL only (invariant #1).
- [ ] Availability section filled; concurrency IT present (invariant #2).
- [ ] Pool (any-free, by decision) + cutoff/past-date (invariant #4/#6) honored.
- [ ] Modulith: no cross-module internal imports; no new cycle; ports internal (invariant #11).
- [ ] Money/payout N/A justified; booking codes never logged/public (invariant #7).
- [ ] Timezone: UTC stored, Tirane for the date validation (invariant #6).
- [ ] No new migration (V4 already admits STAFF_MARKED) — justified.
- [ ] Frontend standards met; no `as any`; WCAG-AA specs pass.
- [ ] Execution-status table matches reality; Open Questions empty.

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
