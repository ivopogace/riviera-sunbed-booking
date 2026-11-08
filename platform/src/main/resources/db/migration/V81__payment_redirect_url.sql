-- #1691 (ADR-0029 decision 11): a collection's checkout instruction is Embedded (client_secret) or
-- Redirect (redirect_url), read back for pay-on-accept. At most one: both NULL is a stub or pre-V19
-- row. Every existing row has redirect_url NULL, so the CHECK validates at once.
ALTER TABLE payment ADD COLUMN redirect_url TEXT NULL;

ALTER TABLE payment ADD CONSTRAINT payment_one_checkout_instruction_check
    CHECK (client_secret IS NULL OR redirect_url IS NULL);
