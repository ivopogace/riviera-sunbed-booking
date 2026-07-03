---
name: riviera-review-overlay
description: Project-specific review overlay for the riviera-sunbed-booking repo. Layers onto an in-progress code review — the built-in /code-review or /review, or the superpowers *-review-interview skills if installed — to add riviera-specific bank items, the availability single-source-of-truth invariant, JDBC-only (no JPA), Spring-Modulith boundaries, Stripe collect-only / webhook-as-source-of-truth, money in minor units, Europe/Tirane timezone, payout-ledger correctness, and booking-code security. Loads when reviewing a diff or PR in the riviera-sunbed-booking repo (CLAUDE.md with the riviera invariants, or an AGENTS.md/CLAUDE.md referencing ai.riviera.platform.* modules). Adds bank items to a review; it does not run a review on its own.
---

# Riviera review overlay

## Purpose

A code review (built-in `/code-review` / `/review`, or superpowers `*-review-interview`)
walks generic FE/BE/contract banks. This overlay layers in the **riviera-specific**
items — the `CLAUDE.md` invariants turned into checkable review gates (cited, never
restated). It is **content**, not a workflow: bank items, severity hints, and
verification commands contributed to an active review.

## Activation

Load when **both** hold: a review is **active** (`/code-review` / `/review`, or a
superpowers `*-review-interview` skill), **and** the work is in the
riviera-sunbed-booking repo (a `CLAUDE.md` with the riviera invariants /
`.claude/skills/riviera-*`, or an `AGENTS.md`/`CLAUDE.md` referencing
`ai.riviera.platform.*` modules). This overlay **never runs alone** — it layers
onto an active review; honor an explicit user invoke by starting the review first.
In the `riviera-sdlc` flow, starting the review is your duty (`/code-review
origin/main...HEAD` or `/review <PR>`) — see riviera-sdlc's **Review gate**.
`/security-review` doesn't auto-load this overlay; consult the reference files directly.

When loaded, announce: *"riviera-review-overlay loaded. Adding project-specific bank items."*

## What the overlay adds — reference files loaded by scope

Three reference files hold the bank items, loaded **by the diff's scope** so a
frontend-only review never pays for the backend bank:

- **Backend diff** → `references/backend-conventions.md` — the full backend bank
  (RV-BE-1..17: JDBC-only, Modulith boundaries, availability/concurrency,
  money/timezone, auth, error contract, responsibility placement, package shape, Flyway).
  If the diff changes any **wire shape** (an endpoint, a request/response DTO, an
  error body) — even with no frontend file touched — also load `references/fe-be-contract.md`.
- **Frontend diff** → `references/frontend-conventions.md` — Angular standards,
  beach-map stale-availability handling, money/date rendering, no client secrets.
- **Fullstack diff** → both of the above, plus `references/fe-be-contract.md` —
  API typing, money/date on the wire, webhook-vs-redirect, idempotency.

## Highest-stakes items (call them out every time)

- **RV-BE-1 Availability single-source-of-truth (invariant #2).** Checked first on
  any diff touching `booking`/`availability`/the beach map — a miss is the
  double-booking bug. Default **Blocker**. Full item: `references/backend-conventions.md`.
- **RV-CT-3 / RV-BE-7 Payment confirmation source (invariant #8).** A booking is
  confirmed only on a signature-verified webhook, never the client redirect. Default
  **Blocker**. Full items: `references/fe-be-contract.md` / `references/backend-conventions.md`.
- **RV-BE-9 Per-venue authorization / BOLA (invariant #13).** A touched venue-scoped
  surface must verify the operator owns the path `venueId` in the **application service**
  (`assertOwns`, pinned by `CrossVenueDenialIT`). Default **Blocker**. Full item: `references/backend-conventions.md`.

## RV-PROC-1 — skill-routing gate honored (when a plan doc is in scope)

Cross-check the plan doc's **Skills consulted** line against what the diff actually
touches, per the `riviera-sdlc` **Skill-routing table** — that table is the
authority; do not re-list it here. A touched area with no matching skill listed (or
no such line at all) is a **Major** finding — the design was likely anchored from
first principles; load the missing skill, re-vet that section, update the line.
Re-walk on **every re-review, including review-fix commits** — fixes change the diff.

## Verification commands surfaced

Backend:
- `./gradlew build` — no JPA on the classpath (a build pulling
  `spring-boot-starter-data-jpa` is itself a finding)
- `./gradlew test --tests "<package>.<ClassName>"` for targeted tests; `--tests
  "*ModularityTests*"` if module structure changed (Modulith verification is a test, not a Gradle task)

Frontend (run in `frontend/`):
- `npm run lint`; `npm run build` if production-build risk
- `npm test` — Vitest via `@angular/build:unit-test` (Angular 22+), once in jsdom;
  NOT Karma — there is no `--browsers=ChromeHeadless` flag

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
| "`gradlew.bat` flipped CRLF→LF — that's corruption, revert it." | Check `.gitattributes` at every level (incl. `platform/.gitattributes`) first: `*.bat text eol=crlf` stores the blob **LF** and checks out CRLF, so an LF blob is the **correct** normalized form — don't "revert" it (git re-normalizes on `add`). Only a wrong **working-tree** EOL is a real finding (PR #37). |

## Output integration & done criteria

- Pre-impl checklist: fill the single top-level `### Riviera overlay (if loaded)`
  section (after the FE↔BE contract section), one bullet per item, ✅/❓/⛔. Peer-review
  notes: fill the `### Riviera overlay` subsection under `## Convention checks`; append `### Recommended riviera skills` on any hand-off.
- Done when every item in the scope-loaded reference files is checked (✅/❓/⛔
  pre-impl, ✅/❌/➖ peer-review) and the three highest-stakes items are addressed
  whenever their domain is touched.
- RV-BE-11 checked whenever the diff adds or moves behavior (plan's Module-ownership
  table reconciled against where the code landed); RV-BE-12 whenever it adds or
  moves packages (ADR-0007 two-template layout).
- Hand-offs listed if they apply; verification commands included when relevant.

## Hand-offs & integration

Surface these in the output — the overlay recommends, it does not execute:

- Payment/payout details → `riviera-stripe-payments` (holds the rationale).
- Plan-doc discipline gaps (missing AC, stale execution status) → `riviera-plan-doc`.
- Module-boundary questions → `codebase-design`; the invariant #11 gate here is the check.
- Java idiom violations (JPA, Lombok, field injection, `null` from a port, a public
  JDBC adapter) → `riviera-java-conventions`; the overlay flags the breach.

Not for use outside the riviera-sunbed-booking repo — the items assume its invariants.
`riviera-sdlc` loads this overlay at its Review gate; `triage` manages the issue/PR
lifecycle around the review.
