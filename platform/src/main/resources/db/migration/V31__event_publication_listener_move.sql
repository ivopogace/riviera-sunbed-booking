-- Issue #382: BookingConfirmationMailListener moved from the platform root into the new
-- notification module (ai.riviera.platform -> ai.riviera.platform.notification.adapter.in).
-- The Event Publication Registry's listener_id is Spring's default @TransactionalEventListener
-- id, "<listenerClass FQCN>.<method>(<parameterType FQCN>)" — it EMBEDS the listener class FQCN,
-- and restart republication (republish-outstanding-events-on-restart=true) matches stored
-- listener_id string-equal against live listeners, marking a row FAILED when nothing matches.
-- Without this rewrite, every outstanding booking-confirmation mail carried across the deploy
-- would dead-letter (the V18 lesson, applied to a listener move instead of an event move; the
-- event class itself did not move, so event_type is untouched). Archive rows
-- (completion-mode=archive) are rewritten too so the audit trail keys stay resolvable.
-- Idempotent: no-ops on rows already carrying the new name (or empty tables).
--
-- NOTE deploy ordering & rollback: Flyway runs during context init, republication only at
-- afterSingletonsInstantiated — so this migration always precedes republish in the same JVM.
-- Once V31 has run, rolling the APP back to pre-#382 code leaves rows naming the
-- notification.adapter.in listener the old artifact does not register: this release is
-- roll-forward-only for pending event publications.

UPDATE event_publication
SET listener_id = replace(listener_id,
    'ai.riviera.platform.BookingConfirmationMailListener.on(',
    'ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener.on(')
WHERE listener_id LIKE 'ai.riviera.platform.BookingConfirmationMailListener.on(%';

UPDATE event_publication_archive
SET listener_id = replace(listener_id,
    'ai.riviera.platform.BookingConfirmationMailListener.on(',
    'ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener.on(')
WHERE listener_id LIKE 'ai.riviera.platform.BookingConfirmationMailListener.on(%';
