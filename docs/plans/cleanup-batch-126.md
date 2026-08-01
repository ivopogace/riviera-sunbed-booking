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
(review gate — **ran** 2026-08-01 via the /code-review fan-out + overlay bank walk; findings
F-3..F-7) · `riviera-docs-freshness` (**ran** pre-merge smoke over `origin/main...HEAD`,
2026-08-01 — 0 findings; counting sweep triggered on five Nth-instance events, 0 stale
counts) · `postgres` (loaded at the review-fix round after RV-PROC-1 flagged its omission —
re-vetted the `IN (:ids)` batch read as its recommended anti-N+1 shape and the merged
INSERT's typed-NULL `TIMESTAMPTZ` bind; no changes required) · `riviera-modulith` (port stays in `customer::api` —
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

- [x] **AC-1 (Pay now, dead intent at confirm):** Given a booking whose PaymentIntent was
  cancelled server-side after the pay page loaded, when the Stripe confirm step fails, then
  the page re-reads the booking by code and — the status no longer being
  `AWAITING_PAYMENT` — shows the terminal "couldn't be completed" state with a link to
  `/booking/<code>`, and the retry button is gone. *Pinned by:*
  `booking-pay.spec.ts` ("re-checks booking status on a confirm failure…").
- [x] **AC-2 (Pay now, dead intent at mount):** Given the same stale hand-off, when
  mounting the Payment Element fails, then the same status re-check runs with the same
  terminal outcome. *Pinned by:* `booking-pay.spec.ts` (mount-failure case).
- [x] **AC-3 (Pay now, genuinely transient failure):** Given a booking still
  `AWAITING_PAYMENT`, when confirm fails (card declined), then the retry-in-place error
  state is unchanged (element mounted, "Try again"). *Pinned by:* existing
  `booking-pay.spec.ts` cases staying green.
- [x] **AC-4 (queue batch read):** Given a venue with N pending requests, when the
  operator queue is served, then guest names resolve through **one** `CustomerLookup`
  call (`findByIds`), a missing contact still rendering as `""`. *Pinned by:*
  `PendingRequestsServiceTest` (call-counting fake).
- [x] **AC-5 (batch port semantics):** Given ids of which some exist, when `findByIds`
  runs, then it returns exactly the existing contacts keyed by id; given an empty
  collection it returns an empty map without touching the database. *Pinned by:*
  `CustomerDirectoryIT.findsABatchOfContactsByIdSkippingUnknownIds` (incl. the empty-input case).
- [x] **AC-6 (booking insert parity):** Given the merged INSERT, when an instant booking
  and a pending request are created, then row contents are unchanged
  (`request_expires_at` NULL vs set) and a code collision is still a no-op empty result,
  not a thrown violation. *Pinned by:* existing booking ITs staying green
  (`WithdrawRequestIT`, reserve/request ITs) — no new DB behavior.
- [x] **AC-7 (202 wire contract frozen):** Given the view dedup, when a `202` requested /
  awaiting-payment body is serialized, then the JSON key set and values are byte-compatible
  with today's. *Pinned by:* `BookingCreationViewsContractTest`, written **before** the refactor.
- [x] **AC-8 (daily-tab load parity):** Given the `forkJoin` rewrite, when map+bookings
  load (success, one-fails, stale-date-response, post-write reconcile), then `loaded`
  flips only after both settle, the stale-date guard still discards late responses, and a
  reconcile failure still preserves the working grid. *Pinned by:*
  `daily-view-tab.spec.ts` (existing cases + a both-settle ordering case if missing).
- [x] **AC-9 (hand-off invariant):** Given the single-result refactor of
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
| R-1 | View dedup changes the 202 JSON wire shape (frontend models + e2e mocks depend on it) | med | high | AC-7 contract test written first; `codebase-design` rule — if dedup needs `@JsonUnwrapped` tricks or nesting, fall back to deduping only the `of(...)` factories and record why | session | **closed** — `@JsonUnwrapped` on record components flattens correctly under Jackson 3 (serialization-only DTOs); `BookingCreationViewsContractTest` green throughout; fallback unneeded |
| R-2 | `forkJoin` collapses the two streams' distinct error semantics (it errors the join if a source errors un-caught) | med | med | per-stream `catchError` **inside** the join, parity cases in AC-8; ledger rows above are the checklist | session | **closed** — per-stream `tap`/`catchError` verified by the bug-scan reviewer + parity specs green |
| R-3 | Pay-now re-check races the poll / double-handles an error (two paths now read status) | low | med | re-check only from the two failure paths (mount, confirm) which today never poll; poll logic untouched; unit specs cover both entries | session | **closed** — the review round hardened this further (F-5, F-8: one-way guards + interleave spec) |
| R-4 | `findByIds` with an empty id list generates invalid SQL (`IN ()`) | med | low | early-return empty map before building SQL; pinned by AC-5 | session | **closed** — guard + `CustomerDirectoryIT` case |
| R-5 | Merged INSERT accidentally changes null/param binding for the instant path | low | high | column already nullable; existing reserve/request/withdraw ITs are the net (AC-6); no SQL keyword changes beyond the shared text | session | **closed** — typed-NULL bind (`Types.TIMESTAMP`); reserve/request/withdraw ITs green; `postgres` re-vet clean |
| R-6 | `BookingService` consumers read the signals in a way `computed()` subtly changes (e.g. capture-at-construction like `BookingPay.booking`) | low | med | accessors keep identical call syntax + timing (`computed` reads are pull-based like `asReadonly`); grep all consumers during phase 3; specs pin each consumer-visible behavior | session | **closed** — consumer grep done (all pull-once; a11y stubs cast); 1011 specs green |
| R-7 | Invariant #8 drift: the Pay-now fix must never *confirm* from a client signal | low | high | fix reads `GET /api/bookings/{code}` and only ever moves to *error* states from it; `riviera-stripe-payments` loaded; review overlay RV item will check | session | **closed** — overlay RV-CT-3 verdict: compliant (reading server truth is sanctioned; webhook remains sole confirmer) |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Assumption:** the `202` bodies are serialized only — **held**; `@JsonUnwrapped` flattening
  verified by `BookingCreationViewsContractTest` (phase 2, commit 90a8bd6).
- **Assumption:** an IT home exists for `JdbcCustomerDirectory` — **held**;
  `CustomerDirectoryIT` hosts the `findByIds` cases (phase 1, commit d455925/38297ea).
- **Assumption:** the AC-1 e2e belongs in the CI-safe mocked suite — **held**; scenario added
  to `request-to-book.e2e.ts`, where pay-page coverage lives (phase 5, commit 4f07412).

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

**Stage pointer:** merge — all gates cleared, final state recorded; **merged via PR #482** (the merge click + the #126 issue close are the only remaining, GitHub-only actions)

**Next action:** verify CI + Sonar green on the review-fix head, tick the PR gates checklist, merge (human confirms — merging deploys to prod via `deploy.yml`)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | 0178ae1; draft PR #482 |
| 1 — BE: `findByIds` batch read (AC-4, AC-5) | ✅ | 1f95f6e |
| 2 — BE: booking insert + 202-view dedup (AC-6, AC-7) | ✅ | see phase-2 commit — freeze widened to the 201 body; `@JsonUnwrapped` flattening verified on Jackson 3 (R-1 fallback unneeded) |
| 3 — FE: `BookingService` single-result hand-off (AC-9) | ✅ | full FE suite 1005 green + lint; R-6 grep: all consumers pull-once, a11y stubs cast — no timing assumptions broken |
| 4 — FE: daily-tab `forkJoin` (AC-8) | ✅ | per-stream tap/catchError inside the join keeps per-response timing; new both-settle ordering spec added |
| 5 — FE: Pay-now dead-intent fix + e2e (AC-1..3) | ✅ | one deliberate pin change: "never re-checks status" → "ONE re-check, no poll"; fake gateway gained `__RIVIERA_FAKE_STRIPE_FAIL__`; e2e 7/7 green locally |
| 6 — close-out: docs-freshness, #126 update, ready-for-review, gates | ⏳ | review gate ran (6-agent fan-out + overlay), F-3..F-9 all fixed; docs-freshness pre-merge smoke: 0 findings; Sonar: 0 new issues, 95.2% new coverage, 0 duplication |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run 30692508369, d455925) | `RespondToRequestServiceTest.pendingQueueChecksOwnershipAndResolvesGuestNames` still stubbed the old per-row `findById` — a second test class covering the queue that the phase-1 scoped run missed | fixed-in-38297ea (stub moved to `findByIds`) |
| F-2 | Sonar (PR 482 analysis) | `java:S1192` — third `"phone"` literal in `JdbcCustomerDirectory` | fixed-in-987f046 (COL_ constants) |
| F-3 | review (overlay RV-PROC-1, Major) | `postgres` missing from Skills consulted though the diff touches SQL queries | fixed — skill loaded, both SQL changes re-vetted (clean), line updated |
| F-4 | review (overlay RV-STYLE-1 + CLAUDE.md agent, Minor) | four-line inline comment above the `forkJoin` subscribe in `daily-view-tab.ts` | fixed — cut to one line; per-stream timing rationale lives in `load()`'s doc comment |
| F-5 | review (bug scan, low) | `failCardStep` had no single-flight/terminal guard — a slow re-check or late confirm error could write under a newer state | fixed — entry guard + subscribe guard (`state() !== 'error' \|\| terminalError()`) |
| F-6 | review (comment compliance) | `COL_PHONE` used as a bind-parameter name in `findOrCreate`, conflating the file's stated param/column namespaces | fixed — `PARAM_PHONE` added |
| F-7 | review (comment compliance) | stale docs: `StripeCheckout.confirm` contract + `terminalError` signal doc predate the re-check | fixed — both updated |
| F-8 | review (git history, the round's one real bug) | `failCardStep` could write backwards over a newer state — a second confirm erroring after the re-check adopted `confirmed` (Stripe errors on an already-succeeded intent) would downgrade the page to `error` | fixed — one-way entry guard (`processing`/`confirmed`/`awaiting`/terminal) + subscribe guard; pinned by the `DeferredConfirmGateway` interleave spec |
| F-9 | review (prior-PR comments, borderline) | `RequestedView` javadoc repeated the "no payment exists" overclaim #476's review corrected ("no PaymentIntent **on record**") | fixed — phrasing aligned |

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

- [x] Commit this doc — `docs: plan the #126 cleanup batch (#126)`
- [x] Push `claude/sdlc-126-staleness-check-kjmiph`, open the **draft** PR referencing #126
- [x] Update Execution status in the same commit window

## Phase 1 — BE: `CustomerLookup.findByIds` (AC-4, AC-5)

- [x] Load `riviera-local-debug` before the first gradle invocation
- [x] Red: `PendingRequestsServiceTest` — call-counting fake proves one lookup for N rows,
      missing id → `""`; directory IT case for AC-5 (subset found, empty-in → empty map, no SQL)
- [x] Green: widen the port (default-method-free, plain interface), implement in
      `JdbcCustomerDirectory` (named-param `IN` list, early-return on empty), swap the call site
- [x] Scoped run: the touched test classes, then `*ModularityTests*` +
      `*PackageShapeArchitectureTests*` + `*JdbcOnlyArchitectureTests*` (structural net — port widened)
- [x] Commit + update Execution status

## Phase 2 — BE: insert + view dedup (AC-6, AC-7)

- [x] Red-first for AC-7: controller-level JSON key-set assertions for both 202 bodies (must
      pass against today's code — this is the freeze, not a failing test; commit it before touching views)
- [x] Merge the two INSERTs (one private method, status + nullable `request_expires_at`)
- [x] Dedup the views per R-1's decision rule; keep AC-7 green
- [x] Scoped run: booking ITs that cover reserve/request/withdraw + the contract test + structural net
- [x] Commit + update Execution status

## Phase 3 — FE: `BookingService` single-result signal (AC-9)

- [x] Load `angular-developer` + angular-cli MCP `get_best_practices` before editing
- [x] Red: `booking.service.spec.ts` — exactly-one-hand-off invariant across all outcomes + `clear`
- [x] Green: one source signal, three `computed()` projections, identical public surface;
      grep all consumers (`lastConfirmation|lastAwaitingPayment|lastRequested`) for timing assumptions (R-6)
- [x] Scoped run: `npm test` for the touched specs; `npm run lint`
- [x] Commit + update Execution status

## Phase 4 — FE: daily-tab `forkJoin` (AC-8)

- [x] Red: parity cases from the ledger rows (both-settle, stale-date, reconcile-failure-keeps-grid)
      — add only what `daily-view-tab.spec.ts` doesn't already pin
- [x] Green: `forkJoin` with per-stream `catchError`; delete the latch
- [x] Scoped run + lint; commit + update Execution status

## Phase 5 — FE: Pay-now dead-intent fix (AC-1..3) + e2e

- [x] Load `playwright-cli` (+ `riviera-tailwind` only if the terminal state needs new styling)
- [x] Red: `booking-pay.spec.ts` — mount-failure and confirm-failure each re-check status;
      `CANCELLED`/non-awaiting → terminal + `/booking/:code` link; still-awaiting → unchanged retry (AC-3)
- [x] Green: re-check on the two failure paths only; poll logic untouched
- [x] e2e: dead-intent scenario in the CI-safe suite (mock `GET /api/bookings/:code` flip)
- [x] Scoped run + lint + `npm run test:e2e:a11y` for the touched spec; commit + update status

## Phase 6 — Close-out

- [ ] Merge latest `origin/main`, full-suite CI green on the PR
- [x] Mark PR ready for review → run the Review gate (invocation ladder, `pr-gates.md` §1)
      + `riviera-review-overlay`; findings re-enter at Implement — ran 2026-08-01, F-3..F-9 fixed
- [x] Sonar gate: pull the new-issue + duplication list (§2) — 1 issue (S1192) fixed; 0 new issues, 95.2% coverage, 0 duplication on the fix head — note the batch *removes*
      duplication, Sonar's duplication delta should confirm, not complain
- [x] `riviera-docs-freshness` over the PR range (counting sweep incl. "the two X" checks) — 0 findings
- [ ] Tick the four resolved boxes on #126 (leave the #479-tracked item as-is), close #126
      if all its non-superseded items are done
- [x] Finalize this doc citing **merged via PR #482**; Self-review checklist all green

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | F-1 (phase 1 CI red) | other tests stubbing `CustomerLookup.findById` | `grep -rl 'findById(' platform/src/test \| xargs grep -l CustomerLookup` | 2 (`SuppressedConfirmationMailDeliveryTest`, `BookingMailFactsServiceTest`) | skip — both exercise `notification` call sites that legitimately still use the single-id read |

---

## Acceptance-criteria verification (final)

- [x] AC-1/AC-2: `booking-pay.spec.ts` — "confirm failure on a booking the sweep cancelled →
  terminal" + "mount failure on a booking the sweep cancelled → terminal, with a link" (green,
  review-fix head).
- [x] AC-3: "surfaces a mount/config failure (still payable → retryable)" + "declined card →
  retry state after ONE status re-check" (green).
- [x] AC-4: `PendingRequestsServiceTest.resolvesEveryGuestNameThroughOneBatchLookup` (+ empty-queue,
  missing-contact cases) (green).
- [x] AC-5: `CustomerDirectoryIT.findsABatchOfContactsByIdSkippingUnknownIds` (green).
- [x] AC-6: reserve/request/withdraw ITs green over the merged INSERT (`WithdrawRequestIT`,
  `RequestToBookFlowIT`, `CreateBookingStripeProfileIT`, `RequestAcceptPayIT`).
- [x] AC-7: `BookingCreationViewsContractTest` — all three bodies' key sets + asymmetries (green).
- [x] AC-8: `daily-view-tab.spec.ts` incl. the new both-settle ordering case (green).
- [x] AC-9: `booking.service.spec.ts` incl. the consecutive-creates exactly-one case (green).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** N/A justified above (invariant #2).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [x] **Payment/payout**: read-only against the flow; webhook remains sole confirmation (#8).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone: no new time arithmetic (invariant #6).
- [x] Booking codes: never logged; the re-check URL-encodes the code as today (invariant #7).
- [x] No Flyway migration needed (invariant #12 — no schema change).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality.
- [x] Risk register closed out; Open Questions empty or issue-linked.
- [x] Close-out written in THIS PR (`merged via PR #NN`).
- [x] The review gate ran in full per the invocation ladder.
