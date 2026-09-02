---
name: riviera-plan-doc
description: >-
  Plan-doc discipline for riviera-sunbed-booking: testable ACs with named seams, risk and
  open-question registers, the Modulith/availability/payment sections, the
  Execution-status state store. Load at the riviera-sdlc plan stage or when executing an
  existing plan in docs/plans/.
---

# Riviera Plan Doc

Plan-doc discipline layered on `riviera-sdlc` driving `tdd`. It is **preventive** — built
from the risks the design surfaced, not from post-mortems.
`references/plan-doc-template.md` is the single home of section guidance. Load at the plan
stage, and again when picking up a plan to execute in a fresh session.

## Required artifacts

- **A plan doc** at `docs/plans/<short-slug>.md`, following the template exactly. Empty
  sections are filled with `N/A — <reason>`, not deleted.
- **A branch** named `<feature|bugfix>/<short-slug>`, existing before phase 0 (in a cloud
  session the designated remote branch stands in; record that in the Branch line).
- **A live Execution-status section** — stage pointer + next action, a status row per
  phase, the findings register — updated in the same commit window as the change it
  records, at every stage transition. It is the session-recovery anchor.
- **An empty Open Questions / Assumptions section by the time "done" is claimed**, or
  remaining items each cite a follow-up issue.
- **A lifetime that ends at merge.** The plan doc is working state: it is deleted at the next
  close-out of any kind (`riviera-docs-freshness` § *Plan-doc retirement*), so nothing durable —
  code comments, ADRs, skills — cites its path; cite the issue or PR. Anything only the plan
  records and a later slice needs goes to that issue, the ADR, or the Javadoc first.

Intent comes from the spec in `docs/superpowers/specs/` or a GitHub issue; reference `#NN`
in commits and the plan doc.

## At plan time

0. **Run the `riviera-sdlc` Skill-routing gate first — before authoring any design.** Load
   the matched skills and design each section through them. Record every loaded skill + one
   phrase on what it changed in **Skills consulted**; re-run the gate whenever a phase enters
   an area the plan didn't anticipate. The template pre-fills the line's five constant
   entries — extend them, don't replace them.
1. **Acceptance criteria before phase 0:** convert the user stories (or issue) into testable
   ACs per the template (Given/When/Then, named test class, written at the inner hexagon).
   **Each AC names its seam** — `tdd` writes no test at an unconfirmed seam, and this section
   is where seams are confirmed; an unnamed seam blocks phase 0 like a missing AC. (Plan docs
   agreed before 2026-08-31 predate the *Seam* field — when re-entering one, name the seam
   for the AC you are about to pin; don't halt over the rest.)
2. **Risk register + Open Questions before phase 0.** An open question the slice itself can
   answer may be discharged directly — `research` for docs/API legwork, `prototype` for a
   shape that has to be felt — closing the entry with the note or verdict as its citation.
   One the slice cannot answer is fog: escalate per `riviera-sdlc`'s issue-intake gate,
   never park it in the register.
3. **Availability & concurrency:** if the feature touches booking, the beach map, or
   `availability`, fill the section stating how invariant #2 is upheld.
4. **Spring Modulith:** if any backend code is in scope, fill the modules / interfaces /
   events section, with `codebase-design` for the seams. **4a. Module ownership:** whenever
   the slice adds or moves behavior, fill the Module-ownership table, checked against
   `RESPONSIBILITIES.md` (Job / Not-My-Job).
5. **Payment & payout:** if money moves, fill the section (collect-only, no Stripe Connect)
   and load `riviera-stripe-payments`.
6. **Decompose into PR-sized phases.** Each phase merges to the feature branch and is
   independently reviewable; TDD red-green per task, at seams named in the plan.
7. **Behavior-parity ledger — if the slice retires or replaces an existing surface.** Do it
   early (it shapes the ACs and Non-goals): enumerate the OLD surface's behaviors and mark
   each preserved / changed / dropped (with reason). A "restyle/refactor only" claim is not
   self-justifying — verify it behavior by behavior.

## At execution time

1. **Per-phase generalization pass after every bug fix or new pattern.** Ask where else it
   applies and record the search and decision in the Generalization-audit log.
   **Enumerate the population by mechanism, not by resemblance:** first name the mechanism
   the defect needs (calls git, writes `availability`, listens to `BookingCancelled`, reads a
   `@Profile`), then enumerate every member with a command, then judge each member. The
   recorded command must be the one that *found* the population, not one that confirmed
   members you had already guessed.
2. **Use `AskUserQuestion` for forks the evidence can't settle** — anything that changes the
   availability strategy, a module boundary, the payment flow, or a public `api/` port.
   Decide naming/style yourself.
3. **Run the Self-review checklist before claiming done.** Unchecked items mean not done.
   **3a. Reconcile the File-structure section with the diff by running the guard:**

   ```bash
   node scripts/check-plan-file-structure.mjs --diff origin/main
   ```

   The plan doc itself must be staged or committed — merely written, the guard
   short-circuits and passes.
4. **Scope test runs to the smallest set that proves the change** — recipes in
   `riviera-local-debug`; load it before the session's first build/test invocation.

## Anti-patterns

- **Don't write `N/A` in the Availability & concurrency section to save time.** If the
  feature touches booking or the map, that section is the point of the plan.
- **Don't write acceptance criteria as prose.** "Fast and reliable" is not an AC. "Given
  two clients reserving set 12 on 2026-07-01 concurrently, when both submit, then exactly
  one booking is `CONFIRMED` and the other gets `409 SET_TAKEN`, pinned by
  `ConcurrentReservationIT`" is.
- **Don't resolve an Open Question by deleting it.** Move it under `### Resolved` with the
  outcome and commit SHA.

## When NOT to use

- Trivial changes (one-line fix, copy tweak, dependency bump) and throwaway spikes.
  If unsure, load it anyway.

## Integration

- `riviera-review-overlay` at the review gate: RV-BE-11 re-checks the Module-ownership
  table against the diff; RV-PROC-1 re-checks *Skills consulted*.
