# Auth placement rule for every domain module — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** every domain and closed non-context module except `auth`/`web` fails the build on a Spring
Security, Spring Session or mail type outside its `adapter.in` package (`notification`: security and
session only), proven by fixtures, while `customer`/`operator` keep their whole-module rule.

**Architecture:** `AuthPlacementRule` gains a family subset and an `adapter.in` exclusion; one
parameterised `DomainModuleAuthPlacementTests` runs the production check and the fixture proof per
module. Test-only plus docs; no production behaviour changes.

**Source of intent:** #1413 (triage brief and owner decision on the issue).

**Branch:** `feature/1413-auth-placement-domain-modules`

## Acceptance criteria

- [ ] **AC-1:** Given the production tree, when the rule runs for each of availability, booking, payment,
  payout, review, itinerary, remodel, venue, notification, challenge, audit, monitoring and shared, then it
  passes. *Seam:* `AuthPlacementRule.noLoginMachineryOutsideInboundAdapter` · *Pinned by:*
  `DomainModuleAuthPlacementTests.moduleDependsOnNoLoginSessionOrMailTypeOutsideItsInboundAdapter`
- [ ] **AC-2:** Given `authplacementfixture.<m>.LoginMachineryInModule` reaching one type per checked family,
  when the rule runs, then every field type is reported, every checked family catches one, and no other
  fixture class (control, `adapter.in` reader, notification's mail transport) is reported. *Pinned by:*
  `DomainModuleAuthPlacementTests.everyCheckedFamilyIsRejected`
- [ ] **AC-3:** Given an `Authentication` field in `authplacementfixture.inboundexemption`'s `adapter.in`,
  `adapter.out`, `adapter.inbound` and `api`, when the rule runs, then only the `adapter.in` one is clean. *Pinned by:*
  `DomainModuleAuthPlacementTests.inboundAdapterIsExemptAndTheSameTypeElsewhereIsNot`
- [ ] **AC-4:** Given a new top-level module, when it is in neither the checked list, the strict pair nor
  the edge pair, then the build fails. *Pinned by:* `DomainModuleAuthPlacementTests.everyModuleIsClassified`
- [ ] **AC-5:** `CustomerAuthPlacementTests`/`OperatorAuthPlacementTests` unchanged and green.

## Non-goals

- Controllers onto a typed principal (declined). `auth`, `web` (own the edge). Structural-net membership.

## Risks

- **R-1:** the exclusion silently widens (e.g. `adapter..`) → AC-3 and the mutation check (drop the
  exclusion → the 20 controllers fail), recorded in the PR.

## Phases

- **Phase 0 — rule + fixtures + test:** AC-1..AC-5 · red: fixture proof before the rule overload exists.
- **Phase 1 — docs:** RESPONSIBILITIES.md §Platform edge, checks table; `CustomerAccountRecovery` Javadoc.

## Execution status

- Phase 0: done — 28 cases green; mutation (exclusion off) fails the 20 adapter.in types.
- Phase 1: done — RESPONSIBILITIES.md §Platform edge + checks table; CustomerAccountRecovery Javadoc.
- PR #1435; review round 1 (medium): 2 findings fixed (exemption fixture tree; RV-BE-11 tell).
- Next: CI, Sonar, remove this plan.
