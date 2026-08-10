-- Issue #594: the refund-failure trace on the `payment` collection record.
--
-- The `payment` module owns this table; JDBC-only (invariant #1), explicit SQL. Timestamps are
-- TIMESTAMPTZ (invariant #6). Three nullable columns, no backfill and no default: for every row
-- that exists today the truth is "no refund attempt recorded, no failure observed", which is
-- exactly what NULL says.
--
-- WHY COLUMNS AND NOT A `REFUND_FAILED` STATUS. A refund that returned no money leaves the
-- collection exactly as it was — succeeded, in full. Admitting a REFUND_FAILED token into
-- payment_status_check would contradict that, and would break RefundProgress's reading of
-- `status = SUCCEEDED AND refunded_minor = 0` as OUTSTANDING ("money collected, none returned"),
-- which is the honest answer to give the guest. The failure is an annotation on a collected
-- payment, not a state of it.
--
-- WHAT EACH COLUMN IS FOR:
--
--   refund_attempted_at  This platform has an UNRESOLVED refund obligation at the gateway. Stamped
--                        BEFORE the gateway call, so it is committed and visible while that call is
--                        still running, and cleared by every in-app resolution — the recording write
--                        on success, and both failure marks. It is the discriminator that lets a
--                        refund-failure webhook tell OUR refund from one someone issued by hand in
--                        the Stripe dashboard against the same collection, for which the platform
--                        owes nothing and must raise no money-path alert.
--
--                        It deliberately SURVIVES a failed refund call: in every one of those
--                        branches the platform still owes the refund, and one of them (a create
--                        whose response was lost to a double timeout) can leave a live refund at
--                        the gateway with no id on record — exactly what the discriminator is for.
--                        Settling by hand is the one resolution the app never sees, so that is the
--                        one case where the stamp is retired manually (observability runbook).
--
--   refund_failed_at     The gateway reported the refund dead and the platform still owes the
--                        money. This is the queryable half: `WHERE refund_failed_at IS NOT NULL`
--                        enumerates the bookings owed a refund, which is what the observability
--                        runbook's remedy needs and what a WARN line with log retention shorter
--                        than the incident could not give. Cleared when a later attempt succeeds:
--                        the flag means "owed now", not "was ever owed".
--
--   failed_refund_id     The gateway refund id that died. Two jobs: it keeps the traceability the
--                        stale `refund_id` used to carry, and it is the guard that stops the
--                        losing side of the race from recording a corpse as a live refund.

ALTER TABLE payment ADD COLUMN refund_attempted_at TIMESTAMPTZ;
ALTER TABLE payment ADD COLUMN refund_failed_at    TIMESTAMPTZ;
ALTER TABLE payment ADD COLUMN failed_refund_id    TEXT;

-- PARTIAL index: in a healthy deployment no row qualifies, so this stays near-empty and the
-- enumeration/count is an index-only scan. A plain index would carry an entry per payment row for
-- a column that is NULL on every one of them (postgres skill: index the rows you query, not the
-- table). Led by booking_ref because the enumeration answers "which bookings are owed money".
CREATE INDEX payment_refund_owed_idx ON payment (booking_ref)
    WHERE refund_failed_at IS NOT NULL;
