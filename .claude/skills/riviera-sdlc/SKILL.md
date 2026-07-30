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

## Staying in touch (notifications)

SDLC runs typically start from the Claude iOS app; the user then walks away, phone locked — when the workflow needs them, reach out; don't go silent and wait.

- **Push via `PushNotification`** *before* any `AskUserQuestion` (a question prompt alone
  does **not** buzz the phone), and when work finishes and you await the next command.
- **Email backstop only if a send-capable (not draft-only) tool exists** — a short "done,
  your move" mail to the maintainer address from the session context, never one hardcoded
  here. Draft-only Gmail (the common cloud case): skip email, say push was the only channel.
- **Never ping during live back-and-forth**; the trigger is "they may have walked away and
  something is waiting" — err toward sending for blocking questions and completions.
- If pushes don't arrive: iOS → Settings → Notifications → Claude → Allow Notifications.

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
| **Refine** | Sharpen a fuzzy idea into a precise, sliceable use case. Ground the interview in what already exists — `graphify query "<idea>"` / `explain "<concept>"` (when the graph is present) so you refine against the real code, not assumptions. A **foggy epic** (destination clear, route not) may first be charted with `wayfinder` — see *Epic front-end*, below. | `grilling` (interview), `domain-modeling` (vocabulary + ADRs); `wayfinder` (foggy epics only) |
| **Issue** | Break the use case into vertical-slice tracer-bullet issues on GitHub. For an **epic** (multi-slice), optionally first synthesize a committed epic **spec** — user stories + testing seams + out-of-scope — then slice its user stories (see *Epic front-end*, below). Any strategic document the issues reference must be committed to the repo before or with them (rule 10). | `to-spec` (epic spec, optional) → `to-issues` |
| **Plan** | Write the plan doc: testable ACs, risk register, and — if booking/availability/money is touched — how the invariant holds. Map the affected surface (modules + events + blast radius) with `graphify query`/`path` — evidence for the plan's *modules/events touched* section and the Detect step below. Entering at an existing issue? Grill it first — procedure: `references/issue-intake-gate.md`. Then the Skill-routing gate. | `riviera-plan-doc` (owner) + `grilling` + both gates |
| **Implement** | Build the slice test-first, one behavior at a time, at agreed seams. Re-run the Skill-routing gate for each area you touch. | `implement` + `tdd` + the Skill-routing gate (below) |
| **CI gate** | Every push to an **open PR** builds both apps, runs tests, scans (CodeQL + Dependabot + SonarCloud). Green required. After any push that claims a phase green, check that push's CI run before starting the next phase (red-TDD and labeled-partial pushes exempt) — full-suite-only failures surface only here (case history: #122/#127). **CI fires on `pull_request` only** for branches (`push` is scoped to `main`, #417) — so a branch with no PR yet gets **no CI at all**; that is why the draft PR is opened as soon as the first phase commit exists, not at the PR stage. | GitHub Actions (issue #3); red → `diagnosing-bugs` |
| **PR** | **Open the PR as a draft as soon as there is a commit to open it on.** A PR cannot exist on an empty branch (`No commits between main and <branch>`), so the order is: first phase commit → push (no CI yet) → **open the draft immediately**. The `pull_request: opened` event gates that first push; every later push is gated by `synchronize`. Then, when the slice is built: merge the latest `origin/main` into the branch — integrate anything that landed since the cut with full phase discipline (routing gate for what the integration touches, scoped tests, honest commit) — and mark the PR **ready for review**. **Ready-for-review is what makes the Review and Sonar gates due** (`references/pr-gates.md`), not the draft's existence — a draft is a CI vehicle, not a request to review. | `triage` (issue lifecycle — issues only in this repo; PRs go through normal review) |
| **Review** | **Mandatory gate.** **Always start `/code-review` (a subagent fan-out; `/review <PR>` only as a degraded fallback) — the overlay alone is NOT the review**. Start it via the **invocation ladder** in `references/pr-gates.md` §1: the Skill tool refuses `/code-review` by upstream policy (human-invoke-only since CLI v2.1.215), so the operative rung executes the installed plugin's `commands/code-review.md` directly — that still counts as the gate, since the plugin payload stays the source of truth. A rejected invocation name is easy to misread as the gate being unavailable — a whole review was once run on the degraded fallback over exactly that; misreading it leaves the generic banks unrun. If tooling genuinely blocks every rung, say so in the PR and leave the box unticked rather than substituting silently. Review the PR diff against the invariants; record findings; each fix re-enters at Implement (re-entry rule). Green CI is not a substitute — procedure: `references/pr-gates.md` §1. | `riviera-review-overlay` + `/code-review` |
| **Sonar gate** | **Mandatory gate (PR-time; Sonar analyzes PRs + `main` only).** A green gate is not the check — pull the reported new-issue + duplication list from the API and fix every entry before merge; logic-changing findings re-enter at Implement (re-entry rule) — procedure: `references/pr-gates.md` §2. | SonarCloud + `diagnosing-bugs` for a genuine defect |
| **Merge** | Only after green CI + Review gate run + Sonar gate green **and** its issue list cleared + findings resolved through the loop → merge, then run the close-out checklist — procedure: `references/pr-gates.md` §3. | the Merge close-out (`references/pr-gates.md`) |

## Epic front-end (optional — for multi-slice epics)

Ahead of `Refine → Issue`, a big change can be authored top-down through three
Matt-Pocock craft skills. This is **optional scaffolding for epics**, not a new gate —
a single slice or a one-liner skips it entirely.

```
wayfinder            →   to-spec               →   to-issues
chart foggy              formalize: user           slice user stories into
decisions across         stories + testing         tracer-bullet vertical
sessions (epic map)      seams + out-of-scope      issues (ready-for-agent)
(foggy epics only)       (committed epic issue)    (the normal Issue stage)
```

- **`wayfinder` — foggy epics only.** Use it *only* when the destination is clear but
  the route is fog and the decisions won't fit one session (SSO / #112 had that shape
  before it shipped). When
  `to-issues` can already cut clean slices — the common case, since the product design spec
  + domain model are captured up front — **skip it**. It charts a `wayfinder:map` issue of
  **decision** tickets (not build slices), resolved one per session until the way is clear.
- **`to-spec` — the epic spec.** Synthesizes the discussion into one committed epic issue
  (Problem / Solution / numbered **User Stories** / Implementation Decisions / **Testing
  Seams** / Out of scope). Its user stories are what `to-issues` then slices against.
- **`to-issues` — unchanged.** The normal Issue stage; consumes the spec's user stories.

**Two boundaries that keep this from fighting the rest of the loop:**

1. **Altitude.** `to-spec` is **epic-level** (user stories, seams, out-of-scope, committed
   once). `riviera-plan-doc` stays **slice-level** (testable ACs, risk register, invariant
   proof, the Execution-status state store). Don't restate slice ACs in the spec — two spec
   layers is the failure mode.
2. **State store.** The `wayfinder:map` issue governs the **charting** phase only. The
   moment a slice enters execution, the plan-doc **Execution status** section is the state
   store (rules 10–11) — the map *indexes* decisions, it does not track build progress.

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
| **The Angular frontend** (component, service, route, styling, forms) | **`riviera-frontend`** (STRUCTURE: which folder — core/feature/shared taxonomy, import direction, routing/interceptor/guard placement) + **`angular-developer`** + the **angular-cli MCP** (`get_best_practices`, `search_documentation`) | placement per the FE structure authority (the `riviera-modulith` mirror); version-correct v22 APIs + a11y, not stale tutorials |
| **A user-facing frontend flow / behaviour** (any component / route / form / service change a user can observe, or anything under `frontend/e2e/`) | **`playwright-cli`** (official `@playwright/cli` skill — drive the flow, scaffold a best-practice spec, mock requests, generate from actions) | every frontend slice ships e2e coverage authored to Playwright best practice — not an afterthought; checked by RV-FE-E2E. **Project facts the generic skill can't know** — the two-suite split (CI-safe mocked-a11y `frontend/e2e/` vs local-only real-backend `frontend/e2e/real-backend/`) and which suite a spec belongs in — live in the review overlay's RV-FE-E2E item; consult it when placing the spec |
| **Scaffolding a new app** | **`angular-new-app`** (FE) | correct `ng new` flags + structure |
| **Running builds/tests locally** (the first `./gradlew` / `gradle` / `npm test` of the session, or diagnosing a local build failure) | **`riviera-local-debug`** | cloud-session Gradle/JDK/proxy recipe, scoped-test discipline, the local-OOM and Docker-skip constraints — instead of rediscovering them mid-slice |
| **Anything, always** | **`riviera-plan-doc`** (plan) · **`tdd`** (build) · **`riviera-review-overlay`** (review) · **`riviera-docs-freshness`** (close-out — due whenever the slice changes something a substrate doc *states*, which is most slices) | the always-on spine. The plan-doc template **pre-fills these in `Skills consulted`** so the constant part is edited rather than recalled — RV-PROC-1 caught an omission from that line on six consecutive slices (case history: #447) |

**How the gate runs — three steps, every time:**

1. **Detect.** List what the slice touches: DB? a backend module? the frontend? money?
   Use the knowledge graph as evidence, not memory — `graphify query "<slice>"` and
   `graphify path "<A>" "<B>"` surface the modules, call sites, and blast radius a change
   reaches. (The graph is local/gitignored, so it's absent in a fresh clone — fall back to
   grep there.) An `area:fullstack` issue almost always trips DB **and** BE **and** FE —
   load all of them; don't stop at the label.

   > **An empty graph result is not evidence of absence** — confirm any negative with
   > `git ls-files`/grep before concluding a thing doesn't exist; the #321 blind-spot
   > check lives in `CLAUDE.md`'s graphify section.
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
3. **The CI gate is non-negotiable — and it runs per push, not per PR.** Which is why the PR is opened as a **draft as soon as the first phase commit exists**: CI fires on the `pull_request` event only, so an open PR is what makes "per push" true (#417). The CI-gate row (The loop); red → `diagnosing-bugs`.
4. **The review gate is non-negotiable too — and "ran" means `/code-review` actually ran** — the Review row (The loop) plus the procedure (`references/pr-gates.md` §1).
5. **The plan owns the invariants.** If the slice touches booking, availability, or money, the plan doc states how the invariant holds, and review checks it.
6. **Right-size it.** A one-line/copy fix skips the plan doc; a spine-touching feature does not. (A code change still gets the review gate — proportional to size.)
7. **An existing issue gets grilled before it gets planned** — entering at a written ticket skips
   Refine, where `grilling` normally runs (`references/issue-intake-gate.md`). Don't trust a ticket because it reads complete.
8. **Review findings re-enter the loop at Implement** — the re-entry rule (The loop), verbatim; it also covers red-CI fixes and later reviewer comments.
9. **The Sonar gate is non-negotiable, and its findings re-enter too** — the re-entry rule (The loop) plus the Sonar procedure (`references/pr-gates.md` §2).
10. **Source-of-intent documents live in the repo, not the conversation.** Any plan, spec,
    or improvement plan that issues or ADRs reference must be **committed** (e.g.
    `docs/architecture/`, `docs/plans/`) before or with the artifacts that cite it —
    uncommitted means unavailable to the next session (case history: #93).
11. **The conversation is never the state store — rule 10, extended to *progress*.** The
    plan doc's Execution status section carries the stage pointer, next action, phase
    status, and findings register; commit it at every phase boundary and stage transition,
    and re-anchor from it after any compaction (Context hygiene, below).

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
   `riviera-docs-freshness`, and broad exploration (an Explore agent, or `graphify query`'s
   scoped subgraph instead of raw grep dumps). Keep test runs scoped per
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
  provisioned in cloud sessions by `scripts/cloud-session-setup.sh` step 6, but the
  repo-scope proxy serves REST plus only a pinned set of PR-review GraphQL operations —
  most GraphQL subcommands 403; the substitution table lives in `references/pr-gates.md` §1, and the GitHub MCP tools remain
  the substitute when `gh` is missing). When an instruction is impossible in the current
  toolset, do the nearest honest thing and **say so in the reply** — don't silently
  half-do it.
- **Knowledge graph:** `graphify-out/` is gitignored, so a fresh cloud clone starts
  without it — the Refine/Plan/Detect graph steps have nothing to query. Either build it
  once (`/graphify .` — code is free via AST, the doc-semantic pass costs tokens) or fall
  back to grep/read; don't assume `graphify query` is available. The post-commit hook still
  rebuilds code changes locally within the session once the graph exists.

## IntelliJ IDEA session addendum (`idea` MCP)

The JetBrains `idea` MCP server is defined at **project scope** (`.mcp.json`) but is
deliberately **absent from the committed `.claude/settings.json` `enabledMcpjsonServers`**
list — it activates only where a machine-local setting enables it (the developer machine's
gitignored `.claude/settings.local.json` sets `enableAllProjectMcpServers: true`). It points
at `127.0.0.1:64342`, which exists only next to a running IDE; in a cloud session it stays
unapproved, or at worst is marked *failed* after connection retries. Do **not** "fix" that
by adding `idea` to the committed `enabledMcpjsonServers`, and never add it to any
`disabledMcpjsonServers` list — a deny at any scope wins over every enable, including the
developer machine's.

- **Detection is tool presence, not environment guessing:** if `mcp__idea__*` tools are
  available this session, the project is open in IntelliJ IDEA — apply this addendum. If
  they're absent (cloud session, plain terminal), skip it entirely; never try to connect
  or add the server yourself.
- **Where they pay off in the loop:**
  - *Implement:* after an edit, `get_file_problems` / `lint_files` return the IDE's
    inspection verdict faster than a compile cycle; `rename_refactoring` for symbol
    renames instead of grep-and-replace.
  - *Plan / Detect:* `analyze_calls` + `get_symbol_info` complement `graphify` when
    mapping blast radius.
  - *Debug:* the `xdebug_*` breakpoint/session tools when `diagnosing-bugs` needs
    runtime state.
- They **supplement, never replace** the gates: scoped test runs (`riviera-local-debug`)
  and CI remain the verification — an inspection-clean file is not a green build.

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

- **Riviera skills:** `riviera-plan-doc` (plan), `riviera-review-overlay` (review),
  `riviera-modulith` (backend module structure / boundaries), `riviera-java-conventions`
  (backend Java idioms), `riviera-stripe-payments` (money), `riviera-frontend` (FE
  structure) + `angular-developer` + `playwright-cli` (frontend), `riviera-local-debug`
  (build/test recipes), `riviera-docs-freshness` (merge close-out step 5).
- **Vendored craft skills (Matt Pocock, MIT):** `grilling`/`grill-me`, `wayfinder`
  (foggy-epic charting) → `to-spec` (epic spec) → `to-issues` (slice) — the *Epic
  front-end* chain — plus `implement`, `tdd`, `diagnosing-bugs`, `codebase-design`,
  `domain-modeling`, `triage`, `improve-codebase-architecture` (use the last one once
  there is code to deepen).

## References

- `references/issue-intake-gate.md` — read at plan entry whenever work starts from an
  existing issue: grill checklist, in-flight/Flyway-number check, module-ownership check.
- `references/pr-gates.md` — read when the PR is marked **ready for review** (not when the
  draft opens, #417): the Review gate, the
  SonarCloud gate (API URLs, triage rules), and the Merge close-out checklist.
- `references/case-history.md` — the incidents behind the rules (#122/#127, #158, #72,
  #93, epic #141's un-ticked checklist, O6/PR #219, PR #318, the three docs-only
  close-out PRs, #351, PR #353/#355); read when you want the why.
