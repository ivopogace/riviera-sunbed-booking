---
name: riviera-review-overlay
description: Project-specific review overlay for the riviera-sunbed-booking repo. Loads alongside pre-implementation-review-interview or peer-change-review-interview to add riviera-specific bank items — the availability single-source-of-truth invariant, JDBC-only (no JPA), Spring-Modulith boundaries, Stripe collect-only / webhook-as-source-of-truth, money in minor units, Europe/Tirane timezone, payout-ledger correctness, and booking-code security. Loads only when pre-implementation-review-interview or peer-change-review-interview is running in the riviera-sunbed-booking repo (CLAUDE.md with the riviera invariants, or an AGENTS.md/CLAUDE.md referencing app.riviera.* modules). Never loads on its own — it only adds bank items to an in-progress review.
---

# Riviera review overlay

## Purpose

The two generic review skills (`pre-implementation-review-interview`,
`peer-change-review-interview`) walk standard FE/BE/contract banks. This overlay
layers in the **riviera-specific** items — the cross-cutting invariants in
`CLAUDE.md`, turned into checkable review gates. It is **content**, not a workflow:
it is loaded alongside one of the two review skills and contributes additional
bank items, severity hints, and verification commands.

## Activation

This overlay layers onto an **in-progress review**. Load it when **both** hold:

- One of the two parent review skills is active —
  `pre-implementation-review-interview` or `peer-change-review-interview`; **and**
- The work is in the riviera-sunbed-booking repo (a `CLAUDE.md` with the riviera
  invariants / `.claude/skills/riviera-*` present, or an `AGENTS.md`/`CLAUDE.md`
  referencing `app.riviera.*` modules).

The repo is the **scope**; an active review skill is the **trigger**. Do NOT load
the overlay merely because the CWD is the repo — without a parent review running
there is nothing for it to layer onto. If the user invokes the overlay explicitly,
honor that.

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

## Hand-offs to other riviera skills

- **Payment/payout details** → recommend `riviera-stripe-payments` for the deeper
  conventions; the review surfaces the gate, that skill holds the rationale.
- **Plan-doc discipline gaps** (missing AC, missing Availability section, stale
  execution status) → recommend `riviera-plan-doc`.
- **Module-boundary questions** → recommend `spring-modulith-boundary-reviewer`.

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

Frontend:
- `npm run lint`
- `npm test -- --watch=false --browsers=ChromeHeadless`
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
  an active `pre-implementation-review-interview` or `peer-change-review-interview`.
  Without one of those parents loaded there is nothing for it to layer onto — load
  the parent review skill first.

## Integration

- **`CLAUDE.md`** — the invariant list these banks check.
- **`pre-implementation-review-interview` / `peer-change-review-interview`** — the
  parent skills; this overlay never runs alone.
- **`riviera-stripe-payments`, `riviera-plan-doc`,
  `spring-modulith-boundary-reviewer`** — hand-off targets.
- **`riviera-sdd`** — the workflow orchestrator; it loads this overlay at the review
  gate. **`triage`** — manages the issue/PR lifecycle around the review.
