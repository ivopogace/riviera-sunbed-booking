-- Issue #123: a guest may retract their own pending request before the venue decides.
--
-- It terminates as WITHDRAWN — its own label beside DECLINED (the venue said no) and EXPIRED
-- (nobody answered), so the three ways a Request-to-Book hold can end stay distinguishable in the
-- booking table, and CANCELLED keeps meaning "a confirmed booking was cancelled" (a state that
-- carries a refund decision; a withdrawn request never had a PaymentIntent to refund).
--
-- TEXT + CHECK rather than a native enum (JDBC-only stack, invariant #1) — widened forward-only by
-- DROP/ADD, the same shape V19 used to admit the Request-to-Book states. Kept in lockstep with the
-- Java BookingStatus enum by BookingMigrationIT.everyEnumStatusAccepted.
--
-- No new column: WITHDRAWN stamps status alone, exactly as DECLINED/EXPIRED do (there is no
-- declined_at/expired_at either). refund_minor and cancel_reason stay NULL — both CHECKs already
-- admit NULL, so neither needs widening.
ALTER TABLE booking DROP CONSTRAINT booking_status_check;
ALTER TABLE booking ADD CONSTRAINT booking_status_check CHECK (status IN
    ('PENDING_REQUEST', 'AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW',
     'DECLINED', 'EXPIRED', 'WITHDRAWN'));
