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

## Staying in touch (notifications)

The user typically triggers SDD runs from the **Claude iOS app** and then walks
away with the phone locked in a pocket. So when the workflow reaches a point that
needs them, **reach out — don't go silent and wait.**

- **Primary channel — push to the phone.** Use `PushNotification` so it lands on
  the iOS lock screen via the app (Remote Control). Fire it at the two moments
  they'd want to be pulled back:
  - **Blocking question** — *before* you call `AskUserQuestion` (a question prompt
    alone does **not** buzz the phone), send a one-line push so they know a
    decision is waiting. Then ask via `AskUserQuestion`.
  - **Nothing left to do / slice done** — when you finish the work and are waiting
    on the next command, push a one-line "ready for next command" with what you
    finished.
- **Backstop / written record — email.** Also send an email to
  **`ivopogace@gmail.com`** (via the Gmail tools) for the "done, your move" case
  and whenever a push may not get through (Remote Control not connected). This is
  the durable trail; the push is the buzz.
- **Don't ping during live back-and-forth.** If they're clearly present and
  replying within seconds, no push/email — they're already here. The trigger is
  *"there's a real chance they've walked away and something is waiting."* Err
  toward sending for blocking questions and completions; stay quiet otherwise.

(One-time check to mention if pushes don't seem to arrive: iOS → Settings →
Notifications → Claude → Allow Notifications must be ON.)

> **Maintainer note (privacy/portability):** this section hardcodes a personal
> destination email. That's fine as private config, but it is PII baked into a shared
> skill file: if these skills are ever templated, published, or copied to another repo,
> it leaks. Consider parameterizing the address (env var / non-committed local config)
> rather than inlining it.

## The loop

```
refine → issue → plan → implement → CI gate → PR → review → sonar gate → merge
                          ▲                                              │
                          └──── findings re-enter (review AND sonar) ────┘
                          (fix = implement: Skill-routing gate + tdd + CI + re-review)
```

**The loop is a loop, not a line.** Review is not the last stop before merge — its findings
**flow back to Implement** and run the same gates again. **The SonarCloud quality gate (below) is the
same shape: a Sonar finding that changes implemented logic re-enters at Implement** (decide BE/FE,
load that area's skill, `tdd`, CI, re-review) exactly like a review finding. The single most common
process miss is treating a post-review (or post-Sonar) fix as exempt: a migration patched without
`postgres`, an Angular tweak without `angular-developer` + the MCP, a backend edit without
`riviera-modulith`. A fix is a change; a change re-enters the loop.

| Stage | What happens | Driving skill(s) |
|---|---|---|
| **Refine** | Sharpen a fuzzy idea into a precise, sliceable use case. | `grilling` (interview), `domain-modeling` (vocabulary + ADRs) |
| **Issue** | Break the use case into vertical-slice tracer-bullet issues on GitHub. | `to-issues` |
| **Plan** | For a grabbed issue, write the plan doc with testable ACs, the risk register, and — if booking/availability/money is touched — exactly how the relevant invariant is upheld. **When entering at an existing issue, run the Issue-intake grill gate first; then the Skill-routing gate.** | `riviera-plan-doc` (owner) + `grilling` + **the Issue-intake grill gate + the Skill-routing gate (below)** |
| **Implement** | Build the slice test-first, one behavior at a time, at agreed seams. **Re-run the Skill-routing gate** for each area you touch. | `implement` + `tdd` + **the Skill-routing gate (below)** |
| **CI gate** | Every push/PR builds both apps, runs tests, and scans (CodeQL + Dependabot + SonarCloud). Green is required. | GitHub Actions (issue #3). A red pipeline → `diagnosing-bugs` |
| **PR** | Open a PR into `main`. Opening the PR does **not** complete the next stage. | `triage` (issue/PR lifecycle) |
| **Review** | **Mandatory gate.** Run a review over the PR diff against the invariants; record findings; fix/triage them. **Each fix re-enters at Implement** (Skill-routing gate + `tdd` + CI gate), then the touched surface is re-reviewed. Green CI is **not** a substitute. **Run the Review gate (below).** | `riviera-review-overlay` + `/code-review` — **the Review gate (below)** |
| **Sonar gate** | **Mandatory gate (PR-time).** SonarCloud's quality gate runs on the PR (it analyzes PRs + `main`, never a feature-branch push). Wait for it; it must pass with **no new issues** (new-code coverage ≥ 80%). **A new issue that changes implemented logic re-enters at Implement** through the Skill-routing gate (decide BE/FE, load that area's skill, `tdd`, CI, re-review) — exactly like a review finding. **Run the Sonar gate (below).** | SonarCloud (issue #3) + **the Sonar gate (below)** + `diagnosing-bugs` for a genuine defect it flags |
| **Merge** | Only after **green CI + Review gate done + Sonar quality gate green (no new issues) + findings resolved _through the loop_** → merge; close the issue. | — |

## Issue-intake grill gate (mandatory when entering at an existing issue)

> A written issue is a **snapshot of intent at creation time, not ground truth.** By the
> time you pick it up the code may have moved, a sibling slice may have changed a
> contract, an ADR may have landed, or the issue may simply have missed something nobody
> thought of at creation. **Before** you author the plan doc for an already-written issue
> you **MUST** run a `grilling` pass over it. This is a **gate, not a suggestion** — do
> not treat the issue text as correct-by-default, and "the issue looked complete" is never
> a reason to skip (that is exactly when stale ACs slip through).

**How the gate runs — every time work starts from an existing issue:**

1. **Trigger.** Any time you enter the loop at an **existing** issue (you grabbed `#NN`,
   or the user said "implement/work on #NN") rather than refining a fresh idea, this gate
   is **due before the Plan stage**. Refining a brand-new idea already runs `grilling` at
   the Refine stage, so it is exempt — this gate is the catch for work that *skips* Refine
   by starting from a written ticket.
2. **Grill the issue against current reality.** Load `grilling` and interrogate the ticket:
   - Are the acceptance criteria still **correct, complete, and testable today**?
   - Has the codebase moved since it was written — APIs, schema, sibling slices, ADRs,
     design tokens? Cross-check against the **actual code/spec**, not the issue's
     assumptions. (E.g. example values inlined in the issue may be stale.)
   - What did we **not** think of when we wrote it — missing states, edge cases, the
     invariants in play (esp. #2 availability, #4 cutoff, #5 money, #8 webhook-as-truth)?
   - **Which module should own each piece of the work?** Sanity-check the intended
     placement against `RESPONSIBILITIES.md` (Job / Not-My-Job) *before* planning: does
     any step put logic in a module whose **Not My Job** list rejects it (a refund
     *decision* in `payment`, commission *math* in `venue`, a login subsystem in
     `customer`), or that two modules both claim? Catching a misplacement here is a
     sentence in the plan; catching it at review is a diff. The plan doc then records
     the answer in its Module-ownership table (plan-doc §4a).
   - Division of labor (same rule as any grill): answer the **discoverable/factual**
     questions yourself from the code/spec and mark each "← confirm?"; escalate the
     **intent/decision** questions to the user via `AskUserQuestion`. Never auto-fill a
     product decision the human owns.
3. **Reconcile before building.** Fold the outcome into the plan doc's
   **Open questions / Assumptions** and **Acceptance criteria**. If the issue is materially
   stale, say so and **update the issue (or record the drift)** before you plan against it.
   A surprise caught at this gate is far cheaper than one caught at the review gate or in
   production.

**Proportional, never skipped:** a one-line/copy fix needs only a quick sanity read, not a
full interview; a spine-touching slice (booking, availability, money) gets the full grill.
The size flexes; the gate does not.

## Skill-routing gate (mandatory — load *before* you write)

> This is a **gate, not a suggestion.** Before you author a plan section or a line of
> code for an area, you **MUST load that area's skill(s) first** and **announce which
> you loaded**. The `area:*` label (see `docs/agents/triage-labels.md`) is only the
> starting hint — the real trigger is **what the change actually touches**, and one
> slice usually trips several rows below. A migration written without `postgres`, **any
> backend Java created or modified without `riviera-modulith` loaded** (so the class lands
> in the right module/package and the `api/` boundary holds), a new module seam without
> `codebase-design`, an Angular component without `angular-developer` + the Angular MCP,
> or a **user-facing frontend flow shipped without `playwright-cli` (the e2e coverage it
> drives)** is a **process miss** the review gate will flag.

| If the change touches… | Load BEFORE writing it (MUST) | Why |
|---|---|---|
| **A Postgres table / Flyway migration / index / SQL query** | **`postgres`** | PK/type/index/constraint design, not first-principles DDL |
| **Any backend module / structure** (Spring Modulith: new module, `api/` **or `spi/`** port, application service, domain event, JDBC adapter, controller, or moving a class between packages) | **`riviera-modulith`** (module layout, `api/`-vs-`spi/` named-interface boundaries, port-vs-event, `verify()` contract) + **`codebase-design`** (interfaces/seams) + **`domain-modeling`** (glossary/ADRs) | hexagonal package shape + invariant #11 boundaries (incl. the api-vs-spi choice for a cross-module *driven* port) enforced by `ModularityTests` + review (RV-BE-3b), not first-principles structure |
| **Writing/refactoring any backend Java** (class, record, port, JDBC adapter, event, controller, test) | **`riviera-java-conventions`** (Java idioms) + **`riviera-modulith`** (which package it belongs in) | Java 25 idioms: records, JDBC-only (no JPA/Lombok), constructor injection, package-private adapters, typed outcomes — **and** the right module/package per the hexagon. Both fire on any backend Java create/modify. **Also covers the validation/error contract (§6b).** |
| **A venue-scoped endpoint/service or operator identity** (`/api/venues/{venueId}/**`, payout ledger, staff bookings, beach-map edit, staff availability, weather refund; the `operator` module; per-venue ownership) | **`riviera-modulith`** (the `operator` module placement + the ownership-check seam) + **`riviera-java-conventions`** | Per-venue authorization is the multi-operator launch blocker (BOLA, OWASP #1) — the actor-owns-venue check must sit in the application service, not the controller. Reviewed by RV-BE-9 (Blocker). |
| **`payment` / `payout`, Stripe, charge / refund / commission / payout** | **`riviera-stripe-payments`** (+ `postgres` if a ledger table changes) | locks the collect-only / no-Connect model |
| **The Angular frontend** (component, service, route, styling, forms) | **`angular-developer`** + the **angular-cli MCP** (`get_best_practices`, `search_documentation`) | version-correct v22 APIs + a11y, not stale tutorials |
| **A user-facing frontend flow / behaviour** (any component / route / form / service change a user can observe, or anything under `frontend/e2e/`) | **`playwright-cli`** (official `@playwright/cli` skill — drive the flow, scaffold a best-practice spec, mock requests, generate from actions) | every frontend slice ships e2e coverage authored to Playwright best practice — not an afterthought; checked by RV-FE-E2E. **Project facts the generic skill can't know** — the two-suite split (CI-safe mocked-a11y `frontend/e2e/` vs local-only real-backend `frontend/e2e/real-backend/`) and which suite a spec belongs in — live in the review overlay's RV-FE-E2E item; consult it when placing the spec |
| **Scaffolding a new app** | **`angular-new-app`** (FE) | correct `ng new` flags + structure |
| **Anything, always** | **`riviera-plan-doc`** (plan) · **`tdd`** (build) · **`riviera-review-overlay`** (review) | the always-on spine |

**How the gate runs — three steps, every time:**

1. **Detect.** List what the slice touches: DB? a backend module? the frontend? money?
   An `area:fullstack` issue almost always trips DB **and** BE **and** FE — load all of
   them. Don't stop at the label.
2. **Load + announce.** Load each triggered skill **before** authoring that part and say
   so out loud, e.g. *"Loaded `postgres` (migration V2), `codebase-design` (venue seam),
   `angular-developer` + angular-cli MCP (beach-map component)."* If you wrote the
   migration before loading `postgres`, the gate already failed — redo it. A frontend slice
   loads `angular-developer` + the angular-cli MCP **and** `playwright-cli` — the latter so
   the slice ships best-practice e2e coverage, not just a component.
3. **Record.** Name each loaded skill and what it changed in the plan doc's **Skills
   consulted** line (one phrase each). `riviera-review-overlay` checks that line against
   the diff: a migration in the diff with no `postgres` in *Skills consulted* is a finding.

This gate fires at the plan stage (vet the design), the implement stage (vet the code),
**and the review-fix stage** (vet each finding fix). Fixing a finding is implementation:
**re-detect what the fix touches and load that area's skill before you edit it** — a migration
fix needs `postgres`, a backend fix needs `riviera-modulith` + `riviera-java-conventions`, a
frontend fix needs `angular-developer` + the angular-cli MCP **+ `playwright-cli`**
(re-cover or adjust the e2e), a money fix needs
`riviera-stripe-payments`. "It's only a review fix / it's small / CI is already green" is **not**
an exemption — that mindset is precisely how the gate gets skipped on the last mile. Loading a
skill earlier does **not** exempt you when a new area appears, and re-loading is cheap — when in
doubt, load it.

## Review gate (mandatory — between PR and merge)

> The `review` stage is a **gate, not a label on the diagram.** Opening a PR, getting
> green CI, and clearing Sonar are **necessary but not sufficient** — none of them is the
> review. A slice is **not done** and **must not be merged** until the review gate has run
> and its findings are resolved or explicitly deferred. The single most common way this
> stage is skipped: treating "PR opened + CI green" as the finish line and sliding to
> "done." It is not.

**How the gate runs — every PR, before merge:**

1. **Trigger.** The moment a PR exists (or before you would call a slice "done"/"ready to
   merge"), the review gate is **due**. Do not wait to be asked.
2. **Run the review.** Start a review over the **PR diff** — `/code-review`
   `origin/main...HEAD` (or `/review <PR>`) — and **load `riviera-review-overlay`** so the
   project bank items (RV-BE-*/RV-FE-*/RV-CT-*, the availability and payment Blockers,
   RV-PROC-1) are walked **on top of** the generic banks. Announce it: *"Running the SDD
   review gate (riviera-review-overlay + code-review) on PR #NN."*
3. **Resolve — back through the loop, not around it.** A finding fix is implementation work, so
   it gets the **same gates the original code got**:
   - **Re-run the Skill-routing gate for each fix** — detect what the fix touches and load that
     area's skill *before* editing (DB → `postgres`; backend → `riviera-modulith` +
     `riviera-java-conventions`; frontend → `angular-developer` + angular-cli MCP +
     `playwright-cli`; money → `riviera-stripe-payments`). Build it test-first (`tdd`).
   - **Update the plan's _Skills consulted_ line** with any new area a fix pulled in, so RV-PROC-1
     stays truthful.
   - **Re-run the CI gate** (push → green again) **and re-review the changed surface** — re-run
     `/code-review` on the new diff, or at minimum re-walk the overlay bank items + RV-PROC-1 for
     the area the fix touched. Fix-commits change the diff, so the routing-gate check applies to
     them too.
   - Out-of-scope findings → a follow-up issue with a one-line rationale.
   - Record the outcome (findings + fixes + skills loaded) in the plan doc's review note or the PR.
   - **No "post-review exemption":** a fix being small or arriving after a green CI does **not**
     excuse it from the gate. That is the exact path by which the rules get skipped on the last mile.
4. **Only then merge.** Merge is reached **only** when CI is green **and** the review gate has run
   **and** findings are resolved/deferred **and the fix round itself cleared the loop** (routing
   gate loaded per fix, CI green again, changed surface re-reviewed). "Green + reviewed (incl. the
   fixes)," never "green."

**Definition of done for a slice:** green CI **and** review gate run **and** Sonar quality gate
green (no new issues) **and** findings resolved/deferred **and** the issue's acceptance criteria
verified. Missing any one means the slice is still in flight — say so rather than reporting it done.

## SonarCloud quality gate (mandatory — on the PR, before merge)

> SonarCloud's quality gate is **not** a feature-branch check — by design (`ci.yml`) Sonar analyzes
> **pull requests and `main` only**, because SonarCloud's plan cannot read non-`main` branches and a
> branch-push Sonar job would go spuriously red. So the Sonar gate is **due when the PR exists**, runs
> on the PR's check suite, and is a **distinct gate from CI** (a green CI build does **not** mean Sonar
> passed — the SonarCloud check is separate). A slice is **not** mergeable until this gate is green.

**How the gate runs — every PR, after CI + the Review gate, before merge:**

1. **Trigger.** The moment the PR is open, the SonarCloud analysis runs on the PR head. Wait for the
   **SonarCloud Code Analysis** check (and the PR's quality-gate status) to complete — do not merge on
   "CI green" alone. The quality gate must **pass** with **no new issues** on new code and **new-code
   coverage ≥ 80%**.
2. **Read the findings.** Pull the PR's check runs / Sonar quality-gate status (e.g.
   `pull_request_read get_check_runs`, or the SonarCloud PR decoration). Triage each **new** issue Sonar
   raises — bug, vulnerability, code smell, security hotspot, or a coverage shortfall on new code.
3. **Resolve — back through the loop, not around it.** This is the crux of the gate, and the reason it
   exists as a first-class stage:
   - **A Sonar finding that changes implemented logic is a code change, so it re-enters at Implement** —
     run the **Skill-routing gate** for the fix: **decide whether the issue is backend or frontend**, load
     that area's skill(s) *before* editing (DB → `postgres`; backend → `riviera-modulith` +
     `riviera-java-conventions`; frontend → `angular-developer` + the angular-cli MCP + `playwright-cli`;
     money → `riviera-stripe-payments`), build the fix test-first (`tdd`), re-run the **CI gate**, and
     **re-review** the changed surface (`riviera-review-overlay`) — **exactly like a review-findings fix**.
     Update the plan's *Skills consulted* line for any new area a fix pulled in.
   - **A coverage gap** on new code → add the missing tests (still test-first; the new test is itself the fix).
   - **A genuine defect** Sonar surfaced (real bug/vuln) → drive it with `diagnosing-bugs`, then the fix
     re-enters the loop as above.
   - **A false positive / won't-fix / out-of-scope smell** → mark it resolved in SonarCloud with an explicit
     rationale (or open a follow-up issue), and record the decision in the plan's review/Sonar note. Don't
     silently ignore the gate — an unaddressed new issue blocks merge.
   - **No "post-Sonar exemption":** a Sonar fix being small or arriving after a green CI does **not** excuse
     it from the Skill-routing gate, `tdd`, CI, and re-review. Each fix push re-triggers CI **and** the Sonar
     analysis — re-check both before merging.
4. **Only then merge.** Merge is reached **only** when CI is green **and** the Review gate has run **and**
   the **Sonar quality gate is green (no new issues, new-code coverage ≥ 80%)** **and** every finding is
   resolved/deferred **and** any fix round itself cleared the loop. "Green CI + reviewed + Sonar-clean,"
   never just "green CI."

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
4. **The review gate is non-negotiable too.** Green CI is not a review. Don't merge —
   and don't call a slice done — until the Review gate (above) has run on the PR diff and
   its findings are resolved or deferred. "PR opened + CI green" is the trap, not the
   finish line.
5. **The plan owns the invariants.** If the slice touches booking, availability, or
   money, the plan doc states how the invariant holds, and review checks it.
6. **Right-size it.** A one-line/copy fix skips the plan doc; a feature that touches
   the spine does not. (A code change still gets the review gate — proportional to size.)
7. **An existing issue gets grilled before it gets planned.** Entering the loop at a
   written ticket skips the Refine stage where `grilling` normally runs — so the
   Issue-intake grill gate (above) re-validates the issue against current code/ADRs and
   surfaces what creation-time missed, before the plan is authored. Don't trust a ticket
   just because it reads complete.
8. **Review findings re-enter the loop at Implement.** The arrow out of Review points back to
   Implement, not straight to Merge: every fix passes the Skill-routing gate, `tdd`, and the CI
   gate, and the touched surface is re-reviewed before merge. Fixing a finding "quickly, after
   the review" is the most common way the routing gate gets skipped — treat a fix like any other
   change. (Generalize the same way for a red-CI fix or a reviewer's later comment: any new edit
   re-runs the gate for what it touches.)
9. **The Sonar gate is non-negotiable, and its findings re-enter the loop too.** SonarCloud runs on
   the **PR** (not branch pushes); green CI is **not** the Sonar gate. Don't merge until the quality
   gate passes with **no new issues** (new-code coverage ≥ 80%). A Sonar finding that **changes
   implemented logic** re-enters at Implement exactly like a review finding: **decide BE or FE**, load
   that area's skill, fix test-first, re-run CI **and** Sonar, re-review. A false positive / out-of-scope
   smell is resolved-with-rationale in SonarCloud (or a follow-up issue), never silently ignored.

## When NOT to use

- Trivial fixes and throwaway spikes (note the branch as a spike, skip the ceremony).
- Outside this repo — the routing and substrate are project-specific.

## Integration

- **Riviera skills:** `riviera-plan-doc` (plan), `riviera-review-overlay` (review),
  `riviera-modulith` (backend module structure / boundaries), `riviera-java-conventions`
  (backend Java idioms), `riviera-stripe-payments` (money),
  `angular-new-app`/`angular-developer` (frontend).
- **Vendored craft skills (Matt Pocock, MIT):** `grilling`/`grill-me`, `to-issues`,
  `implement`, `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`,
  `triage`, `improve-codebase-architecture` (use the last one once there is code to
  deepen).
