---
name: riviera-sdlc
description: >-
  The development loop for riviera-sunbed-booking (refine → issue → plan → implement → CI
  → review → merge) and which skill drives each stage. Load when starting or continuing
  feature work here, picking up a GitHub issue, or asked how we work.
---

# Riviera SDLC workflow

Announce: "Using riviera-sdlc to drive the workflow." Stage procedures live in `references/`.

## The loop

```
refine → issue → plan → implement → CI gate → PR → review → sonar gate → merge
                          ▲                                              │
                          └──── findings re-enter (review AND sonar) ────┘
```

**Re-entry rule.** Any fix (review finding, Sonar finding, red CI, later reviewer comment)
re-enters at Implement: run the Skill-routing gate for what it touches, build it test-first,
get CI green, re-review the changed surface. Size is not an exemption.

| Stage | What happens | Skill(s) |
|---|---|---|
| **Refine** | Sharpen a fuzzy idea into a sliceable use case, grounded in the substrate docs and the real code. A foggy epic (destination clear, route not) is charted first with `wayfinder`. | `grilling`, `domain-modeling`; `wayfinder` |
| **Issue** | Vertical-slice tracer-bullet issues on GitHub. A multi-slice epic may first commit an epic spec with `to-spec`. Any document the issues reference is committed before or with them. | `to-spec` (optional) → `to-issues` |
| **Plan** | Plan doc: testable ACs, risk register, how the invariant holds if booking/availability/money is touched. Map the affected surface by grepping modules and published surfaces (Explore agent for anything broad). Entering at an existing issue → `references/issue-intake-gate.md` first. A question the slice can answer → `research` or `prototype`; a cross-session decision → `wayfinder`. Then the Skill-routing gate. | `riviera-plan-doc` + `grilling` + `research`/`prototype` |
| **Implement** | Test-first, one behaviour at a time, at the seams the plan names. Re-run the routing gate per area. `/implement` is human-only; never route to it. | `tdd` + the routing gate |
| **CI gate** | Every push to an open PR runs the whole suite + scans. After a push that claims a phase green, check that run before the next phase (red-TDD and labeled-partial pushes exempt). | GitHub Actions; red → `diagnosing-bugs` |
| **PR** | Open a **draft as soon as the first phase commit exists** — CI fires on `pull_request` only. When built: merge latest `origin/main` in (routing gate for what the integration touches, scoped tests), then mark **ready for review**, which makes the Review and Sonar gates due. | `triage` (issues only) |
| **Review** | Mandatory at ready-for-review. Start `/code-review` via the ladder in `references/pr-gates.md` §1; the overlay alone is not the review; a blocked rung is declared in the PR. | `riviera-review-overlay` + `/code-review` |
| **Sonar gate** | Mandatory. Pull the new-issue + duplication list from the API and clear every entry (`references/pr-gates.md` §2). | SonarCloud |
| **Merge** | Green CI + review gate run + Sonar list cleared + findings resolved → merge → close-out (`references/pr-gates.md` §3). | |

**Epic front-end** (multi-slice only): `wayfinder` (a `wayfinder:map` issue of decision
tickets, one resolved per session) → `to-spec` (one epic issue: Problem / Solution / User
Stories / Implementation Decisions / Testing Seams / Out of scope; no slice ACs) → `to-issues`.
Once a slice executes, the plan doc's Execution status is the state store, not the map.

## Skill-routing gate (mandatory — load *before* you write)

| If the change touches… | Load first |
|---|---|
| A Postgres table / Flyway migration / index / SQL query | `postgres` |
| Backend structure (module, `api/`/`spi/` port, service, event, adapter, controller, package move) | `riviera-modulith` + `codebase-design` + `domain-modeling` |
| Any backend Java | `riviera-java-conventions` + `riviera-modulith` |
| A venue-scoped endpoint/service or the `operator` module | `riviera-modulith` + `riviera-java-conventions` — invariant #13, RV-BE-9 |
| `payment`/`payout`, Stripe, charge/refund/commission/payout | `riviera-stripe-payments` (+ `postgres` if a ledger table changes) |
| The Angular frontend | `riviera-frontend` + `angular-developer` + angular-cli MCP; `riviera-tailwind` for any styling |
| A user-facing frontend flow or anything under `frontend/e2e/` | `playwright-cli` — every frontend slice ships e2e coverage (suite: RV-FE-E2E) |
| Scaffolding a new app | `angular-new-app` |
| The session's first `./gradlew`/`npm test`, or a local build failure | `riviera-local-debug` |
| Always | `riviera-plan-doc` (plan) · `tdd` (build) · `riviera-review-overlay` (review) · `riviera-docs-freshness` (close-out) |

1. **Detect** what the slice touches from the repo, not memory (an empty search is not
   absence — `CLAUDE.md` § Searching the codebase). `area:*` labels are only a hint.
2. **Load + announce** each triggered skill before authoring that part. Writing first is
   RV-PROC-1.
3. **Record** each skill and what it changed in the plan doc's **Skills consulted** line.

Fires at plan, implement and review-fix time. A new area or a context compaction re-triggers it.

## Rules

1. One vertical slice per issue/PR (DB → API → UI → tests), demoable alone.
2. Branch per issue: `feature/<slug>` or `bugfix/<slug>` off `main`; `#NN` in commits.
3. If the slice touches booking, availability or money, the plan states how the invariant holds.
4. A one-line/copy fix skips the plan doc, never the review gate.
5. An existing issue is grilled before planned (`references/issue-intake-gate.md`).
6. Source-of-intent documents are committed to the repo (`docs/architecture/`), never left in
   the conversation. Durable artifacts never cite a plan path.
7. The conversation is never the state store — the plan doc's Execution status is.

## Context hygiene

- After a compaction or when unsure of the stage: re-read Execution status **and** the current
  stage's reference file; never run a gate from a summary's memory. Re-load routed skills.
- Delegate heavy reading to subagents (review gate, Sonar triage, docs-freshness, exploration).
  Scope test runs per `riviera-local-debug`; read ranges, not whole files.
- Near a gate with high context: finish the phase, commit Execution status, continue fresh.

## Cloud sessions

- The designated remote branch stands in for `feature/<slug>`; note it in the plan's Branch
  line. If its PR already merged, restart the branch from `main` under the same name.
- `gh` is proxy-restricted (`references/pr-gates.md` §1); GitHub MCP tools substitute. If an
  instruction is impossible in the toolset, do the nearest honest thing and say so.
- `PushNotification` before any `AskUserQuestion` and when work finishes.

## IntelliJ (`idea` MCP)

If `mcp__idea__*` tools exist: `get_file_problems`/`lint_files` after edits,
`rename_refactoring` for renames, `analyze_calls`/`get_symbol_info` for blast radius, `xdebug_*`
for runtime state. They supplement scoped tests and CI. If absent, never connect, enable or
deny the server yourself.

## Substrate

`CLAUDE.md` (invariants), `CONTEXT.md` (glossary; `domain-modeling` edits it), `docs/adr/`
(ADR-0018 for every backend slice), `docs/agents/`, `docs/architecture/domain-model.md`.

Human-only skills (`disable-model-invocation`): `implement`, `grill-me`,
`improve-codebase-architecture`. Don't route to or re-enact them. Spikes skip the ceremony.
