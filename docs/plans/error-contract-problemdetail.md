# One Error Contract — RFC-7807 ProblemDetail via a Single Advice (#97) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every API error response is an RFC-7807 `ProblemDetail`
(`application/problem+json`) carrying a stable machine-readable `code` extension, emitted
through exactly one `@RestControllerAdvice` + one shared factory; the Angular client and
the mocked e2e suite parse the new shape; no `{"error": CODE}` body remains anywhere.

**Architecture:** The repo deliberately models expected failures as **sealed typed
outcomes, not exceptions** (`riviera-java-conventions` §6) — so an advice alone cannot own
all wire mapping (it never sees a returned `BookingOutcome.Rejected`). The design splits
the contract in two: a root-package **`ApiProblem` factory** (the single place the wire
shape is built — status, title, `code`, safe detail) used by the controllers' outcome
switches, and a single **`ApiErrorHandler` advice** (extends
`ResponseEntityExceptionHandler`, absorbs today's `VenueAuthorizationExceptionHandler`)
that maps every exception class — `IllegalArgumentException` → 400,
`DataIntegrityViolationException` → 409, `NotVenueOwnerException`/`AccessDeniedException`
→ 403, framework errors (unreadable body, type mismatch) → 400 — to the same shape. The
one MVC-external producer, `RateLimitFilter` (429), is converted by hand to the identical
ProblemDetail JSON. An ArchUnit rule pins "no `@ExceptionHandler` outside the advice" so
#98's Request-to-Book endpoints are born on the contract.

**Validation style — settled (the §6b open decision):** **Keep centralized-explicit
validation** in the request DTOs' `toCommand()` (throwing `IllegalArgumentException`,
mapped once by the advice). **Do not** add `spring-boot-starter-validation`/`@Valid`.
Rationale: only three request DTOs exist and their checks are parse/cross-field logic
(ISO dates, currency codes) that annotations handle poorly; Bean Validation would split
validation across two mechanisms; explicit code in records is the repo idiom (the same
minimalism as no-Lombok/no-JPA). Reversible in one dependency line + annotations if the
DTO count ever makes annotations pay — so **no ADR** (fails the hard-to-reverse test).
Recorded here and in `riviera-java-conventions` §6b (note updated in Phase 5).

**Persistence:** JDBC only (invariant #1). **No tables/migrations touched** — this slice
is wire-contract only.

**Source of intent:** GitHub issue #97 (parent epic #93, item 4);
`riviera-java-conventions` §6b is the target spec.

**Skills consulted:** `riviera-sdlc` (workflow), `riviera-plan-doc` (this template),
`riviera-java-conventions` (§6b target; §6's typed-outcomes rule → factory-not-exceptions
design; §10 no-booking-code-in-logs), `riviera-modulith` (root package =
shared app-wide edge config → `ApiProblem`/`ApiErrorHandler` placement beside
`SecurityConfig`/`CurrentOperator`; no module boundary change), `codebase-design` (one
deep seam — the factory — instead of N shallow per-controller helpers),
`riviera-local-debug` (cloud Gradle recipe + scoped-test discipline, loaded before first
build). At implement time per phase: `riviera-stripe-payments` (Phase 2 — payout
controller wire shape only, no money-flow change), `angular-developer` + angular-cli MCP
(Phase 4 — FE parsing), `playwright-cli` (Phase 5 — mocked error-state e2e).
`postgres` N/A — no schema change.

**Branch:** `claude/riviera-error-response-standard-o914tq` (cloud session — the
designated remote branch stands in for `feature/error-contract-problemdetail` per the
SDLC remote addendum).

---

## Acceptance criteria (testable)

> Written at the adapter boundary by necessity — this slice IS the wire contract; there
> is no inner-hexagon behavior change (ports, outcomes, and domain logic are untouched).

- [ ] **AC-1:** Given a set already taken, when `POST /api/bookings` targets it, then the
  response is `409`, content type `application/problem+json`, and `code == "SET_TAKEN"`
  (`status`/`title` consistent; same pattern for `SET_NOT_BOOKABLE_ONLINE`/
  `BOOKING_CLOSED` → 422, `NO_SUCH_SET` → 404). *Pinned by:* `BookingControllerIT`.
- [ ] **AC-2:** Given a malformed create-booking body (bad date), when posted, then `400`
  ProblemDetail with `code == "INVALID_REQUEST"` produced by the **global advice** (the
  per-controller `@ExceptionHandler` is gone). *Pinned by:*
  `BookingControllerIT.rejectsMalformedRequestWith400`.
- [ ] **AC-3:** Given an unknown booking code, when `GET /api/bookings/{code}` or
  `POST /api/bookings/{code}/cancel`, then `404`/`409` ProblemDetail with
  `code == "NO_SUCH_BOOKING"`/`"NOT_CANCELLABLE"` **and the response body does not
  contain the booking code** (invariant #7 — `instance` must not echo the request URI).
  *Pinned by:* `BookingViewIT`.
- [ ] **AC-4:** Given beach-map edits, when a cell/position is taken or ids are unknown,
  then `409 CELL_TAKEN`/`409 DUPLICATE_POSITION`/`404 NO_SUCH_VENUE|NO_SUCH_SET`
  ProblemDetail; a constraint-race (`DataIntegrityViolationException`) maps to
  `409 CONFLICT` via the advice. *Pinned by:* `VenueAdminControllerIT`.
- [ ] **AC-5:** Given staff tap-to-mark/release, when the set is taken / unknown / date
  past / not marked, then `409 ALREADY_TAKEN`/`404 NO_SUCH_SET`/`422 DATE_IN_PAST`/
  `409 NOT_MARKED` ProblemDetail. *Pinned by:* `StaffAvailabilityControllerIT`.
- [ ] **AC-6:** Given the payout batch admin API, when the transition is illegal /
  the batch unknown / the period malformed, then `409` with **stable**
  `code == "ILLEGAL_TRANSITION"` (from→to moved to `detail`) / `404 NO_SUCH_BATCH` /
  `400 INVALID_REQUEST` (no `ex.getMessage()` leaked as the code). *Pinned by:* new
  `AdminPayoutBatchControllerTest` (MockMvc, stubbed `PayoutReport` — first wire-level
  test for this controller).
- [ ] **AC-7:** Given an operator calling another operator's venue-scoped endpoint, when
  denied, then the existing `403` ProblemDetail additionally carries
  `code == "NOT_VENUE_OWNER"` (and `"ACCESS_DENIED"` for the no-active-operator case).
  *Pinned by:* `CrossVenueDenialIT` (one body assertion added — statuses unchanged).
- [ ] **AC-8:** Given the rate limiter trips, when a public booking endpoint is hit, then
  `429` with `application/problem+json`, `code == "RATE_LIMITED"`, and the `Retry-After`
  header (unchanged). *Pinned by:* `RateLimitFilterTest`.
- [ ] **AC-9:** No `@ExceptionHandler` exists outside `ApiErrorHandler`, and no
  `{"error": …}` body is built anywhere in main source. *Pinned by:* new rule in
  `ErrorContractArchitectureTests` (ArchUnit) + `grep` sweep in final verification.
- [ ] **AC-10:** Given a ProblemDetail error response, when `bookingErrorOf` /
  `staffMarkErrorOf` / `staffReleaseErrorOf` / `venueAdminErrorOf` map it, then the same
  displayable error codes come back as today (from the `code` extension, not `error`).
  *Pinned by:* the existing FE specs (`home.spec.ts`, `venue-editor.spec.ts`, a11y
  specs) updated to mock ProblemDetail bodies — assertions kept, not weakened.
- [ ] **AC-11:** Given the mocked e2e suite, when the booking API returns a mocked
  `409 SET_TAKEN` ProblemDetail, then the booking flow surfaces the error state
  accessibly (new coverage — today no e2e spec mocks an error body at all). *Pinned by:*
  `frontend/e2e/booking-flow.e2e.ts` (CI-safe mocked suite per RV-FE-E2E).

## Non-goals

- **No `type` URI registry** — `type` stays `about:blank`; the stable machine identity is
  the `code` extension. (A docs URL per code is a later nicety.)
- **No `spring-boot-starter-validation` / `@Valid`** — decision above.
- **No 401 body change** — the httpBasic entry point's status-only `401` stays; FE
  already discriminates on status for it.
- **No OpenAPI/schema generation, no new endpoints** (#98 builds on this, later).
- **No payout FE surface** (none exists), no change to payment/refund semantics.
- **No renaming of preserved codes** — existing code *values* survive except:
  `LAYOUT_CONFLICT` → `CONFLICT` (the DIVE handler goes global and can't claim
  layout-specific knowledge) and payout's `ILLEGAL_TRANSITION A->B` → stable
  `ILLEGAL_TRANSITION`.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | FE/BE wire mismatch mid-slice (breaking change for existing consumers) | med | high | Single vertical PR: BE + FE + specs + e2e land together; mocked suites pin the new shape | agent | open |
| R-2 | Booking code leaks into error payloads — Spring auto-fills ProblemDetail `instance` with the request URI (`/api/bookings/{code}`) (invariant #7) | med | high | Advice/controller sets `instance` explicitly (URI template, not expanded path); negative assertion in `BookingViewIT` that the body never contains the code | agent | open |
| R-3 | Global `DataIntegrityViolationException` → 409 masks genuine bugs (e.g. a NOT-NULL violation) as client conflicts | low | med | Handler logs the exception at WARN with stack; 409 is still the correct answer for the only DIVE that reaches the wire today (layout unique-constraint race) | agent | open |
| R-4 | Framework-generated errors (unreadable body, param type mismatch, missing param) bypass the `code` extension | med | med | `ApiErrorHandler extends ResponseEntityExceptionHandler`; override to stamp stable codes (`INVALID_REQUEST`); pinned for the staff-release bad-date param | agent | open |
| R-5 | Removing per-controller handlers silently changes an untested edge | low | med | ArchUnit rule (AC-9) + every controller IT updated with shape assertions, not weakened | agent | open |
| R-6 | 429 filter body drifts from the advice's shape (two producers, one contract) | low | low | `RateLimitFilterTest` pins content type + `code`; body constant documented as mirroring `ApiProblem` | agent | open |
| R-7 | `ex.getMessage()` previously exposed by payout 400s disappears — a consumer relied on it | low | low | No FE consumes payout errors; the stable `code` + safe `detail` is the contract now | agent | open |

## Open questions / Assumptions

- **Assumption:** No consumer outside this repo parses `{"error": CODE}` (no mobile app,
  no third-party API clients in v1) — the Angular app + test suites are the complete
  consumer set. — *Owner:* agent · *Resolves by:* PR review (user can veto).
- **Assumption:** Spring Boot 4's `ResponseEntityExceptionHandler` emits ProblemDetail
  natively; only the `code` extension needs adding. — *Owner:* agent · *Resolves by:*
  Phase 0 red test.

### Resolved

- **§6b open decision (validation style):** centralized-explicit `toCommand()` kept; no
  Bean Validation starter. Rationale in header. — settled at plan stage, this doc.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No write path, constraint, or claim strategy
changes; the slice only re-shapes how already-computed rejection outcomes
(`ALREADY_TAKEN`, `SET_TAKEN`, …) are serialized to HTTP. The pinning concurrency tests
(`ConcurrentReservationIT` et al.) are untouched; controller ITs keep asserting the same
statuses for the same outcomes.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | platform root (`ai.riviera.platform`) | existing | — | `ApiProblem` + `ApiErrorHandler` are app-wide edge config, the established home of `SecurityConfig`/`CurrentOperator`/`RateLimitFilter`/`VenueAuthorizationExceptionHandler` (which the advice absorbs); Modulith treats root-package classes as shared, so no `allowedDependencies` change |
| M-2 | `booking` adapter/in | existing | `Booking` | its controller's outcome switch builds ProblemDetail via the factory |
| M-3 | `venue` adapter/in | existing | `Venue`, `BeachMap` | same |
| M-4 | `availability` adapter/in | existing | `SetAvailability` | same |
| M-5 | `payout` adapter/in | existing | `PayoutBatch` | same + stable `ILLEGAL_TRANSITION` code |

**Module-ownership table (plan-doc §4a):** wire-shape mapping is a driving-adapter
concern; each module's `adapter/in` keeps mapping **its own outcomes** to statuses
(exhaustive switches stay put — no module gains foreign knowledge). Only the **shape
factory** and **exception mapping** centralize at the platform edge, which owns
"HTTP-facing cross-cutting concerns" (RESPONSIBILITIES.md places security/rate-limit edge
infra there already; no module's Not-My-Job list claims wire formatting). No cross-module
`api/` port, no event, no vocabulary change → invariant #11 untouched;
`ModularityTests`/`PackageShapeArchitectureTests` must stay green.

**Cross-module named interfaces (`api/` ports):** none added/changed.

**Domain events:** none added/changed.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves differently.** The payout batch controller only changes its error
*serialization* (stable `code`, no `getMessage()` leak); statuses, transitions, ledger
math, Stripe flows, and webhook handling are untouched. (`riviera-stripe-payments`
loaded at Phase 2 to confirm no payment-contract implication — collect-only model
unaffected.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking.service.ts` (`bookingErrorOf`) | existing | error-mapping fn | pure fn | n/a |
| FE-2 | `staff/staff.service.ts` (`staffMarkErrorOf`, `staffReleaseErrorOf`) | existing | error-mapping fns | pure fn | n/a |
| FE-3 | `venue-admin/venue-admin.service.ts` (`venueAdminErrorOf`) | existing | error-mapping fn | pure fn | n/a |
| FE-4 | specs mocking error bodies: `pages/home/home.spec.ts`, `venue-admin/venue-editor.spec.ts`, `pages/home/home.a11y.spec.ts`, `staff/staff-daily.a11y.spec.ts`, `venue/venue-map.a11y.spec.ts`, `staff/staff.model.ts` (doc comment) | existing | test mocks | — | n/a |
| FE-5 | `frontend/e2e/booking-flow.e2e.ts` — **new** mocked 409 error-state scenario | new spec in existing file | e2e (mocked, CI-safe suite) | — | n/a |

**Standards:** no component/template changes — the mapping functions' return vocabulary
is preserved, so components and their a11y behavior (live-region error rendering) are
untouched; a11y specs re-run to prove it (AC-10/11). A shared `problemCodeOf(error)`
helper is acceptable if it removes the triplicated cast, per `angular-developer` DRY
guidance — decided at Phase 4 with the MCP best practices loaded.

## FE↔BE contract

- **Changed shape (breaking), all error responses:**
  `{"type":"about:blank","title":"<reason phrase>","status":<n>,"detail":"<safe human text>","code":"<STABLE_CODE>"}`
  with `Content-Type: application/problem+json`. `instance` only ever a URI **template**
  (never an expanded path that could carry a booking code).
- **Code vocabulary (stable):** `SET_TAKEN`, `SET_NOT_BOOKABLE_ONLINE`,
  `BOOKING_CLOSED`, `NO_SUCH_SET`, `NO_SUCH_BOOKING`, `NOT_CANCELLABLE`,
  `INVALID_REQUEST`, `CELL_TAKEN`, `DUPLICATE_POSITION`, `NO_SUCH_VENUE`,
  `ALREADY_TAKEN`, `DATE_IN_PAST`, `NOT_MARKED`, `NO_SUCH_BATCH`, `ILLEGAL_TRANSITION`,
  `CONFLICT` (was `LAYOUT_CONFLICT`), `NOT_VENUE_OWNER` (new), `ACCESS_DENIED` (new),
  `RATE_LIMITED`.
- **Client typing:** hand-written — FE mapping fns read `code` via a typed
  `{ code?: string }` cast (never `as any`); success DTOs unchanged.
- **Status mapping (unchanged, now centrally defined):** conflict → 409;
  not-bookable/cutoff → 422; unknown id → 404; malformed → 400; ownership → 403;
  rate-limit → 429.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — ApiProblem + single advice + booking controller on the contract | ⏳ | |
| 1 — venue + availability controllers migrated | | |
| 2 — payout controller migrated (stable codes, first wire test) | | |
| 3 — RateLimitFilter 429 ProblemDetail + ArchUnit pin | | |
| 4 — Angular services + specs parse ProblemDetail | | |
| 5 — mocked e2e error-state + §6b/substrate docs sweep | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `platform/src/main/java/ai/riviera/platform/ApiProblem.java` — **new**; the one place
  the wire shape is built (`ProblemDetail of(HttpStatus, String code, String detail)`).
- `platform/src/main/java/ai/riviera/platform/ApiErrorHandler.java` — **new**; the single
  `@RestControllerAdvice extends ResponseEntityExceptionHandler`; absorbs and replaces
  `VenueAuthorizationExceptionHandler.java` (**deleted**).
- `platform/src/main/java/ai/riviera/platform/{booking,venue,availability,payout}/adapter/in/*Controller.java`
  — outcome switches build via `ApiProblem`; per-controller `@ExceptionHandler`s removed.
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — 429 body →
  ProblemDetail JSON + `application/problem+json`.
- `platform/src/test/java/.../ErrorContractArchitectureTests.java` — **new** ArchUnit
  rule (AC-9).
- `platform/src/test/java/.../payout/AdminPayoutBatchControllerTest.java` — **new**.
- Existing ITs updated: `BookingControllerIT`, `BookingViewIT`, `VenueAdminControllerIT`,
  `StaffAvailabilityControllerIT`, `CrossVenueDenialIT`, `RateLimitFilterTest`.
- `frontend/src/app/{booking,staff,venue-admin}/…service.ts`, specs per FE-4,
  `frontend/e2e/booking-flow.e2e.ts`.
- `.claude/skills/riviera-java-conventions/SKILL.md` §6b — decision note updated;
  `RESPONSIBILITIES.md` / `CONTEXT.md` swept for old-shape mentions (Phase 5).

---

## Phases 0–5 — task shape

Each phase is TDD (red → green → refactor), commits reference `#97`, scoped test runs
per `riviera-local-debug` (single class red/green; touched package at phase end; full
suite in CI only).

- **Phase 0:** update `BookingControllerIT`/`BookingViewIT` expectations (red) → add
  `ApiProblem` + `ApiErrorHandler` (absorbing the 403 advice, + `code` on 403s,
  `IllegalArgumentException`→400, DIVE→409, framework overrides), migrate
  `BookingController`, delete its `@ExceptionHandler` (green). Includes the
  invariant-#7 `instance`/body negative assertion.
- **Phase 1:** same for `VenueAdminController` (drop both handlers; DIVE now global,
  `LAYOUT_CONFLICT`→`CONFLICT`) and `StaffAvailabilityController`; update their ITs +
  `CrossVenueDenialIT` shape assertion.
- **Phase 2:** `riviera-stripe-payments` loaded; new `AdminPayoutBatchControllerTest`
  (red) → migrate `AdminPayoutBatchController` (stable `ILLEGAL_TRANSITION`, no
  message-as-code) (green).
- **Phase 3:** `RateLimitFilterTest` expectations (red) → filter body/content-type
  (green); add `ErrorContractArchitectureTests` rule.
- **Phase 4:** `angular-developer` + MCP loaded; FE specs' mock bodies → ProblemDetail
  (red) → mapping fns read `code` (green); a11y specs re-run.
- **Phase 5:** `playwright-cli` loaded; new mocked 409 error-state e2e scenario; §6b
  note + substrate-doc sweep; plan-doc close-out.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-02 | plan (grill gate) | `{"error"` producers beyond the 4 controllers | `grep -rln '"error"' platform/src/main` | `RateLimitFilter` (servlet filter, outside MVC) | pulled into scope as Phase 3 — the advice can't reach it |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..5, AC-7:** Docker-gated ITs — run in CI (local runs skip without Docker per `riviera-local-debug`); record the green check here.
- [ ] **AC-6:** `gradle test --tests "*AdminPayoutBatchControllerTest*"` → PASS (local, no Docker needed).
- [ ] **AC-8:** `gradle test --tests "*RateLimitFilterTest*"` → PASS (local).
- [ ] **AC-9:** `gradle test --tests "*ErrorContractArchitectureTests*"` → PASS; `grep -rn '"error"' platform/src/main/java` → 0 body-producing hits.
- [ ] **AC-10:** `npm test` → PASS (all specs mock ProblemDetail bodies; assertions kept).
- [ ] **AC-11:** mocked-suite Playwright run of `e2e/booking-flow.e2e.ts` → PASS incl. the new error-state spec.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** N/A justified (no write-path change) (invariant #2).
- [ ] Pool + cutoff rules honored — untouched; same statuses re-asserted (#3, #4).
- [ ] **Modulith** section filled; no cross-module internals imports; root-package placement per precedent (invariant #11).
- [ ] **Payment/payout** N/A justified — wire shape only (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone rules untouched (invariant #6).
- [ ] Booking codes: **never in error payloads** — R-2 mitigation + negative test (invariant #7).
- [ ] No schema change → no migration needed (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
