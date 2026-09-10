-- The venue-change fee (epic #1027): a refund a venue's own remodel caused costs the venue a fixed
-- amount, recorded as a third payout-ledger entry type. `payout` decides the fee; `booking` decides
-- the refund. VENUE_CHANGE is the reason that earns it — operator-caused — where the reserved
-- CONFLICT is admin-actioned and earns none.
--
-- SIGN CONVENTION (invariant #9). Direction lives in the entry_type, never in the amount:
--
--     payout = Σ ACCRUAL.net_minor − Σ REVERSAL.net_minor − Σ FEE.net_minor
--
-- Every amount is stored as a NON-NEGATIVE magnitude (payout_amounts_check, unchanged), so no
-- consumer negates a stored value and no reader has to know which types are debits from the data
-- alone. A new entry type is a debit until a sum says otherwise.
--
-- A FEE is the one type exempt from payout_net_check: it is charged against no booking amount and
-- the platform takes no commission on it, so gross and commission are both 0 and the whole fee is
-- the net. Writing it as (fee, 0, fee) would satisfy the old CHECK by claiming a booking gross that
-- does not exist; the exemption is keyed on entry_type alone, so ACCRUAL and REVERSAL still cannot
-- store a net that is not gross − commission.
--
-- Idempotency needs nothing new: UNIQUE(booking_id, entry_type) already gives one FEE per booking
-- under the Event Publication Registry's at-least-once redelivery.

ALTER TABLE payout_ledger_entry
    DROP CONSTRAINT payout_entry_type_check,
    ADD CONSTRAINT payout_entry_type_check
        CHECK (entry_type IN ('ACCRUAL', 'REVERSAL', 'FEE')),
    DROP CONSTRAINT payout_net_check,
    ADD CONSTRAINT payout_net_check
        CHECK (entry_type = 'FEE' OR net_minor = gross_minor - commission_minor);

-- What the venue was charged for this refund, snapshotted on the receipt line the commit wrote, so a
-- receipt reads the fee that applied then rather than today's rate (the commission schedule's lesson,
-- V39: history is never repriced). Only a REFUND line bears one — a released or declined claim
-- collected nothing, so nothing is reversed and nothing is charged.
ALTER TABLE remodel_receipt_outcome
    ADD COLUMN fee_minor BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT remodel_receipt_outcome_fee_check
        CHECK (fee_minor >= 0 AND (kind = 'REFUND' OR fee_minor = 0));
