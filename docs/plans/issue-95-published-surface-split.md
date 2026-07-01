# Issue #95 — Published-surface split (api = ports, vocabulary, events) + placement rule

> **For agentic workers:** implement with `implement` + `tdd`, routed via `riviera-sdlc`.
> Backend-structure slice (B2+C1 of the improvement plan, epic #93). Invariant numbers
> refer to `CLAUDE.md`.

**Goal:** Every module's published surface is split into distinct `@NamedInterface`s by
kind — `api` (ports only), `vocabulary` (typed ids + value/outcome types), `events`
(published domain events) — every `allowedDependencies` grant is narrowed to the least
privilege the consumer's bytecode actually needs, and an ArchUnit placement rule (C1)
turns the "api is becoming a domain package" drift into a build failure. **No behavior
change.**

**Architecture:** The one significant decision: the new named interfaces are **top-level
packages** (`<module>/vocabulary`, `<module>/events`), siblings of `api`/`spi` — not
`api.types`/`api.events`. Precedent: the spi split (issue #44 follow-up,
`docs/plans/spi-named-interface-convention.md`) already established that published
surfaces are top-level siblings, and ADR-0007's shape rule treats `@NamedInterface`
packages as direct children of the module. Grant strings then read exactly as issue #95's
AC writes them: `booking::events`, `venue::vocabulary`. The cost — widening the
package-shape rule's allowed top-level set — is deliberate and covered by AC-3.

**Persistence:** JDBC only (invariant #1). No table/behavior change. One migration,
`V18__event_publication_event_type_moves.sql`: the Event Publication Registry persists
event **class FQCNs** (`event_publication.event_type`, plus `event_publication_archive`
under `completion-mode=archive`), and `republish-outstanding-events-on-restart=true`
deserializes outstanding rows by that name — so the four moved event classes get their
stored FQCNs rewritten (`booking.api.*` → `booking.events.*`, `payment.api.*` →
`payment.events.*`).

**Source of intent:** issue #95 (parent epic #93, improvement-plan items B2+C1 —
`docs/architecture/improvement-plan.md`).

**Skills consulted:** `riviera-modulith` (named-interface mechanics, api-vs-spi precedent,
grant strings, `verify()` as the contract), `riviera-java-conventions` (package moves,
records/sealed types, javadoc style), `codebase-design` (ports = the module's interface;
vocabulary/events are published *types*, not seams — the split narrows what each consumer
must learn), `grilling` (issue-intake gate — surfaced R-1/R-4/R-5 below), `riviera-plan-doc`
(this doc), `tdd` (rule-red → move → green per phase), `riviera-local-debug` (loaded before
the first Gradle run), `postgres` (loaded at Phase 4 for the V18 registry migration),
`riviera-stripe-payments` (loaded at Phases 3–4: `payment`/`payout` files move packages;
the collect-only/no-Connect model is untouched).

**Branch:** `claude/riviera-sdlc-issue-95-prl6p6` (harness-designated remote branch,
standing in for `feature/issue-95-published-surface-split` per the cloud-session addendum).

---

## Target surface classification (the "which module gets which surfaces" decision)

No forced empty surfaces (same philosophy as ADR-0007's optional `api`/`spi`):

| Module | `api` (ports — interfaces others call) | `vocabulary` (ids, value/outcome types) | `events` (published domain events) | `spi` |
|---|---|---|---|---|
| `venue` | `VenueCatalog`, `SetBookingFacts`, `VenueRates` | `VenueId`, `SetId`, `MoneyView`, `SetView`, `VenueMapView`, `VenueSummaryView`, `VenueFilter`, `AvailabilitySummary`, `SetBookingInfo` | — | `SetAvailabilityLookup` (unchanged) |
| `availability` | `AvailabilityClaim` | `ClaimOutcome` | — | — |
| `booking` | — (**package removed** — booking publishes no ports) | `BookingId`, `RefundReason` | `BookingConfirmed`, `BookingCancelled` | — |
| `payment` | `CheckoutPort`, `CancelPaymentPort`, `RefundPort` | `Money`, `BookingRef`, `PaymentOutcome`, `PaymentCancellation`, `RefundResult` | `PaymentConfirmed`, `PaymentCanceled` | — |
| `customer` | `CustomerDirectory` | `CustomerId`, `GuestContact` | — | — |
| `operator` | `OperatorAccounts`, `OperatorDirectory`, `OperatorProvisioning`, `VenueOwnership` | `OperatorId`, `VenueRef`, `OperatorCredential`, `NotVenueOwnerException` | — | — |
| `payout` | — | — | — | — (pure subscriber, publishes nothing — unchanged) |

Classification rules applied (and encoded by the C1 rule in Phase 6):
- A **port** is a plain (non-sealed) interface another module calls. Sealed interfaces
  (`PaymentOutcome`, `PaymentCancellation`, `RefundResult`) are **outcome vocabulary**,
  not ports — their nested record implementations move with them.
- A published **exception** (`NotVenueOwnerException`) is vocabulary (a value-ish type a
  caller handles), legal there and **illegal** in `api`.
- An **event** is a record announced via the Event Publication Registry and consumed by
  another module's `@ApplicationModuleListener`.

## Target grant matrix (least privilege, bytecode-level)

Derived from the actual cross-module imports **plus** bytecode-only edges (accessor-chain
uses that need no import — e.g. `payout` touching `BookingId` via `event.bookingId()`).
`ModularityTests.verify()` is the arbiter; if it reports an edge this matrix misses, the
matrix is corrected here with a note, never silenced by an unexplained widening.

| Consumer ↓ | `allowedDependencies` — before | `allowedDependencies` — target |
|---|---|---|
| `venue` | `operator::api` | `operator::api`, `operator::vocabulary` |
| `availability` | `venue::api`, `venue::spi`, `operator::api` | `venue::api`, `venue::vocabulary`, `venue::spi`, `operator::api`, `operator::vocabulary` |
| `booking` | `venue::api`, `availability::api`, `payment::api`, `customer::api`, `operator::api` | `venue::api`, `venue::vocabulary`, `availability::api`, `availability::vocabulary`, `payment::api`, `payment::vocabulary`, `payment::events`, `customer::api`, `customer::vocabulary`, `operator::api`, `operator::vocabulary` |
| `payment` | *(none)* | *(none)* |
| `payout` | `booking::api`, `venue::api`, `operator::api` | `booking::events`, `booking::vocabulary`, `venue::api`, `venue::vocabulary`, `operator::api`, `operator::vocabulary` |
| `customer` | *(none)* | *(none)* |
| `operator` | *(none)* | *(none)* |

The headline least-privilege wins the split makes visible:
- **`payout` no longer holds a grant to booking's command surface** — it depends on
  `booking::events` + `booking::vocabulary` only (issue #95's title AC). (Booking's
  command ports were already internal in `application/`; the split makes the *grant*
  say so structurally.)
- **A port grant (`::api`) no longer smuggles in event visibility** — `booking` holds
  `payment::events` explicitly because it listens to `PaymentConfirmed`/`PaymentCanceled`;
  `availability` holds no `venue`-event grant because none exist.

Per-grant justification (the narrowest set each consumer's code needs):

| Consumer | Grant | Needed for |
|---|---|---|
| `venue` | `operator::api` | `VenueOwnership.assertOwns` (beach-map edit auth, invariant #13) |
| `venue` | `operator::vocabulary` | `OperatorId`, `VenueRef` |
| `availability` | `venue::api` | `SetBookingFacts` (pool check on staff mark) |
| `availability` | `venue::vocabulary` | `SetId`, `SetBookingInfo` |
| `availability` | `venue::spi` | implements `SetAvailabilityLookup` (issue #44 inversion) |
| `availability` | `operator::api` + `::vocabulary` | staff tap-to-mark ownership check (`VenueOwnership`, `OperatorId`, `VenueRef`) |
| `booking` | `venue::api` + `::vocabulary` | `SetBookingFacts`/`VenueRates`; `VenueId`, `SetId`, `SetBookingInfo`, `MoneyView` |
| `booking` | `availability::api` + `::vocabulary` | `AvailabilityClaim`; `ClaimOutcome` |
| `booking` | `payment::api` + `::vocabulary` | `CheckoutPort`/`CancelPaymentPort`/`RefundPort`; `Money`, `BookingRef`, outcome types |
| `booking` | `payment::events` | `PaymentEventListener` consumes `PaymentConfirmed`/`PaymentCanceled` |
| `booking` | `customer::api` + `::vocabulary` | `CustomerDirectory`; `CustomerId`, `GuestContact` |
| `booking` | `operator::api` + `::vocabulary` | staff daily view + weather refund ownership checks |
| `payout` | `booking::events` | `BookingConfirmedPayoutListener`/`BookingCancelledPayoutListener` |
| `payout` | `booking::vocabulary` | `BookingId` (via event accessors), `RefundReason` |
| `payout` | `venue::api` + `::vocabulary` | `VenueRates` (commission re-read at accrual); `VenueId` |
| `payout` | `operator::api` + `::vocabulary` | ledger-read ownership check |

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the split surfaces and the narrowed grant matrix above, when the
  Modulith structure is verified, then it passes — no module reaches a surface it isn't
  granted. *Pinned by:* `ModularityTests.verifiesModularStructure`
- [ ] **AC-2:** Given `payout`'s `package-info`, when its grants are read, then they are
  exactly `{booking::events, booking::vocabulary, venue::api, venue::vocabulary,
  operator::api, operator::vocabulary}` — no `booking::api` — and the
  `ai.riviera.platform.booking.api` package no longer exists. *Pinned by:*
  `ModularityTests.verifiesModularStructure` (an undeclared edge fails) + Phase-4 grep step
- [ ] **AC-3:** Given the widened allowed top-level set `{api, spi, vocabulary, events,
  application, domain, adapter}` (rationale: two new published-surface kinds, ADR-0007
  amendment), when the package-shape rule runs over production classes, then it passes,
  and `vocabulary`/`events` are rejected anywhere but top-level. *Pinned by:*
  `PackageShapeArchitectureTests` (all four assertions, updated deliberately)
- [ ] **AC-4:** Given a record or enum placed in a ports `api`/`spi` surface, or a sealed
  interface placed there, when the C1 placement rule runs, then it reports a violation —
  demonstrated against a test fixture, not by breaking production code. *Pinned by:*
  `PublishedSurfacePlacementArchitectureTests.recordInPortsSurfaceIsRejected` (fixture-fed)
- [ ] **AC-5:** Given every `@ApplicationModuleListener` parameter type owned by another
  module, when the placement rule runs, then each resides in its owner's `events` surface
  (an event published from `api`/`vocabulary` is a violation). *Pinned by:*
  `PublishedSurfacePlacementArchitectureTests`
- [ ] **AC-6:** Given persisted registry rows naming the four old event FQCNs, when V18
  runs, then `event_type` is rewritten to the new FQCNs in **both** `event_publication`
  and `event_publication_archive`. *Pinned by:* migration content review + the
  Testcontainers ITs that boot the context (Flyway applies V18) in CI
- [ ] **AC-7:** No behavior change: the full suite (unit + IT + `ModularityTests` +
  `JdbcOnlyArchitectureTests` + `PackageShapeArchitectureTests` + new placement rule) is
  green in CI at the PR head. *Pinned by:* CI gate

## Non-goals

- **C2** (role-split honesty rule) — shipped with #94.
- **C4** (id-based-event-components rule, sole-writer rule) — separate improvement-plan item.
- **B3/B4** (booking module split; read-model module) — standing triggers, not scheduled.
- Any behavior, endpoint, SQL (beyond V18), or event-payload change; any port renaming or
  port-shape change; retiring the bootstrap operator (separate follow-up).
- Frontend — untouched.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Event Publication Registry rows persist event FQCNs (`archive` mode + republish-on-restart); moving the 4 event classes strands outstanding/archived rows under the old name → republish deserialization failures after deploy | med | high | `V18__event_publication_event_type_moves.sql` rewrites both tables' `event_type`; authored under `postgres`; deployed atomically with the code (Flyway runs before the app serves) | agent | resolved — V18, commit 3940239 (PayoutSpineScenarioIT green) |
| R-2 | `PackageShapeArchitectureTests` assertion 1 fails the moment the first top-level `vocabulary/` appears — a red intermediate state | high | low | Phase 1 widens `ALLOWED_TOP_LEVEL` + `NAMED_INTERFACE_PACKAGES` in the same commit as the first move (rule-red → widen+move → green; each phase ends green) | agent | resolved — commit 5a4544b (rule-red observed, then widened) |
| R-3 | A bytecode-only dependency (accessor chain, `throws`, caught exception) missed by import scanning → `verify()` red or, worse, an over-wide grant left in place | med | med | `ModularityTests` run per phase is the arbiter; any correction is recorded in the grant matrix above with a note — never silenced by widening without explanation | agent | resolved — verify() green at every phase; zero matrix corrections needed |
| R-4 | C1 rule "api = interfaces only" leaves a loophole: sealed outcome hierarchies are interfaces — the drift re-enters through outcome types in `api` | med | med | Rule additionally rejects `sealed` interfaces in `api`/`spi` (outcome hierarchies are vocabulary by convention); fixture test proves it | agent | resolved — commit 6b9f4e3 (sealedInterfaceInPortsSurfaceIsRejected) |
| R-5 | ~87 main + ~38 test files change packages/imports; a stray reference to a moved type via FQCN string (reflection, SQL, config) survives compile but breaks runtime | low | med | Grep for the old FQCNs (`\.api\.BookingConfirmed`, etc.) across `src/`, `application*.properties`, and `db/migration` at Phase 5; the registry rows are the one known case (R-1) | agent | resolved — sweep clean at commit f43ab7d |
| R-6 | SonarCloud counts moved files as new code → new-code coverage < 80% on lines that were never covered | low | med | Moves preserve git history where possible (same-commit rename detection); if the gate still trips, cover or resolve-with-rationale in SonarCloud per the Sonar gate | agent | resolved — Sonar quality gate PASSED on PR #105 (0 new issues, 80.0% new-code coverage) |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** Spring Modulith 2.1 named interfaces cover the annotated package only,
  so each new package needs its own `package-info.java`. — **Confirmed** at commit
  5a4544b: every `vocabulary`/`events` package carries its own `@NamedInterface`
  `package-info.java` and `ModularityTests` is green with per-surface grants.
- **Assumption:** no `@Externalized` events, so only the registry tables carry FQCNs. —
  **Confirmed** at commit 3940239 (grep clean; V18 covers both registry tables; the R-5
  sweep at f43ab7d found no other FQCN carriers).

## Availability & concurrency (invariant #2)

**No availability write-path change.** `AvailabilityClaim` (port) keeps its package;
`ClaimOutcome` moves to `availability/vocabulary` — a package move only. The
`(set_id, booking_date)` unique constraint, the `INSERT … ON CONFLICT` claim, the pool
rule, and the cutoff rule are untouched (no SQL beyond V18, which touches only the
registry tables). *Pinning:* the existing availability/booking module tests +
`ConcurrentReservationIT` in CI, unchanged and green (AC-7).

## Spring Modulith — modules, interfaces, events

**Modules touched:** all seven (package-info grants), but only as **published-surface
reshuffle + grant narrowing** — no service, adapter, domain, or SQL logic changes.
Module-ownership table (plan-doc §4a): **no behavior is added or moved between modules;
every type stays in its owning module** — the slice only changes *which named interface
inside the same module* publishes it. No `RESPONSIBILITIES.md` Job/Not-My-Job line is
affected.

**Named interfaces after the split:** see the Target surface classification table above.
`api` keeps `@NamedInterface("api")` (ports only); new `@NamedInterface("vocabulary")`
and `@NamedInterface("events")` packages per that table; `venue/spi` unchanged.

**Domain events:** payloads, publishers, subscribers, and async semantics all unchanged —
`BookingConfirmed`/`BookingCancelled` (publisher `booking`; subscriber `payout`) and
`PaymentConfirmed`/`PaymentCanceled` (publisher `payment`; subscriber `booking`) move to
their modules' `events` surface, FQCN-only change (see R-1/V18).

## Payment & payout (invariants #5, #8, #9, #10)

**No money behavior change.** Collect-only via Stripe, no Connect, manual BKT payout —
untouched. `Money` stays integer-minor-units (package move only). The payout ledger's
exactly-once accrual/reversal logic is untouched; only its listeners' imports change.
`riviera-stripe-payments` loaded at Phases 3–4 (files in `payment`/`payout` move).
*Pinning:* existing webhook idempotency / payout ledger ITs, unchanged and green (AC-7).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change (no endpoint, DTO, or wire shape changes).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc | ✅ | ac2c3e2 |
| 1 — Shape-rule widening + `venue` vocabulary split | ✅ | (this commit) |
| 2 — `operator` vocabulary split | ✅ | (this commit) |
| 3 — `payment` vocabulary + events split | ✅ | (this commit) |
| 4 — `booking` events + vocabulary split (drop `booking.api`) + V18 registry migration | ✅ | (this commit) |
| 5 — `availability` + `customer` vocabulary splits + old-FQCN sweep | ✅ | (this commit) |
| 6 — C1 placement rule (`PublishedSurfacePlacementArchitectureTests`) | ✅ | (this commit) |
| 7 — Substrate docs (ADR-0007 amendment, CLAUDE.md #11, `riviera-modulith` skill) | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit
window as each phase's code.

---

## File structure

- `platform/src/main/java/ai/riviera/platform/<module>/vocabulary/` (+`package-info.java`)
  — new named interface per the classification table; moved value/id/outcome types.
- `platform/src/main/java/ai/riviera/platform/<module>/events/` (+`package-info.java`)
  — new named interface (`booking`, `payment` only); moved event records.
- `platform/src/main/java/ai/riviera/platform/<module>/package-info.java` — narrowed
  `allowedDependencies` per the grant matrix.
- `platform/src/test/java/ai/riviera/platform/PackageShapeArchitectureTests.java` —
  widened `ALLOWED_TOP_LEVEL` / `NAMED_INTERFACE_PACKAGES` + javadoc rationale.
- `platform/src/test/java/ai/riviera/platform/PublishedSurfacePlacementArchitectureTests.java`
  — the C1 rule + fixture-fed negative tests (fixture package under `src/test/java`).
- `platform/src/main/resources/db/migration/V18__event_publication_event_type_moves.sql`
  — registry FQCN rewrite (both tables).
- `docs/adr/ADR-0007-package-structure.md` — amendment: the two new named-interface
  kinds + placement rule. `CLAUDE.md` invariant #11 + module table note;
  `.claude/skills/riviera-modulith/SKILL.md` "splitting an overgrown api" section updated
  from "in progress" to the landed convention.

---

## Phases (rule-red → move → green; each phase ends with ModularityTests + shape rule green)

Per-phase discipline (applies to every phase below; `riviera-local-debug` governs the run
recipes — scoped test classes only, never bare `test` locally):

- [ ] Move the types with `git mv`; add the new `package-info.java` first.
- [ ] Update the provider's own internal imports, then every consumer's imports.
- [ ] Update consumers' `allowedDependencies` to the target matrix row.
- [ ] Run scoped: `ModularityTests`, `PackageShapeArchitectureTests`,
  `JdbcOnlyArchitectureTests`, + the touched modules' test packages.
- [ ] Commit with `(#95)` + update Execution status.

**Phase 1 — Shape-rule widening + `venue` split.** Create `venue/vocabulary` and move the
9 vocabulary types; `venue/api` keeps only the 3 ports. Widen
`ALLOWED_TOP_LEVEL` → `{api, spi, vocabulary, events, application, domain, adapter}` and
`NAMED_INTERFACE_PACKAGES` → `{api, spi, vocabulary, events}` in the same commit (the move
makes the old constants red — that red is the TDD step; the widening + javadoc rationale
is the green). Consumers updated: `availability`, `booking`, `payout` imports + grants
(also take `operator` vocab grants? **No** — operator moves in Phase 2; grants change
per-phase so each phase stands alone green).

**Phase 2 — `operator` split.** `operator/vocabulary` ← `OperatorId`, `VenueRef`,
`OperatorCredential`, `NotVenueOwnerException`. Consumers: `venue`, `availability`,
`booking`, `payout` (+ root-level config imports, no grants needed for root).

**Phase 3 — `payment` split.** `payment/vocabulary` ← `Money`, `BookingRef`,
`PaymentOutcome`, `PaymentCancellation`, `RefundResult`; `payment/events` ←
`PaymentConfirmed`, `PaymentCanceled`. Consumer: `booking` (gains `payment::vocabulary`,
`payment::events`). Load `riviera-stripe-payments` before touching the module.

**Phase 4 — `booking` split + V18.** `booking/events` ← `BookingConfirmed`,
`BookingCancelled`; `booking/vocabulary` ← `BookingId`, `RefundReason`; **delete
`booking/api`**. Consumer: `payout` (grants per matrix). Load `postgres`; author
`V18__event_publication_event_type_moves.sql` — four `UPDATE … SET event_type = … WHERE
event_type = …` statements × 2 tables (idempotent, no-op on rows that don't exist).

**Phase 5 — `availability` + `customer` splits + sweep.** `availability/vocabulary` ←
`ClaimOutcome`; `customer/vocabulary` ← `CustomerId`, `GuestContact`. Consumer: `booking`.
Then the R-5 sweep: grep the old FQCNs across `src/`, properties, and migrations — the
only expected hits are V18 itself.

**Phase 6 — C1 placement rule.** New `PublishedSurfacePlacementArchitectureTests`
(sibling of `PackageShapeArchitectureTests`, same violation-collector style, no Spring/DB):
1. `api`/`spi` surfaces contain only **non-sealed interfaces** (package-info excluded).
2. `events` surfaces contain only **records**.
3. `vocabulary` surfaces contain **no non-sealed interfaces** (no ports hiding there).
4. Every `@ApplicationModuleListener` parameter type owned by *another* module resides in
   that module's `events` surface.
5. Vacuous-green guard (same `assertModulesWereInspected` pattern).
The violation collectors take `JavaClasses` as a parameter so the negative ACs are proven
by **fixture packages** (e.g. `…placementfixture.badapi` containing a record in an `api`
package, imported with a test-including `ClassFileImporter`) — never by breaking
production code. TDD: fixture tests first (red against a collector stub), production rule
green.

**Phase 7 — Substrate docs.** ADR-0007 amendment (two new named-interface kinds, the
placement rule as enforcement, updated tree diagrams for booking/payment/venue);
`CLAUDE.md` invariant #11 sentence + module-table note; `riviera-modulith` SKILL.md
"Splitting an overgrown api/" section rewritten from "in progress" to the landed
convention (+ the grant-string examples); `riviera-review-overlay` RV-BE-3c already names
the rule — verify its text matches reality (it does; no edit expected). Plan-doc close-out.

Then: push → PR → **CI gate** → **Review gate** (high effort — the diff touches
authorization-adjacent surfaces (`operator`) and money/event modules, even though it's a
move) → **Sonar gate** → merge + close-out checklist.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1/AC-3:** `gradle test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"` → PASS. Verified at commit 6b9f4e3.
- [x] **AC-2:** `grep -rn "booking::api" platform/src/main/java` → empty; `platform/src/main/java/ai/riviera/platform/booking/api` does not exist. Verified at commit 3940239.
- [x] **AC-4/AC-5:** `gradle test --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS, 10/10 incl. the five fixture-fed negatives. Verified at commit 6b9f4e3.
- [x] **AC-6:** V18 rewrites all four FQCNs in both registry tables; `PayoutSpineScenarioIT` (boots context, applies V18) green locally at commit 3940239; CI ITs re-verify on the PR.
- [ ] **AC-7:** CI full suite green at PR head. Verified at the PR's check run (pending — the one AC CI owns).

## Review-gate record (PR #105)

High-effort review run (8 finder angles + adversarial verify, `riviera-review-overlay` walked on
top — RV-BE-1/3b/3c/9/11/12, payment items, RV-PROC-1 all checked). Sonar quality gate: **passed**
(0 new issues, 80.0% new-code coverage). Findings and outcomes (all fixes re-entered the loop —
skills re-checked, tests re-run, changed surface re-reviewed):

1. **V18 missed `listener_id` (Blocker, invariants #8/#9).** The registry's default
   `@TransactionalEventListener` id embeds the event parameter FQCN; republish matches string-equal
   and marks unmatched rows FAILED — pre-deploy incomplete refunds/accruals/confirmations would
   dead-letter. Confirmed against spring-context 7.0.8 + spring-modulith-events 2.1.0 bytecode.
   **Fixed:** V18 now rewrites `listener_id` (REPLACE on the parenthesized FQCN) in both tables.
2. **V14 edited in place (Blocker, invariant #12).** The repo-wide FQCN sed touched a comment in
   the already-applied `V14__cancellation_reason.sql` → Flyway checksum mismatch on every migrated
   DB. **Fixed:** V14 restored byte-identical to `main`; V18's header documents why the stale
   comment stays.
3. **Vacuous negative proof (Major).** `sealedInterfaceInPortsSurfaceIsRejected` passed via the
   nested fixture record's not-an-interface violation. **Fixed:** both ports-surface negative tests
   now match the discriminating message text.
4. **Doc drift (Major/Minor, several):** `references/events.md` still taught events-in-api (now
   teaches `<module>.events` + the registry-FQCN/Flyway rule); `riviera-modulith` SKILL.md hard
   constraints #2/#3 + spi example grants; `PackageShapeArchitectureTests` javadoc/assertion-3
   naming and message; module-root package-infos (payment/customer/venue/availability/payout
   comment); `PaymentConfirmed` javadoc grant; dangling `{@link}`s in moved vocabulary types.
   **All fixed.**
5. **Roll-forward-only constraint (documented):** after V18 runs, rolling the app back to pre-#95
   code leaves registry rows naming `events.*` classes the old artifact cannot load — pending
   publications stall until hand-reversed. Documented in V18's header and here; acceptable for the
   current single-instance non-prod deployment.
6. **Deferred (rationale):** extracting the shared package-arithmetic helper from the two shape
   tests — deliberate test isolation, no third consumer yet; double-negative assertion fixed
   instead. The placement rule's subtree policing (stricter than `@NamedInterface` semantics) is
   deliberate and now documented in the test's javadoc.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled — no write-path change; suite green (invariant #2).
- [ ] Pool + cutoff rules honored — untouched (invariants #3, #4).
- [ ] **Modulith** section filled; grants narrowed, no cross-module internals imports; event payloads unchanged and id-based (invariant #11).
- [ ] **Payment/payout** — no money behavior change; V18 only touches registry FQCNs (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6). Booking codes untouched (invariant #7).
- [ ] Flyway migration V18 present for the registry FQCN rewrite (invariant #12).
- [ ] Frontend N/A.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
