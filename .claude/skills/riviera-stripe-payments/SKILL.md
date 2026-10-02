---
name: riviera-stripe-payments
description: >-
  The locked collect-only, no-Stripe-Connect payment model and its conventions
  (PaymentIntents, webhooks as truth, idempotency, refunds, the payout ledger). Load for
  any work in payment or payout, any Stripe integration, or whenever a task mentions
  charge, refund, payout, commission, or webhook.
---

# Riviera Stripe Payments

**Locked (ADR-0002):** collect all tourist payments via Stripe into the German entity; pay
venues manually in weekly BKT batches minus commission. **No Stripe Connect** — `Account`,
`Transfer`, `Payout`, `application_fee`, `on_behalf_of`, the `Stripe-Account` header, destination
charges cannot reach Albanian venues. If a task wants them, stop and surface it as an open question. ADR-0009 (Proposed)
would re-decide the gateway; this model stays authoritative until that work starts. Do NOT load
`stripe:connect-recommend`; ignore Connect sections of `stripe:stripe-best-practices`.

## Collection (`payment`)

- `payment` exposes the `api/` port `CheckoutPort` (`PaymentOutcome pay(List<CollectionShare>)` —
  one PaymentIntent may collect for several bookings, one `payment_booking` share each;
  `pay(BookingRef, Money)` is the one-share convenience);
  the Stripe SDK sits behind the internal `PaymentGateway` port (`payment.application`,
  implemented by `adapter/out/StripePaymentGateway`). The domain never touches Stripe types.
- Confirm only on the signature-verified `payment_intent.succeeded` webhook (#8); the redirect
  is never a confirmation.
- Idempotency key from `BookingId` + operation on charge/refund, plus the service day for a
  one-day refund (`RefundScope`; one `payment_refund` row per scope; `PaymentGatewayRefundContract`
  pins the formats); webhook handlers dedupe on the Stripe event id and no-op when already applied.
- Money per #5, converted at the Stripe boundary only. Persist the PaymentIntent and
  refund ids; never card data.

## Booking-mode money timing

- **Instant Book:** `ReserveSetService` claims every `(set, date)` row of the stay (#2) and inserts
  `AWAITING_PAYMENT` before the Stripe call; `StripePaymentGateway` creates an
  immediate-capture PaymentIntent (`setAutomaticPaymentMethods(enabled=true)`); webhook →
  `CONFIRMED`.
- **Request-to-Book:** no charge, no PaymentIntent and no `set_availability` row at request time
  (ADR-0025: a pending request is not a hold); the booking is `PENDING_REQUEST` and decline, expiry
  or guest withdraw release nothing. On accept, `RequestClaimService` claims every day of the span
  all or nothing through the same port as Instant Book (`SpanClaim`, #2) — a day taken meanwhile
  declines the request itself — then `AWAITING_PAYMENT` and a fresh PaymentIntent; identical to
  Instant Book from there.
- Windows: accept deadline = `booking.request.expiry-window`, capped at D's sales close (D = the
  stay's first day); pay window = `booking.request.pay-window` from `accepted_at`, capped at the end
  of the service day (#4, `RESPONSIBILITIES.md` §`booking`). `ExpireRequestsService` +
  `RequestSweepScheduler` run lockless (guarded `UPDATE … RETURNING`); ShedLock only when scaling
  out.
- Never model this as auth-and-capture; a doc implying manual capture/void is stale.

## Refunds and payout

- Refund eligibility/amount server-side (#10); the venue day refund (ADR-0027) refunds one guest's day at
  its rate and releases it, reason `VENUE`, no fee; the weather refund is an explicit action
  by the venue's operator for a venue+date — for a stay it refunds that day's share at the
  stretch's rate and the stay continues (ADR-0026).
- A refund reverses the ledger accrual (#9); a venue-caused one (`reason == VENUE_CHANGE`) also
  charges a flat fee; a washed-out day of a stay reverses as a `DAY_REVERSAL` (ADR-0026). Payout =
  `Σ amounts − commission − fees`, exactly-once per booking, entry type and (for a day) service day.
  **Direction is the entry type:** amounts are non-negative, only `ACCRUAL` adds;
  pin every new ledger sum with a `FEE` row. A `FEE` has no gross and no commission and is the
  one type the net CHECK exempts (ADR-0021).
- Settlement is out-of-app: a weekly per-venue report; the founder pays via BKT and marks the batch
  settled. The ledger and batch record the EUR collection currency; the venue's preference is
  `venue.payout_currency` (EUR vs ALL, provisional), converted outside the app.

## Boundaries

`BookingConfirmed`/`BookingCancelled` fan out to `payout` and `notification` (a stitched stay mails
once, on `StayConfirmed`/`StayCancelled`); `BookingDayRefunded` fans out the same way plus
`booking`'s own day-refund listener; `booking`'s listeners drive `payment.api` — `RefundPort` for a
whole-share or one-day refund, `CancelPaymentPort` to void a remodel-released unpaid booking's
intent. `availability` consumes no events. Stripe SDK and webhook controller live only in
`payment`'s adapters (`adapter/in/StripeWebhookController`, `adapter/out/StripePaymentGateway`).

## Testing

Stripe test mode (`stripe:test-cards`, `stripe:explain-error`). Test signature verification,
duplicate delivery, and out-of-order events.

| Thought | Reality |
|---|---|
| Connect / pay the venue from Stripe | No Connect (ADR-0002). Ledger + manual BKT. |
| Frontend got `payment success` → confirm | Only a verified webhook confirms (#8). |
| Stripe delivered, just apply it | Stripe re-delivers. Dedupe on event id or you double-accrue. |
