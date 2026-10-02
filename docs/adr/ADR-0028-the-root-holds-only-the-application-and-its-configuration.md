# ADR-0028: The root package holds only the application and its configuration; login, the HTTP boundary, the remodel composition and monitoring become closed modules, and `shared` a closed shared module that depends on nothing

- **Status:** Accepted — decided by the owner 2026-10-01 (issue #1317). This document is the whole
  of #1317's own PR. The moves are the pure-move slices #1325–#1329 and #1331, sequenced in
  Decision 9. Each earlier ADR this changes carries a dated pointer:
  - amends ADR-0007 Amendment 2 (`shared` is closed, registered, and depends on nothing);
  - amends ADR-0016 Decision 3 and ADR-0017 Decisions 1, 5, 6 and 8 (the fence is `web`'s, not the
    root's);
  - supersedes ADR-0020 on placement (Decision 1, Decision 2's grant rows, the rejected "remodel
    module" option).
- **Date:** 2026-10-01
- **Relates to:** ADR-0007 (module templates), ADR-0016/ADR-0017 (fence vs mechanism; `challenge`
  and `audit` keep their contents), ADR-0020 (the remodel composition), invariants #7, #11, #13,
  `RESPONSIBILITIES.md` § `shared` and § *Platform edge*, the structural net, and these fitness
  functions: `CompositionRootDisciplineTests`, `CustomerAuthPlacementTests`,
  `OperatorAuthPlacementTests`, `SessionWriterArchitectureTests`, `ErrorContractArchitectureTests`,
  `WorkerContextArchitectureTest`. Evidence:
  `docs/research/2026-10-01-modulith-root-package-and-module-detection.md` (cited below as "the
  note", with its section numbers).

## Context

The root package `ai.riviera.platform` holds, as nearly all package-private peers of
`PlatformApplication`:

- the login, session, SSO, credential and recovery machinery (#1306 added the credential stamp);
- the security chain and its filters;
- the remodel composition (ADR-0020);
- the admin and erasure controllers;
- the observability jobs;
- a few configuration classes.

The owner asked whether the login machinery should have a package of its own (#1317), and then, once
the evidence was in, whether the root should hold more than the application at all.

What Spring Modulith 2.1 does with this (the note §1–§3):

- **The root is already verified, as a hidden module.** Since 1.1 the root package is a synthetic
  `root:ai.riviera.platform` module. `verify()` rejects root code that reaches a module's internals,
  and root ↔ module cycles. It does not check a module depending on root code. Our
  `CompositionRootDisciplineTests` adds what is missing: which surfaces the root may use, and
  nothing reaching the root.
- **Root beans load in every `@ApplicationModuleTest`,** so `PayoutModuleTest` mocks the whole root
  chain's collaborators.
- **A direct sub-package is always a top-level module.** The only way to keep one out
  (`explicitly-annotated`, a custom strategy, or the ignore predicate) leaves its code checked by
  nothing and loaded by no module test. That is worse than the root.

What the maintainer and the reference projects do (the note §4, §7):

- **Filters and cross-cutting code:** Drotbohm's answer is "a `core` module" registered in
  `@Modulithic(sharedModules)`.
- **The root:** in his projects (Restbucks, Salespoint), and in the community DDD sample, it holds
  only the application class and app-wide configuration, the security filter chain included.
- **The shared module:** every module may use it, and it depends on nothing.
- **Login:** it sits in a module with the user accounts.
- **Nothing else in the root:** none of them keeps controllers, flows or orchestration there.

Three repo decisions stood in the way, and the owner set them aside for this decision:

- ADR-0017's "the fence is the root's";
- ADR-0020's "a module must own a table or a rule";
- the edge rule "login never in modules".

One more fact surfaced in review. Our `shared` is not at the bottom of the graph. It depends on
`customer` and `operator`, only for `CurrentCustomer` and `CurrentOperator`, so any
`customer`/`operator` → `shared` dependency is a cycle that only its OPEN type hides from
`verify()`. #386 ran into exactly this (`02e30298`: "an Emails helper in the shared OPEN kernel is
architecturally impossible").

## Decision

1. **The root holds the application class and app-wide configuration that reaches no module.**
   After the moves: `PlatformApplication` (now carrying `@Modulithic(sharedModules = "shared")`),
   `TimeConfig`, `SpaWebConfig`, `MapResourcesConfig`. A root class that needs a module surface
   belongs in a module. `CompositionRootDisciplineTests`' second rule, nothing in a module reaches
   the root, stands unchanged.

2. **`auth`: a closed module for sign-in and sessions.** It holds:
   - session establishment, identity, principal, credential stamp and revoker;
   - both `UserDetailsService`s, and the authentication beans `SecurityConfig` declares today
     (`AuthenticationManager`s, `PasswordEncoder`), with `@EnableConfigurationProperties` for its
     own property records;
   - SSO (gateways, providers, the IdP mock and its prod guard);
   - password policy, recovery tokens and properties, `RivieraOperatorProperties`, and the bootstrap
     credential initializer;
   - `AuthController`, `AccountRecoveryController`, `MyAccountController`,
     `OperatorAccountController`, `SsoController`;
   - `MyErasureController` and `AdminOperatorController`, which revoke sessions in the same request.
     `customer` and `operator` cannot call `auth` without a cycle, since `auth` depends on both.
   - `OperatorApprovalMail`, whose one caller is `AdminOperatorController`.

   It publishes, at least:
   - `api.SessionRevocation`, which the revoker implements;
   - `api.SessionCredentials`, the per-request stamp check `web`'s filter calls (it takes the
     `Authentication`, so `SessionPrincipal` stays internal);
   - in `vocabulary`, `BlockedPasswordException` (the one advice maps it) and the role names that
     `SecurityConfig` gates on and the `UserDetailsService`s grant. They are kept in lockstep today
     by a comment, and after the move by one published constant.

   It depends on `customer` and `operator` (`api` + `vocabulary`), `notification::api` and `shared`.
   **Login stays out of the domain modules:** `CustomerAuthPlacementTests` and
   `OperatorAuthPlacementTests` stand as written. The edge rule now reads "login and session
   machinery lives in `auth`, never in a domain module".

3. **`web`: a closed module for the HTTP boundary, not a shared module.** It holds:
   - `SecurityConfig` (both chains, CSRF, cookie, `SecurityContextRepository`, route policy);
   - the chain's filters: `RateLimitFilter` with its properties, token bucket and client-IP
     resolver, `ChallengeVerificationFilter`, `AdminAuditFilter` + `AdminAuditReasons`, and
     `SessionCredentialFilter`, which now asks `auth.api.SessionCredentials`;
   - `SecurityProblemResponses`, `RequestPaths`, `WebCorsConfig`;
   - `ApiErrorHandler`, still the one `@RestControllerAdvice`.

   It depends on the published surfaces of `auth`, `challenge`, `audit`, `customer` and `operator`
   and on `shared`. It takes Spring Security beans by their framework types, which creates no module
   dependency. **Not shared:** no module calls it, and a STANDALONE module test is better without the
   chain than with every collaborator mocked. ADR-0017's fence/mechanism split stands; only the
   fence's home moves, from the root to `web`.

4. **`remodel`: a closed module for ADR-0020's composition.** The `Remodel*` classes move: the two
   controllers, the commit service, the preview assembler, and their request, response and outcome
   records.
   - **The gate moves to `spi`.** The commit service supplies the `RemodelGate` callback that
     `BeachMapRemodel#commit` calls under its locks. Once a *module* implements that interface, our
     own rule puts it in the provider's `spi` (`riviera-modulith` § *api vs spi*; the reference's
     named-interface example is an `spi` package). So `RemodelGate` moves from `venue.api` to
     `venue.spi`, and `remodel` is granted `venue::spi`.
   - **Dependencies:** `venue` (`api`, `vocabulary`, `spi`), `booking` (`api` + `vocabulary`),
     `operator::vocabulary` and `shared`.
     *Amended 2026-10-02 (PR #1347, #1331):* also `operator::api`. `CurrentOperator` dissolved into
     `operator::api.OperatorDirectory`, which `remodel` now calls for its ownership check
     (`remodel/package-info.java`; RESPONSIBILITIES.md § `remodel`).
   - **Its shape follows `itinerary`,** which owns no table either.
   - **What carries over from ADR-0020:** Decision 3 (each port asserts ownership itself) and
     Decision 4 (the composition assembles, it does not decide) carry over unchanged. Decision 2's
     grant rows become `remodel`'s `allowedDependencies`, checked by `verify()`, with `spi` added for
     the reason above.

5. **`monitoring`: a closed module for platform observability.** It holds:
   - `ObservabilityConfig`, `MoneyPathAlertCheck` + `MoneyPathAlertProperties`,
     `ScheduledQueryTimeout`;
   - `CorrelationIdFilter`. `ObservabilityConfig` registers it as a servlet filter, outside the
     security chain, so it is not `web`'s.
   - From `shared`: `ObservabilityMetrics` and `MdcTaskDecorator`.

   `allowedDependencies = {}`. Neither `shared` type had an owner.
   - `ObservabilityMetrics` was admitted to `shared` only for naming consistency. Emission and tags
     stay with the module that owns the thing measured, so its new owner owns the names and the
     money-path alerts on them, nothing more.
   - `MdcTaskDecorator` was admitted because its other half, `CorrelationIdFilter`, sat in the root
     (#455). Both halves now sit in `monitoring`.

   **The move slice (#1328) settles three open points:**
   - **New grants.** `booking`, `payment` and `notification` each gain a `monitoring` grant wherever
     a reference survives compilation; the metric-name constants inline.
   - **How the decorator is published.** `MdcTaskDecorator` is constructed with `new` in pool
     configs, so the slice either admits that kind to a published surface or serves it as a
     `TaskDecorator` bean. It records the choice in `riviera-modulith`.
   - **Where the timeout bound is checked.** `ScheduledQueryTimeout`'s boot check of the shared
     timeout property ran in every module test while it was a root bean. In `monitoring` it runs in
     full-context tests only, and the slice confirms that is enough.

6. **`customer` gains `AdminErasureController`** in `adapter/in`. It drives only `customer`'s own
   `AccountErasure` and imports no Spring Security type, so the module whose use case it drives
   owns it. Its `ApiProblem` use makes `customer` depend on `shared`. That is no cycle once
   Decision 7 has `shared` depending on nothing, so #1331 merges before #1329.
   *Amended 2026-10-01 (#1334):* the controller sits in `auth`'s `adapter/in`. It revokes the
   subject's sessions before and after the scrub, as the self-service path does, and `customer`
   cannot call `auth::api` (`auth` depends on `customer`). `customer` keeps no controller.

7. **`shared` moves to the bottom of the dependency graph, becomes CLOSED, and is registered as a
   Modulith shared module.**
   - **It depends on nothing.** `CurrentOperator` and `CurrentCustomer` dissolve into the modules
     they speak for. `operator::api` and `customer::api` answer "principal name → my id" and throw a
     vocabulary exception the one advice maps to `403`. Callers pass the principal name, so no Spring
     Security type enters either module. Every caller already lists those `api` surfaces. `shared`'s
     `allowedDependencies` becomes `{}`.
   - **CLOSED.** Its shape stays flat (ADR-0007 Amendment 2). A closed module's flat base package is
     its API, so no caller changes. `verify()` then also checks cycles through it.
   - **Registered** with `@Modulithic(sharedModules = "shared")`. Every module test loads its beans,
     and Modulith allows it to every module. That includes `audit`, `challenge`, `customer` and
     `operator`, which declare `{}` today.
   - **"Not even `shared`" retires.** `audit` and `challenge` held that rule because `shared` reached
     into domain modules ("a mechanism that knew one would be a domain module in disguise"). A
     `shared` that depends on nothing removes the reason, so the rule retires with this decision.
   - **What it keeps:** `ApiProblem` and `InvalidApiRequestException` (moving them to `web` would
     close `web` → `auth` → `notification` → `booking` → `web`), plus `ShutdownBudget`,
     `ResubmissionThrottle` and `ResubmissionOutcome` (no owning module, several users).
     *Amended 2026-10-02 (PR #1350, #1340):* also `FailedPublicationRetry`, the scheduled re-drive of
     failed event publications, admitted on ownership: its bounds are one platform budget that no
     single module owns (RESPONSIBILITIES.md § `shared`).

8. **The categories.**
   - `remodel` joins the CLAUDE.md module table beside `itinerary`, owning no table.
   - `auth`, `web` and `monitoring` are listed with `challenge` and `audit` as non-context modules.
   - ADR-0017's `allowedDependencies = {}` stays the default for a *mechanism* behind a port. A
     non-context module that is an *adapter layer*, as `auth` and `web` are, depends on the
     published surfaces it needs. A module is no longer required to own a table, job, library or
     verdict (ADR-0017 Decision 1; ADR-0020's rejected option): a unit of functionality with a
     provided and a required interface is enough (the note §1).

9. **Sequencing.** #1317's PR is this ADR, its research note, the dated pointers, and one Javadoc
   correction. Each move is its own PR with no behaviour change, reviewed at medium effort; #1331
   changes the `CurrentX` call sites and is reviewed at high, since it touches authorization. Each PR
   makes true, in the same PR, every substrate sentence its move falsifies, found with
   `riviera-docs-freshness` over its own range.
   - **`auth` (#1325) first, then `web` (#1326).** `web`'s filter calls `auth`'s port.
   - **#1331 (the `CurrentX` dissolution) before #1329** (`shared` closed + registered, plus
     `AdminErasureController`).
   - **`remodel` (#1327) and `monitoring` (#1328)** are independent of the others.

   The slice that empties the root last also rewrites `CompositionRootDisciplineTests`' first rule
   (see Consequences).

## Considered options

- **Leave the root flat, with a `package-info` map (rejected).** It is honest: Modulith's root
  module plus our grant map do check it. But no reference project keeps controllers, flows or a
  domain composition in the root. The owner judged that a root of that size, still growing (#1306),
  was a cost worth paying down.
- **A closed `session` module only (ADR-0017's shape; rejected).** The session helpers take
  `HttpServletRequest` and `SecurityContextRepository`, so they are the fence, not a mechanism
  behind a port. They need `customer` and `operator`, so they cannot be `{}`. And they would leave
  SSO, recovery, credentials and the login controllers in the root.
- **One `edge` module for login and the chain (rejected).** It is the issue's option 3. It would
  hold two reasons to change: who you are, and how a request is filtered. Splitting them puts the
  dependency where it belongs: `web` → `auth`.
- **Login inside `customer`/`operator` (rejected).** This is the Salespoint layout. It would reverse
  both placement tests, and the session machinery shared by the two principal types would have no
  single home.
- **Keep a sub-package out of module detection (rejected).** Via `explicitly-annotated`, a custom
  strategy, or the ignore predicate. The opted-out code is checked by nothing and loaded by no
  module test, and the ignore predicate does not even reach module tests or startup verification
  (the note §3). That is strictly worse than both the root and a module.
- **`web` as a shared module, the #82 `core` pattern (rejected).** It would keep today's
  test-bootstrap behaviour. But it would allow every module to depend on the security chain, which
  no module should call.
- **`CurrentCustomer`/`CurrentOperator` into `auth` (rejected).** `booking` uses them, so
  `booking` → `auth` → `notification` → `booking` would be a cycle. Their owning modules' `api`
  needs no new edge.
- **A `@LoggedIn`-style parameter annotation with an argument resolver in `auth` (rejected).** This
  is the reference projects' pattern. It also takes `shared` to the bottom, but it adds a resolver
  every web slice test must register, for the same outcome.
- **Keep `shared` depending on `customer`/`operator` (rejected).** `AdminErasureController` could
  not then join `customer`, and registration would let `customer`/`operator` close the cycle #386
  hit.
- **Keep `shared` OPEN (rejected).** OPEN buys nothing for a flat module with no cycle, and the
  reference calls it a migration aid that "usually hints at sub-optimal modularization".

## Consequences

- **`verify()` checks what our tests check today, and more.** Login, the chain, the remodel
  composition and monitoring each get an `allowedDependencies` list and the module template.
  - The root's grant map shrinks row by row.
  - Once the root reaches no module, `rootTouchesOnlyGrantedModuleSurfaces` cannot keep its
    "vacuously green" guard (it asserts that *some* surface is touched). The last move rewrites the
    rule as "the root reaches no module", proven on its fixture.
- **The compiler no longer hides these classes from modules; Modulith does.** Types an adapter calls
  across sub-packages become `public`, and the closed-module rules guard them, as in every other
  module.
- **Module tests get lighter.** STANDALONE no longer bootstraps the chain, the login controllers or
  the remodel composition, and `shared`'s beans arrive by registration rather than by mock. Expect
  `PayoutModuleTest`'s mocks to shrink and `WebSliceStubs` to change with each move
  (`riviera-local-debug` § *Blast radius*: run the `@ApplicationModuleTest` grep after every move).
- **Fitness functions that name a moved type, and so move with it:**
  - `SessionWriterArchitectureTests` (`SessionPrincipal` → `auth`);
  - `ErrorContractArchitectureTests` (`ApiErrorHandler` → `web`);
  - `WorkerContextArchitectureTest` (`MdcTaskDecorator` → `monitoring`).

  The role-gate tests find controllers by scan and follow on their own.
- **The substrate is rewritten across the moves, each part by the move that falsifies it** (the
  `riviera-docs-freshness` sweep in Decision 9 finds the rest):
  - CLAUDE.md (module table, non-context list, *Platform edge*, the `shared` paragraph);
  - `RESPONSIBILITIES.md` (new § `auth`, § `web`, § `remodel`, § `monitoring`; § `shared`,
    § `customer`, § `challenge`, § `audit`, § *Platform edge*);
  - CONTEXT.md (the customer-account entry);
  - `docs/architecture/auth-signin-register.md` and `docs/architecture/domain-model.md`;
  - `riviera-modulith`, and RV-BE-11/RV-BE-12 in `riviera-review-overlay`;
  - the package-info and class Javadoc of every moved type.
- **The Documenter will show the new modules.** The root module never appeared there.
- **Trade-off accepted:** a series of pure-move PRs, plus one signature change (#1331), to buy a
  root a reader can take in at a glance and a structure Modulith verifies end to end. The places
  where a move could change behaviour are:
  - the bean wiring leaving `SecurityConfig`;
  - the session filter's call through `SessionCredentials`;
  - the `403` that `CurrentX` raised.

  `AuthSessionIT`, `SessionCredentialStampIT`, `PerOperatorLoginIT`, `SetPasswordIT` and
  `CrossVenueDenialIT` cover them.
