-- A remodel ends a confirmed booking every service day of which is already refunded (issue #1300): nothing is
-- left to refund, so the receipt records it as NOTHING_LEFT, and no refund, ledger entry or mail follows. The kind
-- CHECK gains the token (same name as V53's, kept in lockstep with ReceiptOutcomeKind); such a line is amount 0,
-- and V54's fee CHECK already holds its fee at 0, as it does every line but a REFUND.
ALTER TABLE remodel_receipt_outcome
    DROP CONSTRAINT remodel_receipt_outcome_kind_check,
    ADD CONSTRAINT remodel_receipt_outcome_kind_check
        CHECK (kind IN ('REFUND', 'RELEASE', 'DECLINE', 'NOTHING_LEFT')),
    ADD CONSTRAINT remodel_receipt_outcome_nothing_left_check
        CHECK (kind <> 'NOTHING_LEFT' OR amount_minor = 0);
