# ADR-0009: Payments migration — Stripe → Paysera, collect-only retained, EUR payouts, post-service settlement

- **Status:** Proposed (flips to Accepted when the preconditions below are met)
- **Date:** 2026-07-22
- **Supersedes:** ADR-0002 (the gateway and the payout leg; the collect-only model itself is
  **reaffirmed**, not reversed)

## Context

ADR-0002 solved "Stripe does not operate in Albania" by registering the company in Germany:
collect via Stripe into a German account, pay venues manually in weekly BKT batches. That
construction is now being retired for reasons outside the codebase:

- **The business is re-registering as an Albanian sh.p.k.** The economic activity (venues,
  beaches, guests-on-the-ground) is Albanian, so Albanian tax nexus exists regardless of the
  seat; the German seat added BaFin/ZAG exposure (the commercial-agent exemption for a
  platform collecting for many payees is interpreted narrowly in Germany) on top of Albanian
  permanent-establishment questions. Albania's Payment Services Law (no. 55/2020,
  PSD2-modeled) provides the same commercial-agent exemption with a friendlier story: a local
  platform collecting as the venues' contractual agent, funds held at a Bank-of-Albania-
  licensed EMI. **Stripe cannot serve an Albanian entity, so the gateway must change.**
- **Albania joined SEPA** (accession approved late 2024, live 2025–26), making EUR credit
  transfers to Albanian accounts cheap — this unlocks an automated payout leg that ADR-0002's
  manual BKT batches worked around.
- **The venue-payout experience should match the Airbnb model**: money arrives in the venue's
  bank account automatically per service day, commission already deducted. Airbnb pays its
  (many) Albanian hosts exactly this way — central collection by its own licensed payment
  entities acting as the hosts' "limited payment collection agent", payout released ~24h
  *after check-in* over plain bank rails. No card-PSP sub-merchant onboarding for hosts.

Provider landscape (researched 2026-07-22):

- **No split-payment product reaches Albanian venues.** Stripe Connect, Adyen for Platforms,
  and PayPal Commerce do not onboard Albanian sellers; Mangopay/Lemonway seller onboarding is
  EEA-centric (worth re-asking post-SEPA, but unconfirmed today).
- **Paysera Albania** — EMI licensed by the Bank of Albania (subsidiary of the Lithuanian
  group): Checkout with international cards + **Apple Pay / Google Pay**, EUR (multi-currency)
  acquiring, **HMAC-signed webhooks with retries**, refunds via API, and a **Transfer API /
  mass-payments API** (domestic ALL + SEPA EUR to any bank) that can carry the payout leg.
  Weakness: no separate sandbox — test payments run against production with a test flag.
- **POK (RPAY sh.p.k.)** — local EMI with a genuinely good collection DX (separate staging
  env + test cards), but per its own published docs (`docs.pokpay.io`, read 2026-07-22):
  **no refund API, no webhooks** (synchronous backend `confirm` only, no async
  reconciliation events), **no wallet acceptance**, **no payout/transfer API** (inbound
  only). Three of those are load-bearing for this product.

## Decision

1. **Collect-only stays.** The platform collects every booking payment into **its own
   Paysera Albania business account**, acting as each venue's **limited payment collection
   agent** (an explicit clause in the venue agreement, relying on Law 55/2020's
   commercial-agent exemption — legal sign-off is a precondition below). **No split
   payments** — ADR-0002's "do not reach for Stripe Connect" generalizes to *any*
   split/sub-merchant product; none can onboard Albanian venues, and the direct alternative
   (venue-owned merchant accounts) inverts commission into receivables and breaks refund
   clawback.
2. **Collection gateway: Paysera Checkout (modern API), EUR** (invariant #5 unchanged),
   behind the existing `PaymentGateway` port: a new `adapter/out` Paysera gateway and a new
   `adapter/in` webhook controller with **HMAC signature verification**. Invariant #8 is
   unchanged in substance: a booking is confirmed **only** by the signature-verified Paysera
   webhook, never the client redirect; webhook handling stays idempotent on the provider
   event id; charge/refund idempotency keys stay derived from `BookingId` + operation.
   Refund eligibility/amounts stay server-computed (invariant #10) and are actioned via the
   Paysera refund API.
3. **Payout currency is EUR — resolving the CLAUDE.md provisional decision** (EUR vs ALL per
   venue). The ledger is already EUR-native end-to-end (invariant #5; `payout` stores EUR
   minor units, `JdbcPayoutLedger` is EUR-only), so **no FX ever enters the app**. Each venue
   supplies a **EUR-capable IBAN** (standard at Albanian banks; SEPA makes the transfer
   cheap). A venue that wants lek converts at its own bank — outside the platform, same
   posture ADR-0002 took, now permanent.
4. **Settlement is ledger-driven and moves to post-service automation in two phases.**
   - *Phase 1 (migration):* mechanics identical to today — the O7 statement, manual
     transfers, mark-batch-settled — except the transfers go out from the platform's Paysera
     account instead of the German bank + BKT hop.
   - *Phase 2 (its own slice):* a scheduled job pays each venue's accrued net **the day
     after the booking's service date** via the **Paysera Transfer API**, behind a new
     driven settlement port in the `payout` module. The ledger remains the source of truth;
     the API call is just the last mile.
   - **Payout timing is after the service date by design**: refund eligibility ends at the
     evening-before cutoff and weather refunds happen on the day itself, so money is only
     ever refunded while it is still in the platform account — **clawback from venues can
     never be needed**. (Same reason Airbnb pays ~24h after check-in.)
5. **Booking-mode money timing is untouched.** Instant Book and Request-to-Book
   (payment-request-on-accept) keep their flows; only the gateway behind the port changes.

## Preconditions (Proposed → Accepted)

- Albanian sh.p.k. registered; Paysera Albania business account + Checkout project through
  KYC with an accepted fee schedule.
- The venue agreement's payment-collection-agent clause reviewed by Albanian counsel against
  Law 55/2020 (the successor to ADR-0002's "confirm with a Steuerberater" line).
- Paysera due-diligence answers in hand: sandbox access (or the test-payments-in-prod
  workflow blessed), webhook event catalogue, refund API semantics, Transfer API signing
  model for unattended batches.

## Consequences

- **The app change is deliberately small** — the seam ADR-0002 paid for: swap
  `adapter/out` + `adapter/in` in `payment`, add the settlement port/adapter in `payout`
  (phase 2). `booking`, `availability`, the ledger, commission math, and all domain events
  are untouched. The frontend checkout surface changes from Stripe Elements to Paysera's
  checkout flow (its own frontend slice).
- **The cutover is clean — there is no live Stripe data.** The app has never been released;
  every Stripe transaction to date is test-mode only. No refund windows to honor, no
  dual-gateway coexistence period, no data migration: the Stripe adapter, webhook
  controller, SDK dependency, and config can be **removed outright** in the same slice that
  lands the Paysera adapter, and existing test-mode rows in non-prod databases can be
  wiped or ignored.
- **Testing posture changes:** the mocked `PaymentGateway` port keeps unit,
  `@ApplicationModuleTest`, and the mocked Playwright suites fully green with no provider
  dependency. Real-adapter verification runs against production with Paysera's
  "allow test payments" flag (no separate sandbox) and needs a publicly reachable webhook
  URL — document the recipe in `docs/agents/` when the adapter lands.
- **Doc follow-ups on acceptance:** mark ADR-0002 *Superseded by ADR-0009*; remove the
  payout-currency provisional decision from `CLAUDE.md` and re-word invariant #8's "Stripe
  webhooks" to gateway-neutral; rewrite the `riviera-stripe-payments` skill as the
  gateway-neutral payments skill with Paysera specifics.
- A future implementer must **not**: confirm a booking from a redirect; reach for a
  split/sub-merchant product (re-open this ADR instead if a provider verifiably onboards
  Albanian sellers); introduce currency conversion anywhere in the app; or pay a venue
  before its booking's service date has passed.

## Alternatives considered

- **Status quo (German entity + Stripe).** Rejected: ZAG/BaFin exposure on the collection
  construction, Albanian PE exposure anyway, and it blocks the planned Albanian entity —
  which Stripe cannot serve.
- **POK as the gateway.** Rejected for now on its own published docs: no refund API
  (invariant #10 is a core seasonal flow, not an edge case), no webhooks (invariant #8's
  reconciliation net would have to be rebuilt as a polling sweep), no Apple/Google Pay (the
  payer base is foreign tourists on phones), no payout API (the automated settlement leg —
  the point of the migration — would stay manual). Best-in-class staging/test-card DX noted.
  Re-enters as challenger if POK confirms the missing APIs in writing.
- **A split-payments provider (Connect-style: Mangopay, Lemonway, Adyen for Platforms).**
  The textbook marketplace answer and the shape the founder originally wanted. Rejected:
  none verifiably onboards Albanian-registered sellers with Albanian IBANs today. The
  post-service automated payout (decision 4) delivers the same venue-visible outcome —
  money per booking, commission pre-deducted — without per-venue PSP KYC. Revisit only on
  written confirmation from a provider.
- **Direct model (each venue its own Paysera/POK merchant account, platform invoices
  commission).** Rejected: commission flips from a payable we control to a receivable we
  chase; refunds would require pulling money back out of venue bank accounts; every venue
  would carry PSP KYC + contract burden.
- **BKT virtual POS for collection.** Rejected: legacy redirect-form integration, weak
  wallet support, and no payout automation — it would modernize nothing.
- **ALL payouts (or per-venue EUR/ALL choice).** Rejected: the ledger and collection are
  EUR; a per-venue currency flag adds an FX decision *inside* the platform that Albania's
  euroized banking + SEPA accession make unnecessary. Venues wanting lek convert at their
  own bank.
