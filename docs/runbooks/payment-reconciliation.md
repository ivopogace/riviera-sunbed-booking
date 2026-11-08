# Payment reconciliation

The daily sweep that compares our open payments with what the provider says (#102, ADR-0029). It runs only
under a gateway that really collects (`collecting-gateway`). It only reports; nothing changes until an admin
repairs a payment.

## What can go wrong

A guest pays, but the provider's callback never reaches us. The payment row stays open and the booking stays
`AWAITING_PAYMENT`. The abandoned-payment sweep asks the provider before it expires anything, so it leaves that
booking alone. The booking stays stuck, holding the set, until someone repairs it.

## Signals

| Signal | Meaning |
|---|---|
| `riviera_payment_reconciliation_findings{kind="paid_waiting"}` | The provider says paid; we are still waiting. A guest has paid and has no confirmed booking. **Repair today.** |
| `riviera_payment_reconciliation_findings{kind="canceled_waiting"}` | The provider says canceled or expired; we are still waiting. The set is held for a payment that can never arrive. |
| `riviera_payment_reconciliation_findings{kind="orphan"}` | An unpaid transaction older than 24 hours with no `payment` row. Inert: the guest never received its client secret. Nothing to repair. |
| `riviera_payment_reconciliation_findings{kind="unchecked"}` | A row or listing the sweep could not read. `reason=no_payee` is a row from before V80; anything else is a provider error, so check the next run. |

The gauges hold the last run's counts and fall to zero as findings are settled. A clean run logs nothing. Each
finding also has one `WARN` line starting `payment reconciliation:`, with ids only.

A row is checked once it is 30 minutes old (younger ones may have a callback on the way) and for 30 days after
it was created. Repair works on any payment by id, even after that.

## Repairing a payment

Admin session required. Every call is recorded in the admin audit trail.

1. See what differs now:

   ```bash
   curl -b cookies.txt https://<host>/api/admin/payment-reconciliation
   ```

   The response lists `divergences` (each with `kind`, `paymentId`, `reference`, `payeeVenueId`, `bookingIds`),
   `orphans`, `unchecked` and `orphanListing` (`LISTED`, `NOT_OFFERED` or `UNAVAILABLE`). The read asks the
   provider afresh, so it may show something the daily run did not.

2. Check the payment in the provider's dashboard under its `reference`.

3. Repair it, sending the CSRF token as for any admin write and stating your grounds:

   ```bash
   curl -b cookies.txt -X POST \
     -H "X-XSRF-TOKEN: <token>" \
     -H "X-Audit-Reason: callback lost, paid per dashboard" \
     https://<host>/api/admin/payment-reconciliation/<paymentId>/repair
   ```

   The repair reads the provider again and acts only on that answer, through the same guarded step a verified
   callback uses. It never takes a status from the caller.

| `outcome` | What happened | Next step |
|---|---|---|
| `CONFIRMED` | The provider says paid. The payment moved to `SUCCEEDED` and its bookings are being confirmed. | Check step 4. |
| `CANCELED` | The provider says canceled. The payment moved to `CANCELED` and its bookings are being released. | None. |
| `ALREADY_SETTLED` | The payment had already reached a final state, for example the callback arrived first. Nothing changed. | Safe to press again. |
| `NO_DIVERGENCE` | The provider still shows the payment as open. Nothing changed. | Wait: the guest may still pay. |
| `PROVIDER_UNAVAILABLE` | The provider could not be read. Nothing changed. | Try again later. |
| `NO_PAYEE` | The row is from before V80, so it names no venue. Nothing changed. | Settle it by hand in the provider's dashboard. |

An unknown `paymentId` returns `404 UNKNOWN_PAYMENT`.

4. After `CONFIRMED`, check that each booking in `bookingIds` reaches `CONFIRMED`. Confirmation runs just after
   the repair commits. If a booking was already released, it stays released and the guest has paid for nothing:
   **refund that payment by hand in the provider's dashboard**, and tell the guest.

## Orphans

Stripe documents no automatic expiry for an unpaid PaymentIntent, so an orphan stays until someone cancels it.
It cannot collect money, because the guest never received its client secret. It is reported for 30 days and
needs no action. Cancel it in the Stripe dashboard if you want it gone. POK and Paysera Classic document no
listing, so `orphanListing` reads `NOT_OFFERED` once one of them is wired.

## Not covered yet

- The production provider's lookup (#284 P2). Stripe, the sandbox demo, is the only real implementation so far.
- Disputes and chargebacks (#102's dispute half).
- A screen in the admin console: the report and the repair are API calls only.
