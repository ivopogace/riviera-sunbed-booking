# [O8] Venue & commodities tab + VenueEditor retirement — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task.

**Goal:** Ship the operator console's **Venue & commodities** tab (venue-details form,
amenity toggle-chips, photo placeholders), backed by an owner-asserted profile read +
widened profile write, and retire the legacy venue-editor page — closing epic #141.

**Architecture:** The single most significant finding is that **every form field already
exists as a `venue` column** (V2 + V21), so O8 needs **no Flyway migration**. The delta
is two `venue`-module additions: (1) a new **owner-asserted operator read** —
`GET /api/venues/{venueId}/profile` — because the form must populate `booking_cutoff`
(editable), `commission_bps` (read-only %), and `payout_currency` (read-only), none of
which any existing read returns and which must **not** be added to the public tourist
read (commission is the platform's cut); and (2) a **widened owner-asserted write** of the
editable subset on the existing `PATCH /api/venues/{venueId}`. Retirement reduces the
legacy editor to onboarding-only.

**Persistence:** JDBC only (invariant #1). **No migration** — all columns exist
(`venue.name/beach/region/description/booking_mode/commission_bps/payout_currency/booking_cutoff`
from V2; `distance_to_water_m` + `venue_amenity` from V21). The widened write adds columns to
one `UPDATE venue SET …`; the read is one new `SELECT`.

**Source of intent:** GitHub issue **#177** (epic **#141**); design
`docs/design/riviera-operator-console-v2.dc.html` (`data-screen-label="Venue details"`);
visual note `docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted (Skill-routing gate):**
- `riviera-plan-doc` — this template + the Behavior-parity ledger for the retirement.
- `riviera-modulith` — the operator read is venue-internal (REST-only caller) → a driving
  port in `application/` (like `EditVenueProfile`), **not** `api/`; owner-check in the service.
- `riviera-java-conventions` — records + typed outcomes + JDBC text-block SQL; reuse
  `NewVenueCommand`'s validators for the widened command (avoid a Sonar dup block).
- `postgres` — confirmed no migration; the read is a plain indexed `SELECT` by PK.
- `riviera-frontend` — VenueTab lands in `operator/`; operator tabs inject
  `OperatorConsoleService` (never import `venue-admin/`); the two-suite e2e split.
- `angular-developer` + angular-cli MCP — **to load at Implement** for Signal Forms,
  signals, a11y (MCP was disconnected at plan time; fall back to the in-repo skill if still out).
- `riviera-tailwind` — **to load at Implement** for the toggle-chip + form styling.
- `playwright-cli` — **to load at Implement** for the mocked + real-backend specs.
- `riviera-local-debug` — **to load before the first build** (scoped tests; cloud recipe).
- `riviera-review-overlay` — **at the review gate** (RV-BE-9 owner-assert, RV-FE-*, RV-PROC-1).
- *Not loaded — out of scope:* `riviera-stripe-payments` (commission is displayed read-only;
  no commission math, no Stripe — an epic non-goal).

**Branch:** `feature/o8-venue-commodities-tab` (exists; local session, real branch per rule 2).

---

## Product decisions (settled at the intake grill, 2026-07-11)

Escalated via `AskUserQuestion` because each changes the editable set:

| Field | Decision | Rationale (grounded in code) |
|---|---|---|
| **Commission** | **Read-only** (display bps as %) | Platform's cut (invariant #9; `venue` stores rate, `payout` computes). Editable → revenue leak. **Not in the write command** — a crafted PATCH cannot set it. |
| **Booking cutoff** | **Operator-editable** | `booking_cutoff` is **already** a per-venue column AND already read per-venue by `ReserveSetService`/cancel/request (`SetBookingInfo.bookingCutoff` → `BookingCutoff.isBookable`). Editable = write-widening only; **no cutoff-logic change**. |
| **Payout currency** | **Read-only** (display) | Standing provisional (EUR vs ALL, converted outside the app at BKT). Read-only avoids committing it early. **Not in the write command.** |
| **Beach / region** | **Free-text editable** | No beach/region vocabulary exists (free `TEXT` at onboarding too). The exact-match discovery coupling already exists and is unchanged. |

**Editable set:** `name`, `beach`, `region`, `description`, `bookingMode`, `bookingCutoff`,
`amenities`, `distanceToWaterM`.
**Read-only (display, never written):** `commissionBps` (as %), `payoutCurrency`.

---

## Acceptance criteria (testable)

- [ ] **AC-1 (owner-asserted widened write):** Given an operator who owns venue V, when they
  submit the venue-details form changing `name`, `beach`, `region`, `description`,
  `bookingMode`, `bookingCutoff`, then `EditVenueProfile.updateProfile` persists all of them
  (after `assertOwns`), and a non-owner operator is rejected before any write. *Pinned by:*
  `VenueAdminServiceTest.updateProfilePersistsEditableFields`,
  `VenueAdminServiceTest.updateProfileDeniesNonOwner`.
- [ ] **AC-2 (owner-asserted read):** Given an operator who owns venue V, when they
  `GET /api/venues/{V}/profile`, then they receive `name/beach/region/description/bookingMode/
  bookingCutoff/commissionBps/payoutCurrency/amenities/distanceToWaterM`; a non-owner gets
  **403**; an unknown venue gets **404**. *Pinned by:* `VenueAdminControllerIT.getProfileReturnsFullProfile`,
  `CrossVenueDenialIT.getVenueProfileDeniedForNonOwner`.
- [ ] **AC-3 (commission not publicly leaked):** Given the public tourist read
  `GET /api/venues/{V}` (no auth), then the response contains **no** `commissionBps` /
  `payoutCurrency`; and `GET /api/venues/{V}/profile` **without** an operator session is
  **401**, not 200. *Pinned by:* `SecurityConfigPathMatrixTest.venueProfileRequiresOperator`
  (+ existing `VenueReadControllerIT` asserting the tourist body shape).
- [ ] **AC-4 (booking-mode flips the tourist flow):** Given venue V in `INSTANT` mode with a
  free online set, when the operator edits V to `REQUEST` and a tourist then reserves that set,
  then the booking is created as `PENDING_REQUEST` (not `AWAITING_PAYMENT`). *Pinned by:*
  `BookingModeSwitchIT.editingModeToRequestChangesReserveOutcome`.
- [ ] **AC-5 (read-only fields protected server-side):** Given an operator owning V, when they
  send a `PATCH /api/venues/{V}` body that includes `commissionBps`/`payoutCurrency`, then those
  columns are **unchanged** (the DTO/command has no such field). *Pinned by:*
  `VenueAdminControllerIT.patchIgnoresReadOnlyFields`.
- [ ] **AC-6 (edited fields re-render on tourist surfaces):** Given an operator edits V's `name`
  and amenity set and saves, when the tourist beach-map page (`GET /api/venues/{V}`) is re-read,
  then the new name + amenities appear. *Pinned by:* `operator-venue.e2e.ts`
  ("edits reflect on the tourist beach-map") + `real-backend/venue.e2e.ts`.
- [ ] **AC-7 (amenity catalogue contract):** Given the operator toggles amenity chips and saves,
  when the request carries an off-catalogue code, then the server rejects it **400**
  (`Amenity.valueOf` → `IllegalArgumentException` → `INVALID_REQUEST`); valid codes replace the
  set. *Pinned by:* `VenueAdminControllerIT.patchRejectsUnknownAmenity` (existing contract, extended).
- [ ] **AC-8 (VenueTab UI):** Given the operator opens `/operator/{V}/venue`, then they see the
  details form (commission as a read-only %, payout currency read-only), the commodities
  toggle-chip row over the fixed catalogue, and photo **placeholder** cards labelled as coming
  in #142 (no upload control). Save shows a `role="status"` confirmation. *Pinned by:*
  `venue-tab.spec.ts`, `venue-tab.a11y.spec.ts`, `venue-tab.contrast.spec.ts`, `operator-venue.e2e.ts`.
- [ ] **AC-9 (retirement):** Given the console is fully tabbed, then the `venue` placeholder route
  is replaced by `VenueTab`, the legacy `/venue-admin` is reduced to onboarding-only with its
  `legacySurface` flag removed, and onboarding stays reachable from the console header. *Pinned by:*
  `app.spec.ts` (legacySurface invariant) + the console-header onboarding-link assertion in
  `operator-console.spec.ts`.

## Non-goals

- **No change to walk-in / availability semantics** (invariants #2/#3) — the claim, the
  `UNIQUE(set_id, booking_date)` constraint, and the pool split are untouched.
- **No commission math / payout logic** (#9) — commission is *displayed*, never computed here.
- **No Flyway migration** — every field is an existing column.
- **No cutoff-logic change** (#4) — the cutoff is already read per-venue; only its persistence widens.
- **No photo upload** (#142) — placeholders only.
- **No operator self-registration / SSO** (#115/#112/#116) — onboarding keeps its current form.
- **No beach/region vocabulary** — free text, as today.
- **No change to `payment`/`payout`/refund** (#8/#9/#10).

## Behavior-parity ledger (VenueEditor retirement)

The legacy `frontend/src/app/venue-admin/venue-editor.ts` mixes **onboarding** (create a NEW
venue) with **scaffold-editing** (it can only edit a venue *just created in the same session* —
`venueId` is set only after `onCreateVenue`; there is no "load an existing venue by id"). Its
editing jobs are all covered by console tabs. Ledger:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Operator **sign-in** (username/password, `signInFailureMessage`, 401 `sessionLost`) | **preserved** | Kept on the slimmed onboarding page; the console has its own sign-in gate (O1). |
| **Create a venue** (`onCreateVenue` + `venueForm`: name/beach/region/description/mode/commission/currency/cutoff) | **preserved** | Stays at `/venue-admin` as the onboarding-only page (uses `venue-admin.service.createVenue`). |
| **Beach-map editing** (`onAddSet`/`onRemoveSet`/`onTogglePool`) | **dropped → covered** | O3 `LayoutEditor` (beach-map tab) is the real editor for an existing `:venueId`. Legacy path only ever edited a just-created venue. |
| **Row/set pricing** (price in the add-set form) | **dropped → covered** | O4 `PricingTab`. |
| **Commodities** (`onToggleAmenity`/`onSaveCommodities`: amenities + distance) | **changed → moved** | Now `VenueTab` (O8), over an existing `:venueId`, via `OperatorConsoleService`. |
| **Round-trip re-read after each write** (`safeReload` → tourist `getVenueMap`) | **preserved** | `VenueTab` re-reads the owner-scoped profile after Save; the mocked e2e asserts the tourist surface reflects it (AC-6). |
| **Write-error mapping** (`venueAdminErrorOf`: CELL_TAKEN/DUPLICATE_POSITION/NO_SUCH_VENUE/UNAUTHORIZED/INVALID_REQUEST) | **preserved (subset)** | `VenueTab`'s write reuses the same error typing; the profile write's relevant codes are `NO_SUCH_VENUE`(404)/`UNAUTHORIZED`(401→sessionLost)/`INVALID_REQUEST`(400). Set-conflict codes (CELL_TAKEN/DUPLICATE_POSITION) don't apply to a profile write. |
| **`reloadFailed` vs write-error distinction** (write succeeded, read-back failed) | **preserved** | `VenueTab` keeps the "saved, but preview stale" state distinct from a write failure. |
| **`legacySurface` compat wrapper on `/venue-admin`** | **dropped (intended)** | Flag removed per AC-9; the slimmed onboarding page is styled without the compat surface. Verify `app.spec.ts` legacySurface allow-list is updated. |
| **`console-placeholder` `venue` branch** (forward-link to `/venue-admin`) | **dropped (intended)** | Placeholder no longer needed once `VenueTab` graduates; `CONSOLE_TABS` becomes empty → factory + `console-placeholder` removed (verify no other referrers/tests). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Commission leak** — a new `GET /api/venues/*/profile` returning `commissionBps` would be **public** under `SecurityConfig` line 152 (`GET /api/venues/** permitAll`) unless a more-specific matcher precedes it. | med | high | Add `VENUE_PROFILE_PATH = "/api/venues/*/profile"` with `.requestMatchers(GET, VENUE_PROFILE_PATH).hasRole(OPERATOR_ROLE)` **before** the public GET (first-match-wins), mirroring `PAYOUT_LEDGER_PATH`/`TAKINGS_PATH`. Pin with `SecurityConfigPathMatrixTest` (AC-3) + `CrossVenueDenialIT` (AC-2). | plan | open |
| R-2 | **BOLA on the read** — operator A reads operator B's venue profile (commission/currency). | med | high | Owner-assert in the **application service** (`ViewVenueProfile` → `assertOwns` → 403), not the controller; `CrossVenueDenialIT` (invariant #13, RV-BE-9). | plan | open |
| R-3 | **Sonar duplicated-block** — the widened `VenueProfileCommand` repeats `NewVenueCommand`'s `requireText`/booking-mode/cutoff validation. | med | med | Extract shared validators to one package-private helper (e.g. `VenueFieldValidation`) in `venue.application`; both commands call it. 0-dup-block bar. | plan | open |
| R-4 | **Silent behavior drop in retirement** (the O6 #176 class). | med | high | The Behavior-parity ledger above enumerates every legacy behavior; each `dropped` row cites a covering tab or is intended. | plan | open |
| R-5 | **Error-contract drift** — the widened DTO must reject bad `bookingMode`/blank `name`/malformed `bookingCutoff` as centralized `ProblemDetail` `INVALID_REQUEST`, not a per-controller body. | low | med | Parse/validate in `UpdateVenueProfileRequest.toCommand()` → `IllegalArgumentException` → `ApiErrorHandler` (§6b). `VenueAdminControllerIT` asserts 400 + `code`. | plan | open |
| R-6 | **`booking_cutoff` on the wire** — a bad `"HH:mm"` or an out-of-range time breaks the reserve cutoff. | low | med | DTO parses `LocalTime` strictly; command requires non-null (mirrors `NewVenueCommand`). Column is `TIME`; no new constraint. No cutoff-logic change (already per-venue). | plan | open |
| R-7 | **Flyway number** — none needed. If a reviewer expects one, the plan states **no migration** (V21 is HEAD; V22 stays free). | low | low | Documented; arch tests + `Testcontainers` prove the write against the real schema. | plan | resolved (no migration) |

## Open questions / Assumptions

- **Assumption:** onboarding may stay behind the same sign-in it uses today (no new guard) —
  the slimmed `/venue-admin` keeps its sign-in block. *Owner:* build · *Resolves by:* Phase 4.
- **Assumption:** `OperatorConsoleService` is the right home for the profile read/write (operator
  tabs never import `venue-admin/`); verified by the O4/O7 inject pattern. *Owner:* build ·
  *Resolves by:* Phase 3 (confirm it exists + holds set-editing methods so `venue-admin.service`
  prunes cleanly).
- **Open question:** does any spec/test besides the retired editor reference
  `console-placeholder` / `CONSOLE_TABS`? Grep before deletion. *Owner:* build · *Resolves by:* Phase 4.

## Availability & concurrency (invariant #2)

**N/A for new availability writes** — this slice adds **no** write path to
`availability(set_id, booking_date)`. It edits `venue`-profile columns only. Two adjacent
invariants are *read* by the booking flow and must stay intact (explicit non-goals):

- **Pool rule (#3):** unchanged — the slice never touches `set_position.pool` or the claim.
- **Cutoff rule (#4):** `booking_cutoff` becomes operator-editable, but the **logic is
  unchanged** — `ReserveSetService`/`CancelBookingService`/`RespondToRequestService` already
  read the per-venue cutoff via `SetBookingInfo.bookingCutoff` and pass it to
  `BookingCutoff.isBookable/closesAt`. Editing the value flows through the existing path; no
  new arithmetic. Stored as `TIME` (Europe/Tirane wall-clock, #6), consistent with V2.
- **Booking mode:** `booking_mode` becomes editable; `ReserveSetService` reads it live per
  reserve (`SetBookingInfo.bookingMode`), so an edit flips INSTANT↔REQUEST for *subsequent*
  bookings only — existing bookings keep their committed lifecycle. *Pinning test:*
  `BookingModeSwitchIT` (AC-4).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | Owns venue profiles, booking mode, pricing (RESPONSIBILITIES `venue` Job). The profile read + widened write are venue-profile data. |
| M-2 | `operator` | existing (consumed) | `Operator` | `VenueOwnership.assertOwns` consulted by the read + write services (invariant #13). No change to `operator`. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `VenueOwnership#assertOwns(OperatorId, VenueRef)` | `VenueRef` | `venue` (already granted; used by write, now also by read) |

- **No new `api/` port.** The new `ViewVenueProfile` is a **driving port in `venue.application`**
  (REST-only caller, like `EditVenueProfile`) — invariant #11: a port graduates to `api/` only
  when another *module* calls it; this one doesn't. `VenueProfileView` is an `application` record
  returned by the port and serialized by the controller (mapped to a response record in
  `adapter/in`). No new `vocabulary`/`events`/`spi`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none** | — | — | — | — | — |

`N/A — no new events`. A profile edit is a synchronous CRUD write; no module needs to react.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Read a venue's own admin profile (incl. commission rate, payout currency) | `venue` | `venue` Job: "Own venue profiles … pricing … booking mode." Storing/returning the commission **rate** is venue's (`payout` owns the *math*, which this slice doesn't do). Not on any Not-My-Job list. |
| Widen the profile **write** (name/beach/region/description/mode/cutoff) | `venue` | Same Job line. Owner-asserted in the app service via `operator.api` (invariant #13); `operator`'s Not-My-Job: it owns the mapping, not the check-in-path. |
| Enforce operator owns venue on read + write | `venue.application` (asks `operator`) | Invariant #13: the check lives in the application service, not the controller; `operator` answers "does this operator own this venue?". |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** Commission (`commission_bps`) is **displayed** read-only as a
percentage (integer bps → `%`, no float, no math); `payout_currency` is displayed read-only. No
charge, refund, ledger, or Stripe interaction. (Epic non-goal; `riviera-stripe-payments` not loaded.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-tab.ts` (+`.html`/`.scss`) | new | standalone component | signals; `linkedSignal` for amenity/field drafts re-seeded per venue id | Signal Forms (`@angular/forms/signals`) for the details form |
| FE-2 | `operator/operator-console-service.ts` (name TBC at build) | modify | `@Service` | — | adds `getVenueProfile(venueId)` (GET `/{id}/profile`) + widened `updateVenueProfile(venueId, req)` (PATCH `/{id}`) |
| FE-3 | `operator/venue-tab.model.ts` (or reuse) | new/modify | types | — | `VenueProfileView` (read) + widened `UpdateVenueProfileRequest` (write) |
| FE-4 | `app.routes.ts` | modify | routes | — | swap `venue` placeholder → `VenueTab`; remove `CONSOLE_TABS`/`console-placeholder`; drop `legacySurface` on `/venue-admin` |
| FE-5 | `venue-admin/venue-editor.ts` (+ template/scss) | modify | standalone component | signals | slim to onboarding-only (create + sign-in); delete editing blocks; prune dead `venue-admin.service` methods |

**Standards:** standalone (no `standalone:true`), no explicit `OnPush`/`changeDetection`,
`inject()`, `input()`/`output()`, `@if`/`@for`, `class`/`style` bindings (no `ngClass`/`ngStyle`),
Signal Forms, `@Service`. Amenity chips are `<button>` toggles (design's active/inactive states) —
consume `--riv-*` tokens, not palette literals (Tailwind per `riviera-tailwind`). Photo
placeholders are non-interactive cards (no `NgOptimizedImage` — no real image), each carrying
copy that references #142.

## FE↔BE contract

- **New endpoint:** `GET /api/venues/{venueId}/profile` → `200 VenueProfileResponse` |
  `403` (non-owner) | `404` (unknown) | `401` (no session). Body:
  `{ name, beach, region, description, bookingMode: "INSTANT"|"REQUEST", bookingCutoff: "HH:mm",
  commissionBps: int, payoutCurrency: "EUR", amenities: string[], distanceToWaterM: int|null }`.
  **Gated `hasRole(OPERATOR)` above the public GET** (R-1).
- **Changed endpoint:** `PATCH /api/venues/{venueId}` request body widens from
  `{ amenities, distanceToWaterM }` to also include `{ name, beach, region, description,
  bookingMode, bookingCutoff }`. **No** `commissionBps`/`payoutCurrency` on the write (read-only).
  Response unchanged (`204` | `403` | `404` | `400`).
- **Client typing:** hand-written typed methods on `OperatorConsoleService`; no `as any`.
- **Money/time on the wire:** `commissionBps` integer minor-of-percent (bps); `bookingCutoff`
  as `"HH:mm"` string parsed to `LocalTime` server-side; `distanceToWaterM` integer metres or null.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Widened profile write (command + DTO + JDBC + validators) | ✅ | (this commit) |
| 1 — Owner-asserted profile read (port + view + JDBC + controller + SecurityConfig) | ✅ | (this commit) |
| 2 — Booking-mode/cutoff round-trip ITs (AC-4) | ✅ | (this commit) |
| 3 — VenueTab UI + OperatorConsoleService wiring + unit/a11y/contrast | ✅ | (this commit) |
| 4 — Route swap + VenueEditor retirement | ✅ | (this commit) |
| 5 — e2e (mocked + real-backend) | | |

> **Generalization-audit (Phase 4):** the full FE suite exposed a *pre-existing* test-isolation leak —
> `booking/booking.service.spec.ts` writes booking codes to `DeviceLocalBookings` (localStorage) but
> never installed/removed the fake store per the `testing/fake-storage.ts` contract, so its
> "remembers 3 codes" test leaked into its "empty body" test once O8's new spec files re-sharded the
> Vitest workers. Fixed at the root (added `installFakeStorage`/`removeFakeStorage` to that suite's
> `beforeEach`/`afterEach`). Sibling booking specs that only use the codes as HTTP fixtures don't
> write to the store, so they're unaffected. All 626 FE unit specs green; `lint` + `build` clean.

> **AC pin adjustments (recorded at build):** the service-level AC-1 orchestration is pinned by
> `VenueAdminServiceTest.updateProfileByOwnerAppliesTheWrite`; field persistence by
> `VenueAdminControllerIT.widenedProfileEditPersistsCoreFieldsAndReadsBack`. AC-2 by
> `getProfileReturnsCommissionAndPayoutCurrency` + `CrossVenueDenialIT.venueProfileReadByNonOwnerIs403`
> / `ownerCanReadItsOwnVenueProfile`. AC-3 by `getProfileRequiresOperatorAuth` + the tourist-read
> `commissionBps/payoutCurrency doesNotExist` assertions (in lieu of a dedicated `SecurityConfigPathMatrixTest`).
> AC-4 by `BookingModeSwitchIT.editingBookingModeToRequestIsVisibleToBooking`. AC-5 by
> `patchIgnoresReadOnlyCommissionAndCurrency`. AC-7 by `unknownAmenityCodeIs400`. All green locally
> (Testcontainers) 2026-07-11; CI owns the full suite.

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase.

---

## File structure

**Backend (`platform/…/venue/`)**
- `application/VenueProfileCommand.java` — **widen**: add name/beach/region/description/bookingMode/bookingCutoff.
- `application/EditVenueProfile.java` — **doc update** (fields widened; signature unchanged).
- `application/ViewVenueProfile.java` — **new** driving port: `Optional<VenueProfileView> profileFor(OperatorId, VenueId)`.
- `application/VenueProfileView.java` — **new** record (the read view).
- `application/VenueFieldValidation.java` — **new** package-private shared validators (R-3).
- `application/Venues.java` — **add** `Optional<VenueProfileView> findProfile(VenueId)`.
- `application/VenueAdminService.java` — **implement** `ViewVenueProfile` (assertOwns → findProfile); widened write unchanged in shape.
- `adapter/in/UpdateVenueProfileRequest.java` — **widen**: parse new fields → command.
- `adapter/in/VenueProfileResponse.java` — **new** response DTO (or map inline).
- `adapter/in/VenueAdminController.java` — **add** `GET /{venueId}/profile`.
- `adapter/out/JdbcVenues.java` — **widen** `updateVenueProfile` SQL `SET`; **add** `findProfile` SELECT.
- `platform/…/SecurityConfig.java` — **add** `VENUE_PROFILE_PATH` matcher `hasRole(OPERATOR)` above the public GET.

**Backend tests**
- `venue/application/VenueAdminServiceTest.java` — widened write + read + non-owner denial.
- `venue/VenueAdminControllerIT.java` — GET /profile, widened PATCH, 400s, read-only-ignored.
- `CrossVenueDenialIT.java` — GET /profile 403 cross-venue.
- `venue/BookingModeSwitchIT.java` — **new** (AC-4).
- `SecurityConfigPathMatrixTest` (or existing security test) — `/profile` requires OPERATOR (AC-3).
- Arch net: `ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`.

**Frontend (`frontend/src/app/`)**
- `operator/venue-tab.ts` (+`.html`/`.scss`) + `venue-tab.spec.ts` + `.a11y.spec.ts` + `.contrast.spec.ts` — **new**.
- `operator/<operator-console-service>.ts` + model — **modify** (add read + widened write).
- `app.routes.ts` — **modify** (swap + retirement).
- `operator/console-placeholder.ts` (+scss) — **delete** (verify no referrers).
- `venue-admin/venue-editor.*` — **slim to onboarding**; `venue-admin.service.ts`/`.model.ts` — prune dead methods, keep `createVenue`.
- `app.spec.ts` — **update** legacySurface allow-list.
- `e2e/operator-venue.e2e.ts` — **new** (mocked). `e2e/real-backend/venue.e2e.ts` — **new** (local-only).

---

## Phases (TDD, red→green per step)

Each phase: write failing test → run scoped (`--tests "*Class*"` / `npm test -- <file>`) →
minimal impl → pass → generalization-audit → commit (`… (#177)`) → update Execution status.

- **Phase 0 — Widened write.** Failing `VenueAdminServiceTest` for the widened command +
  `VenueAdminControllerIT` PATCH persisting the new fields & rejecting bad mode/blank name; extract
  `VenueFieldValidation`; widen `VenueProfileCommand`/`UpdateVenueProfileRequest`/`JdbcVenues.updateVenueProfile`.
- **Phase 1 — Owner-asserted read.** Failing `CrossVenueDenialIT`/`VenueAdminControllerIT` for
  `GET /{venueId}/profile` (200 owner / 403 non-owner / 404 / 401 unauth); add `ViewVenueProfile` +
  `VenueProfileView` + `Venues.findProfile` + `JdbcVenues` SELECT + controller + **SecurityConfig
  matcher** (R-1) + path-matrix test.
- **Phase 2 — Mode/cutoff round-trip.** `BookingModeSwitchIT` (AC-4). Run the arch net.
- **Phase 3 — VenueTab.** `OperatorConsoleService` read+write; `venue-tab.*` with details form
  (commission % + currency read-only), commodities toggle-chips, photo placeholders (ref #142),
  Save confirmation; unit + a11y + contrast specs.
- **Phase 4 — Route swap + retirement.** Swap route → `VenueTab`; remove `CONSOLE_TABS`/placeholder;
  slim `/venue-admin` to onboarding; drop `legacySurface`; prune dead service methods; fix `app.spec.ts`.
- **Phase 5 — e2e.** Mocked `operator-venue.e2e.ts` (edit→save→tourist re-render, read-only fields,
  axe) + local-only `real-backend/venue.e2e.ts` (real mode-flip → tourist flow).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-9:** each run via its pinned test/e2e; record commit SHAs here at close-out.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] Availability section justified N/A (no availability write); pool/cutoff/mode intact (#2/#3/#4).
- [ ] **Modulith** section filled; new port is `application` (not `api/`); no cross-module internal imports (#11).
- [ ] Payment/payout N/A justified (commission displayed, not computed) (#5/#9).
- [ ] Owner-assert on read **and** write, in the application service (#13, RV-BE-9).
- [ ] Commission not on the public read; `/profile` gated OPERATOR above the public GET (R-1).
- [ ] Timezone: `booking_cutoff` `TIME` Europe/Tirane, no logic change (#4/#6).
- [ ] Error contract centralized `ProblemDetail`; widened DTO 400s via `ApiErrorHandler` (§6b).
- [ ] **No Flyway migration** (all columns exist); arch tests + Testcontainers prove the SQL (#12).
- [ ] Frontend standards met; no `as any`; toggle-chips via tokens; photo cards reference #142.
- [ ] Behavior-parity ledger: every legacy behavior preserved/covered or intentionally dropped.
- [ ] `legacySurface` removed from `/venue-admin`; onboarding reachable; `app.spec.ts` green.
- [ ] Execution-status table matches reality; Open Questions empty (or deferred with an issue #).
