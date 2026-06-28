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
| **Plan** | For a grabbed issue, write the plan doc with testable ACs, the risk register, and — if booking/availability/money is touched — exactly how the relevant invariant is upheld. **Run the Skill-routing gate first.** | `riviera-plan-doc` (owner) + `grilling` + **the Skill-routing gate (below)** |
| **Implement** | Build the slice test-first, one behavior at a time, at agreed seams. **Re-run the Skill-routing gate** for each area you touch. | `implement` + `tdd` + **the Skill-routing gate (below)** |
| **CI gate** | Every push/PR builds both apps, runs tests, and scans (CodeQL + Dependabot + SonarCloud). Green is required. | GitHub Actions (issue #3). A red pipeline → `diagnosing-bugs` |
| **PR / review** | Open a PR into `main`; review against the invariants. | `riviera-review-overlay` (gates) + `triage` (issue/PR lifecycle) |
| **Merge** | Green + approved → merge; close the issue. | — |

## Skill-routing gate (mandatory — load *before* you write)

> This is a **gate, not a suggestion.** Before you author a plan section or a line of
> code for an area, you **MUST load that area's skill(s) first** and **announce which
> you loaded**. The `area:*` label (see `docs/agents/triage-labels.md`) is only the
> starting hint — the real trigger is **what the change actually touches**, and one
> slice usually trips several rows below. A migration written without `postgres`, a new
> module seam without `codebase-design`, or an Angular component without
> `angular-developer` + the Angular MCP is a **process miss** the review gate will flag.

| If the change touches… | Load BEFORE writing it (MUST) | Why |
|---|---|---|
| **A Postgres table / Flyway migration / index / SQL query** | **`postgres`** | PK/type/index/constraint design, not first-principles DDL |
| **Any backend module** (Spring Modulith: new `api/` port, service, event, seam) | **`codebase-design`** (interfaces/seams) + **`domain-modeling`** (glossary/ADRs) | deep modules, real-vs-hypothetical seams; ubiquitous language |
| **`payment` / `payout`, Stripe, charge / refund / commission / payout** | **`riviera-stripe-payments`** (+ `postgres` if a ledger table changes) | locks the collect-only / no-Connect model |
| **The Angular frontend** (component, service, route, styling, forms) | **`angular-developer`** + the **angular-cli MCP** (`get_best_practices`, `search_documentation`) | version-correct v22 APIs + a11y, not stale tutorials |
| **Scaffolding a new app** | **`angular-new-app`** (FE) | correct `ng new` flags + structure |
| **Anything, always** | **`riviera-plan-doc`** (plan) · **`tdd`** (build) · **`riviera-review-overlay`** (review) | the always-on spine |

**How the gate runs — three steps, every time:**

1. **Detect.** List what the slice touches: DB? a backend module? the frontend? money?
   An `area:fullstack` issue almost always trips DB **and** BE **and** FE — load all of
   them. Don't stop at the label.
2. **Load + announce.** Load each triggered skill **before** authoring that part and say
   so out loud, e.g. *"Loaded `postgres` (migration V2), `codebase-design` (venue seam),
   `angular-developer` + angular-cli MCP (beach-map component)."* If you wrote the
   migration before loading `postgres`, the gate already failed — redo it.
3. **Record.** Name each loaded skill and what it changed in the plan doc's **Skills
   consulted** line (one phrase each). `riviera-review-overlay` checks that line against
   the diff: a migration in the diff with no `postgres` in *Skills consulted* is a finding.

This gate fires at **both** the plan stage (vet the design) and the implement stage (vet
the code). Loading a skill at plan time does **not** exempt you at build time if a new
area appears, and re-loading is cheap — when in doubt, load it.

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
