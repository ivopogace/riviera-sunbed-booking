---
name: riviera-plan-doc
description: >-
  Plan-doc discipline for riviera-sunbed-booking: testable ACs with named seams, risks and
  open questions, the Modulith/availability/payment sections, the Execution-status state
  store. Load at the riviera-sdlc plan stage or when executing an existing plan in docs/plans/.
---

# Riviera Plan Doc

`references/plan-doc-template.md` is the shape. The plan is preventive: its sections come from
the risks the design surfaced. Its main job across sessions is Execution status.

## Required

- `docs/plans/<short-slug>.md` on the slice's branch. Omit a conditional section that doesn't
  apply rather than writing `N/A`.
- A live Execution status, updated in the same commit window as what it records.
- Open Questions empty (or each citing a follow-up issue) before "done".
- Deleted in the PR's last commit before merge, after anything a later slice needs moves to
  `RESPONSIBILITIES.md`, an ADR or the issue (`riviera-sdlc` `references/pr-gates.md` §3).

## At plan time

1. ACs before phase 0: Given/When/Then, at the inner hexagon, **each naming its seam** and the
   test that pins it — an unnamed seam blocks phase 0.
2. Risks and Open Questions before phase 0. A question the slice can answer → `research` or
   `prototype`. One it cannot → fog, escalate per the issue-intake gate; never park it.
3. Availability & concurrency section if booking, the beach map or `availability` is touched.
4. Modulith section if backend structure changes (new port, event, module or cross-module call);
   check each new capability's owner against `RESPONSIBILITIES.md` Job / Not My Job.
5. Payment & payout section if money moves; load `riviera-stripe-payments`.
6. Decompose into independently reviewable phases, red-green per task.
7. Behaviour-parity ledger if the slice retires or replaces a surface: every old behaviour
   marked preserved / changed / dropped with reason. "Restyle only" is not self-justifying.

## At execution time

1. After a bug fix, find the siblings: name the mechanism the defect needs, enumerate every
   member with a command, judge each.
2. `AskUserQuestion` for forks the evidence can't settle (availability strategy, module
   boundary, payment flow, public `api/` port). Decide naming/style yourself.
3. Scope test runs per `riviera-local-debug`.

## Anti-patterns

- Skipping Availability & concurrency when the feature touches booking or the map.
- ACs as prose. "Given two clients reserving set 12 on 2026-07-01 concurrently, when both
  submit, then exactly one is `CONFIRMED` and the other gets `409 SET_TAKEN`, pinned by
  `ConcurrentReservationIT`" is an AC.
- Writing the implementation into the plan: phases name the behaviour and the test, the code
  lives in the diff.

Skip for small fixes, copy tweaks, dependency bumps, spikes.
