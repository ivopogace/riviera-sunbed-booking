-- A stitched stay's move (a different set on the next morning, design D13) is reminded once, the
-- evening before. The stamp lives on the ARRIVING stretch: a stretch arrives once, so one stamp is
-- one reminder per move, and the sweep's guarded UPDATE ... WHERE move_reminder_at IS NULL is the
-- exactly-once primitive (ADR-0018) -- the mail's registry row commits in the same transaction.
ALTER TABLE booking ADD COLUMN move_reminder_at TIMESTAMPTZ;

-- The sweep asks "which stretches arrive tomorrow and are not yet reminded" once per tick; the
-- partial index keeps that read off booking_venue_id_idx and shrinks to the unreminded stretches.
CREATE INDEX booking_move_reminder_due_idx ON booking (booking_date)
    WHERE stay_id IS NOT NULL AND move_reminder_at IS NULL;
