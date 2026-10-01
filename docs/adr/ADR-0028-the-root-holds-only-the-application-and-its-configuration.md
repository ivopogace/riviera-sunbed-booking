# ADR-0028: The root package holds only the application and its configuration; login, the HTTP boundary, the remodel composition and monitoring become closed modules, and `shared` a closed, registered shared module

- **Status:** Accepted — decided by the owner 2026-10-01 (issue #1317). This document is the whole
  of #1317's own PR. The moves are the pure-move slices #1325–#1329, sequenced in Decision 9. Amends ADR-0007
  Amendment 2 (`shared` is closed and registered) and ADR-0017 Decision 1 (the fence is `web`'s, not
  the root's), and supersedes ADR-0020 Decision 1 on *placement* only. Each carries a dated pointer.
- **Date:** 2026-10-01
- **Relates to:** ADR-0007 (module templates), ADR-0016/ADR-0017 (fence vs mechanism; `challenge`
  and `audit` are unchanged), ADR-0020 (the remodel composition), invariants #7, #11, #13,
  `RESPONSIBILITIES.md` § `shared` and § *Platform edge*, the structural net, and these fitness
  functions: `CompositionRootDisciplineTests`, `CustomerAuthPlacementTests`,
  `OperatorAuthPlacementTests`, `SessionWriterArchitectureTests`, `ErrorContractArchitectureTests`.
  Evidence: `docs/research/2026-10-01-modulith-root-package-and-module-detection.md` (cited below as
  "the note", with its section numbers).

## Context

The root package `ai.riviera.platform` holds 65 classes, 64 of them package-private:

- about 30 for login, sessions, SSO, credentials and recovery (#1306 added three);
- the security chain and its filters;
- the remodel composition (ADR-0020);
- the admin and erasure controllers;
- the observability jobs;
- `PlatformApplication` and four config classes.

The owner asked whether the login machinery should have a package of its own (#1317), and then, once
the evidence was in, whether the root should hold more than the application at all.

What Spring Modulith 2.1 does with this (the note §1–§3):

- **The root is already verified, as a hidden module.** Since 1.1 the root package is a synthetic
  `root:ai.riviera.platform` module. `verify()` rejects root code that reaches a module's internals
  and root ↔ module cycles. It does not check a module depending on root code. Our
  `CompositionRootDisciplineTests` adds what is missing: which surfaces the root may use, and
  nothing reaching the root.
- **Root beans load in every `@ApplicationModuleTest`,** so `PayoutModuleTest` mocks the whole
  root chain's collaborators.
- **A direct sub-package is always a top-level module.** The only way to keep one out
  (`explicitly-annotated`, a custom strategy, or the ignore predicate) leaves its code checked by
  nothing and loaded by no module test. That is worse than the root.

What the maintainer and the reference projects do (the note §4):

- Drotbohm's answer for filters and other cross-cutting code is "a `core` module" registered in
  `@Modulithic(sharedModules)`.
- In his projects (Restbucks, Salespoint), and in the community DDD sample, the root holds the
  application class and app-wide configuration, the security filter chain included: two to five
  classes.
- Code every module calls is a shared module.
- Login sits in a module with the user accounts.
- None keeps controllers, flows or orchestration in the root.

Three repo decisions stood in the way, and the owner set them aside for this decision:

- ADR-0017's "the fence is the root's";
- ADR-0020's "a module must own a table or a rule";
- the edge rule "login never in modules".

## Decision

1. **The root holds the application class and app-wide configuration that reaches no module.**
   After the moves: `PlatformApplication` (now carrying `@Modulithic(sharedModules = "shared")`),
   `TimeConfig`, `SpaWebConfig`, `MapResourcesConfig`. A root class that needs a module surface
   belongs in a module. `CompositionRootDisciplineTests`' second rule, nothing in a module reaches
   the root, stands unchanged.

2. **`auth`: a closed module for sign-in and sessions.** It holds:
   - session establishment, identity, principal, credential stamp and revoker;
   - both `UserDetailsService`s and the authentication beans (`AuthenticationManager`s, the
     `PasswordEncoder`) now declared in `SecurityConfig`;
   - SSO (gateways, providers, the IdP mock and its prod guard);
   - password policy, recovery tokens and recovery properties, `RivieraOperatorProperties`, the
     bootstrap credential initializer;
   - `AuthController`, `AccountRecoveryController`, `MyAccountController`,
     `OperatorAccountController`, `SsoController`;
   - `MyErasureController`, `AdminOperatorController` and `OperatorApprovalMail`.

   It publishes:
   - `api.SessionRevocation`, which the revoker implements;
   - `api.SessionCredentials`, the per-request stamp check `web`'s filter calls;
   - `vocabulary.BlockedPasswordException`, which the one advice maps.

   It depends on `customer` and `operator` (`api` + `vocabulary`), `notification::api` and `shared`.
   **Login stays out of the domain modules:** `CustomerAuthPlacementTests` and
   `OperatorAuthPlacementTests` stand as written. The edge rule now reads "login and session
   machinery lives in `auth`, never in a domain module". The three erasure/lifecycle controllers go
   to `auth` because they revoke sessions in the same request. `customer` and `operator` cannot call
   `auth` without a cycle, since `auth` depends on both.

3. **`web`: a closed module for the HTTP boundary, not a shared module.** It holds:
   - `SecurityConfig` (both chains, CSRF, cookie, `SecurityContextRepository`, route policy);
   - the chain's filters: `RateLimitFilter` + `RateLimitProperties`/`TokenBucket`/
     `ClientIpResolver`, `ChallengeVerificationFilter`, `AdminAuditFilter` + `AdminAuditReasons`,
     and `SessionCredentialFilter`, which now asks `auth.api.SessionCredentials`;
   - `SecurityProblemResponses`, `RequestPaths`, `WebCorsConfig`;
   - `ApiErrorHandler`, still the one `@RestControllerAdvice`.

   It depends on the published surfaces of `auth`, `challenge`, `audit`, `customer`, `operator` and
   on `shared`. It takes Spring Security beans by their framework types, which creates no module
   dependency. **Not shared:** no module calls it, and a STANDALONE module test is better without
   the chain than with every collaborator mocked. The fence/mechanism split of ADR-0017 stands. Only
   the fence's home changes, from the root to `web`.

4. **`remodel`: a closed module for ADR-0020's composition.** The nine `Remodel*` classes move. The
   commit service still implements `venue.api.RemodelGate`. The module depends on `venue` and
   `booking` (`api` + `vocabulary`), `operator::vocabulary` and `shared`. Its shape follows
   `itinerary`, which owns no table either. ADR-0020's Decisions 2–4 (published surfaces only, each
   port asserts ownership, the composition assembles and does not decide) carry over word for word.
   The granted surfaces leave the root's grant map and become `remodel`'s `allowedDependencies`,
   which `verify()` checks.

5. **`monitoring`: a closed module for platform observability.** It holds:
   - `ObservabilityConfig`, `MoneyPathAlertCheck` + `MoneyPathAlertProperties`,
     `ScheduledQueryTimeout`;
   - `CorrelationIdFilter`. `ObservabilityConfig` registers it as a servlet filter, outside the
     security chain, so it is not `web`'s.
   - From `shared`: `ObservabilityMetrics` (the metric names) and `MdcTaskDecorator` (the worker
     half of the correlation id).

   `allowedDependencies = {}`. Both `shared` types were admitted to `shared` because nothing owned
   them; `monitoring` now does. Neither fits today's published-surface kinds: a constants holder is
   not a value, and a concrete `TaskDecorator` is not a port. The move slice settles how they are
   published, either a `vocabulary` allowance for a constants holder or the decorator served as a
   bean by its Spring type, and states which in `riviera-modulith`.

6. **`customer` gains `AdminErasureController`** in `adapter/in`. It calls only `customer`'s own
   `AccountErasure` and imports no Spring Security type.

7. **`shared` becomes CLOSED and is registered with `@Modulithic(sharedModules = "shared")`.** Its
   shape stays flat (ADR-0007 Amendment 2). A closed module's flat base package is its API, so no
   caller changes. `verify()` then also checks cycles through it; none exists, because `customer` and
   `operator` depend on nothing. Registering it makes every module test load its beans: the
   hand-written `CurrentCustomer`/`CurrentOperator` mocks go, and the directories behind them stay
   mocked. Every module already lists `shared`, so registration widens no access.

   It keeps:
   - `ApiProblem`, `InvalidApiRequestException`, `CurrentCustomer`, `CurrentOperator`. Each would
     close a cycle in its natural owner: `web` → `auth` → `notification` → `booking` → `web`, and
     `booking` → `auth` → `notification` → `booking`.
   - `ShutdownBudget`, `ResubmissionThrottle`, `ResubmissionOutcome`. No owning module, several
     users.

8. **The categories.**
   - `remodel` joins the CLAUDE.md module table beside `itinerary`, owning no table.
   - `auth`, `web` and `monitoring` are listed with `challenge` and `audit` as non-context modules.
   - ADR-0017's `allowedDependencies = {}` stays the default for a *mechanism*. A non-context module
     that is an *adapter layer*, as `auth` and `web` are, depends on the published surfaces it
     needs.

9. **Sequencing.** #1317's PR is this ADR, its research note, the pointers, and one Javadoc
   correction. Each move is its own pure-move PR: no behaviour change, reviewed at medium effort.
   Each PR makes true, in the same PR, every substrate sentence its move falsifies:
   - **`auth` (#1325) first, then `web` (#1326).** `web`'s filter calls `auth`'s port.
   - **`remodel` (#1327), `monitoring` (#1328) and the `shared` change with
     `AdminErasureController` (#1329)** are independent of each other and of the two above.

   The slice that empties the root last also rewrites `CompositionRootDisciplineTests`' first rule
   (see Consequences).

## Considered options

- **Leave the root flat, with a `package-info` map (rejected).** It is honest: Modulith's root
  module plus our grant map do check it. But no reference project keeps controllers, flows or a
  domain composition in the root. The owner judged a 65-class root, still growing (#1306), a cost
  worth paying down.
- **A closed `session` module only (ADR-0017's shape; rejected).** The session helpers take
  `HttpServletRequest` and `SecurityContextRepository`, so they are the fence, not a mechanism
  behind a port. They need `customer` and `operator`, so they cannot be `{}`. And they would leave
  the rest of the login classes (SSO, recovery, credentials, controllers) in the root.
- **One `edge` module for login and the chain (rejected).** It is the issue's option 3. It would
  hold about 50 classes with two reasons to change: who you are, and how a request is filtered.
  Splitting them puts the dependency where it belongs: `web` → `auth`.
- **Login inside `customer`/`operator` (rejected).** This is the Salespoint layout. It would reverse
  both placement tests, and the session machinery shared by the two principal types would have no
  single home.
- **Keep a sub-package out of module detection (rejected).** Via `explicitly-annotated`, a custom
  strategy, or the ignore predicate. The opted-out code is checked by nothing and loaded by no
  module test, and the ignore predicate does not even reach module tests or startup verification
  (the note §3). That is strictly worse than both the root and a module.
- **`web` as a shared module, the #82 `core` pattern (rejected).** It would keep today's
  test-bootstrap behaviour. But it would auto-allow every module to depend on the security chain,
  which no module should call.
- **Move `ApiProblem`/`InvalidApiRequestException` to `web` and `CurrentCustomer`/`CurrentOperator`
  to `auth` (rejected).** Both close cycles (Decision 7). Breaking them would mean `auth` stops
  calling `notification` synchronously, a separate decision about recovery mail with its own timing
  constraint (D-8).
- **Keep `shared` OPEN (rejected).** OPEN buys nothing for a flat module with no cycle, and the
  reference calls it a migration aid that "usually hints at sub-optimal modularization".

## Consequences

- **`verify()` checks what our tests check today, and more.** Login, the chain, the remodel
  composition and monitoring each get an `allowedDependencies` list and the module template.
  - The root's grant map shrinks row by row.
  - Once the root reaches no module, `rootTouchesOnlyGrantedModuleSurfaces` cannot keep its
    "vacuously green" guard (it asserts that *some* surface is touched). The last move rewrites the
    rule as "the root reaches no module", proven on its fixture.
- **The compiler no longer hides these classes from modules; Modulith does.** Types an adapter
  calls across sub-packages become `public`, and the closed-module rules guard them, as in every
  other module.
- **Module tests get lighter.** STANDALONE no longer bootstraps the chain, the login controllers or
  the remodel composition. `PayoutModuleTest`'s mocks shrink, and `WebSliceStubs` changes with each
  move (`riviera-local-debug` § *Blast radius*: run the `@ApplicationModuleTest` grep after every
  move).
- **Fitness functions that follow a move:**
  - `SessionWriterArchitectureTests` (the one session writer moves to `auth`);
  - `ErrorContractArchitectureTests` (the one advice moves to `web`);
  - `EndpointRoleGateCoverageTest` and the role-gate tests (controllers move; discovery is by scan);
  - `ScheduledWorkArchitectureTest` (`MoneyPathAlertCheck` moves);
  - `ShutdownDrainArchitectureTest` (`ShutdownBudget` stays).
- **Substrate rewritten across the moves, each by the move that falsifies it:**
  - CLAUDE.md (module table, non-context list, *Platform edge*);
  - `RESPONSIBILITIES.md` (new § `auth`, § `web`, § `remodel`, § `monitoring`; § `shared`,
    § *Platform edge*);
  - CONTEXT.md (the customer-account entry's "login machinery lives at the platform edge");
  - `riviera-modulith` (the root paragraph);
  - RV-BE-11/RV-BE-12 in `riviera-review-overlay`;
  - the `ModularityTests` and `PackageShapeArchitectureTests` Javadoc;
  - `docs/architecture/domain-model.md`.
- **The Documenter will show the new modules.** The root module never appeared there.
- **Trade-off accepted:** about 100 source and test files move across five PRs, with no behaviour
  change, to buy a root a reader can take in at a glance and a structure Modulith verifies end to
  end. The places where a move could change behaviour are the bean wiring leaving `SecurityConfig`
  and the session filter's call through `SessionCredentials`. `AuthSessionIT`,
  `SessionCredentialStampIT`, `PerOperatorLoginIT` and `SetPasswordIT` cover both.
