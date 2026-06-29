-- U4 (issue #8): Stripe collection records + webhook idempotency.
--
-- The `payment` module owns both tables; JDBC-only (invariant #1), explicit SQL via
-- JdbcClient. Money is BIGINT integer minor units + ISO currency (invariant #5) — never
-- NUMERIC/float. Timestamps are TIMESTAMPTZ (invariant #6). Status is TEXT + CHECK (postgres
-- skill: easy to evolve, fits the JDBC-only stack) rather than a native ENUM.
--
-- `payment.booking_ref` is a LOGICAL reference to `booking.id` (cross-module by id, invariant
-- #11) — deliberately NOT a foreign key, so the `payment` table stays independent of the
-- `booking` module's schema. The booking row always exists before the payment row (the
-- PaymentIntent is created inside the create-booking transaction, after the insert).
--
-- We store Stripe IDS, never card data (riviera-stripe-payments): the PaymentIntent id is the
-- correlation handle the verified webhook looks the booking up by. Collection-only — no
-- Stripe Connect (ADR-0002 / invariant #8).

CREATE TABLE payment (
    id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_ref       BIGINT      NOT NULL,                 -- booking id (logical ref, by id #11)
    payment_intent_id TEXT        NOT NULL,                 -- Stripe PaymentIntent id (store id, not PAN)
    amount_minor      BIGINT      NOT NULL,                 -- integer minor units (#5)
    currency          TEXT        NOT NULL,                 -- ISO 4217 (EUR v1)
    status            TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One PaymentIntent per Stripe id, and one collection per booking (Instant Book).
    CONSTRAINT payment_intent_uniq  UNIQUE (payment_intent_id),
    CONSTRAINT payment_booking_uniq UNIQUE (booking_ref),
    CONSTRAINT payment_status_check CHECK (status IN
        ('REQUIRES_PAYMENT', 'SUCCEEDED', 'FAILED', 'CANCELED')),
    CONSTRAINT payment_amount_check CHECK (amount_minor >= 0)
);

-- The UNIQUE(booking_ref) constraint already creates an index led by booking_ref, which
-- serves the "look up the payment for this booking" path — so no separate booking_ref index
-- (it would duplicate the unique index; postgres index-optimization).

-- Stripe webhook idempotency (invariant #8): Stripe can re-deliver the same event, so we
-- dedupe on its event id. The PRIMARY KEY IS the dedup key — an
-- `INSERT ... ON CONFLICT (event_id) DO NOTHING` returning 0 rows means "already processed",
-- which the handler treats as a no-op. This is the payment-side analogue of the availability
-- claim's ON CONFLICT guard.
CREATE TABLE stripe_webhook_event (
    event_id    TEXT        PRIMARY KEY,                    -- Stripe event id (evt_...)
    event_type  TEXT        NOT NULL,                       -- e.g. payment_intent.succeeded
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
