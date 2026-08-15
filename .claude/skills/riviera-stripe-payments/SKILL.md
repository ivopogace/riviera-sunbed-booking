---
name: riviera-stripe-payments
description: The locked payment model and Stripe integration conventions for the riviera-sunbed-booking project. Use this skill for ANY work in the payment or payout modules, any Stripe integration (PaymentIntents, webhooks, refunds), commission/payout-ledger logic, or whenever a task touches how tourists pay or how venues get paid. It encodes a deliberately-made architectural decision (collect-only, NO Stripe Connect, manual BKT payouts from a German entity) so no future session re-derives or accidentally reverses it. Load it even if the task only mentions "charge the card", "refund", "payout", "commission", or "Stripe webhook".
---

# Riviera Stripe Payments

## The locked decision

Collect all tourist payments via **Stripe** into the German entity; pay venues
**manually** in weekly BKT batches minus commission — **no Stripe Connect**. The
locked authority is `docs/adr/0002-collect-only-payments-no-stripe-connect.md` —
context, consequences, and rejected alternatives live there, not here.

This is settled. If a task seems to want Connect (`Account`, `Transfer`,
`application_fee`, `on_behalf_of`, destination charges), stop — that path cannot
reach Albanian venues. Surface it as an open question, don't build it.

Pending: ADR-0009 (Proposed, epic #284 deferred) re-decides the gateway/entity to
Paysera + an Albanian sh.p.k. — collect-only is reaffirmed; the Stripe sandbox model
in this skill stays authoritative until #284 starts.

Operationally this stays cheap: collect-and-disburse is trivial at v1 scale (5–15
venues), and the internal `PaymentGateway` port (`payment.application`) keeps the
app **gateway-agnostic** — the domain never touches Stripe types.

## Integration conventions

Invariant numbers reference `CLAUDE.md`.

### Collection (the `payment` module)

- **Use PaymentIntents (or Checkout Sessions) — collection only.** The `payment`
  module exposes the **inbound** `api/` port `CheckoutPort` —
  `PaymentOutcome pay(BookingRef, Money)` (in `payment.api`) — that `booking` calls;
  the Stripe SDK sits behind the **outbound** `PaymentGateway` port (internal, in
  `payment.application`, implemented by `adapter/out/StripePaymentGateway`). Keep
  the two ports distinct (invariant #11) — one driving, one driven — and neither
  leaks payout concerns.
- **Webhooks are the source of truth (invariant #8):** confirm only on the
  signature-verified `payment_intent.succeeded` / `checkout.session.completed`
  event — the client redirect is a UX convenience, never a confirmation.
- **Idempotency everywhere money moves:** derive the Stripe idempotency key from
  `BookingId` + operation on charge/refund creation; webhook handlers dedupe on
  the Stripe event id (Stripe re-delivers) and no-op if already applied.
- **Money:** invariant #5; convert at the Stripe boundary only.
- **Store Stripe ids, not card data:** persist `payment_intent`, `charge`, and
  refund ids; raw PAN/CVV is Stripe Elements' job (keeps you out of PCI scope).

### Request-to-Book vs Instant Book (booking-mode money timing)

Venues choose the mode per venue (`venue` module); the two charge differently —
pin this down rather than re-derive it:

- **Instant Book** (shipped): pay now → verified webhook → booking `CONFIRMED`.
  `StripePaymentGateway` creates an immediate-capture PaymentIntent
  (`setAutomaticPaymentMethods(enabled=true)`); `ReserveSetService` claims the
  `(set, date)` row (invariant #2) and inserts `AWAITING_PAYMENT` before the Stripe call.
- **Request-to-Book** (built, issue #98): **payment-request-on-accept.** The tourist
  requests — no card charged, **no PaymentIntent yet**; the `(set, date)` row is
  soft-held pending (blocks like a confirmed booking, invariant #2; released on any of the
  three terminal legs — decline, timeout, or the guest's own withdraw, #123). On venue **accept**, the booking moves to `AWAITING_PAYMENT` and
  a **fresh PaymentIntent** is created for the guest, confirmed by the **same
  verified webhook** as Instant Book — from `AWAITING_PAYMENT` onward the two flows
  are identical, so the payment/confirmation code is written once.
- **Windows & sweep:** venue accept deadline = `booking.request.expiry-window`; guest pay
  window = `booking.request.pay-window`, measured from `accepted_at` — never the instant
  TTL's creation clock. Both are fenced by invariant #4's service-day-open cap (canonical in
  CLAUDE.md; detail in `RESPONSIBILITIES.md` §`booking`). `ExpireRequestsService` +
  `RequestSweepScheduler` run **lockless** (guarded `UPDATE … RETURNING`; single-instance
  posture per `docs/deploy/production-hardening.md`); ShedLock only when scaling out.
- Do **NOT** model this as auth-and-capture — the model is payment-request-on-accept; treat any older doc implying manual capture/void as stale.

### Refunds & cancellation

- Refund **eligibility and amount are computed server-side** per invariant #10's
  cancellation policy — the client never supplies the amount.
- A refund **reverses the payout-ledger accrual** for that booking (invariant #9).
- The weather exception is admin-triggered in v1: model it as an explicit admin
  action issuing full refunds for a venue+date.

### Payout (the `payout` module)

- The ledger records **what the platform owes each venue**: each confirmed booking
  accrues `amount − commission` (rate stored per venue, invariant #9); each refund
  reverses it. **Exactly-once** accrual per booking.
- Settlement is **out-of-app**: a weekly report lists, per venue, the net owed and
  the bookings behind it; the founder pays via BKT and marks the batch settled.
- Payout is **currency-aware** per the CLAUDE.md provisional decision (payout
  currency EUR vs ALL, per venue): the ledger records EUR net plus the venue's
  preference; any conversion happens outside the app at transfer time.

## Boundary / module placement

- `payment` and `payout` are **separate modules** collaborating with `booking` per
  invariant #11: `BookingConfirmed`/`BookingCancelled` fan out to `payout` (accrue /
  reverse) and `notification`, and `booking`'s own `BookingCancelled` listener drives
  the refund via `payment.api.RefundPort`. **`availability` consumes no events** — the
  `(set, date)` row was claimed synchronously at reserve time and is released
  synchronously on cancel (CLAUDE.md's five-event inventory is canonical).
- The Stripe SDK and webhook controller live in `payment`'s adapter layer only
  (`adapter/in/StripeWebhookController`, `adapter/out/StripePaymentGateway`); the
  `booking`/`payout` domains never import Stripe types — they speak `Money`,
  `BookingId`, and domain events.

## Testing

- Use Stripe **test mode** + the `stripe:test-cards` skill for card scenarios
  (success, decline, 3DS, refund).
- Webhook handling: test signature verification, **duplicate delivery**
  (idempotency), and out-of-order events. These are the failure modes that cause
  double-confirmed or never-confirmed bookings.
- Use the `stripe:explain-error` skill when a Stripe error code shows up.

## Red flags

| Thought | Reality |
|---|---|
| "I'll use Stripe Connect to split the payment to the venue." | Connect can't pay out to Albanian venues (ADR-0002). Collect-only + manual BKT batch is the model. Stop. |
| "Pay the venue straight from Stripe." | There's no Connect (ADR-0002). Payout is a ledger + a manual BKT transfer (invariant #9). |
| "The frontend got `payment success`, so confirm the booking." | Confirm only on a signature-verified webhook (invariant #8). The redirect lies under retries/closed tabs. |
| "Stripe delivered the event, just apply it." | Stripe re-delivers. Dedupe on event id; make the transition idempotent, or you double-accrue payouts. |

## When NOT to use this skill

- Pure frontend work that doesn't touch the checkout/payment UI.
- Tasks entirely outside the `payment`/`payout` modules with no money flow.

## Integration

- **`CLAUDE.md`** — the invariants this skill makes concrete (#5, #8, #9, #10, #11).
- **`stripe:stripe-best-practices`** — generic Stripe API guidance; load both, but
  **ignore its Connect / Accounts-v2 / connected-account sections** — only the
  collection-side guidance applies here.
- **Do NOT load `stripe:connect-recommend` for this project.** It auto-triggers on
  marketplace / payout / commission language (which describes this whole app) and
  recommends the Connect destination-charge split this project has explicitly
  rejected (Stripe can't reach Albanian venues). If it surfaces, this skill
  overrides it.
- **`stripe:test-cards`, `stripe:explain-error`** — during integration/debugging.
- **`riviera-review-overlay`** — the review bank that checks these items on a diff.
- **`codebase-design`** — for the booking↔payment↔payout interfaces and events
  (id-based payloads per invariant #11).
