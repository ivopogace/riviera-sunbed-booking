# Operator module + per-venue authorization (BOLA fix, invariant #13) — Implementation Plan

**Goal:** Introduce an `operator` bounded-context module (owning operator accounts + the
operator↔venue ownership mapping) and enforce, **in the application service** of every
venue-scoped surface, that the authenticated operator owns the path `venueId` — returning
**403** on mismatch. Close OWASP API #1 (Broken Object Level Authorization).

**Architecture:** New `operator` module built directly in the **ADR-0007 target shape**
(`api` / `application` / `domain` / `adapter/{in,out}`, no `.in/.out` at the application layer)
— it is the reference build for the epic-#72 migration. The single most significant decision
(maintainer-confirmed at the grill): **one uniform `operator::api.VenueOwnership` port that
`operator` implements without depending on `venue::api`** (operator publishes its own
`VenueRef` typed id) — so all five venue-scoped services, **including `venue`'s own
`VenueAdminService`, call one port with no `venue ↔ operator` cycle**.

**Persistence:** JDBC only (invariant #1). New Flyway migration **V16** creates `operator` +
`operator_venue`; `JdbcClient` + explicit SQL adapter. No JPA.

**Source of intent:** GitHub issue **#73** (epic #72, item 01/10); ADR-0007
(`docs/adr/ADR-0007-package-structure.md`); `RESPONSIBILITIES.md` (`operator` Job/Not-My-Job);
CLAUDE.md invariants #13, #11, #1.

**Skills consulted:** `riviera-sdd` (loop/gates), `riviera-modulith` (new module in ADR-0007
shape; api-vs-spi decision → api port, no cycle; `allowedDependencies` deny-list),
`riviera-java-conventions` (records for ids/VenueRef, package-private `@Service`/adapter,
constructor injection, typed outcome + `assertOwns` guard exception, no JPA/Lombok),
`postgres` (V16: `BIGINT IDENTITY` PK, `TEXT`+`CHECK` status, FK to `venue(id)` indexed,
one-owner-per-venue via `venue_id` PK), `riviera-plan-doc` (this doc + §4a table),
`riviera-review-overlay` (RV-BE-9 BOLA Blocker, RV-BE-3b api/spi, RV-BE-11 placement,
RV-BE-12 ADR-0007 package shape — walked at the review gate).

**Branch:** `claude/riviera-sdd-73-98mzpd` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (module + port):** Given the `operator` module, when another module calls
  `operator.api.VenueOwnership.assertOwns(operatorId, venueRef)` for an operator that does **not**
  own the venue, then `NotVenueOwnerException` is thrown; when it does own it (or `owns_all_venues`),
  it returns normally. `ownedVenues(operatorId)` returns the mapped `VenueRef`s. *Pinned by:*
  `OperatorOwnershipIT`.
- [ ] **AC-2 (identity resolution):** Given the seeded bootstrap operator (username `operator`),
  when `OperatorDirectory.operatorFor("operator")` is called, then it returns the bootstrap
  `OperatorId`; for an unknown or non-`ACTIVE` username it returns empty. *Pinned by:*
  `OperatorOwnershipIT`.
- [ ] **AC-3 (enforced in service, all 5 surfaces):** For each venue-scoped service
  (`VenueAdminService` add/edit/remove set, `DailyBookingsService.forVenueOn`,
  `WeatherRefundService.refundForWeather`, `StaffAvailabilityService.mark/release`,
  `PayoutLedgerQueryService.forVenue`), when invoked with an operator that does not own the target
  venue, then it calls `VenueOwnership.assertOwns` and the call fails before any read/write. *Pinned
  by:* the per-surface denial tests + `CrossVenueDenialIT`.
- [ ] **AC-4 (cross-venue denial matrix → 403):** For **every** venue-scoped endpoint, when
  operator A (owning venue X only) calls it against venue Y (owned by B), then the response is
  **403** and nothing is read/written; when the owning operator calls it, it is not 403. Staff
  availability derives the venue from the **`setId`**, not the decorative path `venueId`. *Pinned
  by:* `CrossVenueDenialIT`.
- [ ] **AC-5 (admin exempt / create role-only):** `/api/admin/payout-batches**` stays role-gated
  and performs no ownership check; `POST /api/venues` (no path `venueId`) stays role-gated only (no
  object-level check; creator-owns-on-create deferred to #74). *Pinned by:* `CrossVenueDenialIT`
  (admin batch reachable by any operator) + existing `AdminPayoutSecurityIT`.
- [ ] **AC-6 (structure green):** `ModularityTests.verifiesModularStructure()` and
  `JdbcOnlyArchitectureTests` stay green with the new module + edges. *Pinned by:* those tests.
- [ ] **AC-7 (no regression):** Existing venue-scoped ITs (`VenueAdminControllerIT`,
  `StaffBookingControllerIT`, `StaffAvailabilityControllerIT`, `AdminPayoutSecurityIT`,
  `WeatherRefundSecurityIT`) stay green — the shared login resolves to the `owns_all_venues`
  bootstrap operator. *Pinned by:* those tests.

## Non-goals

- **Per-operator credentials / login** (retiring the shared `OPERATOR` password) — that is **#74**.
  `operator` owns the ownership *mapping*, Spring Security owns the *login*.
- **Creator-owns-on-create** for `POST /api/venues` — needs real per-operator identity (#74); can't
  be done synchronously from `venue` without a `venue → operator` cycle. Interim: bootstrap owns all.
- **Operator account CRUD endpoints / `adapter/in`** — none needed by this slice.
- **Migrating the existing modules to ADR-0007 shape** — items 04–09; `operator` is the reference only.
- **PostgreSQL Row-Level Security** defence-in-depth — optional later.
- **Centralized `ProblemDetail` migration** of the existing per-controller `{"error":…}` bodies —
  only the new 403 path uses a `ProblemDetail`; existing bodies unchanged (out of scope, #72 area B).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Ownership check placed in the controller only → a future adapter bypasses it | med | high (BOLA) | `assertOwns` is the first statement of each **application service** method; controllers only resolve identity. `CrossVenueDenialIT` drives the full HTTP path per surface. | agent | open |
| R-2 | Staff-availability check uses the **decorative path `venueId`** → attacker spoofs by editing the URL while targeting another venue's `setId` | med | high | Resolve the owning venue from `setId` via `venue.api.VenueCatalog.setBookingInfo`; assert on the **resolved** venue, never the path. Pinned by `CrossVenueDenialIT` availability case. | agent | open |
| R-3 | `venue → operator` cycle (VenueAdminService is a caller) breaks `ModularityTests` | high | high | `operator::api` uses its **own** `VenueRef` (no `venue::api` import); `operator` `allowedDependencies = {}`. Verified by `ModularityTests`. | agent | open |
| R-4 | Interim `owns_all_venues` bootstrap masks a real missing check / reads as a backdoor at review | med | med | Flag is a documented interim bridge retired by #74; the real mapping + `assertOwns` + 403 are proven with two **synthetic non-bootstrap** operators in `CrossVenueDenialIT`. Note in migration + plan. | agent | open |
| R-5 | Existing service-level ITs call the 5 services directly and now require an owning operator | high | low | They pass the seeded bootstrap `OperatorId` (owns-all); unit `VenueAdminServiceTest` uses a fake `VenueOwnership`. Mechanical. | agent | open |
| R-6 | 404-before-403 ordering on staff availability leaks set existence to non-owners | low | low | Accepted: resolving the venue requires knowing the set exists; matches existing `NO_SUCH_SET`. Documented. | agent | open |

## Open questions / Assumptions

- **Assumption:** The shared login username is `operator` (RivieraOperatorProperties default); the
  seed maps that username to the bootstrap operator. If a deployment overrides the username, #74
  aligns it. — *Owner:* agent · *Resolves by:* #74.

### Resolved
- **Module-graph cycle** (venue↔operator): **one uniform `operator::api` port; operator defines its
  own `VenueRef`, no `venue::api` dependency** — maintainer decision at grill (2026-07-01).
- **Interim ownership model:** **bootstrap operator = interim owner-of-all; deny matrix uses two
  synthetic operators** — maintainer decision at grill (2026-07-01).

## Availability & concurrency (invariant #2)

`N/A — no change to any `availability(set_id, booking_date)` write path.` This slice adds an
**authorization guard** in front of `StaffAvailabilityService.mark/release`; the atomic
`INSERT … ON CONFLICT` claim and the release `DELETE` are unchanged. No new writer of the
availability table; pool/cutoff rules untouched. The guard resolves the owning venue from `setId`
(read-only, via `venue.api.VenueCatalog`) before the existing logic runs.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | **new** | `Operator` (+ operator↔venue link) | Owns operator accounts + the ownership mapping; answers "does this operator own this venue?" (RESPONSIBILITIES `operator` Job; invariant #13). |
| M-2 | `venue` | existing | `Venue`,`BeachMap` | Hosts `VenueAdminService` (beach-map edit) — one of the 5 checked surfaces. |
| M-3 | `booking` | existing | `Booking` | Hosts `DailyBookingsService`, `WeatherRefundService`. |
| M-4 | `availability` | existing | `SetAvailability` | Hosts `StaffAvailabilityService`. |
| M-5 | `payout` | existing | `PayoutLedgerEntry` | Hosts `PayoutLedgerQueryService`. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `VenueOwnership#assertOwns(OperatorId, VenueRef)` / `ownedVenues(OperatorId)` | `OperatorId`, `VenueRef`, `NotVenueOwnerException` | `venue`, `booking`, `availability`, `payout` (services) |
| NI-2 | `operator.api` | `OperatorDirectory#operatorFor(String)` → `Optional<OperatorId>` | `OperatorId` | the 5 controllers (edge identity resolution) |
| NI-3 | `venue.api` | `VenueCatalog#setBookingInfo(SetId)` (existing) | `SetBookingInfo` (has `VenueId`) | `availability` (setId→venue resolution for the check) |

**`allowedDependencies` changes** (deny-by-default, add `operator::api` only where a service/controller calls it):
- `operator` → `{}` (uses only its own `VenueRef`; **no** `venue::api`).
- `venue` → `{ "operator::api" }`.
- `booking` → `+ "operator::api"`.
- `availability` → `+ "operator::api"` (keeps `venue::api`, `venue::spi`).
- `payout` → `+ "operator::api"`.

**api vs spi (RV-BE-3b):** the ownership check is a synchronous **inbound** query ("call me: does
this operator own this venue?") → `api`, not `spi`. No cross-module driven inversion is introduced;
the potential `venue↔operator` cycle is avoided by `operator` not importing `venue::api` (its own
`VenueRef`) rather than by an spi promotion.

**Domain events:** `N/A — no new events.` Identity resolution + ownership are synchronous queries.

### §4a Module-ownership table (RV-BE-11)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Operator accounts + operator↔venue ownership mapping; answer "does O own V?" | `operator` | `operator` Job: "Own operator accounts and the operator↔venue ownership mapping. Answer … does this operator own this venue?" — **not** `venue` ("who may act on a venue, not the venue itself"), **not** `customer` (tourist). |
| **Enforcing** the ownership check at each endpoint | each venue-scoped module's **application service** | `operator` Not-My-Job: "Performing the authorization check at each endpoint → each venue-scoped module's application service performs it by asking me." So `VenueAdminService`/`DailyBookingsService`/`WeatherRefundService`/`StaffAvailabilityService`/`PayoutLedgerQueryService` call `assertOwns`; `operator` only answers. |
| Resolving the authenticated principal → `OperatorId` | the **edge** (controllers) via `OperatorDirectory` | Authentication is a platform/edge (Spring Security) concern, not `operator` domain (#74 owns login). Controllers read the principal and ask `operator` to map username→id; `operator` stays free of Spring Security. |
| Set→venue lookup for the availability check | `venue` (`VenueCatalog.setBookingInfo`) | `venue` owns the static layout (which venue a set belongs to); `availability` references sets by id and asks `venue::api` (invariant #11) — no new capability, reuse. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money moves and no ledger/refund logic changes.` The payout **ledger read**
(`PayoutLedgerQueryService.forVenue`) gains an ownership guard only; its arithmetic is untouched.
The `/api/admin/payout-batches` platform surface is explicitly **exempt** (role-gated).

## Angular — frontend surfaces touched

`N/A — backend-only.` (No FE change: the surfaces already exist; this hardens their authorization.
A future "which venues do I manage" FE will consume `ownedVenues`.)

## FE↔BE contract

`N/A — no request/response shape change.` New failure mode only: venue-scoped endpoints now return
**403** (RFC-7807 `ProblemDetail`, `type`/`title`/`status`, stable — the body is additive) when the
authenticated operator does not own the venue. Existing 2xx/4xx shapes unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `operator` module + V16 + `OperatorOwnershipIT` | ✅ | (this commit) |
| 1 — Enforce in `venue` (VenueAdminService) + 403 advice | ✅ | (enforcement commit) |
| 2 — Enforce in `booking` (daily view + weather refund) | ✅ | (enforcement commit) |
| 3 — Enforce in `availability` (setId→venue) | ✅ | (enforcement commit) |
| 4 — Enforce in `payout` (ledger read) | ✅ | (enforcement commit) |
| 5 — `CrossVenueDenialIT` matrix + full regression | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**New — `operator` module (ADR-0007 full template):**
- `operator/package-info.java` — `@ApplicationModule(displayName="Operator", allowedDependencies = {})`
- `operator/api/package-info.java` — `@NamedInterface("api")`
- `operator/api/OperatorId.java` — `record OperatorId(long value)`
- `operator/api/VenueRef.java` — `record VenueRef(long value)` (operator's own venue id; avoids the cycle)
- `operator/api/VenueOwnership.java` — `assertOwns(OperatorId, VenueRef)`, `ownedVenues(OperatorId)`
- `operator/api/OperatorDirectory.java` — `operatorFor(String username) → Optional<OperatorId>`
- `operator/api/NotVenueOwnerException.java` — framework-free `RuntimeException`
- `operator/domain/OperatorStatus.java` — `enum { ACTIVE, SUSPENDED }`
- `operator/application/OperatorService.java` — package-private `@Service implements VenueOwnership, OperatorDirectory`
- `operator/application/Operators.java` — driven port: `idByUsername`, `ownsVenue`, `ownedVenues`
- `operator/adapter/out/JdbcOperators.java` — package-private `@Repository implements Operators` (JdbcClient)
- `src/main/resources/db/migration/V16__operator.sql` — tables + bootstrap seed

**New — root edge:**
- `ai.riviera.platform.NotVenueOwnerExceptionHandler.java` — `@RestControllerAdvice` mapping `NotVenueOwnerException` → 403 `ProblemDetail`

**Modified — enforce the check + resolve identity:**
- `venue/application/VenueAdminService.java` — `+VenueOwnership`; `addSet/editSet/removeSet` take `OperatorId`, guard first
- `venue/application/in/EditBeachMap.java` — port methods take `OperatorId`
- `venue/infrastructure/in/VenueAdminController.java` — resolve `OperatorId`, pass it; (create stays role-only)
- `venue/package-info.java` — `allowedDependencies = { "operator::api" }`
- `booking/application/in/ListDailyBookings.java`, `RefundForWeather.java` — take `OperatorId`
- `booking/application/DailyBookingsService.java`, `WeatherRefundService.java` — `+VenueOwnership`, guard
- `booking/infrastructure/in/StaffBookingController.java`, `AdminWeatherRefundController.java` — resolve + pass
- `booking/package-info.java` — `+ "operator::api"`
- `availability/application/in/StaffAvailability.java` — `mark/release` take `OperatorId`
- `availability/application/StaffAvailabilityService.java` — `+VenueOwnership`; resolve venue from `setId` via `VenueCatalog.setBookingInfo`, guard
- `availability/infrastructure/in/StaffAvailabilityController.java` — resolve + pass; fix the "not an authorization check" comment
- `availability/package-info.java` — `+ "operator::api"`
- `payout/application/in/ViewPayoutLedger.java` — `forVenue` takes `OperatorId`
- `payout/application/PayoutLedgerQueryService.java` — `+VenueOwnership`, guard
- `payout/infrastructure/in/AdminPayoutLedgerController.java` — resolve + pass
- `payout/package-info.java` — `+ "operator::api"`

**Modified — tests (mechanical, ownership now enforced):**
- `venue/application/VenueAdminServiceTest.java` — fake `VenueOwnership`, pass an `OperatorId`
- `booking/WeatherRefundServiceIT.java`, `payout/PayoutLedgerViewIT.java`, `availability/StaffAvailabilityIT.java`,
  `availability/StaffMarkVsOnlineClaimConcurrencyIT.java`, `payout/PayoutBatchGenerationIT.java`,
  `booking/AbandonedBookingSweepIT.java` — pass the bootstrap `OperatorId` where they call a guarded service
- `WebSliceStubs.java` — stub the new port signatures
- **New** `operator/OperatorOwnershipIT.java` — module test (AC-1/AC-2)
- **New** `CrossVenueDenialIT.java` — the cross-venue denial matrix (AC-4/AC-5)

---

## Phases (TDD per behavior)

**Phase 0 — `operator` module + V16 migration.** Write `OperatorOwnershipIT` (Testcontainers):
seed operator A owning venue 1, operator B owning venue 2, bootstrap owns-all; assert `assertOwns`
passes/throws correctly, `ownedVenues` returns the mapping, `operatorFor` resolves username (and
rejects unknown/suspended). Implement api types, `OperatorService`, `Operators` + `JdbcOperators`,
package-info, V16. Run `ModularityTests` (structure only) + `OperatorOwnershipIT` green.

**Phase 1 — enforce in `venue` + the 403 advice.** Red: `CrossVenueDenialIT` beach-map case (A
edits B's venue → 403). Add `NotVenueOwnerExceptionHandler` (403). Change `EditBeachMap` +
`VenueAdminService` (guard) + controller (resolve). Update `VenueAdminServiceTest`. Green +
`VenueAdminControllerIT` still green (bootstrap owns-all).

**Phases 2–4 — enforce in `booking`, `availability`, `payout`** the same way, one surface's denial
test at a time (availability derives venue from `setId`). Update the touched service-level ITs.

**Phase 5 — consolidate `CrossVenueDenialIT`** across all 5 surfaces + assert `/api/admin/**` and
`POST /api/venues` are **not** ownership-checked. Full-suite regression; `ModularityTests` +
`JdbcOnlyArchitectureTests` green.

## Self-review checklist (before PR)

- [ ] No JPA/Lombok; `JdbcClient` + explicit SQL; records for ids/`VenueRef`; package-private `@Service`/adapter.
- [ ] `assertOwns` is in each **application service**, first statement; controllers only resolve identity.
- [ ] Availability check uses the **resolved** venue (from `setId`), not the path `venueId`.
- [ ] `operator` has **no** `venue::api` dependency; `allowedDependencies` updated per module; `ModularityTests` green.
- [ ] `/api/admin/**` + `POST /api/venues` not ownership-checked; existing ITs green (bootstrap owns-all).
- [ ] V16 present; `operator_venue.venue_id` FK→`venue(id)` indexed; status `CHECK`; bootstrap seed documented as interim.
- [ ] Cross-venue denial matrix (403) covers all 5 surfaces with two synthetic operators.
- [ ] Execution-status table matches reality; Open Questions empty or deferred to #74.
