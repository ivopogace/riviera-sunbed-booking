# <Feature Title> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** <one sentence; concrete, testable, falsifiable>

**Architecture:** <2–3 sentences; name the single most significant decision and why>

**Persistence:** JDBC only (invariant #1). <Note the tables/migrations touched.>

**Source of intent:** <spec path in docs/superpowers/specs/ and/or GitHub issue #NN>

**Branch:** `<feature|bugfix>/<short-slug>` <must exist in git before phase 0>

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC.

- [ ] **AC-1:** Given <precondition>, when <action>, then <observable outcome>. *Pinned by:* `<TestClassName>.<testMethodName>`
- [ ] **AC-2:** ...

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- <thing the feature might imply but we are not doing>

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | <e.g. "two clients reserve the same set concurrently"> | med | high | <e.g. "unique constraint on (set_id, booking_date) + SELECT … FOR UPDATE; concurrent-reservation IT"> | <name> | open / commit-sha |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Assumption:** <inferred-but-unverified> — *Owner:* <name> · *Resolves by:* <date/phase>
- **Open question:** <unresolved> — *Owner:* <name> · *Resolves by:* <date/phase>

Resolved entries move under a `### Resolved` sub-heading with the outcome + SHA.

## Availability & concurrency (invariant #2)

> **Mandatory if the feature touches `booking`, `availability`, or the beach map.**
> Otherwise write `N/A — does not affect availability` and say why. This is the
> highest-stakes section in the plan.

- **Write paths to `availability(set_id, booking_date)`:** <list every channel that
  writes this row in scope — online booking, staff tap-to-mark, cancellation
  release, admin weather refund, Request-to-Book pending hold, request
  decline/timeout release>
- **Uniqueness guarantee:** <the DB constraint that makes a set holdable by at most
  one party per date>
- **Concurrency strategy:** <`SELECT … FOR UPDATE` row lock | `INSERT … ON CONFLICT
  DO NOTHING` claim | other — and why>
- **Pool rule (invariant #3):** <how online bookings are restricted to online-pool
  sets>
- **Cutoff rule (invariant #4):** <how same-day booking is prevented; cutoff time +
  timezone>
- **Pinning test:** `<ConcurrentReservationIT.<method>>` — proves two concurrent
  reservations of the same `(set, date)` cannot both succeed.

## Spring Modulith — modules, interfaces, events

> **Mandatory if any backend code is in scope. Frontend-only: `N/A — frontend-only`.**
> Boundaries per invariant #11. Load `spring-modulith-boundary-reviewer` /
> `spring-modulith-event-designer` if not yet settled.

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | <e.g. `booking`> | existing | `Booking` | <…> |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability.api` | `SetAvailabilityQuery#freeSets(VenueId, LocalDate)` | `SetSummary` | `booking`, `venue` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` | `{ bookingId, setId, venueId, bookingDate }` | `availability`, `payout` | async `AFTER_COMMIT` | `<…>` |

## Payment & payout (invariants #5, #8, #9, #10)

> **Mandatory if money moves. Otherwise `N/A — no payment in scope`.** Load
> `riviera-stripe-payments`.

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch.
- **Confirmation trigger:** signature-verified webhook (not the client redirect).
- **Idempotency:** <keys on charge/refund; webhook dedupe on event id>
- **Money:** integer minor units, EUR.
- **Payout-ledger effect:** <accrual on confirm, reversal on refund; exactly-once>
- **Refund policy applied:** <free-until-cutoff / non-refundable-after / weather-admin>
- **Pinning tests:** `<WebhookIdempotencyIT>`, `<RefundPolicyTest>`, `<PayoutLedgerTest>`

## Angular — frontend surfaces touched

> **Mandatory if frontend is in scope. Backend-only: `N/A — backend-only`.** Load
> `angular-developer`.

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | <e.g. `booking/beach-map.component.ts`> | new | standalone component | Signals + `resource()` | Signal Forms |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`
signal APIs, `NgOptimizedImage` for new images. Document any deviation.

## FE↔BE contract

> **Mandatory if an API shape changes. Otherwise `N/A — no contract change`.**

- **New/changed endpoints:** <method + path + DTO shape>
- **Client typing:** <how the Angular client consumes it — generated from OpenAPI,
  or hand-written typed service; never `as any`>
- **Money/date on the wire:** amounts as integer minor units + currency; dates as
  ISO `LocalDate` (booking date) — agree the shape once, both sides honor it.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — <name> | ⏳ | |
| 1 — <name> | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit
window as each phase's code.

---

## File structure

> Map files to be created/modified before defining tasks.

- `<path>` — <responsibility>

---

## Phase 0 — <Phase name>

**Files:** Create `<path>` · Modify `<path>:<lines>` · Test `<path>`

- [ ] **Step 1: Write the failing test**

```<lang>
<actual test code, no placeholders>
```

- [ ] **Step 2: Run it, verify it fails** — `<exact command>` → FAIL with `<message>`

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation**

```<lang>
<actual code, no placeholders>
```

- [ ] **Step 4: Run it, verify it passes** — `<exact command>` → PASS

> Scope (end-of-phase regression): broaden to the touched module's package.

- [ ] **Step 5: Generalization-audit pass** (after any bug fix / new pattern)

Search `<command>` → candidates `<list>` → decision `<fix all / subset / skip + why>`.
Append to the Generalization-audit log below.

- [ ] **Step 6: Commit** — `git commit -m "<imperative subject> (#NN)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1:** Run `<command>` → `<expected>`. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`infrastructure.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
