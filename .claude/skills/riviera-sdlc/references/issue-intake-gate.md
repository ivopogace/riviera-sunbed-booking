# Issue-intake grill gate (mandatory when entering at an existing issue)

A written issue is a snapshot; the code, sibling slices and ADRs may have moved. "The issue
looked complete" never skips this.

1. Load `grilling` and interrogate the ticket against the tree:
   - Are the ACs still correct, complete and testable? Cross-check against code/spec.
   - What did it miss — states, edge cases, invariants (#2, #4, #5, #8)?
   - **What is in flight?** List open PRs and session branches; check shared files
     (`SecurityConfig`, test fixtures, FE `core/`) and the **next Flyway `V<n>`** — free on
     `main` AND unclaimed by any open PR. Record who renumbers (default: the branch merging
     second).
   - **Previous sibling's close-out done?** Epic checklist ticked with its PR number, issue
     closed; fix a missed tick now.
   - **Which module owns each piece?** Check against `RESPONSIBILITIES.md` Job / Not-My-Job
     (a refund *decision* in `payment`, commission *math* in `venue`, login in `customer` are
     wrong). Record in the plan's Module-ownership table (§4a).
   - Answer factual questions yourself from the code and mark "← confirm?"; put intent and
     product decisions to the user via `AskUserQuestion`.
2. Fold the outcome into the plan's Open questions and ACs. If the issue is materially
   stale, update it before planning against it.

**Drift vs fog.** Drift (code moved, AC stale) reconciles here. Fog (a decision the slice
cannot settle in its own sessions) is not parked as an open question — escalate to
`wayfinder` and hold the slice.

Proportional, never skipped: a copy fix gets a sanity read; a booking/availability/money
slice gets the full grill.
