# ADR-0029: Guests pay each venue straight into the venue's own Paysera account; the platform never holds booking money and takes no cut during launch

- **Status:** Proposed — flips to Accepted when the preconditions below are met.
- **Date:** 2026-11-01
- **Supersedes on acceptance:** ADR-0002 (collect via Stripe, manual BKT payout) and ADR-0009 (collect
  via Paysera as the venues' collection agent, automated payout). Both rest on the platform receiving
  the guest's money. This ADR removes that premise, not only the gateway.
- **Relates to:** ADR-0005, ADR-0026, ADR-0027 (refund amounts, kept), ADR-0021 (the venue-change fee,
  retired), ADR-0024 (a stay is a group of bookings at one venue), invariants #5, #7, #8, #9, #10, #13.

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

## Decision

1. **The platform never receives booking money.** Each venue connects its own **Paysera business
   account and Checkout project**. The platform creates each checkout for that venue's project, so
   the guest pays the venue directly. The platform is a technical service provider: it creates the
   payment and reads the result, and it never holds funds. The venue fiscalizes the sale as its own
   income.
2. **No cut during launch.** No commission and no guest fee. The venue terms say the platform is
   free **during launch until a stated date**, and that pricing after it will be announced with
   notice. Any later revenue must be the platform's own invoiced income: a seasonal venue
   subscription is the preferred shape. (Paysera has no paid partner programme: its affiliate
   programme has been closed to new clients since 2020.) It must never be a cut taken from, or invoiced against, a venue's takings, because that would bring back
   the receivable this decision removes. Choosing the price is a later decision.
3. **Online prepayment from day one.** A venue can sell online only once its payment account is
   connected and verified. Until then its sets are not bookable online.
4. **The webhook stays the source of truth** (#8). A booking is confirmed only by a verified
   Paysera callback. Albanian merchants get **Checkout Classic** only, and Classic signs callbacks
   (ss3, or ss2) with **Paysera's** RSA key, the same for every venue. So the venue is bound as
   follows:
   1. each checkout carries a **per-venue callback URL**;
   2. the callback is routed by that URL to the venue's credentials;
   3. the signature is verified with Paysera's public key;
   4. the decoded `projectid` must equal that venue's project id;
   5. `orderid`, amount and currency must match the payment row.

   Classic callbacks carry **no event id**, so deduplication keys on `(projectid, orderid, status)`.
   Every checkout sets `time_limit` (12 minutes to 3 days, given in `Europe/Vilnius` and converted
   from the stored UTC instant, #6), so an unpaid checkout cannot be started late.
5. **The refund policy stays server-side** (#10), and the amounts are calculated as they are today
   (ADR-0005, ADR-0026, ADR-0027). The refund is made **from the venue's account**. Checkout Classic
   has **no refund API** and no refund callback, so the refund is always **left to the venue**: the
   platform records the decision and amount and tells the venue, the venue refunds it by hand in
   Paysera, and the operator marks it done. That mark is the only completion signal the platform
   gets. The guest still sees the policy's amount. If Checkout Modern opens to Albanian merchants, a
   Modern adapter can execute refunds through its API instead.
6. **A venue's payment secret is a credential.** It is encrypted at rest, never logged, never
   returned by any API, and can be replaced. It is treated like a booking code (#7). Only the venue's
   owner connects or replaces it (#13).
7. **A payment collects for one venue only.** This already holds: a stay belongs to one venue
   (`stay.venue_id`, V65), so one payment's bookings never span venues. It must keep holding.
8. **One provider at launch, Paysera unless its answers rule it out.** POK now documents a refund
   API, including partial refunds, which corrects ADR-0009. Its webhook payload, signature and
   retries are still undocumented. That keeps POK as the challenger, asked the same questions as
   Paysera.
9. **Disputes and chargebacks belong to the venue.** The venue terms say so.
10. **Build order keeps the app working.** The venue-account path is built next to the current one,
    and `payout` is retired only after a real Paysera payment has confirmed a booking from start to
    finish.
11. **Providers are interchangeable adapters behind one provider-neutral port.** The application
    layer gives the same result whichever provider is wired: a booking waits for payment, a verified
    callback confirms it, and a refund is executed or handed to the venue. Exactly one gateway is
    wired per deployment, chosen by profile, as today:
    - **stub** (default profile): in-process, collects nothing, for local development and tests;
    - **`stripe`, sandbox only**: kept as the **demo** of the platform's capabilities. It collects
      into the platform's own Stripe *test* account and ignores the venue's payment account. The boot
      **refuses a live key**, so a demo can never take real money, which would break decision 1;
    - **`paysera`**: production, paying each venue's own project.

    To keep the port neutral, the Stripe shapes that leak through it today become provider-neutral:
    - the port is told **which venue is paid**;
    - the browser gets a **checkout instruction** (embedded, carrying a client secret; or a redirect
      URL) instead of `PaymentCredentials`' Stripe client secret, and the frontend's
      `StripePaymentGateway` becomes a neutral checkout seam with one implementation per provider;
    - a refund may come back as **left to the venue** (always so for Paysera Classic, decision 5);
    - webhook deduplication (`StripeWebhookEvents`, `stripe_webhook_event`) gets a neutral name;
    - jobs bound to the `stripe` profile today (the abandoned-payment sweep, the money-path alert)
      are bound to "a gateway that really collects" (`CollectionGuarantee`) instead.

    Whether a venue can sell online is a per-venue check of its payment account. The demo answers
    yes for every venue.

## Preconditions (Proposed → Accepted)

- **Albanian-registered venues can accept cards, and with them Apple Pay and Google Pay.** Both card
  rules published on paysera.al apply only to business clients registered in an EU member state.
  If Paysera confirms that, Paysera cannot be the provider, because foreign tourists pay by card.
- **Paysera confirms in writing** that each venue may add our domain to its own project's confirmed
  URLs, and that our platform may hold the venue's project password (its business agreement forbids
  disclosing "Passwords" to third persons). A "no" reopens this ADR. It does not fall back to
  collecting.
- An answer on whether sole traders can open a business account with Checkout, because it decides
  how many venues can sell online.
- A test setup: there is no sandbox, and test payments work on an unverified project, but whether
  one account may hold two test projects (to test venue A against venue B) is still open.

## Open questions

The published documentation was read on 2026-11-01. What it settles, and the email with the
remaining questions for Paysera, are in `docs/research/2026-11-01-paysera-venue-owned-checkout.md`.
The same questions go to POK.

## Consequences

- **The money that moves through the app shrinks to a payment status and a refund instruction.**
  The `payout` module loses its purpose: the ledger, batches, commission schedule
  (`venue_commission_rate`) and payout currency. ADR-0009's negative-period problem disappears with
  it. #9 has nothing left to protect and retires when `payout` does. #5 stays.
- **The venue-change fee (ADR-0021) has nothing to deduct from** and retires. That leaves a product
  gap: a venue whose remodel strands a guest no longer pays for it. If that gap matters, a later
  decision can make it part of the subscription terms.
- **`payment` gains a venue payment account**, which `payment` alone writes. The gateway port takes
  the venue, and the Paysera callback controller looks up the key by project. The Stripe adapter
  stays as the sandbox-only demo (decision 11), so the platform can be shown with no venue connected.
- **Checkout looks different per provider even though the result is the same.** Stripe is embedded
  in the page. Paysera sends the guest to its own page and back. Both leave the booking waiting until
  the verified callback confirms it.
- **Each venue carries Paysera's sign-up and identity checks**, plus the project's own review and
  verification of our domain in its project. Expect to help the first venues through it in person.
  That is the slowest step to launch, and it is people work, not code.
- **The venue bears Paysera's costs:** card commission (from 1.45% for EU consumer cards to 2.90% for
  non-EU cards), a **reserve of 100% of each card payment for 3 days and 5% for 3 months**, €30 per
  chargeback, and €0.50 per refund made after the day of payment.
- **The payment page and the booking page name the venue as the seller.** Paysera's card rules
  require the merchant's name to be shown prominently.
- **No-shows are covered by prepayment**, as they are today, so pay-at-venue rules are not needed.
- **Doc follow-ups on acceptance:**
  - mark ADR-0002 and ADR-0009 *Superseded by ADR-0029*;
  - reword #8 to be gateway-neutral, and retire #9;
  - drop the payout-currency provisional line from `CLAUDE.md`;
  - update the module table (`payout`, `venue`'s commission schedule), `CONTEXT.md` § *Money*,
    `RESPONSIBILITIES.md` and the spec's "commission per booking";
  - rewrite the `riviera-stripe-payments` skill as the venue-account payments skill.

## Alternatives considered

- **Keep collecting (ADR-0009).** Rejected: the platform carries fiscal and payment-services risk on
  money it does not keep, it owes payouts, and it may need clawback. It also needs a legal sign-off
  that no one can give.
- **Pay at the venue, with an online booking fee as the platform's only income.** It is clean on
  tax, but the guest has paid the venue nothing, so no-shows land on venues. That pushes them to take
  sets out of the online pool, and a fee at launch puts guests off. Kept as a fallback for venues
  without a Paysera account, not as the default.
- **Commission invoiced to venues** (the booking.com shape). Rejected: the platform chases payment
  from seasonal businesses that close in October.
- **A split-payment provider** (Stripe Connect, Adyen for Platforms, Mangopay, Lemonway). Rejected
  for the reason ADR-0009 gave: none verifiably accepts Albanian sellers with Albanian IBANs.
