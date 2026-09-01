---
name: riviera-stripe-payments
description: >-
  The locked collect-only, no-Stripe-Connect payment model and its conventions
  (PaymentIntents, webhooks as truth, idempotency, refunds, the payout ledger). Load for
  any work in payment or payout, any Stripe integration, or whenever a task mentions
  charge, refund, payout, commission, or webhook.
---

# Riviera Stripe Payments

## The locked decision

Collect all tourist payments via Stripe into the German entity; pay venues manually in
weekly BKT batches minus commission — **no Stripe Connect** (ADR-0002 holds the context and
rejected alternatives). If a task seems to want Connect (`Account`, `Transfer`,
`application_fee`, `on_behalf_of`, destination charges), stop — that path cannot reach
Albanian venues. Surface it as an open question, don't build it.

ADR-0009 (Proposed, deferred) would re-decide the gateway/entity to Paysera + an Albanian
sh.p.k.; collect-only is reaffirmed there, and the Stripe model in this skill stays
authoritative until that work starts.

The internal `PaymentGateway` port (`payment.application`) keeps the app gateway-agnostic —
the domain never touches Stripe types.

## Integration conventions

Invariant numbers reference `CLAUDE.md`.

### Collection (the `payment` module)

- **PaymentIntents (or Checkout Sessions) — collection only.** `payment` exposes the
  inbound `api/` port `CheckoutPort` — `PaymentOutcome pay(BookingRef, Money)` — that
  `booking` calls; the Stripe SDK sits behind the outbound `PaymentGateway` port (internal,
  `payment.application`, implemented by `adapter/out/StripePaymentGateway`). Keep the two
  ports distinct (invariant #11) and neither leaks payout concerns.
- **Webhooks are the source of truth (invariant #8):** confirm only on the
  signature-verified `payment_intent.succeeded` / `checkout.session.completed` event — the
  client redirect is never a confirmation.
- **Idempotency everywhere money moves:** derive the Stripe idempotency key from
  `BookingId` + operation on charge/refund creation; webhook handlers dedupe on the Stripe
  event id (Stripe re-delivers) and no-op if already applied.
- **Money:** invariant #5; convert at the Stripe boundary only.
- **Store Stripe ids, not card data:** persist `payment_intent`, `charge`, and refund ids;
  raw PAN/CVV is Stripe Elements' job (PCI scope).

### Request-to-Book vs Instant Book (booking-mode money timing)

Venues choose the mode per venue (`venue` module); the two charge differently:

- **Instant Book:** pay now → verified webhook → booking `CONFIRMED`.
  `StripePaymentGateway` creates an immediate-capture PaymentIntent
  (`setAutomaticPaymentMethods(enabled=true)`); `ReserveSetService` claims the `(set, date)`
  row (invariant #2) and inserts `AWAITING_PAYMENT` before the Stripe call.
- **Request-to-Book: payment-request-on-accept.** The tourist requests — no card charged,
  no PaymentIntent yet; the `(set, date)` row is soft-held pending (blocks like a confirmed
  booking; released on any of the three terminal legs — decline, timeout, the guest's own
  withdraw). On venue accept, the booking moves to `AWAITING_PAYMENT` and a fresh
  PaymentIntent is created for the guest, confirmed by the same verified webhook as
  Instant Book — from `AWAITING_PAYMENT` onward the two flows are identical.
- **Windows & sweep:** venue accept deadline = `booking.request.expiry-window`, capped at
  the evening-before cutoff; guest pay window = `booking.request.pay-window`, measured from
  `accepted_at` — never the instant TTL's creation clock — capped at service-day open (the
  two caps differ; invariant #4, `RESPONSIBILITIES.md` §`booking`). `ExpireRequestsService`
  + `RequestSweepScheduler` run lockless (guarded `UPDATE … RETURNING`; single-instance
  posture per `docs/deploy/production-hardening.md`); ShedLock only when scaling out.
- Do NOT model this as auth-and-capture; treat any older doc implying manual capture/void
  as stale.

### Refunds & cancellation

- Refund eligibility and amount are computed server-side per invariant #10 — the client
  never supplies the amount.
- A refund reverses the payout-ledger accrual for that booking (invariant #9).
- The weather exception is admin-triggered: an explicit admin action issuing full refunds
  for a venue+date.

### Payout (the `payout` module)

- The ledger records what the platform owes each venue: each confirmed booking accrues
  `amount − commission` (rate stored per venue, invariant #9); each refund reverses it.
  Exactly-once accrual per booking.
- Settlement is out-of-app: a weekly report lists, per venue, the net owed and the bookings
  behind it; the founder pays via BKT and marks the batch settled.
- Payout is currency-aware per the CLAUDE.md provisional decision (EUR vs ALL, per venue):
  the ledger records EUR net plus the venue's preference; conversion happens outside the
  app at transfer time.

## Boundary / module placement

- `payment` and `payout` are separate modules collaborating with `booking` per invariant
  #11: `BookingConfirmed`/`BookingCancelled` fan out to `payout` (accrue / reverse) and
  `notification`, and `booking`'s own `BookingCancelled` listener drives the refund via
  `payment.api.RefundPort`. `availability` consumes no events — the `(set, date)` row was
  claimed synchronously at reserve time and is released synchronously on cancel.
- The Stripe SDK and webhook controller live in `payment`'s adapter layer only
  (`adapter/in/StripeWebhookController`, `adapter/out/StripePaymentGateway`); the
  `booking`/`payout` domains never import Stripe types.

## Testing

- Stripe test mode + the `stripe:test-cards` skill for card scenarios (success, decline,
  3DS, refund); `stripe:explain-error` when a Stripe error code shows up.
- Webhook handling: test signature verification, duplicate delivery (idempotency), and
  out-of-order events — the failure modes that cause double-confirmed or never-confirmed
  bookings.

## Red flags

| Thought | Reality |
|---|---|
| "I'll use Stripe Connect to split the payment to the venue." | Connect can't pay out to Albanian venues (ADR-0002). Collect-only + manual BKT batch. Stop. |
| "Pay the venue straight from Stripe." | No Connect. Payout is a ledger + a manual BKT transfer (invariant #9). |
| "The frontend got `payment success`, so confirm the booking." | Confirm only on a signature-verified webhook (invariant #8). |
| "Stripe delivered the event, just apply it." | Stripe re-delivers. Dedupe on event id; make the transition idempotent, or you double-accrue payouts. |

## Integration

- `stripe:stripe-best-practices` — generic Stripe API guidance; ignore its Connect /
  Accounts-v2 / connected-account sections.
- **Do NOT load `stripe:connect-recommend`.** It auto-triggers on marketplace / payout /
  commission language and recommends the Connect split this project rejected. If it
  surfaces, this skill overrides it.
- `riviera-review-overlay` checks these items on a diff; `codebase-design` for the
  booking↔payment↔payout interfaces and events.
