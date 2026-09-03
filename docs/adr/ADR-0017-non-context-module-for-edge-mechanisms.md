# ADR-0017: A port-fronted mechanism no bounded context owns is a closed non-context module; the fence stays at the edge, and the proof-of-work challenge is the first instance

- **Status:** Accepted — implemented by PR #916 (#913), which moved the proof-of-work challenge
  mechanism into the closed non-context module `challenge`, and by PR #NN (#914), which moved the
  admin audit log into the closed non-context module `audit`. Both instances of Decision 1 now
  exist; no third is named.
- **Date:** 2026-09-03
- **Relates to:** ADR-0016 (Decision 3 is amended by this ADR), ADR-0007 (the module templates
  this applies unchanged; Amendment 2 introduced the one non-context module `shared`), invariant
  #11 (Modulith boundaries), `RESPONSIBILITIES.md` § *Platform edge* and § `shared`, RV-BE-11 /
  RV-BE-12 in `riviera-review-overlay`, the structural nets `ModularityTests`,
  `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`,
  `CompositionRootDisciplineTests`, `ResponsibilitiesArchitectureTests`. Evidence:
  `docs/research/2026-09-03-non-context-modules-generic-subdomains-and-cohesive-mechanisms.md`
  (what Spring Modulith 2.1.0, Evans and Cockburn say about a module that owns no domain concept,
  and what the repo's nets do with one — every quote below is verified there).

## Context

PR #911 (issue #905) built the proof-of-work challenge spine — properties, issuer/verifier,
verdict, registry port + JDBC adapter over the V49 `challenge_registry` table, sweep, controller,
verification filter, problem bodies, and the tests — flat in the root package
`ai.riviera.platform`, beside `RateLimitFilter`, because ADR-0016 Decision 3 said "root-package
edge concerns like `RateLimitFilter`; no Modulith module knows the challenge exists" (RV-BE-11).
Two slices (#906, #907) are about to widen the fenced route set.

Once the code existed, the root turned out to be the wrong home for the *mechanism*:

1. **The root has no shape rule.** Every module gets the machine-locked template and an
   `allowedDependencies` list checked by `ApplicationModules.verify()`; the root gets neither. A
   table-owning adapter, a scheduled job, a verdict enum and a library wrapper sit as peers of
   `PlatformApplication` and `SecurityConfig`, package-private to each other and to everything
   else at the root. "No module knows the challenge exists" is true only as prose: nothing fails
   if a root class reaches straight into `JdbcChallengeRegistry`.
2. **The sole-writer rule cannot name a root owner.** `ResponsibilitiesArchitectureTests`
   expresses "only X writes table T" as *module equals X*; a writer at the root has no module
   name to exclude, so the one invariant the registry has (each solution accepted once) cannot be
   machine-checked while the writer lives there.
3. **The edge is growing a second kind of thing.** `RateLimitFilter` is a filter with in-memory
   maps: it *is* the edge. The challenge is a filter (the fence) *plus* a service, a port, a
   table, a sweep and an endpoint behind it (the mechanism). ADR-0016 named both "edge". The admin
   audit log (`AdminAuditFilter` → `AdminAuditLog` port → `JdbcAdminAuditLog` on
   `admin_audit_record`, plus `AdminAuditController`) has the same two-part shape for the same
   historical reason.

The question was whether a module may exist that owns no domain concept, and if so what kind.
The sources settle it (research note §1–§3):

- Spring Modulith defines an application module as "a unit of functionality" with a provided and
  a required interface. **"Bounded context" occurs nowhere** in the 2.1.0 reference, README or
  Javadoc; `verify()` checks cycles, API-only access and declared dependencies, nothing about
  content. OPEN modules are a legacy-migration aid: "In a fully-modularized application, using
  open application modules usually hints at sub-optimal modularization and packaging structures."
  There is no per-package opt-out from detection, only an ignore predicate at the
  `ApplicationModules.of(...)` call site. And `allowedDependencies = {}` still permits "code not
  assigned to any module in the first place" — the root package.
- Evans: a bounded context is "a boundary … within which a particular model is defined and
  applicable" (DDD Reference p. vi), so a mechanism with no model gives it nothing to bound. The
  closest pattern is **Cohesive Mechanisms** (p. 44): "Partition a conceptually cohesive
  mechanism into a separate lightweight framework. … Expose the capabilities of the framework
  with an intention-revealing interface." A Generic Subdomain presupposes "generic models" of a
  subdomain (p. 41), which this has none of.
- Cockburn's hexagon has "the application" inside and never says "domain" (0 of 4,569 words);
  his own example is a discount calculation with a rate-repository port. The hexagonal template
  around a non-domain mechanism is the pattern as written.

## Decision

1. **The fence is the edge's; a port-fronted mechanism is a module.** Restating
   `RESPONSIBILITIES.md` § *Platform edge*: what stays in the root is the *fence* — the filter
   chain and its ordering, the route policy (which `POST`s are fenced, which paths are
   `permitAll`), and the filter-chain problem bodies (`SecurityProblemResponses`, `RequestPaths`,
   shared with the rate limiter). A mechanism the edge *calls through a port* — one that owns a
   table, a scheduled job, a library dependency or a published verdict — is a **module**, and when
   no bounded context owns it, it is a **non-context module** of the closed kind: a closed
   `@ApplicationModule` with the full template of ADR-0007, `allowedDependencies = {}` unless it
   demonstrably needs `shared` (Modulith: "Declaring an empty array will allow no dependencies to
   other modules"), a published `api/` port and `vocabulary/`, and a row in
   `CompositionRootDisciplineTests`' grant map naming exactly the surfaces the root may touch. It
   owns no aggregate a tourist or operator would name, which is why it is not a bounded context
   and gets no row in the CLAUDE.md context table proper; it is listed beneath it, beside
   `shared`, as a non-context module. The category label is the repo's own; the pattern each
   instance follows is cited from Evans.
2. **The proof-of-work challenge is the first instance:** `ai.riviera.platform.challenge`,
   display name *Proof-of-work challenge*, `allowedDependencies = {}` — Evans' Cohesive Mechanism.
   Its one published port is `challenge.api.ProofOfWorkChallenges` — `enabled()`, `issue()`,
   `verify(payload) → ChallengeVerdict` — one conversation, with `enabled()` on the port so the
   kill switch has one source of truth for the fence and the endpoint alike; `ChallengeVerdict` is
   in `challenge.vocabulary`. Inside: the ALTCHA implementation and `AltchaProperties` in
   `application/`, the `ChallengeRegistry` outbound port beside them (internal: only the module's
   own adapter implements it, so neither `api` nor `spi`), `ChallengeController`
   (`GET /api/auth/challenge`), `ChallengeRegistrySweep` and the properties-enabling config in
   `adapter/in`, `JdbcChallengeRegistry` in `adapter/out` as the **only** writer of
   `challenge_registry`. `ChallengeVerificationFilter`, the fenced route set,
   `SecurityProblemResponses`' three challenge bodies and `RequestPaths` stay in the root;
   `SecurityConfig` keeps registering the filter, injects the port, and refers to the challenge
   path by its own literal, as it does for every other module-owned endpoint. The root's grant
   row is `challenge → {api, vocabulary}`.
3. **The name is `challenge`.** `CONTEXT.md`'s glossary term is *proof-of-work challenge*,
   "shortened to **challenge** in code and issues"; the tree already uses it (`ChallengeController`,
   `challenge.ts`, the `challenge-widget`); captcha, human check and bot check stay on the Avoid
   list. `proofofwork` was rejected as naming the technique and as the only multi-word package
   name in the tree; `abuse` because it implies the rate limiter belongs inside (it does not —
   Decision 5); `edge` because it is the docs' word for the root itself. `SsoAuthorizationChallenge`
   (the OIDC `state`/PKCE nonce) is a different noun and keeps its name in the root.
4. **Module → root becomes a mechanical rule.** `CompositionRootDisciplineTests` gains a second
   rule: no class inside a module depends on a type sitting directly in `ai.riviera.platform`,
   fixture-proven like its sibling. Spring Modulith cannot supply it (the `allowedDependencies`
   parenthesis above), so `allowedDependencies = {}` leaves every root bean injectable until the
   repo checks it. First consequence: the registry adapter reads
   `riviera.scheduled.query-timeout-seconds` itself (the `booking` and `customer` sweep adapters'
   precedent) instead of injecting the root's `ScheduledQueryTimeout`, whose own Javadoc keeps
   it at the root. The `challenge_registry` sole-writer rule joins
   `ResponsibilitiesArchitectureTests` (the `set_availability` mechanism), and the sweep's
   `DELETE` joins the bounded-entry-query IT it was missing from.
5. **`RateLimitFilter` stays in the root.** It is the fence itself: no port, no table, no job,
   in-memory maps by design (ADR-0016 Decision 4 records the challenge registry as the
   deliberate departure from that precedent). Moving it would be symmetry for its own sake.
6. **The admin audit log is the second instance:** `ai.riviera.platform.audit`, display name
   *Admin audit trail*, `allowedDependencies = {}`. `AdminAuditLog` + `JdbcAdminAuditLog` +
   `admin_audit_record` behind a port `AdminAuditFilter` calls fit Decision 1 exactly. #914
   settled the three calls this ADR left to it: the name is `audit` (single word, this ADR's own
   objection to `proofofwork`, and the word `/api/admin/audit` and `X-Audit-Reason` already use);
   `AdminAuditController` moved to `adapter/in` per the default above; `AdminAuditReasons` stayed
   in the root, because an HTTP header and its sanitizer are the fence's request contract, the
   category Decision 1 assigns to the edge. Two consequences this ADR did not predict: the module
   takes the **thin** template — its JDBC adapter implements the published port directly, and a
   service between them would be an empty layer — so it is the first thin module to own a driving
   adapter; and the root's grant row is `audit → {api}`, not `{api, vocabulary}`, because with the
   sanitizer left at the edge the root never names the published entry record. `AdminAuditEntry`
   is published vocabulary rather than a record nested in the port, which the ports surface
   forbids.
7. **Sequencing:** PR #911 merges as reviewed and is not amended; the move is its own refactor
   PR (#913) next, and #906/#907 start after it so their fenced-route additions, ITs and the
   `ChallengeSolving` helper are written once against the final placement.
8. **What ADR-0016 Decision 3 now reads as:** "the challenge *fence* — verification filter,
   fenced route set, problem bodies — is a root-package edge concern like `RateLimitFilter`
   (RV-BE-11); the challenge *mechanism* — endpoint, issuer/verifier, registry, sweep — is the
   closed non-context module `challenge` (ADR-0017). No bounded-context module knows the challenge
   exists." The one-line pointer in ADR-0016 is the only edit made to that document.

## Considered options

**A closed non-context module (chosen).** The only option under which "no module knows the
challenge exists", "the root touches only the port" and "one writer of `challenge_registry`"
become test failures instead of review items, and the one the sources support: Modulith's module
needs no domain, Evans has a named pattern for it, Cockburn's hexagon does not presuppose one.
Mechanically, two nets react — a grant row, and the issuer becoming an interface in `api/`
(research note §4). Cost: the first closed non-context module, so the "nine bounded-context
modules + `shared`" sentences across the substrate become "+ two non-context modules" (the
`riviera-docs-freshness` counting sweep is the mechanism), and Decision 4's rule is ours to own.

**Stay in the root.** The honest runner-up: nothing in the sources forbids it, and it was what the
admin audit log did until #914 applied Decision 6. Rejected because nothing in the nets checks it
either — the root has no shape rule (Context 1) and the sole-writer rule cannot be written for it
(Context 2), which #914 demonstrated by writing that rule against the root and watching it name
`JdbcAdminAuditLog`.

**A tenth bounded context.** Rejected on vocabulary: a bounded context bounds a model (Evans
p. vi, p. 2) and the CLAUDE.md context table asks for an aggregate root; the challenge owns a
nonce table and a library. It takes the module *template* (Decision 1) without the *status*.

**An OPEN technical module like `shared`.** Rejected: it buys a package name and nothing else —
OPEN means "access to application module internal types from other modules is generally allowed",
so the root could still reach `JdbcChallengeRegistry`, and `PackageShapeArchitectureTests` skips
module-root types, so the adapter/application split is unenforced. Modulith's own reference calls
OPEN a legacy-migration aid that "usually hints at sub-optimal modularization", and ADR-0007
Amendment 2 reserves it for shared *types*, "`shared` is the only instance".

**A root sub-package excluded from Modulith.** Rejected: Modulith has no per-package opt-out;
the only exclusion is the ignore predicate at the `ApplicationModules.of(...)` call site, which
blinds Modulith and the Documenter only while every ArchUnit net still counts the package as a
module by package arithmetic — two censuses of "what is a module" that drift, and `verify()`
switched off for exactly the package we want fenced. Nothing in the repo excludes a package
today, and the first exclusion would be an invitation.

**A separate Gradle subproject.** Rejected: with the base package unchanged it changes nothing
the nets see except silently dropping jar-sourced classes from the sole-writer bytecode scan;
with a different base package it is outside every net and outside component scanning, and two
nets (`ScheduledWorkArchitectureTest`, `EndpointRoleGateCoverageTest`) go red rather than blind.
A build boundary is not the seam this needs.

**Module owns the fence too (filter in `adapter/in`).** Rejected for Decision 2: which routes are
fenced is route policy, and route policy is the edge's by the settled Platform-edge rule; #906 and
#907 change that set and nothing else on the backend. The filter needs `RequestPaths` and the
RFC 7807 filter-chain bodies, both shared with the rate limiter and the 401/403 bodies. The
deletion test agrees: delete the module and the filter still describes a fence over any verifier;
delete the filter and the module still answers its one question.

**Two ports split by caller, or a port without `enabled()`.** Rejected for Decision 2: issuing and
verifying are one conversation, and a root reading `riviera.altcha.enabled` while the module reads
it too is two sources for one kill switch.

**Amend ADR-0016 in place, or an ADR-0007 Amendment 3.** Rejected: the durable content is a
placement rule and a category, not an ALTCHA detail, so a reader searching by shape must find it
without knowing the challenge exists; and ADR-0007 is about the templates, of which this adds none.

## Consequences

- **Machine-checked now:** the module's dependencies (`verify()`), its internal shape (the
  package-shape and published-surface nets), what the root may reach in it (the grant row), that
  nothing in a module reaches the root (Decision 4), and that only the module writes
  `challenge_registry` (the sole-writer rule). RV-BE-11 for the challenge shrinks to the fence
  ordering and the route set.
- **The port is the test seam.** Web-slice tests fake `ProofOfWorkChallenges`, not the registry;
  the "a replay loses" proof moves from the filter test into a module-level unit test against an
  in-memory registry, and `CustomerRegisterChallengeIT` keeps proving the whole path against
  Postgres.
- **Counting sweep:** run once per instance — "nine bounded-context modules … plus `shared`" in `riviera-modulith`
  (SKILL.md and `references/boundaries.md`), `ModularityTests`' and
  `PackageShapeArchitectureTests`' Javadoc, `docs/architecture/domain-model.md`, and the
  `CLAUDE.md` module table each gain the second non-context module. ADR-0007 Amendment 2's
  "OPEN … `shared` is the only instance" stays true. The exact wording ships with #913, because
  the docs describe the code as it is.
- **Documented in `RESPONSIBILITIES.md`:** a § `challenge` (not a bounded context) with the
  Job / Not-my-job split, and § *Platform edge* rewritten from "entirely at the edge" to the
  fence/mechanism sentence of Decision 1.
- **A vocabulary note on `shared`:** ADR-0007 Amendment 2 and the `shared` package Javadoc call
  it a Shared Kernel after Evans, whose definition is "some subset of the domain model that the
  teams agree to share" (p. 31); the repo's `shared` holds edge types with no model, so the name
  is used for Evans' *discipline* (keep it small, change it only by consultation), not his
  definition. The clarifying clause lands in `RESPONSIBILITIES.md` § `shared` with #913; ADR-0007
  is not reopened.
- **Reopens nothing in ADR-0016:** mechanism, surfaces, registry semantics, parameters, widget
  posture and kill switch are unchanged; the `riviera.altcha.*` property names, the `V49` table,
  the header name and the three problem codes are unchanged, so the frontend and the deploy docs
  do not move.
- **Trade-off accepted:** a closed module that is not a bounded context now exists, and every
  future "where does this platform thing go" question has three answers (root fence, non-context
  module, `shared` type) instead of two. Decision 1 is the rule that picks; Decision 6 is its
  first scheduled use.
