# Refund Idempotency Beyond Stripe's Key Window Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cancellation refund is paid **at most once per booking**, including when the
outbox replays the refund listener days later — after Stripe has pruned the idempotency key
that is today the only thing preventing a second refund.

**Architecture:** The single significant decision is **where the "already refunded?" answer
comes from**: the adapter asks **Stripe** (list the refunds on the booking's PaymentIntent)
before creating one, and adopts a live refund it finds instead of creating a second. It
deliberately does **not** short-circuit on the local `payment.refunded_minor`, even though
that read is cheaper — the local row is *derived* state, and trusting derived state over the
gateway is the same class of mistake as trusting the pruned key (invariant #8: Stripe is the
source of truth for payment state). A secondary change mirrors `initiate`'s existing
same-key replay on `ApiConnectionException` so the common lost-response case resolves
*inside* the key window and never reaches the days-later replay at all.

**Persistence:** JDBC only (invariant #1). **No migration** — the fix needs no new column;
`payment.refunded_minor` / `refund_id` (V11) already carry what is recorded. `V11`'s comment
asserting "at most one refund per booking (one idempotency-keyed gateway call)" is now only
half true, but **V11 is applied and must not be edited** (Flyway checksum validation,
invariant #12) — the correction lands in `RESPONSIBILITIES.md` §`payment` instead.

**Source of intent:** GitHub issue #569

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's suggested "check locally *and/or* read Stripe" hides a real fork, and that the false
"the key makes replays safe" premise is restated in 10 javadocs + a plan-doc risk row, none of
which the issue mentions) · `riviera-plan-doc` (this template — forced the Behavior-parity
ledger that turned up the fail-closed case, and the Module-ownership check) · `tdd` (each of
the three behaviors driven red→green in `StripePaymentGatewayTest`) ·
`riviera-review-overlay` (review gate — run at ready-for-review) · `riviera-docs-freshness`
(ran over the slice's own diff — the claim sweep in Phase 2 *is* its output; see the
Generalization-audit log) · `riviera-stripe-payments` (refund execution stays collect-only,
no Connect; confirmed the idempotency-key convention it mandates is a *complement* to, not a
substitute for, the existence read) · `riviera-java-conventions` (§6d — new javadoc carries
no issue numbers, rationale relocated to `RESPONSIBILITIES.md`; sealed `RefundResult` left
untouched rather than growing an `Adopted` variant) · `riviera-modulith` (confirmed the whole
fix sits inside `payment`'s own `adapter/out` — no published-surface change, no
`allowedDependencies` change) · `riviera-local-debug` (scoped test recipe; system `gradle` +
JDK-25 toolchain) · `postgres` (`N/A — no SQL and no migration in this slice`)

**Branch:** `claude/sdlc-569-7en5ef` — the cloud session's designated remote branch stands in
for `bugfix/refund-idempotency-beyond-key-window` (riviera-sdlc §Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a booking whose collection already carries a **live** refund at Stripe for
  exactly the requested amount (the state left behind when a create posted but its response was lost,
  and the key has since been pruned), when the refund is issued again, then **no second refund is
  created**, the existing one is recorded locally, and the caller sees `Refunded`. *Pinned by:*
  `StripePaymentGatewayTest.adoptsAnExistingStripeRefundInsteadOfCreatingASecond`
- [x] **AC-2:** Given no refund exists for the booking's PaymentIntent, when a refund is
  issued, then exactly one refund is created, carrying the booking-derived idempotency key,
  and it is recorded. *Pinned by:* `StripePaymentGatewayTest.refundUsesIdempotencyKeyAndRecordsTheRefund`
- [x] **AC-3:** Given the "does a refund already exist?" read itself fails, when a refund is
  issued, then **no refund is created** and the result is `Failed` — fail-closed, so the event
  publication stays outstanding and retries rather than guessing. *Pinned by:*
  `StripePaymentGatewayTest.failsClosedWhenTheExistingRefundReadFails`
- [x] **AC-4:** Given the refund create's response is lost to a connection timeout, when the
  refund is issued, then it is replayed **exactly once** with the **same** idempotency key and
  the recovered refund is recorded — resolving inside the key window. *Pinned by:*
  `StripePaymentGatewayTest.recoversAndRecordsWhenRefundCreateTimesOut`
- [x] **AC-5:** Given both the create and its replay time out, when the refund is issued, then
  the result is `Failed` and nothing is recorded — and a later replay adopts whatever Stripe
  holds (AC-1), so the residual is a delay, never a double payment. *Pinned by:*
  `StripePaymentGatewayTest.failsWhenBothRefundAttemptsTimeOut`
- [x] **AC-6:** Given the only refund Stripe holds for the intent is `failed` **or** `canceled`
  (money did **not** go back), when a refund is issued, then it is **not** adopted and a fresh
  refund is created. *Pinned by:* `StripePaymentGatewayTest.createsAFreshRefundWhenTheOnlyStripeRefundIsDead`
  (parameterized over both dead statuses)
- [x] **AC-7:** Given a refund is adopted rather than created, when it is recorded, then
  `riviera.refunds.adopted` increments — so a lost-response recovery is visible to ops instead
  of silent. *Pinned by:* `StripePaymentGatewayTest.countsAnAdoptedRefund`
- [x] **AC-8:** Given the gateway holds a live refund for an amount **other** than the one
  requested (a manual dashboard refund, say), when a refund is issued, then it is neither adopted
  nor topped up: the result is `Failed("refund_mismatch")`, nothing is recorded, and the publication
  stays outstanding for a human. *Pinned by:*
  `StripePaymentGatewayTest.refusesToActWhenTheHeldRefundIsSmallerThanTheOneRequested`
  *(added at the review gate — F-2)*
- [x] **AC-9:** Given the gateway holds **more than one** live refund, or one whose amount it does
  not report, when a refund is issued, then the result is `Failed` and nothing is recorded — never an
  unboxing NPE, and never one refund's id recorded against another's money. *Pinned by:*
  `StripePaymentGatewayTest.refusesToActWhenSeveralLiveRefundsAreHeld`,
  `StripePaymentGatewayTest.refusesToActWhenTheHeldRefundReportsNoAmount` *(review gate — F-3, F-7, F-8)*
- [x] **AC-10:** Given any refund, when the existence read runs, then it is scoped to **this
  booking's** PaymentIntent — the single parameter the whole at-most-once guarantee rests on.
  *Pinned by:* `StripePaymentGatewayTest.looksForExistingRefundsOnlyOnThisBookingsPaymentIntent`
  *(review gate — F-5)*

## Non-goals

- **A refund webhook.** Refunds stay server-initiated and recorded from the gateway's answer
  (V11's stated model). Reconciling asynchronous refund state changes (`pending` → `failed`
  after the fact) is a separate concern.
- **Reconciling a gateway state that is not "one refund, right amount".** Several live refunds, or
  one for the wrong amount, are **refused** (`Failed("refund_mismatch")`), not summed and not
  corrected. *(Revised at the review gate — the plan originally summed them and reported success,
  which F-2/F-7/F-8 showed could strand a guest owed the shortfall, record one refund's id against
  another's money, or trip V11's `payment_refunded_check` with an exception that escapes the catch.)*
- **Topping up a partial refund** to reach the requested amount when the gateway already holds a
  smaller live refund. That is a money decision, and money decisions belong to `booking`
  (`payment` Not-My-Job).
- **A refund webhook.** A `pending` refund that later flips to `failed` is not re-driven — a stated
  residual, unchanged by this slice and pre-existing on the create path.
- **A port-level conformance test** forcing every `PaymentGateway` adapter to be at-most-once. Named
  as a known gap on the port instead (review gate — F-11).
- **Re-issuing refunds for bookings already double-refunded in production.** No such row is
  known; a remediation would be a data task, not this slice.
- **Changing the sealed `RefundResult`** to distinguish adopted from freshly created. `booking`
  does not act on the difference — it is an execution detail of `payment`.

## Behavior-parity ledger (retirement / replacement slices only)

> The refund path is *replaced*, not extended — every existing behavior of
> `StripePaymentGateway#refund` is enumerated and given a verdict.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| No PaymentIntent on record → `Failed("no_collection")`, no gateway call | preserved | unchanged first branch, still before any Stripe call |
| Creates a refund with `setPaymentIntent` + amount in minor units | preserved | moved into `createRefundWithRecovery`, params byte-identical |
| Idempotency key `booking-<id>-refund` | preserved | unchanged, and still the in-window defence; now a complement to the existence read |
| Success → `markRefunded(booking, requestedAmount, refundId)` → `Refunded` | preserved | on the adopt path the recorded amount is the held refund's, which adoption requires to equal the requested one — so the value written is the same either way |
| Any `StripeException` → `Failed(code)`, never thrown | preserved | the widened `try` now also covers the existence read, so a failed read is `Failed` too (AC-3) |
| Exactly one Stripe API call per refund | changed | now two on the happy path (list, then create). Refunds are rare (cancellations only); the cost is one extra round-trip on a path that already tolerates 25s |
| `ApiConnectionException` propagates to `Failed` with no replay | changed | replayed once with the same key first (AC-4), mirroring `initiate`; a double timeout still lands on `Failed` (AC-5) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The existence read is itself unreliable, and a failed read is misread as "no refund exists" → the exact double-pay we are fixing | low | critical | The read sits **inside** the `try`; any `StripeException` returns `Failed` **before** reaching the create. Fail-closed is the default, pinned by AC-3 | this slice | closed — `2ff5b5d`, AC-3 green. Its cost was raised at the review gate (F-6: a read hiccup now fails a refund that would have succeeded, and pages ops); **accepted deliberately** — a deferred, retried refund is the correct trade against a duplicate payment, and the alternative offered (a local `refunded_minor` short-circuit) reintroduces a second source of truth for a question invariant #8 says only the gateway answers |
| R-2 | Stripe's refund list paginates and a live refund sits beyond page 1, so it is not seen | very low | critical | Now stronger than planned: the read only has to distinguish none / exactly-one / more-than-one, and "more than one" is refused rather than reconciled, so page 1 is decisive by construction | this slice | closed — `8507186`+review fixes |
| R-3 | A refund in a **dead** state (`failed`/`canceled`) is adopted, so a tourist owed money never gets it | low | high | Only live refunds are adoptable; dead ones fall through to a fresh create. Pinned by AC-6, now parameterized over **both** dead statuses (review gate F-9 — only `failed` had coverage, and the `canceled` literal was duplicated rather than reusing `STATUS_CANCELED`) | this slice | closed — AC-6 green |
| R-4 | The adopted amount exceeds `amount_minor` and trips V11's `payment_refunded_check` | very low | med | **Eliminated, not mitigated.** The review (F-8) showed the planned mitigation was wrong — a `DataIntegrityViolationException` is not a `StripeException`, so it escaped the catch into an unbreakable replay loop. Adoption no longer sums: it records one refund's own amount, which must equal the requested one, so the CHECK cannot be reached | review gate | closed — F-8 |
| R-5 | Money invariant #5 slips at the boundary — `Refund.getAmount()` is a boxed `Long` | low | high | The plan flagged the boxing and the code unboxed it anyway (review gate F-3: an NPE escaping the `StripeException` catch, wedging the publication forever). Null is now an explicit refusal, pinned by AC-9 | review gate | closed — F-3 |
| R-6 | The doc sweep in Phase 2 corrects some claims and misses others, leaving the false premise alive somewhere | med | low | The sweep is grep-driven over the exact phrases, recorded in the Generalization-audit log with the search command. The review found the *inverse* miss instead (F-1): prose stating the **old round-trip budget**, which the sweep's phrases did not match | this slice | closed — `8507186` + F-1 |
| R-7 | A `pending` refund is adopted and later flips to `failed`, so the guest is recorded as refunded but is not | low | high | **Accepted residual, stated not hidden.** Refusing to count `pending` would create the second refund this whole slice prevents (a refund *starts* pending). Closing it needs a refund webhook — an explicit non-goal. Recorded on `liveRefundsOn` and in `RESPONSIBILITIES.md` §`payment` | review gate (F-4) | closed — accepted, documented |
| R-8 | A future gateway adapter (ADR-0009 Paysera) ships without the at-most-once guarantee, since only `StripePaymentGateway` implements it and no port-level test forces it | med | high | Named as a known gap on `PaymentGateway`'s javadoc and in `RESPONSIBILITIES.md` §`payment`, where the ADR-0009 slice will read it. A shared conformance test is real scope (the stub records nothing, so it has no state to be idempotent about) and is a non-goal here | review gate (F-11) | closed — deferred with the gap named at the seam |
| R-7 | Flyway version collision with a parallel slice | none | — | No migration in this slice. `V42` is left free; next free number on `main` is V42 and no open non-dependabot PR claims it | this slice | closed — no migration |

## Open questions / Assumptions

- **Assumption:** A booking receives **at most one** refund decision in its lifetime, so
  "any live refund on the intent" is a sound proxy for "this booking's refund already
  happened". *Verified from the code, not assumed:* the guest cancel is `CONFIRMED`-only and
  `WeatherRefundService` reaches `CONFIRMED`/`NO_SHOW` — a booking already `CANCELLED` by one
  path is not reachable by the other. — *Owner:* this slice · *Resolves by:* Phase 0
### Resolved

- **Assumption (verified at plan time):** `stripe-java` 33.1.1 exposes the API this design
  needs. Checked against the resolved jar with `javap`, not assumed:
  `RefundService#list(RefundListParams)` returns `StripeCollection<Refund>` with
  `getData()`/`getHasMore()`; `RefundListParams.Builder` has `setPaymentIntent(String)` and
  `setLimit(Long)`; `Refund` has `getId()`, `getStatus()`, and `getAmount()` — the last a boxed
  `Long`, which is why R-5 exists.

- **Open question (settled at plan time):** local `refunded_minor` pre-check, Stripe read, or
  both? → **Stripe read only.** The local row is derived state written *after* the gateway
  answers; the failure in #569 is precisely that it was never written. A local short-circuit
  would add a second source of truth for a question invariant #8 says only Stripe answers, and
  would skip the authoritative read in exactly the case where local state is stale. The cheap
  read buys nothing the authoritative one does not already cover, since a completed publication
  is never replayed (`RegistryRefundOutbox` re-drives *incomplete* publications only).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` row is read or
written on this path. The refund runs **after** the cancel transaction has already released the
claim (`BookingRefundListener` is an `AFTER_COMMIT` listener); this slice changes only how many
times money moves, never who holds a set. The concurrency that *is* in play is duplicate
*execution* of the same refund, which is the subject of the whole plan and is settled at the
gateway, not in the database.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | Owns Stripe collection **and refund execution**; the gateway adapter is the only code that may speak to Stripe |
| M-2 | `booking` | existing | `Booking` | **Javadoc only** — the claim sweep corrects statements about why a replay is safe; no behavior change |
| M-3 | `shared` | existing | (none — kernel) | One metric **name** added to `ObservabilityMetrics`, matching `REFUNDS_FAILED`/`REFUNDS_SHED`; no logic, no state |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `RefundPort#refund` — **unchanged signature and semantics** | `BookingRef`, `Money`, `RefundResult` | `booking` |

No published surface changes: `RefundResult` keeps its two variants, no `spi/` is added, and no
`allowedDependencies` grant changes. The entire behavior change is inside
`payment/adapter/out/StripePaymentGateway`.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` | `booking` | `{ bookingId, …, refundMinor, currency }` | `booking` (refund), `payout`, `notification` | async `AFTER_COMMIT` | unchanged — **no event change in this slice** |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Ask Stripe whether a refund already exists before creating one | `payment` | `payment` **Job**: "Own Stripe collection — PaymentIntents, refunds, and webhook handling. Reconcile payment state from Stripe (never the client)." This is reconciliation-before-write, the same posture `cancel` already takes by retrieving the intent first. Not on any other module's list |
| Decide that a duplicate must not be paid | `payment` | Execution idempotency, not a money **decision**. `payment` Not-My-Job reserves "whether to refund / how much" for `booking` — untouched here: the requested amount still comes from `booking`, and the adopt path never chooses a *different* amount, it records the one that already moved |
| Count an adopted (recovered) refund | `payment` | Self-observation of this module's own refund execution, exactly as `RefundService` already counts `riviera.refunds.failed`; `MeterRegistry` is a framework bean, not a cross-module dependency |
| Correct the "the key alone makes a replay safe" claims | `booking` + `shared` + `payment` | Documentation of each module's own code, in that module's own files. No behavior moves |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook. Unchanged — this slice touches refunds only.
- **Idempotency:** **this is the slice.** Layered, and the layers are ordered by authority:
  1. **Existence read at Stripe** (new, authoritative, survives key pruning) — a live refund on
     the intent means the refund already happened; adopt it.
  2. **Idempotency key** `booking-<id>-refund` (existing) — covers replays inside Stripe's
     ~24h window, including the new immediate same-key replay.
  3. **Event Publication Registry** (existing) — a `Failed` leaves the publication outstanding
     so the refund is retried rather than lost; with layer 1 in place, retrying is now safe at
     any distance in time, which is what the registry always assumed.
- **Money:** integer minor units, EUR. The adopted amount is Stripe's reported `long` minor
  units, summed as `long`. No floating point, no currency conversion (the refund inherits the
  collection's currency).
- **Payout-ledger effect:** **none, and that is deliberate.** The ledger reverses on
  `BookingCancelled` (UNIQUE-guarded, exactly once, invariant #9) and was already correct — it
  is the money *actually paid out of Stripe* that this slice stops overcounting. The issue's
  observation that "the payout ledger reverses once" is the symptom of the two records
  diverging; after this slice they agree.
- **Refund policy applied:** unchanged — `booking` computes free-until-cutoff / partial-after /
  weather-admin (invariant #10) and hands `payment` an amount.
- **Pinning tests:** `StripePaymentGatewayTest` (all seven ACs), `RefundServiceTest`
  (port seam unchanged), `RefundBulkheadIT` (listener/executor contract unchanged).

## Angular — frontend surfaces touched

`N/A — backend-only.` No API shape, status code, or user-visible behavior changes.

## FE↔BE contract

`N/A — no contract change.`

## Execution status

**Stage pointer:** `review gate — run, 13 findings resolved; blocked before PR/CI/Sonar`

**Next action:** Open the draft PR — **blocked pending the user's explicit go-ahead** (standing
session instruction: no PR unless asked). Until one exists this branch gets **no CI at all** (CI fires
on the `pull_request` event only) and the **Sonar gate cannot run** (Sonar analyzes PRs and `main`
only). Everything else is done: the review gate ran and its findings are resolved.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Adopt an existing Stripe refund instead of creating a second (+ the adoption counter) | ✅ | `2ff5b5d` |
| 1 — Same-key immediate replay on a lost refund response | ✅ | `8e524af` |
| 2 — The false-premise claim sweep + runbook | ✅ | `8507186` |
| 3 — Review-gate findings (F-1…F-13) | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate | The refund is now up to **three** sequential gateway calls, but every bound sized against "one refund is one 25s round-trip" was left unchanged — including the javadoc this diff edited two lines below, `StripeConfigTest`'s documented rationale, and the queue-backlog arithmetic in `RESPONSIBILITIES.md` | fixed — per-call vs per-refund budgets separated (25s vs 75s) in `RefundExecutorProperties`, `StripeConfigTest` and §`booking`; queue 500 **re-derived and deliberately kept**, with the reason recorded |
| F-2 | review gate | **Blocker.** `adopt` reported `Refunded` for a *smaller* held refund, completing the publication — so a guest owed the shortfall would never be paid and nothing would retry | fixed — adoption narrowed to exactly one live refund for exactly the requested amount; anything else is `Failed("refund_mismatch")`. AC-8 |
| F-3 | review gate | `mapToLong(Refund::getAmount)` unboxes a nullable `Long`; the NPE is not a `StripeException`, so it escapes the catch into a publication that replays and NPEs forever | fixed — null amount is an explicit refusal. AC-9 |
| F-4 | review gate | `returnedMoney` counts `pending`/`requires_action` as money returned; a refund that later fails is recorded as done with nothing to re-drive | accepted as a residual — renamed `isLive` (the name asserted more than the predicate tested), documented on the method, in §`payment`, and as R-7. Closing it needs a refund webhook (non-goal) |
| F-5 | review gate | No test asserted the existence read is scoped to the booking's PaymentIntent — `list(any(...))` matched anything, so dropping `.setPaymentIntent` would adopt strangers' refunds with every test still green | fixed — AC-10 captures the params and asserts the intent |
| F-6 | review gate | The fail-closed read runs on every refund, doubling API calls and turning a read-side hiccup into a money-path alert; suggests a local `refunded_minor` short-circuit | **declined, with reason** — see R-1. The extra call is acknowledged in F-1's re-derivation |
| F-7 | review gate | `getFirst()` relies on unspecified list ordering while the recorded amount was a sum, so `refund_id` and `refunded_minor` could describe different refunds | fixed — dissolved by F-2's narrowing; no sum, and `getFirst()` is only reached when the list holds exactly one |
| F-8 | review gate | A summed amount above `amount_minor` trips V11's CHECK with a `DataIntegrityViolationException` that escapes the catch — the plan's R-4 mitigation was wrong | fixed — dissolved by F-2's narrowing; the CHECK is unreachable |
| F-9 | review gate | `DEAD_REFUND_STATUSES` duplicated the `"canceled"` literal already in `STATUS_CANCELED`, and only `"failed"` had test coverage — a drift to the British spelling this repo uses elsewhere would pass every test | fixed — reuses `STATUS_CANCELED`; AC-6 parameterized over both |
| F-10 | review gate | The runbook's alert trigger quoted a WARN phrasing the code never emits, so the documented signal was undetectable | fixed — runbook rewritten against the actual log lines; the mismatch case now routes to `riviera_refunds_failed_total`, whose row gained the two-shapes guidance |
| F-11 | review gate | `PaymentGateway`'s javadoc promised at-most-once, but `StubPaymentGateway` does not implement it and no conformance test forces a future adapter to | fixed as documentation — the guarantee is scoped to the collecting adapter and the gap named at the seam. R-8 |
| F-12 | review gate | `createRefundWithRecovery` copy-pasted `createIntentWithRecovery`'s replay-once shape | fixed — one generic `withLostResponseReplay` helper; both call sites differ only in the lambda |
| F-13 | review gate | The plan doc's execution status contradicted HEAD in the ways its own checklist forbids: ACs unchecked, every risk `open`, a phase commit message that did not match the commit, a missing sha | fixed — this commit |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripePaymentGateway.java` — the fix: existence read, adopt-or-create, same-key refund replay, adoption counter
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePaymentGatewayTest.java` — AC-1…AC-10
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeConfigTest.java` — the per-call vs per-refund budget correction (F-1)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorProperties.java` — same (F-1); also a claim-sweep site
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — `REFUNDS_ADOPTED` name
Claim sweep — the sites that named the idempotency key as a **sufficient** reason a replay is safe
(descriptive mentions of "idempotency-keyed", which stay true, were deliberately left alone):

- `platform/src/main/java/ai/riviera/platform/payment/api/RefundPort.java`
- `platform/src/main/java/ai/riviera/platform/payment/vocabulary/RefundResult.java`
- `platform/src/main/java/ai/riviera/platform/payment/application/PaymentGateway.java`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingRefundListener.java`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RefundExecutorProperties.java`
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundOutbox.java`
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/RefundResubmission.java`
- `platform/src/main/java/ai/riviera/platform/shared/ResubmissionThrottle.java`
- `platform/src/main/java/ai/riviera/platform/shared/ResubmissionOutcome.java`
- `RESPONSIBILITIES.md` — §`payment` gains the refund-execution rule (the relocated rationale, per `riviera-java-conventions` §6d)
- `docs/runbooks/observability.md` — `riviera.refunds.adopted`: what it means, when to chase it
- `docs/plans/refund-outbox-resubmission.md` — R-3's "closed" verdict superseded by this slice
- `docs/plans/refund-idempotency-beyond-key-window.md` — this plan

---

## Phase 0 — Adopt an existing Stripe refund instead of creating a second

**Files:** Modify `payment/adapter/out/StripePaymentGateway.java` · `shared/ObservabilityMetrics.java` · Test `payment/adapter/out/StripePaymentGatewayTest.java`

> AC-7 (the adoption counter) lands here rather than in Phase 2: it is an assertion *about the
> adopt path*, and the `MeterRegistry` constructor parameter it needs touches every construction
> site in the test class. Deferring it would churn those sites twice.

- [x] **Step 1: Write the failing tests** — AC-1 (adopt), AC-3 (fail closed), AC-6 (dead refund
      is not adopted), AC-7 (counter), plus the existing happy-path test extended to stub an empty list.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*StripePaymentGatewayTest*"`
      → FAIL: a second refund is created (AC-1), and the list is never consulted.
- [x] **Step 3: Minimal implementation** — read the intent's refunds inside the existing `try`;
      adopt a live one; otherwise create as before. *(The review gate then narrowed adoption to exactly
      one live refund for exactly the requested amount — F-2/F-7/F-8.)*
- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — does any *other* gateway call rely on the key
      alone for cross-window safety? Record the search and the answer.
- [x] **Step 6: Commit** — `git commit -m "Ask Stripe for an existing refund before creating one (#569)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Same-key immediate replay on a lost refund response

**Files:** Modify `payment/adapter/out/StripePaymentGateway.java` · Test `payment/adapter/out/StripePaymentGatewayTest.java`

- [x] **Step 1: Write the failing tests** — AC-4 (recover + record) and AC-5 (double timeout →
      `Failed`, nothing recorded, exactly two attempts).
- [x] **Step 2: Run it, verify it fails** — `--tests "*StripePaymentGatewayTest*"` → FAIL: one
      attempt only, `Failed` returned on the first timeout.
- [x] **Step 3: Minimal implementation** — a refund create mirroring the intent path. *(The review
      gate then collapsed both onto one generic `withLostResponseReplay` helper — F-12.)*
- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — record.
- [x] **Step 6: Commit** — `git commit -m "Replay a timed-out refund once inside the key window (#569)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The false-premise claim sweep + runbook

**Files:** Modify the nine claim-sweep files · `RESPONSIBILITIES.md` · `docs/runbooks/observability.md` · `docs/plans/refund-outbox-resubmission.md`

- [x] **Step 1: No new test** — this phase changes documentation only; the behavior it describes
      is already pinned by AC-1…AC-7. The verification is the regression run in Step 4.
- [x] **Step 2: Grep the false premise** — the exact phrases, recorded in the audit log.
- [x] **Step 3: Correct each claim** — mechanism, not just conclusion.
- [x] **Step 4: Run the regression** — plus the structural net
      (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`)
      and `*RefundServiceTest*`, `*RefundExecutorConfigTest*`, `*RefundOutboxScopeTest*`.
- [x] **Step 5: Generalization-audit pass** — the sweep itself; record the grep and every hit.
- [x] **Step 6: Commit** — shipped as `8507186` "Correct the replay-safety claims the key alone never supported (#569)" (the counter landed in Phase 0, so it left the subject).
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Review-gate findings (F-1…F-13)

**Files:** Modify `payment/adapter/out/StripePaymentGateway.java` · `payment/application/PaymentGateway.java` · `booking/adapter/in/RefundExecutorProperties.java` · `RESPONSIBILITIES.md` · `docs/runbooks/observability.md` · Test `payment/adapter/out/StripePaymentGatewayTest.java` · `payment/adapter/out/StripeConfigTest.java`

- [x] **Step 1: Write the failing tests** — AC-8, AC-9, AC-10 (the three defect classes the review
      found had no coverage: shortfall adoption, several/amountless refunds, an unscoped read).
- [x] **Step 2: Run them, verify they fail** — `--tests "*StripePaymentGatewayTest*"`.
- [x] **Step 3: Narrow adoption, then the rest** — one live refund for exactly the requested amount
      or `Failed("refund_mismatch")`; one shared `withLostResponseReplay`; `STATUS_CANCELED` reused;
      the per-call vs per-refund budget re-derived; the runbook and port contract corrected.
- [x] **Step 4: Run the regression** — 21 tests in `StripePaymentGatewayTest` plus the payment,
      refund-executor and structural classes → BUILD SUCCESSFUL.
- [x] **Step 5: Generalization-audit pass** — recorded below.
- [x] **Step 6: Commit** — `git commit -m "Narrow refund adoption to the one shape a lost response leaves (#569)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-09 | Phase 3 (review fixes) | Where else does "a nullable gateway field is unboxed / a non-`StripeException` escapes the adapter's catch" apply? — the shape behind F-3 and F-8 | Re-read every `catch (StripeException` block in `StripePaymentGateway` and every gateway getter it dereferences | `refund`'s catch is the only one that wrapped a *local* computation (the sum + unboxing) rather than just the Stripe call; `initiate` and `cancel` dereference `getId()`/`getClientSecret()`/`getStatus()` but pass them straight through, and `cancel` already null-guards `getStatus()` via `.equals` on the constant | Fixed `refund` by removing the computation from inside the catch's reach (no sum, explicit null refusal). Left `initiate`/`cancel` alone: a null id there flows into `register`/`markStatus` and fails as a DB error on a **synchronous request path**, which surfaces to the caller rather than wedging a replayed publication — the asymmetry that made this a defect only in the refund path |
| 2026-08-09 | Phase 2 | Every place the codebase states the idempotency key as the *reason* a refund replay is safe — the premise #569 disproved | `grep -rn "idempotency-keyed\|never double-refund\|double-refunds\|idempotency key" --include=*.java --include=*.md platform/src RESPONSIBILITIES.md docs/` | ~45 hits; **9 live-source sites** asserted *sufficiency*, the rest are descriptive ("the idempotency-keyed call", still true) or historical plan docs | Corrected the 9, each pointing at the one canonical statement now in `RESPONSIBILITIES.md` §`payment` (`riviera-java-conventions` §6d: relocate the rationale, leave a pointer). Left descriptive mentions alone — rewriting a true adjective is churn. Of the historical plan docs, only `refund-outbox-resubmission.md` R-3 was touched, because it *closed a risk* on the false premise; the others record what was believed at their time and are not corrected retroactively. **`V11__payment_refund.sql`'s comment says the same wrong thing and was deliberately NOT edited** — it is applied, and Flyway validates checksums (invariant #12) |
| 2026-08-09 | Phase 0 | Any other gateway call trusting the idempotency key alone for safety across a replay that may outlive the key window | `grep -n "IdempotencyKey\|idempotencyKey(" StripePaymentGateway.java` then `grep -rn "\.pay(\|CheckoutPort" platform/src/main/java` | 2 keyed calls: `initiate` (`booking-<id>-pi`) and `refund` (`booking-<id>-refund`); plus `cancel`, unkeyed | **Fixed `refund` only, deliberately.** `initiate` is reached only from the synchronous request path (`CreateBookingService`, `RespondToRequestService`) — no event-publication replay vehicle can re-drive it days later, and its worst case after key pruning is a second *unconfirmed* intent that Stripe auto-expires, not money leaving. `cancel` already retrieves the intent's state from Stripe before acting — the same read-before-write posture this slice gives `refund`, which is why it needed no change |

---

## Acceptance-criteria verification (final)

- [x] **AC-1…AC-10:** `gradle --no-daemon --console=plain test --tests "*StripePaymentGatewayTest*"` → BUILD SUCCESSFUL (21 tests). Verified after the review-fix commit.
- [x] **Regression:** `--tests "*StripeConfigTest*" --tests "*RefundServiceTest*" --tests "*RefundFailureMetricTest*" --tests "*RefundExecutorPropertiesTest*" --tests "*RefundExecutorConfigTest*" --tests "*RefundOutboxScopeTest*" --tests "*StubPaymentGatewayTest*" --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*JdbcOnlyArchitectureTests*"` → BUILD SUCCESSFUL.
- [x] **Repo hygiene:** both diff-scoped guards clean (`check-inline-comments.mjs`, `check-plan-file-structure.mjs`, exit 0).
- [ ] **Full suite:** CI green — **not run.** CI fires on the `pull_request` event only and no PR exists yet, so the full-suite-only failure class (shared-state beans accumulating across tests) is unproven for this branch.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified `N/A` — the refund path touches no availability row).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published-surface change (invariant #11).
- [x] **Payment/payout** section filled; webhooks still the source of truth; refund execution idempotent across the key window; money in minor units; payout exactly-once untouched (invariants #5, #8, #9).
- [x] Refund policy still enforced server-side by `booking` (invariant #10) — `payment` records, never decides.
- [x] Timezone correct (invariant #6) — no time arithmetic in this slice.
- [x] Booking codes unguessable (invariant #7) — no code is logged; only booking ids and Stripe ids.
- [x] No schema change, so no Flyway migration; **V11 left unedited** (checksum, invariant #12).
- [x] **Frontend** — `N/A`.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (F-13 was exactly this box being false).
- [x] Risk register has no stale `open` rows (R-1…R-8 all closed); Open Questions empty.
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`. **Cannot be completed yet:** no PR exists (see the stage pointer); the PR number is the one field still to fill.
- [x] **The review gate ran in full** — `/code-review` over `origin/main...HEAD` (subagent fan-out) *plus* `riviera-review-overlay`, not the overlay alone. 13 findings, all resolved in the register above.
- [ ] **Sonar gate** — **not run.** SonarCloud analyzes PRs and `main` only, so with no PR there is no new-code issue list to clear.
