-- U2 (issue #5): availability source of truth + concurrency-safe claim.
--
-- The authoritative per-(set, date) state, owned by the `availability` module — the ONLY
-- writer of this table (invariant #2). This is the table U1's V2 deliberately did NOT
-- create (its `set_position.seed_availability` was a render-only placeholder).
--
-- Concurrency model: a claimed (set, date) is the EXISTENCE of a row. `FREE` is the
-- absence of a row, so there is no 'FREE' state token — the CHECK admits only the two
-- "taken" states. The `UNIQUE(set_id, booking_date)` constraint is the double-booking
-- guard (invariant #2): it makes a set holdable by at most one party per date AND serves
-- as the arbiter for the claim's atomic `INSERT ... ON CONFLICT (set_id, booking_date)
-- DO NOTHING`. No `SELECT ... FOR UPDATE` is needed because the row's creation is the
-- claim itself.
--
-- U2 only writes BOOKED_ONLINE (the online claim). STAFF_MARKED is admitted now because
-- this table is the multi-channel source of truth (online + staff tap-to-mark, U8) and the
-- domain's AvailabilityState is a closed 3-value set (FREE = no row); widening a CHECK later
-- would need a drop+add migration. `held_by_booking_id` and an optimistic-lock `version`
-- are intentionally deferred to the slice that needs them (U3/U6) — there is no BookingId
-- and no in-place mutation path in U2.

CREATE TABLE set_availability (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    set_id       BIGINT      NOT NULL REFERENCES set_position (id) ON DELETE CASCADE,
    booking_date DATE        NOT NULL,                 -- LocalDate in Europe/Tirane (invariant #6)
    state        TEXT        NOT NULL,                 -- BOOKED_ONLINE | STAFF_MARKED (FREE = no row)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- TIMESTAMPTZ, never naked TIMESTAMP (invariant #6)
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT set_availability_state_check CHECK (state IN ('BOOKED_ONLINE', 'STAFF_MARKED')),
    -- invariant #2: at most one party per (set, date). THE double-booking guard and the
    -- ON CONFLICT target for the atomic claim.
    CONSTRAINT set_availability_uniq UNIQUE (set_id, booking_date)
);

-- No separate index on the set_id FK column: the UNIQUE(set_id, booking_date) constraint
-- creates a composite index led by set_id, which already serves FK lookups / cascade
-- checks on set_id via its leftmost prefix. A standalone (set_id) index would be a
-- duplicate (postgres index-optimization). The "index every FK column" rule is satisfied.
