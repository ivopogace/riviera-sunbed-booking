-- The remodel commit (epic #1027): a booking a layout change re-seats keeps its code, price and
-- status and gains the instant it moved — the input of the free-exit refund override
-- (CancellationPolicy; the deadline arithmetic is BookingCutoff#freeExitEndsAt). TIMESTAMPTZ,
-- invariant #6; NULL means never moved.
ALTER TABLE booking
    ADD COLUMN moved_at TIMESTAMPTZ;

-- A fourth cancellation reason: the guest took the free exit a venue's change earned them. Both
-- CHECKs (V14) re-created under their own names so the lockstep pins keep recognising them; the
-- Java mirror is booking.vocabulary.RefundReason.
ALTER TABLE booking
    DROP CONSTRAINT booking_cancel_reason_check,
    ADD CONSTRAINT booking_cancel_reason_check
        CHECK (cancel_reason IS NULL OR cancel_reason IN ('POLICY', 'WEATHER', 'CONFLICT', 'VENUE_CHANGE'));

ALTER TABLE payout_ledger_entry
    DROP CONSTRAINT payout_reason_check,
    ADD CONSTRAINT payout_reason_check
        CHECK (reason IS NULL OR reason IN ('POLICY', 'WEATHER', 'CONFLICT', 'VENUE_CHANGE'));

-- The commit receipt: what one remodel did to the bookings on the sets it removed or renumbered,
-- written in the moves' own transaction and read by the venue's owner afterwards. Owned by
-- `booking`. The operator is the actor, never the authority: the read is owner-asserted through
-- the venue, and the actor is recorded as the id at commit time without a foreign key — like the
-- admin audit trail's actor, a receipt outlives whatever later happens to the operator row.
CREATE TABLE remodel_receipt (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id      BIGINT      NOT NULL REFERENCES venue(id),
    operator_id   BIGINT      NOT NULL,
    committed_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX remodel_receipt_venue_idx ON remodel_receipt (venue_id, committed_at DESC);
CREATE INDEX remodel_receipt_operator_idx ON remodel_receipt (operator_id);

-- One row per moved booking. Both spots are snapshotted by label: the from-set may be retired or
-- renumbered by the very save that moved the guest, and the mail and the guest's view must name
-- the spot as it was. The from-set FK keeps that set's history, so a later remove retires it
-- rather than deleting it (BookingPresence#hasBookings counts these rows).
CREATE TABLE remodel_receipt_move (
    id                BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id        BIGINT  NOT NULL REFERENCES remodel_receipt(id),
    booking_id        BIGINT  NOT NULL REFERENCES booking(id),
    booking_date      DATE    NOT NULL,
    from_set_id       BIGINT  NOT NULL REFERENCES set_position(id),
    from_row_label    TEXT    NOT NULL,
    from_position_no  INTEGER NOT NULL,
    to_set_id         BIGINT  NOT NULL REFERENCES set_position(id),
    to_row_label      TEXT    NOT NULL,
    to_position_no    INTEGER NOT NULL,
    rows_away         INTEGER NOT NULL,
    positions_away    INTEGER NOT NULL,
    CONSTRAINT remodel_receipt_move_distance_check CHECK (rows_away >= 0 AND positions_away >= 0),
    CONSTRAINT remodel_receipt_move_sets_check CHECK (from_set_id <> to_set_id)
);

CREATE INDEX remodel_receipt_move_receipt_idx ON remodel_receipt_move (receipt_id);
CREATE INDEX remodel_receipt_move_booking_idx ON remodel_receipt_move (booking_id, id DESC);
CREATE INDEX remodel_receipt_move_from_set_idx ON remodel_receipt_move (from_set_id);
CREATE INDEX remodel_receipt_move_to_set_idx ON remodel_receipt_move (to_set_id);
