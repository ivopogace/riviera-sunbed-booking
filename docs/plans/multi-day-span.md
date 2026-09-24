# Multi-day stays 3/12 — a booking gains an end date Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** `booking` carries `last_date` beside `booking_date`, every terminal transition (and the
remodel move) claims/releases every day of the span, the date-equality reads become overlap reads,
and the weather refund refunds one-day bookings as today while **naming** every overlapping
multi-day stay for a manual refund — with no product change (every booking is still one day).

**Architecture:** The span is a `booking` fact: `last_date` NOT NULL, CHECK `>= booking_date`, a
BEFORE INSERT trigger defaulting it to `booking_date` so every legacy-shaped insert stays a one-day
booking, and V60's confirm trigger materialising one `booking_day` per day of the span. Each
guarded `UPDATE … RETURNING` that frees a claim now returns `last_date` too, and the release sites
iterate `ServiceDays.between(first, last)` over the unchanged `AvailabilityClaim#release`, so
`set_availability` and its port are untouched (invariant #2 by construction). The weather refund
selects by overlap and splits the candidates by span length: one day → the existing cancel spine;
more → listed on the outcome, never cancelled, never refunded (#1210 owns the day's share).

**Persistence:** JDBC only (invariant #1). `booking` (new column `last_date`, CHECK
`booking_span_check`, trigger `booking_last_date_on_insert`), `booking_day_materialise()` replaced
to span `generate_series(booking_date, last_date)`. Migration `V61__booking_last_date.sql`.

**Source of intent:** GitHub issue #1201 (epic #1096); `docs/architecture/multi-day-stays.md`
§ D3, D5 (D5's weather wording as corrected in PR #1198).

**Skills consulted:** `riviera-sdlc` (intake gate: V61 free on `main` and unclaimed by the only
open PRs, dependabot's; sibling #1200 closed via PR #1211; four product decisions put to the user —
takings stay first-day, the remodel move goes span-wide, the console notice is extended, a
BEFORE INSERT trigger defaults `last_date`) · `riviera-plan-doc` (forced the module-ownership
table, the availability section and the per-leg AC list) · `tdd` (each leg red-green at the
driving port; the existing single-day ITs are the equivalence oracle) · `riviera-review-overlay`
(<at ready-for-review>) · `riviera-docs-freshness` (<at close-out>) · `grilling` (the four
decisions above) · `postgres` (three-step NOT NULL add, CHECK over ENUM-free columns, trigger as the
one home of the default, no new index — the overlap predicates ride `booking_venue_id_idx`) ·
`riviera-modulith` (no new published surface; `ServiceDays` is a pure `domain/` rule holder with
its DB twin named; `RemodelClaim` vocabulary gains `lastDate`) · `riviera-java-conventions`
(records gain a trailing `lastDate`; loops at the release sites, no helper service; Javadoc
carries the contract, not the issue) · `riviera-stripe-payments` (a multi-day stay is not refunded
here: partial refund of a live booking is unexpressible under one reversal per booking, invariant
#9; the manual list is the honest outcome) · `riviera-frontend` (`operator/` only: model + notice
+ spec; no new cross-feature edge) · `playwright-cli` (mocked suite stub carries the two new
fields; one e2e case asserts the manual-refund sentence)

**Branch:** `claude/sdlc-1201-a3pjw0` (cloud session's designated branch, stands in for
`feature/multi-day-span`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a database at V60 holding bookings in every status, when V61 runs, then every
  row has `last_date = booking_date`, `last_date` is NOT NULL and `last_date < booking_date` is
  refused. *Seam:* Flyway + the `booking` table · *Pinned by:*
  `BookingLastDateBackfillIT.everyExistingRowIsBackfilledToItsFirstDay`,
  `BookingMigrationIT.lastDateDefaultsToTheFirstDay`, `BookingMigrationIT.lastDateBeforeTheFirstDayIsRefused`
- [ ] **AC-2:** Given a `CONFIRMED` insert spanning three days, when it lands, then three
  `booking_day` rows exist. *Seam:* the `booking` table (V60 trigger) · *Pinned by:*
  `BookingMigrationIT.aConfirmedStayCarriesOneServiceDayPerDay`
- [ ] **AC-3:** Given a `CONFIRMED` three-day stay holding all three `(set, date)` rows, when the
  guest cancels, then all three days re-claim as `CLAIMED`. *Seam:* `CancelBooking` ·
  *Pinned by:* `SpanReleaseIT.guestCancelReleasesEveryDay`
- [ ] **AC-4:** Same for a `PENDING_REQUEST` stay declined, expired and withdrawn. *Seams:*
  `RespondToRequest#decline`, `ExpireRequests#sweep`, `WithdrawRequest` · *Pinned by:*
  `SpanReleaseIT.declineReleasesEveryDay`, `.expiryReleasesEveryDay`, `.withdrawReleasesEveryDay`
- [ ] **AC-5:** Same for an `AWAITING_PAYMENT` stay released by the abandoned-payment seam.
  *Seam:* `ReleaseAbandonedBooking` (shared by the sweep and the canceled webhook) · *Pinned by:*
  `SpanReleaseIT.abandonedReleaseReleasesEveryDay`
- [ ] **AC-6:** Same for the remodel refund, release and decline legs; the move leg claims every
  day on the target and frees every day on the old set. *Seam:* `RemodelClaims#commit` ·
  *Pinned by:* `SpanReleaseIT.remodelRefundReleasesEveryDay`, `.remodelReleaseReleasesEveryDay`,
  `.remodelDeclineReleasesEveryDay`, `.remodelMoveClaimsAndReleasesEveryDay`
- [ ] **AC-7:** Given a one-day `CONFIRMED` booking and a three-day stay whose middle day is the
  storm date, when the weather refund runs for that date, then the one-day booking is cancelled
  with a full `WEATHER` refund exactly as today, the stay is still `CONFIRMED` with all its days
  held and no `BookingCancelled` for it, and the outcome lists the stay's id with count 1.
  *Seam:* `RefundForWeather` · *Pinned by:*
  `WeatherRefundServiceIT.aStayOverlappingTheDateIsNamedNotRefunded`
- [ ] **AC-8:** Given a `CONFIRMED` stay covering a date, when the staff daily list is read for that
  date, then the stay is listed. *Seam:* `GET /api/venues/{id}/bookings?date=` · *Pinned by:*
  `StaffBookingControllerIT.aStayCoveringTheDateIsListed`
- [ ] **AC-9:** Given a live stay straddling `from`, when `liveBookingsFrom` is read, then the stay
  counts; given a guest whose only stay ends after the retention cutoff, when history is asked,
  then the guest is retained. *Seams:* `venue.spi.BookingPresence`,
  `customer.spi.GuestBookingHistory` · *Pinned by:*
  `JdbcBookingPresenceIT.aStayStraddlingFromIsStillOwed`,
  `GuestContactRetentionIT.aStayEndingAfterTheCutoffIsARetentionBasis`
- [ ] **AC-10:** Given the weather refund outcome carries two manual refunds, when the console
  notice renders, then it names the count and the booking ids. *Seam:* `PayoutsTab` notice ·
  *Pinned by:* `payouts-tab.spec.ts` "names overlapping stays that need a manual refund";
  `operator-payouts.e2e.ts` "names the stays a weather refund could not reach"
- [ ] **AC-11:** Every existing single-day test passes unchanged; the structural net passes.
  *Pinned by:* CI; the six-test net command.

## Non-goals

- A range reserve (`NewBooking` stays one-day; the application insert binds `last_date = booking_date`).
- Refunding a stay's stormy day (#1210); D4's arrivals/on-beach split and per-day takings.
- Span-aware move candidate search (D9): the move claims the span and the commit throws when a
  later day of the candidate is taken under the venue lock, as the single-day path already does.
- Any change to `set_availability` or `availability::api`.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A release site is missed and a stay strands a `(set, date)` row no sweep can reach (#2) | M | H | Population by mechanism: every `availability.release(` call in `booking`; one IT per leg re-claims the whole span | agent | open |
| R-2 | The weather refund double-acts on a stay (refund + strand) | L | H | Candidates split by span before any transition; the stay never reaches `cancelForWeather`; IT asserts status, rows and events | agent | open |
| R-3 | The remodel move claims the span but a later day is taken → 500 | M | M | Accepted (decided): throws under the lock, transaction rolls back, nothing moves; D9 owns candidate search | user | open |
| R-4 | ~40 fixtures insert without `last_date` | H | H | BEFORE INSERT trigger defaults it; AC-11 | agent | open |
| R-5 | `RemodelClaim` (published vocabulary) gains a field; edge views and `PreviewToken` | L | M | Token digests `(id, kind)` only; views map by accessor; only tests construct it | agent | open |
| R-6 | Timezone (#6): `generate_series` over DATEs, no instants | L | L | Dates only; the trigger stays civil-day | agent | open |
| R-7 | Flyway `V61` claimed by another branch | L | M | Free on `main`, no open non-dependabot PR; renumber falls to the branch merging second | agent | open |
| R-8 | BOLA (#13): the weather refund's manual list leaks another venue's ids | L | H | The read is venue-scoped (`WHERE venue_id = :venue`) and `assertOwns` runs first, unchanged | agent | open |
| R-9 | Frontend notice regresses focus/a11y | L | L | Copy only; no new control | agent | open |

## Open questions / Assumptions

- **Assumption:** `nearestLiveBookings` keeps `MIN(booking_date)`: a running stay's nearest day is
  its first day, literally true for one-day bookings; the port carries no "today" to clamp to.
  *Owner:* agent · *Resolves by:* D4/D9 revisit.
- **Assumption:** the abandoned-payment sweep's `booking_date <= :ended` arm stays on the first
  day: the pay deadline is capped at the first service day's end (`RequestWindows#payDeadline`
  mirror), so an unpaid stay expires when its first day ends. *Owner:* agent.

### Resolved

- Takings read stays first-day; remodel move goes span-wide; console notice extended; BEFORE
  INSERT trigger — decided by the user at intake (2026-09-24).

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged — `AvailabilityClaim#claim`
  / `#release`, now called once per day of the span from `booking`'s release sites and the remodel
  move; the reserve path still claims one day.
- **Uniqueness guarantee:** `set_availability_uniq (set_id, booking_date)` — untouched.
- **Concurrency strategy:** unchanged — each leg's guarded `UPDATE … RETURNING` on `booking` wins
  or matches nothing, and only the winner releases; the span loop runs inside that winner's
  transaction, so a partial release cannot commit.
- **Pool rule (#3):** unchanged; `release` frees only `BOOKED_ONLINE` rows.
- **Cutoff rule (#4):** unchanged; the weather refund stays outside the guest fence.
- **Pinning test:** `SpanReleaseIT` (all legs re-claim the span afterwards);
  `ConcurrentReservationIT` and `ConcurrentRequestTerminationIT` unchanged.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `booking` (+`last_date`), `booking_day` (trigger) | Job: bookings + lifecycle; sole writer of both tables |

**Cross-module `api/` ports** — none added. `booking.vocabulary.RemodelClaim` gains `lastDate`
(consumed by the platform edge's remodel views, which map by accessor).

**Domain events** — none added or changed (`BookingCancelled` et al. keep `bookingDate`, the
first day).

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| The span (`last_date`) and its default | `booking` | Job: "own bookings … and the lifecycle"; no other Not-My-Job claims it |
| Releasing every day on a terminal transition | `booking` | `availability` Not-My-Job: "*why* a set is taken — which booking" → `booking` asks it to release |
| Naming stays a weather refund cannot reach | `booking` | Job: refund *decision* (invariant #10); `payment` executes only |
| The console notice copy | frontend `operator/` | The Payouts tab already owns the weather-refund action |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, no Connect; payout via manual BKT batch — unchanged.
- **Confirmation trigger:** unchanged.
- **Idempotency:** unchanged (`booking-<id>-refund`).
- **Money:** integer minor units, EUR — unchanged.
- **Payout-ledger effect:** a one-day weather refund reverses once as today; a multi-day stay posts
  **nothing** (no `BookingCancelled`), because a partial reversal is unexpressible under
  `payout_once_per_booking` (invariant #9) — hence the manual list.
- **Refund policy applied:** server-side, unchanged for one-day bookings (#10).
- **Pinning tests:** `WeatherRefundServiceIT` (existing cases unchanged + the new stay case).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/payouts-tab.ts` notice | existing | copy in `weatherSuccessNotice` | `notice` signal, unchanged | none |
| FE-2 | `operator/operator-console.model.ts` `WeatherRefundResult` | existing | type | — | — |

## FE↔BE contract

- **Changed endpoint:** `POST /api/venues/{id}/weather-refund?date=` response gains
  `manualRefundCount: number` and `manualRefundBookingIds: number[]` (ids, never codes, #7).
- **Client typing:** hand-typed mirror in `operator-console.model.ts`; no `as any`.
- **Money/date on the wire:** unchanged.

## Execution status

**Stage pointer:** implement — phases 0–4 authored test-first; the backend ITs and the structural
net have NOT yet run locally (Maven Central rate-limits dependency resolution through the cloud
proxy; a retry loop is warming the cache). Frontend specs, lint and Prettier are green.

**PR:** draft #1213, subscribed.

**Next action:** run `BookingMigrationIT`, `BookingLastDateBackfillIT`, `ServiceDaysTest`,
`SpanReleaseIT`, `WeatherRefundServiceIT`, `StaffBookingControllerIT`, `JdbcBookingPresenceIT`,
`GuestContactRetentionIT`, the touched unit tests and the six-test net; open the draft PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V61: `last_date`, default trigger, span-aware `booking_day` trigger | ⏳ authored, ITs pending | |
| 1 — `ServiceDays` + every terminal leg and the move work on the span | ⏳ authored, ITs pending | |
| 2 — Overlap reads: staff daily list, presence, guest history | ⏳ authored, ITs pending | |
| 3 — Weather refund: overlap selection, stays named on the outcome + view | ⏳ authored, ITs pending | |
| 4 — Console notice names the stays | ⏳ specs green, e2e pending | |
| 5 — Docs freshness + close-out | ⏳ substrate docs written | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/resources/db/migration/V61__booking_last_date.sql` — column, CHECK, insert default, span-aware confirm trigger, backfill
- `platform/src/main/java/ai/riviera/platform/booking/domain/ServiceDays.java` — the inclusive day list of a span (twin of `booking_span_check`)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — `last_date` bound on insert, returned by every releasing transition, overlap on the daily/weather reads
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — `liveBookingsFrom` on `last_date`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcGuestBookingHistory.java` — retention basis on `last_date`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcDailyTakings.java` — Javadoc: first-day by decision, D4 owns the share
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — port Javadoc for the span
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ClaimRef.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelledBooking.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/request/WithdrawnRequest.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/LiveClaim.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RemodelClaim.java` — `lastDate`
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` — span release
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ClaimReleaseService.java` — span release
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RequestReleaseService.java` — span release ×3
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — span release ×3, span claim+release on the move
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundableBooking.java` — carries the span
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/WeatherRefundOutcome.java` — `manualRefunds`
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/WeatherRefundService.java` — one-day refund as today, stays named
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundForWeather.java` — contract
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/WeatherRefundView.java` — the two wire fields
- `platform/src/test/java/ai/riviera/platform/booking/BookingLastDateBackfillIT.java` — V60 → V61 backfill proof
- `platform/src/test/java/ai/riviera/platform/booking/BookingMigrationIT.java` — default, CHECK, span-aware service days
- `platform/src/test/java/ai/riviera/platform/booking/SpanReleaseIT.java` — every leg re-claims the span
- `platform/src/test/java/ai/riviera/platform/booking/WeatherRefundServiceIT.java` — the stay case
- `platform/src/test/java/ai/riviera/platform/booking/StaffBookingControllerIT.java` — overlap listing
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — straddling stay
- `platform/src/test/java/ai/riviera/platform/customer/GuestContactRetentionIT.java` — stay ending after the cutoff
- `platform/src/test/java/ai/riviera/platform/booking/domain/ServiceDaysTest.java` — pure rule
- `platform/src/test/java/ai/riviera/platform/booking/application/{cancel/CancelBookingServiceTest,request/RespondToRequestServiceTest,request/WithdrawRequestServiceTest,remodel/RemodelClaimsServiceTest,reserve/CreateBookingServiceTest}.java` — record constructors gain the last day
- `platform/src/test/java/ai/riviera/platform/booking/vocabulary/PreviewTokenTest.java` — record constructor
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — outcome constructor
- `frontend/src/app/operator/operator-console.model.ts` — `WeatherRefundResult` fields
- `frontend/src/app/operator/operator-console.service.spec.ts` — the outcome round-trips with the two new fields
- `frontend/src/app/operator/payouts-tab.ts` — notice names the stays
- `frontend/src/app/operator/payouts-tab.spec.ts` — the notice case
- `frontend/e2e/operator-payouts.e2e.ts` — stub fields + the notice case
- `RESPONSIBILITIES.md` — §booking: the span, every terminal transition releases every day, the weather refund names stays
- `CONTEXT.md` — service day / stay entries name `last_date`
- `docs/architecture/multi-day-stays.md` — status line: D3 + D5 landed
- `docs/plans/multi-day-span.md` — this plan

---

## Phase 0 — V61: the span on the row

**Files:** Create `V61__booking_last_date.sql` · Test `BookingMigrationIT`, `BookingLastDateBackfillIT`

- [ ] Step 1: failing tests — `lastDateDefaultsToTheFirstDay`, `lastDateBeforeTheFirstDayIsRefused`,
  `aConfirmedStayCarriesOneServiceDayPerDay`; `BookingLastDateBackfillIT` (context at
  `spring.flyway.target=60`, legacy inserts, programmatic migrate to latest, every row backfilled)
- [ ] Step 2: `./gradlew test --tests "*BookingMigrationIT*"` → FAIL (column absent)
- [ ] Step 3: the migration
- [ ] Step 4: both classes PASS
- [ ] Step 5: generalization — population: every fixture inserting `booking` rows; command below; the default trigger covers all
- [ ] Step 6/7: commit + Execution status

## Phase 1 — every terminal leg and the move work on the span

**Files:** Create `ServiceDays`, `SpanReleaseIT`, `ServiceDaysTest` · Modify the five services, the five records, `JdbcBookings`

- [ ] Step 1: `ServiceDaysTest` (inclusive list; reversed span refused) + `SpanReleaseIT` legs
- [ ] Step 2: `--tests "*SpanReleaseIT*"` → FAIL (only the first day re-claims)
- [ ] Step 3: RETURNING `last_date`, records, loops; the move claims the span
- [ ] Step 4: PASS; `--tests "*JdbcBookingTransitionTableIT*"` unchanged
- [ ] Step 5: generalization — `grep -n "availability.release(\|availability.claim(" platform/src/main/java/ai/riviera/platform/booking -r`
- [ ] Step 6/7: commit + Execution status

## Phase 2 — overlap reads

- [ ] Step 1: the three ITs' new cases
- [ ] Step 2: FAIL · Step 3: overlap predicates (`booking_date <= :date AND last_date >= :date`; `last_date >= :from`) · Step 4: PASS
- [ ] Step 5: generalization — `grep -rn "booking_date [<>=]" platform/src/main/java/ai/riviera/platform/booking` → each judged in the plan's assumptions
- [ ] Step 6/7

## Phase 3 — the weather refund names the stays

- [ ] Step 1: `WeatherRefundServiceIT.aStayOverlappingTheDateIsNamedNotRefunded`
- [ ] Step 2: FAIL · Step 3: overlap read carrying the span, the split in the service, outcome + view · Step 4: PASS, existing cases unchanged
- [ ] Step 6/7

## Phase 4 — the console notice

- [ ] Step 1: `payouts-tab.spec.ts` case + e2e case · Step 2: FAIL · Step 3: model + notice · Step 4: `npm test`, `npm run lint`, `npm run format:check`, mocked e2e spec
- [ ] Step 6/7

## Phase 5 — docs + close-out

- [ ] `RESPONSIBILITIES.md`, `CONTEXT.md`, design doc status; `riviera-docs-freshness` over the range; plan close-out in the last code-touching commit

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1 … AC-11: see the pin names above; verified at the close-out commit.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled; concurrency unchanged and pinned (#2).
- [ ] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable and never on the outcome (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay).
