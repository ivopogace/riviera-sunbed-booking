# Cross-module domain events

The spine is CLAUDE.md's event inventory. Its refund and intent-void listeners are `booking`'s
`BookingRefundListener` and `BookingDayRefundListener` (drive `RefundPort`) and `RemodelReleasePaymentListener` (voids an
uncollected intent via `CancelPaymentPort`); `venue`'s `ReviewsChanged` listener recomputes the
rating from a full re-read, not the payload.

## Payload

Typed ids and immutable value facts only (#11). Facts fixed at the moment (amount, window at
birth) ride in the payload (`BookingConfirmed`); mutable configuration (the commission rate)
does not — the listener re-reads it via `venue::api` (`BookingConfirmedPayoutListener`),
because it can change while the event sits in the registry.

> Every registry listener declares an explicit id (`@ApplicationModuleListener(id = "<module>.<what>-on-<event>")`
> or `@TransactionalEventListener(id = …)`), which the registry stores as `listener_id`; a new listener
> without one fails `ListenerIdSnapshotTest`, which pins every `(listener_id, event_type)` pair. Moving
> or renaming a published event changes the persisted `event_type`, and changing an id changes
> `listener_id`: ship a forward Flyway rewrite of both tables (`V18__event_publication_event_type_moves.sql`,
> `V74__event_publication_stable_listener_ids.sql`), or outstanding publications dead-letter after deploy.

## Publishing and listening

Publish from the application service via `ApplicationEventPublisher` after the state change,
inside the transaction. Listen with `@ApplicationModuleListener` in the subscriber's
`adapter/in`, or, for a listener that must drain on its own bounded executor (the mail and refund
bulkheads), `@Async("<executor>")` + `@TransactionalEventListener`. That spelling deliberately
drops the composite's `@Transactional(propagation = REQUIRES_NEW)`: no connection is pinned across
the SMTP or Stripe call (`RESPONSIBILITIES.md` §`notification` for the mail listeners, §`booking`
for the refund listeners).
Listeners must be idempotent (dedupe on `BookingId`): the registry re-delivers an outstanding
publication on restart.

Default to async. A plain `@EventListener` runs in the publisher's transaction and a throw
rolls the publisher back — only when the producer must fail if the consumer can't apply and an
external retry exists. The registry (`spring-modulith-starter-jdbc`) persists every event
before delivery; its schema is Flyway-owned (`V8__event_publication_registry.sql`), and
`spring.modulith.events.completion-mode=archive` moves completed rows to
`event_publication_archive`.

## `payment` → `booking`

The hop breaks a cycle (`payment` cannot call `booking`, which depends on `payment::api`):
`payment` publishes `PaymentConfirmed` from the webhook controller inside `@Transactional`;
`booking.adapter.in.PaymentEventListener` listens with `@ApplicationModuleListener` and calls
`confirmFromPayment(...)` (guarded `UPDATE … WHERE status = 'AWAITING_PAYMENT'`). If the
listener throws, the webhook still commits and the registry re-submits the publication.
Idempotent twice: the Stripe event-id dedup plus the guarded transition.
