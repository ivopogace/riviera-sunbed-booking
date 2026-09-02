---
name: riviera-sdlc
description: >-
  The development loop for riviera-sunbed-booking (refine → issue → plan → implement → CI
  → review → merge) and which skill drives each stage. Load when starting or continuing
  feature work here, picking up a GitHub issue, or asked how we work.
---

# Riviera SDLC workflow

The orchestrator: it names which skill drives each stage and how the stages connect.
Stage procedures live in `references/` — read each when its stage arrives.

**Announce at start:** "Using riviera-sdlc to drive the workflow."

## The loop

```
refine → issue → plan → implement → CI gate → PR → review → sonar gate → merge
                          ▲                                              │
                          └──── findings re-enter (review AND sonar) ────┘
```

**Re-entry rule.** Any fix — a review finding, a Sonar finding, a red-CI fix, a later
reviewer comment — is a change and re-enters the loop at Implement: run the Skill-routing
gate for what the fix touches (load those skills *before* editing), build it test-first
(`tdd`), get CI green again, re-review the changed surface. Being small, or arriving after
green CI or a finished review, is not an exemption.

| Stage | What happens | Driving skill(s) |
|---|---|---|
| **Refine** | Sharpen a fuzzy idea into a precise, sliceable use case. Ground the interview in what exists — read the substrate docs and grep the real code. A **foggy epic** (destination clear, route not) may first be charted with `wayfinder`. | `grilling`, `domain-modeling`; `wayfinder` (foggy epics only) |
| **Issue** | Break the use case into vertical-slice tracer-bullet issues on GitHub. For a multi-slice epic, optionally first commit an epic **spec** (user stories + testing seams + out-of-scope) with `to-spec`, then slice its user stories. Any strategic document the issues reference is committed to the repo before or with them. | `to-spec` (optional) → `to-issues` |
| **Plan** | Write the plan doc: testable ACs, risk register, and — if booking/availability/money is touched — how the invariant holds. Map the affected surface (modules, events, blast radius) by grepping the modules and their published surfaces (an Explore agent for anything broad). Entering at an existing issue → run `references/issue-intake-gate.md` first. An open question the slice itself can answer goes to `research` (docs/API legwork) or `prototype` (spike); a cross-session decision is fog and escalates to `wayfinder`. Then the Skill-routing gate. | `riviera-plan-doc` (owner) + `grilling` + `research`/`prototype` |
| **Implement** | Build the slice test-first, one behavior at a time, at the seams the plan names. Re-run the Skill-routing gate for each area touched. `/implement` is the human's entry command (model invocation is disabled on it); it hands off to this row — never route to it or re-enact it. | `tdd` + the Skill-routing gate |
| **CI gate** | Every push to an open PR builds both apps, runs tests, scans (CodeQL, Dependabot, SonarCloud). After any push that claims a phase green, check that push's run before starting the next phase (red-TDD and labeled-partial pushes exempt) — full-suite-only failures surface only here. | GitHub Actions; red → `diagnosing-bugs` |
| **PR** | Open the PR **as a draft as soon as the first phase commit exists** — CI fires on the `pull_request` event only (`push` is scoped to `main`), so a branch with no PR gets no CI. A draft is a CI vehicle, not a review request. When the slice is built: merge latest `origin/main` in with full phase discipline (routing gate for what the integration touches, scoped tests, honest commit), then mark **ready for review** — that is what makes the Review and Sonar gates due. | `triage` (issue lifecycle — issues only; PRs go through normal review) |
| **Review** | Mandatory gate, due at ready-for-review. Start `/code-review` via the invocation ladder in `references/pr-gates.md` §1 — the overlay alone is NOT the review, and a blocked rung is declared in the PR, never silently substituted. Each fix re-enters at Implement. Green CI is not a substitute. | `riviera-review-overlay` + `/code-review` |
| **Sonar gate** | Mandatory gate (PR-time; Sonar analyzes PRs + `main` only). A green gate is not the check — pull the reported new-issue + duplication list from the API and fix every entry before merge (`references/pr-gates.md` §2). | SonarCloud + `diagnosing-bugs` for a genuine defect |
| **Merge** | Only after green CI + Review gate run + Sonar gate green with its list cleared + findings resolved through the loop → merge, then the close-out checklist (`references/pr-gates.md` §3). | the Merge close-out |

### Epic front-end (multi-slice epics only)

`wayfinder` (foggy epics: a `wayfinder:map`
issue of *decision* tickets, one resolved per session) → `to-spec` (one committed epic issue:
Problem / Solution / numbered User Stories / Implementation Decisions / Testing Seams / Out of
scope) → `to-issues` (the normal Issue stage, slicing the spec's user stories). Two
boundaries: `to-spec` stays epic-level (no slice ACs — those are `riviera-plan-doc`'s), and
the `wayfinder:map` issue governs charting only — once a slice executes, the plan doc's
Execution status is the state store. A single slice skips all of this.

## Skill-routing gate (mandatory — load *before* you write)

Before authoring a plan section or a line of code for an area, load that area's skill(s)
and announce which you loaded. The `area:*` label (`docs/agents/triage-labels.md`) is only
a hint — the trigger is what the change actually touches, and one slice usually trips
several rows. Writing first and loading after is a process miss (RV-PROC-1).

| If the change touches… | Load BEFORE writing it |
|---|---|
| A Postgres table / Flyway migration / index / SQL query | `postgres` |
| Any backend module / structure (new module, `api/` or `spi/` port, application service, domain event, JDBC adapter, controller, moving a class between packages) | `riviera-modulith` + `codebase-design` (seams) + `domain-modeling` (glossary/ADRs) |
| Writing/refactoring any backend Java (class, record, port, JDBC adapter, event, controller, test) | `riviera-java-conventions` + `riviera-modulith` (both fire on any backend Java create/modify; also covers the validation/error contract) |
| A venue-scoped endpoint/service or operator identity (`/api/venues/{venueId}/**`, payout ledger, staff bookings, beach-map edit, staff availability, weather refund, the `operator` module) | `riviera-modulith` (ownership-check seam) + `riviera-java-conventions` — invariant #13, RV-BE-9 Blocker |
| `payment` / `payout`, Stripe, charge / refund / commission / payout | `riviera-stripe-payments` (+ `postgres` if a ledger table changes) |
| The Angular frontend (component, service, route, styling, forms) | `riviera-frontend` (which folder) + `angular-developer` + the angular-cli MCP (`get_best_practices`, `search_documentation`) + `riviera-tailwind` whenever the change styles anything or touches a component still carrying legacy SCSS |
| A user-facing frontend flow / behaviour (any observable component / route / form / service change, or anything under `frontend/e2e/`) | `playwright-cli` — every frontend slice ships e2e coverage. Which of the two suites a spec belongs in is `riviera-review-overlay` RV-FE-E2E's call |
| Scaffolding a new app | `angular-new-app` |
| Running builds/tests locally (the session's first `./gradlew` / `gradle` / `npm test`, or a local build failure) | `riviera-local-debug` |
| Anything, always | `riviera-plan-doc` (plan) · `tdd` (build) · `riviera-review-overlay` (review) · `riviera-docs-freshness` (close-out — due whenever the slice changes something a substrate doc *states*). The plan-doc template pre-fills these in *Skills consulted* |

**How the gate runs — three steps, every time:**

1. **Detect.** List what the slice touches: DB? a backend module? the frontend? money? Use
   the repo as evidence, not memory — grep the modules, their published surfaces and call
   sites (delegate anything broad to an Explore agent). An `area:fullstack` issue almost
   always trips DB, BE and FE. An empty search result is not evidence of absence — confirm a
   negative with `git ls-files` (`CLAUDE.md` § Searching the codebase).
2. **Load + announce.** Load each triggered skill before authoring that part; name each
   loaded skill and the part it covers. If the migration was written before `postgres` was
   loaded, the gate already failed — redo it.
3. **Record.** Name each loaded skill and what it changed in the plan doc's **Skills
   consulted** line. `riviera-review-overlay` checks that line against the diff.

The gate fires at plan, implement, and review-fix time. A new area, or a context
compaction, is a new area-entry: re-load. When in doubt, load it.

## Rules of the loop

1. **One vertical slice per issue/PR.** A slice cuts through every layer (DB → API → UI →
   tests) and is demoable on its own — never a horizontal layer.
2. **Branch per issue:** `feature/<slug>` or `bugfix/<slug>` off `main`; reference `#NN` in commits.
3. **The plan owns the invariants.** If the slice touches booking, availability, or money,
   the plan doc states how the invariant holds, and review checks it.
4. **Right-size it.** A one-line/copy fix skips the plan doc; a spine-touching feature does
   not. A code change still gets the review gate, proportional to size.
5. **An existing issue gets grilled before it gets planned** — entering at a written ticket
   skips Refine (`references/issue-intake-gate.md`).
6. **Source-of-intent documents live in the repo, not the conversation.** Any spec or
   improvement plan that issues or ADRs reference is committed (`docs/architecture/`) before
   or with the artifacts that cite it. A plan doc is working state, not a record: it lives in
   `docs/plans/` until the slice merges and is deleted at the next close-out, so durable
   artifacts cite the issue or PR, never a plan path.
7. **The conversation is never the state store** — progress lives in the plan doc's
   Execution status section (Context hygiene, below).

## Context hygiene (long sessions, compaction)

1. **The plan doc's Execution status section is the state store** — stage pointer, next
   action, phase table, findings register — committed at every phase boundary and stage
   transition (`riviera-plan-doc` owns the format).
2. **Re-anchor rule.** After a compaction, or whenever unsure what stage you're in, re-read
   the Execution status section **and** the current stage's reference file before acting.
   Never run a gate from a summary's memory of its procedure.
3. **Re-load rule.** A compaction is a new area-entry for the Skill-routing gate: re-load
   the routed skills for whatever you touch next.
4. **Keep bulk reads out of the main thread.** Delegate self-contained heavy reading to
   subagents that return conclusions: the review gate (`/code-review` already runs one), the
   Sonar issue-list triage, `riviera-docs-freshness`, broad exploration (Explore agent). Keep
   test runs scoped per `riviera-local-debug`; read file ranges, not whole files.
5. **Break marathon slices at gate boundaries.** A committed plan doc is everything an
   implement session needs; the PR + plan doc is everything a review/sonar/merge session
   needs. When context runs high near a gate, finish the phase, commit the Execution status,
   continue in a fresh session.

## Remote / cloud session addendum

- **Branch:** the session's designated remote branch stands in for `feature/<slug>` —
  develop and push there, and record the substitution in the plan doc's Branch line. If the
  designated branch's PR already merged, restart the branch from latest `main` (same name).
- **Local builds & tests:** load `riviera-local-debug` before the session's first `./gradlew`
  or `npm` invocation.
- **Toolset drift:** verify a tool can do what a skill assumes before promising it (Gmail is
  draft-only → push is the only notification channel; `gh` is proxy-restricted —
  substitution table in `references/pr-gates.md` §1; the GitHub MCP tools substitute when
  `gh` is missing). When an instruction is impossible in the current toolset, do the nearest
  honest thing and say so in the reply.
- **Notifications:** the user typically starts from the iOS app and walks away. Push via
  `PushNotification` *before* any `AskUserQuestion` (a question prompt alone does not buzz
  the phone) and when work finishes. Email backstop only if a send-capable tool exists — a
  short mail to the maintainer address from the session context. Never ping during live
  back-and-forth.

## IntelliJ IDEA sessions (`idea` MCP)

Detection is tool presence: if `mcp__idea__*` tools are available, the project is open in
IntelliJ. Use `get_file_problems` / `lint_files` after an edit for the IDE's inspection
verdict, `rename_refactoring` for symbol renames, `analyze_calls` + `get_symbol_info` when
mapping blast radius, the `xdebug_*` tools when `diagnosing-bugs` needs runtime state. They
supplement, never replace, scoped test runs and CI. If the tools are absent, skip this
entirely: never connect, enable, add, or deny the `idea` server yourself — it is defined in
`.mcp.json` at a machine-local `127.0.0.1` port, deliberately absent from the committed
`enabledMcpjsonServers`, and a deny at any scope wins over every enable.

## The substrate these skills read

- `CLAUDE.md` — conventions + the 13 invariants (canonical rules).
- `CONTEXT.md` — the domain glossary; keep issue/commit/code vocabulary consistent with
  it (`domain-modeling` updates it inline).
- `docs/adr/` — locked decisions; `domain-modeling` offers a new ADR only when a choice is
  hard-to-reverse **and** surprising **and** a real trade-off.
- `docs/agents/` — issue-tracker, triage-label, and domain-doc config.
- `docs/architecture/domain-model.md` — aggregates, flows, state machines.

## When NOT to use

- Trivial fixes and throwaway spikes (note the branch as a spike, skip the ceremony).
- Outside this repo.

Three vendored skills are human-invoke-only, never a route: `implement`, `grill-me` (the
`grilling` alias), and `improve-codebase-architecture` carry `disable-model-invocation:
true`; the Skill tool refuses them. Don't drop the flag or re-enact their workflow.

## References

- `references/issue-intake-gate.md` — read at plan entry when work starts from an existing
  issue: grill checklist, in-flight/Flyway-number check, module-ownership check.
- `references/pr-gates.md` — read when the PR is marked **ready for review**: the Review
  gate, the SonarCloud gate, and the Merge close-out checklist.
