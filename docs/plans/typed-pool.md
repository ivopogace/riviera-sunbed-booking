# Typed `Pool` vocabulary — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** No production class declares its own `"ONLINE"` / `"WALK_IN"` literal: `venue.vocabulary.Pool`
is the one Java statement of the `set_position_pool_check` tokens, the published surfaces
(`SetBookingFacts#poolForClaim`, `SetBookingInfo`, `SetView`) carry the type instead of naming the
tokens in prose, all three comparison/validation sites use it, the locked claim-time check stays the
authoritative one, and a bytecode fitness test keeps the tree that way.

**Architecture:** An **enum** published from `venue/vocabulary/` — the module that owns
`set_position.pool` — not a record: it mirrors the CHECK's closed vocabulary exactly as `BookingMode`
does, and both consumers (`booking`, `availability`) already hold `venue::vocabulary`, so no grant
changes. The column stays `TEXT` + CHECK (Java-side typing, no migration); the JDBC mappers convert
with `Pool.valueOf` like `BookingMode.valueOf`, so an off-vocabulary *stored* value is a logged 500,
never a silent default. Wire shapes are unchanged: Jackson serialises the enum by name, and
`SetPositionRequest` keeps `String pool` and converts at the edge inside
`InvalidApiRequestException.parsing`, so an unknown or missing token is still `400 INVALID_REQUEST`.
The two ONLINE checks stay two — `JdbcAvailabilityClaim`'s `FOR KEY SHARE` read inside the claim
transaction remains authoritative for invariant #3, `ReserveSetService`'s unlocked read remains the
fast path — and `SetCommand`'s pool half of rule V16 is **deleted**, not moved: the type makes an
off-vocabulary pool unrepresentable, so the constructor keeps a presence check only, exactly as
`VenueFieldValidation.requireSalesClose` does for `SalesClose`.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched; `set_position_pool_check`
(V2) stays the race-safe backstop.

**Source of intent:** GitHub issue #927 (D4 of `docs/research/2026-09-04-where-the-business-rules-live.md`
+ H-5 of `docs/research/2026-09-04-bounded-context-and-doc-drift-audit.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the token has **seven**
carriers, not the issue's three declaration sites: `SetView.pool`, `SetPlacement.pool`,
`SetPositionRequest.pool` and the `JdbcVenues` bind also change; and a raw
`IllegalArgumentException` is a deliberate 500 here, so the edge conversion has to sit inside the
existing `parsing` wrapper) · `riviera-plan-doc` (this template — forced the behaviour-parity
ledger for the `400` on a bad token and the decision to leave availability *state* untyped) ·
`tdd` (each phase opens with a compile-red or assertion-red test at a named seam) ·
`riviera-review-overlay` (review gate — **ran** on PR #973 over `a7ae5bb6..cf160c9c` via
`code-review:code-review` at high effort plus the overlay walk; three findings, register below) ·
`riviera-docs-freshness` (**ran** over `a7ae5bb6..HEAD`, 1 finding — ADR-0018 §3's "four such
mirrors" count, patched to five; the `riviera-java-conventions` §6a citation of the deleted
`ONLINE_POOL` constant was patched in phase 2) · `riviera-modulith` (`Pool` is published, so `vocabulary/`, not `domain/`; a
value type on an `api/` port; no `allowedDependencies` edge; the structural net after the change) ·
`riviera-java-conventions` (enum for a closed vocabulary; `valueOf` at the JDBC mapper; §6c/§6d on
every touched Javadoc — the `SetBookingInfo` block loses its provenance) · `codebase-design` (no new
seam — the type rides the existing ports; the fitness test observes the compiled tree, the one
surface that sees every module) · `domain-modeling` (`CONTEXT.md` already defines **Pool** with
these two values — vocabulary unchanged, no ADR: reversible and unsurprising) · `grilling`
(interrogated the ticket against the code; see Open questions) · `riviera-local-debug` (toolchain
registration, scoped test recipes, the deepened clone; the session's proxy CA bundle carried one
malformed PEM block, repaired into a scratchpad copy for `git`).

**Branch:** `claude/sdlc-927-qoirad` — the session's designated remote branch stands in for
`feature/typed-pool` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a `SetCommand` built with `Pool.WALK_IN`, when constructed, then it carries that
  pool with no string vocabulary check; given a `null` pool, then `IllegalArgumentException`.
  *Seam:* `venue.application.SetCommand` canonical constructor · *Pinned by:*
  `SetCommandTest.carriesTheTypedPool`, `SetCommandTest.rejectsAMissingPool`
- [x] **AC-2:** Given a set body whose `pool` is `"VIP"` or absent, when converted to a command, then
  `IllegalArgumentException` (which `InvalidApiRequestException.parsing` turns into
  `400 INVALID_REQUEST`); given `"WALK_IN"`, then the command carries `Pool.WALK_IN`.
  *Seam:* `venue.adapter.in.SetPositionRequest#toCommand` · *Pinned by:*
  `SetPositionRequestTest.rejectsAnUnknownPoolToken`, `.rejectsAMissingPool`, `.mapsTheTokenToThePool`
- [x] **AC-3:** Given a seeded online set, when `SetBookingFacts#setBookingInfo` answers, then
  `pool()` is `Pool.ONLINE`; given a walk-in set, when `AvailabilityClaim#claim` runs, then
  `NOT_ONLINE_POOL` and no row — through the typed `poolForClaim`.
  *Seam:* `venue.api.SetBookingFacts`, `availability.api.AvailabilityClaim` · *Pinned by:*
  `SetBookingInfoIT.resolvesBookingInfoForOnlineSet`, `AvailabilityClaimIT.walkInSetIsNotClaimable`
- [x] **AC-4:** Given a `WALK_IN` set, when a tourist reserves it, then `NOT_ONLINE_POOL` from the
  unlocked fast path, before any claim. *Seam:* `booking`'s `CreateBookingService` through a
  `SetBookingFacts` fake · *Pinned by:* `CreateBookingServiceTest.rejectsWalkInPool`
- [x] **AC-5:** Given the compiled production tree, when its constant pools are scanned, then no class
  other than `venue.vocabulary.Pool` holds `"ONLINE"` or `"WALK_IN"` as a string constant; given a
  fixture class that does, then the scan names it. *Seam:* the compiled classes under
  `build/classes/java/main` (a context-free fitness function, sibling to
  `NoStripeConnectArchitectureTest`) · *Pinned by:* `PoolTokenArchitectureTest.onlyPoolStatesThePoolTokens`,
  `PoolTokenArchitectureTest.flagsAStrayPoolLiteral`
- [x] **AC-6:** Given the change, when the structural net runs, then it is green (no new
  cross-module edge, `Pool` placed in a `vocabulary` surface). *Seam:* `ApplicationModules.verify()`
  and the package-shape rules · *Pinned by:* `ModularityTests`, `PublishedSurfacePlacementArchitectureTests`

## Non-goals

- **Typing the availability *state* token** (`SetAvailabilityLookup#statesOn`'s `Map<SetId, String>`,
  the other half of H-5). It does not fall out cheaply: that port lives in `venue.spi`, and `venue`
  does not depend on `availability`, so a typed state would have to be published by `venue` for a
  concept `availability` owns — or admitted to `shared`, whose admission rests on ownership. Left
  as the issue allows; no live duplicated comparison sits behind it.
- **Typing `tier`** (`SetCommand.TIERS`, `SetView.tier`). Same shape, but no cross-module consumer
  and no duplicated comparison — outside #927.
- **A `Pool.fromToken` conversion on the enum.** `valueOf` is the enum's one conversion in; the
  edge translates its message (the `UpdateVenueProfileRequest` amenity pattern).
- **The layout maxima drift** the issue records under "also recorded, not scheduled".
- Any frontend change: the wire keeps `"ONLINE"` / `"WALK_IN"`, and `frontend/src/app/shared/venue-views.ts`
  already types `Pool = 'ONLINE' | 'WALK_IN'`.

## Behavior-parity ledger (retirement / replacement slices only)

The `Set<String> POOLS` validation in `SetCommand` is retired; its observable behaviours:

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `POST`/`PATCH` set body with an unknown `pool` → `400 INVALID_REQUEST` | preserved | `SetPositionRequest#toCommand` parses the token; `Pool.valueOf`'s `IllegalArgumentException` is translated to a safe message and crosses `InvalidApiRequestException.parsing` → 400 |
| set body with `pool` absent (`null`) → `400 INVALID_REQUEST` | preserved | `toCommand` rejects `null` before parsing (the old `POOLS.contains(null)` path) |
| bulk layout replace with a bad `pool` in any cell → `400` | preserved | `BeachMapLayoutRequest` maps every cell through the same `toCommand` |
| a `SetCommand` built in Java with a bad token → `IllegalArgumentException` | dropped | unrepresentable: the parameter is `Pool` |
| a `SetCommand` built with `null` pool → `IllegalArgumentException` | preserved | presence check in the compact constructor (`requireSalesClose` precedent) |
| the error `detail` never carries the token list | preserved | `ApiErrorHandler` never echoes the message |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The claim-time check loses its lock or its authority while being retyped (invariant #3 against a concurrent pool flip) | low | high | `JdbcAvailabilityClaim` keeps `setFacts.poolForClaim` (`FOR KEY SHARE`) as the check inside `@Transactional claim`; `SetWriteVsClaimConcurrencyIT` (pool-flip race) and `AvailabilityClaimIT.walkInSetIsNotClaimable` stay green | agent | closed — `SetWriteVsClaimConcurrencyIT` (12) and `AvailabilityClaimIT` (4) green locally and in CI |
| R-2 | A bad wire token becomes a 500 instead of a 400 (`Pool.valueOf` NPE on `null`, or an IAE thrown outside `parsing`) | med | med | the conversion lives in `SetPositionRequest#toCommand`, already inside `parsing` at every controller call; `null` handled before `valueOf`; `SetPositionRequestTest` pins both | agent | closed — `SetPositionRequestTest` (3) + `VenueAdminControllerIT` (47) green |
| R-3 | `Pool.valueOf` on a stored value trips on seed data or an IT fixture that writes a lower-case token | low | med | the CHECK admits only the two upper-case tokens; `SetBookingInfoIT` / `VenueAdminControllerIT` read seeded and written rows through the new mappers | agent | closed — `SetBookingInfoIT`, `VenueRepriceIT`, `VenueAdminControllerIT` green |
| R-4 | The fitness test false-positives on a legitimate `Pool.ONLINE` reference (the field name is a `Utf8` entry in every referencing class) | med | med | scan `CONSTANT_String` entries only (`java.lang.classfile` `StringEntry`), never raw `Utf8`; the negative fixture proves a literal is caught and the positive run proves `ReserveSetService`'s `Pool.ONLINE` reference is not | agent | closed — `PoolTokenArchitectureTest` names `Pool` as the one holder and flags the fixture |
| R-5 | `PoolTokenArchitectureTest` runs before `compileJava` in some Gradle invocation and finds no classes | low | low | assert the directory exists with the same message as `NoStripeConnectArchitectureTest`; the `test` task depends on both compiles | agent | closed — green in CI's full suite |
| R-6 | Touched Javadoc blocks trip `check-inline-comments.mjs` (provenance tells in `SetBookingInfo`'s block) | med | low | re-read every touched block whole per §6c; run `node scripts/check-inline-comments.mjs --diff origin/main` before each push | agent | closed — guard exit 0 on every push |
| R-7 | Module boundary leak (#11): `Pool` lands in `venue.domain` or `SetCommand` (application) is imported cross-module | low | high | `Pool` in `venue/vocabulary/`; the structural net after phase 1 | agent | closed — net green locally and in CI |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** the enum is named `Pool` (the issue's word, `CONTEXT.md`'s term, the column's name,
  the frontend's type alias) rather than `SetPool`; `venue.vocabulary` qualifies it. Naming is the
  agent's call (`riviera-plan-doc` § execution 2). — shipped as `Pool` in `3d23b33d`; stated in the
  PR body for the owner to overrule at review.
- **Assumption:** `SetView.pool` is typed too — the issue's "published surfaces carry the type" reads
  on every published carrier, and it costs one `valueOf`. — shipped in `eaa77334`; wire unchanged.
- **Assumption:** availability *state* stays a `String` (Non-goals) — the issue's own "if it doesn't
  fall out cheaply, say so and leave it". — recorded in the PR's Scope notes.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged — online claim
  (`JdbcAvailabilityClaim.claim`), release, staff mark/release, the request-lifecycle releases. This
  slice touches only the *pool check* that precedes the claim's `INSERT`.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` — untouched.
- **Concurrency strategy:** `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING` — untouched.
- **Pool rule (invariant #3):** two checks, deliberately: `JdbcAvailabilityClaim` reads the pool
  under `FOR KEY SHARE` *inside the claim transaction* through `SetBookingFacts#poolForClaim`
  (now `Optional<Pool>`) and refuses anything but `Pool.ONLINE` — authoritative against a concurrent
  repool (`SetWriteVsClaimConcurrencyIT`); `ReserveSetService` refuses on the unlocked
  `SetBookingInfo.pool()` first so a tourist gets `NOT_ONLINE_POOL` without opening the claim. The
  token both compare against is now the one `Pool` constant, not two private literals.
- **Cutoff rule (invariant #4):** untouched (`BookingCutoff.isBookable`).
- **Pinning test:** `ConcurrentReservationIT` (unchanged) for #2; `SetWriteVsClaimConcurrencyIT`
  for the pool-flip race that R-1 guards.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `set_position` (unchanged SQL) | owns `set_position.pool` and its CHECK; publishes the vocabulary |
| M-2 | `booking` | existing | — | consumer: `ReserveSetService` compares `SetBookingInfo.pool()` against `Pool.ONLINE` |
| M-3 | `availability` | existing | — | consumer: `JdbcAvailabilityClaim` compares `poolForClaim` against `Pool.ONLINE` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#poolForClaim(SetId)` → `Optional<Pool>` (was `Optional<String>`) | `Pool` | `availability` |
| NI-2 | `venue.api` | `SetBookingFacts#setBookingInfo(s)` → `SetBookingInfo` whose `pool` is `Pool` | `SetBookingInfo`, `Pool` | `booking`, `notification` (tests only construct it) |
| NI-3 | `venue.vocabulary` | `SetView.pool` → `Pool` | `Pool` | the root read controller (serialised by name) |

**Domain events (id-based payloads, invariant #11)**

N/A — no event changes; no event carries the pool.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| the pool vocabulary as a Java type | `venue` | `venue` Job: "the beach map (sets, pools …)", sole writer of `set_position`; `RESPONSIBILITIES.md` §venue "the online-vs-walk-in pool assignment for each set"; no other module's Not-My-Job claims it |
| the online-only rule at claim time | `availability` | unchanged owner — the locked check inside the claim transaction (§availability) |
| the online-only fast path at reserve time | `booking` | unchanged owner — a reserve-flow pre-check on facts read through `venue::api` |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend-only. The wire tokens are unchanged (`venue-views.ts` already types `Pool`).

## FE↔BE contract

N/A — no contract change: every `pool` field still serialises as `"ONLINE"` / `"WALK_IN"`, and the
request DTO still accepts the same strings.

## Execution status

**Stage pointer:** `DONE — review gate run, Sonar gate green, awaiting merge (merged via PR #973)`

**Next action:** merge PR #973, then the close-out's GitHub-side steps (issue closed by the PR; no epic; nothing deferred).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `Pool` published; `SetCommand` typed, V16's pool half deleted; edge conversion | ✅ | 3d23b33d |
| 1 — published surfaces carry `Pool`; both consumers compare against it; the two constants deleted | ✅ | eaa77334 |
| 2 — `PoolTokenArchitectureTest` + fixture; docs freshness | ✅ | cf160c9c |
| review fix round — F-1, F-2; close-out | ✅ | the PR's last commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (prior-PR reviewer, precedent PR #917) | the `Pool` import inserted out of alphabetical order in 17 files | fixed in the fix-round commit |
| F-2 | review (code-comment reviewer; also RV-PROC-2 c / docs-freshness counting sweep) | ADR-0018 §3 states "Four such mirrors exist"; `Pool` is the fifth, and its Javadoc cites that section | fixed in the fix-round commit — the ADR lists five and notes `Pool` is the one published (not `domain/`-internal) mirror |
| F-3 | review (git-history reviewer) | `parsePool` runs as a constructor argument, so on a request with several invalid fields the pool error now wins over `rowLabel`/`positionNo`/`tier`; the wire is unaffected (`ApiErrorHandler` never echoes the message), only the logged cause changes | accepted, not fixed — preserving the old order would put the string back into `SetCommand` or duplicate its checks at the edge; no test or client observes the order |
| S-1 | sonar | PR #973 analysis: 81 new lines, 0 issues, 0 hotspots, 100% new-code coverage, 0.0% duplication | clean |

---

## File structure

- `docs/plans/typed-pool.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/Pool.java` — the published enum; Javadoc names `set_position_pool_check` as its DB twin (ADR-0018 §3)
- `platform/src/main/java/ai/riviera/platform/venue/application/SetCommand.java` — `Pool pool`; `POOLS` deleted; presence check
- `platform/src/main/java/ai/riviera/platform/venue/application/SetPlacement.java` — `Pool pool`; `disturbedBy` compares enums
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetPositionRequest.java` — wire `String pool` parsed to `Pool` in `toCommand`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — bind `pool.name()`; `lockSet` maps with `Pool.valueOf`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — `SetRow`, `SetView`, `SetBookingInfo`, `poolForClaim` map with `Pool.valueOf`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetBookingInfo.java` — `Pool pool`; Javadoc drops the token prose
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetView.java` — `Pool pool`; Javadoc updated
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java` — `Optional<Pool> poolForClaim`; Javadoc drops the token prose
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ReserveSetService.java` — `ONLINE_POOL` deleted; compares against `Pool.ONLINE`
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcAvailabilityClaim.java` — `ONLINE_POOL` deleted; compares against `Pool.ONLINE`
- `platform/src/test/java/ai/riviera/platform/venue/application/SetCommandTest.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/venue/adapter/in/SetPositionRequestTest.java` — AC-2 (new)
- `platform/src/test/java/ai/riviera/platform/venue/PoolTokenArchitectureTest.java` — AC-5 (new)
- `platform/src/test/java/ai/riviera/poolfixture/RoguePoolLiteral.java` — AC-5's negative proof (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — `SetCommand` calls retyped
- `platform/src/test/java/ai/riviera/platform/venue/SetWriteVsClaimConcurrencyIT.java` — `SetCommand` call retyped
- `platform/src/test/java/ai/riviera/platform/venue/VenueSetWriteConcurrencyIT.java` — `SetCommand` calls retyped
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceConcurrencyIT.java` — `SetCommand` call retyped
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — `SetCommand` call retyped
- `platform/src/test/java/ai/riviera/platform/venue/SetBookingInfoIT.java` — asserts `Pool.ONLINE`
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — fake catalog and `set(...)` helper typed
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancellationPolicyTermsTest.java` — `SetBookingInfo` construction typed
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — `SetBookingInfo` construction typed
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/BookingCreationViewsContractTest.java` — `SetBookingInfo` construction typed
- `platform/src/test/java/ai/riviera/platform/notification/application/BookingMailFactsServiceTest.java` — `SetBookingInfo` construction typed
- `platform/src/test/java/ai/riviera/platform/notification/application/MailDeliveryLookupServiceTest.java` — `SetBookingInfo` construction typed
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — `poolForClaim` stub retyped
- `.claude/skills/riviera-java-conventions/SKILL.md` — §6a example and the red-flag row cite `Pool`, not the deleted constant
- `RESPONSIBILITIES.md` — §venue states the once-only pool vocabulary; the machine-checked table gains the `PoolTokenArchitectureTest` row
- `docs/adr/ADR-0018-rule-layer-and-its-packaging.md` — §3's mirror count and list gain `Pool` (review finding F-2)
- `docs/architecture/domain-model.md` — `Pool` enum beside `BookingMode`; `SetBookingInfo.pool` typed

---

## Phase 0 — `Pool` published; `SetCommand` typed; edge conversion

**Files:** Create `venue/vocabulary/Pool.java`, `venue/adapter/in/SetPositionRequestTest.java` · Modify
`SetCommand.java`, `SetPlacement.java`, `SetPositionRequest.java`, `JdbcVenues.java`, `SetCommandTest.java`,
`VenueAdminServiceTest.java`, the four venue ITs that build `SetCommand`

- [x] **Step 1: Write the failing test** — `SetCommandTest.carriesTheTypedPool` (`new SetCommand("A", 1,
  "PREMIUM", Pool.WALK_IN, …)` → `Pool.WALK_IN`) and `rejectsAMissingPool` (`null` → IAE). Red = does not compile.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*SetCommandTest*"` → compile error, `Pool` unknown.
- [x] **Step 3: Minimal implementation** — the enum; `SetCommand(… Pool pool …)` with `POOLS` deleted and a presence check; `SetPlacement`, `JdbcVenues` follow the type.
- [x] **Step 4: Second red at the edge** — `SetPositionRequestTest` (`"VIP"` → IAE, `null` → IAE, `"WALK_IN"` → `Pool.WALK_IN`); then `toCommand` parses.
- [x] **Step 5: Run it, verify it passes** — `--tests "*SetCommandTest*" --tests "*SetPositionRequestTest*" --tests "*VenueAdminServiceTest*"` → PASS; then `--tests "*VenueAdminControllerIT*"` (400 on the bad-token paths, pool split editable).
- [x] **Step 6: Commit** — `Publish a typed Pool and take SetCommand off the string vocabulary (#927)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 1 — the published surfaces carry `Pool`; both consumers compare against it

**Files:** Modify `SetBookingInfo.java`, `SetView.java`, `SetBookingFacts.java`, `JdbcVenueCatalog.java`,
`ReserveSetService.java`, `JdbcAvailabilityClaim.java`, `SetBookingInfoIT.java`, `CreateBookingServiceTest.java`,
`WebSliceStubs.java`, the five other tests that construct `SetBookingInfo`

- [x] **Step 1: Write the failing test** — `SetBookingInfoIT.resolvesBookingInfoForOnlineSet` asserts
  `Pool.ONLINE`; `CreateBookingServiceTest`'s fake returns `Optional<Pool>`. Red = does not compile.
- [x] **Step 2: Run it, verify it fails** — `--tests "*CreateBookingServiceTest*"` → compile error.
- [x] **Step 3: Minimal implementation** — retype the record, the port, the view, the mappers; the two
  consumers compare against `Pool.ONLINE` and drop their constants.
- [x] **Step 4: Run it, verify it passes** — `--tests "*CreateBookingServiceTest*" --tests "*SetBookingInfoIT*"
  --tests "*AvailabilityClaimIT*" --tests "*SetWriteVsClaimConcurrencyIT*"` → PASS; then the structural net.
- [x] **Step 5: Generalization-audit pass** — population: every production class holding `"ONLINE"` /
  `"WALK_IN"` as a string constant (phase 2 makes this the fitness test's own scan).
- [x] **Step 6: Commit** — `Carry Pool on venue's published set facts and compare against it in booking and availability (#927)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — the fitness test; docs freshness

**Files:** Create `venue/PoolTokenArchitectureTest.java`, `ai/riviera/poolfixture/RoguePoolLiteral.java` · Modify
`riviera-java-conventions/SKILL.md`, `docs/architecture/domain-model.md`

- [x] **Step 1: Write the failing test** — `flagsAStrayPoolLiteral` against the fixture (red until the
  scan exists), `onlyPoolStatesThePoolTokens` over `build/classes/java/main`.
- [x] **Step 2: Run it, verify it fails** — `--tests "*PoolTokenArchitectureTest*"`.
- [x] **Step 3: Minimal implementation** — the `java.lang.classfile` `StringEntry` scan, `Pool` exempt.
- [x] **Step 4: Run it, verify it passes**; then the docs edits and `node scripts/check-inline-comments.mjs --diff origin/main`, `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [x] **Step 5: Commit** — `Pin the pool tokens to Pool with a constant-pool scan (#927)`
- [x] **Step 6: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-05 | plan (intake grill) | every production carrier of the pool token: a `String pool` field/parameter, a `"pool"` column read/bind, or a `"ONLINE"`/`"WALK_IN"` literal | `grep -rn --include=*.java -E '\.pool\(\)\|String pool\|poolForClaim\|"pool"\|"ONLINE"\|"WALK_IN"' platform/src/main/java` | `SetCommand`, `SetPlacement`, `SetPositionRequest`, `SetBookingInfo`, `SetView`, `SetBookingFacts`, `JdbcVenueCatalog` (×4), `JdbcVenues` (×2), `ReserveSetService`, `JdbcAvailabilityClaim` | fix all (the File-structure list) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1, AC-2:** `gradle test --tests "*SetCommandTest*" --tests "*SetPositionRequestTest*"` → 9 + 3 tests, 0 failures. Verified at `3d23b33d`.
- [x] **AC-3:** `gradle test --tests "*SetBookingInfoIT*" --tests "*AvailabilityClaimIT*"` → 6 + 4 tests, 0 skipped, 0 failures. Verified at `eaa77334`.
- [x] **AC-4:** `gradle test --tests "*CreateBookingServiceTest*"` → 26 tests, 0 failures. Verified at `eaa77334`.
- [x] **AC-5:** `gradle test --tests "*PoolTokenArchitectureTest*"` → 2 tests, 0 failures. Verified at `cf160c9c`.
- [x] **AC-6:** the structural net (five classes) → 23 tests, 0 failures locally; CI backend job green on `cf160c9c`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
