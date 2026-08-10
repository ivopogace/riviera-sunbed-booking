# Refund at-most-once contract + failed-refund reconciliation Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Close the two refund-execution residuals #569 accepted — make a Stripe-reported
refund **failure** un-record the local refund (so the guest is told the truth and the money-path
alert fires), and make `PaymentGateway#refund`'s at-most-once promise a **machine-checked**
contract that a future collecting adapter cannot silently skip.

**Architecture:** The single most significant decision is that a failed refund is **recorded and
surfaced, never automatically re-driven**. Stripe fails a refund when the issuer rejects it — the
funds return to our balance and the same card often cannot receive them — so an auto-retry loop on
the money path would repeat a call that is expected to fail again. Instead the verified webhook
un-records the refund (`refunded_minor → 0`, status → `SUCCEEDED`), which makes every existing
mechanism tell the truth for free: `RefundProgress` flips back to `OUTSTANDING` (the guest-facing
half, #582), `riviera.refunds.failed` lights the money-path alert, and the gateway's own existence
read already treats a `failed` refund as dead so the next re-drive creates a fresh one. This is the
same posture §`payment` already states for `refund_mismatch`: *it will not clear itself; a human
settles it at the gateway.*

**Persistence:** JDBC only (invariant #1). One new guarded `UPDATE` on the existing `payment`
table (`JdbcPayments#markRefundFailed`). **No migration** — the un-record writes existing columns
(`refunded_minor`, `status`) to values the V11 `CHECK` already admits, so `V42` is left free.

**Source of intent:** GitHub issue #592 (both items), which records the residuals from #569
(`docs/plans/refund-idempotency-beyond-key-window.md`, risk rows **R-7** and **R-8**).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
guest-facing half needs **no** code: `ViewBookingService#refundOutstanding` already reads
`RefundProgress`, so un-recording closes it for free; and that #592 bundles two items, which PR
#590 (#568+#570) is precedent for shipping as one PR) · `riviera-plan-doc` (this template — forced
the Module-ownership table that pinned the un-record in `payment`, not `booking`) · `tdd` (every
phase is red→green; the contract test in phase 2 is written against the *port*, then a second
adapter-shaped fixture is what proves it is not Stripe-specific) · `riviera-review-overlay` (review
gate — ran at ready-for-review at **high** effort, the money-path tier; 14 findings, and the fix round re-entered at Implement through `riviera-stripe-payments` + `riviera-java-conventions` + `riviera-modulith` before any edit) · `riviera-docs-freshness` (**ran** over
`origin/main..HEAD`, 6 findings, all patched — see the Docs-freshness run below)
· `riviera-stripe-payments` (webhook-as-source-of-truth for the refund lifecycle too, and the
reminder that refund *eligibility* is server-side in `booking` — so the webhook may un-record but
must never re-decide) · `riviera-modulith` (kept the new port internal to `payment.application`
rather than widening the published `api/RefundPort`, and confirmed the counter-in-adapter shape has
precedent in `StripePaymentGateway`) · `riviera-java-conventions` (guarded typed-boolean outcome
over an exception; `PaymentStatus` constants over SQL literals; §6d kept the rationale in
`RESPONSIBILITIES.md` with a one-line Javadoc pointer) · `postgres` (the guarded single-statement
`UPDATE` — never read-then-write — and the deliberate no-index decision for `refund_id`)
· `riviera-local-debug` (scoped `--tests` runs; system `gradle` + JDK-25 toolchain in this cloud
session)

**Branch:** `claude/sdlc-592-u0n8hm` — **cloud-session substitution** for the conventional
`bugfix/refund-contract-and-failure-reconciliation`; this session's designated remote branch stands
in for it (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a payment row that records a refund (`refunded_minor > 0`, status
  `REFUNDED`), when a signature-verified refund event reports that refund id as `failed`, then the
  row is un-recorded (`refunded_minor = 0`, status `SUCCEEDED`) and `riviera.refunds.failed`
  increments by one. *Pinned by:* `StripeWebhookIT.failedRefundUnrecordsTheRefund`
- [x] **AC-2:** Given that row already un-recorded, when a second refund-failure event for the same
  refund id arrives (a distinct event id, so the dedup table does not absorb it), then no row moves
  and the counter does not increment again. *Pinned by:*
  `StripeWebhookIT.aSecondFailureForTheSameRefundMovesNothing`
- [x] **AC-3:** Given a refund event whose `Refund` is still live (`pending`, `succeeded`), when it
  arrives, then the payment row is untouched and the response is `200`. *Pinned by:*
  `StripeWebhookIT.aStillPendingRefundChangesNothing`
- [x] **AC-4:** Given a `refund.failed` payload that yields no identified `Refund`, when it arrives,
  then `UnreadableWebhookEventException` propagates (`503`) and the event-id dedup insert rolls back,
  so Stripe re-delivers — while the same payload on an **every-transition** type is consumed with a
  `200`, because a permanent retry loop there would get the shared endpoint disabled. *Pinned by:*
  `StripeWebhookIT.anUnreadableRefundEventIsNotConsumed` +
  `.aRefundEventWithoutAStatusIsNotConsumed`, against
  `.anUnreadableEveryTransitionRefundEventIsConsumed` +
  `.anUnreadableLegacyEveryTransitionRefundEventIsConsumedToo`
- [x] **AC-5:** Given a refund-failure event naming a refund id this app never recorded, when it
  arrives, then no row moves, the counter does not increment, and the response is `200`.
  *Pinned by:* `StripeWebhookIT.aFailureForAnUnknownRefundIsIgnored`
- [x] **AC-6:** Given a booking whose recorded refund was un-recorded by AC-1, when the refund
  progress is read, then it is `OUTSTANDING` (money collected, none returned) rather than
  `ACCEPTED`. *Pinned by:* `RefundServiceTest.progressIsOutstandingAfterARecordedRefundFailed`
- [x] **AC-9:** Given a refund the gateway reports `canceled` — a transition Stripe announces only on
  the every-transition types — when the event arrives, then it is un-recorded exactly as a `failed`
  one is. *Pinned by:*
  `StripeWebhookIT.aCancelledRefundIsUnrecordedThoughOnlyTheEveryTransitionTypeCarriesIt`
- [x] **AC-7:** Given a collecting `PaymentGateway` that already holds a refund for exactly the
  requested amount, when `refund` is replayed with its idempotency key assumed pruned, then exactly
  one refund exists at the gateway and the replay reports the **first** refund's id. *Pinned by:*
  `PaymentGatewayRefundContract.replayingBeyondTheKeyWindowMovesMoneyOnlyOnce` via
  `StripeRefundContractTest`
- [x] **AC-8:** Given a `PaymentGateway` implementation in production code, when it is neither
  paired with a `PaymentGatewayRefundContract` subclass nor declared non-collecting, then the
  architecture rule fails the build naming the unclassified adapter. *Pinned by:*
  `PaymentGatewayContractCoverageArchitectureTest.everyGatewayIsContractCoveredOrNonCollecting`

## Non-goals

- **Automatically re-driving a failed refund.** See *Architecture* — an issuer rejection is not a
  transient error, and the existing publication has already completed (archive completion mode), so
  a re-drive would need a *new* trigger. Recorded as R-3; the deliberate answer is the alert plus a
  human at the gateway, exactly as `refund_mismatch` already works.
- **A refund-settlement webhook beyond failure.** A refund event for a *live* refund (`pending`,
  `succeeded`) is a 200 no-op; `RefundProgress.ACCEPTED` already means "accepted, not settled" and
  this slice does not add a settled state.
- **Making `StubPaymentGateway` stateful.** #592 offered this or an exemption marker; the marker
  already exists as `payment.api.CollectionGuarantee`, so the stub is untouched.
- **Any frontend change.** The guest-facing half closes through existing wiring (see R-5).
- **A Flyway migration or an index on `refund_id`.** See *Persistence* and R-4.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. Both items are additive: a new webhook branch on types the
handler currently falls through to `default -> log.debug`, and a new test-side contract. No existing
surface is retired.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The un-record fires for a refund we did **not** record (a manual dashboard refund failing), zeroing a legitimately-recorded one | med | high | The guard keys on `refund_id = :refundId` — the exact id we stored — never on the PaymentIntent. A failure for any other refund matches 0 rows (AC-5) | this slice | closed — guarded on `refund_id`; `aFailureForAnUnknownRefundIsIgnored` + `markRefundFailedIgnoresAnUnknownRefundId` |
| R-2 | A duplicate / out-of-order refund event re-applies the un-record, double-counting the alert or reverting a *fresh* successful refund | med | high | Same single guarded statement as `markStatus`: `WHERE refund_id = … AND status IN (REFUNDED, PARTIALLY_REFUNDED)` — never read-then-write. A fresh refund's `markRefunded` overwrites `refund_id`, so a stale failure for the old id matches nothing (AC-2) | this slice | closed — one guarded statement; `aSecondFailureForTheSameRefundMovesNothing` + `aStaleFailureCannotUnrecordAFreshRefund` |
| R-3 | Nothing re-drives the refund after the un-record, so the guest stays unpaid until a human acts | high | med | **Accepted by design, not by omission** — see *Architecture* and Non-goals. The un-record is what makes the state honest: `riviera.refunds.failed` fires the money-path alert (runbook), the guest sees "refund outstanding" (AC-6), and the gateway's dead-refund read means the next re-drive creates a fresh one rather than adopting the corpse | this slice | closed — accepted by design; stated in §`payment` and in the runbook's third shape |
| R-4 | The `refund_id` lookup has no index, so the webhook path seq-scans `payment` | low | low | `payment` holds one row per booking (`UNIQUE(booking_ref)`) at 5–15 venues, and refund-failure events are rare; an index would cost a migration and a `V42` claim for a scan of a few thousand rows. Deliberate — revisit if the table grows an order of magnitude | this slice | closed — accepted; one row per booking, rare events |
| R-5 | The guest-facing half is assumed to close for free and does not | low | med | Verified at the grill, not assumed: `ViewBookingService#refundOutstanding` = booking `CANCELLED` **and** `booking.refund_minor > 0` **and** `RefundProgress.OUTSTANDING`; the un-record flips only the third term, and `booking`'s own decided amount is untouched. AC-6 pins the `payment` half | this slice | closed — verified — no `booking`/frontend change was needed; AC-6 |
| R-6 | The contract test bakes in Stripe-shaped assumptions, so it would not actually constrain the ADR-0009 Paysera adapter | med | med | The contract is written against `PaymentGateway` + `RefundResult` only; every Stripe type stays behind the subclass's `arrange…` fixture hooks. AC-8's coverage rule is what forces the next adapter to write its own subclass | this slice | closed — contract holds no Stripe type; the coverage rule was proven to fail when the subclass is detached |
| R-7 | Widening the meaning of `riviera.refunds.failed` breaks the existing alert's runbook interpretation | low | med | The counter already carries two shapes (create-failed and `refund_mismatch`), and §`payment` states its meaning as "a refund the platform owes could not be issued" — exactly true here. Runbook + metric Javadoc gain the third shape in phase 4 rather than a new unwatched counter | this slice | closed — runbook + metric doc now carry the third shape |
| R-8 | Flyway version collision with a parallel slice | none | — | No migration in this slice; `V42` is left free. Next free number on `main` is V42 and no open non-dependabot PR exists | this slice | closed — no migration |

## Open questions / Assumptions

None outstanding.

### Resolved

- **Assumption (phase 1, `a16a771`; revised at the re-review, F-23):** the refund-lifecycle event
  types are `charge.refund.updated`, `refund.updated` and `refund.failed`. **Held — but "the type
  doesn't matter, only the status" did not.** All three are handled, because `canceled` has no
  failure-only event and is announced solely on the every-transition types. What the *type* decides
  is the unreadable-payload policy: fail-closed (`503`) on `refund.failed`, fail-open (`200`) on the
  two every-transition types, whose permanent retry loop would get the shared endpoint disabled.
- **Assumption (phase 0, `12a3368`):** reverting to `SUCCEEDED` beats inventing a `REFUND_FAILED`
  status. **Held** — no money went back so the collection stands in full; `SUCCEEDED` is terminal for
  `markStatus`, so a late `payment_intent.*` event still cannot move the row; and it needs no
  migration, which is what leaves `V42` free.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path here touches `availability(set_id,
booking_date)`. The slice acts strictly on the `payment` row after a booking is already
`CANCELLED`; the claim was released by `booking`'s cancel leg long before any refund event arrives,
and nothing here re-opens or re-claims a set. The concurrency that *is* in scope is the payment
row's own — handled as a single guarded `UPDATE` (R-2), the same primitive as `markStatus`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | Owns Stripe webhook handling and the collection/refund record. The un-record is reconciliation of *its own* row from a verified webhook — its Job line verbatim |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | — | none added | — | — |

No published surface changes. `Payments#markRefundFailed` is an **internal** port
(`payment.application`, public interface / package-private `JdbcPayments` impl) — the same shape as
`markStatus`, and deliberately **not** added to the published `api/RefundPort`, which exists for
`booking` to command a refund and has no business carrying a webhook-only reconciliation method.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | — | none added | — | — | — | — |

No event is published. A failed refund changes no other module's state: `booking` already decided
and recorded the refund amount, and `payout`'s reversal is keyed on the cancellation, not on whether
the money physically landed. Publishing one would invite exactly the auto-re-drive this slice
declines (R-3).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Un-record a refund the gateway reports as failed | `payment` | `payment` Job: "reconcile payment state from signature-verified Stripe webhooks (never the client)" and it owns the refund record. **Not** `booking`: this is refund *execution* state, not the refund *decision* — `booking`'s Not-My-Job boundary is the reverse direction, and the decided `booking.refund_minor` is untouched |
| Report the refund as `OUTSTANDING` again | `payment` | Already `payment`'s published read (`api/RefundStatusLookup`, §`payment`: "answered from this module's own row"). No new capability — the existing mapping tells the truth once the row does |
| Count the failure on `riviera.refunds.failed` | `payment` | Self-observation of this module's own refund execution, the same grounds `RefundService` and `StripePaymentGateway` already hold counters on |
| Force a collecting gateway to honour at-most-once | `payment` (test scope) | The port is `payment.application.PaymentGateway`; the contract and its coverage rule are test-side fitness functions beside `NoStripeConnectArchitectureTest`, which already guards this module's adapters |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook (not the client redirect). This slice
  extends that same posture to the **refund** lifecycle — invariant #8 applied where #569's plan
  noted it was still missing (R-7 there).
- **Idempotency:** unchanged keys (`booking-<id>-refund`); webhook dedupe on event id, plus the
  guarded `UPDATE` for the un-record (R-2) so a re-delivery that clears dedup still moves nothing.
- **Money:** integer minor units, EUR. The un-record writes the literal `0`, never arithmetic.
- **Payout-ledger effect:** **none.** The reversal already happened on `BookingCancelled`; a refund
  that fails at the issuer does not restore what the venue is owed — the platform still owes the
  guest. Deliberately no `payout` interaction (invariant #9's exactly-once is untouched).
- **Refund policy applied:** none re-applied. The webhook reconciles execution state only; the
  amount `booking` decided under invariant #10 is never recomputed here.
- **Pinning tests:** `StripeWebhookIT` (AC-1…AC-5), `RefundServiceTest` (AC-6),
  `StripeRefundContractTest` (AC-7), `PaymentGatewayContractCoverageArchitectureTest` (AC-8).

## Angular — frontend surfaces touched

`N/A — backend-only.` The guest-facing half closes through existing wiring: `ViewBookingService`
already derives `refundOutstanding` from `payment.api.RefundStatusLookup`, and #582 already renders
it. No `frontend/` file changes, so no new e2e spec (the flow's coverage shipped with #582).

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO, or field is added or changed. `GET /api/bookings/{code}`
returns the same shape; only the *value* of the existing `refundOutstanding` flag can now flip back
to `true` after a failure.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `PR #593 — review gate run four times at high effort; 41 registered findings (F-1…F-41): 37 fixed here, 4 carried to issue #594's three items, 1 accepted with its limit documented on the test; re-checking CI + Sonar`

**Next action:** Confirm CI green on the third fix round and pull the Sonar new-issue list, then merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Un-record port + guarded SQL | ✅ | `12a3368` |
| 1 — Webhook refund-failure branch | ✅ | `a16a771` |
| 2 — Shared at-most-once refund contract | ✅ | `701ce5c` |
| 3 — Contract-coverage architecture rule | ✅ | `701ce5c` |
| 4 — Docs sweep + close-out | ✅ | `4a856e9` |
| 5 — Review-gate fix round | ✅ | `edec4c7` |
| 6 — Re-review fix round | ✅ | `adbb4c4` |

**Merged via PR #593.**

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Docs-freshness run** — `riviera-docs-freshness` over `origin/main..HEAD`, 6 findings, all patched:

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `RESPONSIBILITIES.md`:302 | "For the three handled types" | a fourth handled category (the refund lifecycle) | patched — "every handled type", enumerated |
| `RESPONSIBILITIES.md`:342 | "Two residuals, stated rather than implied" | both are closed by this slice | patched — rewritten as the two rules that closed them |
| `PaymentGateway.java` javadoc | at-most-once is "the collecting adapter's guarantee"; "no shared conformance test … a known gap" | `PaymentGatewayRefundContract` + the coverage rule | patched |
| `ObservabilityMetrics.REFUNDS_FAILED` | "refunds the gateway failed to issue" | a webhook-reported failure is neither a gateway refusal nor an issue-time event | patched — widened to "did not reach the guest", shapes deferred to the runbook |
| `docs/runbooks/observability.md`:40 | "**Two shapes**, and they need different responses" | the webhook-reported failure is a third | patched — third shape + its own action |
| `ProfiledCollectionGuarantee` javadoc | a third gateway's answer is "a compile-visible" obligation "that no structural test can see" | the coverage rule now sees exactly that | patched |

Not patched, deliberately: `V11__payment_refund.sql`'s header says the model works "without a refund
webhook in v1", which this slice falsifies — but Flyway checksums an applied migration's **file
content**, so editing even its comments would break every existing deployment. A shipped migration is
a historical artifact; the live statement lives in §`payment`, which is patched above.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (`Repo hygiene (diff-scoped)`, run 31361935187) | The File-structure section omitted 5 paths the diff touched — `RefundLifecycle`, the `StripePaymentGateway` edit, and the three test doubles that had to gain the new port method. Exactly the shape the template warns about: never the interesting files | fixed-in-`701ce5c` — all five listed, and the phase 2/3 files listed ahead of writing them |
| F-2 | review gate | A refund-failure event arriving before `markRefunded` commits is answered `200` and its dedup row committed, so the fact is lost permanently — unlike the PaymentIntent case whose rationale it borrowed, re-delivery genuinely could have helped here | **deferred → issue #594 item 1**, with both candidate fixes and why each is scope. The window is sub-second and a Stripe refund reaches `failed` from an issuer rejection hours later, so exposure is low; the WARN now names the booking (F-10) so the incident is reconstructable |
| F-3 | review gate | `onRefundLifecycle` decides on `refund.getStatus()` but `requiredRefund` validated only the id — a payload with no status reads as "still live" and is consumed, the exact hole `UnreadableWebhookEventException` exists to close | fixed-in-`edec4c7` — the status is required too; pinned by `StripeWebhookIT.aRefundEventWithoutAStatusIsNotConsumed` |
| F-4 | review gate | The stable `booking-<id>-refund` key defeats the documented recovery: a retry inside the ~24h window replays Stripe's original response — the dead refund — which was then re-recorded as live, reporting a guest paid who was not | fixed-in-`edec4c7` — the adapter keeps the dead ids it just listed and refuses a create that returns one (`refund_key_replay`); pinned by `StripePaymentGatewayTest.refusesTheDeadRefundAnUnexpiredKeyReplaysInsteadOfRecordingItAgain`. The contract test could not catch this — its fixture deliberately never dedupes on the key |
| F-5 | review gate | `RESPONSIBILITIES.md` and the runbook both told the operator to re-drive a publication that `completion-mode=archive` already removed — something this plan's own Non-goals conceded | fixed-in-`edec4c7` — both now say there is **no** in-app lever and why, and name the manual recovery |
| F-6 | review gate | The runbook's webhook-5xx section still listed only the three `payment_intent` types as `503` sources, so an on-call engineer would rule out the actual cause | fixed-in-`edec4c7` — a docs-freshness miss; the section now covers every handled type |
| F-7 | review gate | Stripe announces one transition under up to three types, so every real failure logged the WARN reserved for "a refund we never issued" on its 2nd and 3rd delivery — a false stranger-refund signal on every incident | fixed-in-`edec4c7` — the unmatched case is `DEBUG` and says what is actually true; the incident WARN fires once, on the delivery that moved the row |
| F-8 | review gate | Nothing recorded the Stripe-side activation: unless the endpoint subscribes to the refund event types the whole branch is inert in prod, with no test or alert that would reveal it | fixed-in-`edec4c7` — `docs/deploy/production-hardening.md` carries the subscription requirement, and the smoke test gained a forged-event check |
| F-9 | review gate | `markRefunded` is unguarded, so an un-record could write `SUCCEEDED` onto a collection that never succeeded | **deferred → issue #594 item 2** — not reachable today (a refund implies a confirmed booking), and guarding it changes #569's contract and its tests |
| F-10 | review gate | After the un-record the row is indistinguishable from a never-refunded one, but the runbook's remedy needs the list of bookings owed money | **partly fixed-in-`edec4c7`** (the WARN names the booking, so the incident is reconstructable from logs) **/ deferred → issue #594 item 3** for a queryable column, which needs a migration |
| F-11 | review gate | `StripeRefundContractTest` re-implemented the `Refund`/list-page builders `StripePaymentGatewayTest` already owned in the same package, so the two would drift on the SDK's shape | fixed-in-`edec4c7` — a shared `StripeRefunds` helper; each test keeps its own mock wiring, which is where they genuinely differ |
| F-12 | review gate | The coverage rule re-streamed every production class and reflectively re-instantiated a guarantee once per gateway | fixed-in-`edec4c7` — the profile→answer map is built once |
| F-13 | review gate | Coverage is proven by a bare dependency edge, so a subclass that merely names an adapter satisfies the rule | **accepted, limit documented on the test** — statically this cannot go further; what it buys is that a new adapter cannot arrive with no contract at all |
| F-14 | review gate | `profileOf` read only the first `@Profile` value, so the gateway↔guarantee match depended on annotation array order and would fail with a misdirecting message | fixed-in-`edec4c7` — compared as sets |
| F-15 | re-review of the fix round | The create path checked the *replayed* refund's id but never the created refund's own **status**, so a refund Stripe answers as already `failed` was recorded as a success — the symmetric guard was missing, and the two checks catch disjoint cases | fixed-in-`adbb4c4` — `refund_returned_nothing`; pinned by `StripePaymentGatewayTest.doesNotRecordARefundStripeAnswersAsAlreadyDead` |
| F-16 | re-review of the fix round | Requiring a status on `refund.updated` made an unreadable payload on a **high-volume, advisory** type a permanent `503` for the whole endpoint — and Stripe disables an endpoint that keeps failing, which would take the payment spine down with it (invariant #2/#8) | fixed-in-`adbb4c4` — `refund.updated` is no longer handled at all. It announces every transition, so it duplicated each failure without adding one; `refund.failed` and the legacy `charge.refund.updated` are the authoritative pair. This also halves F-7's duplicate deliveries |
| F-17 | re-review of the fix round | The class javadoc still asserted *every* outcome goes through `markStatus`, which the refund branch does not — it uses the mirror-image guard and publishes no event | fixed-in-`adbb4c4` |
| F-18 | re-review of the fix round | The deploy doc's new blockquote was inserted **inside** the secrets table, so GFM lazy continuation swallowed the two rows below it — including `RIVIERA_OPERATOR_PASSWORD` — into the quote | fixed-in-`adbb4c4` — moved below the closing row, with the blank line the parser needs |
| F-19 | re-review of the fix round | `bookingOf` ran a query before knowing whether anything moved, feeding two `debug` lines; the two-branch helper existed only to choose between two disabled strings | fixed-in-`adbb4c4` — one debug line, and the read happens only on the branch that reports an incident |
| F-20 | re-review of the fix round | `HashMap#put` let two `CollectionGuarantee`s on one profile silently overwrite each other, so classpath order could decide whether the collecting adapter is exempt | fixed-in-`adbb4c4` — a conflicting answer fails the build; `Set.of` swapped for a collector so a repeated `@Profile` value cannot throw instead |
| F-21 | re-review of the fix round | `riviera.refunds.failed` now increments from two sites and a stuck refund re-increments on every resubmission, so "any increase" cannot mean "N new failures" | **fixed as documentation** — the runbook says to read the delta as *something is owed*, never as a count of distinct refunds, and points at the WARN lines for the which |
| F-22 | re-review of the fix round | The race (F-2) is wider than first estimated — `withLostResponseReplay` can spend 20–45s on a read timeout between Stripe minting the refund and the row being written | **carried to issue #594** — F-15's guard closes the instant-fail half of it; the timeout half remains, and #594 now also records that a blanket `503` is *not* an available fix, since a permanently-failing endpoint gets disabled and takes the payment spine with it |
| F-23 | 2nd re-review | Dropping `refund.updated` orphaned the `canceled` half of `returnedNoMoney`: Stripe has no `refund.canceled`, so a cancelled refund would never be un-recorded on a modern account — a hole F-16 opened | fixed-in-`37f1b76` — all three types handled again, with the fail-open policy applied to the every-transition pair instead of dropping them; pinned by `aCancelledRefundIsUnrecordedThoughOnlyTheEveryTransitionTypeCarriesIt` |
| F-24 | 2nd re-review | F-16's endpoint-disabling `503` was still open on `charge.refund.updated`, which is the same every-transition advisory type — the blast radius was narrowed to legacy accounts, not closed | fixed-in-`37f1b76` — the policy is now per-type rather than per-subscription; pinned by `anUnreadableEveryTransitionRefundEventIsConsumed` |
| F-25 | 2nd re-review | `RESPONSIBILITIES.md`, the runbook's 5xx list, and this plan's Resolved-assumption block all stated the reversed rule ("branched on the status, never the event type") | fixed-in-`37f1b76` — all three now describe the two-tier policy |
| F-26 | 2nd re-review | `refund_returned_nothing` and `refund_key_replay` had no entry in the runbook's failure-reason vocabulary, though they need different remedies from the others | fixed-in-`37f1b76` |
| F-27 | 2nd re-review | No test pinned the actual point of the last round — that an *unreadable* every-transition payload answers `200`; re-adding the type to the fail-closed branch would have left every test green | fixed-in-`37f1b76` |
| F-28 | 2nd re-review | The born-dead branch re-spelled `isLive`'s expression instead of calling it, and its WARN omitted the refund id — the only link between the incident and the refund object left at Stripe | fixed-in-`37f1b76` |
| F-29 | 2nd re-review | Rewriting the live-refund test to `succeeded` removed the only webhook-path coverage of `pending`, the status the whole adoption rule turns on; and the duplicate-delivery test modelled a pair no single account receives | fixed-in-`37f1b76` — `pending` restored, and the duplicate is the realistic `refund.failed` → `refund.updated` |
| F-30 | 2nd re-review | The clash guard accepted *agreeing* duplicate profile bindings and its message named the wrong winner | fixed-in-`37f1b76` — any duplicate fails, message corrected |
| F-31 | 2nd re-review | The stage pointer's tallies did not reconcile with the register it summarises | fixed-in-`37f1b76` — counted from the rows |
| F-32 | 3rd re-review | The deploy doc still told operators `refund.updated` is deliberately **not** subscribed — the very type that carries `canceled` — so F-23's fix would have been inert in prod | fixed-in-`1226d7c` — all three types, with the reason stated |
| F-33 | 3rd re-review | The class javadoc still stated the absolute fail-closed rule, so a maintainer would read the fail-open branch as the bug and "fix" it back | fixed-in-`1226d7c` |
| F-34 | 3rd re-review | The fail-open WARN claimed "the failure-only type carries the same fact" — false for `canceled`, the one incident where that line matters | fixed-in-`1226d7c` — it now says a re-announcement is the only recovery, and names the refund id when the payload yielded one |
| F-35 | 3rd re-review | The runbook's "deliberate rollback, so Stripe re-delivers" clause was left dangling off the new fail-open sentence, and the failed-refunds cell still promised "three shapes" while listing five with a stale ordinal | fixed-in-`1226d7c` |
| F-36 | 3rd re-review | `readableRefund` re-implemented `required`/`requiredRefund`'s cast and null checks, so "a readable refund" had two definitions to keep in step | fixed-in-`1226d7c` — one `refundOf` + one `isActionable`; the per-type *policy* lives only at the switch |
| F-37 | 3rd re-review | The new javadoc was ten lines of rationale duplicated from `RESPONSIBILITIES.md` §`payment` — the archaeology `riviera-java-conventions` §6d bans | fixed-in-`1226d7c` — trimmed to the contract plus the §`payment` pointer the sibling gateway already uses |
| F-38 | 3rd re-review | F-24's pin only exercised `refund.updated`, so moving `charge.refund.updated` back to the fail-closed branch left every test green — the regression class F-27 was raised to prevent | fixed-in-`1226d7c` — the legacy twin has its own pin |
| F-39 | 3rd re-review | The `canceled` test asserted only the status, not `refunded_minor` (the guest-facing half) or the counter (the alert) | fixed-in-`1226d7c` |
| F-40 | 3rd re-review | AC-4 was ticked while asserting the rule the fail-open tier reverses, and AC-3 pinned a test method renamed two rounds earlier | fixed-in-`1226d7c` — AC-4 states both tiers with all four pins; AC-9 added for the `canceled` path |
| F-41 | 3rd re-review | The spliced `RESPONSIBILITIES.md` sentence left a 121-char line in a ~100-wrapped file | fixed-in-`1226d7c` |

---

## File structure

- `docs/plans/refund-contract-and-failure-reconciliation.md` — this plan
- `platform/src/main/java/ai/riviera/platform/payment/application/Payments.java` — the
  `markRefundFailed` port method
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/JdbcPayments.java` — the guarded
  `UPDATE`
- `platform/src/main/java/ai/riviera/platform/payment/adapter/in/StripeWebhookController.java` —
  the refund-lifecycle branch, the shared event-payload reader, the failure counter
- `platform/src/main/java/ai/riviera/platform/payment/domain/RefundLifecycle.java` — the
  dead-refund-status predicate, so the create path and the webhook path cannot drift apart
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/StripePaymentGateway.java` —
  reads the predicate from `RefundLifecycle` instead of its own copy; the residual its Javadoc named
  is now closed
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — the third shape
  on `REFUNDS_FAILED`'s doc
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/JdbcPaymentsIT.java` — phase 0
- `platform/src/test/java/ai/riviera/platform/payment/adapter/in/StripeWebhookIT.java` — AC-1…AC-5
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundServiceTest.java` — AC-6
- `platform/src/test/java/ai/riviera/platform/payment/application/ThrowingPayments.java` — the new
  port method on the throwing double
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentServiceTest.java` — the
  same, on its inline `Payments` stub
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the same, plus the
  `MeterRegistry` the web slice carries no auto-configuration for
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentGatewayRefundContract.java`
  — the port-level at-most-once contract (abstract)
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeRefundContractTest.java` —
  the Stripe binding of the contract (AC-7)
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripeRefunds.java` — the shared
  `Refund`/list-page builders both refund tests use (review finding F-11)
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/StripePaymentGatewayTest.java` — the
  key-replay case (F-4); its builders now delegate to `StripeRefunds`
- `docs/deploy/production-hardening.md` — the Stripe webhook event-subscription requirement (F-8)
- `docs/runbooks/stripe-profile-smoke-test.md` — a forged refund-failure check (F-8)
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/PaymentGatewayContractCoverageArchitectureTest.java`
  — AC-8; in the adapter package (not the module root the plan first named) so the package-private
  gateways and `CollectionGuarantee`s are nameable, the same grounds
  `MailListenerExecutorArchitectureTest` sits in `notification.adapter.in`
- `platform/src/main/java/ai/riviera/platform/payment/application/PaymentGateway.java` — the
  at-most-once javadoc, which named the missing conformance test this slice writes
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/ProfiledCollectionGuarantee.java` —
  its "no structural test can see" contrast, now that one does
- `RESPONSIBILITIES.md` — §`payment`: the two residuals become the two rules that closed them
- `docs/runbooks/observability.md` — the `riviera_refunds_failed_total` row gains the third shape

`CLAUDE.md` is deliberately **not** in this list: its `payment` row states the module's job
("Stripe collection, PaymentIntents, refunds, webhook handling"), which this slice does not change —
the residuals were only ever stated in `RESPONSIBILITIES.md`.

---

## Phase 0 — Un-record port + guarded SQL

**Files:** Modify `payment/application/Payments.java` · `payment/adapter/out/JdbcPayments.java` ·
Test `payment/adapter/out/JdbcPaymentsIT.java`

- [x] **Step 1: Write the failing test** — `markRefundFailedUnrecordsARecordedRefund` (row with
  `refunded_minor > 0` + `REFUNDED` → `true`, row reads `0` / `SUCCEEDED`),
  `markRefundFailedIsGuarded` (already-`SUCCEEDED` row → `false`, nothing moves), and
  `markRefundFailedIgnoresAnUnknownRefundId` (→ `false`).
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*JdbcPaymentsIT*"` → FAIL
  (method does not exist).
- [x] **Step 3: Minimal implementation** — `boolean markRefundFailed(String refundId)` on
  `Payments`; in `JdbcPayments`, one statement:
  `UPDATE payment SET refunded_minor = 0, status = :succeeded, updated_at = NOW() WHERE refund_id = :refundId AND status IN (:recorded)`
  with `:recorded` built from `PaymentStatus.REFUNDED`/`PARTIALLY_REFUNDED` (no SQL literals, §6a).
- [x] **Step 4: Run it, verify it passes** → PASS.
- [x] **Step 5: Generalization-audit pass** — search for other places that write `refunded_minor`.
- [x] **Step 6: Commit** — `git commit -m "Un-record a refund the gateway reports as failed (#592)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Webhook refund-failure branch

**Files:** Modify `payment/adapter/in/StripeWebhookController.java` · Test
`payment/adapter/in/StripeWebhookIT.java` · `payment/application/RefundServiceTest.java`

- [x] **Step 1: Write the failing tests** — AC-1…AC-6.
- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*StripeWebhookIT*"` → FAIL.
- [x] **Step 3: Minimal implementation** — extract the existing `deserializeUnsafe` fallback into
  one `dataObject(Event)` helper feeding both the `PaymentIntent` and the new `Refund` accessor
  (no copy of the #569 F-12 shape); add the refund-event branch: dead status → `markRefundFailed`
  + `REFUNDS_FAILED` when it applied; live status → no-op `200`; unreadable payload →
  `UnreadableWebhookEventException`.
- [x] **Step 4: Run it, verify it passes** → PASS; then broaden to `--tests "*payment*"`.
- [x] **Step 5: Generalization-audit pass** — does any other handler branch consume a verified fact
  it cannot read?
- [x] **Step 6: Commit** — `git commit -m "Reconcile a failed refund from its verified webhook (#592)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Shared at-most-once refund contract

**Files:** Create `payment/application/PaymentGatewayRefundContract.java` ·
`payment/adapter/out/StripeRefundContractTest.java`

- [x] **Step 1: Write the failing test** — the abstract contract (AC-7) plus the Stripe binding,
  whose fixture makes `refunds().create` mint a *fresh* id if called a second time, so a regression
  to key-only idempotency fails loudly.
- [x] **Step 2: Run it, verify it fails** — deliberately, by stubbing the fixture before the
  subclass exists → FAIL.
- [x] **Step 3: Minimal implementation** — the fixture hooks (`gateway()`, `arrangeCollection()`,
  `arrangeKeyWindowExpired()`, `refundsCreatedAtGateway()`), Stripe-typed only in the subclass.
- [x] **Step 4: Run it, verify it passes** → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Pin at-most-once refunds as a port contract, not one adapter's habit (#592)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Contract-coverage architecture rule

**Files:** Create `payment/PaymentGatewayContractCoverageArchitectureTest.java`

- [x] **Step 1: Write the failing test** — AC-8: every production `PaymentGateway` implementation is
  either contract-covered or declared non-collecting, and every non-collecting declaration is
  justified by a `CollectionGuarantee` answering `false`.
- [x] **Step 2: Run it, verify it fails** — assert against a deliberately-unclassified name first.
- [x] **Step 3: Minimal implementation** — the rule over `ArchitectureTestSupport.productionClasses()`.
- [x] **Step 4: Run it, verify it passes** → PASS; broaden to the arch-test set.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Fail the build on a gateway that honours no refund contract (#592)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — Docs sweep + close-out

**Files:** Modify `RESPONSIBILITIES.md` · `CLAUDE.md` · `docs/runbooks/` ·
`docs/plans/refund-idempotency-beyond-key-window.md` (R-7/R-8 pointers) · this plan

- [x] **Step 1:** Run `riviera-docs-freshness` over the branch range.
- [x] **Step 2:** Rewrite §`payment`'s "Two residuals" paragraph as the two rules that closed them.
- [x] **Step 3:** Run `node scripts/check-plan-file-structure.mjs --diff origin/main` and
  `node scripts/check-inline-comments.mjs --diff origin/main`.
- [x] **Step 4: Commit** — `git commit -m "Record the closed refund residuals in the substrate docs (#592)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | phase 0 | every writer of `refunded_minor`, to be sure the un-record is the only new one and no other path can strand the column | `grep -rn "refunded_minor" platform/src/main --include=*.java --include=*.sql` | 2 writers (`markRefunded`, the new `markRefundFailed`), both in `JdbcPayments`; the rest are the V11 DDL and Javadoc | no further sites — the column has exactly one writer pair, which is what makes the guard on `refund_id` sufficient |
| 2026-08-10 | phase 1 | the "which refund statuses returned no money" predicate, which the new webhook branch needed and `StripePaymentGateway#isLive` already had | `grep -rn "DEAD_REFUND_STATUSES\|getStatus()" platform/src/main/java/ai/riviera/platform/payment` | 2 sites, one per adapter, needing the **same** direction (an unknown status must never license either creating a second refund or un-recording one) | extracted `payment.domain.RefundLifecycle#returnedNoMoney` and pointed both adapters at it, rather than copying the set into `adapter/in` |
| 2026-08-10 | phase 1 | other handler branches that could consume a verified fact they cannot read | read of `StripeWebhookController`'s switch after the refactor | all 4 handled types now route through the one `required(event, type)` helper; the `default` arm stays a `200` by design (no fact to lose) | no further sites — the rule has one home instead of one per branch |

---

## Acceptance-criteria verification (final)

- [x] **AC-1…AC-5:** `gradle test --tests "*StripeWebhookIT*"` → PASS. Verified at `4a856e9`.
- [x] **AC-6:** `gradle test --tests "*RefundServiceTest*"` → PASS. Verified at `4a856e9`.
- [x] **AC-7:** `gradle test --tests "*StripeRefundContractTest*"` → PASS. Verified at `4a856e9`.
- [x] **AC-8:** `gradle test --tests "*PaymentGatewayContractCoverage*"` → PASS. Verified at `4a856e9`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified N/A — no availability write path).
- [x] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no published
      surface widened (invariant #11).
- [x] **Payment/payout** section filled; webhooks are source of truth; idempotent; money in minor
      units; payout untouched (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — not re-decided here.
- [x] Timezone correct: UTC stored (invariant #6).
- [x] Booking codes unguessable (invariant #7) — no code logged on the new paths.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented — N/A, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
