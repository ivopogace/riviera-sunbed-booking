# O4 — Pricing tab (per-row EUR pricing + projected take) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task, checkbox syntax.

> **Riviera discipline:** the Availability & concurrency, Spring-Modulith, and Payment & payout
> sections are first-class. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give an operator a Pricing tab in the console where each beach-map **row** has one full-day
EUR price input; committing a row price persists it to **every set in that row**, survives reload, is
reflected on the tourist map + booking dialog, and drives a live "projected full-day take if every
online set sells" figure (Σ prices of **online-pool** sets only).

**Architecture:** The single most significant decision is **not to reuse O3's `PUT …/beach-map`
bulk write** (`EditBeachMap.replaceLayout`). That write is *reject-unless-unclaimed* (refuses once a
venue has any booking/hold) and *delete-then-reinsert* (reissues set ids, `ON DELETE CASCADE`s
availability). Re-pricing must instead be a **non-destructive metadata `UPDATE`** that works on a live
venue, preserves set identity + availability, and touches only `price_minor`/`price_currency`. So O4
adds a new, narrowly-scoped **per-row reprice** write: `PUT /api/venues/{venueId}/rows/{rowLabel}/price`
→ `EditBeachMap.repriceRow` → one `UPDATE set_position … WHERE venue_id=? AND row_label=?`. All in the
`venue` module; the tourist read path already carries per-set price, so it reflects the change with no
new read code.

**Persistence:** JDBC only (invariant #1). **No migration.** `set_position.price_minor` (BIGINT,
integer minor units) + `price_currency` (TEXT ISO) and the `CHECK (price_minor >= 0)` already exist
(V2). The reprice `UPDATE`'s `WHERE (venue_id, row_label)` rides the existing
`set_position_cell_uniq UNIQUE (venue_id, row_label, position_no)` index prefix — no new index. **V22
remains free.**

**Source of intent:** GitHub issue **#174** ([O4], epic #141); visual spec
`docs/design/riviera-operator-console-v2.dc.html` (Pricing tab, lines ~159–177 + logic ~829–842);
product design `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`.

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake grill), `riviera-plan-doc` (this
doc), `riviera-modulith` (new `venue` command port `repriceRow` stays in `application/` — REST-only
caller, not published; ownership check in the service, not the controller), `riviera-java-conventions`
(reuse `ChangeOutcome`/`SetRejection` typed outcomes, new `RowPriceCommand` record with
compact-constructor validation, `JdbcClient` text-block SQL, §6b error contract), `postgres`
(row-scoped `UPDATE` on the existing `(venue_id, row_label)` index prefix; no new migration/index),
`riviera-frontend` (new `PricingTab` in `operator/`, route swap mirroring O3), `angular-developer` +
angular-cli MCP (signals, `computed()` projected-take, `change`-commit inputs, a11y), `riviera-tailwind`
(porcelain glass styling + test-hook classes), `playwright-cli` (CI-safe mocked e2e + real-backend
round-trip). `riviera-stripe-payments`: consulted — **no money moves** (repricing is venue config; the
charge amount is snapshotted at reserve time), so no Stripe/payout change.

**Branch:** `feature/o4-pricing-tab` (created off `main` before phase 0; local session — no cloud
designated-branch substitution).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (row fan-out persists):** Given venue V (owned by operator O) with row `A` = sets
  `A1,A2` (ONLINE) + `A3` (WALK_IN), all at 3500 minor, when O reprices row `A` to 4200 minor, then
  **every** set with `row_label='A'` has `price_minor=4200` (both pools) and the service returns
  `ChangeOutcome.Applied`. *Pinned by:* `VenueRepriceIT.repricesEverySetInTheRow`.
- [ ] **AC-2 (survives reload / read reflects):** Given row `A` repriced to 4200, when
  `VenueCatalog.findVenueMap(V, date)` is read, then row `A`'s sets carry `MoneyView(4200,"EUR")`
  and `fromPrice` recomputes accordingly. *Pinned by:* `VenueRepriceIT.repriceIsVisibleInTheVenueMap`.
- [ ] **AC-3 (owner-asserted, 403 cross-venue — invariant #13):** Given operator O2 who does **not**
  own V, when O2 reprices a row of V, then `NotVenueOwnerException` → `403 NOT_VENUE_OWNER`, and **no**
  `price_minor` changes. The ownership check is the first act of the service (before any read/write).
  *Pinned by:* `VenueRepriceIT.rejectsCrossVenueReprice` + `VenueAdminServiceTest.repriceAssertsOwnershipFirst`.
- [ ] **AC-4 (invalid input rejected at the edge, standard contract — §6b):** Given a reprice request
  with a **negative** `minorUnits` (or missing `price`, or a **non-numeric** `minorUnits`, or a
  non-ISO currency), when submitted, then `400 INVALID_REQUEST` RFC-7807 `ProblemDetail` and no price
  changes. *Pinned by:* `RowPriceCommandTest.rejectsNegativeAndBadCurrency` (unit) +
  `VenueAdminControllerTest.repriceRejectsInvalidBody` (web slice, incl. non-numeric → framework 400).
- [ ] **AC-5 (unknown row / venue → 404):** Given O owns V but row `Z` has no sets (or V does not
  exist), when O reprices row `Z`, then `404` (`NO_SUCH_ROW` / `NO_SUCH_VENUE`) and nothing changes.
  *Pinned by:* `VenueRepriceIT.unknownRowIsNotFound`.
- [ ] **AC-6 (projected take = Σ online-pool prices, from minor units):** Given a loaded layout with
  ONLINE sets `[3500,3500,2000]` and a WALK_IN set `[3500]`, when the Pricing tab renders, then the
  projected figure is `9000` minor → `€90.00` (WALK_IN excluded), and it **recomputes** after a row
  edit. *Pinned by:* `pricing-tab.spec.ts` › "projected take sums only online-pool sets".
- [ ] **AC-7 (money is minor units, converted at the edge — invariant #5):** Given the operator types
  `42.5` into row `A`'s € input and commits (`change`), when the reprice PUT is sent, then the body is
  exactly `{ price: { minorUnits: 4250, currency: 'EUR' } }` (integer), state holds **minor units**
  (never a float), and re-typing `42` sends `4200`. *Pinned by:* `pricing-tab.spec.ts` › "converts €
  input to integer minor units on commit".
- [ ] **AC-8 (tourist surfaces reflect the price):** Given a venue map whose row `A` sets carry
  `4200`, when a tourist opens the map and the booking dialog for an `A` set, then both render
  `€42.00`. *Pinned by:* existing `venue-map` / `booking-dialog` specs render `set.price` (unchanged
  contract) + backend AC-2 read-back + `e2e/real-backend/pricing.real.spec.ts` round-trip
  (reprice → tourist read shows the new price).
- [ ] **AC-9 (a11y + contrast):** The Pricing tab passes axe (labelled inputs, row semantics) and the
  porcelain contrast bar. *Pinned by:* `pricing-tab.a11y.spec.ts` + `pricing-tab.contrast.spec.ts`.
- [ ] **AC-10 (CI-safe mocked e2e):** A mocked Playwright spec signs in, opens Pricing, sees rows with
  label + tier description + price, edits a row, and asserts the reprice request (path + minor-unit
  body) and the updated projected figure. *Pinned by:* `e2e/operator-pricing.spec.ts`.

## Non-goals

- **No per-position/per-set price editing** — the editing grain is the **row** (design decision). A
  single set's price is only reachable via the O3 layout editor's full-set PATCH; O4 does not add it.
- **No re-pricing guardrail on booked venues.** Unlike layout replace, re-pricing is deliberately
  allowed while a venue has bookings/holds (existing bookings already snapshotted their price).
- **No currency switching.** Row price stays in the venue's existing per-set currency (EUR in v1);
  the input is EUR-only per design. Changing a venue's currency is out of scope.
- **No tourist-side code changes.** The tourist map + booking dialog already render `set.price`.
- **No batch "save all rows" write / no auto-save on keystroke.** One idempotent PUT per row, on
  input **commit** (`change`/Enter/blur), with per-row feedback.
- **No new Flyway migration, no schema/index change.**

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Re-pricing retroactively changes an in-flight/confirmed charge | low | high | **Verified**: `CreateBookingService.collect` charges `new Money(set.price()…)` from the `SetBookingInfo` **snapshotted at reserve time**; the PaymentIntent amount is fixed then. Reprice touches only `set_position`, never a booking/payment row. So a concurrent reprice cannot alter an existing charge. | agent | open |
| R-2 | Reusing O3 `replaceLayout` would block re-pricing a booked venue and reissue set ids / cascade availability | med | high | Do **not** reuse it. New `repriceRow` is a plain `UPDATE` of price columns only — never deletes/reinserts, never locks-FOR-UPDATE, never touches `availability` (invariant #2 not engaged). | agent | open |
| R-3 | Cross-venue write (BOLA, OWASP #1 — invariant #13) | med | high | `assertOwns(operator, VenueRef)` is the **first** statement of `VenueAdminService.repriceRow`, in the application service (no adapter can bypass). 403 `NOT_VENUE_OWNER`. Pinned by `VenueRepriceIT.rejectsCrossVenueReprice`. | agent | open |
| R-4 | Float creeps into money (invariant #5) | med | high | Wire + state carry **integer minor units** (`MoneyView.minorUnits`); EUR→minor conversion is `Math.round(parseFloat(x)*100)` at the input edge only; backend rejects `< 0` (command + DB CHECK). No `BigDecimal`/float anywhere. Pinned by `pricing-tab.spec.ts` AC-7. | agent | open |
| R-5 | Error contract drift (per-controller `{error:…}` body) | low | med | Reuse the central contract (§6b): typed `ChangeOutcome` → `ApiProblem` in the controller; validation → `IllegalArgumentException` → `ApiErrorHandler` 400 `INVALID_REQUEST`; ownership → `NotVenueOwnerException` 403. No new `@ExceptionHandler`. | agent | open |
| R-6 | Non-numeric price silently coerced | low | med | JSON bind of a non-numeric `minorUnits` → `HttpMessageNotReadableException` → framework 400 `INVALID_REQUEST` (already wired in `ApiErrorHandler.handleExceptionInternal`). Pinned in the web-slice test. | agent | open |
| R-7 | Flyway version collision | low | high | **N/A — no migration in this slice.** V22 stays free; no open PR claims it (checked: 0 open PRs). | agent | resolved |

## Open questions / Assumptions

- **Assumption:** Row price applies to **all** sets in the row (both pools); only ONLINE sets count
  toward projected take. — matches issue #174 ("applied to every set in the row") + design (projected
  sums non-walk-in). *Owner:* agent · *Resolves by:* phase 0 (encoded in `VenueRepriceIT`).
- **Assumption:** Projected take is **client-computed** from the already-loaded sets (Σ ONLINE
  `price.minorUnits`), not a new server endpoint — the console already loads the full map with
  per-set pool+price; no trust boundary (operator's own display, not a charge). *Owner:* agent ·
  *Resolves by:* phase 1.
- **Assumption:** A row's displayed price = the price of its lowest-`positionNo` set (rows are uniform
  after an O4 edit; first-set is the design's `row.priceMinor`). *Owner:* agent · *Resolves by:* phase 1.
- **Assumption:** Persistence trigger is **per-row on commit** (`change`), not a batch Save button —
  design shows live per-row inputs; each row is independent (no atomicity concern). *Owner:* agent ·
  *Resolves by:* phase 1.

### Resolved
- Reuse O3 bulk write? **No** (R-2) — settled at grill from `EditBeachMap.replaceLayout` semantics.

## Availability & concurrency (invariant #2)

**N/A for the availability table — but stated explicitly because the slice touches the beach map.**

- **Write paths to `availability(set_id, booking_date)`:** **none.** `repriceRow` updates only
  `set_position.price_minor` / `price_currency`. It does **not** insert/delete/lock any
  `set_availability` row, does **not** change set identity, and does **not** delete/reinsert sets.
- **Why invariant #2 is not engaged:** re-pricing is non-destructive metadata. Contrast O3
  `replaceLayout`, which had to `lockSetsOfVenue` FOR UPDATE precisely because it deletes sets (a
  cascade risk); reprice deletes nothing, so no lock/claim is needed. A booking's charge amount is
  snapshotted at reserve time (`SetBookingInfo` → `Money`), so a concurrent reprice cannot change an
  in-flight charge (R-1).
- **Pool rule (invariant #3):** unchanged — reprice never moves a set between pools; the projected
  take reads the existing `pool` flag to count ONLINE sets only.
- **Cutoff rule (invariant #4):** N/A — no booking is created.
- **Pinning test:** `VenueRepriceIT.repriceLeavesAvailabilityUntouched` — reprice a row whose set has
  a `set_availability` row/booking; assert the availability row and set id are unchanged and the
  reprice still succeeds (proving re-pricing is allowed on a claimed set, unlike layout replace).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns the beach map, set positions, and **pricing** (per its Job line). Reprice is a set-position field update. |
| M-2 | `operator` | existing | `Operator` | Consulted (not modified) via `operator.api.VenueOwnership#assertOwns` for the invariant-#13 check — already a `venue` dependency. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `VenueOwnership#assertOwns(OperatorId, VenueRef)` | `VenueRef` (`operator.vocabulary`) | `venue` (existing grant — no change) |

`repriceRow` is a **new method on the internal `EditBeachMap` port** (stays in `venue.application`,
not `api/` — the only caller is the module's own REST adapter; invariant #11). `Venues.repriceRow`
is the internal driven port on the module's own JDBC adapter (`application/`, not `spi/`). **No new
`allowedDependencies` grant** is required.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none** | — | — | — | — | — |

Re-pricing publishes **no event**: like `commission_bps`, price is mutable venue configuration
re-read by the tourist map at request time, never carried on an event. `ModularityTests` must stay
green (no new cross-module import).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Reprice every set in a beach-map row (persist `price_minor`/`price_currency`) | `venue` | `venue` **Job**: "the beach map / layout, set positions, … **pricing**". Not on any other module's Not-My-Job. All-in-`venue`, no boundary change. |
| Assert the operator owns the venue before repricing | `operator` (consulted) | `operator` **Job**: owns the operator↔venue ownership mapping; `venue` consults `VenueOwnership` (id-based, invariant #13). No new dependency. |
| Projected-take display (Σ online-pool prices) | frontend `operator/` | Pure display over the already-loaded read model; no backend capability. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves.** Re-pricing is venue configuration; it creates no charge/refund and no
payout-ledger effect. Money is integer minor units + EUR on the wire (invariant #5) and the existing
charge path snapshots the set price at reserve time, so a reprice never alters an existing
booking/charge/payout (R-1). `riviera-stripe-payments` consulted → confirms nothing to change.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/pricing-tab.ts` (+ `.html`) | new | standalone component | Signals: `sets` signal from the venue read; `computed()` rows + `computed()` projected take; per-row `saving`/`saved`/`error` state | native number `input` on `change` (no ngModel; commit-converted to minor units) — Signal Forms not needed for a single numeric field per row |
| FE-2 | `operator/operator-console.service.ts` | modified | service | — | new `repriceRow(venueId, rowLabel, price): Observable<void>` (PUT) + `repriceErrorOf` code mapping |
| FE-3 | `app.routes.ts` | modified | routes | — | swap `pricing` from `ConsolePlaceholder` to `PricingTab` (mirror O3's `beach-map`→`LayoutEditor`) |
| FE-4 | `operator/console-placeholder.ts` | modified | component | — | remove the now-live `pricing` case (leave a safe default) |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals + `computed()`, `formatMoney` for
display, porcelain glass via `CardGlass` (inherited theme), Tailwind test-hook classes
(`riviera-tailwind`). No `as any` on the contract. Reads the venue via the public
`VenueService.getVenueMap` (same as `LayoutEditor`) — reading own venue data through the public read
is fine; only the **write** is owner-asserted.

## FE↔BE contract

- **New endpoint:** `PUT /api/venues/{venueId}/rows/{rowLabel}/price`
  - Body: `{ "price": { "minorUnits": <int ≥ 0>, "currency": "EUR" } }` (reuses `MoneyView`).
  - `204 No Content` on success; `403 NOT_VENUE_OWNER`; `404 NO_SUCH_VENUE`/`NO_SUCH_ROW`;
    `400 INVALID_REQUEST` (negative/missing/non-numeric/bad currency). All RFC-7807 `ProblemDetail`
    with a stable `code`.
- **Client typing:** hand-written typed `OperatorConsoleService.repriceRow` returning
  `Observable<void>`; error mapped by a small `repriceErrorOf(err): 'NOT_VENUE_OWNER' | 'NO_SUCH_ROW'
  | 'NO_SUCH_VENUE' | 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'UNKNOWN'` (mirrors `layoutErrorOf`).
- **Money on the wire:** integer minor units + ISO currency, both sides (`MoneyView`).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc | ✅ | 3810ca2 |
| 1 — Backend reprice (port + adapter + endpoint + ITs) | ✅ | this commit |
| 2 — Frontend Pricing tab (component + service + route + unit/a11y/contrast) | ⏳ | |
| 3 — e2e (mocked + real-backend) + docs freshness | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase.

---

## File structure

**Backend (`platform/…/venue`):**
- `application/RowPriceCommand.java` — **new**: validated `(rowLabel, priceMinor, priceCurrency)`.
- `application/SetRejection.java` — **modify**: add `NO_SUCH_ROW`.
- `application/EditBeachMap.java` — **modify**: add `repriceRow(OperatorId, VenueId, RowPriceCommand)`.
- `application/VenueAdminService.java` — **modify**: implement `repriceRow` (ownership-first).
- `application/Venues.java` — **modify**: add `int repriceRow(VenueId, RowPriceCommand)`.
- `adapter/out/JdbcVenues.java` — **modify**: the `UPDATE … WHERE venue_id AND row_label` SQL.
- `adapter/in/RowPriceRequest.java` — **new**: `{ MoneyView price }` → `toCommand(rowLabel)`.
- `adapter/in/VenueAdminController.java` — **modify**: `PUT …/rows/{rowLabel}/price`; `NO_SUCH_ROW`→404.
- Tests: `RowPriceCommandTest`, `VenueAdminServiceTest` (+reprice), `VenueAdminControllerTest`
  (+reprice web slice), `VenueRepriceIT` (Testcontainers).

**Frontend (`frontend/src/app`):**
- `operator/pricing-tab.ts` + `pricing-tab.html` — **new** component.
- `operator/operator-console.service.ts` — **modify**: `repriceRow` + `repriceErrorOf`.
- `operator/operator-console.model.ts` — **modify**: `RepriceErrorCode` type.
- `app.routes.ts` — **modify**: route `pricing` → `PricingTab`.
- `operator/console-placeholder.ts` — **modify**: drop the `pricing` case.
- Specs: `pricing-tab.spec.ts`, `pricing-tab.a11y.spec.ts`, `pricing-tab.contrast.spec.ts`.

**e2e:**
- `frontend/e2e/operator-pricing.spec.ts` — **new** CI-safe mocked spec.
- `frontend/e2e/real-backend/pricing.real.spec.ts` — **new** real-backend round-trip.

---

## Phase 1 — Backend reprice (port → adapter → endpoint → ITs)

**Files:** Create `RowPriceCommand.java`, `RowPriceRequest.java`, `VenueRepriceIT.java` · Modify
`SetRejection`, `EditBeachMap`, `VenueAdminService`, `Venues`, `JdbcVenues`, `VenueAdminController`,
`VenueAdminServiceTest`, `VenueAdminControllerTest`.

- [ ] **Step 1 — Failing unit test** `RowPriceCommandTest`: rejects negative `priceMinor`, blank
  `rowLabel`, non-ISO currency; accepts a valid command.
- [ ] **Step 2 — Run** `./gradlew test --tests "*RowPriceCommandTest*"` → FAIL (class absent).
- [ ] **Step 3 — Implement** `RowPriceCommand` (compact constructor reusing `NewVenueCommand.requireText`
  / `requireIsoCurrency`, `priceMinor >= 0`); add `SetRejection.NO_SUCH_ROW`; add `EditBeachMap.repriceRow`;
  `Venues.repriceRow`; `JdbcVenues` `UPDATE set_position SET price_minor=:priceMinor,
  price_currency=:priceCurrency WHERE venue_id=:venue AND row_label=:rowLabel`; `VenueAdminService.repriceRow`
  (assertOwns → venueExists?NO_SUCH_VENUE → update==0?NO_SUCH_ROW:Applied, `@Transactional`); controller
  `PUT …/rows/{rowLabel}/price` + `RowPriceRequest`; `error(SetRejection)` `NO_SUCH_ROW`→404.
- [ ] **Step 4 — Run** `RowPriceCommandTest` + `VenueAdminServiceTest` + `VenueAdminControllerTest` → PASS.
- [ ] **Step 5 — Testcontainers** `VenueRepriceIT`: `repricesEverySetInTheRow`,
  `repriceIsVisibleInTheVenueMap`, `rejectsCrossVenueReprice` (403, no change), `unknownRowIsNotFound`,
  `repriceLeavesAvailabilityUntouched`.
- [ ] **Step 6 — Structural net** `./gradlew test --tests "*ModularityTests*" --tests
  "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests
  "*ErrorContractArchitectureTests*"` → PASS.
- [ ] **Step 7 — Commit** `feat: [O4] #174 per-row beach-map reprice write (owner-asserted)` + update status.

## Phase 2 — Frontend Pricing tab

**Files:** Create `pricing-tab.ts` + `.html` + 3 specs · Modify `operator-console.service.ts`,
`operator-console.model.ts`, `app.routes.ts`, `console-placeholder.ts`.

- [ ] **Step 1 — Failing spec** `pricing-tab.spec.ts`: renders one row per `rowLabel` with label +
  tier description ("Front row · N sets" / "Standard · N sets"); projected take = Σ ONLINE minor →
  formatted; editing a € input to `42.5` on `change` calls `repriceRow` with
  `{minorUnits:4250,currency:'EUR'}` and updates the projected figure; a 403 shows the not-owner copy.
- [ ] **Step 2 — Run** `npm test -- pricing-tab` → FAIL.
- [ ] **Step 3 — Implement** `OperatorConsoleService.repriceRow` (PUT) + `repriceErrorOf`; `PricingTab`
  (read map via `VenueService.getVenueMap`; `sets` signal; `computed()` rows + projected; `change`-commit
  EUR→minor; per-row save/saved/error); `app.routes.ts` swap; drop placeholder `pricing` case.
- [ ] **Step 4 — Run** `npm test -- pricing-tab` + `npm run lint` → PASS.
- [ ] **Step 5 — a11y + contrast** `pricing-tab.a11y.spec.ts` (axe: labelled inputs) +
  `pricing-tab.contrast.spec.ts` (porcelain bar). `npm run test:a11y` → PASS.
- [ ] **Step 6 — Commit** `feat: [O4] #174 Pricing tab (per-row € inputs + projected take)` + update status.

## Phase 3 — e2e + docs freshness

- [ ] **Step 1 — Mocked e2e** `frontend/e2e/operator-pricing.spec.ts` (CI-safe): stub session +
  venue map, open `/operator/:id/pricing`, assert rows + projected, edit a row, assert the PUT
  (path + minor-unit body) and updated projected. `npm run test:e2e -- operator-pricing`.
- [ ] **Step 2 — Real-backend e2e** `frontend/e2e/real-backend/pricing.real.spec.ts`: sign in, reprice
  a row, then load the tourist map and assert the new price shows (AC-8 round-trip). Local-only suite.
- [ ] **Step 3 — Docs freshness** (`riviera-docs-freshness`): confirm no substrate-doc drift (the
  `venue` module already lists pricing as its Job); update epic-#141 status note (O4 done) where tracked.
- [ ] **Step 4 — Commit** `test: [O4] #174 mocked + real-backend pricing e2e` + update status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/3/5:** `./gradlew test --tests "*VenueRepriceIT*" --tests "*VenueAdminServiceTest*"` → PASS.
- [ ] **AC-4:** `./gradlew test --tests "*RowPriceCommandTest*" --tests "*VenueAdminControllerTest*"` → PASS.
- [ ] **AC-6/7:** `npm test -- pricing-tab` → PASS.
- [ ] **AC-8:** backend AC-2 read-back green + existing venue-map/booking-dialog specs green + real-backend spec.
- [ ] **AC-9:** `npm run test:a11y` (pricing-tab) → PASS.
- [ ] **AC-10:** `npm run test:e2e -- operator-pricing` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — `JdbcClient` + text-block SQL only.
- [ ] **Availability** section filled — reprice provably does not touch `set_availability` / set identity (invariant #2).
- [ ] Pool rule honored — projected take counts ONLINE only (invariant #3); reprice never moves pools.
- [ ] **Modulith** section filled; `repriceRow` stays internal (`application/`); no new cross-module import; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** N/A justified; charge amount snapshotted at reserve time — reprice is decoupled (invariants #5/#8/#9).
- [ ] Money in integer minor units, converted at the input edge; no float in state/on wire (invariant #5).
- [ ] Per-venue authorization: `assertOwns` first in `repriceRow` (invariant #13) — cross-venue IT green.
- [ ] Error contract centralized (§6b): typed outcome → `ApiProblem`; validation → `ApiErrorHandler` 400; no per-controller handler.
- [ ] No Flyway migration needed; existing CHECK/index cover the write (invariant #12).
- [ ] **Frontend** standards met; no `as any`; e2e (mocked) + a11y + contrast shipped.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty (or deferred with an issue #).
