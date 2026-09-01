# Issue-intake grill gate (mandatory when entering at an existing issue)

Read at plan entry whenever work starts from an already-written GitHub issue. A written
issue is a snapshot of intent at creation time, not ground truth: the code may have moved,
a sibling slice may have changed a contract, an ADR may have landed. Refining a brand-new
idea already runs `grilling` at Refine and is exempt; this gate catches work that skips
Refine by starting from a ticket. "The issue looked complete" is never a reason to skip.

## Procedure

1. **Load `grilling` and interrogate the ticket against current reality:**
   - Are the acceptance criteria still correct, complete, and testable today?
   - Has the codebase moved since it was written — APIs, schema, sibling slices, ADRs,
     design tokens? Cross-check against the actual code/spec, not the issue's assumptions.
   - What did the issue not think of — missing states, edge cases, the invariants in play
     (esp. #2 availability, #4 cutoff, #5 money, #8 webhook-as-truth)?
   - **What else is in flight?** List the open PRs and active session branches and check
     for overlap: shared files (`SecurityConfig`, shared test fixtures, FE `core/`) and above
     all the **next Flyway version number** — `V<n>` must be free on `main` *and* unclaimed
     by any open PR's diff. If a collision is possible, record in the plan doc who renumbers
     (default: the branch that merges second) and expect a merge-from-main before the PR.
   - **Is the previous sibling slice's close-out complete?** If this slice belongs to a
     tracking epic, verify the previously-merged sibling ticked the epic checklist (with its
     PR number) and closed its issue; fix a missed tick now.
   - **Which module owns each piece of the work?** Check the intended placement against
     `RESPONSIBILITIES.md` (Job / Not-My-Job) before planning: does any step put logic in a
     module whose Not-My-Job list rejects it (a refund *decision* in `payment`, commission
     *math* in `venue`, a login subsystem in `customer`), or that two modules both claim?
     The plan doc records the answer in its Module-ownership table (§4a).
   - Division of labor: answer discoverable/factual questions yourself from the code/spec
     and mark each "← confirm?"; escalate intent/decision questions to the user via
     `AskUserQuestion`. Never auto-fill a product decision the human owns.
2. **Reconcile before building.** Fold the outcome into the plan doc's Open questions /
   Assumptions and Acceptance criteria. If the issue is materially stale, say so and update
   the issue (or record the drift) before planning against it.

## Escalation — drift vs. fog

Most of what the grill surfaces is **drift** (the code moved, an AC went stale): reconcile
and plan. If it surfaces **fog** — an unresolved decision the slice depends on that cannot
be settled within this slice's own session(s) — do not plan against it and do not park it as
a plan-doc open question (that section is for questions the slice itself will answer).
Escalate to `wayfinder` — a decision ticket on the epic's existing map, or a fresh map — and
hold the slice until the decision closes. The test: can you state the question sharply
*and* resolve it inside this slice? Drift reconciles here; fog gets a ticket.

## Proportional, never skipped

A one-line/copy fix needs a quick sanity read; a spine-touching slice (booking,
availability, money) gets the full grill. The size flexes; the gate does not.
