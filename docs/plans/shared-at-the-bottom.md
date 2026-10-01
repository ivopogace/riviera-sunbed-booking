# `shared` at the bottom of the graph Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** `shared`'s `allowedDependencies = {}` passes `verify()`, because principal → id resolution moves from
`shared.CurrentOperator`/`CurrentCustomer` into `operator::api`/`customer::api`, with the same `403`s.

**Architecture:** `OperatorDirectory` and `CustomerAccountDirectory` answer "principal name → my id" and throw a
vocabulary exception that `ApiErrorHandler` maps to today's `403 ACCESS_DENIED`. The `ROLE_CUSTOMER` gate stays at
the edge: callers read the authorities and pass a `customerPrincipal` flag, so no Spring Security type or role
literal enters `customer` (decided with the user at intake).

**Source of intent:** #1331 (ADR-0028 Decision 7); must merge before #1329.

**Branch:** `feature/shared-at-the-bottom`

## Acceptance criteria

- [ ] **AC-1:** Given a username in the may-operate set, when `OperatorDirectory.requireOperator(name)` runs, then
  it returns that `OperatorId`; given a suspended/rejected/unknown/`null` name, it throws
  `NoOperableOperatorException`. *Seam:* `operator::api.OperatorDirectory` · *Pinned by:* `OperatorOwnershipIT`
- [ ] **AC-2:** Given a customer principal flag and a known email, `CustomerAccountDirectory.signedInAccount` returns
  the id; given `customerPrincipal = false` or a `null` name it is empty and `requireSignedInAccount` throws
  `NotSignedInCustomerException`. *Seam:* `customer::api.CustomerAccountDirectory` · *Pinned by:*
  `CustomerAccountDirectoryTest`
- [ ] **AC-3:** Given an operator session that resolves to no operable operator / a non-customer session on `/api/me`,
  when the controller resolves it, then the response is `403 ACCESS_DENIED`. *Seam:* HTTP · *Pinned by:*
  `VenueWriteRoleGateTest`, `MeSurfaceRoleGateTest`
- [ ] **AC-4:** `shared` declares `allowedDependencies = {}` and the structural net, `*AuthPlacementTests`,
  `CrossVenueDenialIT` and `PayoutModuleTest` are green.

## Non-goals

- Closing/registering `shared` and moving `AdminErasureController` (#1329).

## Risks

- **R-1:** BOLA on venue-scoped surfaces (#13) if a controller skips resolution → every call site swaps one-for-one;
  `CrossVenueDenialIT` stays green.
- **R-2:** An operator session whose username equals a customer email acting as that customer → the
  `customerPrincipal` flag is computed from `ROLE_CUSTOMER` at every caller, as `CurrentCustomer` did.
- **R-3:** ITs that mocked `CurrentOperator` as the identity seam → they spy `OperatorDirectory` instead, so ownership
  stays the real DB-backed bean.

## Modulith

- `operator::api.OperatorDirectory#requireOperator` + `operator::vocabulary.NoOperableOperatorException` (owner
  `operator`; consumers `availability`, `booking`, `payout`, `venue`, root). All consumers already grant
  `operator::api`/`::vocabulary`.
- `customer::api.CustomerAccountDirectory#signedInAccount/#requireSignedInAccount` +
  `customer::vocabulary.NotSignedInCustomerException` (consumers `booking`, root).
- `shared`: `allowedDependencies = {}`; `CurrentOperator`/`CurrentCustomer` deleted.

## Phases

- **Phase 0 — ports:** AC-1, AC-2 red then green.
- **Phase 1 — call sites:** swap every controller, map the exceptions in `ApiErrorHandler`, delete `Current*`,
  close `shared`; AC-3, AC-4.
- **Phase 2 — substrate:** `RESPONSIBILITIES.md`, `CLAUDE.md`, `riviera-modulith`.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** red tests for the two ports.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — ports | ⏳ | |
| 1 — call sites | | |
| 2 — substrate | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
