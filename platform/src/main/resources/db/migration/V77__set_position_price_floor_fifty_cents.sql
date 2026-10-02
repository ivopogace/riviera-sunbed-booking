-- A set price is at least 50 EUR minor units (issue #1294, owner decision 2026-10-02): €0.50 is Stripe's minimum
-- EUR charge, below which a PaymentIntent fails with amount_too_small. Tightens V76's set_position_price_check
-- (> 0); V76's set_position_price_currency_check stays. The twin of venue.vocabulary.SetPrice.MIN_PRICE_MINOR.
-- Added validated, not NOT VALID: an existing row below 50 fails this migration loudly and nothing is rewritten.
ALTER TABLE set_position
    DROP CONSTRAINT set_position_price_check,
    ADD CONSTRAINT set_position_price_check CHECK (price_minor >= 50);
