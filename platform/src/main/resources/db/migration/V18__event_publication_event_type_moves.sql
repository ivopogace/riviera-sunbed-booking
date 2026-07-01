-- Issue #95: the published domain events moved packages (booking.api -> booking.events,
-- payment.api -> payment.events). The Event Publication Registry persists event class
-- FQCNs (event_type) and republishes outstanding rows on restart
-- (spring.modulith.events.republish-outstanding-events-on-restart=true), so stored names
-- must follow the classes or republication fails to deserialize. Archive rows
-- (completion-mode=archive) are rewritten too so the audit trail keys stay resolvable.
-- Idempotent: a no-op on rows already carrying the new names (or on empty tables).

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
