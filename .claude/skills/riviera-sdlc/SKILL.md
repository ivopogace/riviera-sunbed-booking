---
name: riviera-sdlc
description: The software development life cycle loop for riviera-sunbed-booking. Load it when starting or continuing feature work in this repo — it routes each stage of the pipeline (refine → issue → plan → implement → CI → review → merge) to the right skill, including frontend/backend skill routing, and points to the domain substrate (CONTEXT.md, docs/adr, docs/agents). Use when the user says "let's build/work on <use case>", picks up a GitHub issue, or asks how we work here.
---

# Riviera SDLC (software development life cycle) workflow

This is the **orchestrator** for how we build riviera-sunbed-booking. It does not do the
work itself — it tells you which skill drives each stage and how the stages connect. The
product idea is already captured (design spec + domain model); every change flows through
the loop below. Stage-specific procedures live in `references/` (index at the bottom) —
read each when its stage arrives, not before.

**Announce at start:** "Using riviera-sdlc to drive the workflow."

## The loop

```
refine → issue → plan → implement → CI gate → PR → review → sonar gate → merge
                          ▲                                              │
                          └──── findings re-enter (review AND sonar) ────┘
```

**The loop is a loop, not a line — the re-entry rule (canonical statement).** Any fix —
a review finding, a Sonar finding, a red-CI fix, a reviewer's later comment — is a change,
and a change **re-enters the loop at Implement**: run the **Skill-routing gate** for what
the fix touches (load that area's skills per the routing table below, *before* editing),
build it test-first (`tdd`), get CI green again, and have the changed surface re-reviewed.
Being small, or arriving after a green CI or a finished review, is **not** an exemption —
the single most common process miss is treating a post-review or post-Sonar fix as exempt:
a migration patched without `postgres`, an Angular tweak without `angular-developer` + the
MCP, a backend edit without `riviera-modulith`. Everywhere else this skill says "re-enters
at Implement", it means this paragraph.

| Stage | What happens | Driving skill(s) |
|---|---|---|
| **Refine** | Sharpen a fuzzy idea into a precise, sliceable use case. Ground the interview in what already exists — read the substrate docs and grep the real code, so you refine against what's there, not assumptions. A **foggy epic** (destination clear, route not) may first be charted with `wayfinder` — see *Epic front-end*, below. | `grilling` (interview), `domain-modeling` (vocabulary + ADRs); `wayfinder` (foggy epics only) |
| **Issue** | Break the use case into vertical-slice tracer-bullet issues on GitHub. For an **epic** (multi-slice), optionally first synthesize a committed epic **spec** — user stories + testing seams + out-of-scope — then slice its user stories (see *Epic front-end*, below). Any strategic document the issues reference must be committed to the repo before or with them (rule 10). | `to-spec` (epic spec, optional) → `to-issues` |
| **Plan** | Write the plan doc: testable ACs, risk register, and — if booking/availability/money is touched — how the invariant holds. Map the affected surface (modules + events + blast radius) by grepping the modules and their published surfaces (an Explore agent for anything broad) — evidence for the plan's *modules/events touched* section and the Detect step below. Entering at an existing issue? Grill it first — procedure: `references/issue-intake-gate.md`. Then the Skill-routing gate. | `riviera-plan-doc` (owner) + `grilling` + both gates |
| **Implement** | Build the slice test-first, one behavior at a time, at seams named in the plan. Re-run the Skill-routing gate for each area you touch. | `tdd` + the Skill-routing gate (below). `implement` is the **human's** entry command (`/implement`) — model-invocation is disabled on it upstream, so never route to it and never re-enact it from memory; it hands off to exactly this row |
| **CI gate** | Every push to an **open PR** builds both apps, runs tests, scans (CodeQL + Dependabot + SonarCloud). Green required. After any push that claims a phase green, check that push's run before starting the next phase (red-TDD and labeled-partial pushes exempt) — full-suite-only failures surface only here (case history: #122/#127). | GitHub Actions (issue #3); red → `diagnosing-bugs` |
| **PR** | **Open the PR as a draft as soon as the first phase commit exists** — CI fires on the `pull_request` event only (`push` is scoped to `main`, #417), so a branch with no PR gets **no CI at all**; `opened` gates the first push, `synchronize` every later one. A draft is a CI vehicle, not a request to review. When the slice is built: merge the latest `origin/main` in with full phase discipline (routing gate for what the integration touches, scoped tests, honest commit), then mark **ready for review** — which is what makes the Review and Sonar gates due (`references/pr-gates.md`). | `triage` (issue lifecycle — issues only in this repo; PRs go through normal review) |
| **Review** | **Mandatory gate**, due at ready-for-review. Start `/code-review` (a subagent fan-out) via the **invocation ladder** in `references/pr-gates.md` §1 — `/review <PR>` only as a declared degraded fallback, and **the overlay alone is NOT the review**. A rejected invocation name is not the gate being unavailable; if tooling genuinely blocks every rung, say so in the PR and leave the box unticked rather than substituting silently. Review the diff against the invariants; each fix re-enters at Implement. Green CI is not a substitute. | `riviera-review-overlay` + `/code-review` |
| **Sonar gate** | **Mandatory gate (PR-time; Sonar analyzes PRs + `main` only).** A green gate is not the check — pull the reported new-issue + duplication list from the API and fix every entry before merge; logic-changing findings re-enter at Implement (re-entry rule) — procedure: `references/pr-gates.md` §2. | SonarCloud + `diagnosing-bugs` for a genuine defect |
| **Merge** | Only after green CI + Review gate run + Sonar gate green **and** its issue list cleared + findings resolved through the loop → merge, then run the close-out checklist — procedure: `references/pr-gates.md` §3. | the Merge close-out (`references/pr-gates.md`) |

## Epic front-end (optional — for multi-slice epics)

Ahead of `Refine → Issue`, a big change can be authored top-down through three
Matt-Pocock craft skills: `wayfinder` (foggy epics **only** — destination clear, route
fog, decisions that won't fit one session; when `to-issues` can already cut clean
slices, skip it) → `to-spec` (synthesizes the discussion into one committed epic issue:
user stories + testing seams + out-of-scope) → `to-issues` (slices the spec's user
stories — the normal Issue stage). This is **optional scaffolding for epics, not a new
gate** — a single slice or a one-liner skips it entirely. The full procedure and the two
boundaries that keep it from fighting the loop (altitude: the spec is epic-level, the
plan doc slice-level; state store: the `wayfinder:map` issue governs charting only,
never build progress): `references/epic-front-end.md`.

## Issue-intake grill gate (summary)

A written issue is a snapshot of intent at creation time, not ground truth. Before authoring the
plan doc for an existing issue, run a `grilling` pass over it: re-validate the ACs against today's
code, check what else is in flight (open PRs, shared files, the next Flyway version number), and
sanity-check module ownership against `RESPONSIBILITIES.md`. Full procedure: `references/issue-intake-gate.md`.

## Skill-routing gate (mandatory — load *before* you write)

> This is a **gate, not a suggestion.** Before you author a plan section or a line of
> code for an area, you **MUST load that area's skill(s) first** and **announce which
> you loaded**. The `area:*` label (see `docs/agents/triage-labels.md`) is only the
> starting hint — the real trigger is **what the change actually touches**, and one slice
> usually trips several rows below. Skipping a row (writing the artifact first, loading
> the skill after) is a process miss the review gate will flag (RV-PROC-1).

| If the change touches… | Load BEFORE writing it (MUST) | Why |
|---|---|---|
| **A Postgres table / Flyway migration / index / SQL query** | **`postgres`** | PK/type/index/constraint design, not first-principles DDL |
| **Any backend module / structure** (Spring Modulith: new module, `api/` **or `spi/`** port, application service, domain event, JDBC adapter, controller, or moving a class between packages) | **`riviera-modulith`** (module layout, `api/`-vs-`spi/` named-interface boundaries, port-vs-event, `verify()` contract) + **`codebase-design`** (interfaces/seams) + **`domain-modeling`** (glossary/ADRs) | hexagonal package shape + invariant #11 boundaries (incl. the api-vs-spi choice for a cross-module *driven* port) enforced by `ModularityTests` + review (RV-BE-3b), not first-principles structure |
| **Writing/refactoring any backend Java** (class, record, port, JDBC adapter, event, controller, test) | **`riviera-java-conventions`** (Java idioms) + **`riviera-modulith`** (which package it belongs in) | Java 25 idioms: records, JDBC-only (no JPA/Lombok), constructor injection, package-private adapters, typed outcomes — **and** the right module/package per the hexagon. Both fire on any backend Java create/modify. **Also covers the validation/error contract (§6b).** |
| **A venue-scoped endpoint/service or operator identity** (`/api/venues/{venueId}/**`, payout ledger, staff bookings, beach-map edit, staff availability, weather refund; the `operator` module; per-venue ownership) | **`riviera-modulith`** (the `operator` module placement + the ownership-check seam) + **`riviera-java-conventions`** | invariant #13 (application-service check; RV-BE-9 Blocker) |
| **`payment` / `payout`, Stripe, charge / refund / commission / payout** | **`riviera-stripe-payments`** (+ `postgres` if a ledger table changes) | locks the collect-only / no-Connect model |
| **The Angular frontend** (component, service, route, styling, forms) | **`riviera-frontend`** (STRUCTURE: which folder — core/feature/shared taxonomy, import direction, routing/interceptor/guard placement) + **`angular-developer`** + the **angular-cli MCP** (`get_best_practices`, `search_documentation`) + **`riviera-tailwind`** whenever the change styles anything — a new component/template included — **or touches a component still carrying legacy SCSS** (migrate-on-touch) | placement per the FE structure authority (the `riviera-modulith` mirror); version-correct v22 APIs + a11y, not stale tutorials; **Tailwind whenever it can express the styling** (the default — SCSS only with a stated justification; unjustified fresh `.scss` is a review finding, RV-FE) |
| **A user-facing frontend flow / behaviour** (any component / route / form / service change a user can observe, or anything under `frontend/e2e/`) | **`playwright-cli`** (official `@playwright/cli` skill — drive the flow, scaffold a best-practice spec, mock requests, generate from actions) | every frontend slice ships e2e coverage authored to Playwright best practice — not an afterthought. **Which of the two suites a spec belongs in is `riviera-review-overlay` RV-FE-E2E's call** — the generic skill cannot know that split; consult it when placing the spec |
| **Scaffolding a new app** | **`angular-new-app`** (FE) | correct `ng new` flags + structure |
| **Running builds/tests locally** (the first `./gradlew` / `gradle` / `npm test` of the session, or diagnosing a local build failure) | **`riviera-local-debug`** | cloud-session Gradle/JDK/proxy recipe, scoped-test discipline, the local-OOM and Docker-skip constraints — instead of rediscovering them mid-slice |
| **Anything, always** | **`riviera-plan-doc`** (plan) · **`tdd`** (build) · **`riviera-review-overlay`** (review) · **`riviera-docs-freshness`** (close-out — due whenever the slice changes something a substrate doc *states*, which is most slices) | the always-on spine. The plan-doc template **pre-fills these in `Skills consulted`** so the constant part is edited rather than recalled — RV-PROC-1 caught an omission from that line on six consecutive slices (case history: #447) |

**How the gate runs — three steps, every time:**

1. **Detect.** List what the slice touches: DB? a backend module? the frontend? money?
   Use the repo as evidence, not memory — grep the modules, their published surfaces and
   call sites (delegate anything broad to an Explore agent) to find the blast radius a
   change reaches. An `area:fullstack` issue almost always trips DB **and** BE **and** FE —
   load all of them; don't stop at the label.

   > **An empty search result is not evidence of absence** — confirm any negative with
   > `git ls-files` before concluding a thing doesn't exist (search tools honour
   > `.gitignore`, which ignores `out/` — the name of every `adapter/out` package;
   > see `CLAUDE.md` § *Searching the codebase*).
2. **Load + announce.** Load each triggered skill **before** authoring that part and say
   so out loud, e.g. *"Loaded `postgres` (migration V2), `codebase-design` (venue seam),
   `angular-developer` + angular-cli MCP (beach-map component)."* If you wrote the
   migration before loading `postgres`, the gate already failed — redo it. A frontend
   slice loads `angular-developer` + the angular-cli MCP **and** `playwright-cli` (so the
   slice ships best-practice e2e coverage, not just a component).
3. **Record.** Name each loaded skill and what it changed in the plan doc's **Skills
   consulted** line (one phrase each). `riviera-review-overlay` checks that line against
   the diff: a migration in the diff with no `postgres` in *Skills consulted* is a finding.

This gate fires at the plan stage (vet the design), the implement stage (vet the code), **and
the review-fix stage** (vet each finding fix). Fixing a finding is implementation: re-detect
what the fix touches and load that area's skills **per the routing table** before you edit
(re-entry rule). Loading a skill earlier does not exempt you when a new area appears — nor
after a **context compaction**, where a previously loaded skill may survive only as a summary
sentence (re-load it; see Context hygiene) — and re-loading is cheap: when in doubt, load it.

## Rules of the loop

1. **One vertical slice per issue/PR.** A slice cuts through every layer (DB → API → UI → tests) and is demoable on its own — never a horizontal layer.
2. **Branch per issue:** `feature/<slug>` or `bugfix/<slug>` off `main`; reference `#NN` in commits.
3. **The CI gate is non-negotiable — and it runs per push, not per PR.** Which is why the PR is opened as a **draft as soon as the first phase commit exists** — the PR row (The loop) owns the why (#417). Red → `diagnosing-bugs`.
4. **The review gate is non-negotiable too — and "ran" means `/code-review` actually ran** (`references/pr-gates.md` §1).
5. **The plan owns the invariants.** If the slice touches booking, availability, or money, the plan doc states how the invariant holds, and review checks it.
6. **Right-size it.** A one-line/copy fix skips the plan doc; a spine-touching feature does not. (A code change still gets the review gate — proportional to size.)
7. **An existing issue gets grilled before it gets planned** — entering at a written ticket skips
   Refine, where `grilling` normally runs (`references/issue-intake-gate.md`). Don't trust a ticket because it reads complete.
8. **Review findings re-enter the loop at Implement** — the re-entry rule (The loop); it also covers red-CI fixes and later reviewer comments.
9. **The Sonar gate is non-negotiable, and its findings re-enter the same way** (`references/pr-gates.md` §2).
10. **Source-of-intent documents live in the repo, not the conversation.** Any plan, spec,
    or improvement plan that issues or ADRs reference must be **committed** (e.g.
    `docs/architecture/`, `docs/plans/`) before or with the artifacts that cite it —
    uncommitted means unavailable to the next session (case history: #93).
11. **The conversation is never the state store — rule 10, extended to *progress*.** The
    plan doc's Execution status section carries it; Context hygiene (below) owns the
    procedure.

## Context hygiene (long sessions, compaction, drift)

A long SDLC run fills the context window; the harness then **compacts** (summarizes) the
conversation and continues. Compaction is lossy in exactly the places this pipeline is
strict — which stage you're in, which gates already ran, the open findings, the loaded
skills' actual content — and lost gate state is how drift ships: a post-review fix that
skips the routing gate, a forgotten Sonar issue list, a merge without close-out. The
defense is not "use less context"; it is **the conversation is never the state store**:

1. **The plan doc's Execution status section is the state store** — stage pointer, next
   action, phase table, findings register — committed at every phase boundary and every
   stage transition (`riviera-plan-doc` owns the format). Kept current, compaction is a
   non-event: the re-anchor cost is one file read.
2. **Re-anchor rule.** After a compaction, or whenever unsure what stage you're in,
   re-read the plan doc's Execution status section **and** the current stage's reference
   file (`references/pr-gates.md`, `references/issue-intake-gate.md`) before acting.
   Never run a gate from the summary's memory of its procedure.
3. **Re-load rule.** A compaction is a new area-entry for the Skill-routing gate: re-load
   the routed skills for whatever you touch next — a skill loaded before compaction may
   survive only as a summary sentence, and trusting that sentence is how an invariant-#11
   violation ships at hour three. Re-loading is cheap.
4. **Keep bulk reads out of the main thread.** What fills context fastest is tool output,
   not skills. Delegate self-contained heavy reading to subagents that return conclusions:
   the review gate (`/code-review` already runs one), the Sonar issue-list triage,
   `riviera-docs-freshness`, and broad exploration (an Explore agent, which returns
   conclusions instead of raw grep dumps). Keep test runs scoped per
   `riviera-local-debug`; read file ranges, not whole files.
5. **Break marathon slices at the gate boundaries instead of pushing through.** The gates
   are designed as cold-entry points: a committed plan doc is everything an implement
   session needs (the issue-intake gate is the entry procedure), and the PR + plan doc is
   everything the review/sonar/merge session needs. When context runs high near a gate,
   finish the current phase, commit the Execution status, and continue in a fresh
   session — drift risk peaks exactly when the strictest gates run, and a fresh session
   with a current plan doc beats a compacted one every time.

## Remote / cloud session addendum

Cloud sessions (Claude Code on the web / iOS) differ from the idealized local setup:

- **Branch:** the session's **designated remote branch stands in for `feature/<slug>`** —
  develop and push there, and **record the substitution in the plan doc's Branch line**.
  Don't create the literal `feature/<slug>` branch. If the designated branch's PR already
  merged, restart the branch from latest `main` (same name) before new work.
- **Local builds & tests:** load **`riviera-local-debug`** before the session's first
  `./gradlew` or `npm` invocation — it owns the cloud specifics.
- **Toolset drift:** verify a tool can actually do what a skill assumes before promising
  it (recurring: Gmail is draft-only → push is the only notification channel; `gh` IS
  provisioned in cloud sessions but proxy-restricted — the working recipe and REST
  substitution table live in `references/pr-gates.md` §1, and the GitHub MCP tools remain
  the substitute when `gh` is missing). When an instruction is impossible in the current
  toolset, do the nearest honest thing and **say so in the reply** — don't silently
  half-do it.
- **Staying in touch (notifications):** SDLC runs typically start from the Claude iOS
  app; the user then walks away, phone locked — when the workflow needs them, reach out;
  don't go silent and wait. Push via `PushNotification` *before* any `AskUserQuestion`
  (a question prompt alone does **not** buzz the phone), and when work finishes and you
  await the next command. Email backstop only if a send-capable (not draft-only) tool
  exists — a short "done, your move" mail to the maintainer address from the session
  context, never one hardcoded here (draft-only Gmail, the common cloud case: skip
  email, say push was the only channel). **Never ping during live back-and-forth**; the
  trigger is "they may have walked away and something is waiting" — err toward sending
  for blocking questions and completions. If pushes don't arrive: iOS → Settings →
  Notifications → Claude → Allow Notifications.

## IntelliJ IDEA session addendum (`idea` MCP)

Detection is tool presence, not environment guessing: if `mcp__idea__*` tools are
available this session, the project is open in IntelliJ IDEA — read
`references/idea-mcp.md` (where the tools pay off per stage, and why the server stays
out of the committed settings). If they're absent (cloud session, plain terminal), skip
it entirely; never try to connect, enable, or add the `idea` server yourself — and never
add it to any `disabledMcpjsonServers` list (a deny at any scope wins over every enable,
including the developer machine's).

## The substrate these skills read

- **`CLAUDE.md`** — conventions + the 13 invariants (canonical rules).
- **`CONTEXT.md`** — the domain glossary (ubiquitous language). Keep issue/commit/code vocabulary consistent with it; `domain-modeling` updates it inline.
- **`docs/adr/`** — locked decisions + rationale. Respect them; `domain-modeling` offers
  a new ADR only when a choice is hard-to-reverse **and** surprising **and** a real trade-off.
- **`docs/agents/`** — issue-tracker, triage-label, and domain-doc config.
- **`docs/architecture/domain-model.md`** — aggregates, flows, state machines.

## When NOT to use

- Trivial fixes and throwaway spikes (note the branch as a spike, skip the ceremony).
- Outside this repo — the routing and substrate are project-specific.

## Integration

The loop table and the Skill-routing gate above ARE the skill map — there is no separate
list to maintain. Vendored craft skills (Matt Pocock, MIT) are tracked in
`skills-lock.json`; four of them are not routed above: `improve-codebase-architecture`
(deepening existing code outside slice work), `grill-me` (the `grilling` alias), and
`research` + `prototype`, which only `wayfinder` routes — as decision-ticket types.

**Three skills are human-invoke-only** — `implement`, `grill-me`, and
`improve-codebase-architecture` carry upstream's `disable-model-invocation: true`, so the
Skill tool refuses them and forbids re-enacting their workflow by other means. That flag is
**kept deliberately** (the lockfile records why per skill): each is a *human's* entry
command whose body this repo already encodes more precisely, so routing to one would be a
dead edge. Everything they cover is reachable through the rows above — `implement` → this
table's Implement row, `grill-me` → `grilling`. Don't drop the flag to "fix" a refusal.

## References

- `references/epic-front-end.md` — read at Refine/Issue when the change is a multi-slice
  epic: the `wayfinder` → `to-spec` → `to-issues` chain and its two altitude/state-store
  boundaries.
- `references/issue-intake-gate.md` — read at plan entry whenever work starts from an
  existing issue: grill checklist, in-flight/Flyway-number check, module-ownership check.
- `references/pr-gates.md` — read when the PR is marked **ready for review** (not when the
  draft opens, #417): the Review gate, the
  SonarCloud gate (API URLs, triage rules), and the Merge close-out checklist.
- `references/idea-mcp.md` — read only when `mcp__idea__*` tools are present: per-stage
  payoffs and the settings rules for the JetBrains `idea` MCP server.
- `references/case-history.md` — the incidents behind the rules (#122/#127, #158, #72,
  #93, epic #141's un-ticked checklist, O6/PR #219, PR #318, the three docs-only
  close-out PRs, #351, PR #353/#355); read when you want the why.
