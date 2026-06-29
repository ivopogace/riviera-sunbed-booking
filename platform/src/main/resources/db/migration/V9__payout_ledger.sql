-- U5 (issue #9): payout ledger — what the platform owes each venue per confirmed booking.
--
-- Owned by the `payout` module. Append-only and auditable (invariant #9): a booking accrues
-- exactly one ACCRUAL entry; a refund (U6/U10) records a REVERSAL row — never an UPDATE/DELETE of
-- the accrual. The ledger is the record of what is owed; settlement is the manual BKT batch (U9),
-- there is no Stripe Connect (collect-only).
--
-- EXACTLY-ONCE: the UNIQUE(booking_id, entry_type) constraint is the idempotency guard for the
-- async @ApplicationModuleListener — under the Event Publication Registry's at-least-once
-- redelivery the accrual INSERT uses ON CONFLICT DO NOTHING, so a re-delivered BookingConfirmed
-- writes no second row. This is the payout analogue of set_availability's double-booking UNIQUE.
--
-- Money is BIGINT integer minor units + ISO currency (invariant #5); net = gross - commission is
-- enforced in the DB so a miscomputed entry cannot be persisted. Cross-module FKs match house
-- style (booking.venue_id REFERENCES venue(id)); NO ON DELETE CASCADE — a ledger entry outlives
-- and pins the booking/venue it records (an audit row must not vanish when a row is purged).

CREATE TABLE payout_ledger_entry (
    id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id         BIGINT      NOT NULL REFERENCES venue (id),
    booking_id       BIGINT      NOT NULL REFERENCES booking (id),
    entry_type       TEXT        NOT NULL,                 -- ACCRUAL | REVERSAL (REVERSAL in U6)
    gross_minor      BIGINT      NOT NULL,                 -- booking amount, minor units (invariant #5)
    commission_minor BIGINT      NOT NULL,                 -- platform commission, minor units
    net_minor        BIGINT      NOT NULL,                 -- owed to the venue = gross - commission
    currency         TEXT        NOT NULL,                 -- ISO 4217 (EUR collection, invariant #5)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- TIMESTAMPTZ, never naked TIMESTAMP (#6)
    CONSTRAINT payout_entry_type_check CHECK (entry_type IN ('ACCRUAL', 'REVERSAL')),
    CONSTRAINT payout_amounts_check    CHECK (gross_minor >= 0 AND commission_minor >= 0 AND net_minor >= 0),
    CONSTRAINT payout_net_check        CHECK (net_minor = gross_minor - commission_minor),
    -- invariant #9: a booking contributes each entry_type at most once. THE exactly-once guard and
    -- the ON CONFLICT target for the idempotent accrual under registry redelivery.
    CONSTRAINT payout_once_per_booking UNIQUE (booking_id, entry_type)
);

-- The per-venue BKT batch report (U9) sums by venue. booking_id FK lookups ride the
-- UNIQUE(booking_id, entry_type) index's leftmost prefix, so only venue_id needs its own index
-- (postgres skill: don't duplicate an index a constraint already provides).
CREATE INDEX payout_ledger_venue_idx ON payout_ledger_entry (venue_id);
