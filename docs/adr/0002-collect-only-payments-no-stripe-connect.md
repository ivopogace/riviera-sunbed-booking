# ADR-0002: Collect-only payments — Stripe, no Connect, manual BKT payout

- **Status:** Accepted
- **Date:** 2026-06-25

## Context

Stripe does not operate in Albania, so an Albania-registered business cannot use it,
and Stripe Connect payouts cannot reach Albanian venue bank accounts. The founder is
in Germany (Stripe-supported) and holds both a German bank account and an Albanian
BKT account.

## Decision

Register the company in **Germany**. **Collect** all booking payments via **Stripe**
(cards, Apple/Google Pay, SEPA) into the German account, behind a clean
payment-gateway interface. **Do not** use Stripe Connect auto-split. **Pay out to
venues manually** in weekly BKT batches (venue share minus commission) by domestic
Albanian transfer. Payment state is reconciled from **signature-verified Stripe
webhooks**, never a client redirect, with idempotency keys on charge/refund.
(Invariants #8, #9.)

## Consequences

- The platform acts as a payment intermediary ("collects on the venue's behalf") —
  a legal/tax item to confirm with a Steuerberater; not an app concern.
- The app stays gateway-agnostic; the unusual payout path is just a manual ledger +
  bank transfer, not app complexity.
- A future implementer must not "fix" this by reaching for Stripe Connect.

## Alternatives considered

- **Stripe Connect auto-split** — the textbook marketplace answer. Rejected: cannot
  pay Albanian venues.
- **Albania-registered entity** — Rejected: Stripe unavailable there.
