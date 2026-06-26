---
name: riviera-plan-doc
description: Use at the plan stage of riviera-sdd, or whenever writing or executing a plan for riviera-sunbed-booking work. Adds project-specific plan-doc discipline — mandatory testable acceptance criteria, a risk register, an open-questions register, and dedicated sections for the Spring-Modulith modules/events touched, the availability single-source-of-truth invariant, and the payment/payout flow. Pairs with the plan-doc template at references/plan-doc-template.md. The execution engine is Pocock implement + tdd (installed); the superpowers writing-plans/executing-plans plugin also works if present.
---

# Riviera Plan Doc

## Overview

This skill is a project-local **plan-doc discipline** layered on whatever
planning/execution engine is active. In this repo that engine is **`riviera-sdd`**,
which drives the build with Pocock's `implement` + `tdd`; the superpowers
`writing-plans`/`executing-plans` plugin also works if you have it installed. This
skill does NOT replace the engine — it adds the structure this specific marketplace
needs: the booking domain has one invariant the whole business rests on (no
double-sold set), a deliberately-unusual payment model (collect-only, no Stripe
Connect), and a JDBC-only / Spring-Modulith backend whose boundaries are easy to
violate under time pressure. The plan-doc template makes those concerns first-class
sections instead of things you remember to check.

Load this skill at the **plan stage** when starting a riviera feature, and again
when picking up a riviera plan to **execute** in a fresh session.

**Announce at start:** "I'm using the riviera-plan-doc skill to enforce
project-specific plan-doc discipline."

## Why this skill exists

Unlike a mature repo with a backlog of post-mortems, riviera is greenfield — so
this skill is **preventive**, built from the risks the design surfaced:

1. **The availability invariant is subtle and fatal if wrong.** A set sold to a
   tourist online and to a walk-in by staff is the failure that destroys trust.
   It is a concurrency problem (two writers, one row) that must be designed, not
   patched. Every plan that touches `availability`, `booking`, or the beach map
   states how it upholds invariant #2.
2. **The payment model is non-obvious and easy to "fix" wrongly.** A well-meaning
   implementer reaches for Stripe Connect (the textbook marketplace answer) — which
   cannot pay Albanian venues. The plan must name the collect-only model so nobody
   reverses it mid-stream.
3. **JDBC-only is a standing temptation to violate.** Spring Boot tutorials assume
   JPA. The plan records that persistence is JDBC and that no JPA starter enters
   the build.
4. **Module boundaries blur fastest during the first build.** With six modules and
   event-based collaboration, "I'll just call that service directly" is the first
   shortcut taken. The plan lists modules touched, named interfaces, and events
   up front.
5. **Acceptance criteria drift into wishes.** "Booking should work" is not
   testable. Each AC is "Given X, when Y, then Z" with a named test.

## Required artifacts

Every riviera feature large enough to need a plan doc gets:

- **A plan doc** at `docs/plans/<short-slug>.md`. Format follows
  `references/plan-doc-template.md` in this skill directory exactly. Empty
  sections are filled with `N/A — <reason>`, not deleted.
- **A branch** named `<feature|bugfix>/<short-slug>`. Must exist before phase 0.
- **An entry in the Execution-status table** updated in the same commit window as
  each phase's code change.
- **An empty Open Questions / Assumptions section by the time "done" is claimed**,
  or remaining items each cite a follow-up issue.

There is no Jira here — the source of intent is the **spec** in
`docs/superpowers/specs/` and, for smaller items, a **GitHub issue**. Reference
the issue number (`#NN`) in commits and the plan doc; no ticket-management MCP is
involved.

## Workflow additions at plan time

When planning a riviera feature, also do:

1. **Convert the spec's user stories (or the GitHub issue) into testable
   acceptance criteria before phase 0.** Every story becomes one or more "Given X,
   when Y, then Z" rows naming the target test class. If a stakeholder can't read
   an AC and tell pass from fail, rewrite it.

2. **Fill the Risk register and Open Questions sections before phase 0.** Use the
   `grilling` skill if risks aren't yet visible. Categories that already
   matter in this project: concurrent reservation of the same set (invariant #2),
   Stripe webhook duplicate/out-of-order delivery (#8), payout double-accrual (#9),
   timezone/cutoff arithmetic (#4/#6), money rounding (#5), module boundary leaks
   (#11), and any temptation toward JPA or Stripe Connect.

3. **Fill the Availability & concurrency section if the feature touches booking,
   the beach map, or `availability`.** State exactly how invariant #2 is upheld:
   the unique constraint, the locking/claim strategy (`SELECT … FOR UPDATE` vs
   `INSERT … ON CONFLICT`), and the test that proves two concurrent reservations
   of the same `(set, date)` cannot both succeed. This is the highest-leverage
   section in the template; do not write `N/A` unless the feature genuinely cannot
   affect availability.

4. **Fill the Spring-Modulith section if any backend code is in scope.** List
   modules touched, any new `api/` named interfaces, and any domain events (with
   id-based payloads). Use `codebase-design` for the module interfaces/seams; the
   boundary and id-based-event rules are invariant #11, checked by
   `riviera-review-overlay` and the `ApplicationModules.verify()` test.

5. **Fill the Payment & payout section if money moves.** Name the model
   (collect-only, no Connect), the webhook-as-source-of-truth rule, idempotency,
   and the payout-ledger effect. Load `riviera-stripe-payments`.

6. **Decompose into PR-sized phases.** Each phase merges to the feature branch and
   is independently reviewable. Prefer a TDD red-green-refactor shape per task.

## Workflow additions at execution time

When executing a riviera plan, also do:

1. **Per-phase generalization pass after every bug fix or new pattern.** Ask:
   where else does this apply? (e.g. a fix to one availability write path probably
   applies to the staff-mark path too.) Record the search and decision in the
   Generalization-audit log.

2. **Plan-doc update lands in the same commit window as the code change.** Either
   the same commit or the immediately-following one with nothing unrelated between.

3. **Use AskUserQuestion for forks the evidence can't settle** — anything that
   changes the availability strategy, a module boundary, the payment flow, or a
   public `api/` port. Decide naming/style yourself.

4. **Run the Self-review checklist before claiming done.** Unchecked items are
   evidence the feature is not done, not "minor cleanup."

5. **Scope test runs to the smallest set that proves the change.** One test class
   for the red/green step; the touched module's package for the per-phase
   regression; the full suite only at pre-merge. (When the local stack exists, a
   `riviera-local-debug` skill will hold the exact run recipes; until then, prefer
   `./gradlew test --tests "*ClassName*"`.)

## Resources in this skill directory

- `SKILL.md` — this file.
- `references/plan-doc-template.md` — the canonical riviera plan-doc template. Copy
  as the starting point for every feature; keep the section structure.

## Anti-patterns to avoid

- **Don't write `N/A` in the Availability & concurrency section to save time.** If
  the feature touches booking or the map, that section is the point of the plan.
- **Don't leave the payment model implicit.** Name "collect-only, no Connect" so
  the next session doesn't reach for Stripe Connect.
- **Don't claim a phase done while its Execution-status row is ⏳ or blank.**
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

**Execution engine (one of):**
- `riviera-sdd` → Pocock `implement` + `tdd` (installed — the default here).
- `superpowers:writing-plans` / `superpowers:executing-plans` if that plugin is installed.

**Upstream feeder skills (before planning):**
- the design spec in `docs/superpowers/specs/` — the source of intent.
- `grilling` / `grill-me` — relentless Q&A when requirements are genuinely ambiguous.

**Frequently co-loaded:**
- `riviera-stripe-payments` — any feature that moves money.
- `riviera-review-overlay` — at the review gate.
- `codebase-design`, `domain-modeling` — backend module-interface design and the
  domain glossary/ADRs. The Spring-Modulith/Postgres specifics (boundaries, id-based
  events, the availability `UNIQUE(set_id, booking_date)` + row-lock pattern) live in
  `CLAUDE.md` invariants and are checked by `riviera-review-overlay` (RV-BE-1) — no
  separate skill needed.
- `postgres` — table/schema/index craft for any Flyway migration (the availability
  `UNIQUE(set_id, booking_date)` constraint, the venue-map tables, the payout ledger).
- `angular-new-app` — to scaffold the Angular app (the first frontend phase):
  `ng new` + `--ai-config`, Tailwind, CLI generators.
- `angular-developer` — for frontend surfaces (the beach-map seat picker, the
  booking flow) and Angular standards; consult its `references/` for signals,
  forms, routing, and testing detail.
- `tdd`, `diagnosing-bugs` — standard execution discipline (installed).

**Orchestration & vendored craft skills:**
- `riviera-sdd` — the workflow orchestrator; it loads this skill at the plan stage.
- `to-issues` (slice the plan into issues), `tdd` / `diagnosing-bugs` (build/debug),
  `codebase-design` / `domain-modeling` (module-interface & vocabulary craft),
  `triage` (issue/PR lifecycle). These are the generic engine; this skill supplies
  the riviera-specific plan discipline on top.
