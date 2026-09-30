# At least one active admin Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** no suspend, however concurrent, leaves the platform without an `ACTIVE` admin, and a suspend by an admin
suspended meanwhile does nothing.

**Architecture:** a suspend names its actor. It locks every admin row, plus actor and target, `FOR UPDATE` in id
order in a statement of its own, then reads them. It refuses when the target is an active admin and no other active
admin would remain (`LastActiveAdmin`, 409 `LAST_ACTIVE_ADMIN`), then when the actor is no longer an active admin
(`ActorNotActiveAdmin`, 403). The rule is checked first so both refusals stay reachable: two admins suspending each
other hit the rule; a third admin suspending the actor mid-flight hits the actor check.

**Source of intent:** #1311 (sweep for #1298). Owner decision: enforce "at least one active admin" as a named rule,
plus the actor check.

**Branch:** `bugfix/last-active-admin`

## Acceptance criteria

- [x] **AC-1:** Given admins X and Y, when each suspends the other at once, then exactly one is suspended, one stays
  `ACTIVE`, and the loser answers `LastActiveAdmin`. *Seam:* `OperatorLifecycle.suspend(actor, target)` racing itself
  · *Pinned by:* `AdminQuorumRaceIT.twoAdminsSuspendingEachOtherLeaveOneActive` (red on `main`'s logic: both suspended).
- [x] **AC-2:** Given admins X, Y and Z, when Z suspends X while X's suspend of Y waits, then X's suspend answers
  `ActorNotActiveAdmin` and Y stays `ACTIVE`. *Pinned by:* `AdminQuorumRaceIT.aSuspendByAnAdminSuspendedMeanwhileDoesNothing`.
- [x] **AC-3:** the edge maps `LastActiveAdmin` to 409 `LAST_ACTIVE_ADMIN` and `ActorNotActiveAdmin` to 403
  `NOT_AN_ACTIVE_ADMIN`, revoking nothing. *Pinned by:* `AdminOperatorControllerTest`.
- [x] **AC-4:** the operator lifecycle, visibility and security suites and the structural net stay green.

## Non-goals

- The same actor check on approve, reject and reinstate (none of them can remove an admin).
- #1317 (where the auth classes live).

## Risks

- **R-1 (a new cycle):** the only multi-row operator locks are this one, in id order. Other operator writes lock one
  row. Session revocation runs at the edge outside the transaction.
- **R-2 (the console):** any refused action already shows "That didn't go through" and reloads the list; no
  frontend change.
- **R-3 (#13):** admin endpoints stay role-gated and ownership-exempt.

## Modulith

- `OperatorLifecycle#suspend(actor, target)`: the port's existing conversation; its one consumer is the edge's
  `AdminOperatorController`. `OperatorLifecycleOutcome` gains `LastActiveAdmin` and `ActorNotActiveAdmin`.

## Phases

- **Phase 0 — split:** `suspend` takes the actor, no behaviour change.
- **Phase 1 — red:** AC-1, AC-2.
- **Phase 2 — rule:** the locked read, both refusals, the edge mapping (AC-3).
- **Phase 3 — docs:** `RESPONSIBILITIES.md` §operator, Javadoc.

## Execution status

**Stage pointer:** review

**Next action:** PR, review gate (+ Modulith reviewer: the port changed), plan removal, CI and Sonar, merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — split | ✅ | fa982b97 |
| 1 — red | ✅ | 098cfc87 |
| 2 — rule | ✅ | cdc1ff43 |
| 3 — docs | ✅ | cdc1ff43 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
