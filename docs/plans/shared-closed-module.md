# `shared` closed and registered; `AdminErasureController` into `customer` Implementation Plan

> Pure structural move (ADR-0028 Decisions 6–7). No behaviour change. Invariant numbers: `CLAUDE.md`.

**Goal:** `shared` is a CLOSED module registered via `@Modulithic(sharedModules = "shared")`, and
`AdminErasureController` lives in `customer/adapter/in`, with `ModularityTests` green.

**Architecture:** Closing `shared` puts cycles through it under `verify()`; registering it makes
Modulith add it to every closed module's allowed dependencies (`ApplicationModule#getAllowedDependencies`
concatenates `getSharedModules()`), so `customer`'s `allowedDependencies = {}` admits the moved
controller's `ApiProblem` use without a grant.

**Source of intent:** issue #1329; ADR-0028 Decisions 6–7.

**Branch:** `feature/shared-closed-module`

## Acceptance criteria

- [ ] **AC-1:** Given `shared` without `type = OPEN` and registered as a shared module, when
  `ApplicationModules.verify()` runs, then it reports no cycle and no disallowed dependency.
  *Seam:* `ApplicationModules` · *Pinned by:* `ModularityTests`
- [ ] **AC-2:** Given the flat `shared` base package, the rest of the structural net stays green.
  *Seam:* ArchUnit over the tree · *Pinned by:* the six-test net in `CLAUDE.md`
- [ ] **AC-3:** Given `AdminErasureController` in `customer.adapter.in`, `POST /api/admin/erasure`
  keeps its ADMIN gate, `204` and `400 INVALID_REQUEST`. *Seam:* the route through the real filter
  chain · *Pinned by:* `AdminErasureControllerTest`, `AdminSurfaceRoleGateTest`,
  `EndpointRoleGateCoverageTest`, `CustomerAuthPlacementTests`
- [ ] **AC-4:** Module tests still bootstrap. *Pinned by:* `PayoutModuleTest`, `ReviewSubmitFlowIT`,
  `CompositionRootDisciplineTests`

## Non-goals

- Any other root move (#1325 auth, #1327 remodel, #1326 web, #1328 monitoring).

## Risks

- **R-1:** A sibling slice lands first and conflicts in `RESPONSIBILITIES.md`, CLAUDE.md or the
  `riviera-modulith` skill → merge `main` in before ready-for-review; this slice touches only the
  `shared`/`audit`/`challenge`/`customer` lines.
- **R-2:** The issue's "remove the `CurrentCustomer`/`CurrentOperator` mocks" is already done by
  #1331 (#1347); `AccountErasure`'s mock in `PayoutModuleTest` stays, since the root
  `MyErasureController` still needs it. Only its comment changes.

## Modulith

- `customer` gains a driving adapter (`AdminErasureController`) using only its own `api.AccountErasure`
  and `shared.ApiProblem`. Owner check: `RESPONSIBILITIES.md` § `customer` already owns GDPR erasure.
- The root's `customer::api` grant stays (`MyErasureController`, `MyAccountController`, the edge).

## Phases

- **Phase 0 — close + register `shared`, move the controller:** red-first is `ModularityTests`
  (a moved controller with `shared` unregistered fails `verify()`), then registration greens it.
- **Phase 1 — substrate:** `RESPONSIBILITIES.md` (`shared`, `audit`, `customer`), CLAUDE.md,
  `riviera-modulith`, `riviera-local-debug` § *Blast radius*, `audit`/`challenge`/`shared`
  package-info, comments naming the controller's old home.

## Execution status

- [x] Phase 0 — `ModularityTests` red on the move alone (customer → shared, "Allowed targets: none"), green once registered
- [x] Phase 1 — docs-freshness over the slice's diff: CLAUDE.md, RESPONSIBILITIES.md (`shared`, `audit`,
  `customer`), `riviera-modulith`, `riviera-local-debug`, `domain-model.md`, ADR-0007/ADR-0017 amendment
  pointers, `CompositionRootDisciplineTests` Javadoc; ADR-0010's location-free mention stands
- [x] Structural net + named tests green locally (incl. `PayoutModuleTest`, `ReviewSubmitFlowIT` on Docker)
- [ ] Draft PR #1351, CI green, merge `main`, review, Sonar
