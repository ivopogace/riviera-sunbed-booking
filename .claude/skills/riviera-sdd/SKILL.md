---
name: riviera-sdd
description: The spec-driven development loop for riviera-sunbed-booking. Load it when starting or continuing feature work in this repo — it routes each stage of the pipeline (refine → issue → plan → implement → CI → review → merge) to the right skill, including frontend/backend skill routing, and points to the domain substrate (CONTEXT.md, docs/adr, docs/agents). Use when the user says "let's build/work on <use case>", picks up a GitHub issue, or asks how we work here.
---

# Riviera SDD (spec-driven development) workflow

This is the **orchestrator** for how we build riviera-sunbed-booking. It does not
do the work itself — it tells you which skill drives each stage and how the stages
connect. The product idea is already captured (design spec + domain model); from
here every change flows through the loop below.

**Announce at start:** "Using riviera-sdd to drive the workflow."

## The loop

```
refine → issue → plan → implement → CI gate → PR → review → merge
```

| Stage | What happens | Driving skill(s) |
|---|---|---|
| **Refine** | Sharpen a fuzzy idea into a precise, sliceable use case. | `grilling` (interview), `domain-modeling` (vocabulary + ADRs) |
| **Issue** | Break the use case into vertical-slice tracer-bullet issues on GitHub. | `to-issues` |
| **Plan** | For a grabbed issue, write the plan doc with testable ACs, the risk register, and — if booking/availability/money is touched — exactly how the relevant invariant is upheld. | `riviera-plan-doc` (owner) + `grilling`, `codebase-design` (module interface design) |
| **Implement** | Build the slice test-first, one behavior at a time, at agreed seams. | `implement` + `tdd` + **area skill (below)** |
| **CI gate** | Every push/PR builds both apps, runs tests, and scans (CodeQL + Dependabot + SonarCloud). Green is required. | GitHub Actions (issue #3). A red pipeline → `diagnosing-bugs` |
| **PR / review** | Open a PR into `main`; review against the invariants. | `riviera-review-overlay` (gates) + `triage` (issue/PR lifecycle) |
| **Merge** | Green + approved → merge; close the issue. | — |

## Area routing (the "pull the right skill" rule)

Decide by the issue's `area:*` label (see `docs/agents/triage-labels.md`):

- **`area:frontend`** → pull **`angular-developer`** + the **Angular MCP** (and
  `angular-new-app` for scaffolding). The beach-map seat picker, booking flow, etc.
- **`area:backend`** → pull **`codebase-design`** for deep-module interface design
  and **`domain-modeling`** for the glossary/ADRs; **`riviera-stripe-payments`** for
  anything in `payment`/`payout` or any Stripe/charge/refund/commission work. The
  Spring-Modulith / Postgres specifics (boundaries, id-based events, the availability
  unique constraint + row lock) are enforced by the `CLAUDE.md` invariants (#2, #11,
  #12) and the `riviera-review-overlay` gates — not a separate skill.
- **`area:fullstack`** → both of the above, FE and BE each as its own commit/slice.
- Always, regardless of area: `riviera-plan-doc` at plan time, `tdd` at build time,
  `riviera-review-overlay` at review time.

## The substrate these skills read

- **`CLAUDE.md`** — conventions + the 12 invariants (canonical rules).
- **`CONTEXT.md`** — the domain glossary (ubiquitous language). Keep issue/commit/
  code vocabulary consistent with it; `domain-modeling` updates it inline.
- **`docs/adr/`** — locked decisions + rationale. Respect them; `domain-modeling`
  offers a new ADR only when a choice is hard-to-reverse **and** surprising **and** a
  real trade-off.
- **`docs/agents/`** — issue-tracker, triage-label, and domain-doc config.
- **`docs/architecture/domain-model.md`** — aggregates, flows, state machines.

## Rules of the loop

1. **One vertical slice per issue/PR.** A slice cuts through every layer
   (DB → API → UI → tests) and is demoable on its own — never a horizontal layer.
2. **Branch per issue:** `feature/<slug>` or `bugfix/<slug>` off `main`; reference
   `#NN` in commits.
3. **The CI gate is non-negotiable.** Don't merge red. A red pipeline is a
   `diagnosing-bugs` feedback loop, not a nuisance to bypass.
4. **The plan owns the invariants.** If the slice touches booking, availability, or
   money, the plan doc states how the invariant holds, and review checks it.
5. **Right-size it.** A one-line/copy fix skips the plan doc; a feature that touches
   the spine does not.

## When NOT to use

- Trivial fixes and throwaway spikes (note the branch as a spike, skip the ceremony).
- Outside this repo — the routing and substrate are project-specific.

## Integration

- **Riviera skills:** `riviera-plan-doc` (plan), `riviera-review-overlay` (review),
  `riviera-stripe-payments` (money), `angular-new-app`/`angular-developer` (frontend).
- **Vendored craft skills (Matt Pocock, MIT):** `grilling`/`grill-me`, `to-issues`,
  `implement`, `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`,
  `triage`, `improve-codebase-architecture` (use the last one once there is code to
  deepen).
