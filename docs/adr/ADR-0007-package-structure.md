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

---

## Decision

Adopt a **graduated two-template** structure. `api`/`spi` stay **top-level and exposed**; the
hexagon beneath is at most `application` / `domain` / `adapter`.

### Thin template — for a module with **no application service**
```
<module>/
  api/                 @NamedInterface — the published port(s)
  vocabulary/          @NamedInterface — published ids/value records (Amendment 1)
  adapter/out/         the JDBC adapter implementing the api port directly
  package-info.java
```
No `application/`, no `domain/`. If a thin module grows real logic, it **graduates** to the full
template — a visible, reviewable refactor, which is a feature, not a cost.

### Full template — everything else
```
<module>/
  api/                 @NamedInterface — ONLY if the module publishes a port a sibling consumes
  spi/                 @NamedInterface — ONLY if the module owns a cross-module inversion
  vocabulary/          @NamedInterface — published typed ids, value records, enums, outcomes
  events/              @NamedInterface — published domain-event records
  application/         services + their in/out port interfaces, TOGETHER (no in/out split)
  domain/              aggregates, value objects, policies, enums
  adapter/
    in/                driving adapters: controllers + event listeners (+ request/response DTOs)
    out/               driven adapters: JDBC repositories, gateways, code generators
  package-info.java
```

**Assignment rule (mechanical):** a module is **thin** iff it has no application service;
otherwise **full**. Every surface is optional per kind — do not force an empty `api/` onto a
module that only consumes. **Which modules are thin and which are full is not recorded here**:
the maintained census is `.claude/skills/riviera-modulith/SKILL.md`, and the current tree is in
`CLAUDE.md`. (`customer`, the only thin module at decision time, has since graduated; today every
bounded context is full.)

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
  `application`).
- The **semantic** half (a policy/decision/calculation landing in the wrong module) is review-only
  — RV-BE-11 + the plan-time Module-ownership table.

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

**Enforcement:** `PublishedSurfacePlacementArchitectureTests` — api/spi hold only non-sealed
interfaces; events surfaces hold only records; vocabulary surfaces hold no plain interfaces; every
cross-module transactional event listener's parameter type lives in its owner's `events` surface,
in **either spelling** (the `@ApplicationModuleListener` composite or its `@Async` +
`@TransactionalEventListener` expansion, which a listener needs when it names its own executor).
Proven against fixtures in `ai.riviera.placementfixture`.

## Amendment 2 — a third, non-context template: the OPEN shared kernel (issue #371, 2026-07-27)

The two templates describe **bounded contexts**. `shared` is not one, and needs naming here so the
canonical shape rule does not contradict the codebase.

**Context.** The root package `ai.riviera.platform` was doing two jobs with opposite dependency
directions: the composition root (`PlatformApplication`, `SecurityConfig`, the platform's own
controllers), which *depends on* modules — and the home of `ApiProblem`, `CurrentOperator`,
`CurrentCustomer` and `ObservabilityMetrics`, which most modules *depend on*. A package that is
both closes cycles by construction, and did (`booking → root → booking`) the moment an edge
listener on `booking.events.BookingConfirmed` needed `root → booking`.

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

**Admission test:** no business logic, no module-owned state, and no dependency on a module that
depends back. `shared` may reach only `customer::api` and `operator::api`.

**Do not copy this shape for a bounded context.** A new context is still thin-or-full per the
mechanical rule; OPEN is reserved for technical shared code, and `shared` is the only instance.
