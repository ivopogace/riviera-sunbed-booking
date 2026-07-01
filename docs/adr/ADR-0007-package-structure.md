# ADR-0007 — Per-module package structure: graduated two-template

**Status:** Accepted (yours to ratify — you delegated the call)
**Date:** 2026-07-01
**Context owners:** Ivo + two independent Claude code-reviews (this session and a fresh session that re-read the source zip)

---

## Context

The per-module convention today is a fixed seven-package shape:

```
<module>/api  <module>/spi
<module>/application/in  <module>/application/out
<module>/domain
<module>/infrastructure/in  <module>/infrastructure/out
```

It is **over-built for thin modules** and applied uniformly regardless of a module's weight.
Two independent reads of the actual source agree on the facts:

| Module | Files | LOC | `domain/` | `api/` | `spi/` | Application service? |
|---|---|---|---|---|---|---|
| `booking` | 61 | 2426 | yes | yes | no | yes — 8 services, two-phase reserve/collect saga |
| `venue` | 29 | 1294 | not yet | yes | **yes** | yes (`VenueAdminService`) |
| `payment` | 27 | 1072 | 1 enum | yes | no | yes (payment/refund/cancel) |
| `payout` | 25 | 1054 | 5 types | **no** | no | yes (query + report; pure event subscriber) |
| `availability` | 12 | 486 | no | yes | no | yes — one service, owns the sync claim port |
| `customer` | 6 | 122 | no | yes | no | **no** — `api` port implemented directly by a JDBC adapter |

Two facts drive the decision:

1. **The modules are bimodal, not a smooth gradient.** `customer` (122 LOC, *no service, no domain*
   — the `api` port goes straight to a JDBC adapter, documented as such in the code) and `booking`
   (2426 LOC, a real orchestrator with a compensating-transaction saga) cannot share one shape
   without one end degrading. There is exactly **one** genuinely thin module.
2. **The `api`/`spi` distinction is load-bearing.** `venue.spi.SetAvailabilityLookup` is a real
   dependency inversion — declared in `venue.spi`, implemented by `availability`
   (`allowedDependencies = { venue::api, venue::spi }`) to avoid a Modulith cycle. The
   package-level "call-me (`api`) vs implement-me (`spi`)" split is greppable, ArchUnit-keyable,
   and self-documenting.

**Hard constraints:** DDD (strategic + light tactical) + Spring Modulith + Hexagonal; boundaries
enforced by `@NamedInterface` + `allowedDependencies` + `ModularityTests` + `JdbcOnlyArchitectureTests`;
no JPA; id-based cross-module refs; the `booking → availability` set-claim stays **synchronous,
in-transaction** (atomic `INSERT … ON CONFLICT`, invariant #2); the driving/driven distinction must
stay visible; the shape must be ArchUnit-enforceable by package name.

---

## Decision

Adopt a **graduated two-template** structure (a corrected Option A). `api`/`spi` stay **top-level and
exposed**; the hexagon beneath is at most `application` / `domain` / `adapter`.

### Thin template — for a module with **no application service** (today: only `customer`)
```
<module>/
  api/                 @NamedInterface — the published port(s) + ids/value records
  adapter/out/         the JDBC adapter implementing the api port directly
  package-info.java
```
No `application/`, no `domain/`. (Decision point noted below: `adapter/out/` chosen over `internal/`
to keep the adapter vocabulary uniform and avoid a third bucket-naming scheme.) If a thin module ever
grows real logic, it **graduates** to the full template — a visible, reviewable refactor, which is a
feature, not a cost.

### Full template — everything else (`booking`, `venue`, `payment`, `payout`, `availability`, `operator`)
```
<module>/
  api/                 @NamedInterface — ONLY if the module publishes a port/event a sibling consumes
  spi/                 @NamedInterface — ONLY if the module owns a cross-module inversion
  application/         services + their in/out port interfaces, TOGETHER (no in/out split)
  domain/              aggregates, value objects, policies, enums
  adapter/
    in/                driving adapters: controllers + event listeners (+ request/response DTOs)
    out/               driven adapters: JDBC repositories, Stripe gateway, code generators
  package-info.java
```

**Assignment rule (mechanical):** a module is **thin** iff it has no application service; otherwise
**full**. Today that yields `customer` = thin, all others = full. `availability` is "small but full"
— correct, because it owns a published command port with real concurrency semantics.

**`api`/`spi` are optional in the full template.** `payout` has neither (pure subscriber). Do not
force an empty `api/` onto a module that only consumes.

### Sub-decision 1 — adapter layer by **direction** (`adapter/in` / `adapter/out`), not technology
Direction is the hexagonal boundary and the thing ArchUnit enforces cheaply. Technology-spelling
(`adapter/rest`/`jdbc`/`event`) would split same-role adapters: `booking`'s current
`infrastructure/in` holds both REST controllers *and* event listeners — both *driving*. `adapter/in`
keeps them together. If the technology axis is ever needed, it's a sub-package (`adapter/in/rest`,
`adapter/in/event`). This is a low-risk rename: `infrastructure/in → adapter/in`,
`infrastructure/out → adapter/out`.

### Sub-decision 2 — fold `application/in` + `application/out` into `application/`
This is the core collapse. Internal use-case ports (e.g. `CreateBooking`) and repository ports
(e.g. `Bookings`) are the same layer; the in/out split there duplicates the direction information
that now lives in `adapter/in` vs `adapter/out`. Once adapters carry direction, the ports don't need
to. The repository port stays an interface in `application/`, implemented by `adapter/out` — the
inversion is real (it enables fakes in tests); it just doesn't need its own package to prove it.
Highest-value single simplification for `booking` (~23 port/command files across two packages today).

### Sub-decision 3 — slice `booking` only, by use-case cohesion, inside `application/`
`booking` has 8 services — past a readable flat `application/`. Slice it:
`application/reserve/` (reserve + confirm + claim/release), `application/cancel/` (cancel + policy +
cutoff), `application/refund/` (weather refund + abandoned sweep), `application/view/` (read side).
Keep `domain/` flat and shared. **Do not slice any other module** — none has the mass. The asymmetry
is the philosophy: structure tracks weight.

---

## Target trees

### `customer` (thin)
```
customer/
  api/            CustomerDirectory, CustomerId, GuestContact        @NamedInterface("api")
  adapter/out/    JdbcCustomerDirectory                              (implements the api port directly)
  package-info.java   @ApplicationModule(allowedDependencies = {})
```

### `booking` (full, sliced)
```
booking/
  api/            BookingId, BookingConfirmed, BookingCancelled, RefundReason   @NamedInterface("api")
  application/
    reserve/      CreateBooking(+Command,+Outcome), ReserveSetService, ConfirmBooking,
                  ClaimReleaseService, ReserveOutcome, NewBooking, ClaimRef
    cancel/       CancelBooking(+Outcome), CancelBookingService, CancellationPolicy, BookingCutoff
    refund/       RefundForWeather, WeatherRefundService, AbandonedBookingSweepService,
                  ExpireAbandonedBookings, ReleaseAbandonedBooking, RefundableBooking
    view/         ViewBooking, ViewBookingService, DailyBooking, ListDailyBookings, BookingDetail
    Bookings.java                 outbound persistence PORT (interface), shared by slices
    BookingCodeGenerator.java
  domain/         BookingStatus, RefundPolicy
  adapter/
    in/           BookingController, StaffBookingController, AdminWeatherRefundController,
                  AbandonedBookingScheduler, PaymentEventListener, BookingRefundListener, + DTOs
    out/          JdbcBookings, SecureRandomBookingCodeGenerator
  package-info.java   @ApplicationModule(allowedDependencies = { venue::api, availability::api, payment::api, customer::api })
```
No `spi/` — `booking` owns no inversion. `api/` stays first-class (its events are consumed by
`payout` and `payment`).

### `operator` (planned — full, the authorization owner)
```
operator/
  api/            OperatorId + the ownership-check port callers use — e.g.
                  VenueOwnership.assertOwns(OperatorId, VenueId) / ownerOf(VenueId)   @NamedInterface("api")
  application/    OperatorService, Operators (outbound port), VenueOwnershipService
  domain/         OperatorStatus, the operator↔venue ownership link/aggregate
  adapter/
    in/           operator account controllers
    out/          JdbcOperators, JdbcVenueOwnership
  package-info.java   @ApplicationModule(allowedDependencies = { venue::api })
```
- **Full, not thin** — it publishes an `api` port (the BOLA fix, invariant #13); ownership checks are
  its reason to exist, so the port is central and the service real.
- The ownership check is an **`api` port (synchronous "call-me"), not `spi`** — callers *ask* operator
  "does this operator own this venue?" (inbound). `operator → venue::api` is a clean one-way edge, like
  `payout → venue::api`. It becomes `spi` only if a cycle appears; watch for that as `venue` grows.

---

## Consequences

**Improves:** kills the `.in`/`.out` application-layer noise (the felt over-building); makes
driving/driven a package fact at the adapter boundary (enforceable, self-documenting); lets the one
serviceless module stay honestly small (no ghost packages); keeps `api`/`spi` first-class where the
`venue`↔`availability` inversion makes it load-bearing.

**Trade-off:** two shapes, not one. A module can *graduate* thin→full (a real refactor: introduce
`application/`, move the port). You hold a classification rule ("has a service?") in your head. But the
population of thin modules is **one** and the rule is mechanical, so the cost is ~zero for this
codebase. The A-vs-B decision effectively reduced to a single module (`customer`): five of six modules
are identical under either, so the uniformity B would buy is almost entirely retained here anyway.

**Enforcement (necessary, not sufficient — the structural half):**
- Allowed top-level package set per module ⊆ `{api, spi, application, domain, adapter}` (thin uses a
  subset). Single ArchUnit rule.
- `adapter.*` may depend on `application`/`domain`; `application`/`domain` must not depend on
  `adapter` (hexagon direction).
- `api`/`spi` are `@NamedInterface` and top-level (not nested under `application`).
- The "thin has no `application/`" case is partly mechanizable: a thin module's `api` port is
  implemented in `adapter/out`; a full module has `application/` + `adapter/`.
- The **semantic** half (a policy/decision/calculation landing in the wrong module) is still
  review-only — RV-BE-11 + the plan-time Module-ownership table.

**Revisit → Option B (uniform lean) if:** you acquire several more thin modules (a `notification`
sink, a `review` stub, `favorites`), so the thin/full call starts firing on real ambiguity; or the
team grows past "seniors who hold the rule in their head" and the thin template gets applied
inconsistently in review. The door is deliberately left open.

---

## Alternatives considered

- **Option B — uniform lean (one shape for all).** Rejected: forces the serviceless `customer` into an
  empty `domain/` and an empty/invented `application/` — ghost packages that misrepresent the module,
  strictly worse than today for that module. Its one virtue (no per-module judgment) is nearly moot
  here because five of six modules are identical under corrected-A anyway, and `ModularityTests` + a
  single package-set rule already give uniform *enforcement* without uniform *shape*.
- **Option C — Spring-Modulith-flat (root = public API, everything else `internal/`).** Rejected:
  deletes the package-level `api`/`spi` distinction. `venue.spi.SetAvailabilityLookup` is a live
  inversion with its own grant; C would bury it at the module root marked only by an annotation
  argument, trading away the driving/driven clarity that is the top priority.
- **Option A as originally specified (assign by size / "≤1 driven adapter").** Superseded: that rule
  would put `availability` on the borderline and risk classifying it thin, losing a clean `api` on the
  module that owns the synchronous claim port. Corrected rule keys on *collaboration shape* (has a
  service?), which classifies correctly.
- **Option D — adapter split by direction as a whole-codebase driving/driven scheme.** Not a separate
  option; adopted *as* sub-decision 1 (`adapter/in` / `adapter/out`). The `.in`/`.out` that was noise
  (application layer) is removed; the `.in`/`.out` that is meaningful (adapter layer) is kept.

---

## Follow-ups (next steps, not part of this decision)

1. `riviera-modulith` SKILL.md — update the "backend module structure" section to the two templates.
2. `riviera-review-overlay` — add **RV-BE-12** (package-shape conformance): fail a diff that reintro
   `.in`/`.out` at the application layer, nests `api`/`spi`, adds a package outside the allowed set, or
   points an adapter dependency inward. Structural half → the ArchUnit rule; thin-vs-full → review.
3. Improvement plan **Workstream C5** — the package-shape ArchUnit rule, enabled *after* migration.
4. Migration: one module per PR, no behavior change, `ModularityTests` + `JdbcOnlyArchitectureTests`
   green at each step. Order smallest-first: `customer` → `availability` → `payout` → `venue` →
   `payment` → `booking` last. Build `operator` (A1) directly in the target shape as the reference.
5. Settle the one open detail: `customer`'s adapter in `adapter/out/` (uniform vocabulary,
   recommended) vs `internal/` (Modulith-idiomatic hidden).

---

## Amendment 1 — published-surface split: `vocabulary` + `events` named interfaces (issue #95, 2026-07-01)

Issue #95 (improvement-plan B2+C1) split each module's published surface by **kind**, superseding
the parts of this ADR that showed ids/value records/events living in `api/`:

- **`api/`** — ports only ("call-me" interfaces; plain, never sealed).
- **`vocabulary/`** — published typed ids, value records, enums, sealed outcome hierarchies
  (+ nested implementations), published exceptions. `@NamedInterface("vocabulary")`.
- **`events/`** — published domain-event records only. `@NamedInterface("events")`.
- **`spi/`** — unchanged (cross-module driven ports).

All four are **top-level siblings** (the same reasoning that put `spi` top-level, not under `api`),
so the allowed top-level set becomes `{api, spi, vocabulary, events, application, domain, adapter}`
and surfaces stay optional per kind — no forced empty packages. Notably `booking` now has **no
`api/` at all** (it publishes no ports): its surface is `events/` (`BookingConfirmed`,
`BookingCancelled`) + `vocabulary/` (`BookingId`, `RefundReason`), and `payout` is granted
`booking::events` + `booking::vocabulary` — never a command surface. `customer` (thin) is
`api/` + `vocabulary/` + `adapter/out/`.

`allowedDependencies` grants are per-surface and least-privilege (see the grant matrix in
`docs/plans/issue-95-published-surface-split.md`). Because the Event Publication Registry persists
event FQCNs, the move shipped with `V18__event_publication_event_type_moves.sql`.

**Enforcement added (C1):** `PublishedSurfacePlacementArchitectureTests` — api/spi hold only
non-sealed interfaces; events surfaces hold only records; vocabulary surfaces hold no plain
interfaces; every cross-module `@ApplicationModuleListener` parameter type lives in its owner's
`events` surface. Proven against fixtures in `ai.riviera.placementfixture`.
`PackageShapeArchitectureTests`' allowed sets were widened accordingly.
