# Runbook — Stripe-profile refund smoke test (test mode)

End-to-end manual check of the **real** Stripe collection + **refund** path (U4 + U6), which CI only
exercises with the in-process stub and a mocked `StripeClient`. Runs entirely in **Stripe test mode**
(sandbox `Riviera sandbox`, `acct_1TmtV9Rc00mQRkNG`) — **no real money moves**. Collect-only, no
Connect (ADR-0002 / invariant #8).

> The `riviera-local-debug` skill is deferred; until it lands this is the canonical recipe for the
> `stripe` profile. The default (no-profile) run uses the stub gateway and needs none of this.

## Prerequisites

- **Docker** running (the backend auto-starts Postgres from `platform/compose.yaml` via the
  `spring-boot-docker-compose` dev dependency; Flyway then applies V1–V11).
- **Stripe CLI** installed and logged into the sandbox: `stripe login`.
- **Test secret key** (`sk_test_…`) from the sandbox dashboard:
  https://dashboard.stripe.com/acct_1TmtV9Rc00mQRkNG/apikeys
- Test cards/payment methods are built in — we use the test PM token `pm_card_visa`.

## 1. Start the webhook relay (prints the signing secret)

Webhooks are the source of truth (invariant #8); the app verifies the signature, so the relay's
secret must be the one the app gets. Start this **first** and copy the `whsec_…` it prints.

```bash
stripe listen --forward-to localhost:8080/api/payments/stripe/webhook
# → Ready! Your webhook signing secret is whsec_xxx  (keep this terminal running)
```

## 2. Run the backend under the `stripe` profile

```bash
cd platform
STRIPE_API_KEY=sk_test_xxx \
STRIPE_WEBHOOK_SECRET=whsec_xxx \         # the secret from step 1
SPRING_PROFILES_ACTIVE=stripe \
./gradlew bootRun
# Postgres starts from compose.yaml; Flyway migrates; StripeClient bean is active (StripeConfig).
```

## 3. Create a booking (returns 202 + a PaymentIntent)

Under the `stripe` profile the gateway returns `Pending`, so create yields **202 AwaitingPayment**
with a `clientSecret` + `paymentIntentId` (the booking stays `AWAITING_PAYMENT` until the webhook).

```bash
SET_ID=$(curl -s localhost:8080/api/venues/1 | jq '[.sets[]|select(.pool=="ONLINE")][0].id')
curl -s -X POST localhost:8080/api/bookings -H 'content-type: application/json' -d "{
  \"setId\": $SET_ID, \"bookingDate\": \"2035-08-01\",
  \"contact\": {\"email\":\"smoke@test.com\",\"fullName\":\"Smoke Test\",\"phone\":\"+355600\"}
}" | tee /tmp/created.json | jq
CODE=$(jq -r .code /tmp/created.json); PI=$(jq -r .paymentIntentId /tmp/created.json)
```

## 4. Confirm the PaymentIntent with a test card → webhook confirms the booking

```bash
stripe payment_intents confirm "$PI" --payment-method pm_card_visa
# the `stripe listen` window shows payment_intent.succeeded → 200
# → webhook: payment SUCCEEDED, PaymentConfirmed published → booking CONFIRMED + payout ACCRUAL
```

## 5. View the booking (server-computed refund terms)

```bash
curl -s "localhost:8080/api/bookings/$CODE" | jq
# expect: status "CONFIRMED", cancellable true, beforeCutoff true,
#         refundIfCancelledNow.minorUnits == amount.minorUnits (full, before cutoff)
```

## 6. Cancel → after commit the refund is issued (real test-mode Refund)

```bash
curl -s -X POST "localhost:8080/api/bookings/$CODE/cancel" | jq
# → { status: "CANCELLED", refund: { minorUnits: ... }, tier: "FULL" }
# After commit: BookingRefundListener creates a Stripe Refund (idempotency key booking-<id>-refund);
#               payout posts a proportional REVERSAL.
```

## 7. Verify

```bash
stripe refunds list --limit 1          # a re_… refund for $PI, status: succeeded
curl -s "localhost:8080/api/bookings/$CODE" | jq '.status, .refundedAmount'   # CANCELLED + refunded
```

DB checks (psql into the compose Postgres — see `platform/compose.yaml` for creds):

```sql
SELECT status, refunded_minor, refund_id FROM payment       WHERE booking_ref = <id>;  -- REFUNDED
SELECT entry_type, net_minor          FROM payout_ledger_entry WHERE booking_id = <id>;  -- ACCRUAL + REVERSAL
SELECT status, cancelled_at, refund_minor FROM booking      WHERE code = '<CODE>';      -- CANCELLED
```

## Idempotency / retry checks (optional)

- **Webhook dedup:** `stripe events resend <evt_id>` → second delivery is a `200 duplicate`, no second
  accrual (invariant #8/#9).
- **Refund idempotency:** the refund uses key `booking-<id>-refund`; a re-issued refund returns the
  same `re_…`, never a double-refund (invariant #10).

## Partial-refund tier (after cutoff)

The create endpoint blocks past-cutoff dates, so the partial tier can't be reached through the create
flow. It's covered by tests (`RefundPolicyTest`, `ReversalMathTest`, `PayoutReversalIT`,
`BookingViewIT.viewComputesPartialRefundAfterCutoff`). To exercise it live, set a venue's
`late_cancel_refund_bps` (> 0) and seed a `CONFIRMED` booking on a past date directly in Postgres, then
run steps 5–7; expect `tier: "PARTIAL"` and a proportional `REVERSAL`.

## Cleanup

Stop `bootRun` and `stripe listen`. Sandbox data is disposable; reset from the dashboard if desired.
