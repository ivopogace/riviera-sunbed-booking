-- One PaymentIntent may collect for several bookings (a stitched stay is a group of bookings paid
-- once, docs/architecture/multi-day-stays.md D6/D8), and each of those bookings is refunded on its
-- own. `payment` keeps what is true of the intent -- id, secret, total, currency, lifecycle status --
-- and `payment_booking` holds one row per booking the intent collects for: its share of the total
-- and its refund state, which used to live on `payment` as one refund per intent.
--
-- booking_ref is a LOGICAL reference to booking.id (cross-module by id, invariant #11), never an FK,
-- exactly as it was on `payment`. UNIQUE (booking_ref) keeps one collection and one refund per
-- booking: the idempotency key stays booking-<id>-refund. UNIQUE (refund_id) lets a refund's failure
-- webhook find its one row by the gateway's id (NULLs are distinct, so unrefunded rows do not
-- collide). Money is BIGINT integer minor units (invariant #5) and a share can never be refunded
-- past itself; the intent's total is the sum of its shares. Timestamps are TIMESTAMPTZ (#6).
--
-- The refund columns keep V42's meaning per booking: refund_attempted_at marks an unresolved
-- obligation at the gateway (the discriminator that tells our refund from a manual one),
-- refund_failed_at + failed_refund_id make an owed refund enumerable over the partial index, which
-- is empty in the healthy case. Verified by PaymentMigrationIT; the move by PaymentBookingBackfillIT.

-- The one-collection-per-booking guard moves with the column; its index name is reused below, so
-- it goes first (booking_ref itself stays until the move has read it).
ALTER TABLE payment DROP CONSTRAINT payment_booking_uniq;

CREATE TABLE payment_booking (
    id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id          BIGINT      NOT NULL REFERENCES payment (id),
    booking_ref         BIGINT      NOT NULL,                 -- booking id (logical ref, by id #11)
    amount_minor        BIGINT      NOT NULL,                 -- this booking's share (#5)
    refunded_minor      BIGINT      NOT NULL DEFAULT 0,
    refund_id           TEXT,                                 -- Stripe re_... once recorded
    refund_attempted_at TIMESTAMPTZ,
    refund_failed_at    TIMESTAMPTZ,
    failed_refund_id    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_booking_uniq           UNIQUE (booking_ref),
    CONSTRAINT payment_booking_refund_uniq    UNIQUE (refund_id),
    CONSTRAINT payment_booking_amount_check   CHECK (amount_minor >= 0),
    CONSTRAINT payment_booking_refunded_check CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor)
);

-- The FK column is indexed (Postgres does not do it): every read from the intent side -- the
-- webhook's fan-out, the status derivation -- walks payment_id.
CREATE INDEX payment_booking_payment_idx ON payment_booking (payment_id);

-- V42's owed-refund index, re-created on the child: still partial, still empty in a healthy
-- deployment, still led by booking_ref because the enumeration answers "which bookings".
CREATE INDEX payment_booking_refund_owed_idx ON payment_booking (booking_ref)
    WHERE refund_failed_at IS NOT NULL;

-- Every existing collection is for exactly one booking whose share is the whole amount: its row
-- moves across untouched, refund state included, so no refunded amount or failure trace changes.
INSERT INTO payment_booking (payment_id, booking_ref, amount_minor, refunded_minor, refund_id,
                             refund_attempted_at, refund_failed_at, failed_refund_id,
                             created_at, updated_at)
SELECT id, booking_ref, amount_minor, refunded_minor, refund_id,
       refund_attempted_at, refund_failed_at, failed_refund_id, created_at, updated_at
FROM payment;

DROP INDEX payment_refund_owed_idx;
ALTER TABLE payment
    DROP COLUMN booking_ref,
    DROP COLUMN refunded_minor,
    DROP COLUMN refund_id,
    DROP COLUMN refund_attempted_at,
    DROP COLUMN refund_failed_at,
    DROP COLUMN failed_refund_id;
