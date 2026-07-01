-- Issue #95: the published domain events moved packages (booking.api -> booking.events,
-- payment.api -> payment.events). The Event Publication Registry persists event class
-- FQCNs in TWO columns and both must follow the classes:
--   * event_type — used to deserialize the payload; and
--   * listener_id — Spring's default @TransactionalEventListener id is
--     "<listenerClass>.<method>(<parameterType FQCN>)", so it EMBEDS the event FQCN;
--     restart republication (spring.modulith.events.republish-outstanding-events-on-restart
--     = true) matches stored listener_id string-equal against live listeners and marks the
--     row FAILED when nothing matches — rewriting event_type alone would strand every
--     outstanding refund / payout accrual / booking confirmation carried across the deploy.
-- Archive rows (completion-mode=archive) are rewritten too so the audit trail keys stay
-- resolvable. Idempotent: no-ops on rows already carrying the new names (or empty tables).
--
-- NOTE deploy ordering & rollback: Flyway runs during context init, republication only at
-- afterSingletonsInstantiated — so this migration always precedes republish in the same
-- JVM. But once V18 has run, rolling the APP back to pre-#95 code leaves rows naming
-- events.* classes the old artifact cannot load: this release is roll-forward-only for
-- pending event publications. (V14's comment still names the old RefundReason FQCN on
-- purpose — applied migrations are immutable; editing one breaks Flyway checksum
-- validation.)

UPDATE event_publication
SET event_type = 'ai.riviera.platform.booking.events.BookingConfirmed'
WHERE event_type = 'ai.riviera.platform.booking.api.BookingConfirmed';

UPDATE event_publication
SET event_type = 'ai.riviera.platform.booking.events.BookingCancelled'
WHERE event_type = 'ai.riviera.platform.booking.api.BookingCancelled';

UPDATE event_publication
SET event_type = 'ai.riviera.platform.payment.events.PaymentConfirmed'
WHERE event_type = 'ai.riviera.platform.payment.api.PaymentConfirmed';

UPDATE event_publication
SET event_type = 'ai.riviera.platform.payment.events.PaymentCanceled'
WHERE event_type = 'ai.riviera.platform.payment.api.PaymentCanceled';

UPDATE event_publication_archive
SET event_type = 'ai.riviera.platform.booking.events.BookingConfirmed'
WHERE event_type = 'ai.riviera.platform.booking.api.BookingConfirmed';

UPDATE event_publication_archive
SET event_type = 'ai.riviera.platform.booking.events.BookingCancelled'
WHERE event_type = 'ai.riviera.platform.booking.api.BookingCancelled';

UPDATE event_publication_archive
SET event_type = 'ai.riviera.platform.payment.events.PaymentConfirmed'
WHERE event_type = 'ai.riviera.platform.payment.api.PaymentConfirmed';

UPDATE event_publication_archive
SET event_type = 'ai.riviera.platform.payment.events.PaymentCanceled'
WHERE event_type = 'ai.riviera.platform.payment.api.PaymentCanceled';

-- listener_id rewrites: the event FQCN appears inside the method-signature parentheses.
UPDATE event_publication
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.booking.api.BookingConfirmed)',
    '(ai.riviera.platform.booking.events.BookingConfirmed)')
WHERE listener_id LIKE '%(ai.riviera.platform.booking.api.BookingConfirmed)%';

UPDATE event_publication
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.booking.api.BookingCancelled)',
    '(ai.riviera.platform.booking.events.BookingCancelled)')
WHERE listener_id LIKE '%(ai.riviera.platform.booking.api.BookingCancelled)%';

UPDATE event_publication
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.payment.api.PaymentConfirmed)',
    '(ai.riviera.platform.payment.events.PaymentConfirmed)')
WHERE listener_id LIKE '%(ai.riviera.platform.payment.api.PaymentConfirmed)%';

UPDATE event_publication
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.payment.api.PaymentCanceled)',
    '(ai.riviera.platform.payment.events.PaymentCanceled)')
WHERE listener_id LIKE '%(ai.riviera.platform.payment.api.PaymentCanceled)%';

UPDATE event_publication_archive
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.booking.api.BookingConfirmed)',
    '(ai.riviera.platform.booking.events.BookingConfirmed)')
WHERE listener_id LIKE '%(ai.riviera.platform.booking.api.BookingConfirmed)%';

UPDATE event_publication_archive
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.booking.api.BookingCancelled)',
    '(ai.riviera.platform.booking.events.BookingCancelled)')
WHERE listener_id LIKE '%(ai.riviera.platform.booking.api.BookingCancelled)%';

UPDATE event_publication_archive
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.payment.api.PaymentConfirmed)',
    '(ai.riviera.platform.payment.events.PaymentConfirmed)')
WHERE listener_id LIKE '%(ai.riviera.platform.payment.api.PaymentConfirmed)%';

UPDATE event_publication_archive
SET listener_id = replace(listener_id,
    '(ai.riviera.platform.payment.api.PaymentCanceled)',
    '(ai.riviera.platform.payment.events.PaymentCanceled)')
WHERE listener_id LIKE '%(ai.riviera.platform.payment.api.PaymentCanceled)%';
