-- One booking may now be refunded more than once: a washed-out day of a stay (issue #1210) and,
-- later, the remainder when the stay is cancelled. payment_booking held exactly one refund per
-- booking (V64: refund_id, the attempt and the failure trace as columns), so the refund becomes a
-- row of its own. payment_refund holds one row per refund the platform pursues for a booking's
-- share, keyed by its SCOPE: BOOKING for the whole share (the one refund that existed before, key
-- booking-<id>-refund at the gateway), DAY plus the service day for a day's share (key
-- booking-<id>-day-<yyyy-MM-dd>-refund). UNIQUE NULLS NOT DISTINCT over (share, scope, day) keeps
-- at most one refund per scope, so a replay finds its row and a day is never refunded twice.
--
-- The columns keep V42's meaning per refund: attempted_at marks an unresolved obligation at the
-- gateway (what tells our refund from a manual one), amount_minor + refund_id are the recorded
-- refund, failed_at + failed_refund_id make an owed refund enumerable over the partial index.
-- payment_booking.refunded_minor stays and becomes the RUNNING SUM of the share's recorded refunds,
-- maintained in the same statement as each refund write, so payment_booking_refunded_check
-- (refunded_minor <= amount_minor) still makes over-refunding a share impossible whatever the
-- number of refunds. Money is BIGINT minor units (#5); timestamps TIMESTAMPTZ (#6).
--
-- Verified by PaymentMigrationIT; the move by PaymentRefundBackfillIT.
CREATE TABLE payment_refund (
    id                 BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_booking_id BIGINT      NOT NULL REFERENCES payment_booking (id),
    scope              TEXT        NOT NULL,
    service_date       DATE,                                 -- a Europe/Tirane civil day (#6), DAY only
    amount_minor       BIGINT      NOT NULL DEFAULT 0,       -- the recorded refund (#5); 0 until recorded
    refund_id          TEXT,                                 -- Stripe re_... once recorded
    attempted_at       TIMESTAMPTZ,
    failed_at          TIMESTAMPTZ,
    failed_refund_id   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_refund_scope_check  CHECK (scope IN ('BOOKING', 'DAY')),
    CONSTRAINT payment_refund_day_check    CHECK ((scope = 'DAY') = (service_date IS NOT NULL)),
    CONSTRAINT payment_refund_uniq         UNIQUE NULLS NOT DISTINCT (payment_booking_id, scope, service_date),
    CONSTRAINT payment_refund_id_uniq      UNIQUE (refund_id),
    CONSTRAINT payment_refund_amount_check CHECK (amount_minor >= 0)
);

-- The owed-refund enumeration (V42, V64), now over refunds: partial, empty in a healthy deployment.
CREATE INDEX payment_refund_owed_idx ON payment_refund (payment_booking_id)
    WHERE failed_at IS NOT NULL;

-- Every refund a share carries -- recorded, still attempted, or dead and owed -- becomes its one
-- BOOKING-scope row, amounts and trace unchanged; a share never refunded gets no row, exactly as a
-- booking refunded after this migration would have none until the first attempt.
INSERT INTO payment_refund (payment_booking_id, scope, amount_minor, refund_id, attempted_at,
                            failed_at, failed_refund_id, created_at, updated_at)
SELECT id, 'BOOKING', refunded_minor, refund_id, refund_attempted_at,
       refund_failed_at, failed_refund_id, created_at, updated_at
FROM payment_booking
WHERE refund_id IS NOT NULL OR refund_attempted_at IS NOT NULL OR refund_failed_at IS NOT NULL;

DROP INDEX payment_booking_refund_owed_idx;
ALTER TABLE payment_booking
    DROP CONSTRAINT payment_booking_refund_uniq,
    DROP COLUMN refund_id,
    DROP COLUMN refund_attempted_at,
    DROP COLUMN refund_failed_at,
    DROP COLUMN failed_refund_id;
