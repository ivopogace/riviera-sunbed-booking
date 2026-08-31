# Issue-intake grill gate (mandatory when entering at an existing issue)

Read this at plan entry, whenever work starts from an already-written GitHub issue.

> A written issue is a **snapshot of intent at creation time, not ground truth.** By the
> time you pick it up the code may have moved, a sibling slice may have changed a
> contract, an ADR may have landed, or the issue may simply have missed something nobody
> thought of at creation. **Before** you author the plan doc for an already-written issue
> you **MUST** run a `grilling` pass over it. This is a **gate, not a suggestion** — do
> not treat the issue text as correct-by-default, and "the issue looked complete" is never
> a reason to skip (that is exactly when stale ACs slip through).

## How the gate runs — every time work starts from an existing issue

1. **Trigger.** Any time you enter the loop at an **existing** issue (you grabbed `#NN`,
   or the user said "implement/work on #NN") rather than refining a fresh idea, this gate
   is **due before the Plan stage**. Refining a brand-new idea already runs `grilling` at
   the Refine stage, so it is exempt — this gate is the catch for work that *skips* Refine
   by starting from a written ticket.
2. **Grill the issue against current reality.** Load `grilling` and interrogate the ticket:
   - Are the acceptance criteria still **correct, complete, and testable today**?
   - Has the codebase moved since it was written — APIs, schema, sibling slices, ADRs,
     design tokens? Cross-check against the **actual code/spec**, not the issue's
     assumptions. (E.g. example values inlined in the issue may be stale.)
   - What did we **not** think of when we wrote it — missing states, edge cases, the
     invariants in play (esp. #2 availability, #4 cutoff, #5 money, #8 webhook-as-truth)?
   - **What else is in flight right now?** List the open PRs and active session branches
     and check for overlap with this slice: shared files (`SecurityConfig`, shared test
     fixtures, FE core/) and above all the **next Flyway version number** — `V<n>` must be
     free on `main` *and* unclaimed by any open PR's diff (case history: the #122/#127 V19
     collision). If a collision is possible, record in the plan doc **who renumbers**
     (default: the branch that merges second) and expect a merge-from-main before the PR.
   - **Is the previous sibling slice's close-out actually complete?** If this slice belongs
     to a tracking epic, verify the *previously-merged* sibling ticked the epic checklist
     (Merge close-out step 2, with its PR/commit) and closed its issue. A missed tick is a
     silent close-out gap — catching it here fixes it **one slice later** instead of at a
     retro, and you're already reading the epic (case history: epic #141).
   - **Which module should own each piece of the work?** Sanity-check the intended
     placement against `RESPONSIBILITIES.md` (Job / Not-My-Job) *before* planning: does
     any step put logic in a module whose **Not My Job** list rejects it (a refund
     *decision* in `payment`, commission *math* in `venue`, a login subsystem in
     `customer`), or that two modules both claim? Catching a misplacement here is a
     sentence in the plan; catching it at review is a diff. The plan doc then records
     the answer in its Module-ownership table (plan-doc §4a).
   - Division of labor (same rule as any grill): answer the **discoverable/factual**
     questions yourself from the code/spec and mark each "← confirm?"; escalate the
     **intent/decision** questions to the user via `AskUserQuestion`. Never auto-fill a
     product decision the human owns.
3. **Reconcile before building.** Fold the outcome into the plan doc's
   **Open questions / Assumptions** and **Acceptance criteria**. If the issue is materially
   stale, say so and **update the issue (or record the drift)** before you plan against it.
   A surprise caught at this gate is far cheaper than one caught at the review gate or in
   production.

## Escalation — drift vs. fog

Most of what the grill surfaces is **drift** — the code moved, an AC went stale — and step 3
handles it: reconcile and plan. But if the grill surfaces **fog** — a genuinely unresolved
decision the slice depends on, one that can't be settled within this slice's own session(s) —
do **not** plan against it and do not park it as a plan-doc open question: that section is for
questions the slice itself will answer. Escalate it to `wayfinder` instead — a decision ticket
on the epic's existing map, or a freshly charted map if none exists — and hold the slice until
the decision closes. The test is wayfinder's own: can you state the question sharply *and*
resolve it inside this slice? Drift reconciles here; fog gets a ticket. (Wayfinder's ticket
taxonomy — the `wayfinder:{research,grilling,prototype,task}` label values, AFK vs. HITL —
is useful vocabulary for classifying what the grill turned up, even when nothing escalates.)

## Proportional, never skipped

A one-line/copy fix needs only a quick sanity read, not a full interview; a spine-touching
slice (booking, availability, money) gets the full grill. The size flexes; the gate does not.
