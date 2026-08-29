# Cross-module domain events (the write-side spine)

Events are how modules integrate on the write side and how would-be cycles are broken. The
originating module announces a fact; it does not know or care who listens. The spine is
**CLAUDE.md's five-event inventory** (canonical there): `BookingConfirmed`/`BookingCancelled`
fan out to `payout` and `notification` — with `booking`'s **own** `BookingCancelled` listener
(`BookingRefundListener`) driving `payment`'s `RefundPort` (invariant #9/#10) — and
`BookingPaymentDue`/`BookingRequestDeclined`/`BookingRequestExpired` go to `notification` only.
`availability` has **no event listener**: the `(set, date)` row is
claimed at reserve time and released on cancel synchronously through its `api/` port
(`AvailabilityClaim.claim/release` — U3, invariant #2), so confirmation changes nothing in its table. **U4** (#8) introduced the *first* event
seam — `payment` → `booking` (`PaymentConfirmed`/`PaymentCanceled`) — as a **synchronous,
in-transaction** listener (no registry; see "Synchronous in-transaction events" below). The
**asynchronous, registry-backed spine** (`@ApplicationModuleListener` + Event Publication Registry)
**landed with U5** (registry schema Flyway-owned: `V8__event_publication_registry.sql`).

## Where events live and the id-only payload rule

Published event records are part of the module's published surface → **put them in
`<module>.events`** (a top-level `@NamedInterface("events")` package — issue #95), so a
listener-only subscriber depends on `<module>::events` (+ `<module>::vocabulary` for the ids the
payload carries) and never on the module's command ports. Placement is enforced by
`PublishedSurfacePlacementArchitectureTests` (events surfaces hold records only; a cross-module
`@ApplicationModuleListener` parameter must live in its owner's events surface). **Payloads carry
typed ids and value data only — never aggregate objects** (invariant #11):

```java
// ai.riviera.platform.booking.events  (@NamedInterface("events"))
public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {}
```

Note what the real payload carries: typed ids plus the **immutable value facts** of the booking
(gross amount, currency, and since #795 the cancellation window and late-cancel share captured at
birth — facts fixed at the moment, for the mail disclosure). What it deliberately does *not* carry
is mutable configuration — the
commission rate is re-read from `venue::api` by the listener, because the rate can change while the
event sits in the registry.

> **Moving/renaming a published event changes its persisted FQCN** in the Event Publication
> Registry — BOTH `event_type` and the default `listener_id` (which embeds the parameter type)
> in `event_publication` *and* `event_publication_archive`. Ship a Flyway rewrite like
> `V18__event_publication_event_type_moves.sql` with any such move, or outstanding publications
> dead-letter on the post-deploy republish.

Why ids, not aggregates:
- The listener is in another module and must not depend on `booking`'s internal aggregate.
- An async listener runs after commit; the aggregate may have changed — an id forces the listener to
  re-load current state through its own `api/` port if it needs more.
- It keeps the payload serializable and stable for the Event Publication Registry (and any future
  broker externalization).

## Publishing

Publish from inside the module — typically the application service implementing the inbound port —
using `ApplicationEventPublisher`, **after** the aggregate reaches its new state (and, for the spine,
after the claim/persist succeed within the same transaction that the registry will tie delivery to).

```java
publisher.publishEvent(new BookingConfirmed(bookingId, venueId, setId, bookingDate, amountMinor,
		currency, windowAtBirth, lateCancelRefundBps));
```

## Listening

Use **`@ApplicationModuleListener`** in the *listening* module's `adapter/in`. It is
`@Async` + `@Transactional` + `@TransactionalEventListener(AFTER_COMMIT)` — runs **after** the
publisher commits, in its **own** transaction, asynchronously. A consumer failure does not roll back
the producer.

```java
// ai.riviera.platform.payout.adapter.in — the real spine listener (U5, #9)
@Component
class BookingConfirmedPayoutListener {

    private final PayoutLedger ledger;   // this module's own seam
    private final VenueRates venues;     // venue::api — re-read mutable config, don't event it

    @ApplicationModuleListener
    void on(BookingConfirmed event) {
        int commissionBps = venues.commissionBps(event.venueId()).orElseThrow(...);
        ledger.accrue(PayoutLedgerEntry.accrual(event, commissionBps));  // idempotent upsert
    }
}
```

Because delivery is async/`AFTER_COMMIT`, **listeners must be idempotent** — invariant #9 requires
payout to accrue **exactly once** per booking even if an event is redelivered. Dedupe on the
`BookingId` (e.g. an upsert / a unique ledger key), don't assume single delivery.

## Synchronous in-transaction events (the U4 variant — no registry)

Sometimes you want an event to **break a cycle** but still run **inside the publisher's transaction**,
without the async machinery or the registry. That is what **U4** (#8) does: the Stripe webhook arrives
in `payment`, which must tell `booking` to confirm — but `payment` cannot call `booking` (a direct
call cycles: `booking` already depends on `payment::api`). So `payment` **publishes** and `booking`
**listens with a plain `@EventListener`**:

```java
// publisher — ai.riviera.platform.payment.adapter.in.StripeWebhookController (inside @Transactional)
publisher.publishEvent(new PaymentConfirmed(bookingRef, paymentIntentId));   // payment.events record

// listener — ai.riviera.platform.booking.adapter.in.PaymentEventListener
@Component
class PaymentEventListener {
    @EventListener                                  // SYNC: runs in the publisher's thread + transaction
    void on(PaymentConfirmed event) {
        bookings.confirmFromPayment(event.bookingRef().value(), clock.instant());  // idempotent (guarded UPDATE)
    }
}
```

`@EventListener` (plain) fires **synchronously** when `publishEvent` is called, on the same thread,
joined to the publisher's `@Transactional` unit. So:

- **It does not use the Event Publication Registry** — nothing is persisted, no Flyway registry table.
- **Atomic with the publisher:** if the listener throws, the *whole* webhook transaction rolls back
  (including the dedup-insert), so the caller sees a failure and **Stripe re-delivers** — at-least-once
  via the webhook's own retry, not the registry.
- Still **must be idempotent** (Stripe re-delivers): U4 dedupes on the Stripe event id **and** guards
  the transition (`UPDATE … WHERE status = 'AWAITING_PAYMENT'`), so a re-delivery is a no-op.

**Choose sync `@EventListener` vs async `@ApplicationModuleListener`:**

| | `@EventListener` (sync, U4) | `@ApplicationModuleListener` (async, U5) |
|---|---|---|
| Runs | publisher's thread + transaction | own thread + own transaction, `AFTER_COMMIT` |
| Failure | rolls back the publisher | does **not** roll back the publisher |
| Reliability | caller retries (here: Stripe re-delivers) | Event Publication Registry re-submits on restart |
| Needs registry / Flyway table | no | yes |
| Use when | the producer *should* fail if the consumer can't apply, and an external retry exists | fan-out that must not block/abort the producer (payout accrual/reversal, the refund kick-off) |

Default to **async `@ApplicationModuleListener`** for write-side fan-out (the spine). Reach for the
**sync `@EventListener`** only to break a cycle where the producer and consumer genuinely belong in
one transaction and an external retry (a re-delivered webhook) supplies the reliability.

## Event Publication Registry (reliability on JDBC, no broker)

`spring-modulith-starter-jdbc` is already on the classpath. It persists every event before delivery
and marks it complete after the listener succeeds; incomplete publications are re-submitted on
restart — **at-least-once with only a database table, no Kafka**.

- It contributes its own schema — Flyway-owned (`V8__event_publication_registry.sql`, invariant
  #12), never auto-DDL.
- `spring.modulith.events.completion-mode` is **decided: `archive`** (`application.properties`) —
  completed publications move to `event_publication_archive`, keeping the live table small while
  retaining the audit trail (which is why `V18` rewrites archive rows too on an event move).

## When NOT to use an event

If the caller needs an answer **now** — a query, or a command whose result it must act on in the same
transaction — use an inbound `api/` port instead. That is exactly why the U3 reservation **claim** is
a synchronous `availability.api.AvailabilityClaim` call, not an event: `booking` must know the
`ClaimOutcome` to decide 201 vs 409 (invariant #2). Events are for "this happened," not "tell me X
now."
