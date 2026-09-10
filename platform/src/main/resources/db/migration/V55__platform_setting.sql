-- The platform's own settings (epic #1027, story 31): a value the platform sets for itself, where
-- every other setting in the tree belongs to one venue. One row per setting, keyed by name, and the
-- key CHECK names every setting that exists — a new setting is a migration plus a port method,
-- deliberately, not a registration in a generic key/value store.
--
-- Today there is exactly one. VENUE_CHANGE_FEE is what a venue is charged for a refund its own
-- remodel caused; `payout` is its sole writer, because it owns the ledger the fee is posted to and
-- therefore decides the amount.
--
-- Money is BIGINT integer minor units + ISO currency (invariant #5). The amount is a NON-NEGATIVE
-- magnitude: a FEE deducts because its entry_type is FEE, never because its amount is signed (V54's
-- convention). The upper bound is mirrored by VenueChangeFeeAmount.MAX_FEE_MINOR — a Java mirror of
-- a DB bound, legitimate where a mirror of a set invariant would not be (ADR-0018 §3).
--
-- NOT EFFECTIVE-DATED, deliberately. A change applies to every fee charged after it, and posted FEE
-- rows are never repriced because the ledger is append-only and nothing here rewrites it. That
-- leaves one window: an admin writing between a remodel commit and its asynchronous
-- BookingCancelled draining charges an amount the commit receipt did not quote. A dated schedule
-- cannot close that window on its own — BookingCancelled carries no instant to resolve a rate
-- against — so closing it would mean widening a registry-persisted event payload. Accepted and
-- documented instead: ADR-0021 §7, RESPONSIBILITIES.md §payout.
--
-- Seeded with the default of riviera.payout.venue-change-fee-minor, which stays the seed and the
-- row-missing fallback rather than becoming a second source of truth.

CREATE TABLE platform_setting (
    setting_key  TEXT   NOT NULL PRIMARY KEY,
    amount_minor BIGINT NOT NULL,
    currency     TEXT   NOT NULL,                 -- ISO 4217 (EUR collection, invariant #5)
    CONSTRAINT platform_setting_key_check
        CHECK (setting_key IN ('VENUE_CHANGE_FEE')),
    CONSTRAINT platform_setting_amount_check
        CHECK (amount_minor >= 0 AND amount_minor <= 100000)
);

INSERT INTO platform_setting (setting_key, amount_minor, currency)
VALUES ('VENUE_CHANGE_FEE', 500, 'EUR');
