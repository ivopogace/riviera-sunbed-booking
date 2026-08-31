# <Feature Title> Implementation Plan

> **For agentic workers:** to implement this plan use `tdd` at the plan's named seams
> (`/implement` is the human's entry command — `riviera-sdlc`'s Implement row is the
> model's route), or the superpowers `subagent-driven-development`/`executing-plans`
> skills if present task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** <one sentence; concrete, testable, falsifiable>

**Architecture:** <2–3 sentences; name the single most significant decision and why>

**Persistence:** JDBC only (invariant #1). <Note the tables/migrations touched.>

**Source of intent:** <spec path in docs/superpowers/specs/ and/or GitHub issue #NN>

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — <what it
caught>) · `riviera-plan-doc` (this template — <what it forced>) · `tdd` (<how the slice
was built test-first>) · `riviera-review-overlay` (review gate — <when it ran>) ·
`riviera-docs-freshness` (<**ran** over `<range>`, N findings — **or** `N/A — <reason>`>)
· <then every routed skill the gate matched, + one phrase each on what it changed. e.g.
`postgres` (BIGINT identity PKs, not UUIDv4), `codebase-design` (collapsed the
hypothetical out-port seam), `angular-developer` + angular-cli MCP (v22 APIs + mandatory
a11y). Must cover every area the diff touches — a migration in scope with no `postgres`
here means the plan is not ready. `N/A — <reason>` only for a truly single-area trivial
slice.>

> **The five leading entries are pre-filled on purpose — extend them, don't replace them**
> (case history: #447; the rule: `riviera-plan-doc` workflow step 0). Fill every parenthesis with what the skill actually
> did — a name with a fixed label is cargo cult; RV-PROC-1 checks the line against the diff
> either way. Keep `riviera-docs-freshness`'s parenthesis **explicit — `ran` (range +
> findings) or `N/A — <reason>`**: "not listed" and "not applicable" read the same in a diff.

**Branch:** `<feature|bugfix>/<short-slug>` <must exist in git before phase 0>

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests. This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.
>
> **These ACs ARE the pre-agreed seams — `tdd` writes no test at an unconfirmed seam,
> and this section is where they get confirmed.** Each AC's *Pinned by* names the test,
> and *Seam* names the public boundary it observes through — the port/interface/route,
> not the class under test. For a backend AC the inner-hexagon rule usually settles it
> (the `api/` or `spi/` port); **say it anyway**, and for a frontend AC say it always,
> since "the inner hexagon" doesn't name one. Prefer an existing seam to a new one, and
> the highest one that still reaches the behavior — fewer seams is better. A phase that
> discovers it needs a seam this section didn't name stops and adds it here first.
> "Confirmed" happens when this doc is agreed at the Plan gate — that approval IS `tdd`'s
> confirm-with-the-user step; implementation doesn't re-ask. (Plan docs agreed before
> 2026-08-31 predate the *Seam* field — forward-only; see `riviera-plan-doc` step 1.)

- [ ] **AC-1:** Given <precondition>, when <action>, then <observable outcome>. *Seam:* `<port / interface / route observed through>` · *Pinned by:* `<TestClassName>.<testMethodName>`
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

> Case history — **#176**: a "restyle only" claim hid a dropped reconcile behavior; one
> ledger row at plan time would have pre-empted 14 findings (told in full in `riviera-sdlc`
> `references/case-history.md`).

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
> any temptation toward JPA or Stripe Connect. A new/changed request DTO or error
> response → note the error-contract expectation (`riviera-java-conventions` §6b). A
> Flyway migration → claim `V<n>` only per the in-flight check in `riviera-sdlc`
> `references/issue-intake-gate.md` (free on `main` AND unclaimed by open PRs; name
> who renumbers).

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
  decline/timeout/withdraw release>
- **Uniqueness guarantee:** <the DB constraint that makes a set holdable by at most
  one party per date>
- **Concurrency strategy:** <`SELECT … FOR UPDATE` row lock | `INSERT … ON CONFLICT
  DO NOTHING` claim | other — and why>
- **Pool rule (invariant #3):** <how online bookings are restricted to online-pool
  sets>
- **Cutoff rule (invariant #4):** <how the venue's `sales_close` fence on day D holds,
  `Europe/Tirane` — and, if cancellation is in scope, its separate evening-before boundary>
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
| EV-1 | `BookingConfirmed` | `booking` | `{ bookingId, setId, venueId, bookingDate }` | `payout`, `notification` | async `AFTER_COMMIT` | `<…>` |

### Module ownership (§4a)

> **Required whenever the slice adds or moves behavior.** For each new or changed
> capability, state which module owns it and why: the justification cites the owner's
> **Job** line *and* confirms the capability is **not** on another module's **Not My
> Job** list (`RESPONSIBILITIES.md`). A capability on some module's Not-My-Job list, or
> that two modules both claim, is resolved **before** code — a misplacement caught here
> is a sentence; at review it's a diff. Pay special attention to the two
> decision-vs-execution splits (`booking` decides refunds / `payment` executes; `venue`
> stores the commission rate / `payout` computes) and the Need-To-Know rule (a
> subscriber gets ids, never a foreign aggregate). Single module, no cross-module
> interaction → a one-line "all in `<module>`, no boundary change" suffices.
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

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation. After a compaction, in a fresh
> session, or whenever unsure: re-read it (plus the current stage's `riviera-sdlc`
> reference file) before acting. Update it in the SAME commit window as the change it
> records — the same commit or the immediately-following one, nothing unrelated between;
> covers every plan-doc update incl. *Skills consulted* — at every phase boundary and
> SDLC stage transition (why: `riviera-sdlc` §Context hygiene).
>
> **Finalize BEFORE the merge, in the PR's own last commit** — stage pointer DONE, phase
> rows ✅ with commits, Open Questions empty, risk rows closed, AC pin-names matching the
> shipped tests. Record **`merged via PR #NN`, never a merge SHA** — the SHA guarantees a
> second docs-only PR (case history + details: `riviera-sdlc` `references/pr-gates.md`
> §3 step 4).

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
>
> **Every path in the diff, including the one-line ones — and this is machine-checked.** CI
> fails the PR on any path the diff changed and this section does not list. Run it
> yourself before pushing — it is the check, not a reminder to do the check by hand:
>
> ```bash
> node scripts/check-plan-file-structure.mjs --diff origin/main
> ```
>
> It judges untracked paths as well as the diff, so a file you have written but not
> staged is caught too. **Stage or commit this plan doc first** — `git add` is what marks it as part
> of the change, and with the doc merely written the guard short-circuits and passes whatever the
> section says. A file you never intend to commit belongs behind an ignore rule (`.git/info/exclude`
> for a personal scratch path, `.gitignore` repo-wide).
>
> The guard reads paths written any way real plans write them — repo-relative
> (`payout/application/DailyTakingsServiceTest.java`), sibling extensions
> (`` `privacy-policy.ts` `` then `` `.html` ``), brace sets, `a.ts|.html`, a bare directory, and
> globs (`frontend/src/app/**/*.contrast.spec.ts`) — so a large mechanical sweep is one honest
> entry rather than fifty. It never flags the reverse (a path you listed and did not need), and it
> exempts the plan doc itself and lockfiles. A slice with no plan doc is not checked at all.

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

Population `<the mechanism, e.g. "every script that invokes git">` → enumerate `<command>` →
candidates `<list>` → decision `<fix all / subset / skip + why>`. Append to the
Generalization-audit log below.

> **The population is defined by mechanism, not by resemblance** (case history: #641; the
> rule: `riviera-plan-doc` execution-time step 1). The recorded command must be the one that
> *found* the population, not one that confirmed the members you had already guessed.

- [ ] **Step 6: Commit** — `git commit -m "<imperative subject> (#NN)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
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
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
