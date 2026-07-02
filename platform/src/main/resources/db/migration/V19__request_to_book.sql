-- D1 (issue #98): Request-to-Book — request lifecycle states + soft-hold bookkeeping.
--
-- The soft-hold itself needs NO schema change: a pending request claims the same
-- set_availability (set_id, booking_date) row as every other channel, as BOOKED_ONLINE
-- (invariant #2 — availability records THAT a set is held, never WHY). What changes is the
-- booking lifecycle: three new states, two timestamps, and the sweep indexes.
--
-- Status CHECK widened in lockstep with BookingStatus (invariant #12; pinned by
-- BookingMigrationIT.everyEnumStatusAccepted):
--   PENDING_REQUEST — requested, venue not yet responded; holds the (set, date) row
--   DECLINED        — venue declined; terminal, hold released, no money ever moved
--   EXPIRED         — venue never responded before request_expires_at; terminal, hold released
-- (An accepted-but-unpaid request is swept to CANCELLED — the existing abandoned-payment
-- machinery, NOT a new state.)
ALTER TABLE booking DROP CONSTRAINT booking_status_check;
ALTER TABLE booking ADD CONSTRAINT booking_status_check CHECK (status IN
    ('PENDING_REQUEST', 'AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW',
     'DECLINED', 'EXPIRED'));

-- request_expires_at: the venue-response deadline, computed at request time as
-- min(now + booking.request.expiry-window, the evening-before cutoff instant) — so an accept
-- (guarded by request_expires_at > now) can never happen after bookings close (invariant #4).
-- accepted_at: when the venue accepted (PENDING_REQUEST -> AWAITING_PAYMENT). The guest
-- pay-window is measured from THIS clock, not created_at — an accepted request must not be
-- swept by the instant-book 15-minute TTL (plan risk R-2). TIMESTAMPTZ, UTC (invariant #6).
ALTER TABLE booking ADD COLUMN request_expires_at TIMESTAMPTZ NULL;
ALTER TABLE booking ADD COLUMN accepted_at TIMESTAMPTZ NULL;

-- Sweep indexes (postgres skill): PARTIAL, like V13's booking_awaiting_created_idx — each
-- sweep's candidate set is a small transient slice of the table, so the partial predicate
-- keeps the index tiny and range-scannable over exactly the candidate rows.
CREATE INDEX booking_pending_expires_idx
    ON booking (request_expires_at)
    WHERE status = 'PENDING_REQUEST';

CREATE INDEX booking_awaiting_accepted_idx
    ON booking (accepted_at)
    WHERE status = 'AWAITING_PAYMENT' AND accepted_at IS NOT NULL;

-- Pay-on-accept needs the Stripe client_secret to be retrievable AFTER the accept moment: the
-- guest is not at the checkout screen when the PaymentIntent is created, so the code-gated
-- booking view hands it out later (only while AWAITING_PAYMENT). Stored at initiation; a
-- Stripe id/credential for the payer's browser, never card data (riviera-stripe-payments).
-- Nullable: rows written before V19 (and stub-profile rows) have none.
ALTER TABLE payment ADD COLUMN client_secret TEXT NULL;
