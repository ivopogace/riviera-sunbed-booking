---
name: riviera-plan-doc
description: Use at the plan stage of riviera-sdlc, or whenever writing or executing a plan for riviera-sunbed-booking work. Adds project-specific plan-doc discipline — mandatory testable acceptance criteria, a risk register, an open-questions register, and dedicated sections for the Spring-Modulith modules/events touched, the availability single-source-of-truth invariant, and the payment/payout flow. Pairs with the plan-doc template at references/plan-doc-template.md. The execution engine is tdd at the plan's named seams (/implement is the human's entry command, not a model route); the superpowers writing-plans/executing-plans plugin also works if present.
---

# Riviera Plan Doc

## Overview

A project-local **plan-doc discipline** layered on the active planning/execution
engine — here `riviera-sdlc` driving Pocock's `implement` + `tdd` (superpowers
`writing-plans`/`executing-plans` also work if installed). It does not replace the
engine; it adds the plan-doc structure this marketplace needs, with
`references/plan-doc-template.md` as the **single home of section guidance**.

Riviera is greenfield — no backlog of post-mortems — so this skill is
**preventive**, built from the risks the design surfaced; the invariants at stake
(#1 JDBC-only, #2 availability, #8 payments, #11 module boundaries) are canonical
in `CLAUDE.md`.

Load at the **plan stage** when starting a riviera feature, and again when picking
up a riviera plan to **execute** in a fresh session.

**Announce at start:** "I'm using the riviera-plan-doc skill to enforce
project-specific plan-doc discipline."

## Required artifacts

Every riviera feature large enough to need a plan doc gets:

- **A plan doc** at `docs/plans/<short-slug>.md`, following
  `references/plan-doc-template.md` exactly. Empty sections are filled with
  `N/A — <reason>`, not deleted.
- **A branch** named `<feature|bugfix>/<short-slug>`, existing before phase 0.
- **A live Execution-status section** — stage pointer + next action, a status row
  per phase, and the findings register — updated in the **same commit window** as
  the change it records, at every stage transition. It is the session-recovery
  anchor (the template's blockquote carries the rule; `riviera-sdlc` §Context
  hygiene carries the why).
- **An empty Open Questions / Assumptions section by the time "done" is claimed**,
  or remaining items each cite a follow-up issue.

There is no Jira here — intent comes from the **spec** in `docs/superpowers/specs/`
or, for smaller items, a **GitHub issue**; reference `#NN` in commits and the plan doc.

## Workflow additions at plan time

0. **Run the `riviera-sdlc` Skill-routing gate FIRST — before authoring any design.**
   That table is the authority for which craft skills each touched area triggers; do
   not re-derive it here. Load the matched skills and design each section *through*
   them — an area designed from first principles "to verify later" gets the skill's
   corrections only after the design is anchored, no longer cheap. Record every
   loaded skill + one phrase on what it changed in **Skills consulted**, and keep it
   current: re-run the gate whenever a phase enters an area the plan didn't anticipate.
   The template pre-fills the line's five constant entries (the routing table's
   "Anything, always" row — that table stays the authority, so the two cannot drift):
   RV-PROC-1 caught an omission on six consecutive slices when the line was free prose —
   not six careless authors but a template asking a question whose answer is partly
   constant, so the author now **edits rather than recalls** (case history:
   `riviera-sdlc` `references/case-history.md` #447).

1. **Acceptance criteria before phase 0:** convert the spec's user stories (or the
   GitHub issue) into testable ACs per the template (Given/When/Then, named test
   class, written at the inner hexagon). **Each AC names its seam** — `tdd` writes no
   test at an unconfirmed seam, and this section is where the confirmation happens, so
   an unnamed seam blocks phase 0 exactly as a missing AC does. Forward-only: plan docs
   agreed before 2026-08-31 predate the *Seam* field — when re-entering one, name the
   seam for the AC you are about to pin; don't halt over the rest.
2. **Risk register + Open Questions before phase 0:** fill both sections per the
   template — its blockquote carries the risk categories that already matter here.
3. **Availability & concurrency:** if the feature touches booking, the beach map,
   or `availability`, fill the section per the template, stating how invariant #2
   (no double-sold set) is upheld — the highest-leverage section in the plan.
4. **Spring Modulith:** if any backend code is in scope, fill the modules /
   interfaces / events section per the template, with `codebase-design` for the seams.
   **4a. Module ownership:** whenever the slice adds or moves behavior, fill the
   template's Module-ownership table (§4a), checked against `RESPONSIBILITIES.md`
   (Job / Not-My-Job).
5. **Payment & payout:** if money moves, fill the section per the template — name
   the model (collect-only, **no Stripe Connect**) — and load `riviera-stripe-payments`.
6. **Decompose into PR-sized phases.** Each phase merges to the feature branch and
   is independently reviewable; prefer a TDD red-green shape per task, at seams named
   in the plan (`tdd` keeps refactoring in the review stage, out of the loop).
7. **Behavior-parity ledger — if the slice retires or replaces an existing surface.**
   Do this **early** (it shapes the ACs and Non-goals): fill the template's
   Behavior-parity ledger — enumerate the OLD surface's behaviors and mark each
   **preserved / changed / dropped (with reason)**. A "restyle/refactor only, no
   behavior change" claim is **not self-justifying** — verify it behavior-by-behavior
   here. (Case history: O6 #176 — told in the template's ledger blockquote.)

## Workflow additions at execution time

1. **Per-phase generalization pass after every bug fix or new pattern.** Ask: where
   else does this apply? (A fix to one availability write path probably applies to the
   staff-mark path too.) Record the search and decision in the Generalization-audit log.

   **Enumerate the population by mechanism, not by resemblance.** "Where else does this
   apply?" invites you to list the places that *look like* the one in front of you, and
   that list is drawn from what you already have in mind — so whatever you never thought
   of stays invisible, and the audit returns clean. Instead, first name the **mechanism**
   the defect needs (calls git, writes `availability`, listens to `BookingCancelled`,
   reads a `@Profile`), then enumerate every member of that population with a command,
   then judge each member. The search command in the log is the evidence: it should be
   the one that *found* the population, not one that confirmed the members you had
   already guessed.

   > **Case history (#641).** PR #618 fixed five false-clean defects across the repo's
   > guards, and its audit log twice asks whether a defect is "true of the other two
   > guards as well", answering "all three" both times. There were **four**:
   > `check-comment-only.mjs` invokes git exactly like its siblings, but it is whole-file
   > rather than diff-scoped, so it did not resemble them and was never enumerated. It
   > carried every one of those defects for eight further PRs. `git ls-files 'scripts/*.mjs'
   > | xargs grep -l "execFileSync\('git'" ` would have returned four on day one.
2. **Use AskUserQuestion for forks the evidence can't settle** — anything that
   changes the availability strategy, a module boundary, the payment flow, or a
   public `api/` port. Decide naming/style yourself.
3. **Run the Self-review checklist before claiming done.** Unchecked items are
   evidence the feature is not done, not "minor cleanup."
   **3a. Reconcile the File-structure section with the diff — by running the guard, not by eye:**

   ```bash
   node scripts/check-plan-file-structure.mjs --diff origin/main
   ```

   The sharpest trap: **the plan doc itself must be staged or committed** — merely written, the
   guard short-circuits and passes. Everything else (#654 untracked-path judging, #533 CI
   enforcement, the five-consecutive-slices history, the accepted path idioms): the template's
   File-structure blockquote.
4. **Scope test runs to the smallest set that proves the change** — the run recipes
   live in `riviera-local-debug`; load it before the session's first build/test invocation.

## Resources in this skill directory

- `references/plan-doc-template.md` — the canonical riviera plan-doc template and
  the single home of section guidance (what each section must contain lives in its
  blockquote). Copy it as the starting point for every feature; keep the structure.

## Anti-patterns to avoid

- **Don't write `N/A` in the Availability & concurrency section to save time.** If
  the feature touches booking or the map, that section is the point of the plan.
- **Don't write acceptance criteria as prose.** "Fast and reliable" is not an AC.
  "Given two clients reserving set 12 on 2026-07-01 concurrently, when both submit,
  then exactly one booking is `CONFIRMED` and the other gets `409 SET_TAKEN`,
  pinned by `ConcurrentReservationIT`" is.
- **Don't resolve an Open Question by deleting it.** Move it under `### Resolved`
  with the outcome and commit SHA.

## When NOT to use this skill

- Trivial changes (one-line fix, copy tweak, dependency bump).
- Throwaway spikes (mark the branch as such and skip the plan doc).

If unsure, load it anyway — an unnecessary plan doc costs one file; a missing one
on a feature that touches availability or payments costs a trust-breaking bug.

## Integration

- **Engine:** `riviera-sdlc` (the orchestrator — loads this skill at the plan stage,
  routes the lifecycle skills `to-issues`/`triage`/`diagnosing-bugs`) → Pocock
  `implement` + `tdd`; superpowers `writing-plans`/`executing-plans` if present.
- **Template:** `references/plan-doc-template.md` — every section's guidance lives there.
- **Upstream:** the design spec in `docs/superpowers/specs/` (the source of
  intent); `grilling` when requirements are genuinely ambiguous.
- **Co-load per the `riviera-sdlc` Skill-routing table** (the authority): `postgres`
  (migrations), `codebase-design` + `domain-modeling` (module seams & vocabulary),
  `riviera-java-conventions` (backend Java idioms), `riviera-stripe-payments` (money).
- `riviera-frontend` + `angular-developer` — for frontend surfaces (structure /
  folder placement, then Angular standards); consult the latter's `references/`
  for signals, forms, routing, and testing detail.
- **At the review gate:** `riviera-review-overlay` — RV-BE-11 re-checks the
  Module-ownership table against the diff; RV-PROC-1 re-checks *Skills consulted*.
