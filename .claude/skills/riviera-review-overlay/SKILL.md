---
name: riviera-review-overlay
description: Project-specific review overlay for the riviera-sunbed-booking repo. Layers onto an in-progress code review — the built-in /code-review or /review, or the superpowers *-review-interview skills if installed — to add riviera-specific bank items: the availability single-source-of-truth invariant, JDBC-only (no JPA), Spring-Modulith boundaries, Stripe collect-only / webhook-as-source-of-truth, money in minor units, Europe/Tirane timezone, payout-ledger correctness, and booking-code security. Loads when reviewing a diff or PR in the riviera-sunbed-booking repo (CLAUDE.md with the riviera invariants, or an AGENTS.md/CLAUDE.md referencing ai.riviera.platform.* modules). Adds bank items to a review; it does not run a review on its own.
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

## The two highest-stakes items (call them out every time)

- **RV-BE-1 Availability single-source-of-truth (invariant #2).** Any diff that
  touches `booking`, `availability`, or the beach map gets this checked first. A
  miss here is the double-booking bug — default **Blocker**.
- **RV-CT-3 / RV-BE-7 Payment confirmation source (invariant #8).** Confirming a
  booking from a client redirect instead of a verified webhook is a money/trust
  bug — default **Blocker**.

## Process gate (check when a plan doc is in scope)

- **RV-PROC-1 Skill-routing gate honored (process).** Cross-check the plan doc's
  **Skills consulted** line against what the diff actually touches: a Flyway migration /
  table / index change ⇒ `postgres` must be listed; **any backend Java created/modified
  (new module, `api/` port, application service, domain event, JDBC adapter, controller,
  or a class moved between packages) ⇒ `riviera-modulith` AND `riviera-java-conventions`
  must be listed**; a new backend module seam ⇒ also `codebase-design` (+ `domain-modeling`);
  an Angular component / service / route ⇒ `angular-developer` + the angular-cli MCP;
  `payment`/`payout`/Stripe ⇒ `riviera-stripe-payments`. A diff that touches an area with **no** matching skill in
  *Skills consulted* (or no such line at all) is a **finding** — default **Major** —
  because the design was likely anchored from first principles and the skill's corrections
  (PK type, seam depth, v22 API/a11y, collect-only model) were never applied. Fix: load
  the missing skill, re-vet that section, update the line. (Trigger-map authority: the
  `riviera-sdd` Skill-routing gate.)
  **Re-walk this on every re-review, including after review-fix commits.** Fixes change the diff,
  so a finding patched in a new area without its skill (a migration fix with no `postgres`, an
  Angular fix with no `angular-developer`/MCP) is caught here on the second pass — that is the
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
| "`gradlew.bat` flipped CRLF→LF — that's a corruption, revert it." | Check `.gitattributes` **at every level** (incl. `platform/.gitattributes`) first. `*.bat text eol=crlf` means the **blob is stored LF, checked out CRLF** — an LF blob is the *correct* normalized form, not a bug. The stale-CRLF *blob* (often on `main`) is the anomaly. Don't "revert" a normalized blob; git's clean filter will re-normalize it on `add` anyway. Only a wrong **working-tree** EOL (e.g. an LF `.bat` on checkout) is a real finding. |

## Done criteria (for the overlay's contribution)

- Every overlay item checked (✅/❓/⛔ pre-impl, ✅/❌/➖ peer-review).
- The two highest-stakes items (RV-BE-1, payment-confirmation) explicitly addressed
  whenever their domain is touched.
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
