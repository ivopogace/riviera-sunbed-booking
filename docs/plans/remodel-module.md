# Remodel module Implementation Plan

> A pure move (ADR-0028 Decision 4): no behaviour change, so no new tests; the existing remodel
> ITs and the structural net are the proof.

**Goal:** the nine `Remodel*` root classes live in a closed `ai.riviera.platform.remodel` module
shaped like `itinerary`, `RemodelGate` lives in `venue.spi`, and the root no longer reaches `venue`
or `booking`.

**Architecture:** controllers, request/response records and the assembler go to
`remodel.adapter.in`; `RemodelCommitService` and `RemodelCommitOutcome` to `remodel.application`
(public: `adapter/in`, `WebSliceStubs` and the root race ITs use them). `remodel` supplies
`venue.spi.RemodelGate` as a lambda, so it is granted `venue::spi`.

**Source of intent:** #1327 (ADR-0028 Decision 4)

**Branch:** `feature/remodel-module`

## Acceptance criteria

- [ ] **AC-1:** Given the moved tree, when `ApplicationModules.verify()` runs, then `remodel`'s
  imports fit `venue::{api,vocabulary,spi}`, `booking::{api,vocabulary}`,
  `operator::{api,vocabulary}`, `shared`. *Seam:* Modulith model · *Pinned by:* `ModularityTests`
  and the rest of the structural net.
- [ ] **AC-2:** Given `GRANTED_SURFACES` without the `venue` and `booking` rows, when the root is
  inspected, then nothing in it reaches either. *Pinned by:* `CompositionRootDisciplineTests`.
- [ ] **AC-3:** Given the remodel endpoints, when preview, commit and a non-owner's call run, then
  they answer as before. *Seam:* `POST /api/venues/{id}/beach-map/{preview,commit}` · *Pinned by:*
  `RemodelPreviewIT`, `RemodelCommitIT`, `CrossVenueDenialIT`, `MoveVsReserveConcurrencyIT`,
  `WeatherRefundLockOrderIT`.
- [ ] **AC-4:** Given `payout`'s module test, when it boots without the remodel ports mocked, then
  the context loads. *Pinned by:* `PayoutModuleTest`.

## Risks

- **Blast radius:** the two remodel ports leave the root bootstrap; any `@ApplicationModuleTest`
  mocking them for the root controllers loses the need (only `PayoutModuleTest` did).
- **Sibling slices** (#1325, #1329) touch the root, `CompositionRootDisciplineTests`, CLAUDE.md and
  `RESPONSIBILITIES.md`: the branch merging second merges `main` and resolves.

## Modulith

`remodel`: closed, full, no table, no published surface. `RemodelGate` moves `venue.api` →
`venue.spi` (RV-BE-3b: another module implements it). Owner check stays in each port (#13).

## Phases

1. Move + grants + test wiring; structural net, `CompositionRootDisciplineTests`, remodel ITs.
2. Substrate: CLAUDE.md, `RESPONSIBILITIES.md` § `remodel`, `domain-model.md`, `ModularityTests`
   Javadoc, `riviera-modulith`.

## Execution status

- Phase 1: in progress.
- Phase 2: in progress.
