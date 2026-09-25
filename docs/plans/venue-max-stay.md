# Multi-day stays 6/12: venue maximum stay length Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** A venue operator sets or clears a maximum stay length in days; the reserve path refuses a
stay longer than it with a typed rejection; the venue page's calendar refuses last days past it and
states the rule; a tourist who arrives with a longer range is told the rule and offered new dates,
never a plan. Unset means any length this season, and the platform sets no maximum of its own.

**Architecture:** The setting is one nullable column on `venue`, carried to `booking` on
`SetBookingInfo` exactly as `salesClose` is, and judged in `ReserveSetService` after the
Request-to-Book range refusal and before any claim, so a refused stay holds nothing. The tourist map
view carries the same number so the calendar's existing last-day ceiling takes the venue's maximum
where it is lower than the technical 62-day span.

**Persistence:** JDBC only (invariant #1). `venue.max_stay_days` (V63, nullable, `CHECK >= 1`).

**Source of intent:** GitHub issue #1204; `docs/architecture/multi-day-stays.md` § D10 (epic #1096,
story 28).

**Skills consulted:** `riviera-sdlc` (intake gate: the issue's "read through `venue::api` the way it
reads sales-close" resolves to `SetBookingFacts#setBookingInfo`, not a new port; the frontend never
mapped `RANGE_NOT_OFFERED` in `bookingErrorOf`, so the new code is mapped and that gap is closed in
passing; open PRs are dependabot only; V63 is free on `main` and unclaimed; the previous sibling
#1217 merged via PR #1219 with its close-out comment posted, and its plan
`docs/plans/remodel-span-candidate.md` retires in this PR's last code commit) · `riviera-plan-doc`
(forced the "arrives with a longer range" state into the ACs and the kill-switch full-replace risk
into the register) · `tdd` (each AC red first at its seam) · `riviera-review-overlay` (due at
ready-for-review) · `riviera-docs-freshness` (due at close-out over the resolved range) ·
`postgres` (nullable `INTEGER` + named `CHECK`, no index — never filtered on) · `riviera-modulith`
(no new port: a sibling-facing fact rides `SetBookingFacts`; the tourist read rides
`VenueCatalog`'s `VenueMapView`) · `riviera-java-conventions` (`Integer` null = unset on the record,
the `SeasonClosure#reopenOn` precedent; new problem code `STAY_TOO_LONG` §6b) · `riviera-frontend`
(the field lives in `operator/venue-tab`, the rule in `venue/availability-calendar`, the arrival
state in `venue/venue-map`; the wire type in `shared/venue-views.ts`) · `angular-developer` + angular-cli
`get_best_practices` (Signal Forms for the new field: a `''`-defaulted string with a `validate`
rule, never a nullable model field) · `riviera-tailwind` (rule text reuses the calendar's hint
skin; the arrival panel reuses the no-cover panel's card skin; `[appTouchTarget]` on the new
button) · `playwright-cli` (mocked e2e in `range-booking.e2e.ts` and `operator-venue.e2e.ts`) ·
`riviera-local-debug` (JDK 25 at `/opt/jdk-25`, scoped test runs only)

**Branch:** `claude/tailwind-angular-docs-8dcap2` (the designated cloud branch stands in for
`feature/venue-max-stay`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the schema at V63, when a `venue` row is written with `max_stay_days = 0`,
  then `venue_max_stay_days_check` refuses it, and `NULL` and `1` are accepted. *Seam:* the
  `venue` table · *Pinned by:* `MaxStayDaysMigrationIT.zeroIsRefusedNullAndOneAreAccepted`
- [ ] **AC-2:** Given an owned venue, when the operator PATCHes the profile with `maxStayDays: 5`,
  then the profile read answers 5; a second PATCH with `maxStayDays: null` (or absent) clears it
  and the read answers null; `maxStayDays: 0` is `400 INVALID_REQUEST`. *Seam:*
  `PATCH /api/venues/{id}` + `GET /api/venues/{id}/profile` · *Pinned by:*
  `VenueAdminControllerIT.patchSetsThenClearsTheMaximumStay`,
  `VenueAdminControllerIT.nonPositiveMaxStayIs400`
- [ ] **AC-3:** Given a non-owner, when they PATCH the profile with a maximum, then `403` and nothing
  is written. *Seam:* `EditVenueProfile.updateProfile` · *Pinned by:*
  `VenueAdminServiceTest.profileEditByANonOwnerIsDeniedBeforeAnyWrite` (existing; the new field
  rides the same command)
- [ ] **AC-4:** Given a venue with maximum 3, when a stay of 4 days is reserved, then the outcome is
  `Rejected(STAY_TOO_LONG)` and no claim is attempted; a stay of exactly 3 days is claimed and
  reserved. *Seam:* `CreateBooking.create` · *Pinned by:*
  `CreateBookingServiceTest.aStayLongerThanTheVenueMaximumIsRejectedBeforeAnyClaim`,
  `CreateBookingServiceTest.aStayOfExactlyTheMaximumIsReserved`
- [ ] **AC-5:** Given a venue with no maximum, when a 10-day stay is reserved, then it is claimed and
  reserved (the season closure and the 62-day span stay the only bounds). *Seam:*
  `CreateBooking.create` · *Pinned by:* `CreateBookingServiceTest.noMaximumAcceptsAnyStay`
- [ ] **AC-6:** Given a venue with maximum 2 over HTTP, when `POST /api/bookings` asks for 3 days,
  then `422` with `code: STAY_TOO_LONG` and no availability row exists for any of the days. *Seam:*
  `POST /api/bookings` · *Pinned by:* `BookingControllerIT.rangeOverTheVenueMaximumIs422`
- [ ] **AC-7:** Given a venue with maximum 5, when the tourist map is read, then `VenueMapView`
  carries `maxStayDays: 5`; unset reads `null`. *Seam:* `GET /api/venues/{id}` · *Pinned by:*
  `VenueReadControllerIT.mapCarriesTheMaximumStay`
- [ ] **AC-8:** Given the calendar in stay mode at a venue with maximum 3 and a first day tapped,
  when rendered, then the third day after the first is `aria-disabled`, the second is not, and
  the rule reads "Stays of up to 3 days at this venue."; with no maximum the rule reads "Stays of
  any length this season." *Seam:* `app-availability-calendar` · *Pinned by:*
  `availability-calendar.spec.ts` "refuses a last day past the venue's maximum stay", "states the
  venue's stay rule"
- [ ] **AC-9:** Given a venue with maximum 2, when the page opens with `?date=D&lastDate=D+3`, then
  no tile is bookable, no longest-run offer shows, and a panel reads "Stays of up to 2 days at this
  venue." with a **Change dates** button that opens the calendar and a link to the other beaches.
  *Seam:* `app-venue-map` · *Pinned by:* `venue-map.spec.ts` "a stay longer than the venue's
  maximum offers new dates, never a plan"
- [ ] **AC-10:** Given the operator console, when the operator types 4 into "Maximum stay" and saves,
  then the PATCH carries `maxStayDays: 4`; clearing the field sends `null`; "0" or "x" is a field
  error and no PATCH. *Seam:* `app-venue-tab` + `OperatorConsoleService.updateVenueProfile` ·
  *Pinned by:* `venue-tab.spec.ts` "sends the maximum stay with the full-replace PATCH", "clears
  the maximum stay with null", "refuses a non-positive maximum stay"
- [ ] **AC-11:** Given the reserve answers `STAY_TOO_LONG`, when the booking dialog maps it, then the
  error code is `STAY_TOO_LONG` (not `UNKNOWN`) and the dialog shows its own copy. *Seam:*
  `bookingErrorOf` · *Pinned by:* `booking.service.spec.ts` "maps STAY_TOO_LONG"
- [ ] **AC-12 (e2e, mocked):** the calendar disables the day past the maximum and states the rule;
  arriving with a longer range shows the panel and **Change dates** opens the calendar; the
  operator sets and clears the maximum. *Seam:* the rendered page · *Pinned by:*
  `range-booking.e2e.ts` "refuses a stay past the venue's maximum and offers new dates",
  `operator-venue.e2e.ts` "sets and clears the maximum stay"

## Non-goals

- The discovery page's per-venue stay verdict ("Stays of up to N days here" on the card) — D11,
  its own slice. The "other beaches" link carries `date` only until that slice reads a range.
- Faster expiry of longer Request-to-Book stays (story 29) and ranges at Request venues at all.
- A platform maximum. The 62-day `StaySpan` ceiling stays a technical bound.
- Setting the maximum on venue creation (`POST /api/venues`); a new venue starts unset.
- Refusing the tourist map read for a range over the maximum: the read answers availability, the
  reserve refuses, and the page states the rule.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The daily view's close-sales kill switch re-sends the profile through `toProfileUpdate`; a field it forgets is cleared by the full replace | High | A venue's maximum silently cleared | `toProfileUpdate` carries `maxStayDays`; `VenueProfileUpdate`'s type makes the omission a compile error; model spec asserts it | frontend | open |
| R-2 | A refused stay leaves a claim behind | Low | Stranded `(set, date)` rows (#2) | The check sits before `claimEveryDay`; `CreateBookingServiceTest` asserts `claim` is never called; `BookingControllerIT` asserts no availability row | booking | open |
| R-3 | BOLA on the profile write (#13) | Low | A non-owner sets a stranger's cap | `VenueAdminService.updateProfile` asserts ownership first — unchanged; AC-3 | venue | open |
| R-4 | `SetBookingInfo` gains a component: nine `new SetBookingInfo(` sites | Certain | Compile break | All nine updated in phase 1; `compileTestJava` proves it | booking | open |
| R-5 | The arrival check runs before the venue loads (`routeDates` parses `?lastDate` without the max) | Certain | A flash of a bookable map | The too-long verdict is a `computed` over the loaded venue, like `salesClosed`; tiles are gated on it | frontend | open |
| R-6 | Flyway `V63` collides with another branch | Low | Rename | Free on `main` @ `5696917f`, unclaimed by any open PR; the branch merging second renumbers | this PR | open |
| R-7 | New problem code (§6b) | Certain | Contract drift | `STAY_TOO_LONG` → 422, detail states the condition, listed in `BookingOutcome.Rejected` Javadoc; mapped in `bookingErrorOf` | booking / frontend | open |

## Open questions / Assumptions

- **Assumption:** the wire and column name is `maxStayDays` / `max_stay_days` (the epic comment of
  2026-09-24 names it so). — *Owner:* this PR · *Resolves by:* phase 0
- **Assumption:** a maximum of 1 is legal and means "one day at a time"; the DB check is `>= 1`
  with no upper bound (the 62-day span is technical, not a product number). — *Owner:* this PR ·
  *Resolves by:* phase 0
- **Assumption:** the maximum is judged after the Request-to-Book range refusal, so a Request venue
  keeps answering `RANGE_NOT_OFFERED` for any range. — *Owner:* this PR · *Resolves by:* phase 1
- **Assumption:** on the venue page a too-long arrival keeps the availability tiles visible but not
  bookable (the sales-closed treatment), and hides the longest-run offer — the page shows what is
  free, never a plan. — *Owner:* this PR · *Resolves by:* phase 3
- **Assumption:** the operator field is a Signal Form string field (`''` = unset) with a
  `validate` rule, not another draft signal beside the form. — *Owner:* this PR · *Resolves by:*
  phase 2

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** the online reserve (`claimEveryDay`) —
  unchanged; this slice adds a refusal before it and no write.
- **Uniqueness guarantee:** `set_availability` primary key `(set_id, booking_date)` — unchanged.
- **Concurrency strategy:** unchanged (`availability`'s one-day `claim`, all-or-nothing over the
  span). The maximum is read from the same `SetBookingInfo` snapshot the sales close is; an
  operator lowering the maximum while a reserve is in flight is a benign race — the stay is judged
  against the value read in the reserve transaction.
- **Pool rule (#3):** unchanged; judged before the maximum.
- **Cutoff rule (#4):** unchanged; the season closure and the first-day sales close are judged before
  the maximum.
- **Pinning test:** `CreateBookingServiceTest.aStayLongerThanTheVenueMaximumIsRejectedBeforeAnyClaim`
  (no claim), `BookingControllerIT.rangeOverTheVenueMaximumIs422` (no row).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `venue.max_stay_days` | a venue setting beside booking mode and sales-close (Job line) |
| M-2 | `booking` | existing | none | the reserve fence is `booking`'s (a bound is a rule, judged in the reserve service) |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#setBookingInfo` (unchanged signature) | `SetBookingInfo` gains `Integer maxStayDays` | `booking` |
| NI-2 | `venue.api` | `VenueCatalog#findVenueMap` (unchanged signature) | `VenueMapView` gains `Integer maxStayDays` | the platform edge (`VenueReadController`) |

**Domain events (id-based payloads):** none new or changed.

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| Store, edit and publish the maximum stay | `venue` | Job: "the booking mode (Instant / Request) … the sales-close setting"; the maximum is the third such setting. No Not-My-Job line rejects it. |
| Refuse a stay longer than the maximum | `booking` | Job: the reserve rule set ("a Request-to-Book venue refuses a stay of several days"); `venue` Not-My-Job: "Creating or tracking bookings → booking". |
| State the rule and refuse last days in the calendar | frontend `venue/` | display only; the server is authoritative, as for sales close. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope (a refused stay creates no intent).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-tab` | existing | component | `details` signal | Signal Form field `maxStayDays: string` + `validate` |
| FE-2 | `operator/operator-console.model` | existing | model | — | `VenueProfileView.maxStayDays`, `VenueProfileUpdate.maxStayDays`, `toProfileUpdate` |
| FE-3 | `venue/availability-calendar` | existing | component | `maxStayDays` input, `lastDayCeiling` computed, `stayRule` computed | — |
| FE-4 | `venue/venue-map` | existing | component | `stayTooLong` computed gating `bookable`/`noSetCovers`; panel with Change dates | — |
| FE-5 | `shared/venue-views` | existing | type | `VenueMapView.maxStayDays?: number \| null` | — |
| FE-6 | `booking/booking.service` + `booking.model` + `booking-dialog` | existing | service/model | `bookingErrorOf` maps `STAY_TOO_LONG` (and `RANGE_NOT_OFFERED`) | — |

## FE↔BE contract

- **New/changed endpoints:** `PATCH /api/venues/{id}` body gains `maxStayDays: Integer | null`
  (absent = null = unset, full replace); `GET /api/venues/{id}/profile` and `GET /api/venues/{id}`
  gain `maxStayDays: Integer | null`; `POST /api/bookings` gains the rejection
  `422 { code: "STAY_TOO_LONG" }`.
- **Client typing:** hand-typed mirrors in `shared/venue-views.ts` and
  `operator/operator-console.model.ts`; never `as any`.
- **Money/date on the wire:** unchanged.

## Execution status

**Stage pointer:** `implement — all phases built; backend ITs + mocked e2e running; draft PR next`

**Next action:** open the draft PR once the backend ITs and the two e2e files are green locally

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V63 + venue profile read/write | ✅ | |
| 1 — the reserve refusal + the map view | ✅ | |
| 2 — operator console field | ✅ | |
| 3 — tourist calendar rule + arrival state | ✅ | |
| 4 — mocked e2e + docs | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/resources/db/migration/V63__venue_max_stay_days.sql` — the nullable column + check
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — profile read/update carry the column
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcSetBookingFacts.java` — `SetBookingInfo` carries it
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — `VenueMapView` carries it
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileCommand.java` — the command field + validation
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueFieldValidation.java` — `requirePositiveOrNullMaxStay`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueProfileView.java` — the view field
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/UpdateVenueProfileRequest.java` — the wire field
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` — the wire field
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetBookingInfo.java` — `maxStayDays`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/VenueMapView.java` — `maxStayDays`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReadController.java` — map response field (if the view is mapped by hand)
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ReserveSetService.java` — the refusal
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/BookingOutcome.java` — `STAY_TOO_LONG`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingController.java` — the 422 mapping
- `platform/src/test/java/ai/riviera/platform/venue/MaxStayDaysMigrationIT.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-2
- `platform/src/test/java/ai/riviera/platform/venue/VenueReadControllerIT.java` — AC-7
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueProfileCommandTest.java` — validation
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — the field rides the command
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapReadServiceTest.java` — the `new VenueMapView(` site
- `platform/src/test/java/ai/riviera/platform/venue/VenueProfileConcurrencyIT.java` — the `new VenueProfileCommand(` site
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — AC-4, AC-5
- `platform/src/test/java/ai/riviera/platform/booking/BookingControllerIT.java` — AC-6
- `platform/src/test/java/ai/riviera/platform/booking/**/*Test.java` — the `new SetBookingInfo(` sites (R-4)
- `platform/src/test/java/ai/riviera/platform/notification/**/*Test.java` — the `new SetBookingInfo(` sites (R-4)
- `frontend/src/app/shared/venue-views.ts` — `VenueMapView.maxStayDays`
- `frontend/src/app/venue/stay-rule.ts|.spec.ts` — the one sentence the calendar and the venue page state
- `frontend/src/app/venue/availability-calendar.ts|.html|.spec.ts` — the ceiling + the rule
- `frontend/src/app/venue/venue-map.ts|.html|.spec.ts` — the arrival state
- `frontend/src/app/venue/venue.service.spec.ts` — the view carries the field (if a fixture is shared)
- `frontend/src/app/booking/booking.service.ts|.spec.ts` — `bookingErrorOf`
- `frontend/src/app/booking/booking.model.ts` — `STAY_TOO_LONG`
- `frontend/src/app/booking/booking-dialog.ts` — copy for the code
- `frontend/src/app/operator/venue-tab.ts|.html|.spec.ts` — the field
- `frontend/src/app/operator/operator-console.model.ts|.spec.ts` — the view/update field, `toProfileUpdate`
- `frontend/e2e/range-booking.e2e.ts` — AC-12 (tourist)
- `frontend/e2e/operator-venue.e2e.ts` — AC-12 (operator)
- `frontend/e2e/support/operator-console.mocks.ts` — the profile mock carries the field
- `RESPONSIBILITIES.md` — venue Job line + the setting's bullet; booking's reserve rule sentence
- `CONTEXT.md` — glossary entry for the maximum stay
- `docs/architecture/multi-day-stays.md` — status line for slice 6/12
- `docs/plans/venue-max-stay.md` — this plan
- `docs/plans/remodel-span-candidate.md` — retired (merged via PR #1219)

---

## Phase 0 — V63 + venue profile read/write

**Files:** Create `V63__venue_max_stay_days.sql`, `MaxStayDaysMigrationIT` · Modify `JdbcVenues`,
`VenueProfileCommand`, `VenueFieldValidation`, `VenueProfileView`, `UpdateVenueProfileRequest`,
`VenueProfileResponse` · Test `VenueProfileCommandTest`, `VenueAdminControllerIT`

- [ ] **Step 1: Write the failing tests** — `MaxStayDaysMigrationIT` (AC-1),
  `VenueProfileCommandTest.nonPositiveMaxStayIsRejected`,
  `VenueAdminControllerIT.patchSetsThenClearsTheMaximumStay` / `nonPositiveMaxStayIs400` (AC-2)
- [ ] **Step 2: Run, verify red** — `./gradlew test --tests "*MaxStayDaysMigrationIT*"` etc.
- [ ] **Step 3: Minimal implementation** — the migration, the column in the profile select/update,
  the command/view/DTO fields, the validation
- [ ] **Step 4: Run, verify green** — the three classes + `*VenueAdminServiceTest*`
- [ ] **Step 5: Generalization-audit pass** — every reader of `sales_close` that should also read
  the new column: `git grep -n "sales_close" platform/src/main` → the profile, the set facts, the
  catalogue (phase 1), the create insert (non-goal, NULL default)
- [ ] **Step 6: Commit** — `Venue maximum stay: V63 and the profile setting (#1204)`
- [ ] **Step 7: Update Execution status**

## Phase 1 — the reserve refusal + the map view

**Files:** Modify `SetBookingInfo`, `JdbcSetBookingFacts`, `VenueMapView`, `JdbcVenueCatalog`,
`VenueReadController` (if mapped), `BookingOutcome`, `ReserveSetService`, `BookingController`, the
nine `new SetBookingInfo(` test sites · Test `CreateBookingServiceTest`, `BookingControllerIT`,
`VenueReadControllerIT`

- [ ] **Step 1: Write the failing tests** — AC-4, AC-5, AC-6, AC-7
- [ ] **Step 2: Run, verify red**
- [ ] **Step 3: Minimal implementation** — the record fields, the select columns, the refusal after
  `RANGE_NOT_OFFERED`, the 422 mapping
- [ ] **Step 4: Run, verify green** — the touched classes + the structural net
- [ ] **Step 5: Generalization-audit pass** — `git grep -n "new SetBookingInfo(" platform/src`
- [ ] **Step 6: Commit** — `Venue maximum stay: the reserve refuses a longer stay (#1204)`
- [ ] **Step 7: Update Execution status**

## Phase 2 — operator console field

**Files:** Modify `operator-console.model.ts`, `venue-tab.ts|.html` · Test
`operator-console.model.spec.ts`, `venue-tab.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-10 + `toProfileUpdate` carries the field (R-1)
- [ ] **Step 2: Run, verify red** — `npx vitest run src/app/operator/venue-tab.spec.ts`
- [ ] **Step 3: Minimal implementation** — the model fields, the Signal Form field with a
  `validate` rule, the input beside the sales close, the save mapping, the seed
- [ ] **Step 4: Run, verify green** — the two specs + `npm run lint` + `npm run format:check`
- [ ] **Step 5: Generalization-audit pass** — every builder of `VenueProfileUpdate`:
  `git grep -n "VenueProfileUpdate" frontend/src`
- [ ] **Step 6: Commit** — `Venue maximum stay: the operator sets and clears it (#1204)`
- [ ] **Step 7: Update Execution status**

## Phase 3 — tourist calendar rule + arrival state

**Files:** Modify `venue-views.ts`, `availability-calendar.ts|.html`, `venue-map.ts|.html`,
`booking.service.ts`, `booking.model.ts`, `booking-dialog.ts` · Test the matching specs

- [ ] **Step 1: Write the failing tests** — AC-8, AC-9, AC-11
- [ ] **Step 2: Run, verify red**
- [ ] **Step 3: Minimal implementation** — the `maxStayDays` input and ceiling, the rule line, the
  `stayTooLong` computed and panel, the error mapping
- [ ] **Step 4: Run, verify green** — the specs + lint + format + `test:a11y`
- [ ] **Step 5: Generalization-audit pass** — every place `MAX_STAY_DAYS` bounds a range:
  `git grep -n "MAX_STAY_DAYS" frontend/src`
- [ ] **Step 6: Commit** — `Venue maximum stay: the calendar refuses a longer stay (#1204)`
- [ ] **Step 7: Update Execution status**

## Phase 4 — mocked e2e + docs

- [ ] AC-12 in `range-booking.e2e.ts` and `operator-venue.e2e.ts`;
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- range-booking operator-venue`
- [ ] `RESPONSIBILITIES.md`, `CONTEXT.md`, `docs/architecture/multi-day-stays.md` status line
- [ ] Retire `docs/plans/remodel-span-candidate.md`
- [ ] Commit — `Venue maximum stay: e2e coverage and docs (#1204)`

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-25 | phase 0: a third venue setting beside sales close | every reader of `sales_close` that should also read `max_stay_days` | `git grep -n "sales_close" platform/src/main` | profile read/update, set facts, the map row, the list row, the calendar's `SalesSettings`, the create insert | profile, set facts, map row carry it; list row and calendar do not need it (the list verdict is D11's, the calendar's per-day verdict is not a length); create keeps the `NULL` default (non-goal) |
| 2026-09-25 | phase 1: `SetBookingInfo` gains a component | every `new SetBookingInfo(` | `git grep -n "new SetBookingInfo(" platform/src` | 1 adapter + 8 test fixtures | all updated (`append_arg.py` for the fixtures, by hand for the adapter) |
| 2026-09-25 | phase 2: a new profile field on the full-replace body | every builder of `VenueProfileUpdate` | `git grep -n "VenueProfileUpdate" frontend/src` | `venue-tab.ts` (the form), `toProfileUpdate` (the kill switch's read-modify-write) | both carry `maxStayDays`; the type makes a third builder fail to compile without it |
| 2026-09-25 | phase 3: `MAX_STAY_DAYS` bounds a range | every place the 62-day ceiling clamps a stay | `git grep -n "MAX_STAY_DAYS" frontend/src` | `availability-calendar.ts` (the last-day ceiling), `venue-map.ts` (`routeDates`) | the calendar takes the venue maximum where lower; `routeDates` keeps the technical bound only (the venue is not loaded when it runs) and the loaded `stayTooLong` verdict fences the page instead (R-5) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** scoped `./gradlew test --tests` runs listed per phase → PASS.
- [ ] **AC-8..AC-11:** `npx vitest run` on the named specs → PASS.
- [ ] **AC-12:** `npm run test:e2e:a11y` on the two files → PASS.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
