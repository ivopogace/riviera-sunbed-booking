# Cross-module domain events (the write-side spine)

Events are how modules integrate on the write side and how would-be cycles are broken. The
originating module announces a fact; it does not know or care who listens. In this project the spine
is: **`BookingConfirmed`** → `availability` marks the set `BOOKED_ONLINE` *and* `payout` accrues a
ledger entry; **`BookingCancelled`** → `availability` frees the set + `payment` refunds (invariant
#9/#10). U3 uses a synchronous `api/` port for the claim. **U4** (#8) introduced the *first* event
seam — `payment` → `booking` (`PaymentConfirmed`/`PaymentCanceled`) — as a **synchronous,
in-transaction** listener (no registry; see "Synchronous in-transaction events" below). The
**asynchronous, registry-backed spine** (`@ApplicationModuleListener` + Event Publication Registry)
**lands in U5**.

## Where events live and the id-only payload rule

Published event records are part of the module's **published surface → put them in `<module>.api`**
(the `@NamedInterface("api")` package), so subscribers depend on `<module>::api` like any other api
type. **Payloads carry typed ids and value data only — never aggregate objects** (invariant #11):

```java
// ai.riviera.platform.booking.api  (already @NamedInterface("api"))
public record BookingConfirmed(BookingId bookingId, SetId setId, VenueId venueId,
                               LocalDate bookingDate) {}
```

Why ids, not aggregates:
- The listener is in another module and must not depend on `booking`'s internal aggregate.
- An async listener runs after commit; the aggregate may have changed — an id forces the listener to
  re-load current state through its own `api/` port if it needs more.
- It keeps the payload serializable and stable for the Event Publication Registry (and any future
  broker externalization).

(If a module accumulates many event types, a dedicated `@NamedInterface("events")` sub-package is a
reasonable refinement — but our default is to keep published records in the single `api` interface,
consistent with how typed ids and DTOs already live there.)

## Publishing

Publish from inside the module — typically the application service implementing the inbound port —
using `ApplicationEventPublisher`, **after** the aggregate reaches its new state (and, for the spine,
after the claim/persist succeed within the same transaction that the registry will tie delivery to).

```java
publisher.publishEvent(new BookingConfirmed(bookingId, setId, venueId, bookingDate));
```

## Listening

Use **`@ApplicationModuleListener`** in the *listening* module's `infrastructure/in`. It is
`@Async` + `@Transactional` + `@TransactionalEventListener(AFTER_COMMIT)` — runs **after** the
publisher commits, in its **own** transaction, asynchronously. A consumer failure does not roll back
the producer.

```java
// ai.riviera.platform.availability.infrastructure.in
@Component
class BookingConfirmedListener {

    private final AvailabilityClaim availability;   // this module's own seam

    @ApplicationModuleListener
    void on(BookingConfirmed event) {
        // act on ids only; re-load via a port if more is needed
        availability.markBookedOnline(event.setId(), event.bookingDate());
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
// publisher — ai.riviera.platform.payment.infrastructure.in.StripeWebhookController (inside @Transactional)
publisher.publishEvent(new PaymentConfirmed(bookingRef, paymentIntentId));   // payment.api record

// listener — ai.riviera.platform.booking.infrastructure.in.PaymentEventListener
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
| Use when | the producer *should* fail if the consumer can't apply, and an external retry exists | fan-out that must not block/aborting the producer (payout accrual, availability re-mark) |

Default to **async `@ApplicationModuleListener`** for write-side fan-out (the spine). Reach for the
**sync `@EventListener`** only to break a cycle where the producer and consumer genuinely belong in
one transaction and an external retry (a re-delivered webhook) supplies the reliability.

## Event Publication Registry (reliability on JDBC, no broker)

`spring-modulith-starter-jdbc` is already on the classpath. It persists every event before delivery
and marks it complete after the listener succeeds; incomplete publications are re-submitted on
restart — **at-least-once with only a database table, no Kafka**.

- It contributes its own schema — add it as a Flyway migration when the spine lands (invariant #12),
  don't rely on auto-DDL.
- `spring.modulith.events.completion-mode`: `UPDATE` (default, rows kept + marked done), `DELETE`
  (removed on completion), or `ARCHIVE`. Prefer `DELETE`/`ARCHIVE` to avoid unbounded growth unless
  completed-event history is wanted.

## When NOT to use an event

If the caller needs an answer **now** — a query, or a command whose result it must act on in the same
transaction — use an inbound `api/` port instead. That is exactly why the U3 reservation **claim** is
a synchronous `availability.api.AvailabilityClaim` call, not an event: `booking` must know the
`ClaimOutcome` to decide 201 vs 409 (invariant #2). Events are for "this happened," not "tell me X
now."
