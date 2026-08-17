# Admin-Only Commission at Venue Creation (500 bps default) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** `POST /api/venues` no longer accepts a client-supplied `commissionBps` (a non-null
value is a `400`); the server stamps every new venue with the platform default of 500 bps held
as server-side configuration, and the create form discloses that default from a new
operator-authenticated read instead of carrying a commission input.

**Architecture:** The commission rate is removed from `NewVenueCommand` entirely, so **no
driving adapter can supply a rate by construction** — the application service
(`VenueAdminService.onboard`) stamps the configured default at insert, mirroring the
invariant-#13 posture of enforcing policy in the service where no adapter can bypass it. The
same `@ConfigurationProperties` record feeds the new `GET /api/venue-defaults` disclosure read,
so the stamped rate and the disclosed figure are one value by construction.

**Persistence:** JDBC only (invariant #1). No schema change — `venue.commission_bps` (V2)
stays NOT NULL with its 0–10000 CHECK; the insert simply binds the configured default instead
of client input. **No Flyway migration** (and therefore no `V43` claim).

**Source of intent:** issue #692 (slice C of #573; intake decisions recorded there 2026-08-17).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that
confirm-time accrual reads the **live** `venue.commission_bps`, so a creation-time stamp needs
no ledger/repricing consideration; settled 400-reject vs silent-ignore with the maintainer) ·
`riviera-plan-doc` (this template — forced the parity ledger over the retired commission input
and the no-migration statement) · `tdd` (each phase is red test → minimal code → green at the
named pin) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (N/A at plan time — due at merge close-out; `RESPONSIBILITIES.md`
§`venue` "commission at creation" wording is expected to need a line) ·
`riviera-modulith` (kept `OnboardVenue`/the new defaults read **internal** to `venue` —
no sibling module calls them, so no `api/` surface is added; properties registration follows
the module-config-in-`adapter/in` precedent) · `riviera-java-conventions` (records, compact-ctor
validation reusing `VenueFieldValidation.requireCommissionBps`, §6b: the reject is
`InvalidApiRequestException.parsing` → the existing `400 INVALID_REQUEST` contract) ·
`codebase-design` (the deep move: drop the field from the command instead of ignoring it at the
edge — the seam makes operator-chosen rates unrepresentable) · `riviera-stripe-payments`
(collect-only model unchanged; `venue` stores the rate, `payout` computes — nothing here touches
accrual arithmetic) · `riviera-frontend` (the defaults read belongs on the existing
`operator/venue-admin.service.ts`; no new folder) · `angular-developer` + angular-cli MCP
(v22 posture: signals, no `standalone:true`, Signal Forms stays; a11y checked in the card's
existing axe spec) · `riviera-tailwind` (info line styled with utilities beside the existing
form classes; no new SCSS) · `playwright-cli` (mocked-suite e2e update:
`operator-onboarding.e2e.ts` mocks the defaults read and asserts the disclosure line) ·
`postgres` — N/A: no migration, no schema or query-plan change (the insert binds the same column).

**Branch:** `claude/sdlc-573-83fke1` (cloud session's designated branch — stands in for
`feature/admin-only-commission-at-creation` per the `riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (server stamps the default):** Given a valid onboarding command (which can no
  longer carry a rate), when `OnboardVenue.onboard` runs, then the created venue persists at
  the configured platform default — 500 bps — and reads back at 500 via the owner profile read.
  *Pinned by:* `VenueAdminControllerIT.createStampsPlatformDefaultCommission` (adapter-level,
  full path) and `VenueAdminServiceTest.onboardStampsConfiguredDefaultCommission` (inner
  hexagon, proves the stamp comes from `VenueCreationProperties`, not a literal).
- [ ] **AC-2 (client-supplied rate rejected):** Given a `POST /api/venues` body carrying any
  non-null `commissionBps`, when the request is handled, then the response is
  `400 INVALID_REQUEST` (RFC-7807, §6b) and **no venue row or ownership row is created**.
  *Pinned by:* `VenueAdminControllerIT.createRejectsClientSuppliedCommission`.
- [ ] **AC-3 (no longer required):** Given a `POST /api/venues` body with no `commissionBps`
  key at all, when handled, then `201` and the venue exists at 500 bps (the field's old
  "required" contract is gone). *Pinned by:* the same
  `VenueAdminControllerIT.createStampsPlatformDefaultCommission` (its body omits the key).
- [ ] **AC-4 (default is configuration):** Given
  `riviera.venue.creation.default-commission-bps` overridden to a non-500 value, when a venue
  is onboarded, then it is stamped with the overridden value — no code edit.
  *Pinned by:* `VenueAdminServiceTest.onboardStampsConfiguredDefaultCommission`
  (constructs `VenueCreationProperties` with a non-500 value), plus
  `VenueCreationPropertiesTest.rejectsOutOfRangeDefault` for the 0–10000 boot guard.
- [ ] **AC-5 (the disclosure read):** Given an authenticated operator, when it issues
  `GET /api/venue-defaults`, then `200 {"commissionBps": <configured>}`; given an anonymous
  client, then `401`. The path sits outside `/api/venues/{venueId}`'s `long`-bound space.
  *Pinned by:* `VenueDefaultsControllerIT.servesConfiguredDefaultToOperators` /
  `.rejectsAnonymous`.
- [ ] **AC-6 (form: no input, served disclosure):** Given the create form with the defaults
  read mocked at 500, when it renders, then no commission control exists and the info line
  states "The platform commission is 5% per booking."; re-mocking at 550 renders "5.5%" with
  no frontend edit. *Pinned by:* `venue-create-card.spec.ts` (new cases) +
  `venue-create-card.a11y.spec.ts` (axe stays green).
- [ ] **AC-7 (A7 regression):** The admin commission write (`PUT
  /api/admin/venues/{venueId}/commission`) still changes the rate forward-only after creation.
  *Pinned by:* existing `AdminVenueCommissionIT` (unchanged, re-run in the venue-package
  regression sweep).
- [ ] **AC-8 (structural net):** `ModularityTests`, `PackageShapeArchitectureTests`,
  `JdbcOnlyArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` stay green.
  *Pinned by:* the structural-net run at each phase end.

## Non-goals

- No repricing of existing venues (Miramar stays at its seeded 1500) — this is creation-time only.
- The operator's commission *reads* stay as they are: `VenueProfileResponse` display, the
  takings strip's "after X% commission" line, payout-statement rows.
- The A7 admin surface (`AdminVenueCommissionController`, `venue_commission_rate`) is untouched.
- No DB column default for `commission_bps` — the stamp is application-side (the service is the
  single writer; a schema default would create a second, silent source of the number).
- No visibility fence (#693) and no PENDING-console change (#694) — later slices.
- The new read is **not** added to `venue`'s published `api/` surface — no sibling module needs it.

## Behavior-parity ledger (retirement / replacement slices only)

> The commission input on the create form is being retired; the rest of the form survives.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Commission input field, `required`, FE default `'1500'` | **dropped** | The decision of #573: an operator must not choose the rate. Replaced by a read-only disclosure line fed from the server. |
| FE parse failure of commission → local `INVALID_REQUEST` error | **dropped** | Nothing left to parse — the submit payload no longer carries the field. |
| `POST /api/venues` accepts + persists `commissionBps` (0–10000) | **changed** | Non-null now rejected `400 INVALID_REQUEST`; the server stamps the configured default instead. |
| `commissionBps` required server-side (`toCommand` throws when null) | **changed** | Absence is the *only* valid state now; the requirement inverted into a rejection of presence. |
| All other form fields (name/beach/region/description/mode/currency/cutoff), defaults, submit → navigate to beach-map, 401 session-lost handling | **preserved** | Untouched — same Signal Form, same `onCreateVenue` flow, same navigation; pinned by the existing card spec + e2e which keep passing. |
| Operator sees the commercial term before creating | **preserved** | Previously implied by the editable field; now an explicit info line rendered from the served default (AC-6). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The reject path 500s instead of 400s (raw `IllegalArgumentException` no longer maps to 400 since #118) | med | med | Throw inside `toCommand()`, which the controller already wraps in `InvalidApiRequestException.parsing` (§6b); pinned by AC-2 asserting the wire code | agent | open |
| R-2 | Dropping `commissionBps` from `NewVenueCommand` breaks its many test-fixture constructions | high | low | Compile-time sweep: `grep -rn "new NewVenueCommand" platform/src` and fix every call site in the same phase | agent | open |
| R-3 | The properties record isn't registered → the service bean fails at boot | low | med | `@EnableConfigurationProperties` on a `venue/adapter/in` config class per the `BookingSchedulingConfig` precedent; every venue IT would catch a context failure | agent | open |
| R-4 | The new path collides with `GET /api/venues/{venueId}` (`long`-bound) | low | med | Path chosen **outside** that space: `/api/venue-defaults` (issue constraint #13); pinned by AC-5 | agent | open |
| R-5 | FE specs/e2e still reference the commission input and go red | high | low | Same-phase update of `venue-create-card.spec.ts`, a11y spec, and `operator-onboarding.e2e.ts` (its create mock never filled the field — only the takings mock names `commissionBps`, which stays) | agent | open |
| R-6 | Disclosure line hardcodes "5%" and drifts from the stamp | med | med | The line renders `formatCommissionPercent(served.commissionBps)` — no literal percent anywhere in FE; AC-6's 550→"5.5%" case proves value-drivenness | agent | open |
| R-7 | Out-of-range configured default (e.g. 20000) boots and stamps invalid rows | low | high | Compact-ctor validation in `VenueCreationProperties` reusing `VenueFieldValidation.requireCommissionBps` → boot failure; `VenueCreationPropertiesTest` | agent | open |
| R-8 | A7 forward-only write regresses via the `Venues.insertVenue` signature change | low | high | Signature change is additive (an `int` parameter); `AdminVenueCommissionIT` + `JdbcVenueCommissionScheduleIT` re-run in the phase sweep (AC-7) | agent | open |

## Open questions / Assumptions

- **Assumption:** the disclosure read's path is `GET /api/venue-defaults` (operator-role-gated,
  outside the `{venueId}` space; naming decided at plan time per issue #13's "shape decided at
  plan time"). — *Owner:* agent · *Resolves by:* phase 2 (silently confirmed unless review objects).
- **Assumption:** when the defaults read fails client-side, the info line is simply not rendered
  (the disclosure is the issue's nice-to-have; the form itself must not block on it, and no
  hardcoded fallback figure is allowed — a wrong figure is worse than none). — *Owner:* agent ·
  *Resolves by:* phase 3.
- **Assumption:** the role gate `hasRole(OPERATOR)` is the right auth posture for the defaults
  read — issue AC requires "no ACTIVE-only assumption baked in", and role-gating (not
  ownership/status resolution) satisfies that: slice A's PENDING principals will carry the same
  role. — *Owner:* agent · *Resolves by:* phase 2.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No write path to `availability(set_id, booking_date)` is
touched; the slice changes venue-creation input handling and a config read. The onboarding
transaction (insert + creator-owns-on-create ownership write) keeps its existing shape.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue` | `RESPONSIBILITIES.md` §`venue`: owns "the commission rate over time" — storing (now stamping) the rate is its job; the A7 asymmetry ("a venue does not set its own commission") is exactly what this slice completes at creation time |

**Cross-module named interfaces (`api/` ports)** — none added or changed. `OnboardVenue` and
the new `VenueDefaults` read port stay **internal** to `venue/application` (sole caller: the
module's own REST adapters), per the `api`-only-when-a-sibling-calls rule.

**Domain events** — none published, none changed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Stamp the platform default rate on a new venue | `venue` (application service) | `venue` Job: stores the commission rate (creation writes `venue.commission_bps`); **not** `payout` (its job is the arithmetic — `venue` Not-My-Job list: "payout math or commission arithmetic → `payout`" — no arithmetic here); **not** the edge (a policy every driving adapter must be unable to bypass belongs in the service, the invariant-#13 pattern) |
| Hold the 500 bps default as validated configuration | `venue` (`VenueCreationProperties`, registered in `adapter/in` config per module precedent) | Creation-time venue data; nothing else reads it |
| Serve the default to the operator console | `venue` (`adapter/in/VenueDefaultsController`) | Disclosing a venue-creation term is a venue-surface read; role-gated at the edge (`SecurityConfig`), no ownership check (no venue exists yet — same posture as `POST /api/venues` itself) |
| Reject a client-supplied rate | `venue` (`adapter/in/CreateVenueRequest.toCommand`) | Edge input validation (§6b) — the field exists in the DTO solely to refuse it loudly |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch — unchanged.
- **Money:** the rate stays exact-integer basis points (invariant #5); 500 bps is an `int` in
  config, never a float or a percent string on the wire.
- **Payout-ledger effect:** none changed. Confirm-time accrual reads the **live**
  `venue.commission_bps` (`BookingConfirmedPayoutListener` → `commissionBps(venueId)`); a venue
  created under this slice accrues at 500 until the admin's A7 write moves it, forward-only from
  tomorrow — exactly the pre-existing mechanism (invariant #9 untouched, no repricing).
- **Confirmation trigger / idempotency / refund policy:** untouched by this slice.
- **Pinning tests:** existing `AdminVenueCommissionIT` (A7 regression, AC-7); the payout
  arithmetic tests are out of scope and unchanged.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/venue-create-card.ts` + `.html` | existing | standalone component | signals; new `platformDefaults` signal fed once from the service read | Signal Forms (commission field removed from model + schema) |
| FE-2 | `operator/venue-admin.service.ts` | existing | `@Service` HTTP service | returns `Observable<VenueDefaults>` for `GET /api/venue-defaults` | — |
| FE-3 | `operator/venue-admin.model.ts` | existing | types | `CreateVenueRequest` drops `commissionBps`; new `VenueDefaults` type | — |

**Standards:** v22 posture per the angular-cli MCP best practices (no `standalone: true`, no
explicit `OnPush`, signals, `inject()`); the info line reuses
`shared/commission-rate.ts#formatCommissionPercent` (1500→"15%", 550→"5.5%") so no percent
literal exists in FE code; styling is Tailwind utilities beside the existing form classes
(no new SCSS — `riviera-tailwind`).

## FE↔BE contract

- **Changed:** `POST /api/venues` — `commissionBps` is no longer a valid body key: non-null →
  `400` `INVALID_REQUEST` (RFC-7807 `code`, §6b); the FE payload type drops the field.
- **New:** `GET /api/venue-defaults` (OPERATOR role) → `200 {"commissionBps": 500}` — integer
  basis points on the wire (invariant #5), typed as `VenueDefaults { commissionBps: number }`
  in `venue-admin.model.ts`; hand-written typed service, no `any`.

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation. Update it in the SAME commit
> window as the change it records, at every phase boundary and SDLC stage transition.

**Stage pointer:** plan committed — next: implement (phase 1)

**Next action:** phase 1 red test (`VenueAdminControllerIT.createRejectsClientSuppliedCommission` +
`createStampsPlatformDefaultCommission`), then open the draft PR with the first phase commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc on branch | ⏳ | |
| 1 — backend: stamp default + reject client rate | | |
| 2 — backend: `GET /api/venue-defaults` | | |
| 3 — frontend: input removed, disclosure line, e2e | | |
| 4 — merge `origin/main`, ready-for-review, gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/admin-only-commission-at-creation.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueCreationProperties.java` — new `@ConfigurationProperties("riviera.venue.creation")` record, compact-ctor 0–10000 guard
- `platform/src/main/java/ai/riviera/platform/venue/application/NewVenueCommand.java` — drop `commissionBps` component
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `insertVenue(NewVenueCommand, int commissionBps)`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — stamp the configured default in `onboard`
- `platform/src/main/java/ai/riviera/platform/venue/application/OnboardVenue.java` — Javadoc: rate is stamped, not supplied
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueDefaults.java` — new internal read port (record-returning)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/CreateVenueRequest.java` — invert the null check into a non-null rejection
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueCreationConfig.java` — new `@EnableConfigurationProperties` registration
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueDefaultsController.java` — new `GET /api/venue-defaults`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — bind the stamped rate in the insert
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — role rule for `/api/venue-defaults`
- `platform/src/main/resources/application.properties` — `riviera.venue.creation.default-commission-bps=500`
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-1/2/3 pins
- `platform/src/test/java/ai/riviera/platform/venue/VenueDefaultsControllerIT.java` — new, AC-5 pins
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-1/AC-4 inner-hexagon pins
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueCreationPropertiesTest.java` — new, R-7 boot guard
- `platform/src/test/java/**/*.java` — every fixture constructing `NewVenueCommand` or stubbing `Venues.insertVenue` (R-2 compile sweep; enumerated at phase 1 by `grep -rn "new NewVenueCommand\|insertVenue" platform/src/test`)
- `frontend/src/app/operator/venue-admin.model.ts` — drop `commissionBps` from `CreateVenueRequest`; add `VenueDefaults`
- `frontend/src/app/operator/venue-admin.service.ts` — `venueDefaults()` read
- `frontend/src/app/operator/venue-admin.service.spec.ts` — cover the new read
- `frontend/src/app/operator/venue-create-card.ts` — remove commission form state; `platformDefaults` signal
- `frontend/src/app/operator/venue-create-card.html` — remove the input; add the disclosure line
- `frontend/src/app/operator/venue-create-card.spec.ts` — AC-6 pins
- `frontend/src/app/operator/venue-create-card.a11y.spec.ts` — axe over the new render
- `frontend/e2e/operator-onboarding.e2e.ts` — mock `GET /api/venue-defaults`, assert the line, drop nothing else

---

## Phase 0 — Plan doc on branch

**Files:** Create `docs/plans/admin-only-commission-at-creation.md`

- [ ] **Step 1: Commit the plan** — `git commit -m "Plan admin-only commission at venue creation (#692)"`

---

## Phase 1 — Backend: stamp the default, reject the client rate

**Files:** Modify `NewVenueCommand.java`, `Venues.java`, `VenueAdminService.java`,
`OnboardVenue.java`, `CreateVenueRequest.java`, `JdbcVenues.java`, `application.properties` ·
Create `VenueCreationProperties.java`, `VenueCreationConfig.java`,
`VenueCreationPropertiesTest.java` · Test `VenueAdminControllerIT.java`,
`VenueAdminServiceTest.java` + the R-2 fixture sweep

- [ ] **Step 1: Write the failing tests** — in `VenueAdminControllerIT`:

```java
@Test
void createStampsPlatformDefaultCommission() {
    // body omits commissionBps entirely (AC-3); profile read proves 500 (AC-1)
    long id = createVenueAs(operatorSession, """
            {"name":"Kepi Bar","beach":"Dhermi","region":"Riviera","bookingMode":"INSTANT"}
            """);
    assertEquals(500, profileCommissionBps(operatorSession, id));
}

@Test
void createRejectsClientSuppliedCommission() {
    var response = postVenueAs(operatorSession, """
            {"name":"Kepi Bar","beach":"Dhermi","region":"Riviera","bookingMode":"INSTANT",
             "commissionBps":0}
            """);
    assertEquals(400, response.statusCode());
    assertEquals("INVALID_REQUEST", problemCode(response));
    assertEquals(0, countVenuesNamed("Kepi Bar"));
}
```

and in `VenueAdminServiceTest`:

```java
@Test
void onboardStampsConfiguredDefaultCommission() {
    var service = serviceWith(new VenueCreationProperties(700));
    service.onboard(OPERATOR, validCommandWithoutRate());
    assertEquals(700, fakeVenues.lastInsertCommissionBps());
}
```

(exact helper shapes follow the classes' existing fixtures)

- [ ] **Step 2: Run, verify red** — `./gradlew test --tests "*VenueAdminControllerIT*" --tests "*VenueAdminServiceTest*"` → FAIL (compile: no such ctor / required-field 400)
- [ ] **Step 3: Minimal implementation** — drop the component from `NewVenueCommand`; add
  `VenueCreationProperties(int defaultCommissionBps)` with
  `VenueFieldValidation.requireCommissionBps` in the compact ctor; register via
  `VenueCreationConfig`; `Venues.insertVenue(command, int)`; service stamps
  `properties.defaultCommissionBps()`; `CreateVenueRequest.toCommand()` throws
  `IllegalArgumentException("commissionBps is not accepted...")` on non-null (wrapped by the
  controller's existing `InvalidApiRequestException.parsing`); property line
  `riviera.venue.creation.default-commission-bps=500`; sweep every `new NewVenueCommand`/
  `insertVenue` fixture (R-2).
- [ ] **Step 4: Run, verify green** — same scoped command → PASS; then the venue-package sweep
  `./gradlew test --tests "ai.riviera.platform.venue.*"` (covers AC-7's `AdminVenueCommissionIT`)
- [ ] **Step 5: Generalization-audit pass** — population: *every construction site of
  `NewVenueCommand` and every caller/stub of `Venues.insertVenue`* → enumerate
  `grep -rn "new NewVenueCommand\|insertVenue" platform/src` → fix all (compile-enforced).
  Log below.
- [ ] **Step 6: Commit** — `git commit -m "Stamp the platform default commission at venue creation; reject client-supplied rates (#692)"`
- [ ] **Step 7: Push, open the DRAFT PR** (first phase commit → CI vehicle), update this
  Execution status in the same window.

---

## Phase 2 — Backend: `GET /api/venue-defaults`

**Files:** Create `VenueDefaults.java` (internal port), `VenueDefaultsController.java`,
`VenueDefaultsControllerIT.java` · Modify `VenueAdminService.java` (implement the port),
`SecurityConfig.java`

- [ ] **Step 1: Write the failing test** — `VenueDefaultsControllerIT`:

```java
@Test
void servesConfiguredDefaultToOperators() {
    var response = getAs(operatorSession, "/api/venue-defaults");
    assertEquals(200, response.statusCode());
    assertEquals(500, jsonInt(response, "commissionBps"));
}

@Test
void rejectsAnonymous() {
    assertEquals(401, getAnonymously("/api/venue-defaults").statusCode());
}
```

- [ ] **Step 2: Run, verify red** — `./gradlew test --tests "*VenueDefaultsControllerIT*"` → FAIL (404/compile)
- [ ] **Step 3: Minimal implementation** — internal `VenueDefaults` port returning the
  configured bps (implemented by `VenueAdminService` from the same properties record —
  single source by construction); package-private controller; `SecurityConfig` rule
  `.requestMatchers(HttpMethod.GET, "/api/venue-defaults").hasRole(OPERATOR)` placed with the
  operator-gated venue rules.
- [ ] **Step 4: Run, verify green** — scoped, then the structural net
  `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` (AC-8)
- [ ] **Step 5: Generalization audit** — N/A (no bug fix; new read follows an existing pattern)
- [ ] **Step 6: Commit** — `git commit -m "Serve the platform commission default to the operator console (#692)"`
- [ ] **Step 7: Push; check the PR's CI run before phase 3.** Update Execution status.

---

## Phase 3 — Frontend: remove the input, render the served disclosure, e2e

**Files:** Modify `venue-admin.model.ts`, `venue-admin.service.ts` (+`.spec.ts`),
`venue-create-card.ts`, `.html`, `.spec.ts`, `.a11y.spec.ts`, `frontend/e2e/operator-onboarding.e2e.ts`

- [ ] **Step 1: Write the failing specs** — card spec: renders no
  `venue-create-commission` control; renders `venue-create-commission-note` with "The platform
  commission is 5% per booking." when the mocked read returns `{commissionBps: 500}`, "5.5%"
  when 550, and no note when the read errors; submit payload carries no `commissionBps` key.
  Service spec: `venueDefaults()` GETs `/api/venue-defaults`.
- [ ] **Step 2: Run, verify red** — `npm test -- --include='**/venue-create-card.spec.ts' --include='**/venue-admin.service.spec.ts'` (exact runner flags per the repo's Vitest setup) → FAIL
- [ ] **Step 3: Minimal implementation** — model/service/read; card: drop the field from the
  Signal Form model + schema + submit; `platformDefaults` signal loaded in the constructor
  (errors → `undefined` → note hidden); template: replace the commission `<label>` block with
  an info line `@if (platformDefaults(); as d) { <p data-testid="venue-create-commission-note">The platform commission is {{ formatCommissionPercent(d.commissionBps) }} per booking.</p> }`
  styled with the card's existing muted-text utilities.
- [ ] **Step 4: Run, verify green** — the two specs + `npm run test:a11y`; then
  `npm run lint && npm run format:check`
- [ ] **Step 5: e2e** — update `operator-onboarding.e2e.ts`: mock
  `GET /api/venue-defaults` → `{commissionBps: 500}`, assert the note text on the zero-state
  form (axe already runs there); run `npm run test:e2e:a11y` (or the repo-documented scoped
  variant per `riviera-local-debug`).
- [ ] **Step 6: Commit** — `git commit -m "Replace the create form's commission input with the server-served platform default (#692)"`
- [ ] **Step 7: Push; check CI. Update Execution status.**

---

## Phase 4 — Integration: merge main, finalize, ready-for-review

- [ ] **Step 1:** `git fetch origin main && git merge origin/main` (routing gate for whatever
  the integration touches; scoped tests on conflicts)
- [ ] **Step 2:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged) + the diff-scoped guards
- [ ] **Step 3:** Finalize Execution status (phases ✅, risks closed, Open Questions resolved),
  commit, push, mark the PR **ready for review** → run the Review gate + Sonar gate per
  `references/pr-gates.md`
- [ ] **Step 4:** Merge close-out (epic tick on #573/#692, `riviera-docs-freshness` over the
  merged range — §`venue` commission wording, `s6`/`RESPONSIBILITIES` "commission at creation"
  claims)

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-3:** `./gradlew test --tests "*VenueAdminControllerIT*"` → green. Verified at commit `<sha>`.
- [ ] **AC-2:** same run, `createRejectsClientSuppliedCommission` green. Verified at `<sha>`.
- [ ] **AC-4:** `./gradlew test --tests "*VenueAdminServiceTest*" --tests "*VenueCreationPropertiesTest*"` → green. Verified at `<sha>`.
- [ ] **AC-5:** `./gradlew test --tests "*VenueDefaultsControllerIT*"` → green. Verified at `<sha>`.
- [ ] **AC-6:** `npm test` (card + service specs) + `npm run test:a11y` → green. Verified at `<sha>`.
- [ ] **AC-7:** `./gradlew test --tests "ai.riviera.platform.venue.*"` → green incl. `AdminVenueCommissionIT`. Verified at `<sha>`.
- [ ] **AC-8:** structural-net run → green. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified N/A (invariant #2 untouched).
- [ ] Pool + cutoff rules honored (invariants #3, #4 — untouched).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new published surface (invariant #11).
- [ ] **Payment/payout** section filled; money in integer minor units/bps (invariants #5, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone rules untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no Flyway migration needed (invariant #12 vacuously satisfied).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `references/pr-gates.md` §1 plus `riviera-review-overlay`.
