---
name: riviera-plan-doc
description: >-
  Plan-doc discipline for riviera-sunbed-booking: testable ACs with named seams, risk and
  open-question registers, the Modulith/availability/payment sections, the
  Execution-status state store. Load at the riviera-sdlc plan stage or when executing an
  existing plan in docs/plans/.
---

# Riviera Plan Doc

`references/plan-doc-template.md` is the single home of section guidance. Load at the plan
stage and again when picking up a plan in a fresh session. The plan is preventive: its
sections are built from the risks the design surfaced, not from post-mortems.

## Required artifacts

- `docs/plans/<short-slug>.md`, following the template exactly; empty sections read
  `N/A — <reason>`.
- A branch `<feature|bugfix>/<short-slug>` before phase 0 (cloud: the designated branch, noted
  in the Branch line).
- A live Execution-status section, updated in the same commit window as what it records.
- Open Questions empty (or each citing a follow-up issue) before "done".
- The plan is deleted at the next close-out after merge (`riviera-docs-freshness`
  § *Plan-doc retirement*); rationale a later slice needs goes to `RESPONSIBILITIES.md` or an
  ADR first.

## At plan time

0. Run the `riviera-sdlc` Skill-routing gate before any design; record each skill and what it
   changed in **Skills consulted** (extend the five pre-filled entries).
1. ACs before phase 0: Given/When/Then, named test, at the inner hexagon, **each naming its
   seam** — an unnamed seam blocks phase 0.
2. Risk register + Open Questions before phase 0. A question the slice can answer →
   `research` or `prototype`, closed with the note as citation. One it cannot → fog, escalate
   per the issue-intake gate; never park it.
3. Availability & concurrency section if booking, the beach map or `availability` is touched.
4. Spring Modulith section if any backend code; `codebase-design` for seams. **4a** Module
   ownership table whenever behaviour is added or moved, checked against `RESPONSIBILITIES.md`.
5. Payment & payout section if money moves; load `riviera-stripe-payments`.
6. Decompose into independently reviewable phases, TDD red-green per task.
7. Behaviour-parity ledger if the slice retires or replaces a surface: every old behaviour
   marked preserved / changed / dropped with reason. "Restyle only" is not self-justifying.

## At execution time

1. After every bug fix or new pattern, a generalization pass: name the **mechanism** the
   defect needs, enumerate every member with a command, judge each; log the command that
   found the population.
2. `AskUserQuestion` for forks the evidence can't settle (availability strategy, module
   boundary, payment flow, public `api/` port). Decide naming/style yourself.
3. Self-review checklist before claiming done. Reconcile File structure with the diff:
   `node scripts/check-plan-file-structure.mjs --diff origin/main` (the plan must be staged or
   committed, else the guard short-circuits).
4. Scope test runs per `riviera-local-debug`.

## Anti-patterns

- `N/A` in Availability & concurrency when the feature touches booking or the map.
- ACs as prose. "Given two clients reserving set 12 on 2026-07-01 concurrently, when both
  submit, then exactly one is `CONFIRMED` and the other gets `409 SET_TAKEN`, pinned by
  `ConcurrentReservationIT`" is an AC.
- Deleting an Open Question instead of moving it under `### Resolved` with outcome + SHA.

Skip for one-line fixes, copy tweaks, dependency bumps, spikes. RV-BE-11 re-checks the
ownership table; RV-PROC-1 re-checks *Skills consulted*.
