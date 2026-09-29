-- The venue's own day refund (ADR-0027, issue #1272): one guest's one day refunded for a reason of
-- the venue's, beside the weather refund's. The service day gains WHY it was refunded, WHETHER its
-- claim was released, and WHO refunded it.
--
-- refund_reason is the RefundReason token the day carries: WEATHER (ADR-0026, the set stays held)
-- or VENUE (ADR-0027, the day released unless it is past). A guest's POLICY cancel and a remodel's
-- VENUE_CHANGE refund a whole booking, never a day, so the day's CHECK admits only the two day
-- reasons; the two cancel-reason CHECKs below admit every RefundReason. Every day refunded so far
-- was weather's, so the backfill names it before the CHECK binds refund_reason to refunded_at.
--
-- released_at is the stamp that tells a released day from a held one -- a fact of its own, never
-- inferred from the reason: a past VENUE day is refunded but keeps its claim (ADR-0027 §4). Only a
-- VENUE day is ever released (a weather day keeps its set, ADR-0026 §3), so the CHECK binds it to
-- the reason, and through the reason to refunded_at. refunded_by_operator_id is the actor, recorded without a foreign
-- key as remodel_receipt.operator_id is (V52): the stamp outlives the operator row. A VENUE day
-- always names its actor; a lone one-day booking the venue cancels under VENUE names it on its one
-- service day too, beside the booking row that carries the money; the weather refund stamps none.
ALTER TABLE booking_day
    ADD COLUMN refund_reason           TEXT,
    ADD COLUMN released_at             TIMESTAMPTZ,
    ADD COLUMN refunded_by_operator_id BIGINT;

UPDATE booking_day SET refund_reason = 'WEATHER' WHERE refunded_at IS NOT NULL;

ALTER TABLE booking_day
    ADD CONSTRAINT booking_day_refund_reason_check
        CHECK ((refunded_at IS NULL) = (refund_reason IS NULL)
               AND (refund_reason IS NULL OR refund_reason IN ('WEATHER', 'VENUE'))),
    ADD CONSTRAINT booking_day_released_check
        CHECK (released_at IS NULL OR refund_reason IS NOT DISTINCT FROM 'VENUE'),
    ADD CONSTRAINT booking_day_refund_actor_check
        CHECK (refund_reason IS DISTINCT FROM 'VENUE' OR refunded_by_operator_id IS NOT NULL);

-- RefundReason gains VENUE: the lone one-day booking the venue refunds is cancelled under it, and
-- the ledger's DAY_REVERSAL and REVERSAL name it. Same names as V52, one more token each.
ALTER TABLE booking
    DROP CONSTRAINT booking_cancel_reason_check,
    ADD CONSTRAINT booking_cancel_reason_check
        CHECK (cancel_reason IS NULL OR cancel_reason IN ('POLICY', 'WEATHER', 'CONFLICT', 'VENUE_CHANGE', 'VENUE'));

ALTER TABLE payout_ledger_entry
    DROP CONSTRAINT payout_reason_check,
    ADD CONSTRAINT payout_reason_check
        CHECK (reason IS NULL OR reason IN ('POLICY', 'WEATHER', 'CONFLICT', 'VENUE_CHANGE', 'VENUE'));
