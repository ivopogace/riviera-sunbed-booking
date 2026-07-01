---
name: riviera-review-overlay
description: Project-specific review overlay for the riviera-sunbed-booking repo. Layers onto an in-progress code review — the built-in /code-review or /review, or the superpowers *-review-interview skills if installed — to add riviera-specific bank items, the availability single-source-of-truth invariant, JDBC-only (no JPA), Spring-Modulith boundaries, Stripe collect-only / webhook-as-source-of-truth, money in minor units, Europe/Tirane timezone, payout-ledger correctness, and booking-code security. Loads when reviewing a diff or PR in the riviera-sunbed-booking repo (CLAUDE.md with the riviera invariants, or an AGENTS.md/CLAUDE.md referencing ai.riviera.platform.* modules). Adds bank items to a review; it does not run a review on its own.
---

# Riviera review overlay

## Purpose

A code review — the built-in **`/code-review`** / **`/review`**, or the superpowers
`*-review-interview` skills if you have that plugin — walks standard FE/BE/contract
banks. This overlay layers in the **riviera-specific** items — the cross-cutting
invariants in `CLAUDE.md`, turned into checkable review gates. It is **content**,
not a workflow: it is loaded alongside a review and contributes additional bank
items, severity hints, and verification commands.

## Activation

This overlay layers onto an **in-progress review**. Load it when **both** hold:

- A review is active — `/code-review` or `/review` (built-in), or a superpowers
  `*-review-interview` skill if installed; **and**
- The work is in the riviera-sunbed-booking repo (a `CLAUDE.md` with the riviera
  invariants / `.claude/skills/riviera-*` present, or an `AGENTS.md`/`CLAUDE.md`
  referencing `ai.riviera.platform.*` modules).

The repo is the **scope**; an active review skill is the **trigger**. Do NOT load
the overlay merely because the CWD is the repo — without a parent review running
there is nothing for it to layer onto. If the user invokes the overlay explicitly,
honor that.

**In the `riviera-sdd` flow this is a duty, not just a passive trigger.** The SDD
**Review gate** is mandatory: when a PR exists (or before a slice is called done), you
must **start** a review yourself — `/code-review origin/main...HEAD` (or `/review <PR>`) —
and load this overlay. Do not wait for the review to be "active" on its own, and do not
treat an open PR + green CI as having completed the review stage. Opening the review *is*
the gate.

**Other review surfaces:** the slash commands `/code-review` and `/security-review`
do not auto-load this overlay. When reviewing through them in this repo, consult
`references/{backend,frontend,fe-be-contract}-conventions.md` and the CLAUDE.md
invariants directly — the bank items (especially RV-BE-1 availability and the
webhook-as-truth payment check) still apply.

When loaded, announce: *"riviera-review-overlay loaded. Adding project-specific
bank items."*

## What the overlay adds

Three reference files the parent review skill walks **after** the generic banks:

- `references/backend-conventions.md` — JDBC-only, Modulith boundaries, the
  availability/concurrency invariant, money/timezone, booking-code security,
  Flyway migrations.
- `references/frontend-conventions.md` — Angular standards, the beach-map seat
  picker's stale-availability handling, money/date rendering, no secrets in the
  client.
- `references/fe-be-contract.md` — API shape discipline, money/date on the wire,
  webhook-vs-redirect, idempotency across the boundary.

Each item uses the same gate / follow-up / default-severity / framing format as
the generic banks, with IDs (`RV-BE-*`, `RV-FE-*`, `RV-CT-*`) so findings read
cleanly.

## The highest-stakes items (call them out every time)

- **RV-BE-1 Availability single-source-of-truth (invariant #2).** Any diff that
  touches `booking`, `availability`, or the beach map gets this checked first. A
  miss here is the double-booking bug — default **Blocker**.
- **RV-CT-3 / RV-BE-7 Payment confirmation source (invariant #8).** Confirming a
  booking from a client redirect instead of a verified webhook is a money/trust
  bug — default **Blocker**.
- **RV-BE-9 Per-venue authorization / BOLA.** Any diff that touches a
  **venue-scoped** endpoint or service (`/api/venues/{venueId}/**`, the payout
  ledger, staff bookings, beach-map edit, staff availability, weather refund) must
  verify the **authenticated operator owns the path `venueId`** — and that the
  check sits in the **application service**, not the controller alone. Today the
  code authorizes on the shared `OPERATOR` role with **no** ownership check, so an
  operator can read/modify another venue's data by changing the id. This is OWASP
  API #1 and the multi-operator launch blocker — default **Blocker** whenever a
  venue-scoped surface is touched. Platform-wide `/api/admin/**` is role-gated and
  exempt. (Authority: the improvement plan's `operator` module + per-venue auth.)

## New-structure items (check when the published surface or domain tagging changes)

- **RV-BE-3c Published-surface placement (ports vs vocabulary vs events).**
  Complements RV-BE-3b (api/spi). A typed id / value record or a published event
  must not be added to a ports `api/` surface; events belong in the events named
  interface, vocabulary in the vocabulary surface. A new method piled onto the
  `VenueCatalog` god-port (instead of the role-named `SetBookingFacts`/`VenueRates`
  split) is a finding. Default **Major**. This is enforced by a hand-written
  ArchUnit rule (alongside `JdbcOnlyArchitectureTests`, keyed off the
  package/naming convention) — verify that rule exists and passes.
- **RV-BE-10 Error contract.** A controller introducing a bespoke `{"error": …}`
  body or a per-controller `@ExceptionHandler` instead of the centralized
  `@RestControllerAdvice` / `ProblemDetail` contract is a finding once the contract
  is in place. Default **Minor** (Major if it diverges the wire shape clients
  depend on). (Authority: `riviera-java-conventions` §6b.)
- **RV-BE-11 Module responsibility placement (`RESPONSIBILITIES.md`).** The backstop
  for a boundary that slipped past the plan gate — including a plan that *said* one
  owner and code that landed in another. Check that each changed file's logic belongs
  to **that** module per `RESPONSIBILITIES.md`: it serves the module's **Job** and is
  **not** on the module's **Not My Job** list. If the plan doc carries a
  Module-ownership table (plan-doc §4a), diff the code against it: *the plan claimed
  `booking` owns this refund math — did it land in `booking`, or in `payment`?*

  **This item is split by what's checkable.** The **structural** half is enforced by
  the always-on ArchUnit/`ModularityTests` fitness functions (below) — if those are
  green, don't re-verify by eye. The **semantic** half — a *policy*, *decision*, or
  *calculation* reimplemented in the wrong module with no illegal import — is
  **not** machine-catchable and is the reason this item needs human judgment.

  **Observable tells of a slip (the symptoms to scan the diff for):**
  - **A calculation or policy in an "executor" module.** Refund-amount or
    cancellation-policy logic appearing inside `payment` (it *executes*; `booking`
    *decides*). Commission/payout arithmetic inside `venue` or `booking` (`payout`
    computes; `venue` only stores the *rate*). This is the highest-value tell and the
    one no rule catches.
  - **A new writer to another module's table.** Any code outside `availability`
    writing the `(set, date)` state (invariant #2 / `availability` is the sole
    writer). *(ArchUnit-catchable.)*
  - **A forbidden cross-module reach.** `booking` importing the Stripe SDK or
    `payment.infrastructure`; any module reaching into another's `domain`/`internal`
    instead of its `api/`. *(ArchUnit-catchable.)*
  - **An event payload carrying a foreign aggregate or business field** instead of ids
    — the Need-To-Know boundary (a `payout`/`availability` listener receiving tourist
    identity, a `Customer`, or a full `Booking`). *(Partly ArchUnit-catchable.)*
  - **A capability that RESPONSIBILITIES.md assigns elsewhere** showing up in this
    module at all — e.g. `customer` growing a login/MFA subsystem (auth is a
    platform/edge concern, not tourist-identity domain), or `operator` sitting in every
    request path instead of owning the mapping and answering the ownership question.

  Default **Major** (Blocker when the misplacement also breaks a Blocker invariant —
  a non-`availability` writer to the set table is RV-BE-1; a missing ownership check is
  RV-BE-9). Authority: `RESPONSIBILITIES.md` (Job / Not-My-Job per module).
- **RV-BE-12 Package-shape conformance (ADR-0007).** Check any diff that adds or moves
  packages against the two-template layout. **Findings:**
  - **a `.in`/`.out` split at the *application* layer** (`application/in`, `application/out`)
    — that split was removed; internal ports live in `application/` next to their service,
    and direction lives at the adapter layer.
  - **`api`/`spi` nested under `application`** (or anywhere non-top-level) — the published
    surface must stay top-level and exposed, or Modulith hides it.
  - **the adapter layer spelled by technology instead of direction** — `adapter/rest`,
    `adapter/jdbc`, `adapter/event` at the top level instead of `adapter/in` + `adapter/out`
    (technology, if needed, is a *sub*-package: `adapter/in/rest`).
  - **a package outside the allowed top-level set** `{api, spi, application, domain, adapter}`
    (thin module: `{api, adapter}` only) — e.g. a lingering `infrastructure/`.
  - **an adapter dependency pointing inward's opposite** — `application`/`domain` importing
    `adapter.*` (the hexagon runs adapter → application/domain, never back).
  - **a thin (serviceless) module grown an empty `application/` or `domain/`** — ghost
    packages; a thin module is `api/` + `adapter/out/`. Conversely, a module that *gained*
    a service but kept the thin shape should **graduate** to full.

  Structural half → the ArchUnit package-shape rule (improvement-plan Workstream **C5**,
  enabled after migration); the **thin-vs-full judgment** and the "is this the right
  use-case slice" call → review. Default **Major** (Minor for a cosmetic mis-slice inside a
  module). Note existing modules are **mid-migration** — a not-yet-migrated module still on
  the old layout is not a finding; a *new* package added in the old shape is. Authority:
  `ADR-0007` + `riviera-modulith`.

## Process gate (check when a plan doc is in scope)

- **RV-PROC-1 Skill-routing gate honored (process).** Cross-check the plan doc's
  **Skills consulted** line against what the diff actually touches: a Flyway migration /
  table / index change ⇒ `postgres` must be listed; **any backend Java created/modified
  (new module, `api/` port, application service, domain event, JDBC adapter, controller,
  or a class moved between packages) ⇒ `riviera-modulith` AND `riviera-java-conventions`
  must be listed**; a new backend module seam ⇒ also `codebase-design` (+ `domain-modeling`);
  an Angular component / service / route ⇒ `angular-developer` + the angular-cli MCP;
  **a user-facing frontend flow or any `frontend/e2e/` change ⇒ `playwright-cli` must be
  listed** (and the slice must carry e2e coverage authored/judged against that skill — see RV-FE-E2E);
  `payment`/`payout`/Stripe ⇒ `riviera-stripe-payments`. A diff that touches an area with **no** matching skill in
  *Skills consulted* (or no such line at all) is a **finding** — default **Major** —
  because the design was likely anchored from first principles and the skill's corrections
  (PK type, seam depth, v22 API/a11y, collect-only model) were never applied. Fix: load
  the missing skill, re-vet that section, update the line. (Trigger-map authority: the
  `riviera-sdd` Skill-routing gate.)
  **Re-walk this on every re-review, including after review-fix commits.** Fixes change the diff,
  so a finding patched in a new area without its skill (a migration fix with no `postgres`, an
  Angular fix with no `angular-developer`/MCP, a frontend-flow fix with no `playwright-cli`)
  is caught here on the second pass — that is the
  overlay's enforcement of the SDD rule that "review findings re-enter the loop at Implement."

## Hand-offs to other riviera skills

- **Payment/payout details** → recommend `riviera-stripe-payments` for the deeper
  conventions; the review surfaces the gate, that skill holds the rationale.
- **Plan-doc discipline gaps** (missing AC, missing Availability section, stale
  execution status) → recommend `riviera-plan-doc`.
- **Module-boundary questions** → `codebase-design` (deep-module / seam design),
  with the invariant #11 gate in this overlay as the check.
- **Java idiom violations** (a JPA `@Entity`/`JpaRepository`, Lombok, field injection, a
  mutable POJO where a record belongs, `null` from a port, a public JDBC adapter) →
  `riviera-java-conventions` holds the language-level rules; this overlay flags the breach.

The overlay does NOT execute these; it surfaces the recommendation in the output.

## Output integration

- **Pre-implementation checklist:** fill the single top-level
  `### Riviera overlay (if loaded)` section (after the FE↔BE contract section) —
  one bullet per overlay item, ✅/❓/⛔.
- **Peer review notes:** fill the single `### Riviera overlay` subsection under
  `## Convention checks`; findings go into the standard Findings list with the
  same severity rubric. Add the trailing `### Recommended riviera skills` section
  if any hand-off applies.

## Verification commands surfaced

Backend:
- `./gradlew build` (no JPA on the classpath — a build that pulls
  `spring-boot-starter-data-jpa` is itself a finding)
- `./gradlew test --tests "<package>.<ClassName>"` for targeted tests
- the `ApplicationModules.of(…).verify()` test (e.g. `./gradlew test --tests
  "*ModularityTests*"`) if module structure changed — Spring Modulith verification
  is a test, not a Gradle task

Frontend (run in `frontend/`):
- `npm run lint`
- `npm test` — Vitest via `@angular/build:unit-test` (Angular 22+); runs once in jsdom.
  NOT Karma — there is no `--browsers=ChromeHeadless` flag.
- `npm run build` if production-build risk

## Red flags specific to this repo

| Thought | Reality |
|---|---|
| "I'll add `spring-boot-starter-data-jpa`, it's easier." | JDBC only (invariant #1). A JPA dependency is a Blocker finding. |
| "Two reservations rarely collide; a check-then-insert is fine." | Check-then-insert races. Needs a unique constraint + row lock / `ON CONFLICT` (invariant #2). |
| "The frontend confirmed payment, mark the booking paid." | Confirm only on a signature-verified webhook (invariant #8). |
| "I'll use Stripe Connect to pay the venue." | No Connect (invariant #8) — collect-only + manual BKT payout (invariant #9). |
| "Store the price as a euro decimal." | Integer minor units (invariant #5). |
| "`LocalDateTime.now()` is fine for the cutoff." | Use `Europe/Tirane`; store UTC `Instant` (invariant #6). |
| "Booking codes can be sequential ids." | Unguessable bearer credential (invariant #7). |
| "I'll call the other module's service directly." | Cross-module only via `api/` or events (invariant #11). |
| "The refund amount is easy to work out right here in `payment`." | `payment` **executes**; `booking` **decides** the refund (RESPONSIBILITIES.md). Policy/calc in an executor module is an RV-BE-11 finding. |
| "`payout` can just compute commission off the rate." | `venue` owns the **rate**; `payout` computes — but a *new* commission **rule** in `venue` or `booking` is a placement slip (RV-BE-11). |
| "The listener needs the whole `Booking` / the tourist's name." | Events carry **ids**, not aggregates or foreign business fields — Need-To-Know (invariant #11 / RV-BE-11). |
| "`customer` may as well handle tourist login/MFA too." | Auth is a platform/edge concern, not tourist-identity domain; `customer` owning a login subsystem is a placement slip (RV-BE-11). |
| "`gradlew.bat` flipped CRLF→LF — that's a corruption, revert it." | Check `.gitattributes` **at every level** (incl. `platform/.gitattributes`) first. `*.bat text eol=crlf` means the **blob is stored LF, checked out CRLF** — an LF blob is the *correct* normalized form, not a bug. The stale-CRLF *blob* (often on `main`) is the anomaly. Don't "revert" a normalized blob; git's clean filter will re-normalize it on `add` anyway. Only a wrong **working-tree** EOL (e.g. an LF `.bat` on checkout) is a real finding. |

## Done criteria (for the overlay's contribution)

- Every overlay item checked (✅/❓/⛔ pre-impl, ✅/❌/➖ peer-review).
- The two highest-stakes items (RV-BE-1, payment-confirmation) explicitly addressed
  whenever their domain is touched.
- **RV-BE-11 (responsibility placement) checked whenever the diff adds or moves
  behavior** — the plan's Module-ownership table (if any) reconciled against where the
  code actually landed.
- **RV-BE-12 (package-shape) checked whenever the diff adds or moves packages** — new
  packages conform to the two-template layout (ADR-0007); not-yet-migrated modules exempt.
- Hand-offs listed if they apply; riviera verification commands included when
  relevant.

## When NOT to use this skill

- Outside the riviera-sunbed-booking repo — the bank items assume this project's
  invariants.
- **Standalone.** This overlay never runs alone; it only contributes bank items to
  an active review (`/code-review`, `/review`, or a superpowers `*-review-interview`
  skill). Without a review running there is nothing for it to layer onto — start the
  review first.

## Integration

- **`CLAUDE.md`** — the invariant list these banks check.
- **`/code-review` / `/review`** (built-in), or superpowers `*-review-interview` if
  installed — the review surfaces this overlay layers onto; it never runs alone.
- **`riviera-stripe-payments`, `riviera-plan-doc`, `codebase-design`** — hand-off
  targets.
- **`riviera-sdd`** — the workflow orchestrator; it loads this overlay at the review
  gate. **`triage`** — manages the issue/PR lifecycle around the review.
