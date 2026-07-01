# Lock the ADR-0007 layout with a package-shape ArchUnit rule Implementation Plan

> **Right-sized doc.** This is a **test-only** slice — one new ArchUnit test class alongside
> `JdbcOnlyArchitectureTests` / `ModularityTests`, **no production code**. It is the **final**
> step of the ADR-0007 restructure series (#72, item 10/10) and the structural half of
> `riviera-review-overlay` **RV-BE-12**, made always-on. Per `riviera-sdlc` Rule 6 a test-only
> change is lightweight; this doc exists as the durable record for a rule that will gate every
> future backend PR. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Add `PackageShapeArchitectureTests` (a fast, context-free ArchUnit test — no Spring
context, no DB) that fails the build if a module's package layout regresses from the ADR-0007
two-template shape. Green against the migrated codebase from the first commit (all six modules —
`customer` thin; `booking`/`venue`/`payment`/`payout`/`availability`/`operator` full — are already
migrated, verified against source).

## The four assertions (from the issue, reconciled with ADR-0007 + RV-BE-12)

1. **Allowed top-level package set.** Each module's top-level packages (the segment directly under
   `ai.riviera.platform.<module>`) ⊆ `{ api, spi, application, domain, adapter }`. Catches a
   lingering `infrastructure/`. **Plus** — because the top-level-set check alone does *not* catch a
   reintroduced `application/in` | `application/out` (the top segment is the allowed `application`) —
   a companion check that **no class resides in `<module>.application.in` / `.application.out`** (the
   sub-decision-2 fold). Both facets are the issue's assertion 1.
2. **Adapter direction, not technology.** Under `<module>.adapter`, the immediate child segment is
   `in` or `out` (technology may nest *below*, e.g. `adapter/in/rest`). Fails a top-level
   `adapter/rest` | `adapter/jdbc` | `adapter/event`, or a class sitting directly in `adapter`.
3. **`api` / `spi` are top-level.** The `@NamedInterface` packages appear only as a **direct child**
   of the module — never nested (no `application.api`, `adapter.in.spi`, etc.).
4. **Hexagon direction.** `application` and `domain` must not depend on `adapter.*` (adapters depend
   inward, never the reverse). Expressed as an ArchUnit `ArchRule`.

**Thin-vs-full stays review-only.** The machine rule uses the **union** allowed-set
`{api, spi, application, domain, adapter}` for *every* module (a thin module simply uses the subset
`{api, adapter}`, which is automatically a subset). Enforcing that `customer` specifically must not
grow an `application/` would encode the thin-vs-full *judgment*, which ADR-0007's Enforcement section
and RV-BE-12 keep **review-only** ("the thin-vs-full judgment stays review-only"). The rule is
deliberately module-agnostic and structural.

## Module ownership

No bounded-context module owns this — it is platform-wide test infrastructure at the
`ai.riviera.platform` root, a sibling of the existing `JdbcOnlyArchitectureTests` and
`ModularityTests`. No production code, no migration, no cross-module edge.

## Acceptance criteria

- [ ] `PackageShapeArchitectureTests` encodes the four assertions above and **passes** against the
      current migrated codebase.
- [ ] A deliberately-introduced violation (a stray `application/in` package) makes the test **fail**;
      reverted after confirming. Documented in the PR.
- [ ] Runs in the normal test/CI phase with the other architecture tests (plain `@Test`, no special
      task wiring — same as its siblings).

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rule green-by-vacuity (matches nothing) | Med | Each assertion asserts it inspected a non-empty module set; the deliberate-violation step proves it actually fails. |
| False positive on the `ai.riviera.platform` **root** config classes (`SecurityConfig`, etc., which sit directly under base, not in a module) | Med | Module discovery derives modules from packages **deeper** than the base; root-level classes (package == base) are skipped, not treated as a module. |
| ArchUnit not on the classpath | — | **Not a risk** — already provided transitively by `spring-modulith-starter-test` and used by `OperatorAuthPlacementTests` (drift caught at intake grill; the issue's implicit "add ArchUnit" assumption was stale). |

## Skills consulted

- **`riviera-modulith`** — the two-template layout the rule encodes: full = `{api, spi?, application,
  domain, adapter/{in,out}}`, thin = `{api, adapter/out}`; `api`/`spi` top-level `@NamedInterface`;
  direction (not technology) at the adapter layer; hexagon inside/outside (application+domain must not
  import adapter). Confirmed the union allowed-set and the `application/in|out` fold check.
- **`riviera-java-conventions`** — test idioms: JUnit 5 plain assertions matching the sibling arch
  tests, ArchUnit `ClassFileImporter` (as `OperatorAuthPlacementTests` uses), no new assertion
  library, records/`var` where it reads well, specific messages naming the offending class.
- **`riviera-review-overlay` (RV-BE-12)** — this rule is that item's structural half; the thin-vs-full
  and use-case-slicing judgment stays review-only, so the machine rule is module-agnostic.

No `postgres` (no SQL/schema), no `riviera-stripe-payments` (no money), no frontend skills
(backend/test-only).
