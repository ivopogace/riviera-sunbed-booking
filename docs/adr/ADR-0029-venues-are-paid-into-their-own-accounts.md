# ADR-0029: Guests pay each venue straight into the venue's own payment-provider account; the platform never holds booking money and takes no cut during launch

- **Status:** Proposed — flips to Accepted when the preconditions below are met.
- **Date:** 2026-11-01
- **Supersedes on acceptance:** ADR-0002 (collect via Stripe, manual BKT payout) and ADR-0009 (collect
  via Paysera as the venues' collection agent, automated payout). Both rest on the platform receiving
  the guest's money. This ADR removes that premise, not only the gateway.
- **Relates to:** ADR-0005, ADR-0026, ADR-0027 (refund amounts, kept), ADR-0021 (the venue-change fee,
  retired), ADR-0024 (a stay is a group of bookings at one venue), invariants #5, #6, #7, #8, #9, #10,
  #13. Evidence: `docs/research/2026-11-01-paysera-venue-owned-checkout.md` and
  `docs/research/2026-11-01-pok-venue-owned-checkout.md` (PR #1692), cited below as "the Paysera
  note" and "the POK note".

## Context

In both earlier designs every guest payment lands in the platform's account first. The platform keeps
its commission and pays the rest on to the venue. That makes the platform the receiver of money that
is not its own, which has costs that have nothing to do with the code:

- **Fiscal and tax exposure on someone else's income.** Albanian sales must be fiscalized. If the
  platform takes the money, the full amount may be treated as its turnover, or the venue must
  fiscalize a sale it never handled. Either way the platform carries the risk on money it does not
  keep. ADR-0009's answer, the collection-agent exemption of Law 55/2020, works only with a carefully
  drafted venue agreement and a legal sign-off.
- **There is no counsel.** The platform is built and run by one developer. A model that needs a
  lawyer to hold it up is a model that cannot be checked.
- **Payouts and clawback.** Paying venues means a ledger, batches and transfers. ADR-0009's own
  review note found that a refund can follow a payout, so a venue's period can go negative and money
  would have to be recovered from the venue.
- **Venues already fiscalize their own takings** on the systems they use for walk-in guests.

Guests are also price-sensitive, and the platform has no traffic yet. A guest fee or a venue
commission at launch would slow the start of a two-sided market. That start is the hard part, not
revenue.

Two Albanian-licensed e-money institutions are candidates: **Paysera Albania** and **POK** (RPAY
sh.p.k.). Their published documentation was read on 2026-11-01. As published, POK lets an
Albanian-registered business accept Visa and Mastercard online, and Paysera does not: its card rules,
and paysera.al's own gateway page, limit card payments to merchants registered in the EU.

## Decision

1. **The platform never receives booking money.** Each venue opens its own merchant account with the
   chosen provider and connects it in the venue console. The platform creates each payment on that
   venue's account, so the guest pays the venue directly. The platform is a technical service
   provider: it creates the payment and reads the result, and it never holds funds. The venue
   fiscalizes the sale as its own income.
2. **No cut during launch.** No commission and no guest fee. The venue terms say the platform is
   free **during launch until a stated date**, and that pricing after it will be announced with
   notice. Any later revenue must be the platform's own income: a seasonal venue subscription is the
   preferred shape. A provider's referral bonus paid to the platform (POK runs a small, time-limited
   one; Paysera's affiliate programme has been closed since 2020) is the platform's own income too,
   so it is allowed, but taking it is a separate decision. Revenue must never be a cut taken from, or
   invoiced against, a venue's takings, because that would bring back the receivable this decision
   removes. Choosing the price is a later decision.
3. **Online prepayment from day one, by card.** A venue can sell online only once its payment account
   is connected and verified. Until then its sets are not bookable online. **Cards are required**:
   the guests are mostly foreign tourists. **Apple Pay and Google Pay are wanted** and are switched on
   when the provider offers them to Albanian merchants. Their absence does not block launch.
4. **A booking is confirmed only by a payment state the platform has verified with the provider**
   (#8, in gateway-neutral wording): a signed callback, or an authenticated read of the provider's
   record. Never the client redirect. The callback reaches a **per-venue callback URL** that carries
   our payment reference (never the booking code, #7), and is bound to the venue as follows:
   - **Paysera** (Checkout Classic, the only Checkout open to Albanian merchants): verify the ss3 (or
     ss2) RSA signature with **Paysera's** public key, the same for every venue; check that the
     decoded `projectid` is the venue's project; match `orderid`, amount and currency against the
     payment row.
   - **POK**: the callback is **unsigned** (POK's own plugin treats it as a trigger only), so it is
     never trusted. The adapter logs in with the venue's key and reads the order through the
     authenticated `GET /merchants/{merchantId}/sdk-orders/{id}`, which also proves the order belongs
     to that venue. It then checks completion, transaction id, amount, currency and our reference.
     The unauthenticated order read is never used.

   Neither provider sends an event id, so deduplication keys on **the provider plus a
   provider-scoped payment reference** (Paysera: `(projectid, orderid, status)`; POK: `(merchantId,
   sdkOrderId)`), with the guarded state transition as the final guard.

   Every payment is created with an **expiry** so it cannot be paid late: Paysera `time_limit` (12
   minutes to 3 days, given in `Europe/Vilnius` and converted from the stored UTC instant, #6), POK
   `expiresAfterMinutes` (an expired order returns 410 Gone).
5. **The refund policy stays server-side** (#10), and the amounts are calculated as they are today
   (ADR-0005, ADR-0026, ADR-0027). The refund is made **from the venue's account**, by one of two
   routes:
   - **executed through the provider's API** where it has one (POK, full and partial). POK's refund
     has no idempotency key and no refund id, so the adapter records the attempt before calling, and
     after a timeout it re-reads the order instead of retrying blindly. A second partial refund is
     never retried without a read that shows the amount;
   - **left to the venue** where there is no API (Paysera Checkout Classic), or when the API refuses
     (POK answers 402 when the venue's balance is too low) or the outcome stays unknown. The platform
     records the decision and amount and tells the venue; the venue refunds it by hand; the operator
     marks it done, which is the only completion signal for that route.

   Either way the guest sees the policy's amount.
6. **A venue's payment credential is a secret.** It is encrypted at rest, never logged, never
   returned by any API, and can be replaced. It is treated like a booking code (#7). Only the venue's
   owner connects or replaces it (#13). Where the provider allows several keys (POK), the venue
   creates a **dedicated, tagged key** for the platform, which it can revoke on its own. Paysera
   Classic offers only the project password.
7. **A payment collects for one venue only.** This already holds: a stay belongs to one venue
   (`stay.venue_id`, V65), so one payment's bookings never span venues. It must keep holding.
8. **One provider at launch, chosen by the written answers.** POK is the front-runner, because it is
   the only one whose published terms let an Albanian venue take cards. Paysera stays in only if it
   confirms in writing that Albanian-registered merchants can accept cards. A second production
   adapter is not built unless the first provider fails.
9. **Disputes and chargebacks belong to the venue.** The venue terms say so. Neither provider
   documents a chargeback notification, so disputes surface in the provider's own dashboard.
10. **Build order keeps the app working.** The venue-account path is built next to the current one,
    and `payout` is retired only after a real payment with the chosen provider has confirmed a
    booking from start to finish.
11. **Providers are interchangeable adapters behind one provider-neutral port.** The application
    layer gives the same result whichever provider is wired: a booking waits for payment, a verified
    payment state confirms it, and a refund is executed or handed to the venue. Exactly one gateway
    is wired per deployment, chosen by profile, as today:
    - **stub** (default profile): in-process, collects nothing, for local development and tests;
    - **`stripe`, sandbox only**: kept as the **demo** of the platform's capabilities. It collects
      into the platform's own Stripe *test* account and ignores the venue's payment account. The boot
      **refuses a live key**, so a demo can never take real money, which would break decision 1;
    - **the chosen provider's profile** (`pok` or `paysera`): production, paying each venue's own
      account.

    To keep the port neutral, the Stripe shapes that leak through it today become provider-neutral:
    - the port is told **which venue is paid**;
    - the browser gets a **checkout instruction** (embedded, carrying a client secret; or a redirect
      URL) instead of `PaymentCredentials`' Stripe client secret, and the frontend's
      `StripePaymentGateway` becomes a neutral checkout seam with one implementation per provider;
    - a refund may come back as **left to the venue** (decision 5);
    - webhook deduplication (`StripeWebhookEvents`, `stripe_webhook_event`) gets a neutral name and
      the provider-scoped key of decision 4;
    - jobs bound to the `stripe` profile today (the abandoned-payment sweep, the money-path alert)
      are bound to "a gateway that really collects" (`CollectionGuarantee`) instead.

    Whether a venue can sell online is a per-venue check of its payment account. The demo answers
    yes for every venue.
12. **A provider's per-payment ceiling is checked before checkout.** POK's documentation shows a "300
    EUR per transaction" failure and its news a 1,000 EUR business limit. A stitched stay is one
    payment and can exceed either. Until the provider confirms its limit, the checkout refuses an
    amount above the configured ceiling with a clear message, rather than letting the payment fail at
    the provider.

## Preconditions (Proposed → Accepted)

For the provider that is chosen, in writing:

- **Albanian-registered venues, sh.p.k. and sole traders, can accept card payments online,
  including foreign-issued Visa and Mastercard.** Required. (Apple Pay and Google Pay are wanted, not
  required, decision 3.)
- **The platform may create payments with the venue's credentials.** For POK, under clause 6.1 of its
  merchant agreement, which forbids third-party use of the integration "Program". For Paysera, under
  clauses 9.1.17 and 14.4 of its business agreement, which forbid disclosing "Passwords", and with our
  domain confirmed in each venue's project. A "no" from both reopens this ADR. It does not fall back
  to collecting.
- **The per-payment ceiling** for an online card payment is known.
- **A test setup with at least two test merchants**, so that a payment to venue A provably never
  confirms a booking at venue B. POK has a staging API; Paysera has only test payments on production
  projects.

## Open questions

What the published documentation settles, and the emails with the remaining questions, are in the
Paysera note and the POK note. Both emails go out together.

## Consequences

- **The money that moves through the app shrinks to a payment status and a refund instruction.**
  The `payout` module loses its purpose: the ledger, batches, commission schedule
  (`venue_commission_rate`) and payout currency. ADR-0009's negative-period problem disappears with
  it. #9 has nothing left to protect and retires when `payout` does. #5 stays: POK amounts are decimal
  major units, so its adapter converts to and from integer minor units.
- **The venue-change fee (ADR-0021) has nothing to deduct from** and retires. That leaves a product
  gap: a venue whose remodel strands a guest no longer pays for it. If that gap matters, a later
  decision can make it part of the subscription terms.
- **`payment` gains a venue payment account**, which `payment` alone writes: the provider, the
  venue's merchant or project id, and the encrypted credential. The Stripe adapter stays as the
  sandbox-only demo (decision 11), so the platform can be shown with no venue connected.
- **Checkout looks different per provider even though the result is the same.** Stripe is embedded
  in the page. Paysera and POK send the guest to their hosted page and back (POK also has an embedded
  SDK). All leave the booking waiting until a verified payment state confirms it.
- **Each venue carries the provider's sign-up and identity checks** (and, for Paysera, the project's
  review and the verification of our domain). Expect to help the first venues through it in person.
  That is the slowest step to launch, and it is people work, not code.
- **The venue bears the provider's costs.**
  - **POK:** 2.5% + €0.20 per card payment and €75 per chargeback. No reserve is published. Payments
    are credited instantly to the venue's POK account as e-money and withdrawn to its bank free of
    charge. POK publishes its fees only for natural-person merchants.
  - **Paysera:** card commission from 1.45% (EU consumer cards) to 2.90% (non-EU cards), a **reserve
    of 100% of each card payment for 3 days and 5% for 3 months**, €30 per chargeback, and €0.50 per
    refund made after the day of payment.
- **The payment page and the booking page name the venue as the seller.** Paysera's card rules
  require it; POK's hosted page already shows the venue's trade name, and POK's terms ask the venue to
  show publicly that it uses POK.
- **No-shows are covered by prepayment**, as they are today, so pay-at-venue rules are not needed.
- **Doc follow-ups on acceptance:**
  - mark ADR-0002 and ADR-0009 *Superseded by ADR-0029*;
  - reword #8 to decision 4's gateway-neutral form, and retire #9;
  - drop the payout-currency provisional line from `CLAUDE.md`;
  - update the module table (`payout`, `venue`'s commission schedule), `CONTEXT.md` § *Money*,
    `RESPONSIBILITIES.md` and the spec's "commission per booking";
  - rewrite the `riviera-stripe-payments` skill as the venue-account payments skill.

## Alternatives considered

- **Keep collecting (ADR-0009).** Rejected: the platform carries fiscal and payment-services risk on
  money it does not keep, it owes payouts, and it may need clawback. It also needs a legal sign-off
  that no one can give. Paysera's card rules also forbid accepting a card "for commercial activity
  performed by a third party", which works against the collection-agent model.
- **Pay at the venue, with an online booking fee as the platform's only income.** It is clean on
  tax, but the guest has paid the venue nothing, so no-shows land on venues. That pushes them to take
  sets out of the online pool, and a fee at launch puts guests off. Kept as a fallback for venues
  without a provider account, not as the default.
- **Commission invoiced to venues** (the booking.com shape). Rejected: the platform chases payment
  from seasonal businesses that close in October.
- **A split-payment provider** (Stripe Connect, Adyen for Platforms, Mangopay, Lemonway). Rejected
  for the reason ADR-0009 gave: none verifiably accepts Albanian sellers with Albanian IBANs. POK's
  `splitWith` and Paysera's split payments (Checkout Modern only) split one merchant's order with
  another account; neither is a platform product that onboards venues.
