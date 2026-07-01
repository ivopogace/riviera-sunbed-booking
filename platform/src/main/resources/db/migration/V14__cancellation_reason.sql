-- U9 (issue #12): record WHY a booking was cancelled / a payout reversed — the refund reason.
--
-- A cancellation is either tourist-initiated under the policy (POLICY, U6) or admin-triggered for a
-- washed-out day (WEATHER, U9); CONFLICT is reserved (an admin availability-conflict cancel) so the
-- value set is closed and stable from the start (same posture as booking.status in V5). The reason is
-- the audit of the decision — invariant #10 keeps refund eligibility server-side; this column never
-- carries client input. Stored as TEXT + CHECK (postgres skill), kept in lockstep with
-- ai.riviera.platform.booking.api.RefundReason.

-- On `booking`: NULL for a live (non-cancelled) booking; set when status -> CANCELLED.
ALTER TABLE booking ADD COLUMN cancel_reason TEXT
    CONSTRAINT booking_cancel_reason_check
    CHECK (cancel_reason IS NULL OR cancel_reason IN ('POLICY', 'WEATHER', 'CONFLICT'));

-- On `payout_ledger_entry`: the reason a REVERSAL was posted (mirrors the cancellation reason).
-- NULL on ACCRUAL rows (an accrual has no refund reason); set on REVERSAL rows. The BKT report does
-- not branch on it, but the ledger stays auditable — a venue can see weather vs policy reversals.
ALTER TABLE payout_ledger_entry ADD COLUMN reason TEXT
    CONSTRAINT payout_reason_check
    CHECK (reason IS NULL OR reason IN ('POLICY', 'WEATHER', 'CONFLICT'));
