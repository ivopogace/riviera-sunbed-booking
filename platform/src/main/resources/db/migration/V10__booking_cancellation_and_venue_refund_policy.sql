-- U6 (issue #11): cancellation columns on `booking` + per-venue late-cancel refund policy on `venue`.
--
-- The `booking` module owns the cancellation lifecycle (CONFIRMED -> CANCELLED) and records the
-- server-computed refund issued for the cancelled booking; the `venue` module owns the after-cutoff
-- refund share. JDBC-only (invariant #1). Money is BIGINT integer minor units (invariant #5);
-- timestamps are TIMESTAMPTZ (invariant #6). Refund eligibility/amount is always computed
-- server-side (invariant #10) — these columns are the audit of what was decided, never client input.

-- When status -> CANCELLED, stamp the instant (UTC, #6) and the refund actually issued (#5/#10).
-- Both stay NULL for a live (non-cancelled) booking. The refund can never exceed the gross amount.
ALTER TABLE booking ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE booking ADD COLUMN refund_minor BIGINT;
ALTER TABLE booking ADD CONSTRAINT booking_refund_check
    CHECK (refund_minor IS NULL OR (refund_minor >= 0 AND refund_minor <= amount_minor));

-- After-cutoff refund share in basis points (0 = non-refundable, 10000 = full). Free cancellation
-- BEFORE the evening-before cutoff is always a full refund (invariant #10) and is not stored.
-- Mirrors venue.commission_bps (V2): exact-integer bps, CHECK-bounded, never a float. Defaults to 0
-- (the safe non-refundable default); a venue raises it to offer a partial late-cancel refund.
ALTER TABLE venue ADD COLUMN late_cancel_refund_bps INTEGER NOT NULL DEFAULT 0
    CONSTRAINT venue_late_cancel_bps_check CHECK (late_cancel_refund_bps BETWEEN 0 AND 10000);
