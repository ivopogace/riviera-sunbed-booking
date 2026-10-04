---
name: riviera-sdlc
description: >-
  The development loop for riviera-sunbed-booking (refine → issue → plan → implement → CI
  → review → merge) and which skill drives each stage. Load when starting or continuing
  feature work here, picking up a GitHub issue, or asked how we work.
---

# Riviera SDLC workflow

Stage procedures live in `references/`.

## The loop

**Re-entry rule.** A fix that changes behaviour re-enters at Implement: test-first, CI green, and
a re-review of the changed surface. A comment, naming or test-only fix needs only green CI.

| Stage | What happens | Skill(s) |
|---|---|---|
| **Refine** | Sharpen a fuzzy idea into a sliceable use case, grounded in the substrate docs and the real code. A foggy epic (destination clear, route not) is charted first with `wayfinder`. | `grilling`, `domain-modeling`; `wayfinder` |
| **Issue** | Vertical-slice tracer-bullet issues on GitHub. A multi-slice epic may first commit an epic spec with `to-spec`. Any document the issues reference is committed before or with them. | `to-spec` (optional) → `to-issues` |
| **Plan** | Plan doc: testable ACs, risks, how the invariant holds if booking/availability/money is touched. Map the affected surface by grepping modules and published surfaces (Explore agent for anything broad). Entering at an existing issue → `references/issue-intake-gate.md` first. A question the slice can answer → `research` or `prototype`; a cross-session decision → `wayfinder`. | `riviera-plan-doc` + `grilling` + `research`/`prototype` |
| **Implement** | Test-first, one behaviour at a time, at the seams the plan names. Load the routed skills for each area. `/implement` is human-only; never route to it. | `tdd` + the routing table |
| **CI gate** | Every push to an open PR runs every CI job; build/test steps re-run only when that job's inputs changed since a green build (content-hash cache), the scans always. After a push that claims a phase green, check that run before the next phase (red-TDD and labeled-partial pushes exempt). | GitHub Actions; red → `diagnosing-bugs` |
| **PR** | Open a **draft as soon as the first phase commit exists** — CI fires on `pull_request` only. When built: merge latest `origin/main` in (scoped tests for what the integration touches), then mark **ready for review**, which makes the Review and Sonar gates due. | `triage` (issues only) |
| **Review** | Mandatory at ready-for-review: `/code-review` on the PR number plus the overlay (`references/pr-gates.md` §1). | `riviera-review-overlay` + `/code-review` |
| **Sonar gate** | Mandatory: no new bug, vulnerability or unreviewed hotspot; new-code coverage ≥ 80% (`references/pr-gates.md` §2). | SonarCloud |
| **Merge** | Green CI + review run + Sonar gate + findings resolved → merge → close-out (`references/pr-gates.md` §3). | |

### Epic front-end (multi-slice only)

`wayfinder` (a `wayfinder:map` issue of decision tickets, one resolved per session) →
`to-spec` (one epic issue: Problem / Solution / User Stories / Implementation Decisions /
Testing Decisions / Out of scope; no slice ACs) → `to-issues`. Once a slice executes, the plan
doc's Execution status is the state store, not the map.

## Skill routing (load *before* you write)

| If the change touches… | Load first |
|---|---|
| A Postgres table / Flyway migration / index / SQL query | `postgres` |
| Backend structure (module, `api/`/`spi/` port, service, event, adapter, controller, package move) | `riviera-modulith` + `codebase-design` + `domain-modeling` |
| Any backend Java | `riviera-java-conventions` + `riviera-modulith` |
| A venue-scoped endpoint/service or the `operator` module | `riviera-modulith` + `riviera-java-conventions` — invariant #13, RV-BE-9 |
| `payment`/`payout`, Stripe, charge/refund/commission/payout | `riviera-stripe-payments` (+ `postgres` if a ledger table changes) |
| The Angular frontend | `riviera-frontend` + `angular-developer` + angular-cli MCP; `riviera-tailwind` for any styling |
| A user-facing frontend flow or anything under `frontend/e2e/` | `playwright-cli` — a user-facing behaviour change ships e2e coverage (suite: RV-FE-E2E) |
| The session's first `./gradlew`/`npm test`, or a local build failure | `riviera-local-debug` |
| Always | `riviera-plan-doc` (plan) · `tdd` (build) · `riviera-review-overlay` (review) |

Detect what the slice touches from the repo, not memory (`area:*` labels are only a hint). A new
area or a context compaction means loading again.

## Rules

1. One vertical slice per issue/PR (DB → API → UI → tests), demoable alone.
2. Branch per issue: `feature/<slug>` or `bugfix/<slug>` off `main`; `#NN` in commits.
3. If the slice touches booking, availability or money, the plan states how the invariant holds.
4. A small fix (one behaviour, no invariant touched) skips the plan doc, never the review.
5. An existing issue is grilled before planned (`references/issue-intake-gate.md`).
6. Source-of-intent documents are committed to the repo (`docs/architecture/`), never left in
   the conversation. Durable artifacts never cite a plan path.
7. Multi-session work keeps its state in the plan's Execution status, not the conversation.

## Adding or keeping a rule

A rule earns prose in a skill, template or review item only if all three hold:

1. A capable model would not do it by default in this codebase.
2. Getting it wrong is expensive (money, inventory, security, data, a user-facing defect).
3. No test, lint rule or type can catch it. If one can, write that instead and keep at most a
   one-line pointer.

A review item that found nothing real across ~30 PRs is deleted unless it guards a Blocker
invariant (#2, #7, #8, #9, #13). Don't state counts in prose ("the two X", "thirteen modules"):
name the members or point at the source of truth, so growth never makes a doc false.

## Context hygiene

- After a compaction or when unsure of the stage: re-read Execution status **and** the current
  stage's reference file; never run a gate from a summary's memory.
- Delegate heavy reading to subagents (review, Sonar triage, exploration). Scope test runs per
  `riviera-local-debug`; read ranges, not whole files.
- Near a gate with high context: finish the phase, commit Execution status, continue fresh.

## Cloud sessions

- The designated remote branch stands in for `feature/<slug>`; note it in the plan's Branch
  line. If its PR already merged, restart the branch from `main` under the same name.
- `gh` is proxy-restricted (`references/pr-gates.md` §1); GitHub MCP tools substitute. If an
  instruction is impossible in the toolset, do the nearest honest thing and say so.
- `PushNotification` before any `AskUserQuestion` and when work finishes.
- Several issues at once, one cloud session each: `riviera-wave` orchestrates the wave.

## IntelliJ (`idea` MCP)

If `mcp__idea__*` tools exist: `get_file_problems`/`lint_files` after edits,
`rename_refactoring` for renames, `analyze_calls`/`get_symbol_info` for blast radius, `xdebug_*`
for runtime state. They supplement scoped tests and CI. If absent, never connect, enable or
deny the server yourself.

## Substrate

Beyond `CLAUDE.md`'s pointers: ADR-0018 for every backend slice;
`docs/architecture/domain-model.md`. `domain-modeling` edits `CONTEXT.md`.

Human-only skills (`disable-model-invocation`): `implement`, `grill-me`,
`improve-codebase-architecture`. Don't route to or re-enact them. Spikes skip the ceremony.
