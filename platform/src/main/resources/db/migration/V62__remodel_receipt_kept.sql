-- One row per claim a remodel commit kept where it was: its set could not be remodelled around it
-- (the day opens within the freeze window, or a move-only claim had no candidate), so the save left
-- that set exactly as stored and the guest was neither moved nor ended. The spot is snapshotted by
-- label like the move and outcome lines; set_id is a recorded id with no foreign key for the same
-- reason the outcome line's is — the booking keeps its own set_id, so the set is already pinned.
-- A kept booking is NOT ended by the remodel: nothing here is read by endedByRemodel, which stays on
-- remodel_receipt_outcome alone.
CREATE TABLE remodel_receipt_kept (
    id            BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id    BIGINT  NOT NULL REFERENCES remodel_receipt(id),
    booking_id    BIGINT  NOT NULL REFERENCES booking(id),
    booking_date  DATE    NOT NULL,
    set_id        BIGINT  NOT NULL,
    row_label     TEXT    NOT NULL,
    position_no   INTEGER NOT NULL,
    reason        TEXT    NOT NULL,
    -- The Java twin is booking.vocabulary.BlockReason; keep the two in lockstep.
    CONSTRAINT remodel_receipt_kept_reason_check CHECK (reason IN ('FROZEN', 'NO_MOVE_CANDIDATE'))
);

CREATE INDEX remodel_receipt_kept_receipt_idx ON remodel_receipt_kept (receipt_id);
CREATE INDEX remodel_receipt_kept_booking_idx ON remodel_receipt_kept (booking_id);
