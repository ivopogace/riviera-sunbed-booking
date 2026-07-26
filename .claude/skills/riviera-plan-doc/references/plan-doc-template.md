# <Feature Title> Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** <one sentence; concrete, testable, falsifiable>

**Architecture:** <2–3 sentences; name the single most significant decision and why>

**Persistence:** JDBC only (invariant #1). <Note the tables/migrations touched.>

**Source of intent:** <spec path in docs/superpowers/specs/ and/or GitHub issue #NN>

**Skills consulted:** <the `riviera-sdlc` Skill-routing gate output — every craft skill
loaded at plan time + one phrase on what each changed. e.g. `postgres` (BIGINT identity
PKs, not UUIDv4), `codebase-design` (collapsed the hypothetical out-port seam),
`angular-developer` + angular-cli MCP (v22 APIs + mandatory a11y). Must cover every area
the diff touches — a migration in scope with no `postgres` here means the plan is not
ready. `N/A — <reason>` only for a truly single-area trivial slice.>

**Branch:** `<feature|bugfix>/<short-slug>` <must exist in git before phase 0>

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC against the application boundary —
> the inner hexagon — not the outside technology.** Cockburn's 2005 ports-and-adapters
> article: *"use cases should generally be written at the application boundary (the
> inner hexagon), to specify the functions and events supported by the application,
> regardless of external technology."* So phrase the AC in domain terms
> (`AvailabilityClaim` succeeds / `BookingConfirmed` is published / the ledger
> accrues once) rather than in terms of the Angular button, the Stripe redirect, or
> the HTTP status alone. Tech-specific assertions belong in an adapter-level test,
> not in the core AC — this keeps the criteria shorter, stable across
> UI/payment-adapter churn, and reusable from any driving adapter (test harness,
> GUI, future app-to-app).

- [ ] **AC-1:** Given <precondition>, when <action>, then <observable outcome>. *Pinned by:* `<TestClassName>.<testMethodName>`
- [ ] **AC-2:** ...

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- <thing the feature might imply but we are not doing>

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| e.g. "re-reads the whole queue after every accept/decline (reconcile)" | dropped → **restored** | was replaced by a local-only card removal; add it back |

> Case history — **O6 #176**: the plan said "restyle only," but the new Requests tab replaced
> StaffDaily's post-action **reconcile** with a local card removal — a *dropped* behavior that
> read as *preserved*. The workflow review found it plus 5 siblings (stale queue, frozen clock,
> badge races) as **14 findings**, ~40% of the build effort spent re-fixing. One ledger row at
> plan time would have pre-empted the whole class.

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.
> Fill before phase 0; use the `grilling` skill if risks aren't yet visible.
> Categories that already matter in this project: concurrent reservation of the
> same set (invariant #2), Stripe webhook duplicate/out-of-order delivery (#8),
> payout double-accrual (#9), timezone/cutoff arithmetic (#4/#6), money rounding
> (#5), module boundary leaks (#11), per-venue authorization on any venue-scoped
> endpoint (an operator must only reach their own venue's data — BOLA; if the slice
> touches `/api/venues/{venueId}/**`, the payout ledger, staff bookings, or
> beach-map edit, state how ownership is verified in the application service), and
> any temptation toward JPA or Stripe Connect. If the slice adds or changes a
> request DTO or an endpoint's error responses, note the error-contract expectation
> (centralized `ProblemDetail`, not a per-controller `{"error": …}` body —
> `riviera-java-conventions` §6b). If the slice adds a Flyway migration, the plan
> may only claim `V<n>` after verifying the number is free on `main` AND unclaimed
> by any open PR's diff — and it names who renumbers if a parallel slice merges
> first (default: whoever merges second).

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
> Boundaries per invariant #11. Use `codebase-design` for module interfaces/seams;
> the boundary & id-based-event rules are checked by `riviera-review-overlay` and
> the `ApplicationModules.verify()` test.

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

### Module ownership (§4a)

> **Required whenever the slice adds or moves behavior.** For each new or changed
> capability, state which module owns it and why, checked against
> `RESPONSIBILITIES.md`. The justification must cite the owner's **Job** line *and*
> confirm the capability is **not** on another module's **Not My Job** list. This
> is the plan-time boundary gate: a capability that lands on some module's
> Not-My-Job list, or that two modules both claim, is a boundary error to resolve
> **before** code — catching a misplacement here is a sentence; at review it's a
> diff. Pay special attention to the two decision-vs-execution splits (`booking`
> decides refunds / `payment` executes; `venue` stores the commission rate /
> `payout` computes) and the Need-To-Know rule (a subscriber gets ids, never a
> foreign aggregate). If the slice touches only one module and adds no cross-module
> interaction, a one-line "all in `<module>`, no boundary change" suffices.
> `riviera-review-overlay` **RV-BE-11** re-checks this table against the diff.

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| e.g. "compute the late-cancel refund amount" | `booking` | `booking` Job: owns cancellation/refund **policy**; **not** `payment` (its Not-My-Job: "deciding whether/how much to refund → `booking`") |

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
signal APIs, `NgOptimizedImage` for new images. Document any deviation. (Full
detail in the in-repo `angular-developer` skill's `references/`.)

## FE↔BE contract

> **Mandatory if an API shape changes. Otherwise `N/A — no contract change`.**

- **New/changed endpoints:** <method + path + DTO shape>
- **Client typing:** <how the Angular client consumes it — generated from OpenAPI,
  or hand-written typed service; never `as any`>
- **Money/date on the wire:** amounts as integer minor units + currency; dates as
  ISO `LocalDate` (booking date) — agree the shape once, both sides honor it.

## Execution status

> **This section is the session-recovery anchor.** Long sessions get compacted
> (summarized) and lose fine-grained state; a fresh session starts with none.
> Everything a resuming session needs lives HERE, committed — never only in the
> conversation. After a context compaction, in a fresh session, or whenever unsure
> where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window
> as the change it records — at every phase boundary AND every SDLC stage
> transition (plan → implement → CI → PR → review → sonar → merge).
>
> **Finalize this section BEFORE the merge, in the PR's own last commit** — stage pointer
> DONE, every phase row ✅ with its commit, Open Questions empty, every risk row closed with
> its outcome, AC pin-names matching the tests that shipped. Record **`merged via PR #NN`,
> never a merge SHA**: the squash SHA cannot exist before the merge, so citing it guarantees
> a second docs-only PR, while the PR number is knowable the moment you open it (the SHA is
> one `git log --grep "(#NN)"` away). Three consecutive slices paid that tax — #326→#347,
> #346→#352, #351→#354. Details: `riviera-sdlc` `references/pr-gates.md` §3 step 4.

**Stage pointer:** <current `riviera-sdlc` stage, e.g. `implement (phase 2)` /
`review gate — fixing findings` / `sonar gate` / `merge close-out step 3`>

**Next action:** <one line — the very next thing a resuming session should do>

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — <name> | ⏳ | |
| 1 — <name> | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | <…> | <…> | open / fixed-in-`<sha>` / deferred → issue #NN |

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
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — `/code-review` (or `/review <PR>`) *plus*
      `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is
      stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
