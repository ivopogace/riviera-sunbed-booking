-- Webhook dedup stops being Stripe's (issue #1688, ADR-0029 decisions 4 and 11): the table takes a neutral
-- name and the key becomes (provider, provider-scoped reference). `reference` is the provider's event id
-- or, for a provider that sends none, one its adapter derives with the verified state inside it.
ALTER TABLE stripe_webhook_event RENAME TO payment_webhook_event;
ALTER TABLE payment_webhook_event RENAME COLUMN event_id TO reference;

-- The default exists only to mark the existing rows as Stripe's. Dropped at once: a new row names its
-- provider, or one filed as Stripe's by omission would share Stripe's dedup namespace.
ALTER TABLE payment_webhook_event
    ADD COLUMN provider TEXT NOT NULL DEFAULT 'STRIPE',
    ADD CONSTRAINT payment_webhook_event_provider_check CHECK (provider IN ('STRIPE', 'POK', 'PAYSERA'));
ALTER TABLE payment_webhook_event ALTER COLUMN provider DROP DEFAULT;

ALTER TABLE payment_webhook_event DROP CONSTRAINT stripe_webhook_event_pkey;
ALTER TABLE payment_webhook_event ADD CONSTRAINT payment_webhook_event_pkey PRIMARY KEY (provider, reference);
