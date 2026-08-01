# Cleanup batch #126 — the five verified-open items

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #126 by shipping its five verified-open items in one batch PR: the
stale-credential "Pay now" dead-intent fix (behavioral), the `CustomerLookup.findByIds` N+1
batch read, the `daily-view-tab` countdown-latch → `forkJoin` swap, the `booking`
view/SQL-twin dedup, and the `booking.service.ts` triple-signal consolidation — each
refactor behavior-frozen by tests, the one behavior change pinned by new tests + e2e.

**Architecture:** The only cross-module surface change is widening the existing
`customer::api` `CustomerLookup` port with a batch read (`findByIds`) — same conversation,
same consumers, no grant change. Everything else is module-internal (`booking`
adapter/application) or frontend-internal. The one behavioral change (Pay now) keeps
invariant #8 intact: the fix only *reads* booking status from the server on a payment-form
failure; confirmation still arrives exclusively via the verified webhook.

**Persistence:** JDBC only (invariant #1). **No schema change, no Flyway migration** —
the SQL-twin dedup rewrites Java only; the merged INSERT binds `request_expires_at = NULL`
on the instant path (the column is already nullable).

**Source of intent:** GitHub issue #126 (as re-verified 2026-08-01, this session — the
re-verification is recorded in the issue body itself).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill was
the 2026-08-01 staleness re-verification: two items retired, two unverified items confirmed
real, no in-flight/Flyway collisions) · `riviera-plan-doc` (this template — forced the
behavior-parity ledger for the three refactors and the wire-contract risk R-1) · `tdd`
(every phase red-green; refactor phases pin parity first) · `riviera-review-overlay`
(review gate — runs when the PR leaves draft) · `riviera-docs-freshness` (pending — runs at
merge close-out over this PR's range; expected N/A-ish: no substrate-doc fact changes, but
the counting sweep must confirm) · `riviera-modulith` (port stays in `customer::api` —
widening an existing named interface, no `allowedDependencies` change; view/SQL dedup stays
inside `booking` adapter layer) · `riviera-java-conventions` (Map-returning batch port, no
`null`; `JdbcClient` named-param `IN` list; empty-input guard without SQL) ·
`riviera-stripe-payments` (the Pay-now fix is read-only against the payment flow — webhook
stays the sole confirmation trigger; no intent lifecycle change) · `riviera-frontend`
(placement: all three FE items stay in their existing feature folders `booking/` and
`operator/`; e2e goes in the CI-safe mocked suite) · `codebase-design` (`findByIds` joins
`CustomerLookup`'s existing read conversation rather than adding a port; the view-dedup must
not create a hypothetical seam — if it can't be done without changing the wire shape or
adding indirection deeper than the duplication, keep the records and dedup the factories
only) · `domain-modeling` — N/A: no new domain vocabulary, no ADR-worthy decision ·
*deferred loads, recorded here so they aren't forgotten:* `riviera-local-debug` (before the
session's first `gradle`/`npm`), `angular-developer` + angular-cli MCP
`get_best_practices` (before phase 3), `playwright-cli` (before phase 5's e2e),
`riviera-tailwind` (only if phase 5 adds styled template surface).

**Branch:** `claude/sdlc-126-staleness-check-kjmiph` — the session's designated remote
branch stands in for `feature/cleanup-batch-126` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (Pay now, dead intent at confirm):** Given a booking whose PaymentIntent was
  cancelled server-side after the pay page loaded, when the Stripe confirm step fails, then
  the page re-reads the booking by code and — the status no longer being
  `AWAITING_PAYMENT` — shows the terminal "couldn't be completed" state with a link to
  `/booking/<code>`, and the retry button is gone. *Pinned by:*
  `booking-pay.spec.ts` ("re-checks booking status on a confirm failure…").
- [ ] **AC-2 (Pay now, dead intent at mount):** Given the same stale hand-off, when
  mounting the Payment Element fails, then the same status re-check runs with the same
  terminal outcome. *Pinned by:* `booking-pay.spec.ts` (mount-failure case).
- [ ] **AC-3 (Pay now, genuinely transient failure):** Given a booking still
  `AWAITING_PAYMENT`, when confirm fails (card declined), then the retry-in-place error
  state is unchanged (element mounted, "Try again"). *Pinned by:* existing
  `booking-pay.spec.ts` cases staying green.
- [ ] **AC-4 (queue batch read):** Given a venue with N pending requests, when the
  operator queue is served, then guest names resolve through **one** `CustomerLookup`
  call (`findByIds`), a missing contact still rendering as `""`. *Pinned by:*
  `PendingRequestsServiceTest` (call-counting fake).
- [ ] **AC-5 (batch port semantics):** Given ids of which some exist, when `findByIds`
  runs, then it returns exactly the existing contacts keyed by id; given an empty
  collection it returns an empty map without touching the database. *Pinned by:*
  `CustomerModuleIT` (or the module's existing IT home for `JdbcCustomerDirectory`) +
  a no-SQL-on-empty unit assertion.
- [ ] **AC-6 (booking insert parity):** Given the merged INSERT, when an instant booking
  and a pending request are created, then row contents are unchanged
  (`request_expires_at` NULL vs set) and a code collision is still a no-op empty result,
  not a thrown violation. *Pinned by:* existing booking ITs staying green
  (`WithdrawRequestIT`, reserve/request ITs) — no new DB behavior.
- [ ] **AC-7 (202 wire contract frozen):** Given the view dedup, when a `202` requested /
  awaiting-payment body is serialized, then the JSON key set and values are byte-compatible
  with today's. *Pinned by:* a controller-level JSON assertion written **before** the
  refactor (`BookingControllerTest` or sibling).
- [ ] **AC-8 (daily-tab load parity):** Given the `forkJoin` rewrite, when map+bookings
  load (success, one-fails, stale-date-response, post-write reconcile), then `loaded`
  flips only after both settle, the stale-date guard still discards late responses, and a
  reconcile failure still preserves the working grid. *Pinned by:*
  `daily-view-tab.spec.ts` (existing cases + a both-settle ordering case if missing).
- [ ] **AC-9 (hand-off invariant):** Given the single-result refactor of
  `BookingService`, when a create resolves 201 / 202-awaiting / 202-requested, or
  `beginPayment`/`clear` runs, then exactly one of `lastConfirmation` /
  `lastAwaitingPayment` / `lastRequested` is non-undefined (or none after `clear`), with
  unchanged public accessor signatures. *Pinned by:* `booking.service.spec.ts`.

## Non-goals

- Anything on #479 (orphan-PaymentIntent reconciliation) — blocked by #284, tracked there.
- Changing when/how PaymentIntents are issued, expired, or swept (the model is settled).
- Changing the `202` wire contract, the queue endpoint's response shape, or any endpoint.
- The "documented behavior" note in #126 (sweep windows float with config) — stays as is.
- Retiring `booking-pay.scss` or other Tailwind migration (not this batch).

## Behavior-parity ledger (refactor items 3, 4, 5)

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| `daily-view-tab.load`: `loaded` flips only once BOTH reads settle (no "0 of 0 free" flash) | preserved | `forkJoin` completes only when both inner (error-caught) streams complete |
| `load`: venue write guarded by `selectedDate() === requested` (stale response discarded) | preserved | guard moves inside the per-stream `map`/`tap` before the join |
| `load`: venue error wipes to error card **only** when no grid exists; reconcile failure keeps the grid | preserved | per-stream `catchError` keeps the distinct error handling before joining |
| `load`: bookings-stream error handling incl. `dropSessionIfUnauthorized` | preserved | same handler, same stream, inside its `catchError` |
| `load(onSettled)`: callback runs after both settle (reconcile clears only the settled set's override) | preserved | `forkJoin` subscribe block calls `onSettled` |
| `BookingService`: setting any hand-off clears the other two | preserved | single source signal makes it structural (one value at a time) |
| `BookingService`: `lastConfirmation`/`lastAwaitingPayment`/`lastRequested` are call-as-function readonly accessors | preserved | `computed()` projections — same call syntax for consumers |
| `BookingService.createBooking`: remembers code via `DeviceLocalBookings` on every outcome, null-body-safe | preserved | untouched code path |
| `insertAwaitingPayment`/`insertPendingRequest`: ON CONFLICT (code) DO NOTHING → empty retry signal, never a poisoned transaction | preserved | the merged private insert keeps the exact SQL contract; wrappers pass status + nullable deadline |
| `RequestedView` has **no** `clientSecret`/`paymentIntentId` keys; `AwaitingPaymentView` has them | preserved | AC-7 contract test pins the key sets before the dedup |
| `booking-pay`: declined card → retry in place, element stays mounted, no polling | preserved (AC-3) | status re-check only *escalates* to terminal when the server says the booking left `AWAITING_PAYMENT` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | View dedup changes the 202 JSON wire shape (frontend models + e2e mocks depend on it) | med | high | AC-7 contract test written first; `codebase-design` rule — if dedup needs `@JsonUnwrapped` tricks or nesting, fall back to deduping only the `of(...)` factories and record why | session | open |
| R-2 | `forkJoin` collapses the two streams' distinct error semantics (it errors the join if a source errors un-caught) | med | med | per-stream `catchError` **inside** the join, parity cases in AC-8; ledger rows above are the checklist | session | open |
| R-3 | Pay-now re-check races the poll / double-handles an error (two paths now read status) | low | med | re-check only from the two failure paths (mount, confirm) which today never poll; poll logic untouched; unit specs cover both entries | session | open |
| R-4 | `findByIds` with an empty id list generates invalid SQL (`IN ()`) | med | low | early-return empty map before building SQL; pinned by AC-5 | session | open |
| R-5 | Merged INSERT accidentally changes null/param binding for the instant path | low | high | column already nullable; existing reserve/request/withdraw ITs are the net (AC-6); no SQL keyword changes beyond the shared text | session | open |
| R-6 | `BookingService` consumers read the signals in a way `computed()` subtly changes (e.g. capture-at-construction like `BookingPay.booking`) | low | med | accessors keep identical call syntax + timing (`computed` reads are pull-based like `asReadonly`); grep all consumers during phase 3; specs pin each consumer-visible behavior | session | open |
| R-7 | Invariant #8 drift: the Pay-now fix must never *confirm* from a client signal | low | high | fix reads `GET /api/bookings/{code}` and only ever moves to *error* states from it; `riviera-stripe-payments` loaded; review overlay RV item will check | session | open |

## Open questions / Assumptions

- **Assumption:** the `202` bodies are serialized only (never deserialized outside tests),
  so any dedup mechanism must still keep serialization byte-compatible (AC-7 decides). —
  *Owner:* session · *Resolves by:* phase 2.
- **Assumption:** `CustomerModuleIT`-style Testcontainers coverage exists for
  `JdbcCustomerDirectory` to host the `findByIds` IT; if not, add the case to whatever IT
  covers that adapter today. — *Owner:* session · *Resolves by:* phase 1.
- **Assumption:** the e2e for AC-1 belongs in the CI-safe mocked suite (extending
  `request-to-book.e2e.ts` or `booking-flow.e2e.ts`, wherever pay-page coverage lives). —
  *Owner:* session · *Resolves by:* phase 5.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** No path in this batch writes
`availability(set_id, booking_date)`: the Pay-now fix reads booking status only (the
sweep that cancels/releases is untouched); the INSERT dedup preserves byte-identical SQL
semantics on the `booking` table (not availability); the queue read and all FE refactors
are read-only. The claim/release spine, pool rule, and cutoff rule are out of scope and
unmodified.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing | `Customer` | `CustomerLookup` is its `api/` read port; the batch read is the same guest-identity resolution job |
| M-2 | `booking` | existing | `Booking` | queue assembly (`PendingRequestsService`), the 202 views, and the insert SQL are all booking-internal |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerLookup` — **widened** with `Map<CustomerId, GuestContact> findByIds(Collection<CustomerId>)` | `CustomerId`, `GuestContact` (existing vocabulary; no new types) | `booking` (queue), `notification` (existing single-id uses unchanged) |

**Domain events** — none touched; no publication, subscription, or payload change.

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| Batch-resolve customer ids → contacts | `customer` | `customer` Job: tourist identity/guest contact; `booking` must not read customer tables (invariant #11 — the existing `CustomerLookup` javadoc states exactly this) |
| Assemble the pending-requests queue rows | `booking` | existing job, unchanged — only the lookup call count changes |
| 202 response shaping + booking INSERT SQL | `booking` (adapter layer) | internal dedup; no published surface involved |
| Pay-page failure handling | frontend `booking/` feature | display logic; server truth (booking status) stays authoritative |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, no Connect — **unchanged**; this batch moves no money.
- **Confirmation trigger:** signature-verified webhook — unchanged; the Pay-now fix adds a
  **read** of booking status on payment-form failure and can only transition the page to
  *error* states from it, never to confirmed (AC-1/2; R-7).
- **Idempotency / payout-ledger / refund policy:** untouched.
- **Pinning tests:** AC-1/2/3 specs (`booking-pay.spec.ts`) + the e2e; no backend payment
  test changes.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-pay.ts` | existing | standalone component | signals; adds a status re-check on the two failure paths + terminal link to `/booking/:code` | none |
| FE-2 | `booking/booking.service.ts` | existing | `@Service()` | three hand-off signals → one source signal + three `computed()` projections | none |
| FE-3 | `operator/daily-view-tab.ts` | existing | standalone component | hand-rolled 2-counter latch → `forkJoin` with per-stream `catchError` | none |
| FE-4 | e2e: CI-safe mocked suite | existing spec extended | Playwright | dead-intent scenario via `page.route` mocks | — |

**Standards:** standalone, `inject()`, native control flow — all already in place; no new
components. Deviations: none planned.

## FE↔BE contract

**N/A — no contract change.** AC-7 exists precisely to prove the 202 bodies stay
byte-compatible; `GET /api/bookings/{code}` is consumed as-is by the new re-check.

## Execution status

**Stage pointer:** implement (phase 2)

**Next action:** AC-7 wire-freeze test for the two 202 bodies, then the insert/view dedup

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | 0178ae1; draft PR #482 |
| 1 — BE: `findByIds` batch read (AC-4, AC-5) | ✅ | 1f95f6e |
| 2 — BE: booking insert + 202-view dedup (AC-6, AC-7) | | |
| 3 — FE: `BookingService` single-result hand-off (AC-9) | | |
| 4 — FE: daily-tab `forkJoin` (AC-8) | | |
| 5 — FE: Pay-now dead-intent fix + e2e (AC-1..3) | | |
| 6 — close-out: docs-freshness, #126 update, ready-for-review, gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/customer/api/CustomerLookup.java` — add `findByIds`
- `platform/src/main/java/ai/riviera/platform/customer/adapter/out/JdbcCustomerDirectory.java` — implement it (`IN (:ids)`, empty-guard)
- `platform/src/main/java/ai/riviera/platform/booking/application/request/PendingRequestsService.java` — batch the lookup
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — merge the two INSERTs into one private method
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/{RequestedView,AwaitingPaymentView}.java` — dedup per R-1's decision rule
- `platform/src/test/...` — `PendingRequestsServiceTest`, the directory IT case, the AC-7 contract test
- `frontend/src/app/booking/booking-pay.ts` + `.spec.ts` — failure-path status re-check, terminal link
- `frontend/src/app/booking/booking.service.ts` + `.spec.ts` — single-result signal
- `frontend/src/app/operator/daily-view-tab.ts` + `.spec.ts` — `forkJoin`
- `frontend/e2e/<pay-page spec>.e2e.ts` — dead-intent scenario
- `docs/plans/cleanup-batch-126.md` — this doc, updated every phase boundary

---

## Phase 0 — Plan doc + draft PR

- [ ] Commit this doc — `docs: plan the #126 cleanup batch (#126)`
- [ ] Push `claude/sdlc-126-staleness-check-kjmiph`, open the **draft** PR referencing #126
- [ ] Update Execution status in the same commit window

## Phase 1 — BE: `CustomerLookup.findByIds` (AC-4, AC-5)

- [ ] Load `riviera-local-debug` before the first gradle invocation
- [ ] Red: `PendingRequestsServiceTest` — call-counting fake proves one lookup for N rows,
      missing id → `""`; directory IT case for AC-5 (subset found, empty-in → empty map, no SQL)
- [ ] Green: widen the port (default-method-free, plain interface), implement in
      `JdbcCustomerDirectory` (named-param `IN` list, early-return on empty), swap the call site
- [ ] Scoped run: the touched test classes, then `*ModularityTests*` +
      `*PackageShapeArchitectureTests*` + `*JdbcOnlyArchitectureTests*` (structural net — port widened)
- [ ] Commit + update Execution status

## Phase 2 — BE: insert + view dedup (AC-6, AC-7)

- [ ] Red-first for AC-7: controller-level JSON key-set assertions for both 202 bodies (must
      pass against today's code — this is the freeze, not a failing test; commit it before touching views)
- [ ] Merge the two INSERTs (one private method, status + nullable `request_expires_at`)
- [ ] Dedup the views per R-1's decision rule; keep AC-7 green
- [ ] Scoped run: booking ITs that cover reserve/request/withdraw + the contract test + structural net
- [ ] Commit + update Execution status

## Phase 3 — FE: `BookingService` single-result signal (AC-9)

- [ ] Load `angular-developer` + angular-cli MCP `get_best_practices` before editing
- [ ] Red: `booking.service.spec.ts` — exactly-one-hand-off invariant across all outcomes + `clear`
- [ ] Green: one source signal, three `computed()` projections, identical public surface;
      grep all consumers (`lastConfirmation|lastAwaitingPayment|lastRequested`) for timing assumptions (R-6)
- [ ] Scoped run: `npm test` for the touched specs; `npm run lint`
- [ ] Commit + update Execution status

## Phase 4 — FE: daily-tab `forkJoin` (AC-8)

- [ ] Red: parity cases from the ledger rows (both-settle, stale-date, reconcile-failure-keeps-grid)
      — add only what `daily-view-tab.spec.ts` doesn't already pin
- [ ] Green: `forkJoin` with per-stream `catchError`; delete the latch
- [ ] Scoped run + lint; commit + update Execution status

## Phase 5 — FE: Pay-now dead-intent fix (AC-1..3) + e2e

- [ ] Load `playwright-cli` (+ `riviera-tailwind` only if the terminal state needs new styling)
- [ ] Red: `booking-pay.spec.ts` — mount-failure and confirm-failure each re-check status;
      `CANCELLED`/non-awaiting → terminal + `/booking/:code` link; still-awaiting → unchanged retry (AC-3)
- [ ] Green: re-check on the two failure paths only; poll logic untouched
- [ ] e2e: dead-intent scenario in the CI-safe suite (mock `GET /api/bookings/:code` flip)
- [ ] Scoped run + lint + `npm run test:e2e:a11y` for the touched spec; commit + update status

## Phase 6 — Close-out

- [ ] Merge latest `origin/main`, full-suite CI green on the PR
- [ ] Mark PR ready for review → run the Review gate (invocation ladder, `pr-gates.md` §1)
      + `riviera-review-overlay`; findings re-enter at Implement
- [ ] Sonar gate: pull the new-issue + duplication list (§2) — note the batch *removes*
      duplication, Sonar's duplication delta should confirm, not complain
- [ ] `riviera-docs-freshness` over the PR range (counting sweep incl. "the two X" checks)
- [ ] Tick the four resolved boxes on #126 (leave the #479-tracked item as-is), close #126
      if all its non-superseded items are done
- [ ] Finalize this doc citing `merged via PR #NN`; Self-review checklist all green

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-9: each verified by its named pinning test at the final commit (filled at phase 6).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** N/A justified above (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [ ] **Payment/payout**: read-only against the flow; webhook remains sole confirmation (#8).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: no new time arithmetic (invariant #6).
- [ ] Booking codes: never logged; the re-check URL-encodes the code as today (invariant #7).
- [ ] No Flyway migration needed (invariant #12 — no schema change).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register closed out; Open Questions empty or issue-linked.
- [ ] Close-out written in THIS PR (`merged via PR #NN`).
- [ ] The review gate ran in full per the invocation ladder.
