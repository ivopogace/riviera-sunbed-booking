-- The venue-caused cancellation (epic #1027): a remodel commit no longer only moves guests — a
-- confirmed claim with nowhere same-or-better to go is cancelled and refunded in full, an unpaid
-- one released, a pending request declined. The reason both CHECKs already admit (V52) is
-- VENUE_CHANGE: operator-caused and fee-bearing, where the reserved CONFLICT is admin-actioned and
-- carries no fee. No constraint is re-created here; only the receipt grows.

-- What the operator typed to authorise a mass refund, beside the count the commit made them match.
-- NULL means the commit refunded nothing and no reason was owed.
ALTER TABLE remodel_receipt
    ADD COLUMN refund_reason TEXT;

-- One row per claim the commit ended rather than moved. The spot is snapshotted by label like
-- remodel_receipt_move's, so the receipt still names it after the save retires that set. set_id is
-- a recorded id with no foreign key, unlike the move's two: a booking that was refunded, released
-- or declined keeps its own set_id, so the set is already pinned and BookingPresence#hasBookings
-- already answers for it. Money is integer minor units + ISO currency (invariant #5); a released
-- or declined claim collected nothing, so its amount is what was never charged.
CREATE TABLE remodel_receipt_outcome (
    id               BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id       BIGINT  NOT NULL REFERENCES remodel_receipt(id),
    booking_id       BIGINT  NOT NULL REFERENCES booking(id),
    booking_date     DATE    NOT NULL,
    kind             TEXT    NOT NULL,
    set_id           BIGINT  NOT NULL,
    row_label        TEXT    NOT NULL,
    position_no      INTEGER NOT NULL,
    amount_minor     BIGINT  NOT NULL,
    amount_currency  TEXT    NOT NULL,
    CONSTRAINT remodel_receipt_outcome_kind_check CHECK (kind IN ('REFUND', 'RELEASE', 'DECLINE')),
    CONSTRAINT remodel_receipt_outcome_amount_check CHECK (amount_minor >= 0)
);

CREATE INDEX remodel_receipt_outcome_receipt_idx ON remodel_receipt_outcome (receipt_id);
CREATE INDEX remodel_receipt_outcome_booking_idx ON remodel_receipt_outcome (booking_id, id DESC);
