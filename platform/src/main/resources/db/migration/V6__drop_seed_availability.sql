-- Issue #44: drop the U1 render-only availability placeholder.
--
-- `set_position.seed_availability` was a U1 (V2) seed-only column so the read-only beach map
-- could show free/taken before the authoritative table existed. Since U2 (#5) the source of
-- truth is `set_availability(set_id, booking_date)` (invariant #2), and #44 wires the venue
-- read to source each set's FREE/TAKEN from it per date. The placeholder is now dead — drop it
-- so nothing can accidentally read a date-less, stale availability again.
--
-- Postgres drops the dependent CHECK (`set_position_avail_check`) automatically with the column.
-- This is a forward-only migration (invariant #12): V2 created the column and V3 seeded its values
-- on every existing DB before this runs, so the drop is safe; fresh DBs run V2/V3 then V6 in order.

ALTER TABLE set_position DROP COLUMN seed_availability;
