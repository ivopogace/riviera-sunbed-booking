# A7 — Commission-rate backend (admin read + rate write, effective-dated) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give the platform admin an ADMIN-gated venues-with-commission list and an
ADMIN-gated commission-rate write (basis points 0..10000), and stop the operator console's
daily-takings strip from re-splitting **past** service dates at a newly changed rate.

**Architecture:** The one significant decision is **how the takings view stops re-pricing
history**: `venue` grows an **effective-dated commission schedule** (`venue_commission_rate`,
V39) alongside the existing live `venue.commission_bps`, and `venue::api VenueRates` grows
`commissionBpsOn(VenueId, LocalDate)` for the per-service-date read. The **accrual path is
untouched** — it keeps reading the live `commissionBps(VenueId)` at decision time, which is
what invariant #9 requires. A rate write is **forward-only**, in three ordered steps: it pins the
rate being superseded at an epoch floor (so past dates keep it), moves the live rate (so new accruals
use it immediately), then schedules the same value from **tomorrow** in `Europe/Tirane`. Every
service date already in the past therefore keeps the rate it was sold at. The two admin
endpoints live on their own **ownership-free** port in `venue` (`VenueCommissionAdministration`),
following the #511 precedent that keeps the venue-scoped contracts uniformly `assertOwns`-first.

**Persistence:** JDBC only (invariant #1). New table `venue_commission_rate` (Flyway **V39**,
verified free on `main` and unclaimed by any open PR); `venue` and `payout_ledger_entry` DDL
unchanged.

**Source of intent:** GitHub epic **#348** (slice **A7**) — body's *Commissions* scope note +
the [2026-08-05 staleness audit comment](https://github.com/ivopogace/riviera-sunbed-booking/issues/348#issuecomment-5191131810).
A4 shipped as PR #521.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that the
epic's scope note 3 is the real design work and that A8/Q1 make this slice backend-only) ·
`riviera-plan-doc` (this template — forced the alternatives for scope note 3 into the
open-questions register instead of a one-line "add rate history") · `tdd` (each phase is
red→green: the failing takings/rate-schedule test before the migration and the service) ·
`riviera-review-overlay` (review gate — ran at ready-for-review over PR #522; contributed RV-STYLE-1 and RV-PROC-1, and RV-BE-9/#13's admin-exemption check) · `riviera-docs-freshness`
(**ran** over `origin/main..HEAD` at phase 4 — patched the `VenueRates` Javadoc, the two "display-only" notes, `RESPONSIBILITIES.md` §`venue`/§`payout` and `CLAUDE.md`'s venue row; the row's length was then cut again as F-4). **Counting sweep** (procedure step 2b) then found one statement the diff could not show: `CONTEXT.md`'s `Commission` glossary entry said only "rate stored per venue", with no notion of *when* a rate applied — incomplete once the domain gained an effective-dated schedule. Extended, plus a new `Rate schedule` entry. Checked and cleared: `CONTEXT.md`'s "both … share one port" (photo-scoped, still true), ADR-0008's ownership-free notes (photo-scoped), and every doc citing V38 as the highest migration (only plan docs, which are historical records) ·
`riviera-modulith` (placed the ownership-free operations on their own `VenueCommissionAdministration`
port per the #511 precedent, kept `commissionBpsOn` on the role-split `VenueRates` rather than
regrowing `VenueCatalog`, and confirmed no new `allowedDependencies` grant is needed) ·
`riviera-java-conventions` (records for the views/DTOs, package-private `@Service` + adapter,
`InvalidApiRequestException.parsing` for the edge translation rather than a raw
`IllegalArgumentException`, named constants for the epoch floor) · `postgres` (composite PK
`(venue_id, effective_from)` serves the "latest ≤ date" lookup on its own index — no duplicate
index; `DATE` not `TIMESTAMPTZ` because a service date is a civil date; CHECK mirrors
`venue_commission_bps_check`) · `riviera-stripe-payments` (confirmed the commission split stays
`payout`'s `CommissionSplit` — collect-only, no Connect, nothing about settlement moves here) ·
angular-cli MCP `search_documentation` (Angular 22 — confirmed the list's object envelope suits `httpResource` and that its `parse` option covers validation, and that the rate write must be a plain `HttpClient.put` since the guide forbids `httpResource` for mutations; recorded for A8 in the FE↔BE contract section, no backend change) · `riviera-local-debug` (system `gradle` + JDK-25 toolchain, scoped tests only — the wrapper
cannot self-provision in this cloud session and the bare `test` task OOMs)

**Branch:** `claude/commission-rate-backend-a7-5wwz58` — the cloud session's **designated remote
branch stands in for `feature/<slug>`** (`riviera-sdlc` §Remote/cloud addendum); branched off
`main` at `8b134ac`.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given venues exist with their commission rates, when the platform admin reads the
      venues-with-commission list, then every venue is returned with its id, name, beach,
      `commissionBps` and `payoutCurrency`, ordered by name then id. *Pinned by:*
      `AdminVenueCommissionIT.adminListsEveryVenueWithItsCommissionRate`
- [x] **AC-2:** Given a venue with `commissionBps = 1500`, when the platform admin writes
      `commissionBps = 2000`, then the venue's live rate is 2000 (so the next accrual uses it) and
      the write answers the updated view. *Pinned by:*
      `VenueCommissionServiceTest.writeUpdatesTheLiveRateAndSchedulesItFromTomorrow`,
      `AdminVenueCommissionIT.adminChangesAVenuesRateForwardOnly`
- [x] **AC-3:** Given a venue whose rate changed from 1500 to 2000 bps today, when the daily
      takings for a service date **before** the change's effective date are read, then the split
      still uses 1500 bps — history is never repriced (invariant #9). *Pinned by:*
      `DailyTakingsServiceTest.pastServiceDatesKeepTheRateTheyWereSoldAt`,
      `VenueCommissionForwardOnlyIT.aRateChangeDoesNotResplitPastServiceDatesNorTouchTheLedger`
- [x] **AC-4:** Given a rate write, when `commissionBps` is absent, negative, or greater than
      10000, then the write is rejected with `400 INVALID_REQUEST` and no rate changes. *Pinned by:*
      `AdminVenueCommissionControllerTest.rejectsOutOfRangeAndMissingBasisPoints`
- [x] **AC-5:** Given a venue id that no venue has, when the platform admin writes a rate, then the
      write answers `404 NO_SUCH_VENUE` and nothing is scheduled. *Pinned by:*
      `VenueCommissionServiceTest.anUnknownVenueSchedulesNothing`,
      `AdminVenueCommissionIT.unknownVenueIsNotFound`
- [x] **AC-6:** Given a genuinely non-admin `ACTIVE` operator with a session, when it reads the
      venues-with-commission list or writes a rate, then both answer `403`; anonymous answers
      `401`; and the admin still succeeds (so the gate held rather than merely answering).
      *Pinned by:* `AdminVenueCommissionIT.commissionSurfaceIsAdminOnly`
- [x] **AC-7:** Given the operator's own venue-profile `PATCH`, when it is submitted by the owner,
      then `commissionBps` is still unwritable through it (O8 #177 stands). *Pinned by:*
      the existing `VenueAdminServiceTest` / `VenueProfileConcurrencyIT` plus
      `AdminVenueCommissionIT.theOwnerCannotChangeItsOwnRateThroughEitherSurface`
- [x] **AC-8:** Given a venue created by **any** path — including raw SQL, not only
      `Venues#insertVenue` — when its rate is changed for the first time, then the superseded rate is
      pinned at the epoch floor so every past service date still resolves to it, and a venue whose rate
      never changed needs no schedule row at all. *Pinned by:*
      `JdbcVenueCommissionScheduleIT.aRateChangeLeavesEveryPastServiceDateAtTheRateItWasSoldAt`,
      `JdbcVenueCommissionScheduleIT.aVenueThatNeverChangedRateNeedsNoScheduleAtAll`,
      `VenueCommissionServiceTest.thePreviousRateIsPinnedBeforeTheLiveColumnMoves`
      *(revised from a migration-backfill claim — see the Findings register, F-1)*

## Non-goals

- **Any frontend work.** A8 (the Commissions tab) is blocked on this **and** Q1 (tab IA); this
  slice ships no Angular, no e2e spec, and no `X-Audit-Reason` collection on a confirmation
  (that is A8's job, per the epic).
- **Loosening the operator's profile `PATCH`.** O8 #177's read-only-for-operator decision stands;
  the admin write is a separate surface with a separate authorization posture.
- **Percent-vs-bps presentation.** This slice stores and returns the integer; the human-facing
  percent editor is A8's.
- **Per-controller audit instrumentation.** #507's edge filter already records every mutating
  `/api/admin/**` action (actor, method, path, status, sanitized `X-Audit-Reason`).
- **Backdating a rate, or repricing the ledger.** The write is forward-only by construction; there
  is no endpoint that can write a past effective date and no path that rewrites
  `payout_ledger_entry.commission_minor` (invariant #9).
- **Making the daily-takings strip ledger-derived.** Considered and rejected — see Open questions
  §*Scope note 3 alternatives*.
- **Admin-side venue creation or owner re-assignment.** Explicit epic non-goals.
- **A machine-checked "every `/api/admin/**` matcher is ADMIN-gated" test.** Left undone by A4 for
  want of a matcher-enumeration seam; unchanged here. `EndpointRoleGateCoverageTest` still proves
  the new endpoints are not reachable by an arbitrary authenticated principal.

## Behavior-parity ledger (retirement / replacement slices only)

The slice adds two endpoints and retires nothing, but it **changes one existing behavior** — the
daily-takings commission read — so that one row is ledgered rather than claimed as "no behavior
change".

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `DailyTakingsService` reads `rates.commissionBps(venueId)` — the **live** rate — and applies it to the requested service date's gross | **changed** | now reads `rates.commissionBpsOn(venueId, date)` — the rate scheduled for that service date. Identical output for every venue whose rate has never changed — such a venue has **no** schedule rows, and the read's `COALESCE` falls back to the live column, which is exactly what applied. It diverges only after a rate write, which is the point |
| `DailyTakingsView.commissionBps` reports the rate applied | **preserved** | still the single rate applied to the aggregate; its value is now the service-date rate rather than the live one |
| A venue with no rate at all yields `0` bps and net == gross (no exception) | **preserved** | `commissionBpsOn` returns `OptionalInt.empty()` for an unknown venue exactly as `commissionBps` does; the service keeps `.orElse(0)` |
| Ownership asserted **before** any financial read (invariant #13) | **preserved** | `assertOwns` remains the first statement of `forVenueOn`; the rate read moves but stays after it |
| Ledger accrual reads the live rate at accrual time (`BookingConfirmedPayoutListener`) | **preserved — deliberately untouched** | no change to the listener, the port method it calls, or `CommissionSplit`; verified by leaving `PayoutAccrualIT`/`PayoutModuleTest` unmodified |
| `venue.commission_bps` is the one column the profile `PATCH` may not write | **preserved** | `updateVenueProfile`'s SET clause is unchanged; the new write is a different statement on a different surface |
| Venue creation writes `commission_bps` from `NewVenueCommand` | **preserved — unchanged after all** | an interim design seeded a schedule row here; CI showed that made coverage depend on every insert path (F-1), so the seed moved into the rate write and `insertVenue` is byte-for-byte as it was |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Two sources for "the commission rate"** (`venue.commission_bps` live vs the schedule) drift, so accrual and the view disagree permanently | med | high | One transaction writes both, always with the same bps value; the schedule never carries a value the live column doesn't also hold. The divergence is *temporal only* (which dates the value applies to), never in value. Pinned by `VenueCommissionServiceTest.writeUpdatesTheLiveRateAndSchedulesItFromTomorrow` and `VenueCommissionForwardOnlyIT` | claude | closed — one `@Transactional` write sends the same bps to both; divergence is temporal only, never in value |
| R-2 | A gap in the schedule makes `commissionBpsOn` fall through and silently return the **new** rate for a past date — the exact bug being fixed | med | high | **The mitigation moved during implementation, because CI proved the first one wrong (F-1).** Totality is now a property of the *write*: a rate change pins the superseded rate at the epoch floor (`ON CONFLICT DO NOTHING`, so only the first change writes it) before moving the live column, and the read falls back to the live rate only when the venue has *no* schedule at all — which means its rate never changed, so the live rate is exactly what applied. No creation path has to cooperate. Pinned by `JdbcVenueCommissionScheduleIT` (which inserts its venues with raw SQL on purpose) + `VenueCommissionServiceTest.thePreviousRateIsPinnedBeforeTheLiveColumnMoves` | claude | closed — `HEAD` |
| R-3 | **History repriced** (invariant #9) by a write that lands on a past date — e.g. a clock in the wrong zone putting "tomorrow" in the past | low | high | `effective_from` is computed server-side only, as `LocalDate.now(clock)` in `Europe/Tirane` **plus one day** (invariant #6); no request field can influence it, and there is no endpoint that writes an arbitrary effective date. Pinned by `VenueCommissionServiceTest` with a fixed clock straddling the Tirane/UTC day boundary | claude | closed — pinned by `VenueCommissionServiceTest.tomorrowIsReckonedInTiraneNotUtc` (fixed clock at 22:30 UTC, already the next day in Tirane) |
| R-4 | **Money rounding** (invariant #5) changes because the commission is computed somewhere new | low | high | It is not computed anywhere new: `CommissionSplit.of(gross, bps)` remains the single formula for both the accrual and the view; only the *bps input* to the view's call changes. `CommissionSplitTest` and `CommissionMathTest` are unmodified and must stay green | claude | closed — `CommissionSplitTest`/`CommissionMathTest`/`ReversalMathTest` unmodified and green; `VenueCommissionForwardOnlyIT` also asserts an accrued `commission_minor` is untouched |
| R-5 | **BOLA / role-level-only authorization** on the new surface (OWASP API #1) — the A4 defect class | med | high | Both endpoints are `/api/admin/**` with `hasRole(ADMIN_ROLE)`, which is invariant #13's admin exemption and therefore the **whole** authorization. Proven against a **genuinely non-admin `ACTIVE` operator with its own session**, provisioned through the real `OperatorProvisioning` as `AdminPhotoModerationIT`/`AdminPhotoTakedownIT` do — the bootstrap `operator` is the platform admin (`is_admin`, V29) and `CrossVenueDenialIT`'s `operatorA` has no `password_hash`, so neither can demonstrate a `403`. Pinned by `AdminVenueCommissionIT.commissionSurfaceIsAdminOnly` | claude | closed — pinned by `AdminVenueCommissionIT.commissionSurfaceIsAdminOnly` + `theOwnerCannotChangeItsOwnRateThroughEitherSurface` |
| R-6 | A new endpoint falls through to `anyRequest().authenticated()` (the #316/#317/#328 defect class) | low | high | `EndpointRoleGateCoverageTest` fails the build for any mapped endpoint with no explicit `SecurityConfig` rule; both new matchers are added there with the rationale on the constants | claude | closed — `HEAD`, green |
| R-7 | **Module boundary leak** (invariant #11): the admin surface reaches into `venue`'s internals, or the ownership-free write gets hung off the `assertOwns`-first `Venues`/`EditVenueProfile` contracts | med | med | The ownership-free operations get their own port, `VenueCommissionAdministration` in `venue/application`, named for the posture every method shares (#511's argument). `commissionBpsOn` goes on the role-split `VenueRates`, not back onto `VenueCatalog` (`VenueApiRoleSplitTests`). No new `allowedDependencies` grant: `payout` already lists `venue::api`, and `venue` needs nothing new. Pinned by `ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` | claude | closed — `ModularityTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests`, `ResponsibilitiesArchitectureTests` all green |
| R-8 | **Error contract** drift — a per-controller `{"error": …}` body, or a raw `IllegalArgumentException` masquerading as a client error | low | med | One RFC-7807 contract (#97): `ApiProblem.response` for the typed-outcome rejection (`404 NO_SUCH_VENUE`), and `InvalidApiRequestException.parsing(...)` at the request→command conversion so a bad bps is a logged-free `400 INVALID_REQUEST` and a stored-state bug stays a 500 (§6b, #118). No `@ExceptionHandler` in the controller. Pinned by `AdminVenueCommissionControllerTest` + `ErrorContractArchitectureTests` | claude | closed — pinned by `AdminVenueCommissionControllerTest` + `ErrorContractArchitectureTests`, green |
| R-9 | **Flyway number collision** — V39 claimed by a parallel slice | low | med | Verified free on `main` (`V38__admin_audit_record.sql` is the highest) and unclaimed by any open PR's diff at plan time. If a parallel slice merges first, **whoever merges second renumbers** (default rule); the migration is self-contained, so renumbering is a file rename | claude | closed — V39 still the highest at push time; no renumber needed |
| R-10 | Duplicate `commissionBps` validation drifts from the DB CHECK | low | low | `VenueFieldValidation.requireCommissionBps` is **reused** by `CommissionRateCommand`, not duplicated; `venue_commission_rate_bps_check` mirrors the same bound as the race-safe backstop, pinned by `VenueCommissionScheduleMigrationIT` | claude | closed — `HEAD` |
| R-11 | Adding a method to the published `VenueRates` port breaks every test fake that implements it | high | low | Known set, updated in the same phase: `WebSliceStubs.venueRates()` and `DailyTakingsServiceTest`'s fakes. `PayoutModuleTest` uses `@MockitoBean` and needed no change. Compile failure was the detector, as expected — and it also caught the missing `VenueCommissionAdministration` web-slice stub | claude | closed — `HEAD` |

## Open questions / Assumptions

- **Assumption:** `GET /api/admin/venues` may leak venue existence freely — unlike the photo
  moderation surface, which blurs unknown-venue vs empty-slot. Grounds: venues are already
  publicly enumerable through the anonymous discovery read `GET /api/venues`, so there is no
  existence signal to protect. Consequently the rate write answers a plain `404 NO_SUCH_VENUE`.
  — *Resolved* in phase 3: recorded on `AdminVenueCommissionController` and
  `VenueCommissionAdministration`, and the `404 NO_SUCH_VENUE` is pinned by
  `AdminVenueCommissionIT.unknownVenueIsNotFound`.
- **Assumption:** the venues-with-commission list needs no pagination at v1 scale (5–15 venues,
  per ADR-0002's operational note). If the platform outgrows that, the list gets a page window in
  its own slice. — *Resolved* in phase 3: the list is an object wrapping the array
  (`{"venues": [...]}`), precisely so a page window can be added without breaking its clients.

### Resolved

- **Open question (epic scope note 3): how does the takings view stop re-splitting past days?**
  **Resolved: effective-dated rate schedule in `venue`, read by service date; live rate untouched
  for accrual; writes effective from tomorrow (`Europe/Tirane`).** Recorded at plan time; pinned by
  AC-3.

  **What the guarantee actually is.** Exact agreement between the strip and the ledger is *not*
  achievable per-day, and claiming it would be dishonest: the ledger's commission is per **booking**
  at **accrual** (confirmation) time, while the strip applies **one** rate to a **service date's**
  aggregate. A booking for a future service date confirmed *before* a rate change accrued at the old
  rate, while the strip for that date will show the new one. No single-rate-per-date scheme can
  reproduce a per-booking mix. What this slice guarantees instead is the property the epic actually
  reported broken: **a service date in the past is never re-split.** Once a day has passed, its
  scheduled rate is frozen, so the figure an operator read yesterday is the figure they read today.
  Bookings for **today** are exact too — invariant #4 closes them the evening before, so they
  accrued under the rate the schedule still shows for today. The residual is bounded to service
  dates from the effective date onward that were already on the books, and it converges as the
  pre-change backlog is served. The view stays **indicative** (its Javadoc already says so); the
  ledger stays authoritative and is never repriced.

  **Why "tomorrow" and not "today".** Today's bookings all closed at 18:00 yesterday (invariant #4),
  so making a change effective today would guarantee a divergence for a full day's already-accrued
  bookings. Tomorrow is the earliest date whose bookings can still be confirmed *after* the change,
  so it is the earliest boundary that is not wrong by construction.

  **Alternatives weighed and rejected:**

  | Alternative | Why not |
  |---|---|
  | **Read the historical commission off the ledger for that date** | Not available: `payout_ledger_entry` (V9) has no service date — its columns are id, venue_id, booking_id, entry_type, gross_minor, commission_minor, net_minor, currency, created_at, and `created_at` is accrual time, not service date |
  | **Add `service_date` to `payout_ledger_entry` (V39) and make the strip ledger-derived** | The *exact* answer, and genuinely tempting — but it (a) changes the accrual path, which this slice must not do, (b) needs a new per-booking service-date read on `booking::api` for the listener, (c) makes the strip lag the async registry accrual, so a booking confirmed seconds ago vanishes from a live operational readout — a real UX regression, and (d) turns `commissionBps` on the view into a blended rate with no single value to report. Bigger blast radius than a commission-rate slice warrants. Worth its own issue if the strip is ever promoted from indicative to authoritative |
  | **Carry the rate on `BookingConfirmed`** | Contradicts invariant #11 (event payloads carry technical ids, not mutable business fields) and the standing `VenueRates` Javadoc decision that the rate is re-read at accrual time, not fixed on the booking |
  | **Do nothing — accept that past days re-split** | This is the reported defect; an operator's past statements would silently change value under them |
  | **Freeze the whole rate (no write at all) and reject the epic slice** | The gap the epic names is precisely that a rate typed wrong at onboarding is permanent |

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No path in this slice reads or writes
`set_availability(set_id, booking_date)`, creates or transitions a booking, or touches
`set_position`. The commission rate is venue configuration; the takings read is a
read-only aggregate over already-`CONFIRMED` bookings via `booking::api DailyTakings`.
The one concurrency question the slice *does* raise is two admins writing a rate for the
same venue on the same day: the schedule write is
`INSERT … ON CONFLICT (venue_id, effective_from) DO UPDATE`, so the last writer wins on
a single row rather than erroring or duplicating, and it shares the service's
`@Transactional` boundary with the live-column `UPDATE`. Invariants #3 (pool) and #4
(cutoff) are unaffected — #4 is nevertheless *load-bearing for the design* and is argued
in the Resolved open question above.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | Owns the commission **rate** and its storage (`RESPONSIBILITIES.md` §`venue`; `payout`'s Not-My-Job: "Setting the commission rate → `venue`"). The rate *schedule* is the same fact over time, so it lands here too — and the ownership-free admin surface follows the #504/#511 precedent of hosting module-owned admin operations in the module, not at the composition root |
| M-2 | `payout` | existing | `PayoutLedgerEntry` | Owns the commission **arithmetic** (`venue`'s Not-My-Job: "The payout math or commission arithmetic → `payout`"). Only its *input* changes: `DailyTakingsService` asks for the service-date rate instead of the live one. `CommissionSplit` is untouched, so the accrual and the view keep sharing one formula |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `VenueRates#commissionBpsOn(VenueId, LocalDate)` *(new method on the existing port)* | `VenueId` (`venue::vocabulary`), `java.time.LocalDate`, `OptionalInt` | `payout` (`DailyTakingsService`) |
| NI-2 | `venue.api` | `VenueRates#commissionBps(VenueId)` *(unchanged)* | as today | `payout` (accrual listener), `booking` (`CancellationPolicy`) |

No new `allowedDependencies` grant: `payout` already depends on `venue::api` +
`venue::vocabulary`, and `venue` needs nothing it does not already list
(`operator::api`, `operator::vocabulary`, `shared`).

**Module-internal ports (not published — invariant #11)**

| Port | Package | Implemented by | Consumed by |
|---|---|---|---|
| `VenueCommissionAdministration` (new, **ownership-free** driving port) | `venue.application` | `VenueCommissionService` (package-private `@Service`) | `AdminVenueCommissionController` (`venue.adapter.in`) |
| `CommissionRateStore` (new **driven** port — the schedule + live rate + the platform-wide list) | `venue.application` | `JdbcVenues` (`venue.adapter.out`, now implementing both ports) | `VenueCommissionService` |
| `Venues` (existing driven port, **signature-unchanged**) | `venue.application` | `JdbcVenues` | `VenueAdminService` |

> **Deviation from the plan as drafted, resolved during phase 0.** The three storage operations were
> going to be three more methods on `Venues`. Adding them broke `VenueAdminServiceTest.FakeVenues` —
> a ~130-line fake of an already 17-method port — which is the same god-port strain #94 split
> `VenueCatalog` for, and `riviera-modulith` warns against directly. They moved to their own
> purpose-named driven port, `CommissionRateStore`: `Venues` keeps its signature **and** its
> behavior (an interim version had `insertVenue` seed the schedule; F-1 removed that), the commission
> service's test fake is three methods rather than seventeen, and a caller that only administers
> rates cannot reach the beach-map writes. One adapter implements both ports, because both write the
> same venue row and splitting the SQL would duplicate the seed.

**Domain events (id-based payloads, invariant #11)**

None. A rate change publishes no event: the accrual path re-reads the rate at decision time
(that is the standing `VenueRates` decision), so no subscriber needs telling, and the
audit record #507 writes at the edge is the accountability trail. Adding an event would
create a subscriber with nothing to do — and a payload carrying a mutable business field,
which invariant #11 forbids.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store a venue's commission rate **over time** (the effective-dated schedule) | `venue` | `venue` Job: "Own venue profiles … pricing"; it already stores `commission_bps`. `payout`'s Not-My-Job is explicit: "Setting the commission rate → `venue`". A schedule is the same owned fact with a date dimension, not new territory |
| Answer "what rate applied on service date D" (`commissionBpsOn`) | `venue` | Same ground — it is a read of venue-owned state, published on the role-split rates port. `payout` must not hold rate history: that would be storing the rate, which is on its Not-My-Job list |
| Write a venue's commission rate as the **platform admin** (ownership-free) | `venue` | `venue` owns the rate, so it owns the write. The *authority* is not `venue`'s — the `ADMIN` role gate is the whole authorization (invariant #13 exempts `/api/admin/**`), exactly as `RESPONSIBILITIES.md` §`venue` already records for `VenuePhotoModeration`. Kept on a separate port so `VenuePhotos`/`EditVenueProfile`'s "asserts `assertOwns` first" contract stays uniform |
| List every venue with its commission rate | `venue` | It is a venue read model; `venue` already assembles venue read models for other actors (`GET /api/venues/mine`, the owner profile) |
| Split a service date's gross into commission + net at the **service-date** rate | `payout` | `payout` Job: owns the ledger and the commission arithmetic; `venue`'s Not-My-Job: "The payout math or commission arithmetic → `payout`". Unchanged ownership — only the rate input changes |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Nothing in this
  slice touches collection, settlement, or the gateway.
- **Confirmation trigger:** unchanged — signature-verified webhook (invariant #8). No code on the
  webhook path is modified.
- **Idempotency:** unchanged. The ledger's `UNIQUE (booking_id, entry_type)` exactly-once guard and
  the accrual's `ON CONFLICT DO NOTHING` are untouched. The new schedule write has its own
  idempotency on `(venue_id, effective_from)`.
- **Money:** integer minor units, EUR (invariant #5). Basis points stay an exact `int`, 0..10000;
  `CommissionSplit.of` keeps `floorDiv(gross × bps, 10000)` with the sub-cent remainder to the venue.
  **No new arithmetic is introduced anywhere.**
- **Payout-ledger effect:** **none.** No accrual, no reversal, no column of `payout_ledger_entry`
  is written or rewritten. This is the whole content of "forward-only" (invariant #9): a rate change
  cannot reach an entry that already exists, and past statements stay as sent.
- **Refund policy applied:** unchanged (invariant #10). `lateCancelRefundBps` is not touched;
  `CancellationPolicy` keeps reading it live.
- **Pinning tests:** `PayoutAccrualIT`, `PayoutReversalIT`, `PayoutModuleTest`, `CommissionMathTest`,
  `CommissionSplitTest`, `ReversalMathTest` — all **unmodified**, and all must stay green: that they
  need no edit is the evidence the money path did not move. Plus the new
  `VenueCommissionForwardOnlyIT`, which asserts a rate change leaves an existing ledger entry's
  `commission_minor` byte-identical.

## Angular — frontend surfaces touched

`N/A — backend-only.` A8 owns the Commissions tab and is blocked on this slice **and** on the
epic's Q1 (tab information architecture); the task brief scopes A7 to the backend explicitly.

## FE↔BE contract

- **New endpoints:**
  - `GET /api/admin/venues` → `200`
    `{ "venues": [ { "venueId": 1, "name": "…", "beach": "…", "commissionBps": 1500, "payoutCurrency": "EUR" } ] }`
    — ordered by name then id. ADMIN only.
  - `PUT /api/admin/venues/{venueId}/commission`, body `{ "commissionBps": 2000 }` →
    `200` with the single updated venue object (same shape as a list element);
    `404 NO_SUCH_VENUE`; `400 INVALID_REQUEST` for a missing/out-of-range value. ADMIN only,
    CSRF-protected like every mutating SPA call.
- **Changed endpoints:** none in shape. `GET /api/venues/{venueId}/takings?date=` keeps its
  response contract exactly; only which rate feeds `commissionBps` changes.
- **Client typing:** no client in this slice (see Non-goals). A8 will type it as a hand-written typed
  service per `riviera-frontend`; never `as any`. Two notes checked against the Angular 22 docs
  (angular-cli MCP `search_documentation`, `frameworkVersion: 22`) so the contract shipped here suits
  the client that will consume it:
  - The **list** is a plain JSON object envelope, which `httpResource` reads directly, and its `parse`
    option can validate it if A8 wants a schema
    ([httpResource: response parsing and validation](https://angular.dev/guide/http/http-resource#response-parsing-and-validation)).
  - The **write must not** use `httpResource` — the guide is explicit: *"Avoid using httpResource for
    mutations like POST or PUT. Instead, prefer directly using the underlying HttpClient APIs."* So the
    rate write is an `HttpClient.put` call in A8, not a resource.
  - Deliberate contract symmetry that pays off there: the `PUT` answers **the same object shape** as one
    element of the list, so A8 needs one type and one parse for both, and can splice the response
    straight back into the list it already holds instead of re-fetching.
- **Money/date on the wire:** commission as exact-integer basis points (never a float, never a
  percent string); no amounts and no dates cross this contract, so there is nothing else to agree.

## Execution status

**Stage pointer:** `DONE` — **merged via PR #522**. CI green on `f80076e` (run 31017941010, all 7 checks), review gate run (6 findings: 5 fixed, 1 declined with reasons), Sonar gate green with a verified-empty issue list (`new_lines: 601`, so the zero is a real analysis, not the false-clean read).

**Next action:** None — slice complete. Post-merge, GitHub-only: tick A7 on epic #348's checklist
citing PR #522, and (optionally) open the follow-up issue F-3 suggests for an authoring-time
RV-STYLE-1 guard.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V39 schedule table + `CommissionRateStore` + `commissionBpsOn` (venue storage) | ✅ | `db73e56` |
| 1 — Takings view reads the service-date rate (payout) | ✅ | `db73e56` (same commit — the port method and its one consumer) |
| 2 — `VenueCommissionAdministration` port + service (venue) | ✅ | `7d89c0b` |
| 3 — Admin endpoints + ADMIN gate + wire contract | ✅ | `7d89c0b` |
| 4 — Docs sweep (`riviera-docs-freshness`) + close-out | ✅ | `7d89c0b` |
| 5 — Review-gate fixes (F-2 timezone, F-3 RV-STYLE-1, F-4 CLAUDE.md row) | ✅ | `d4b034d` |
| 6 — Plan-doc staleness (F-5) + Angular client notes + `CONTEXT.md` glossary | ✅ | `5d69a1b`, `f80076e`, close-out commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run 31014457784, `Backend (build + test)`) | `VenueCommissionScheduleMigrationIT.backfillsEveryVenueAtTheEpochFloor` failed in the full suite: it asserted *every* venue has an epoch-floor schedule row, but the shared Testcontainers DB accumulates venues from every other IT, most inserted with raw SQL that bypasses `Venues#insertVenue`. Exactly the full-suite-only class `riviera-local-debug` documents — and a genuine design flaw, not a test artifact: the schedule's totality depended on every creation path cooperating, which nothing enforces. | fixed-in-`HEAD` — redesigned rather than re-scoped. Dropped the V39 backfill and the create-time seed; a rate change now pins the superseded rate at the floor itself (`ON CONFLICT DO NOTHING`) and the read falls back to the live rate only for a venue with no schedule at all. Totality became a property of the write. `JdbcVenueCommissionScheduleIT` now inserts venues with raw SQL deliberately, as the regression guard. AC-8 and R-2 revised accordingly. |
| F-2 | review gate (`/code-review` fan-out, CLAUDE.md-compliance agent) | `VenueCommissionForwardOnlyIT` computed "tomorrow"/"three days ago" with `LocalDate.now()` — the **JVM default zone** — while the service it asserts against reckons the effective date in `Europe/Tirane` off a UTC clock. Between ~22:00 UTC and midnight the two disagree by a day, so `theNewRateGovernsServiceDatesFromTomorrowOnward` would demand the new rate for a date the schedule correctly still governs at the old one: a genuine CI flake, in the very test meant to pin the Tirane reckoning. Invariant #6 ("Never rely on the JVM default timezone"). The sibling `AdminVenueCommissionIT` already used `LocalDate.now(TIRANE)`, so the pattern was known and applied inconsistently. | fixed — both call sites now use `LocalDate.now(TIRANE)`, with the zone constant carrying why on its Javadoc |
| F-3 | review gate (prior-PR-comment agent) | **RV-STYLE-1**: ten multi-line inline `//` comments added across `SecurityConfig`, `JdbcVenues`, `JdbcVenueCatalog`, `VenueCommissionService` and three tests. `riviera-java-conventions` §6c: an inline comment must fit on one line; Javadoc on the declaring member is exempt. Raised on seven consecutive PRs touching these same files (#438, #480, #506, #512, #514, #516, #521) — #521 had just fixed the exact `SecurityConfig` matcher block this PR re-broke. | fixed — every site either shortened to one line or moved to Javadoc on the declaring method/test; verified none remain by scanning the working-tree diff for runs of consecutive added `//` lines |
| F-4 | review gate (prior-PR-comment agent) | The `venue` row of `CLAUDE.md`'s module table grew ~100 words of A7-specific mechanics, against that file's own rule ("Keep this file short and stable; detailed, situational guidance lives in the skills, not here") and on the table's already-longest row. Same finding as #438 raised against the `notification` row. | fixed — the row's addition cut to ~55 words ending in a pointer to `RESPONSIBILITIES.md` §`venue`, which this PR updates with the full mechanics |
| F-5 | review gate (code-comment agent) | Seven sentences in **this plan doc** still described the design F-1 abandoned — the behavior-parity ledger row and the File-structure list claimed a V39 backfill and a `insertVenue` schedule seed, the Modulith deviation callout said `insertVenue`'s behavior "gains the schedule seed", and two phase-0 steps still specified the backfill SQL. Each contradicted the shipped code *and* other rows of the same doc. The plan doc is the source-of-intent artifact (`riviera-sdlc` rules 10–11), so a stale one misinforms the next session more than no doc would. Notably the migration header and both storage ITs described the abandonment correctly — the doc was the only thing left behind. | fixed — all seven rewritten against the shipped design; every surviving mention of "backfill" is now an explicit F-1 reference to the abandoned one |
| F-6 | review gate (code-comment agent, judgment call) | The 6-line `--` comment block inside V39's `CREATE TABLE` body, between the column list and `PRIMARY KEY`. | **no change — not a violation.** RV-STYLE-1's scope names `//`, `#`, `/* */` and `<!-- -->`, not SQL `--`, and `V9__payout_ledger.sql` already carries exactly this shape (a two-line `--` rationale immediately above `CONSTRAINT payout_once_per_booking`). The migrations' explain-the-invariant-at-the-constraint style is house convention, and reflowing it here would make V39 the odd one out |

---

## File structure

**Created**

- `platform/src/main/resources/db/migration/V39__venue_commission_rate_schedule.sql` — the
  effective-dated schedule table. Deliberately **empty at migration** — it is a change log, and the
  write is what keeps the read total (see F-1).
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionAdministration.java` —
  the ownership-free admin port (list + write), named for the posture its methods share.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionService.java` —
  package-private `@Service` implementing it; owns the forward-only rule and the transaction.
- `platform/src/main/java/ai/riviera/platform/venue/application/CommissionRateStore.java` — the
  driven port for the schedule write, the live-rate write and the platform-wide list.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueCommissionView.java` — the
  per-venue commission read model.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionController.java` —
  `GET /api/admin/venues`, `PUT /api/admin/venues/{venueId}/commission`.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionsResponse.java` —
  the list wire shape.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetCommissionRequest.java` — the
  write's request DTO.
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueCommissionServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/adapter/in/AdminVenueCommissionControllerTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/AdminVenueCommissionIT.java`
- `platform/src/test/java/ai/riviera/platform/venue/VenueCommissionScheduleMigrationIT.java`
- `platform/src/test/java/ai/riviera/platform/venue/JdbcVenueCommissionScheduleIT.java`
- `platform/src/test/java/ai/riviera/platform/payout/VenueCommissionForwardOnlyIT.java`

**Modified**

- `platform/src/main/java/ai/riviera/platform/venue/api/VenueRates.java` — add
  `commissionBpsOn`; qualify the "read at decision time" sentence (it stays true of accrual and
  becomes explicit about the per-service-date read).
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — implement
  `commissionBpsOn`.
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `insertVenue`'s
  `findProfile` Javadoc points at the admin write for the rate; `insertVenue` is untouched, signature
  **and** behavior.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — implements
  `CommissionRateStore` too (`ensureFloorRate`/`updateLiveRate`/`schedule`); `insertVenue` unchanged.
- `platform/src/main/java/ai/riviera/platform/payout/application/DailyTakingsService.java` — read the
  service-date rate; Javadoc says why.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — two matcher constants + rules.
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java`,
  `payout/application/DailyTakingsServiceTest.java` — the `VenueRates` fakes gain the new method.
- `CLAUDE.md` (venue module row), `RESPONSIBILITIES.md` (§`venue`, §`payout`),
  `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueProfileResponse.java` +
  `venue/application/VenueProfileView.java` (the "display-only" note now has an admin counterpart
  to point at) — the docs sweep, phase 4.

---

## Phase 0 — V39 schedule table + `commissionBpsOn`

**Files:** Create `V39__venue_commission_rate_schedule.sql`, `VenueCommissionScheduleMigrationIT`,
`JdbcVenueCommissionScheduleIT` · Modify `venue/api/VenueRates.java`,
`venue/adapter/out/JdbcVenueCatalog.java`, `venue/application/Venues.java`,
`venue/adapter/out/JdbcVenues.java`, `WebSliceStubs`, `DailyTakingsServiceTest`

- [x] **Step 1: Write the failing tests** — `commissionBpsOn` answers the *latest* row at or before the
      service date when several exist, the live rate when the venue has no schedule, and empty for an
      unknown venue; a first rate change pins the superseded rate at the floor.
      *(As first written these tests asserted a migration backfill and a create-time seed instead; CI
      falsified that design — see F-1 — and they were rewritten against the shipped one.)*
- [x] **Step 2: Run them, verify they fail** —
      `gradle test --tests "*VenueCommissionScheduleMigrationIT*" --tests "*JdbcVenueCommissionScheduleIT*"`
      → FAIL (relation `venue_commission_rate` does not exist / method missing).
- [x] **Step 3: Minimal implementation** — V39 (composite PK `(venue_id, effective_from)`, CHECK
      mirroring `venue_commission_bps_check`, `ON DELETE CASCADE` like `set_position`; **no backfill**);
      `commissionBpsOn` as the latest-row-at-or-before subquery wrapped in `COALESCE` over
      `venue.commission_bps` (served by the PK index, no second index); `ensureFloorRate` as
      `INSERT … SELECT commission_bps FROM venue … ON CONFLICT DO NOTHING`, called by the rate write.
- [x] **Step 4: Run them, verify they pass** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — search for every implementor of `VenueRates` and every
      caller of `commissionBps`; decide per site whether it wants the live or the dated read.
- [x] **Step 6: Commit** — `git commit -m "Add an effective-dated venue commission schedule (#348)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Takings view reads the service-date rate

**Files:** Modify `payout/application/DailyTakingsService.java` · Test
`payout/application/DailyTakingsServiceTest.java`, `payout/VenueCommissionForwardOnlyIT.java`

- [x] **Step 1: Write the failing test** — `pastServiceDatesKeepTheRateTheyWereSoldAt`: a fake
      `VenueRates` answering 1500 for a past date and 2000 for a future one; the view for the past
      date splits at 1500. Plus `VenueCommissionForwardOnlyIT`: an accrued ledger entry's
      `commission_minor` is unchanged by a rate write, and the takings for the accrued day still
      match it.
- [x] **Step 2: Run it, verify it fails** —
      `gradle test --tests "*DailyTakingsServiceTest*"` → FAIL (live rate applied).
- [x] **Step 3: Minimal implementation** — `rates.commissionBpsOn(venueId, date)`.
- [x] **Step 4: Run it, verify it passes** — `gradle test --tests "*DailyTakings*" --tests "*Commission*"` → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Split daily takings at the service date's commission rate (#348)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — `VenueCommissionAdministration` port + service

**Files:** Create `VenueCommissionAdministration`, `VenueCommissionService`, `VenueCommissionView`,
`VenueCommissionServiceTest` · Modify `Venues`, `JdbcVenues`

- [x] **Step 1: Write the failing test** — `VenueCommissionServiceTest`: the write updates the live
      rate **and** schedules the same bps from tomorrow in `Europe/Tirane` (fixed clock straddling
      the UTC/Tirane boundary); an unknown venue schedules nothing and reports not-found; the list
      returns what the port returns.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*VenueCommissionServiceTest*"` → FAIL.
- [x] **Step 3: Minimal implementation** — the `VenueCommissionAdministration` port and the
      `@Transactional` service over `CommissionRateStore` (whose three methods landed in phase 0).
- [x] **Step 4: Run it, verify it passes.**
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Add the ownership-free venue commission administration port (#348)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — Admin endpoints + ADMIN gate

**Files:** Create `AdminVenueCommissionController`, `AdminVenueCommissionsResponse`,
`SetCommissionRequest`, `AdminVenueCommissionControllerTest`, `AdminVenueCommissionIT` ·
Modify `SecurityConfig`

- [x] **Step 1: Write the failing tests** — the controller test for the wire contract + error codes;
      `AdminVenueCommissionIT` for the gate against a genuinely non-admin operator, the round-trip,
      and the profile-`PATCH` non-regression.
- [x] **Step 2: Run them, verify they fail.**
- [x] **Step 3: Minimal implementation** — the controller, the DTOs, the two matchers.
- [x] **Step 4: Run them, verify they pass** — plus `*EndpointRoleGateCoverageTest*`,
      `*CrossVenueDenialIT*` and the structural net.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Expose the admin venues-with-commission read and rate write (#348)"`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 4 — Docs sweep + close-out

**Files:** Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, `VenueRates` Javadoc,
`VenueProfileResponse`/`VenueProfileView` notes, this plan doc

- [x] **Step 1:** Run `riviera-docs-freshness` over the branch's range.
- [x] **Step 2:** Patch every stated fact the diff contradicts — at minimum the `VenueRates`
      "read at decision time, never carried on an event" sentence, the "commissionBps and
      payoutCurrency are display-only" notes (now: display-only *for the operator*; the admin
      surface is where it changes), `RESPONSIBILITIES.md` §`venue` (the rate schedule + the second
      ownership-free port) and §`payout` (the takings read's rate source), and `CLAUDE.md`'s venue
      module row.
- [x] **Step 3:** Finalize this Execution status section — stage pointer DONE, every phase row ✅
      with its commit, Open Questions empty, every risk row closed, `merged via PR #NN`.
- [x] **Step 4: Commit** — `git commit -m "Record the commission-rate backend in the substrate docs (#348)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-05 | phase 0 — new `VenueRates` method | every implementor of `VenueRates` and every caller of `commissionBps`, to decide per site whether it wants the live or the dated read | `grep -rln "VenueRates" platform/src` | prod: `JdbcVenueCatalog` (impl), `BookingConfirmedPayoutListener` (accrual), `CancellationPolicy` (refund share), `DailyTakingsService` (reporting). tests: `WebSliceStubs`, `DailyTakingsServiceTest`, `PayoutModuleTest` (`@MockitoBean`, no change), `SetBookingInfoIT` | Only `DailyTakingsService` switched to the dated read — it is the sole *reporting* consumer. The accrual and the refund computation are decisions and must stay on the live rate; leaving them untouched is the invariant-#9 argument, so both were deliberately skipped |
| 2026-08-05 | F-1 fix — schedule totality moved from creation to the write | every place a venue row is created, to confirm none of them still needs to cooperate for the read to be correct | `grep -rn "INSERT INTO venue " platform/src` | 1 prod site (`JdbcVenues#insertVenue`) and ~20 test sites using raw SQL | Confirmed the fix generalizes: with the floor pinned at write time, *no* insert site needs changing, which is exactly why the redesign was preferable to fixing the assertion. `insertVenue` reverted to its original form |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle test --tests "*AdminVenueCommissionIT*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-2:** Run `gradle test --tests "*VenueCommissionServiceTest*" --tests "*AdminVenueCommissionIT*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-3:** Run `gradle test --tests "*DailyTakingsServiceTest*" --tests "*VenueCommissionForwardOnlyIT*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-4:** Run `gradle test --tests "*AdminVenueCommissionControllerTest*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-5:** Run `gradle test --tests "*VenueCommissionServiceTest*" --tests "*AdminVenueCommissionIT*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-6:** Run `gradle test --tests "*AdminVenueCommissionIT*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-7:** Run `gradle test --tests "*AdminVenueCommissionIT*" --tests "*VenueAdminServiceTest*"` → PASS. Verified on the branch at `HEAD`.
- [x] **AC-8:** Run `gradle test --tests "*VenueCommissionScheduleMigrationIT*"` → PASS. Verified on the branch at `HEAD`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section justified `N/A` with the reason (invariant #2 untouched).
- [x] Pool + cutoff rules honored (invariants #3, #4) — #4 is load-bearing for the effective-date rule.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new event (invariant #11).
- [x] **Payment/payout** section filled; the ledger is not written by this slice; money in exact-integer minor units / bps (invariants #5, #8, #9).
- [x] Refund policy untouched and still server-side (invariant #10).
- [x] Timezone correct: UTC clock, `Europe/Tirane` for the effective date (invariant #6).
- [x] Booking codes untouched (invariant #7).
- [x] Flyway migration present; the CHECK mirroring the rate bound is tested (invariant #12).
- [x] Admin exemption from per-venue ownership is explicit and proven against a **non-admin** operator (invariant #13).
- [x] **Frontend** `N/A` justified; no contract typed `as any` (no client shipped).
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — citing `merged via PR #NN`, so no docs-only follow-up PR is needed.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
