# Typed Edge Validation (issue #118) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A server-side bug that throws `IllegalArgumentException` (or a non-race
`DataIntegrityViolationException`) on the request thread surfaces as a logged `500`,
while every deliberate edge-validation rejection keeps its exact current wire behavior
(`400 INVALID_REQUEST` / `409 CONFLICT`).

**Architecture:** Introduce `shared.InvalidApiRequestException` — the one typed signal
"request input failed edge validation" — and narrow `ApiErrorHandler` to map **only it**
to `400 INVALID_REQUEST`; narrow the `DataIntegrityViolationException` → `409` handler to
`DuplicateKeyException` (Spring's translation of a unique-index race — the V2/V12 case the
409 was designed for). Raw `IllegalArgumentException` and non-duplicate DIVEs then propagate
to the framework's default `500` **with a stack trace in the log** — a bug looks like a bug.
The **fix-shape decision** the issue's 2026-08-01 re-check demanded (option (a)
`InvalidApiRequestException` vs option (b) #345-style typed `ApiProblem` outcomes) is
settled as **(a), applied at the conversion boundary**: option (b) would re-litigate the
settled #97 "centralized-explicit validation" decision across 29 controllers for zero wire
improvement (generic malformed input *should* read `INVALID_REQUEST`); #345-style typed
outcomes remain the tool **when a distinct code is warranted**, which none of these sites
needs. Mechanically: root-package edge classes throw the typed exception directly; module
controllers wrap their input-conversion expression (`toCommand()`, `PeriodKey.of`,
`BatchStatus.valueOf`, slot parsing) in `InvalidApiRequestException.parsing(...)`, so
vocabulary/command guards (`GuestContact`, `SetCommand`, `VenueFieldValidation`) keep
producing 400 **when fired by request input** and 500 when fired by corrupt stored state
(`CreateBookingService.collect` building `Money` from stored venue pricing —
the re-check's live replacement example).

**Persistence:** JDBC only (invariant #1). No tables/migrations touched.

**Source of intent:** GitHub issue #118 (deferred review finding from #97 / PR #117),
including its 2026-07-27 (#345 scope note) and 2026-08-01 (relevance re-check) comments.
Review record of the original mapping: `docs/plans/error-contract-problemdetail.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — verified the
re-check comment's claims against `a4bd085`: headline example dead, two live money-spine
replacements, silent IAE branch) · `riviera-plan-doc` (this template — forced the fix-shape
decision to be recorded, surfaced the rider inventory as ACs) · `tdd` (handler behavior
changes written test-first in `ApiErrorHandlerTest`; edge riders pinned by the existing 16
IT/test files asserting `INVALID_REQUEST`) · `riviera-review-overlay` (review gate — runs at
PR ready) · `riviera-docs-freshness` (ran over this slice's diff — §6b text,
`error-contract.md`, `ApiErrorHandler` javadoc, CLAUDE.md `shared` inventory all updated
in-slice) · `riviera-java-conventions` (§6b is the contract under change; typed-outcome
preference shaped the (a)-vs-(b) decision; §6c kept new comments one-line) ·
`riviera-modulith` (placed the new exception in the `shared` OPEN kernel — admission on
ownership: the exception *is* the edge contract's vocabulary, owned by no bounded context,
thrown by module adapters, mapped at the composition root which nothing may depend on —
same ground as `ApiProblem`) · `riviera-stripe-payments` (payout admin controller touched —
confirmed the wrap changes no payout/commission semantics, collect-only model untouched) ·
`riviera-local-debug` (scoped-test discipline for the cloud session; system gradle + JDK-25
toolchain recipe).

**Branch:** `claude/sdlc-118-relevance-check-s3sa34` — the session's designated remote
branch, standing in for `bugfix/typed-edge-validation` per the riviera-sdlc cloud addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a controller throws `InvalidApiRequestException`, when the advice maps
  it, then the wire is `400` `application/problem+json` with `code=INVALID_REQUEST`, the
  generic detail, and no exception-message echo. *Pinned by:*
  `ApiErrorHandlerTest.invalidApiRequestIs400WithoutEchoingTheMessage`
- [ ] **AC-2:** Given a controller throws a raw `IllegalArgumentException` (a deep bug —
  e.g. a `Money`/`PayoutLedgerEntry` invariant on stored data), when the request completes,
  then the exception **propagates** (surfaces as `500`, logged with stack trace by the
  framework) and is **not** mapped to `400`. *Pinned by:*
  `ApiErrorHandlerTest.aDeepBugIllegalArgumentIsNotMaskedAsA400`
- [ ] **AC-3:** Given a `DuplicateKeyException` (unique-constraint race), when the advice
  maps it, then the wire is `409 CONFLICT` and the class names are WARN-logged; given a
  non-duplicate `DataIntegrityViolationException` (FK/NOT-NULL — a schema bug), then it
  **propagates** as a `500`. *Pinned by:* `ApiErrorHandlerTest.duplicateKeyRaceIs409Conflict`
  + `ApiErrorHandlerTest.aNonRaceDataIntegrityViolationIsNotMaskedAsA409`
- [ ] **AC-4:** Given any of the existing deliberate edge-validation rejections — weak
  password (`CustomerPasswords.validate`), bad SSO state/provider, bad mock `redirect_uri`,
  malformed booking/venue/payout-admin/photo-slot input — when the request is made, then the
  wire behavior is **byte-identical to today** (`400 INVALID_REQUEST`). *Pinned by:* the
  existing suites, unmodified: `SetPasswordIT`, `CustomerRegisterIT`, `OperatorRegistrationIT`,
  `OperatorAccountControllerTest`, `AccountRecoveryControllerTest`, `SsoCallbackIT`,
  `BookingControllerIT`, `VenueAdminControllerIT`, `VenueRepriceIT`,
  `AdminPayoutBatchControllerTest` (36 `INVALID_REQUEST` assertions across 16 files — the
  regression net; **no assertion in them is edited**).
- [ ] **AC-5:** Structure holds: `ModularityTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`, `ErrorContractArchitectureTests` all pass
  with the new `shared` class.

## Non-goals

- **No catch-all `Exception` → 500 ProblemDetail handler.** Unexpected exceptions (NPE and
  friends) already fall through to the framework default today; IAE/DIVE simply join that
  class. Making 500s carry the RFC-7807 shape is a separate decision, not smuggled in here.
- **No per-site bespoke codes** (#345-style `MISSING_X`) for existing generic rejections —
  wire behavior of legitimate 400s is deliberately unchanged.
- **No null-check hardening of `UpdateBatchStatusRequest.status`** (today `null` → NPE →
  500; pre-existing, unrelated to the masking defect).
- **No change to `ExternalIdentity`/`SsoAuthorizationChallenge` guards** — the mock gateway
  returns canned identities, so these cannot fire from client input; they stay internal
  IAE guards (bug → 500), which is the correct S5 posture for a garbage real-IdP response.
- **No log line on the 400 branch** — a client validation miss is not an operational event;
  the silent-bug problem is solved structurally (bugs now propagate and get the framework's
  ERROR + stack).

## Behavior-parity ledger (retirement / replacement slices only)

The global funnel is being replaced by a narrowed one; the ledger below enumerates every
behavior of the OLD mapping.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Deliberate edge-validation IAE → `400 INVALID_REQUEST`, generic detail | preserved | sites throw/wrap into `InvalidApiRequestException`; same advice body (AC-4) |
| Deep-bug IAE (e.g. `Money` on stored price) → `400` blamed on caller, unlogged | **changed (the point)** | propagates → `500` + framework ERROR w/ stack (AC-2) |
| `NumberFormatException` (extends IAE) anywhere → `400` | **changed** | propagates → `500`; no edge site parses numbers via NFE (wire numbers bind via Jackson → `HttpMessageNotReadable` path, untouched) |
| Unique-race DIVE (layout replace, booking-code collision) → `409 CONFLICT` + WARN | preserved | handler narrowed to `DuplicateKeyException` (the Spring translation of SQLSTATE 23505) — same body, same WARN (AC-3) |
| FK/NOT-NULL DIVE (schema bug) → `409` presented as normal conflict | **changed (the point)** | propagates → `500` (AC-3) |
| DTO compact-constructor throws (`LoginRequest` etc.) → `400` via Jackson `HttpMessageNotReadableException` | preserved | that path never touched the IAE handler; unmodified |
| Framework-raised 400s (type mismatch, unreadable body) → `INVALID_REQUEST` code | preserved | `handleExceptionInternal`/`defaultCode` unmodified |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A deliberate edge-validation site is missed → its legitimate 400 becomes a 500 (the mirror-image bug the re-check warned about) | med | high | exhaustive throw-site inventory (this plan §File structure); the 36 existing `INVALID_REQUEST` assertions run **unmodified** as the regression net; scoped IT runs per phase | this slice | open |
| R-2 | A production path relied on non-duplicate DIVE → 409 | low | med | only `ApiErrorHandlerTest` asserts the wire `CONFLICT`; all module-level DIVE tests are JDBC-level (advice not involved); designed 409s (layout race, code collision) are unique-index → `DuplicateKeyException` | this slice | open |
| R-3 | `shared` kernel growth violates its admission rule | low | med | admission argued on ownership (edge contract vocabulary, mapped at the root); no logic, no state, no module deps; `ModularityTests` + `PackageShapeArchitectureTests` pin it | this slice | open |
| R-4 | Error-contract docs (§6b, `error-contract.md`, javadoc) go stale | high | med | doc updates are Phase 3 of this slice, not a follow-up | this slice | open |
| R-5 | Flyway collision | — | — | no migration in scope | — | closed — N/A |

## Open questions / Assumptions

- **Assumption:** Jackson creator exceptions (compact-constructor throws) surface as
  `HttpMessageNotReadableException` → 400 via the base class, so those DTO sites need no
  change — *verified by AC-4's unmodified suites staying green.* — *Owner:* this slice ·
  *Resolves by:* Phase 2 test run

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No write path to `availability(set_id, booking_date)`
is touched; `booking` changes are confined to the controller's input-conversion wrap. The
`INSERT … ON CONFLICT DO NOTHING` claim never surfaces a DIVE (that is its point), so the
narrowed 409 handler does not interact with the claim path.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `shared` (non-context kernel) | existing | — | new `InvalidApiRequestException`: the edge contract's vocabulary, thrown by module adapters, mapped at the composition root — ownership ground, like `ApiProblem` |
| M-2 | root (composition root, not a module) | existing | — | `ApiErrorHandler` narrowing; edge classes (`CustomerPasswords`, `SsoController`, `SsoProviders`, `MockSsoIdpController`) throw typed |
| M-3 | `booking` | existing | `Booking` | `BookingController` wraps `toCommand` (adapter/in only) |
| M-4 | `venue` | existing | `Venue`, `BeachMap` | `VenueAdminController` + `VenuePhotoController` wrap conversions (adapter/in only) |
| M-5 | `payout` | existing | `PayoutBatch` | `AdminPayoutBatchController` wraps `PeriodKey.of`/`BatchStatus.valueOf` (adapter/in only) |

**Cross-module named interfaces (`api/` ports):** none added/changed. Modules already
depend on `shared` (OPEN kernel — no named-interface grant needed).

**Domain events:** none added/changed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The typed edge-validation signal + its wrap helper | `shared` | kernel admission on ownership: no bounded context owns the exception→status contract; the advice consuming it sits at the root, which nothing may depend on; consumed by ≥4 modules' adapters. Not `customer` (owns identity vocabulary, not wire contracts); not any single module (all merely throw it) |
| Which exceptions map to which status | root (`ApiErrorHandler`) | unchanged owner — the single `@RestControllerAdvice` (§6b, `ErrorContractArchitectureTests`) |
| Each edge's decision "this input is invalid" | the throwing adapter/edge class | unchanged owner — validation stays where it lives today (#97 decision); only the exception type/wrap changes |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. `riviera-stripe-payments` loaded because `payout`'s admin controller
is in the diff: the wrap changes request **parsing** only; batch/ledger semantics,
collect-only model, and commission arithmetic are untouched. (The slice's *benefit* to the
money path: a corrupt stored price now surfaces as a 500 instead of a tourist-blamed 400 —
`CreateBookingService.collect`, `RespondToRequestService.collect`.)

## Angular — frontend surfaces touched

N/A — backend-only. The wire contract for legitimate client errors is unchanged; server
bugs move 400/409 → 500, which the FE already treats as a generic failure.

## FE↔BE contract

N/A — no contract change (no endpoint, DTO, or success shape changes; error codes for
valid client mistakes unchanged).

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** rewrite `ApiErrorHandlerTest` pins (AC-1/2/3) red, then add the shared
exception and narrow the handlers.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc committed | ⏳ | |
| 1 — `InvalidApiRequestException` + narrowed `ApiErrorHandler` (TDD) | | |
| 2 — edge riders + conversion wraps (root, booking, venue, payout) | | |
| 3 — docs (§6b, error-contract.md, javadocs, CLAUDE.md kernel inventory) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

**Create**
- `platform/src/main/java/ai/riviera/platform/shared/InvalidApiRequestException.java` —
  the typed signal + `parsing(Supplier)` wrap (IAE → typed, cause preserved).

**Modify — handler + its test**
- `platform/src/main/java/ai/riviera/platform/ApiErrorHandler.java` — swap
  `@ExceptionHandler(IllegalArgumentException.class)` → `InvalidApiRequestException`;
  swap `DataIntegrityViolationException` → `DuplicateKeyException` (keep WARN); javadoc.
- `platform/src/test/java/ai/riviera/platform/ApiErrorHandlerTest.java` — AC-1/2/3 pins.

**Modify — deliberate riders, root package (throw typed directly)**
- `CustomerPasswords.java:38` — the shared password-policy rider (covers `AuthController`
  ×2, `MyAccountController`, `OperatorAccountController`, `AccountRecoveryController`).
- `SsoController.java:127,137` — no-SSO-in-progress / invalid state.
- `SsoProviders.java:25` — unknown provider slug (covers both SSO controllers + mock IdP).
- `MockSsoIdpController.java:75` — invalid `redirect_uri`.

**Modify — conversion wraps, module adapters (adapter/in only)**
- `booking/adapter/in/BookingController.java:117` — wrap `request.toCommand(accountId)`.
- `venue/adapter/in/VenueAdminController.java:84,110,123,136,153` — wrap each
  `toCommand()` / `requiredExpectedVersion()` conversion expression.
- `venue/adapter/in/VenuePhotoController.java:115` — wrap `parseSlot` (`PhotoSlot.valueOf`).
- `payout/adapter/in/AdminPayoutBatchController.java:46,51,56` — wrap `PeriodKey.of` ×2 +
  `BatchStatus.valueOf`.

**Modify — docs (Phase 3)**
- `.claude/skills/riviera-java-conventions/SKILL.md` §6b + `references/error-contract.md` —
  the narrowed mapping.
- `CLAUDE.md` — `shared` kernel inventory sentence (+ this exception, #118).
- Javadocs whose prose states the old mapping: `ApiErrorHandler` (in scope above),
  `CreateBookingRequest`, `CustomerPasswords`, `SsoController#consumeValidatedChallenge`.

**Deliberately untouched:** every DTO compact-constructor throw (Jackson path), all
boot-time `@ConfigurationProperties` IAEs, all domain/vocabulary guards (`Money`,
`PayoutLedgerEntry`, `PeriodKey`, `GuestContact`, `ContentHash`, `SetCommand`,
`VenueFieldValidation` — they keep throwing IAE; edge wraps translate them only when fired
by request input), the 16 test files asserting `INVALID_REQUEST`.

---

## Phase 1 — handler + typed exception (TDD)

- [ ] Red: rewrite `ApiErrorHandlerTest` pins (AC-1/2/3) → fail.
- [ ] Green: add `shared.InvalidApiRequestException`; narrow the two handlers.
- [ ] Scoped run: `ApiErrorHandlerTest`, `ErrorContractArchitectureTests`,
  `ModularityTests`, `PackageShapeArchitectureTests`.

## Phase 2 — edge riders + wraps

- [ ] Convert the four root-package rider sites; wrap the four module controllers'
  conversion expressions.
- [ ] Scoped run: the AC-4 net (unit/MockMvc tests first; Docker ITs if the daemon is up).

## Phase 3 — docs

- [ ] §6b + error-contract.md + CLAUDE.md kernel inventory + listed javadocs.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | Phase 2 (plan-time, pre-verified) | every `throw new IllegalArgumentException` in `src/main` + every edge parse call (`toCommand`, `PeriodKey.of`, `valueOf`, `Emails.normalize`, `CustomerPasswords.validate`) | `grep -rn "throw new IllegalArgumentException" src/main` + call-site greps | 90+ sites classified: 4 root riders, 4 wrap controllers, rest deliberately untouched (Jackson-path DTOs, boot-time properties, domain guards) | riders → typed; conversions → wrapped; guards untouched |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..3:** `gradle test --tests "*ApiErrorHandlerTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-4:** scoped run of the 9 named suites → PASS with 0 assertions edited. Verified at `<sha>`.
- [ ] **AC-5:** scoped run of the structural suites → PASS. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event changes (invariant #11).
- [ ] **Payment/payout** section justified N/A; parsing-only change in `payout` adapter (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes: no code logged or echoed by the new paths; generic detail preserved (invariant #7).
- [ ] No schema change → no Flyway (invariant #12).
- [ ] **Frontend** N/A.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register closed; Open Questions resolved.
- [ ] **Close-out written in THIS PR** — cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `references/pr-gates.md` §1 plus `riviera-review-overlay`.
