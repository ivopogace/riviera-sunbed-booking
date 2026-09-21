# Cross-module domain events

The spine is CLAUDE.md's event inventory. Its refund and intent-void listeners are `booking`'s
`BookingRefundListener` (drives `RefundPort`) and `RemodelReleasePaymentListener` (voids an
uncollected intent via `CancelPaymentPort`); `venue`'s `ReviewsChanged` listener recomputes the
rating from a full re-read, not the payload.

## Payload

Typed ids and immutable value facts only (#11). Facts fixed at the moment (amount, window at
birth) ride in the payload (`BookingConfirmed`); mutable configuration (the commission rate)
does not — the listener re-reads it via `venue::api` (`BookingConfirmedPayoutListener`),
because it can change while the event sits in the registry.

> Moving or renaming a published event changes the persisted FQCN in `event_publication` and
> `event_publication_archive` (`event_type` and the default `listener_id`). Ship a Flyway
> rewrite like `V18__event_publication_event_type_moves.sql`, or outstanding publications
> dead-letter after deploy.

## Publishing and listening

Publish from the application service via `ApplicationEventPublisher` after the state change,
inside the transaction. Listen with `@ApplicationModuleListener` in the subscriber's
`adapter/in`. Listeners must be idempotent (dedupe on `BookingId`): the registry re-delivers.

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
