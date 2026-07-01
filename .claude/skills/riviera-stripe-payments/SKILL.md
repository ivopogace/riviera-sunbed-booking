---
name: riviera-stripe-payments
description: The locked payment model and Stripe integration conventions for the riviera-sunbed-booking project. Use this skill for ANY work in the payment or payout modules, any Stripe integration (PaymentIntents, webhooks, refunds), commission/payout-ledger logic, or whenever a task touches how tourists pay or how venues get paid. It encodes a deliberately-made architectural decision (collect-only, NO Stripe Connect, manual BKT payouts from a German entity) so no future session re-derives or accidentally reverses it. Load it even if the task only mentions "charge the card", "refund", "payout", "commission", or "Stripe webhook".
---

# Riviera Stripe Payments

## The decision, in one paragraph (do not silently reverse this)

The company is registered in **Germany** (Stripe-supported). Tourists pay via
**Stripe** (cards, Apple Pay, Google Pay, SEPA) and the money lands in the German
business account. Venues are in **Albania, where Stripe does not operate**, so
**Stripe Connect is NOT used** — there is no auto-split, no connected accounts, no
Connect payouts. Instead the platform **collects everything, then pays each venue
manually** in a weekly batch by domestic transfer from the founder's Albanian
**BKT** account, minus commission. The app integrates **one gateway (Stripe) for
collection only**, behind a clean interface, and runs its own payout ledger.

This is settled. If a task seems to want Connect (`Account`, `Transfer`,
`application_fee`, `on_behalf_of`, destination charges), stop — that path cannot
reach Albanian venues. Surface it as an open question, don't build it.

## Why it's built this way

- **Stripe Connect payouts require the connected account's country to be
  supported. Albania isn't.** So the obvious marketplace pattern (destination
  charges that split to each venue) is structurally impossible here. Verified
  during design; see the spec §5.
- **Collect-and-disburse is the standard small-marketplace fallback** and is
  trivial at v1 scale (5–15 venues): one inbound gateway, a payout ledger, a
  weekly manual transfer batch. It also keeps the app **gateway-agnostic** — the
  domain depends on an outbound `PaymentGateway` port (in
  `payment.application.out`), not on Stripe types.
- **Manual payout is a feature at this scale, not debt.** It avoids the KYC /
  onboarding / payment-institution weight of Connect for a seasonal business with
  a handful of venues. (A `Steuerberater` confirms the "collect on the venue's
  behalf" legal framing — that's a business task, not an app concern.)

## Integration conventions

These make the relevant cross-cutting invariants concrete for payments. The
numbers reference `CLAUDE.md`.

### Collection (the `payment` module)

- **Use PaymentIntents (or Checkout Sessions) — collection only.** No Connect
  primitives. The `payment` module exposes an **inbound** `api/` port like
  `CheckoutPort.createCheckout(BookingId, Money)` (in `payment.api`) that `booking`
  calls; the Stripe SDK sits behind the **outbound** `PaymentGateway` port in
  `payment.application.out`. Keep the two ports distinct (invariant #11) — one is
  driving, one is driven — and neither leaks payout concerns.
- **Webhooks are the source of truth (invariant #8).** A booking is confirmed when
  the `payment_intent.succeeded` (or `checkout.session.completed`) webhook is
  received and **its signature is verified** — never from the browser redirect.
  The client redirect is a UX convenience only.
- **Idempotency everywhere money moves.** Pass a Stripe idempotency key on charge
  and refund creation (derive it from `BookingId` + operation). Webhook handlers
  must be idempotent: Stripe can deliver the same event more than once, so dedupe
  on the Stripe event id and make the state transition a no-op if already applied.
- **Money is integer minor units in EUR (invariant #5).** Convert at the Stripe
  boundary only. Never carry a `double`/`float` amount.
- **Store the Stripe ids, not the card data.** Persist `payment_intent` id,
  `charge` id, and refund ids; never touch raw PAN/CVV (that's Stripe Elements'
  job, which keeps you out of PCI scope).

### Request-to-Book vs Instant Book (booking-mode money timing)

Venues choose Instant Book or Request-to-Book per venue (CLAUDE.md, `venue`
module). The two modes charge differently — pin this down rather than re-derive it:

- **Instant Book:** the flow above — pay now → verified webhook → booking
  `CONFIRMED`. The `(set, date)` row is claimed at booking time (invariant #2).
  This is the **shipped, built** flow: `StripePaymentGateway` creates an
  immediate-capture PaymentIntent (`setAutomaticPaymentMethods(enabled=true)`),
  `ReserveSetService` claims and inserts `AWAITING_PAYMENT` before the Stripe call,
  and the verified webhook confirms.
- **Request-to-Book: payment-request-on-accept** (NOT auth-and-capture).
  Request-to-Book is **not yet built** — when it lands, the model is: the tourist
  **requests** (no card charged, no PaymentIntent yet); the `(set, date)` row is
  soft-held in a **pending** state that blocks other reservations exactly like a
  confirmed one (invariant #2) and is **released on decline/timeout**; on venue
  **accept**, the booking moves to `AWAITING_PAYMENT` and a **payment request is
  issued to the guest** — i.e. a fresh PaymentIntent is created at accept time and
  the guest pays it, confirmed by the **same verified webhook** as Instant Book.
  From `AWAITING_PAYMENT` onward the two flows are **byte-for-byte identical**
  (same PaymentIntent + Elements + webhook spine), so the payment/confirmation
  code is written once.
- The request-expiry window (how long a venue has to accept) is a config value;
  expiry releases the soft-hold. Use a **ShedLock-guarded** deadline sweep
  mirroring the existing abandoned-payment sweep (`AbandonedBookingSweepService`),
  and document the same single-instance constraint the existing sweep carries.

> **Retraction (was wrong in an earlier version of this skill):** a prior version
> said Request-to-Book should **"authorize at request, capture on accept"** with a
> **manual-capture PaymentIntent** voided on decline/timeout. That is **not** the
> model and contradicts the shipped immediate-capture Instant flow — do **not**
> build auth-and-capture. The model is **payment-request-on-accept** as above. If a
> task or older doc implies manual-capture/void, treat it as stale and ignore it.

### Refunds & cancellation (invariant #10)

- Refund **eligibility and amount are computed server-side** from the booking's
  state and the cancellation policy (free until the evening-before cutoff →
  full; after → non-refundable/partial; weather → manual admin full refund). The
  client never tells the server how much to refund.
- A refund **reverses the payout-ledger accrual** for that booking (invariant #9)
  — the `payout` module must see the reversal so the venue isn't paid for a
  refunded booking.
- The weather exception is **admin-triggered** in v1 (no forecast feed). Model it
  as an explicit admin action that issues full refunds for a venue+date.

### Payout (the `payout` module)

- The ledger is the record of **what the platform owes each venue**: each
  confirmed booking accrues `amount − commission` (commission rate stored per
  venue, invariant #9); each refund reverses it. **Exactly-once** accrual per
  booking.
- Settlement is **out-of-app**: a weekly report lists, per venue, the net owed for
  the period and the bookings behind it. The founder pays it via BKT and marks the
  batch settled. v1 does NOT automate the transfer — do not build a Connect/Treasury
  payout pipeline.
- Keep payout **currency-aware**: collection is EUR; a venue's payout currency
  (EUR or ALL) is a venue setting; any conversion happens outside the app at
  transfer time. The ledger records EUR net plus the venue's payout preference.

## Boundary / module placement

- `payment` and `payout` are **separate modules** (CLAUDE.md). They collaborate
  with `booking` via events, not direct service calls (invariant #11):
  - `booking` (or `payment` after a verified webhook) publishes confirmation →
    `availability` marks the set taken, `payout` accrues the ledger entry.
  - A cancellation/refund publishes → `availability` frees the set, `payout`
    reverses the accrual.
- The Stripe SDK and webhook controller live in `payment.infrastructure.*` only.
  The `booking`/`payout` domains never import Stripe types — they speak `Money`,
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
| "I'll use Stripe Connect to split the payment to the venue." | Connect can't pay out to Albanian venues. Collect-only + manual BKT batch is the model. Stop. |
| "The frontend got `payment success`, so confirm the booking." | Confirm only on a signature-verified webhook (invariant #8). The redirect lies under retries/closed tabs. |
| "Stripe delivered the event, just apply it." | Stripe re-delivers. Dedupe on event id; make the transition idempotent, or you double-accrue payouts. |
| "I'll store the amount as a BigDecimal/float of euros." | Integer minor units only (invariant #5). |
| "The client can pass the refund amount." | Refund amount is computed server-side from the policy (invariant #10). |
| "Pay the venue straight from Stripe." | There's no Connect (invariant #8). Payout is a ledger + a manual BKT transfer (invariant #9). |
| "`stripe:connect-recommend` says use a destination charge / `application_fee`." | That skill doesn't know Albania blocks Connect. This project is collect-only — ignore it (invariant #8). |

## When NOT to use this skill

- Pure frontend work that doesn't touch the checkout/payment UI.
- Tasks entirely outside the `payment`/`payout` modules with no money flow.

If a task touches charging, refunding, commission, the payout ledger, or any
Stripe call, load this skill — the cost of re-deriving (or reversing) the
collect-only decision is far higher than reading one file.

## Integration

- **`CLAUDE.md`** — the invariant list this skill makes concrete (#5, #8, #9, #10,
  #11).
- **`stripe:stripe-best-practices`** — generic Stripe API guidance (PaymentIntents
  vs Checkout, webhooks, restricted keys). This skill narrows it to the riviera
  decision; load both, but **ignore its Connect / Accounts-v2 / connected-account
  sections** — only the collection-side guidance applies here.
- **Do NOT load `stripe:connect-recommend` for this project.** It auto-triggers on
  marketplace / payout / commission language (which describes this whole app) and
  recommends the Connect destination-charge split this project has explicitly
  rejected (Stripe can't reach Albanian venues). If it surfaces, this skill
  overrides it.
- **`stripe:test-cards`, `stripe:explain-error`** — during integration/debugging.
- **`riviera-review-overlay`** — the review bank that checks these items on a diff.
- **`codebase-design`** — when designing the booking↔payment↔payout module
  interfaces and events (id-based payloads per invariant #11).
