-- U4-followup (issue #51): index supporting the abandoned-payment TTL sweep.
--
-- The sweep query (booking.application.out.Bookings#findExpirableAwaitingPayment) selects
-- AWAITING_PAYMENT bookings created before a cutoff:
--
--     SELECT id FROM booking WHERE status = 'AWAITING_PAYMENT' AND created_at < :cutoff
--
-- A PARTIAL index on created_at restricted to the AWAITING_PAYMENT subset is the right shape
-- (postgres skill): AWAITING_PAYMENT is a small, transient slice of the table (most rows are
-- CONFIRMED/CANCELLED), so the partial predicate keeps the index tiny and lets the planner do a
-- range scan on created_at over exactly the candidate rows. No table/column change — booking
-- already has created_at TIMESTAMPTZ (V5); this is purely a read-path optimisation (invariant #12:
-- the schema change is a versioned forward migration, no hand-run DDL).

CREATE INDEX booking_awaiting_created_idx
    ON booking (created_at)
    WHERE status = 'AWAITING_PAYMENT';
