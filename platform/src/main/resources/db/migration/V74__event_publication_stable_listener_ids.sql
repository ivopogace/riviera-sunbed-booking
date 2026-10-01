-- Issue #1340: every registry-tracked listener declares an explicit id (@ApplicationModuleListener(id)
-- / @TransactionalEventListener(id)), which the Event Publication Registry stores as listener_id in place
-- of Spring's default "<listener FQCN>.<method>(<event FQCN>)". Restart republication and resubmission
-- match listener_id string-equal against live listeners, so every row still carrying a default id is
-- mapped to its listener's new id here, or it would dead-letter. Archive rows (completion-mode=archive)
-- are mapped too so the audit trail keys stay resolvable. Idempotent: exact-match on the old id, so a
-- row already on a new id (or an empty table) is untouched. The new ids are pinned by
-- ListenerIdSnapshotTest; this mapping by StableListenerIdMigrationIT.
--
-- NOTE deploy ordering & rollback: Flyway runs during context init, republication only at
-- afterSingletonsInstantiated, so this migration always precedes republish in the same JVM. Rolling the
-- APP back to pre-#1340 code leaves rows under ids the old artifact does not register: this release is
-- roll-forward-only for pending event publications. A deploy that overlaps the old and new instances
-- (Render's zero-downtime swap) can leave a row the OLD instance wrote after this ran under its old id;
-- if one is still outstanding once the old instance has drained, re-run this file's statement by hand
-- (it is idempotent) and restart, or the row waits under an id no live listener registers.

-- One statement, so the mapping is written once: the CTE updates the live table, the outer UPDATE the
-- archive.
WITH listener_id_map (old_id, new_id) AS (
    VALUES
        ('ai.riviera.platform.booking.adapter.in.PaymentEventListener.on(ai.riviera.platform.payment.events.PaymentConfirmed)',
         'booking.confirm-on-payment-confirmed'),
        ('ai.riviera.platform.booking.adapter.in.BookingDayRefundListener.on(ai.riviera.platform.booking.events.BookingDayRefunded)',
         'booking.day-refund-on-booking-day-refunded'),
        ('ai.riviera.platform.booking.adapter.in.BookingRefundListener.on(ai.riviera.platform.booking.events.BookingCancelled)',
         'booking.refund-on-booking-cancelled'),
        ('ai.riviera.platform.booking.adapter.in.PaymentEventListener.on(ai.riviera.platform.payment.events.PaymentCanceled)',
         'booking.release-on-payment-canceled'),
        ('ai.riviera.platform.booking.adapter.in.RemodelReleasePaymentListener.on(ai.riviera.platform.booking.events.BookingCancelled)',
         'booking.release-void-on-booking-cancelled'),
        ('ai.riviera.platform.notification.adapter.in.BookingCancellationMailListener.on(ai.riviera.platform.booking.events.BookingCancelled)',
         'notification.mail-on-booking-cancelled'),
        ('ai.riviera.platform.notification.adapter.in.BookingConfirmationMailListener.on(ai.riviera.platform.booking.events.BookingConfirmed)',
         'notification.mail-on-booking-confirmed'),
        ('ai.riviera.platform.notification.adapter.in.BookingDayRefundMailListener.on(ai.riviera.platform.booking.events.BookingDayRefunded)',
         'notification.mail-on-booking-day-refunded'),
        ('ai.riviera.platform.notification.adapter.in.BookingMovedMailListener.on(ai.riviera.platform.booking.events.BookingMoved)',
         'notification.mail-on-booking-moved'),
        ('ai.riviera.platform.notification.adapter.in.RequestPaymentDueMailListener.on(ai.riviera.platform.booking.events.BookingPaymentDue)',
         'notification.mail-on-booking-payment-due'),
        ('ai.riviera.platform.notification.adapter.in.RequestDeclinedMailListener.on(ai.riviera.platform.booking.events.BookingRequestDeclined)',
         'notification.mail-on-booking-request-declined'),
        ('ai.riviera.platform.notification.adapter.in.RequestExpiredMailListener.on(ai.riviera.platform.booking.events.BookingRequestExpired)',
         'notification.mail-on-booking-request-expired'),
        ('ai.riviera.platform.notification.adapter.in.StayCancellationMailListener.on(ai.riviera.platform.booking.events.StayCancelled)',
         'notification.mail-on-stay-cancelled'),
        ('ai.riviera.platform.notification.adapter.in.StayConfirmationMailListener.on(ai.riviera.platform.booking.events.StayConfirmed)',
         'notification.mail-on-stay-confirmed'),
        ('ai.riviera.platform.notification.adapter.in.StayMoveReminderMailListener.on(ai.riviera.platform.booking.events.StayMoveDue)',
         'notification.mail-on-stay-move-due'),
        ('ai.riviera.platform.notification.adapter.in.RequestPaymentDueMailListener.on(ai.riviera.platform.booking.events.StayPaymentDue)',
         'notification.mail-on-stay-payment-due'),
        ('ai.riviera.platform.notification.adapter.in.RequestDeclinedMailListener.on(ai.riviera.platform.booking.events.StayRequestDeclined)',
         'notification.mail-on-stay-request-declined'),
        ('ai.riviera.platform.notification.adapter.in.RequestExpiredMailListener.on(ai.riviera.platform.booking.events.StayRequestExpired)',
         'notification.mail-on-stay-request-expired'),
        ('ai.riviera.platform.payout.adapter.in.BookingConfirmedPayoutListener.on(ai.riviera.platform.booking.events.BookingConfirmed)',
         'payout.accrue-on-booking-confirmed'),
        ('ai.riviera.platform.payout.adapter.in.BookingDayRefundedPayoutListener.on(ai.riviera.platform.booking.events.BookingDayRefunded)',
         'payout.reverse-day-on-booking-day-refunded'),
        ('ai.riviera.platform.payout.adapter.in.BookingCancelledPayoutListener.on(ai.riviera.platform.booking.events.BookingCancelled)',
         'payout.reverse-on-booking-cancelled'),
        ('ai.riviera.platform.venue.adapter.in.ReviewsChangedListener.on(ai.riviera.platform.review.events.ReviewsChanged)',
         'venue.rating-on-reviews-changed')
),
live AS (
    UPDATE event_publication p
    SET listener_id = m.new_id
    FROM listener_id_map m
    WHERE p.listener_id = m.old_id
    RETURNING p.id
)
UPDATE event_publication_archive a
SET listener_id = m.new_id
FROM listener_id_map m
WHERE a.listener_id = m.old_id;
