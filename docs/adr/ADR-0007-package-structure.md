# ADR-0007 — Per-module package structure: graduated two-template

**Status:** Accepted
**Date:** 2026-07-01

---

## Context

The per-module convention was a fixed seven-package shape:

```
<module>/api  <module>/spi
<module>/application/in  <module>/application/out
<module>/domain
<module>/infrastructure/in  <module>/infrastructure/out
```

It was **over-built for thin modules** and applied uniformly regardless of a module's weight. Two
facts drove the decision:

1. **The modules were bimodal, not a smooth gradient.** At decision time `customer` (122 LOC, no
   service, no domain — the `api` port went straight to a JDBC adapter) and `booking` (2,426 LOC, a
   real orchestrator with a compensating-transaction saga) could not share one shape without one
   end degrading.
2. **The `api`/`spi` distinction is load-bearing.** `venue.spi.SetAvailabilityLookup` is a real
   dependency inversion — declared in `venue.spi`, implemented by `availability` — to avoid a
   Modulith cycle. The package-level "call-me (`api`) vs implement-me (`spi`)" split is greppable,
   ArchUnit-keyable, and self-documenting.

**Hard constraints:** DDD (strategic + light tactical) + Spring Modulith + Hexagonal; boundaries
enforced by `@NamedInterface` + `allowedDependencies` + `ModularityTests` +
`JdbcOnlyArchitectureTests`; no JPA; id-based cross-module refs; the `booking → availability`
set-claim stays **synchronous, in-transaction** (invariant #2); the driving/driven distinction must
stay visible; the shape must be ArchUnit-enforceable by package name.

*Vocabulary corrected by ADR-0018 (2026-09-04):* what this ADR called a bounded context is a
**module**. The platform is **one** bounded context with twelve modules — none of the four language
tells fires across any module pair, and the duplicated id records are identity conversions that keep
the Modulith graph acyclic, not translations
(`docs/research/2026-09-04-bounded-context-and-doc-drift-audit.md` §B). The wording below is
corrected in place; the decision is untouched. ADR-0018 also states what "light tactical" means for
this tree — `domain/` holds choices, calculations and lifecycles, and the aggregate-root labels in
`CLAUDE.md` and `docs/architecture/domain-model.md` are dropped rather than built out. *Count
updated 2026-09-26 (#1206 / PR #1250):* thirteen modules since the `itinerary` read model landed;
the decision is unchanged.
*Count superseded 2026-10-02 (#1369):* the module list keeps growing (the `auth`, `web`, `remodel`
and `monitoring` modules of ADR-0028, among others), so this ADR states no count. `CLAUDE.md`
§ *Modules* is the source of truth.

---

## Decision

Adopt a **graduated two-template** structure. `api`/`spi` stay **top-level and exposed**; the
hexagon beneath is at most `application` / `domain` / `adapter`.

### Thin template — for a module with **no application service**
```
<module>/
  api/                 @NamedInterface — the published port(s)
  vocabulary/          @NamedInterface — published ids/value records (Amendment 1)
  adapter/in/          only when the module serves its own endpoint
  adapter/out/         the JDBC adapter implementing the api port directly
  package-info.java
```
No `application/`, no `domain/`. If a thin module grows real logic, it **graduates** to the full
template — a visible, reviewable refactor, which is a feature, not a cost.
*Amended 2026-10-01 (#1342):* the sketch gained `adapter/in/`. A thin module carries one when it
serves its own endpoint, as `audit` does (`audit/adapter/in/AdminAuditController`).

### Full template — everything else
```
<module>/
  api/                 @NamedInterface — ONLY if the module publishes a port a sibling consumes
  spi/                 @NamedInterface — ONLY if the module owns a cross-module inversion
  vocabulary/          @NamedInterface — published typed ids, value records, enums, outcomes
  events/              @NamedInterface — published domain-event records
  application/         services + their in/out port interfaces, TOGETHER (no in/out split)
  domain/              rules, value objects, enums
  adapter/
    in/                driving adapters: controllers + event listeners (+ request/response DTOs)
    out/               driven adapters: JDBC repositories, gateways, code generators
  package-info.java
```
*Amended 2026-10-01 (#1342):* `domain/` read "aggregates, value objects, policies, enums" until
ADR-0018 §6 dropped the aggregate-root vocabulary; its rules are the choices, calculations and
lifecycles of ADR-0018 §1.

**Assignment rule (mechanical):** a module is **thin** iff it has no application service;
otherwise **full**. Every surface is optional per kind — do not force an empty `api/` onto a
module that only consumes. **Which modules are thin and which are full is not recorded here**:
the maintained census is `.claude/skills/riviera-modulith/SKILL.md`, and the current tree is in
`CLAUDE.md`. (`customer`, the only thin module at decision time, has since graduated; today all nine
domain modules are full, and the tree's one thin module is the non-context `audit` — ADR-0017.)

### Sub-decision 1 — adapter layer by **direction** (`adapter/in` / `adapter/out`), not technology
Direction is the hexagonal boundary and the thing ArchUnit enforces cheaply. Technology-spelling
(`adapter/rest`/`jdbc`/`event`) would split same-role adapters: REST controllers and event
listeners are both *driving*, and `adapter/in` keeps them together. If the technology axis is ever
needed, it's a sub-package (`adapter/in/rest`, `adapter/in/event`).

### Sub-decision 2 — fold `application/in` + `application/out` into `application/`
Internal use-case ports and repository ports are the same layer; the in/out split there
duplicates the direction information that lives in `adapter/in` vs `adapter/out`. The repository
port stays an interface in `application/`, implemented by `adapter/out` — the inversion is real
(it enables fakes in tests); it just doesn't need its own package to prove it.

### Sub-decision 3 — slice `booking` only, by use-case cohesion, inside `application/`
`booking` has too many services for a readable flat `application/`, so it is sliced by use case
(`reserve/`, `cancel/`, `refund/`, `view/`, …) with `domain/` flat and shared. **Do not slice any
other module** — none has the mass. The asymmetry is the philosophy: structure tracks weight.

---

## Consequences

**Improves:** kills the `.in`/`.out` application-layer noise; makes driving/driven a package fact
at the adapter boundary (enforceable, self-documenting); lets a serviceless module stay honestly
small (no ghost packages); keeps `api`/`spi` first-class where the `venue`↔`availability`
inversion makes it load-bearing.

**Trade-off:** two shapes, not one. A module can graduate thin→full (introduce `application/`,
move the port). The classification rule is mechanical, so the cost is ~zero for this codebase.

**Enforcement (the structural half, necessary not sufficient):**
- Allowed top-level package set per module ⊆ `{api, spi, vocabulary, events, application, domain,
  adapter}` (thin uses a subset) — `PackageShapeArchitectureTests`.
- `adapter.*` may depend on `application`/`domain`; `application`/`domain` must not depend on
  `adapter` (hexagon direction).
- `api`/`spi`/`vocabulary`/`events` are `@NamedInterface` and top-level (not nested under
  `application`). *Amended 2026-10-01 (#1342):* the reason is this repo's arithmetic, not
  Spring Modulith's. Modulith finds a `@NamedInterface` package at any depth; it is
  `ArchitectureTestSupport.surfaceOf`, keyed on the segment directly under the module, that would
  not see a nested surface, so `PublishedSurfacePlacementArchitectureTests` would not check it.
- The **semantic** half (a policy/decision/calculation landing in the wrong module) is review-only
  — RV-BE-11 + the plan's Modulith section.

**Revisit → a uniform lean shape if:** several more thin modules appear, so the thin/full call
starts firing on real ambiguity; or the team grows past "seniors who hold the rule in their head"
and the thin template gets applied inconsistently in review.

---

## Alternatives considered

- **Uniform lean (one shape for all).** Rejected: forces a serviceless module into an empty
  `domain/` and an invented `application/` — ghost packages that misrepresent the module. Its
  one virtue (no per-module judgment) is nearly moot because most modules are identical under
  either, and `ModularityTests` + a single package-set rule give uniform *enforcement* without
  uniform *shape*.
- **Spring-Modulith-flat (root = public API, everything else `internal/`).** Rejected: deletes the
  package-level `api`/`spi` distinction. `venue.spi.SetAvailabilityLookup` is a live inversion
  with its own grant; flat would bury it at the module root marked only by an annotation argument.
  *Amended 2026-10-01 (#1342):* the option is base-package-as-API, not Spring Modulith's own
  shape. Modulith's reference example itself declares a named-interface sub-package (`order.spi`),
  so it does not delete the distinction; the rejection above stands for the base-package layout.
- **Assign thin/full by size ("≤1 driven adapter").** Superseded: that rule would put
  `availability` on the borderline and risk classifying it thin, losing a clean `api` on the
  module that owns the synchronous claim port. The corrected rule keys on *collaboration shape*
  (has a service?), which classifies correctly.
- **Adapter split by direction as a whole-codebase scheme.** Adopted *as* sub-decision 1: the
  `.in`/`.out` that was noise (application layer) is removed; the `.in`/`.out` that is meaningful
  (adapter layer) is kept.

---

## Amendment 1 — published-surface split: `vocabulary` + `events` named interfaces (issue #95, 2026-07-01)

Each module's published surface is split by **kind**, superseding the parts of the original
decision that showed ids/value records/events living in `api/`:

- **`api/`** — ports only ("call-me" interfaces; plain, never sealed).
- **`vocabulary/`** — published typed ids, value records, enums, sealed outcome hierarchies
  (+ nested implementations), published exceptions. `@NamedInterface("vocabulary")`.
- **`events/`** — published domain-event records only. `@NamedInterface("events")`.
- **`spi/`** — unchanged (cross-module driven ports).

All four are **top-level siblings**, so the allowed top-level set is `{api, spi, vocabulary,
events, application, domain, adapter}` and surfaces stay optional per kind — no forced empty
packages. A module that publishes no ports has no `api/` at all: `booking`'s surface is
`events/` + `vocabulary/`, and `payout` is granted `booking::events` + `booking::vocabulary` —
never a command surface. `allowedDependencies` grants are per-surface and least-privilege: the
grant matrix is the modules' `allowedDependencies` declarations. Because the Event Publication
Registry persists event FQCNs, an event move ships with a registry migration
(`V18__event_publication_event_type_moves.sql` is the precedent).
*Amended 2026-10-01 (#1342):* the `booking` example is the 2026-07-01 tree. `booking` has since
published `api/` and `spi/` as well, and `payout` is granted `booking::api` (the
`booking.api.DailyTakings` read) and `booking::spi` (to implement `booking.spi.VenueChangeFeeRate`,
ADR-0021) beside `booking::events` and `booking::vocabulary` (`payout/package-info.java`). The
per-surface, least-privilege rule is unchanged.

**Enforcement:** `PublishedSurfacePlacementArchitectureTests` — api/spi hold only non-sealed
interfaces; events surfaces hold only records; vocabulary surfaces hold no plain interfaces; every
cross-module transactional event listener's parameter type lives in its owner's `events` surface,
in **either spelling** (the `@ApplicationModuleListener` composite or its `@Async` +
`@TransactionalEventListener` expansion, which a listener needs when it names its own executor).
Proven against fixtures in `ai.riviera.placementfixture`.

## Amendment 2 — a third, non-context template: the OPEN shared kernel (issue #371, 2026-07-27)

The two templates describe **the closed modules** — every module that owns a domain concept.
`shared` is not one of those, and needs naming here so the canonical shape rule does not contradict
the codebase.
*Extended by ADR-0017 (2026-09-03), pointer added by issue #918:* the two templates now describe
**non-context modules** too — a closed non-context module takes them unchanged (`challenge` full,
`audit` thin). What stays unique to `shared` is its shape, which matches neither template — not the
fact that it owns no domain concept. ADR-0017 added no template and left this amendment's
decision standing, which is why this is a pointer and not an Amendment 3.

**Context.** The root package `ai.riviera.platform` was doing two jobs with opposite dependency
directions: the composition root (`PlatformApplication`, `SecurityConfig`, the platform's own
controllers), which *depends on* modules — and the home of `ApiProblem`, `CurrentOperator`,
`CurrentCustomer` and `ObservabilityMetrics`, which most modules *depend on*. A package that is
both closes cycles by construction, and did (`booking → root → booking`) the moment an edge
listener on `booking.events.BookingConfirmed` needed `root → booking`.

*Amended 2026-10-01 by ADR-0028 (landed with #1331 and #1329):* `shared` depends on nothing
(`CurrentOperator`/`CurrentCustomer` dissolved into `operator::api`/`customer::api`), is CLOSED (its
flat base package is its API) and is registered via `@Modulithic(sharedModules = "shared")`. This supersedes the Decision's `type = OPEN` and the
admission test's "may reach only `customer::api` and `operator::api`"; the flat shape stands.

**Decision.** Those types live in `ai.riviera.platform.shared`, declared
`@ApplicationModule(type = OPEN)`. This is a **Shared Kernel** (Evans, DDD ch. 14), not a bounded
context: it owns no aggregate, publishes no `api`/`vocabulary`/`events`/`spi` surface (OPEN means
consumers reference its types directly), and its classes sit flat at the module root — so it
matches **neither** the thin nor the full template, deliberately. The decision is the *shape*, not
the arity; the admission bar that governs what may join is `RESPONSIBILITIES.md` §`shared` and the
`shared` `package-info`. `PackageShapeArchitectureTests` permits this because it skips types
sitting at a module root — an intentional allowance.

**The rule this restores:** modules depend on `shared`, the root depends on modules, and
**nothing depends on the root**.
*Amended 2026-10-02 (PR #1357, #1326; ADR-0028 Decision 1):* "the root depends on modules" no
longer holds. The root reaches **no** module, not even a published `api`:
`CompositionRootDisciplineTests` states it as a blanket rule with no surface granted, and the
security chain moved into the closed module `web`. The other two halves stand: modules depend on
`shared`, and nothing depends on the root.

**Admission test:** no business logic, no module-owned state, and no dependency on a module that
depends back. `shared` may reach only `customer::api` and `operator::api`.

**Do not copy this shape for any other module.** A new module is still thin-or-full per the
mechanical rule; OPEN is reserved for technical shared code, and `shared` is the only instance.
*Amended 2026-10-02 (PR #1351, #1329):* no module is `Type.OPEN` any more — `shared` is CLOSED and
registered in `@Modulithic(sharedModules)` (see the 2026-10-01 note above). "Do not copy this
shape" stands: the flat, surface-less shape is `shared`'s alone.
*Amended 2026-10-02 (#1389):* `PackageShapeArchitectureTests` no longer skips module-root types
wholesale: only a module registered in `@Modulithic(sharedModules)` may hold them, so "`shared`'s
alone" is machine-checked.

## Note — why some id records are copied and `SetId` is not (2026-09-04)

Answering `docs/research/2026-09-04-bounded-context-and-doc-drift-audit.md` §H-3, which asked why
`operator.vocabulary.VenueRef`, `review.vocabulary.VenueRef` and `review.vocabulary.BookingRef`
exist while `venue.vocabulary.SetId` crosses four modules with one spelling. **The duplicated
records mark exactly the bidirectional edges**, and nothing else:

- `venue` grants nothing to `availability`, `booking` or `notification` and depends on none of them,
  so the edge is one-way and they import `SetId` directly (the `allowedDependencies` of
  `availability/package-info.java`, `booking/package-info.java` and
  `notification/package-info.java`).
- `venue` **does** depend on `operator` and `review` — `operator::api` for `assertOwns` (invariant
  #13) and `review::events` for the `ReviewsChanged` rating recompute
  (`venue/package-info.java`, `allowedDependencies`). Each of those two therefore cannot name
  `venue`'s types without closing a Modulith cycle, so each publishes its own `VenueRef`
  (`operator/package-info.java`, `allowedDependencies = {}`; `operator/vocabulary/VenueRef.java`,
  type Javadoc).
- `booking` depends on `review::spi`/`review::api` (`booking/package-info.java`,
  `allowedDependencies`) while `review` implements nothing outbound (`allowedDependencies = { "shared" }`,
  `review/package-info.java`), so `review` publishes its own `BookingRef` for the same reason.
- *Amended 2026-10-01 (#1342):* the audit missed `payment.vocabulary.BookingRef`, which fits the
  same rule. `booking` depends on `payment::api`, `payment::vocabulary` and `payment::events`
  (`booking/package-info.java`) while `payment` depends only on `shared`
  (`payment/package-info.java`), so `payment` publishes its own `BookingRef`. The copied records are
  `operator.vocabulary.VenueRef`, `review.vocabulary.VenueRef`, `review.vocabulary.BookingRef` and
  `payment.vocabulary.BookingRef`.

The asymmetry is a rule, not grant history: a module copies an id **iff** the module that owns the
id already depends on it. No code change follows — recorded so the question is not re-derived.
