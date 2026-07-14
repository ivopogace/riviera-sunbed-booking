# S3 — Signed-in checkout linking + my-bookings Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use `- [ ]`.

> **Riviera discipline:** Availability & concurrency, Spring-Modulith, and Payment & payout
> are first-class sections. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A tourist signed in as a `CUSTOMER` links each new booking to their `CustomerAccountId`
and can list their linked bookings at `GET /api/me/bookings`; the guest checkout path is
byte-for-byte unchanged, and the signed-in "My bookings" screen shows the **union** of the account's
server-linked bookings and this device's remembered codes (deduped by code).

**Architecture:** The link is `booking`-side data — a **new nullable `account_id` column** on the
`booking` row keyed by `CustomerAccountId` (id-based, invariant #11), **no FK** to the guest
`customer` row (D-6). The account id is not on the Spring Security principal (which carries only the
email), so the platform edge resolves it via a new `customer` `api/` port and a `CurrentCustomer`
edge component — mirroring the existing `OperatorDirectory` + `CurrentOperator` pattern exactly
(RV-BE-11: login/identity-resolution machinery stays at the edge, not in a domain module).

**Persistence:** JDBC only (invariant #1). New migration **`V26__booking_customer_account.sql`**
(add nullable `booking.account_id BIGINT` + supporting index). No other table changes.

**Source of intent:** GitHub issue **#114** (epic #108, slice S3); design
`docs/architecture/auth-signin-register.md` (D-6). Back-linking past guest bookings by email is
**out of scope** — deferred to a #113-gated follow-up (issue #114 "Out of scope" section).

**Skills consulted:** `riviera-plan-doc` (this template + discipline); `riviera-modulith` (the
`account_id` link stays in `booking`; the email→id resolver is a new `customer::api` port consumed
via a `CurrentCustomer` edge component — not a module import of `customer.application`; new
`/api/me/bookings` controller is a `booking/adapter/in` driving adapter); `postgres` (nullable
`BIGINT` column + partial index on `account_id`, `TIMESTAMPTZ` already in place, no FK per D-6);
`riviera-frontend` (`MyBookings` stays in the `booking/` feature; auth state read from
`core/customer-auth.ts`; no new route — `/my-bookings` exists). Deferred to implement time per the
routing gate: `riviera-java-conventions` (records/typed-outcome/JdbcClient idioms), `angular-developer`
+ angular-cli MCP (v22 signals/a11y), `playwright-cli` (e2e authoring), `riviera-local-debug` (scoped test recipes).

**Branch:** `feature/s3-signed-in-my-bookings` (this remote branch stands in for `feature/<slug>`;
created off `main` before phase 0).

---

## Acceptance criteria (testable)

> Each AC is at the application boundary (inner hexagon) and names a test class.

- [ ] **AC-1 (link on signed-in checkout):** Given a `CreateBookingCommand` carrying a
  `CustomerAccountId`, when `CreateBooking.create` runs and confirms/awaits, then the persisted
  `Booking` row's `account_id` equals that id. *Pinned by:* `JdbcBookingsAccountLinkIT.persistsAccountIdWhenPresent`.
- [ ] **AC-2 (guest path unchanged):** Given a `CreateBookingCommand` with **no** account id (guest /
  signed-out), when `CreateBooking.create` runs, then `account_id` is `NULL` and every existing
  reserve outcome (Confirmed / AwaitingPayment / Requested / Rejected) is unchanged. *Pinned by:*
  `JdbcBookingsAccountLinkIT.leavesAccountIdNullForGuest` + the unchanged existing `*ReserveSet* / *CreateBooking*` suite.
- [ ] **AC-3 (my-bookings is account-scoped, cross-customer denial):** Given bookings linked to
  accounts A and B, when the my-bookings query runs for A, then only A's bookings are returned and
  never B's. *Pinned by:* `MyBookingsServiceTest.returnsOnlyTheGivenAccountsBookings`.
- [ ] **AC-4 (endpoint auth = session principal):** Given an authenticated `CUSTOMER`, when
  `GET /api/me/bookings`, then `200` with that customer's bookings; given an anonymous or `OPERATOR`
  principal, then `401`/`403` and no list is returned. *Pinned by:* `MyBookingsControllerTest`
  (WebMvc slice) + `MyBookingsIT`.
- [ ] **AC-5 (booking codes unaffected):** Given any booking (guest or account-linked), when
  `GET /api/bookings/{code}` is called, then it resolves exactly as today (invariant #7). *Pinned by:*
  the existing `BookingController` / `ViewBooking` suite staying green.
- [ ] **AC-6 (FE union, deduped):** Given a signed-in customer whose account has server-linked
  bookings **and** whose device has remembered codes, when `/my-bookings` loads, then the list shows
  the union deduped by code (no booking appears twice; nothing previously visible disappears).
  *Pinned by:* `my-bookings.spec.ts` + `frontend/e2e/my-bookings.e2e.ts` (mocked suite) with an axe pass.
- [ ] **AC-7 (guest FE unchanged):** Given a signed-out visitor, when `/my-bookings` loads, then it
  behaves exactly as today (device-local codes only, per-code fetch, 404-drops-but-keeps-code,
  retry). *Pinned by:* the existing `my-bookings.spec.ts` cases staying green.

## Non-goals

- **Back-linking past guest bookings by email** (attaching earlier guest bookings to a new account)
  — deferred to a #113-gated follow-up; needs verified email (invariant #7). Not in this slice.
- **Prefilling checkout contact from the account.** The account stores only email + hash (no name /
  phone), so signed-in checkout still collects `GuestContact`; the account link is purely additive.
- **Any change to the availability claim, pool rule, cutoff, payment, or payout** — see those sections.
- **A guest list endpoint.** Guests still have no server list; `GET /api/me/bookings` is CUSTOMER-only.
- **Migrating device-local storage** or capping the local code list (that is issue #164).

## Behavior-parity ledger (the `MyBookings` screen is extended, not retired)

> `MyBookings` is an existing surface gaining signed-in behavior. The user chose **merge device +
> account**, so every existing guest behavior must be **preserved** (additive union, never replaced).

| Old-surface behavior (guest device-local `MyBookings`, #139) | Verdict | How the new surface does it |
|---|---|---|
| Reads remembered codes from `DeviceLocalBookings`, fetches each via `GET /api/bookings/{code}` | preserved | still the source for device-local rows; signed-in adds server rows on top |
| `404` on a code → drop the row from view but **keep** the code (invariant #7) | preserved | unchanged for device-local codes; server rows come from the list endpoint, not per-code |
| Transient/offline failure → keep code, show Retry | preserved | unchanged for device-local rows |
| Newest-first device order, independent per-row load | preserved | union keeps device rows; server rows merged in, deduped by code |
| Empty state ("No booking yet") | preserved | shown when the union is empty |
| Codes treated as secrets, never logged | preserved | server list is keyed by session, not code; no code logging added |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `/api/me/bookings` reachable by the wrong principal (BOLA — another customer's or an operator's session lists bookings) | med | high | Endpoint scoped to `CUSTOMER` role in `SecurityConfig`; the list is keyed by the resolved `CustomerAccountId` from the session principal only — **never** a path/query param; `MyBookingsIT` asserts anonymous→401, operator→403, customer-A never sees B | Ivo | open |
| R-2 | Guest checkout path regresses (invariant #2/#4) when threading the optional account id | low | high | `account_id` is additive + nullable; the availability claim/cutoff/pool code is untouched; AC-2 + the full existing reserve suite pin the guest path byte-for-byte | Ivo | open |
| R-3 | Flyway version collision on `V26` | low | high | Verified at intake: latest on `main` is `V25`; only open PRs are 10 Dependabot npm bumps (no migrations). `V26` free. If a parallel slice merges first, this branch renumbers (default: merges-second) | Ivo | open |
| R-4 | New `/api/me/bookings` controller not registered in `@WebMvcTest` slices → slice tests fail to load context | med | low | Add the new controller's collaborators to the shared `WebSliceStubs` bean (recurring project gotcha: new controller ⇒ WebSliceStubs stub) | Ivo | open |
| R-5 | New `customer::api` port + `booking` grant introduces a module edge that breaks `@ApplicationModuleTest` / `ModularityTests` | med | med | `booking` already depends on `customer::vocabulary` (`CustomerId`, `GuestContact`); add the narrowest grant for the new port; run `*ModularityTests*` after the structural change; note full-suite-only `@ApplicationModuleTest` bean-accumulation class (CI owns it) | Ivo | open |
| R-6 | Error contract drift on the new endpoint | low | low | Reuse the centralized `ApiProblem`/`ProblemDetail` (RFC-7807), no per-controller `{"error":…}` body (`riviera-java-conventions` §6b) | Ivo | open |

## Open questions / Assumptions

- **Assumption:** the email→`CustomerAccountId` resolver is a **new** `customer::api` port
  (`CustomerAccountDirectory.accountFor(email) → Optional<CustomerAccountId>`), kept separate from the
  credential port `CustomerAccounts` — mirroring the operator split (`OperatorDirectory` id-resolution
  vs `OperatorAccounts` credentials). Structural/naming call, decided per plan-doc guidance. — *Owner:* Ivo · *Resolves by:* phase 0.
- **Assumption:** the signed-in "My bookings" server list returns the same `BookingDetail`-shaped rows
  the FE already renders, so `buildView` is reused unchanged. — *Owner:* Ivo · *Resolves by:* phase 1.
- **Resolved:** "My bookings" for a signed-in customer shows the **union of device-local codes and
  the account's server-linked bookings, deduped by code** (display-only merge, no data linking — so
  invariant #7 posture is preserved and back-linking stays deferred). — chosen by the user at intake.

## Availability & concurrency (invariant #2)

> `booking` is touched, so this section is mandatory — but the change does **not** touch availability.

- **Write paths to `availability(set_id, booking_date)`:** **none added or changed.** This slice adds
  only `booking.account_id` (metadata on the booking row) and a read-only list query. The reserve
  transaction, the `AvailabilityClaim` call, and the staff/cancel/request write paths are untouched.
- **Uniqueness guarantee:** unchanged — the existing `UNIQUE(set_id, booking_date)` still makes a set
  holdable by at most one party per date.
- **Concurrency strategy:** unchanged — the existing claim (`INSERT … ON CONFLICT` / `FOR UPDATE`)
  runs identically; `account_id` is set on the booking row within the same reserve transaction.
- **Pool rule (invariant #3):** unchanged — online bookings still target online-pool sets only.
- **Cutoff rule (invariant #4):** unchanged — same-day cutoff logic untouched.
- **Pinning test:** existing `ConcurrentReservationIT` stays green (proves the guest/concurrency
  behavior is unchanged); AC-2 adds the null-account assertion on that path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | owns bookings + their lifecycle; the account link and the my-bookings query are booking data/reads (`RESPONSIBILITIES.md`: "Creating or tracking bookings → booking") |
| M-2 | `customer` | existing | `CustomerAccount` | owns account identity; publishes a new `api/` resolver email→`CustomerAccountId` (identity resolution, not credentials) |
| — | platform edge (root pkg) | existing | — | `CurrentCustomer` reads the Spring Security context → `CustomerAccountId` (an edge concern, RV-BE-11 — not `customer` domain), mirroring `CurrentOperator` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerAccountDirectory#accountFor(String email) → Optional<CustomerAccountId>` | `CustomerAccountId` (existing `customer.vocabulary`) | the platform edge (`CurrentCustomer`) |

> No new event. Linking is synchronous booking-write metadata; my-bookings is a synchronous read.
> `booking` already imports `customer::vocabulary` (`CustomerId`, `GuestContact`); it does **not** need
> the new `customer::api` port — the edge resolves the id and passes it in. `booking` gains no new
> cross-module grant; `customer::api` is granted to the **root/edge** only.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none | — | — | — | — | N/A — no new event; account id is booking-write metadata |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store the booking↔account link (`account_id` on the booking row) | `booking` | `booking` Job: own bookings + their data; **not** `customer` (its Not-My-Job: "Bookings → booking") |
| List a customer's bookings (`GET /api/me/bookings` → query) | `booking` | reading bookings is `booking`'s job; `customer` Not-My-Job explicitly says "Bookings → booking" |
| Resolve login email → `CustomerAccountId` (identity resolution) | `customer` (`api/`) | `customer` Job: own account identity; exposes the mapping via a published port, as `operator` does with `OperatorDirectory` |
| Read the Spring Security principal → `CustomerAccountId` | platform edge (root) | reading the security context is an edge concern (RV-BE-11), **not** `customer` domain — mirrors `CurrentOperator` |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves.** Linking a booking to an account and listing bookings change no charge,
refund, commission, or payout-ledger behavior. The amount already stored on the booking (integer
minor units, EUR, invariant #5) is displayed read-only in the list.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/my-bookings.ts` | existing → extended | standalone component | Signals; reads `CustomerAuth.signedIn()`; unions device-local + server rows | none |
| FE-2 | `booking/booking.service.ts` | existing → extended | `@Service()` HTTP | new `myBookings(): Observable<BookingDetail[]>` → `GET /api/me/bookings` | none |
| FE-3 | `booking/booking.model.ts` | existing → maybe extended | types | the my-bookings list row type (reuse `BookingDetail` if shape matches) | none |

**Standards:** standalone, `inject()`, `@if`/`@for`, signals; reuse the existing `buildView`/`RowView`
presentation and `/booking/:code` detail link; no new route (`/my-bookings` exists). Union dedupe is by
`code`. No `NgOptimizedImage`/new images. Session cookie flows via the existing `api-session.interceptor`.

## FE↔BE contract

- **New endpoint:** `GET /api/me/bookings` → `200` `BookingDetail[]` for the authenticated customer;
  `401` anonymous, `403` non-customer. RFC-7807 `ProblemDetail` on error (issue #97 shape).
- **Changed request:** `POST /api/bookings` gains **no wire change** — the account id is taken from the
  **session**, not the request body (the FE sends the same `CreateBookingRequest`; the cookie carries identity).
- **Client typing:** hand-written typed service (`BookingService.myBookings()`), reusing `BookingDetail`;
  no `as any`.
- **Money/date on the wire:** amounts as integer minor units + currency; `bookingDate` as ISO `LocalDate` — unchanged.

## Execution status

> Session-recovery anchor. Re-read before acting after any compaction. Update in the same commit window.

**Stage pointer:** `plan` — plan doc authored, not yet approved/started.

**Next action:** review plan with Ivo, then begin Phase 0 (V26 migration + booking write link) test-first.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — DB + signed-in checkout link | | |
| 1 — my-bookings query endpoint | | |
| 2 — frontend union screen | | |
| 3 — e2e (mocked) + a11y | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend**
- `platform/src/main/resources/db/migration/V26__booking_customer_account.sql` — new: nullable
  `account_id BIGINT` on `booking` + partial index `WHERE account_id IS NOT NULL`.
- `platform/.../customer/api/CustomerAccountDirectory.java` — new: `accountFor(email) → Optional<CustomerAccountId>` port.
- `platform/.../customer/adapter/out/JdbcCustomerAccounts.java` — modify: implement the new resolver (email→id).
- `platform/.../CurrentCustomer.java` (root/edge) — new: `Optional<CustomerAccountId>` from `Authentication` (mirrors `CurrentOperator`).
- `platform/.../booking/application/reserve/CreateBookingCommand.java` — modify: add nullable `CustomerAccountId accountId`.
- `platform/.../booking/application/reserve/NewBooking.java` — modify: add `CustomerAccountId accountId`.
- `platform/.../booking/application/reserve/ReserveSetService.java` (+ `CreateBookingService`) — modify: carry the id through.
- `platform/.../booking/adapter/out/JdbcBookings.java` — modify: persist `account_id`; add `findByAccountId`.
- `platform/.../booking/adapter/in/CreateBookingRequest.java` / `BookingController.java` — modify: resolve principal→accountId via `CurrentCustomer`, pass into the command.
- `platform/.../booking/application/view/MyBookings.java` (+ service) — new: `forCustomer(CustomerAccountId) → List<BookingSummary>`.
- `platform/.../booking/adapter/in/MyBookingsController.java` — new: `GET /api/me/bookings`.
- `platform/.../SecurityConfig.java` — modify: `/api/me/**` requires role `CUSTOMER`.
- Tests: `JdbcBookingsAccountLinkIT`, `MyBookingsServiceTest`, `MyBookingsControllerTest`, `MyBookingsIT`; `WebSliceStubs` updated.

**Frontend**
- `frontend/src/app/booking/booking.service.ts` — add `myBookings()`.
- `frontend/src/app/booking/my-bookings.ts` (+ `.spec.ts`) — auth-aware union.
- `frontend/src/app/booking/booking.model.ts` — list row type if needed.
- `frontend/e2e/my-bookings.e2e.ts` — new mocked spec (signed-in checkout + my-bookings + axe).

---

## Phase 0 — DB + signed-in checkout link

**Files:** Create `V26__booking_customer_account.sql`, `CustomerAccountDirectory.java`,
`CurrentCustomer.java` · Modify `CreateBookingCommand`, `NewBooking`, reserve service,
`JdbcBookings`, `CreateBookingRequest`, `BookingController` · Test `JdbcBookingsAccountLinkIT`.

- [ ] **Step 1: Write the failing test** — `JdbcBookingsAccountLinkIT`: persist a booking with a
  `CustomerAccountId` → row's `account_id` matches; persist without → `NULL` (AC-1, AC-2).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*JdbcBookingsAccountLinkIT*"` → FAIL (no column).
- [ ] **Step 3: Minimal implementation** — write `V26`; add the nullable field through
  `CreateBookingCommand`/`NewBooking`/reserve service/`JdbcBookings`; add `CustomerAccountDirectory` +
  `JdbcCustomerAccounts` impl + `CurrentCustomer`; wire `BookingController` to pass the resolved id
  (empty → null for guests).
- [ ] **Step 4: Run it, verify it passes**; then `--tests "*ModularityTests*"` (R-5) and the existing
  reserve suite (AC-2 guest path unchanged).
- [ ] **Step 5: Generalization-audit** — is any other create path (Request-to-Book `BookingRequestController`)
  a signed-in entry that should also stamp the account id? Record decision.
- [ ] **Step 6: Commit** — `feat(customer): link signed-in checkout to CustomerAccountId (#114)`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — my-bookings query endpoint

**Files:** Create `MyBookings` (service) + `MyBookingsController` · Modify `JdbcBookings`
(`findByAccountId`), `SecurityConfig` (`/api/me/**` → CUSTOMER), `WebSliceStubs` · Test
`MyBookingsServiceTest`, `MyBookingsControllerTest`, `MyBookingsIT`.

- [ ] **Step 1: Write the failing tests** — service returns only account A's bookings, never B's
  (AC-3); controller returns 200 for a customer, 401 anonymous, 403 operator (AC-4).
- [ ] **Step 2: Run, verify fail** — `--tests "*MyBookings*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — `findByAccountId`; `MyBookings.forCustomer`; controller
  `GET /api/me/bookings` resolving the id via `CurrentCustomer.require`; `SecurityConfig` matcher;
  `WebSliceStubs` stub (R-4).
- [ ] **Step 4: Run, verify pass**; `--tests "*ModularityTests*"`.
- [ ] **Step 5: Generalization-audit** — confirm `ApiProblem` reused (no bespoke error body, R-6).
- [ ] **Step 6: Commit** — `feat(booking): GET /api/me/bookings for the signed-in customer (#114)`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — frontend union screen

**Files:** Modify `booking.service.ts`, `my-bookings.ts` (+ `.spec.ts`), `booking.model.ts`.

- [ ] **Step 1: Write the failing spec** — signed-in: union of device codes + server bookings, deduped
  by code (AC-6); signed-out: device-local only, unchanged (AC-7).
- [ ] **Step 2: Run, verify fail** — `npm test -- my-bookings` → FAIL.
- [ ] **Step 3: Minimal implementation** — `BookingService.myBookings()`; in `MyBookings`, when
  `CustomerAuth.signedIn()`, fetch the server list and union with device codes (dedupe by `code`),
  reusing `buildView`.
- [ ] **Step 4: Run, verify pass** — `npm test -- my-bookings`, `npm run lint`.
- [ ] **Step 5: Generalization-audit** — is the guarded-localStorage/dedup logic worth sharing (#163/#164)? Record.
- [ ] **Step 6: Commit** — `feat(booking): signed-in My bookings merges device + account (#114)`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — e2e (mocked) + a11y

**Files:** Create `frontend/e2e/my-bookings.e2e.ts` (CI-safe mocked suite).

- [ ] **Step 1: Author the spec** — mock `/api/auth/me` (customer), `/api/me/bookings`, and per-code
  `GET /api/bookings/{code}`; sign in, create a booking, open `/my-bookings`, assert the union renders;
  `expectNoSeriousAxeViolations` after animations settle.
- [ ] **Step 2: Run** — `npm run test:e2e` (and `test:e2e:a11y` on Windows per project note) → PASS.
- [ ] **Step 3: Commit** — `test(booking): e2e signed-in checkout + my-bookings (#114)`
- [ ] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** each run via its pinning test/command above; record the verifying commit SHA here before claiming done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; guest reserve path + `ConcurrentReservationIT` unchanged (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; the new `customer::api` grant is edge-only; no `booking`↔`customer` internal import; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** N/A justified; no money path touched (invariants #5, #8, #9).
- [ ] Booking codes unguessable + unaffected (invariant #7).
- [ ] Flyway `V26` present; nullable-column + no-FK (D-6) intentional; index tested (invariant #12).
- [ ] `/api/me/bookings` is session-principal-scoped, CUSTOMER-only; cross-customer denial tested (BOLA / invariant #13 posture).
- [ ] **Frontend** standards met; union deduped by code; no `as any`.
- [ ] Execution status at HEAD matches reality; findings register current.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty (or deferred with an issue #).
