# Cross-module domain events

The spine is CLAUDE.md's event inventory. `BookingConfirmed`/`BookingCancelled` fan out to
`payout`, `notification`, and `booking`'s own `BookingRefundListener` (drives `RefundPort`)
and `RemodelReleasePaymentListener` (voids an uncollected intent via `CancelPaymentPort`).
`ReviewsChanged` → `venue`, whose listener recomputes its rating from a full re-read, not the
payload. `availability` has no listener — claim/release is the synchronous
`AvailabilityClaim` port (#2). `payment` → `booking` (`PaymentConfirmed`/`PaymentCanceled`) is
a synchronous in-transaction listener.

## Placement and payload

Event records live in `<module>.events` (`@NamedInterface("events")`), so a subscriber depends
on `<module>::events` + `::vocabulary`, never on command ports. Payloads carry typed ids and
immutable value facts only (#11):

```java
// ai.riviera.platform.booking.events
public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {}
```

Facts fixed at the moment (amount, window at birth) ride in the payload; mutable configuration
(the commission rate) does not — the listener re-reads it via `venue::api`, because it can
change while the event sits in the registry.

> Moving or renaming a published event changes the persisted FQCN in `event_publication` and
> `event_publication_archive` (`event_type` and the default `listener_id`). Ship a Flyway
> rewrite like `V18__event_publication_event_type_moves.sql`, or outstanding publications
> dead-letter after deploy.

## Publishing and listening

Publish from the application service via `ApplicationEventPublisher` after the state change,
inside the transaction. Listen with `@ApplicationModuleListener` in the subscriber's
`adapter/in` (= `@Async` + `@Transactional` + `@TransactionalEventListener(AFTER_COMMIT)`):

```java
// ai.riviera.platform.payout.adapter.in
@Component
class BookingConfirmedPayoutListener {
    private final PayoutLedger ledger;
    private final VenueRates venues;     // venue::api — re-read mutable config

    @ApplicationModuleListener
    void on(BookingConfirmed event) {
        int commissionBps = venues.commissionBps(event.venueId()).orElseThrow(...);
        ledger.accrue(PayoutLedgerEntry.accrual(event, commissionBps));  // idempotent upsert
    }
}
```

Listeners must be idempotent (dedupe on `BookingId`): the registry re-delivers.

## Synchronous in-transaction events

To break a cycle while staying in the publisher's transaction (`payment` cannot call `booking`,
which depends on `payment::api`): `payment` publishes `PaymentConfirmed` from the webhook
controller inside `@Transactional`; `booking.adapter.in.PaymentEventListener` listens with a
plain `@EventListener` and calls `confirmFromPayment(...)` (guarded `UPDATE … WHERE status =
'AWAITING_PAYMENT'`). If the listener throws, the whole webhook transaction rolls back and
Stripe re-delivers. Still idempotent: dedupe on the Stripe event id.

| | `@EventListener` (sync) | `@ApplicationModuleListener` (async) |
|---|---|---|
| Runs | publisher's thread + transaction | own thread + transaction, `AFTER_COMMIT` |
| Failure | rolls back the publisher | does not |
| Reliability | external retry (Stripe) | Event Publication Registry re-submits on restart |
| Use when | producer must fail if consumer can't apply, and an external retry exists | fan-out that must not block the producer |

Default to async. The registry (`spring-modulith-starter-jdbc`) persists every event before
delivery; its schema is Flyway-owned (`V8__event_publication_registry.sql`), and
`spring.modulith.events.completion-mode=archive` moves completed rows to
`event_publication_archive`.

**Not an event:** when the caller needs an answer now (a query, or a command whose result it
acts on in the same transaction) — use an `api/` port.
