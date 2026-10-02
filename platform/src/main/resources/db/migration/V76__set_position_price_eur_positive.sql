-- A set price is positive EUR minor units (issue #1294, invariant #5): EUR is the v1 collection currency and
-- Stripe cannot collect a zero amount. The twin of venue.vocabulary.SetPrice. Both CHECKs are added validated,
-- not NOT VALID: an existing row at 0 or in another currency fails this migration loudly and nothing is
-- rewritten. set_position is a few hundred rows, so the ACCESS EXCLUSIVE validation scan is brief.
ALTER TABLE set_position
    DROP CONSTRAINT set_position_price_check,
    ADD CONSTRAINT set_position_price_check CHECK (price_minor > 0),
    ADD CONSTRAINT set_position_price_currency_check CHECK (price_currency = 'EUR');
