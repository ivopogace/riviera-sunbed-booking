-- A stay's washed-out day is refunded while the stay continues (issue #1210), so the ledger needs a
-- reversal of ONE DAY of a booking's accrual, posted at most once per (booking, day) and beside the
-- one whole-booking REVERSAL a later cancellation may still post. DAY_REVERSAL is that fourth
-- entry type; service_date names the day and is what makes the row's key.
--
-- SIGN CONVENTION (invariant #9, V54): direction lives in the entry type, never in the amount, and
-- every sum reads "only an ACCRUAL adds", so a DAY_REVERSAL deducts with no query change:
--
--     payout = Σ ACCRUAL.net − Σ REVERSAL.net − Σ DAY_REVERSAL.net − Σ FEE.net
--
-- Its shape is a REVERSAL's -- gross = the day's refund, commission its pro-rata share, net the
-- difference -- so payout_net_check binds it as it binds a REVERSAL.
--
-- The exactly-once key widens from (booking_id, entry_type) to (booking_id, entry_type,
-- service_date), NULLS NOT DISTINCT so the three dateless types keep their one-row-per-booking
-- guard exactly as before (two NULL dates collide), while DAY_REVERSAL rows collide only on the
-- same day. The constraint keeps its name: it is the same invariant with one more dimension.
ALTER TABLE payout_ledger_entry
    ADD COLUMN service_date DATE,                         -- a Europe/Tirane civil day (#6), DAY_REVERSAL only
    DROP CONSTRAINT payout_entry_type_check,
    ADD CONSTRAINT payout_entry_type_check
        CHECK (entry_type IN ('ACCRUAL', 'REVERSAL', 'FEE', 'DAY_REVERSAL')),
    ADD CONSTRAINT payout_service_date_check
        CHECK ((entry_type = 'DAY_REVERSAL') = (service_date IS NOT NULL)),
    DROP CONSTRAINT payout_once_per_booking,
    ADD CONSTRAINT payout_once_per_booking
        UNIQUE NULLS NOT DISTINCT (booking_id, entry_type, service_date);
