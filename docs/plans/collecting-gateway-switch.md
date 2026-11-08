# Payment-path jobs under any collecting gateway Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the abandoned-payment sweep and the money-path alert check switch on for any gateway that
really collects, and adding a provider never edits them.

**Architecture:** a Spring profile group, `collecting-gateway`, that each collecting provider's
profile joins in `application.properties` (`spring.profiles.group.stripe=collecting-gateway`). Jobs
name the group, never a provider. A profile group is the one mechanism available before beans exist
that adds no module edge: `monitoring` has `allowedDependencies = {}`, so it cannot ask
`payment.api.CollectionGuarantee`, and a run-time `if` would leave the jobs and `@EnableScheduling`
wired under the stub.

**Source of intent:** #1689; ADR-0029 decision 11.

**Branch:** `claude/1689-jobs-collecting-gateway-0adef5` (the wave's designated branch).

## Acceptance criteria

- [ ] **AC-1:** Given the `stripe` profile, when the context loads, then `AbandonedBookingScheduler`,
  `BookingSchedulingConfig` and `MoneyPathAlertCheck` are beans. *Seam:* the real
  `application.properties` through `ApplicationContextRunner` · *Pinned by:*
  `AbandonedSweepGatewaySwitchTest.activeUnderStripe`, `MoneyPathAlertGatewaySwitchTest.activeUnderStripe`
- [ ] **AC-2:** Given the default profile, when the context loads, then none of them is a bean. *Seam:*
  same · *Pinned by:* the two tests' `absentUnderTheDefaultStub`
- [ ] **AC-3:** Given a profile the components have never heard of that joins the group, when the
  context loads, then they are beans; and the group's members are exactly the profiles whose
  `CollectionGuarantee` answers `true`. *Seam:* the group property; `CollectionGuarantee`'s `@Profile`
  · *Pinned by:* the two tests' `activeUnderAnyProfileJoiningTheSwitch`,
  `PaymentGatewayContractCoverageArchitectureTest.theSwitchIsJoinedByExactlyTheCollectingGateways`
- [ ] **AC-4:** Given a production class outside `payment.adapter.out` whose or whose member's
  `@Profile` names a provider profile, when the structural net runs, then it fails naming the class.
  *Seam:* the compiled tree · *Pinned by:* `ProviderProfileConfinementArchitectureTests`, proven red
  on fixtures
- [ ] **AC-5:** `RESPONSIBILITIES.md`, `docs/deploy/production-hardening.md` and
  `docs/runbooks/observability.md` say "collecting gateway only".

## Non-goals

- Editing `StubPaymentGateway`'s `!stripe`: the slice that adds a provider owns the "exactly one
  gateway" expression, and two gateway beans fail the boot loudly.
- The alert's webhook path default, which is `riviera.observability.alert.webhook-uri` and belongs
  with the slice that ships another provider's webhook controller.
- Reconciliation (#102), which reuses the switch.

## Risks

- **R-1:** `stripe` active but the group line lost: the sweep silently stops and sets stay claimed
  (#2 fails safe, but unsellable). → The group line is pinned against `CollectionGuarantee` by the
  exact-set test and through the real properties file by the wiring tests.
- **R-2:** `@ActiveProfiles("stripe")` ITs not expanding the group. → Boot's config-data `Profiles`
  expands groups for test-activated profiles; `AbandonedBookingSweepIT` runs it end to end.
- **R-3:** a typo in the group name in a job's `@Profile` leaves it silently off. → Each job's wiring
  test goes red.

## Open questions

### Resolved

- Composed annotation vs literal: literal, matching every other `@Profile` here. A named annotation
  is `payment`'s to own, which `monitoring`'s empty grants forbid, and `shared` admits by ownership.

## Modulith

No new port, event or grant: the switch is deployment configuration, so `booking` and `monitoring`
gain no edge to `payment`. `ProviderProfileConfinementArchitectureTests` joins the structural net:
it holds the whole tree to one standard keyed on package and annotation, without Spring.

## Payment & payout

No money movement changes. Under `stripe` the sweep's guarded `UPDATE`, the void and the claim
release (#2) are untouched; `stripe` runs exactly what it ran.

## Phases

- **Phase 0 — red:** all pinning tests · red on `main`'s tree.
- **Phase 1 — the switch:** the group line, the three `@Profile`s, Javadoc and properties comments.
- **Phase 2 — docs:** runbooks, `RESPONSIBILITIES.md`, the net's listings.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** write the red tests.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 | in progress | |
| 1 | pending | |
| 2 | pending | |
