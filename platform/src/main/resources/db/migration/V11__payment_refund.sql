-- U6 (issue #11): refund state on the `payment` collection record.
--
-- The `payment` module owns this table; JDBC-only (invariant #1), explicit SQL. A refund is
-- server-INITIATED through the gateway (Stripe Refund under the `stripe` profile) and recorded from
-- the gateway response — we make the call, so invariant #8's "never trust the client for payment
-- state" is satisfied without a refund webhook in v1. Money is BIGINT integer minor units
-- (invariant #5); status is TEXT + CHECK (postgres skill), kept in lockstep with PaymentStatus.
--
-- NOTE: under the default `!stripe` (stub) profile no `payment` row exists for a booking
-- (StubPaymentGateway does not register one), so this refund record only materialises under the
-- `stripe` profile; the stub refund path is a 0-row no-op by design.

-- Cumulative refunded amount (0 until refunded), bounded by the collected amount. The Stripe refund
-- id (re_...) for traceability; NULL until a refund is issued.
ALTER TABLE payment ADD COLUMN refunded_minor BIGINT NOT NULL DEFAULT 0
    CONSTRAINT payment_refunded_check CHECK (refunded_minor >= 0 AND refunded_minor <= amount_minor);
ALTER TABLE payment ADD COLUMN refund_id TEXT;

-- Admit the refund terminal states. REFUNDED = fully refunded; PARTIALLY_REFUNDED = a partial
-- late-cancel refund (the configurable per-venue tier, invariant #10).
ALTER TABLE payment DROP CONSTRAINT payment_status_check;
ALTER TABLE payment ADD CONSTRAINT payment_status_check CHECK (status IN
    ('REQUIRES_PAYMENT', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'));
