---
name: riviera-plan-doc
description: Use at the plan stage of riviera-sdlc, or whenever writing or executing a plan for riviera-sunbed-booking work. Adds project-specific plan-doc discipline — mandatory testable acceptance criteria, a risk register, an open-questions register, and dedicated sections for the Spring-Modulith modules/events touched, the availability single-source-of-truth invariant, and the payment/payout flow. Pairs with the plan-doc template at references/plan-doc-template.md. The execution engine is Pocock implement + tdd (installed); the superpowers writing-plans/executing-plans plugin also works if present.
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
  the change it records (the same commit or the immediately-following one, nothing
  unrelated between; the rule covers every plan-doc update, incl. *Skills
  consulted*) and at every SDLC stage transition. It is the **session-recovery
  anchor**: after a context compaction or in a fresh session, re-read it before
  acting (the template's blockquote carries the rule; `riviera-sdlc` §Context
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

1. **Acceptance criteria before phase 0:** convert the spec's user stories (or the
   GitHub issue) into testable ACs per the template (Given/When/Then, named test
   class, written at the inner hexagon).
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
   is independently reviewable; prefer a TDD red-green-refactor shape per task.
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
2. **Use AskUserQuestion for forks the evidence can't settle** — anything that
   changes the availability strategy, a module boundary, the payment flow, or a
   public `api/` port. Decide naming/style yourself.
3. **Run the Self-review checklist before claiming done.** Unchecked items are
   evidence the feature is not done, not "minor cleanup."
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
