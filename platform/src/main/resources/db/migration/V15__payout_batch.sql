-- U9 (issue #12): weekly BKT payout batches — a persisted, per-(venue, period) report of what the
-- platform owes a venue for a settlement period, plus the period_key that buckets ledger entries.
--
-- WEEK = ISO-8601 week in Europe/Tirane (invariant #6): an entry belongs to the week it was CREATED
-- in (a reversal reduces the week it lands in, not the accrual's week — see ADR/U9 notes). period_key
-- is 'IYYY-Www' (e.g. 2026-W27). It is stored (not computed at read time) so the report is a stable
-- GROUP BY; a DEFAULT keeps direct inserts (and the JdbcClient adapter, which omits the column) in
-- lockstep with created_at — both evaluate NOW() in the same statement. Existing rows are backfilled
-- from their own created_at, never the migration time.
ALTER TABLE payout_ledger_entry ADD COLUMN period_key TEXT;
UPDATE payout_ledger_entry
    SET period_key = to_char(created_at AT TIME ZONE 'Europe/Tirane', 'IYYY"-W"IW');
ALTER TABLE payout_ledger_entry ALTER COLUMN period_key SET NOT NULL;
ALTER TABLE payout_ledger_entry ALTER COLUMN period_key
    SET DEFAULT to_char(NOW() AT TIME ZONE 'Europe/Tirane', 'IYYY"-W"IW');

-- The weekly report is grouped/filtered by period; index period_key (the venue FK already has its own
-- index from V9). Leading period_key serves "all venues for this week" (the report's primary query).
CREATE INDEX payout_ledger_period_idx ON payout_ledger_entry (period_key, venue_id);

-- The persisted batch (PayoutBatch aggregate): one row per (venue, period). total_net_minor is the
-- SIGNED net owed for the period (Σ accrual.net − Σ reversal.net) — it may be negative when a period's
-- reversals exceed its accruals (a refund for a prior period's booking), so there is NO >= 0 CHECK
-- here (unlike the ledger entry magnitudes). Money is BIGINT minor units (invariant #5). Lifecycle:
-- DRAFT (generated/refreshed) → REPORTED (sent to BKT) → SETTLED (paid). Settlement is MANUAL via BKT
-- (no Stripe Connect, ADR-0002); this table is the record of what was owed/paid, not a payout pipeline.
-- No ON DELETE CASCADE — a batch is an audit row that outlives churn (invariant #9).
CREATE TABLE payout_batch (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id        BIGINT      NOT NULL REFERENCES venue (id),
    period_key      TEXT        NOT NULL,                 -- ISO week 'IYYY-Www' (Europe/Tirane, #6)
    total_net_minor BIGINT      NOT NULL,                 -- SIGNED net owed for the period (#5/#9)
    currency        TEXT        NOT NULL,                 -- ISO 4217 (EUR collection, invariant #5)
    status          TEXT        NOT NULL,                 -- DRAFT | REPORTED | SETTLED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- TIMESTAMPTZ, never naked TIMESTAMP (#6)
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payout_batch_status_check CHECK (status IN ('DRAFT', 'REPORTED', 'SETTLED')),
    -- A venue has at most ONE batch per period — the ON CONFLICT target for the idempotent generate.
    CONSTRAINT payout_batch_once_per_period UNIQUE (venue_id, period_key)
);
