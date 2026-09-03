# Proof-of-work challenge → closed non-context module `challenge` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move the proof-of-work challenge **mechanism** out of the root package into a closed
Spring Modulith module `ai.riviera.platform.challenge`, leave the **fence** at the edge, and add the
structural nets that make the new seam mechanical — with no product behaviour, HTTP contract,
property, schema or frontend change.

**Architecture:** ADR-0017's decision applied: a port-fronted mechanism no bounded context owns is a
closed non-context module. The module gets the full ADR-0007 template minus `domain/`,
`allowedDependencies = {}`, and publishes exactly one port (`api.ProofOfWorkChallenges`) plus one
value (`vocabulary.ChallengeVerdict`) — a deep module, since issuing, verifying, single-use claiming
and the sweep all sit behind three methods. The root keeps only what decides *policy*: which routes
are fenced, the filter and its ordering, the problem bodies, the rate-limit budget.

**Persistence:** JDBC only (invariant #1). `challenge_registry` (V49) is unchanged — **no new Flyway
migration**; its adapter simply moves package and stops injecting the root's `ScheduledQueryTimeout`
bean in favour of the `@Value` read every module adapter already uses.

**Source of intent:** GitHub issue #913 (parent epic #903); decision ADR-0017; evidence
`docs/research/2026-09-03-non-context-modules-generic-subdomains-and-cohesive-mechanisms.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught seven pieces of
drift between the ticket and today's code, listed under *Resolved*) · `riviera-plan-doc` (this
template — forced the module-ownership table and the behaviour-parity ledger, which is what surfaced
the three #911 proofs that would have been silently lost) · `tdd` (each phase red-green at the seams
named below; the two green-on-arrival regression nets are falsified by hand, and say so) ·
`riviera-review-overlay` (review gate — runs at ready-for-review) · `riviera-docs-freshness` (runs
over the PR range at phase 4, including the "nine modules" counting sweep) · `riviera-modulith`
(the ADR-0007 full-template layout, `api`-vs-internal-port call, `allowedDependencies = {}`, and the
"a module may not depend on the root" rule this slice makes mechanical) · `riviera-java-conventions`
(package-private `@Service`/adapter with only the `api/` port public, `@Value` over a root bean,
Javadoc-is-contract-not-changelog on every moved file) · `codebase-design` (confirmed the three-method
port is the whole seam and that `ChallengeRegistry` stays an internal `application/` port — one
adapter, a hypothetical seam, so it is neither `api` nor `spi`).

**Branch:** `claude/sdlc-913-ukpo4o` — the cloud session's designated remote branch stands in for
`feature/challenge-non-context-module` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the production classpath, when the Modulith structure is verified, then
  `ai.riviera.platform.challenge` is a closed `@ApplicationModule` with `allowedDependencies = {}`
  and no exemption is added anywhere. *Seam:* `ApplicationModules.of(PlatformApplication.class)` ·
  *Pinned by:* `ModularityTests.verifiesModularStructure`
- [ ] **AC-2:** Given the production classpath, when the package-shape and published-surface rules
  run, then the module's packages are in the allowed set and `api` holds only a plain interface while
  `vocabulary` holds only the enum. *Seam:* the module's package tree ·
  *Pinned by:* `PackageShapeArchitectureTests.moduleTopLevelPackagesAreInTheAllowedSet`,
  `PublishedSurfacePlacementArchitectureTests`
- [ ] **AC-3:** Given a composition-root class that reaches `challenge`, when the root-discipline rule
  runs, then only `challenge::api` and `challenge::vocabulary` are permitted. *Seam:* `GRANTED_SURFACES`
  in `CompositionRootDisciplineTests` · *Pinned by:* `CompositionRootDisciplineTests.rootTouchesOnlyGrantedModuleSurfaces`
- [ ] **AC-4:** Given a class inside a module that depends on a type sitting directly in the base
  package, when the new module→root rule runs, then it is reported; and a module class that reaches
  no root type is not. *Seam:* the parameterized collector over `ai.riviera.modulefixture` ·
  *Pinned by:* `CompositionRootDisciplineTests.moduleReachingTheRootIsRejected` +
  `.moduleAvoidingTheRootIsAccepted` + `.noModuleReachesTheRoot`
- [ ] **AC-5:** Given a production class outside `challenge` whose bytecode carries the whole word
  `challenge_registry`, when the sole-writer scan runs, then it is reported; the module's own adapter
  is not. *Seam:* the parameterized collector over `ai.riviera.responsibilityfixture` ·
  *Pinned by:* `ResponsibilitiesArchitectureTests.challengeRegistryTableIsTouchedOnlyInsideTheChallengeModule`,
  `.theChallengeModuleItselfWritesTheTable`, `.outsideChallengeRegistryWriterFixtureIsRejected`
- [ ] **AC-6:** Given `challenge_registry` under an `ACCESS EXCLUSIVE` lock, when the sweep's entry
  statement runs, then it is cut off by its own finite `queryTimeout` rather than by the lock being
  released. *Seam:* `challenge.application.ChallengeRegistry#deleteExpiredBefore` ·
  *Pinned by:* `ScheduledQueryTimeoutIT.everyScheduledEntryQueryIsBounded`
- [ ] **AC-7:** Given the ALTCHA implementation over an in-memory registry, when a payload is
  verified, then a right one is `VERIFIED` and claimed, its second submission is `REPLAYED`, a forged
  or tampered signature and a wrong answer are `INVALID`, and a past `expiresAt` is `EXPIRED`; and a
  freshly issued challenge carries the configured algorithm, cost and clock-derived expiry, distinct
  per call. *Seam:* `challenge.api.ProofOfWorkChallenges` ·
  *Pinned by:* `AltchaProofOfWorkChallengesTest`
- [ ] **AC-8:** Given the fenced `POST /api/auth/customer/register`, when the port answers each of the
  four verdicts, then the filter maps them to `CHALLENGE_REQUIRED` / `CHALLENGE_INVALID` /
  `CHALLENGE_EXPIRED` exactly as before and lets `VERIFIED` through; an unfenced route ignores the
  header. *Seam:* the HTTP route through `ChallengeVerificationFilter` ·
  *Pinned by:* `ChallengeVerificationFilterTest`
- [ ] **AC-9:** Given real Postgres, when a challenge minted by `GET /api/auth/challenge` is solved
  and posted to register, then the account is created; a missing, tampered, expired or replayed
  solution is refused with its code and writes nothing, two concurrent submissions of one solution
  admit exactly one, and a refused submission still spends the register budget.
  *Seam:* the HTTP routes end to end · *Pinned by:* `CustomerRegisterChallengeIT`
- [ ] **AC-10:** Given `riviera.altcha.enabled=false`, when the fenced route is posted to without a
  header and the challenge endpoint is fetched, then the write is admitted and the endpoint answers
  `204`. *Seam:* the HTTP routes · *Pinned by:* `AltchaDisabledTest`
- [ ] **AC-11:** Given the shipped `application.properties`, when `riviera.altcha.*` is bound, then the
  values, the env-supplied secret and every tuning bound are exactly what they are today.
  *Seam:* `challenge.application.AltchaProperties` · *Pinned by:* `AltchaPropertiesBindingTest`
- [ ] **AC-12:** Given the production classpath, when the scheduled-work and endpoint-gate rules run,
  then `ChallengeRegistrySweep#sweep` and `GET /api/auth/challenge` are still found with those exact
  names and both files are unchanged in the diff. *Seam:* the `@Scheduled` scan / the MVC handler
  mapping · *Pinned by:* `ScheduledWorkArchitectureTest.everyScheduledJobHasAThreadOfItsOwn`,
  `EndpointRoleGateCoverageTest`
- [ ] **AC-13:** Given the merged diff, when the substrate docs are read, then `RESPONSIBILITIES.md`
  (§ *Platform edge*, new § `challenge`, § `shared`), `CLAUDE.md`, `docs/architecture/domain-model.md`,
  `riviera-modulith` (SKILL + `references/boundaries.md`) and ADR-0017's *Status* line all describe two
  non-context modules and the fence/mechanism split, and no counting-sweep site still says "nine
  modules … plus `shared`". *Seam:* the substrate docs · *Verified by:* `riviera-docs-freshness` over
  the PR range (recorded in Execution status)

## Non-goals

- No behaviour change of any kind: no new fenced route (#906/#907 own those), no wording, code,
  header, property, default or schema change.
- No Flyway migration, and no change to `V49__challenge_registry.sql`.
- No frontend change and no `docs/deploy/` change.
- No move of the fence (`ChallengeVerificationFilter`, `FENCED_POSTS`, the three problem bodies,
  `RequestPaths`, `RateLimitFilter`, `SecurityConfig`'s registration) into the module.
- No shared test-support package: `ChallengeSolving` is owned by the module's test tree (see
  *Resolved* Q-3), not promoted to a cross-cutting helper package.
- No widening of `shared`; the module depends on nothing.

## Behavior-parity ledger

> The slice replaces the root-package placement of an existing, shipped surface. Every behaviour
> below is **preserved**; the rows exist because "a pure move" is aspirational until checked one
> behaviour at a time, and three of them are only preserved because this ledger caught them.

| Old-surface behavior | Verdict | How the new placement keeps it |
|---|---|---|
| `GET /api/auth/challenge` returns a signed v2 challenge, `no-store`, no session | preserved | `ChallengeController` moves package with `PATH` and body untouched; `@WebMvcTest` still scans it (controllers are picked up anywhere under the app base package) |
| `204` from that endpoint when `riviera.altcha.enabled=false` | preserved | `AltchaDisabledTest` unchanged; the web-slice stub port reads `${riviera.altcha.enabled:true}` so the slice still drives the switch (**would have been lost** — the real properties bean is no longer bound in a `@WebMvcTest` once `SecurityConfig` stops enabling it) |
| Every challenge is a fresh nonce | preserved | the stub port mints a distinct body per call, so `ChallengeEndpointTest.everyChallengeIsFresh` still proves the controller caches nothing; the *signed, ten-minute, right-cost* half moves to `AltchaProofOfWorkChallengesTest` (**would have been lost** to a constant-returning fake) |
| A solved challenge reaches the controller once only | preserved | the stub port claims each payload once and answers `REPLAYED` on the second, so the web-slice proof survives verbatim; the real single-use claim stays proven by `AltchaProofOfWorkChallengesTest` and `CustomerRegisterChallengeIT` (**would have been lost** — `WebSliceStubs` loses its `ChallengeRegistry` bean) |
| The challenge GET rides its own per-IP rate-limit budget | preserved | `RateLimitFilter` stays in the root and keys on its own `/api/auth/challenge` literal instead of `ChallengeController.PATH` |
| `X-Altcha-Payload` missing/blank → `CHALLENGE_REQUIRED`; invalid → `CHALLENGE_INVALID`; expired or replayed → `CHALLENGE_EXPIRED`; verified → through | preserved | `ChallengeVerificationFilter` stays in the root, unchanged but for the two imports |
| A refused solution still spends its rate-limit token; a `429` wins over a challenge refusal | preserved | filter ordering in `SecurityConfig` is untouched |
| Each solved challenge is accepted exactly once across instances and restarts | preserved | `JdbcChallengeRegistry`'s `INSERT … ON CONFLICT DO NOTHING` moves package, SQL byte-for-byte |
| The sweep deletes rows past the clock-skew allowance, on a bounded client | preserved | `ChallengeRegistrySweep` moves package with its `@Scheduled` placeholders; the bound becomes a `@Value` read of the same property, and gains the `ScheduledQueryTimeoutIT` entry it never had |
| A blank `RIVIERA_ALTCHA_HMAC_SECRET` warns and signs with a boot-time key | preserved | the implementation class moves and is renamed only so the port keeps the name |
| `riviera.altcha.*` keys, defaults and validation bounds | preserved | `AltchaProperties` moves package unchanged; `AltchaPropertiesBindingTest` moves with it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The move silently drops a #911 proof (a fake port answers a constant where the real one was exercised) | high | high | the behaviour-parity ledger above, row by row; the stub port is deliberately stateful (fresh body per call, single-use claim) so the three at-risk proofs survive at the web slice | claude | **closed** — the three at-risk proofs survive; counts in phase 1 step 4 |
| R-2 | The new module→root rule goes red on *existing* module code, turning a net into a refactor | med | high | pre-checked before planning: zero `import ai.riviera.platform.<RootType>` and zero fully-qualified root references across all ten module trees; the rule is proven against `ai.riviera.modulefixture`, never against production | claude | **closed** — phase 0 green over production |
| R-3 | `challenge_registry`'s whole-word scan false-positives on the module's own package name | low | med | the token is `challenge_registry`, not `challenge`; the scan is the existing whole-word `containsWholeWord` primitive; a fixture module adapter proves the exclusion path | claude | **closed** — fixture-proven both ways in phase 2 |
| R-4 | The module ends up depending on the root (`ScheduledQueryTimeout`, `Clock`) and `verify()` or the new rule fails | med | high | `JdbcChallengeRegistry` swaps to `@Value("${riviera.scheduled.query-timeout-seconds}")` (the `JdbcBookings` / `JdbcAccountErasure` precedent) in the same phase as the move; `Clock` is `java.time`, not a root type | claude | **closed** — `@Value` swap landed with the move; net green |
| R-5 | `@WebMvcTest` no longer binds `AltchaProperties` once `SecurityConfig` stops enabling it, so a slice silently loses its kill switch | med | med | the slice no longer needs the properties at all — it fakes the port; the switch is driven by `@Value` on the stub (ledger row 2) | claude | **closed** — `AltchaDisabledTest` green, unchanged |
| R-6 | The scheduled-work and endpoint-gate nets pass for the wrong reason after the move | low | high | both key on simple names / paths the move keeps (verified: `KNOWN_SCHEDULED_JOBS` holds `"ChallengeRegistrySweep#sweep"`, `DECLARED_REACHABLE` holds `"GET /api/auth/challenge"`); AC-12 requires both files to be **unchanged** in the diff | claude | open |
| R-7 | A green `ScheduledQueryTimeoutIT` entry proves nothing (it is green on arrival — the bound already exists) | med | med | falsify by hand: temporarily drop the bounded client in `JdbcChallengeRegistry`, watch the new assertion fail, restore; record the falsification in the phase | claude | **closed** — falsified in phase 2 of this phase's steps |
| R-8 | Sonar counts the moved code as new code and reports it uncovered or duplicated | med | med | the tests move with their subject, so coverage moves too; the moved bodies are byte-identical to `main`, and the one genuinely new block (the stub port) is exercised by three slices | claude | open |
| R-9 | Flyway version collision with in-flight work | none | — | no migration in this slice; and there are zero open PRs on the repo at plan time | claude | closed — N/A |

## Open questions / Assumptions

- *(empty — the four questions the intake grill raised were all answerable from the code and are
  recorded below.)*

### Resolved

- **Q-1 — Does the proposed "no module depends on a root type" rule pass against today's production
  code?** Yes. `grep` for `^import ai\.riviera\.platform\.(<every root simple name>);` and for any
  fully-qualified `ai.riviera.platform.[A-Z]` reference across all ten module trees returns nothing.
  The rule ships as a net over a clean population, not as a refactor. (Grill, pre-plan.)
- **Q-2 — Which package do the relocated tests actually go in?** The issue says "move to
  `ai.riviera.platform.challenge`"; the repo convention is that a module's tests mirror its
  production package (`booking/adapter/out/…`, `customer/application/…`), and package-private
  visibility requires it — a test in the module root cannot see a package-private
  `ChallengeRegistrySweep` in `adapter/in`. Resolution: mirror the production package
  (`challenge/application/`, `challenge/adapter/in/`, `challenge/adapter/out/`), with the shared
  `ChallengeSolving` helper at the module test root. This *narrows* the visibility the slice has to
  widen. (Grill, pre-plan.)
- **Q-3 — Does `ChallengeSolving` warrant a shared test-support package?** No. Its only consumers are
  the module's own tests and two root ITs; a root test may reach a module's test tree freely (no rule
  polices test scope), so one `public` helper in `ai.riviera.platform.challenge` is the whole need.
  A shared package would be "code used in more than one place", which is explicitly *not* an
  admission ground here (`RESPONSIBILITIES.md` §`shared`). (Grill, pre-plan.)
- **Q-4 — What visibility do the module's internals need?** `ChallengeRegistry` and `AltchaProperties`
  become `public` (the `booking.application.Bookings` and `venue.application.VenueCreationProperties`
  precedent) because `adapter/in`, `adapter/out` and `ScheduledQueryTimeoutIT` are in other packages.
  Public in `application/` is **not** publication: `application` is not a `@NamedInterface`, so
  Modulith still refuses every other module, and `CompositionRootDisciplineTests`' grant row still
  refuses the root. Everything else stays package-private. (Grill, pre-plan.)

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches no booking, beach-map or
`availability(set_id, booking_date)` write path; the only claim it moves is
`challenge_registry(challenge_id)`, which guards challenge single-use, not inventory. That claim's
`INSERT … ON CONFLICT DO NOTHING` idiom and its `V49` primary key are unchanged and stay pinned by
`ChallengeRegistryMigrationIT` and `CustomerRegisterChallengeIT.concurrentReplayAdmitsExactlyOne`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `challenge` | **new** (non-context) | none — the mechanism owns a claim table, not an aggregate | ADR-0017: a port-fronted mechanism no bounded context owns is a closed non-context module. Evans' *Cohesive Mechanism* — a separate lightweight framework (ALTCHA + a single-use registry) behind an intention-revealing interface |
| M-2 | *(the root, not a module)* | existing | — | keeps the **fence**: which routes are fenced, the filter and its ordering, the problem bodies, the rate-limit budget, the filter-chain registration |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `challenge.api` | `ProofOfWorkChallenges#enabled()` / `#issue()` / `#verify(String)` | `challenge.vocabulary.ChallengeVerdict` | the composition root only (`SecurityConfig` wires it, `ChallengeVerificationFilter` calls it, `ChallengeController` — inside the module — calls it) |

Internal, deliberately **not** published: `challenge.application.ChallengeRegistry`, the outbound
port only the module's own `adapter/out` implements — one adapter is a hypothetical seam
(`codebase-design`), so it is neither `api` (nobody else calls it) nor `spi` (no other module
implements it). `allowedDependencies = {}`: the module reaches no module, not even `shared`.

**Domain events (id-based payloads, invariant #11)**

N/A — the module publishes and consumes no events, and none of the eight existing events change. No
Flyway `event_type` rewrite is needed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Issue signed ALTCHA v2 challenges | `challenge` | new § `challenge` **Job**: "issue signed ALTCHA v2 challenges". Not the root's: ADR-0017 splits fence (edge) from mechanism (module) |
| Verify a widget's solution and answer a verdict | `challenge` | same **Job** line. Not `customer`'s — its Not-My-Job keeps login/abuse machinery out of the module (§ *Platform edge*) |
| Accept each solution exactly once via the `challenge_registry` claim | `challenge` | same **Job** line; the module is the table's only writer, machine-checked by `ResponsibilitiesArchitectureTests` |
| Sweep expired registry rows | `challenge` | same **Job** line; the sweep is the mechanism's own housekeeping, not platform-edge policy |
| Expose `GET /api/auth/challenge` | `challenge` | same **Job** line — a driving adapter for the module's own port; the root keeps the *route policy* (`permitAll`, the rate-limit budget), which is its **Job** |
| Decide which routes are fenced; the filter and its ordering; the three problem bodies | **root (platform edge)** | new § `challenge` **Not my job** names all three; § *Platform edge* keeps the filter-chain problem bodies and route policy at the edge |
| Rate-limit the challenge GET | **root (platform edge)** | new § `challenge` **Not my job**: "rate limiting (`RateLimitFilter`, root)" |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves, no Stripe call, no ledger row, no refund.

## Angular — frontend surfaces touched

N/A — backend-only. `frontend/` is untouched; the widget keeps calling the same path with the same
header and reading the same problem codes (AC-9 proves the contract end to end).

## FE↔BE contract

N/A — no contract change. `GET /api/auth/challenge`, `X-Altcha-Payload`, `CHALLENGE_REQUIRED` /
`CHALLENGE_INVALID` / `CHALLENGE_EXPIRED`, `riviera.altcha.*`, `RIVIERA_ALTCHA_HMAC_SECRET` and the
`V49` schema are byte-for-byte unchanged.

## Execution status

**Stage pointer:** `implement — phase 3 done, entering phase 4 (docs)`

**Next action:** Phase 4 — apply the issue's verbatim substrate-doc edits, run
`riviera-docs-freshness` over `origin/main..HEAD`, retire the spine plan, point ADR-0017 at PR #916.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the module→root fitness function | ✅ | (this phase's commit) |
| 1 — the move (module in, fence stays, tests relocated) | ✅ | (this phase's commit) |
| 2 — `challenge_registry` sole-writer rule | ✅ | (this phase's commit) |
| 3 — the sweep's `DELETE` joins the bounded-entry list | ✅ | (this phase's commit) |
| 4 — docs, ADR-0017 status, plan retirement | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| | | *(none yet)* | |

---

## File structure

**Created — production**

- `platform/src/main/java/ai/riviera/platform/challenge/package-info.java` — `@ApplicationModule(displayName = "Proof-of-work challenge", allowedDependencies = {})`
- `platform/src/main/java/ai/riviera/platform/challenge/api/package-info.java` — `@NamedInterface("api")`
- `platform/src/main/java/ai/riviera/platform/challenge/api/ProofOfWorkChallenges.java` — the one published port
- `platform/src/main/java/ai/riviera/platform/challenge/vocabulary/package-info.java` — `@NamedInterface("vocabulary")`
- `platform/src/main/java/ai/riviera/platform/challenge/vocabulary/ChallengeVerdict.java` — the published verdict enum
- `platform/src/main/java/ai/riviera/platform/challenge/application/AltchaProofOfWorkChallenges.java` — the ALTCHA implementation of the port
- `platform/src/main/java/ai/riviera/platform/challenge/application/AltchaProperties.java` — `riviera.altcha.*`
- `platform/src/main/java/ai/riviera/platform/challenge/application/ChallengeRegistry.java` — the internal outbound port
- `platform/src/main/java/ai/riviera/platform/challenge/adapter/in/ChallengeController.java` — `GET /api/auth/challenge`
- `platform/src/main/java/ai/riviera/platform/challenge/adapter/in/ChallengeRegistrySweep.java` — the `@Scheduled` sweep
- `platform/src/main/java/ai/riviera/platform/challenge/adapter/in/ChallengeConfig.java` — enables the properties + scheduling
- `platform/src/main/java/ai/riviera/platform/challenge/adapter/out/JdbcChallengeRegistry.java` — the only writer of `challenge_registry`

**Deleted — production (moved into the module)**

- `platform/src/main/java/ai/riviera/platform/ProofOfWorkChallenges.java`
- `platform/src/main/java/ai/riviera/platform/ChallengeVerdict.java`
- `platform/src/main/java/ai/riviera/platform/ChallengeRegistry.java`
- `platform/src/main/java/ai/riviera/platform/AltchaProperties.java`
- `platform/src/main/java/ai/riviera/platform/ChallengeController.java`
- `platform/src/main/java/ai/riviera/platform/ChallengeRegistrySweep.java`
- `platform/src/main/java/ai/riviera/platform/JdbcChallengeRegistry.java`

**Modified — production (the fence)**

- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — injects the port, drops the issuer/verifier `@Bean` and `AltchaProperties` from `@EnableConfigurationProperties`, names the challenge path by its own literal
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — names the challenge path by its own literal
- `platform/src/main/java/ai/riviera/platform/ChallengeVerificationFilter.java` — imports the port + verdict from the module
- `platform/src/main/java/ai/riviera/platform/SecurityProblemResponses.java` — Javadoc only, if a moved test name needs re-pointing

**Created — tests**

- `platform/src/test/java/ai/riviera/platform/challenge/ChallengeSolving.java` — the public solving/forging helper the module owns
- `platform/src/test/java/ai/riviera/platform/challenge/application/AltchaProofOfWorkChallengesTest.java` — issue + the four verdicts + the replay proof
- `platform/src/test/java/ai/riviera/platform/challenge/application/AltchaPropertiesBindingTest.java`
- `platform/src/test/java/ai/riviera/platform/challenge/adapter/in/ChallengeRegistrySweepIT.java`
- `platform/src/test/java/ai/riviera/platform/challenge/adapter/out/ChallengeRegistryMigrationIT.java`
- `platform/src/test/java/ai/riviera/modulefixture/package-info.java` — the module→root negative-proof tree
- `platform/src/test/java/ai/riviera/modulefixture/RootShapedType.java` — a type sitting directly in the fixture base
- `platform/src/test/java/ai/riviera/modulefixture/challenge/adapter/out/ModuleReachingRoot.java` — the violation
- `platform/src/test/java/ai/riviera/modulefixture/challenge/adapter/out/ModuleAvoidingRoot.java` — the positive control
- `platform/src/test/java/ai/riviera/responsibilityfixture/rogue/adapter/out/RogueChallengeRegistryWriter.java` — the sole-writer violation
- `platform/src/test/java/ai/riviera/responsibilityfixture/challenge/adapter/out/FixtureJdbcChallengeRegistry.java` — the exclusion path

**Deleted — tests (moved into the module)**

- `platform/src/test/java/ai/riviera/platform/ChallengeSolving.java`
- `platform/src/test/java/ai/riviera/platform/AltchaPropertiesBindingTest.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeRegistrySweepIT.java`
- `platform/src/test/java/ai/riviera/platform/ChallengeRegistryMigrationIT.java`

**Modified — tests**

- `platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java` — the `challenge` grant row + the module→root rule
- `platform/src/test/java/ai/riviera/platform/ResponsibilitiesArchitectureTests.java` — the `challenge_registry` sole-writer rule
- `platform/src/test/java/ai/riviera/platform/ScheduledQueryTimeoutIT.java` — the sweep's `DELETE` joins the entry statements
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the `ChallengeRegistry` bean becomes a stub `ProofOfWorkChallenges` port
- `platform/src/test/java/ai/riviera/platform/ChallengeEndpointTest.java` — asserts the endpoint's contract through the stub port
- `platform/src/test/java/ai/riviera/platform/ChallengeVerificationFilterTest.java` — asserts the filter's verdict→problem mapping through the stub port
- `platform/src/test/java/ai/riviera/platform/CustomerRegisterChallengeIT.java` — imports `ChallengeSolving` from the module
- `platform/src/test/java/ai/riviera/platform/SessionLoginSupport.java` — its `solvedChallenge` helper imports `ChallengeSolving` from the module (the second root consumer, found by the compiler)
- `platform/src/test/java/ai/riviera/platform/AltchaDisabledTest.java` — unchanged if the stub honours the switch; listed because the phase may touch it
- `platform/src/test/java/ai/riviera/platform/ModularityTests.java` — Javadoc count
- `platform/src/test/java/ai/riviera/platform/PackageShapeArchitectureTests.java` — Javadoc count

**Modified — docs**

- `RESPONSIBILITIES.md` — § *Platform edge* (two edits), new § `challenge`, § `shared` clause
- `CLAUDE.md` — § *Bounded contexts* (the second non-context module) + the *Platform edge* summary line
- `docs/architecture/domain-model.md` — the module count
- `docs/adr/ADR-0017-non-context-module-for-edge-mechanisms.md` — *Status* line gets the merged PR
- `.claude/skills/riviera-modulith/SKILL.md` — the module census + the FULL/no-`domain` note
- `.claude/skills/riviera-modulith/references/boundaries.md` — the module census
- `docs/plans/altcha-challenge-spine.md` — **deleted** (its PR #911 merged; inherited close-out item)
- `docs/plans/challenge-non-context-module.md` — this plan

---

## Phase 0 — The module→root fitness function

**Files:** Create `platform/src/test/java/ai/riviera/modulefixture/…` (4 files) · Modify
`platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java`

Spring Modulith cannot supply this rule: `allowedDependencies = {}` constrains what a module reaches
*in other modules*, and code sitting directly in the base package is "not assigned to any module",
which `verify()` permits. It ships first so the move in phase 1 lands on a live net.

- [x] **Step 1: Write the failing tests** — `moduleReachingTheRootIsRejected` (expects a violation
  naming `ModuleReachingRoot` and `RootShapedType`), `moduleAvoidingTheRootIsAccepted` (expects none
  naming `ModuleAvoidingRoot`), and `noModuleReachesTheRoot` over production classes, plus the
  fixture tree under `ai.riviera.modulefixture`.
- [x] **Step 2: Falsify it** — the rule is added to an already-clean population (R-2), so the honest
  red step is a falsification rather than a compile error: with the collector's package test pointed
  at a package nothing lives in, `gradle test --tests "*CompositionRootDisciplineTests*"` → FAIL,
  `moduleReachingTheRootIsRejected()`; restored → 6 tests, PASS.
- [x] **Step 3: Minimal implementation** — a second parameterized collector in the same class: for
  each type **inside** a module (`moduleOf(type, base) != null`, not `package-info`), report any
  direct dependency whose target sits **directly** in `base` (`segmentsBelow(...).length == 0` and
  the package equals `base`). Reuse `ArchitectureTestSupport`'s arithmetic and `assertNoViolations`.
- [x] **Step 4: Run it, verify it passes** — same command → PASS (6 tests), green over production
  with `moduleClassesInspected() > 0` proving the scan is not vacuous.
- [x] **Step 5: Generalization-audit pass** — recorded below.
- [x] **Step 6: Commit** — `git commit -m "Pin that no module depends on a root type (#913)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The move

**Files:** the twelve created production files · the seven deleted ones · the four modified fence
files · the relocated + rewritten tests · `CompositionRootDisciplineTests` (grant row)

- [x] **Step 1: Write the failing test** — `challenge/application/AltchaProofOfWorkChallengesTest`
  against the new package and type names: a fresh challenge carries the configured algorithm/cost and
  the clock-derived expiry and differs per call; a solved payload is `VERIFIED` then `REPLAYED`; a
  forged secret, a tampered signature and an off-by-one counter are `INVALID`; a past `expiresAt` is
  `EXPIRED` (AC-7). Add the module's `package-info` grant row expectation to
  `CompositionRootDisciplineTests` in the same step.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*AltchaProofOfWorkChallengesTest*"`
  → FAIL, `error: package ai.riviera.platform.challenge.vocabulary does not exist`.
- [x] **Step 3: Minimal implementation** — create the module (`git mv` each file, then adjust package,
  visibility and Javadoc): the port in `api/`, the enum in `vocabulary/`, the renamed implementation +
  properties + registry port in `application/`, controller + sweep + `ChallengeConfig` in `adapter/in`,
  the JDBC adapter in `adapter/out` with `@Value("${riviera.scheduled.query-timeout-seconds}")`
  replacing the `ScheduledQueryTimeout` injection (R-4). Trim the fence: `SecurityConfig` injects the
  port and stops constructing/enabling; `SecurityConfig` and `RateLimitFilter` use their own path
  literal. Relocate `ChallengeSolving`, `AltchaPropertiesBindingTest`, `ChallengeRegistrySweepIT`,
  `ChallengeRegistryMigrationIT`; rewrite `WebSliceStubs` to serve a stateful stub port and rewrite
  `ChallengeEndpointTest` / `ChallengeVerificationFilterTest` against it, per the parity ledger.
- [x] **Step 4: Run it, verify it passes** — the structural net first
  (`./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*"
  --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*"
  --tests "*CompositionRootDisciplineTests*"`), then the challenge surface
  (`--tests "*Challenge*" --tests "*Altcha*" --tests "*ScheduledWorkArchitectureTest*"
  --tests "*EndpointRoleGateCoverageTest*"`) → PASS. Counts, none skipped: structural net green;
  `AltchaProofOfWorkChallengesTest` 10, `AltchaPropertiesBindingTest` 8, `ChallengeVerificationFilterTest` 6,
  `ChallengeEndpointTest` 3, `AltchaDisabledTest` 2, `EndpointRoleGateCoverageTest` 1,
  `ChallengeRegistrySweepIT` 2, `ChallengeRegistryMigrationIT` 2, `CustomerRegisterChallengeIT` 7.
- [x] **Step 5: Generalization-audit pass** — recorded below.
- [x] **Step 6: Commit** — `git commit -m "Move the proof-of-work challenge mechanism into the closed challenge module (#913)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — `challenge_registry` sole-writer

**Files:** Modify `ResponsibilitiesArchitectureTests` · Create the two `responsibilityfixture` classes

- [x] **Step 1: Write the failing tests** — `challengeRegistryTableIsTouchedOnlyInsideTheChallengeModule`,
  the non-vacuity guard `theChallengeModuleItselfWritesTheTable`, and the fixture proof
  `outsideChallengeRegistryWriterFixtureIsRejected` (rejects `RogueChallengeRegistryWriter`, does not
  flag `FixtureJdbcChallengeRegistry`) — AC-5.
- [x] **Step 2: Falsify it** — pointing `CHALLENGE_REGISTRY_TABLE` at a token nothing carries fails
  both `outsideChallengeRegistryWriterFixtureIsRejected()` and `theChallengeModuleItselfWritesTheTable()`
  (18 tests, 2 failed); restored → 18 tests, PASS.
- [x] **Step 3: Minimal implementation** — a `challengeRegistryViolations(JavaClasses, base)` collector
  keyed on the existing whole-word `containsWholeWord` bytecode scan, module `challenge`, token
  `challenge_registry`; extend the class Javadoc's numbered rule list.
- [x] **Step 4: Run it, verify it passes** — same command → PASS (18 tests, none skipped).
- [x] **Step 5: Generalization-audit pass** — recorded below.
- [x] **Step 6: Commit** — `git commit -m "Pin challenge as the sole writer of challenge_registry (#913)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — The sweep's `DELETE` joins the bounded-entry list

**Files:** Modify `platform/src/test/java/ai/riviera/platform/ScheduledQueryTimeoutIT.java`

This entry is **green on arrival** — the bound already exists — so it is a regression net, not a bug
fix, and TDD's red step is replaced by an explicit falsification (R-7). Say so in the commit body.

- [x] **Step 1: Add the assertion** — autowire `challenge.application.ChallengeRegistry`, add
  `assertBounded("the challenge sweep's expired-row DELETE", readWhileLocked("challenge_registry",
  () -> registry.deleteExpiredBefore(now)))` to `everyScheduledEntryQueryIsBounded` (AC-6).
- [x] **Step 2: Falsify it** — pointing `deleteExpiredBefore` at the shared client makes
  `everyScheduledEntryQueryIsBounded()` fail with `the read on challenge_registry was still blocked
  after PT15S — it is unbounded, so a wedged query would pin this scheduled job's thread and
  connection indefinitely (#395)`; restored → 2 tests, none skipped, PASS.
- [x] **Step 3: Run it, verify it passes** — same command → PASS.
- [x] **Step 4: Generalization-audit pass** — recorded below.
- [x] **Step 5: Commit** — `git commit -m "Bound-check the challenge sweep's DELETE in ScheduledQueryTimeoutIT (#913)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Docs, ADR status, plan retirement

**Files:** `RESPONSIBILITIES.md` · `CLAUDE.md` · `docs/architecture/domain-model.md` ·
`docs/adr/ADR-0017-non-context-module-for-edge-mechanisms.md` ·
`.claude/skills/riviera-modulith/SKILL.md` + `references/boundaries.md` ·
`docs/plans/altcha-challenge-spine.md` (deleted) · this plan

- [ ] **Step 1: Apply the issue's verbatim doc edits** — § *Platform edge*'s opening sentence and its
  *Proof-of-work challenge* paragraph, the new § `challenge` after § `shared`, the § `shared` naming
  clause, the `CLAUDE.md` additions, the module-count sites (AC-13).
- [ ] **Step 2: Run `riviera-docs-freshness` over the PR range** including the counting sweep for
  "nine modules … plus `shared`"; fix everything it finds, record the range + finding count in
  *Skills consulted* and Execution status.
- [ ] **Step 3: Retire `docs/plans/altcha-challenge-spine.md`** (`git rm`) — the inherited #911/#915
  close-out item; confirm no committed file cites its path.
- [ ] **Step 4: Point ADR-0017's *Status* line at this slice's PR.**
- [ ] **Step 5: Verify the file-structure guard** — `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean.
- [ ] **Step 6: Commit** — `git commit -m "Reconcile the substrate docs with the challenge module; retire the spine plan (#913)"`
- [ ] **Step 7: Finalize Execution status** in the PR's own last commit, citing `merged via PR #NN`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-03 | phase 0 — a new module/root direction rule | every fitness function that classifies a type as root-vs-module via the shared package arithmetic | `grep -rln 'moduleOf(' platform/src/test/java/ai/riviera/platform/` | `CompositionRootDisciplineTests`, `ResponsibilitiesArchitectureTests`, `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `ArchitectureTestSupport` | the new rule goes in `CompositionRootDisciplineTests` (the only one about the root↔module *edge*); the other three classify placement, not direction, and need nothing. No new arithmetic — `moduleOf`/`isPackageInfo` reused, so `ArchitectureTestSupport` is untouched |
| 2026-09-03 | phase 1 — the move | every production class outside the new module whose source still names the challenge (the mechanism, not PKCE's `SsoAuthorizationChallenge`) | `grep -rln -iE 'challenge\|altcha' --include=*.java . --exclude-dir=challenge --exclude-dir=<each module>` over `platform/src/main/java/ai/riviera/platform` | 13 files: the six SSO classes (PKCE's unrelated "challenge" — untouched), and `SecurityConfig`, `RateLimitFilter`, `RateLimitProperties`, `SecurityProblemResponses`, `ChallengeVerificationFilter` | exactly the intended fence set, plus `RateLimitProperties` which holds the budget `RateLimitFilter` spends — the same edge responsibility, one file further out. A second sweep for module-owned identifiers (`ProofOfWorkChallenges\|ChallengeVerdict\|ChallengeRegistry\|AltchaProperties\|ChallengeController`) outside the module returns only the granted `challenge.api` port in `SecurityConfig` and `ChallengeVerificationFilter` |
| 2026-09-03 | phase 2 — a fifth sole-writer rule | every table or column set `RESPONSIBILITIES.md` claims a sole writer for, and whether each claim is machine-checked | `grep -n -iE 'only writer\|sole.writer' RESPONSIBILITIES.md` | four claims, all already checked (`set_availability`, the `review` table, `rating_tenths`/`reviews_count`) plus the new `challenge_registry` | nothing left unguarded — the sweep's real finding is that the *evidence table* at `RESPONSIBILITIES.md` line ~965 lists one row per machine-checked claim, so `challenge_registry` needs a row there; folded into phase 4 |
| 2026-09-03 | phase 3 — a scheduled entry statement was never bound-checked | every `@Scheduled` method in production and whether its entry statement appears in `everyScheduledEntryQueryIsBounded` | `grep -rl '@Scheduled' platform/src/main/java --include=*.java` then the entry method of each | 6 jobs: `AbandonedBookingScheduler#sweep`, `RequestSweepScheduler#sweep`, `GuestContactRetentionScheduler#sweep`, `NoShowSweepScheduler#sweep`, `MoneyPathAlertCheck#check`, `ChallengeRegistrySweep#sweep` | the challenge sweep was the only one absent from the assertion list (its bound existed, the regression net did not); the alert check has its own case above it. Six jobs, six covered — the gap the sweep found is closed, and `ScheduledWorkArchitectureTest`'s `KNOWN_SCHEDULED_JOBS` already listed all six |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5, AC-12:** `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*CompositionRootDisciplineTests*" --tests "*ResponsibilitiesArchitectureTests*" --tests "*ScheduledWorkArchitectureTest*" --tests "*EndpointRoleGateCoverageTest*"` → PASS.
- [ ] **AC-6, AC-9, AC-11:** `./gradlew test --tests "*ScheduledQueryTimeoutIT*" --tests "*CustomerRegisterChallengeIT*" --tests "*AltchaPropertiesBindingTest*"` → PASS (Docker required).
- [ ] **AC-7, AC-8, AC-10:** `./gradlew test --tests "*AltchaProofOfWorkChallengesTest*" --tests "*ChallengeVerificationFilterTest*" --tests "*ChallengeEndpointTest*" --tests "*AltchaDisabledTest*"` → PASS.
- [ ] **AC-13:** `riviera-docs-freshness` over the PR range → no remaining staleness; `git diff origin/main -- frontend docs/deploy platform/src/main/resources/db` → empty.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified N/A; no availability write path touched (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched: the sweep still reasons in UTC `Instant` (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] **No Flyway migration** — schema unchanged, so invariant #12 is satisfied by `V49` staying byte-for-byte.
- [ ] **Frontend** untouched — `git diff origin/main -- frontend` is empty.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
