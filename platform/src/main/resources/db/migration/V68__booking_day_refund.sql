-- A washed-out day of a stay is refunded on its own and the stay continues (issue #1210, design D5,
-- option A): the day's share comes back to the guest, the booking row keeps its status, the set stays
-- held for that day and nothing is released. The fact lives on the service day it is about, beside
-- the two attendance stamps: refunded_at says when, refund_minor what was refunded for that day in
-- integer minor units (invariant #5), always both or neither.
--
-- A refunded day is never attended (booking_day_refunded_check): the weather refund refuses a day
-- the guest checked into, and check-in refuses a day already refunded, so the two stamps exclude
-- each other the way attended and missed already do. A missed day CAN be refunded -- the storm is
-- known after the sweep passed -- so missed_at and refunded_at may sit together; the sweep and the
-- stay outcome then ignore the refunded day rather than count it missed.
ALTER TABLE booking_day
    ADD COLUMN refunded_at  TIMESTAMPTZ,
    ADD COLUMN refund_minor BIGINT,
    ADD CONSTRAINT booking_day_refund_check
        CHECK ((refunded_at IS NULL) = (refund_minor IS NULL) AND (refund_minor IS NULL OR refund_minor >= 0)),
    ADD CONSTRAINT booking_day_refunded_check
        CHECK (attended_at IS NULL OR refunded_at IS NULL);

-- The sweep's candidate index (V60) narrows to the days it still has to resolve: a refunded day is
-- neither attended nor missed and stays so, so without this it would sit in the index for good.
DROP INDEX booking_day_unresolved_idx;
CREATE INDEX booking_day_unresolved_idx
    ON booking_day (service_date)
    WHERE attended_at IS NULL AND missed_at IS NULL AND refunded_at IS NULL;
