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
   subscription is the preferred shape, and a Paysera partner share is a possible extra. It must
   never be a cut taken from, or invoiced against, a venue's takings, because that would bring back
   the receivable this decision removes. Choosing the price is a later decision.
3. **Online prepayment from day one.** A venue can sell online only once its payment account is
   connected and verified. Until then its sets are not bookable online.
4. **The webhook stays the source of truth** (#8). A booking is confirmed only by a
   signature-verified Paysera callback. The callback names the project, the project names the venue,
   and the venue's own key verifies the signature. Callback idempotency on the provider's event id
   stays.
5. **The refund policy stays server-side** (#10), and the amounts are calculated as they are today
   (ADR-0005, ADR-0026, ADR-0027). The refund is made **from the venue's account**, through the API
   if Paysera allows it on the venue's behalf (open question 2). If it does not, the platform records
   the refund decision and amount, tells the venue to refund it, and the operator marks it done. The
   guest still sees the policy's amount.
6. **A venue's payment secret is a credential.** It is encrypted at rest, never logged, never
   returned by any API, and can be replaced. It is treated like a booking code (#7). Only the venue's
   owner connects or replaces it (#13).
7. **A payment collects for one venue only.** This already holds: a stay belongs to one venue
   (`stay.venue_id`, V65), so one payment's bookings never span venues. It must keep holding.
8. **One provider at launch: Paysera.** POK stays out on ADR-0009's reading of its published docs
   (no refund API, no webhooks) unless that has changed.
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
    - a refund may come back as **left to the venue** (decision 5's fallback);
    - webhook deduplication (`StripeWebhookEvents`, `stripe_webhook_event`) gets a neutral name;
    - jobs bound to the `stripe` profile today (the abandoned-payment sweep, the money-path alert)
      are bound to "a gateway that really collects" (`CollectionGuarantee`) instead.

    Whether a venue can sell online is a per-venue check of its payment account. The demo answers
    yes for every venue.

## Preconditions (Proposed → Accepted)

- **Paysera confirms in writing** that a platform may create Checkout payments on many merchants'
  projects from its own domain with each merchant's credentials, or names the product that allows
  it (open question 1). A "no" reopens this ADR. It does not fall back to collecting.
- An answer on whether sole traders can open a business account with Checkout (open question 4),
  because it decides how many venues can sell online.
- A test setup with at least two projects, so that the separation of venue A from venue B can be
  tested (open question 3).

## Open questions for Paysera

1. May one platform, on its own domain, create Checkout payments for many merchants' projects using
   each merchant's project ID and signing password? If not, which product or agreement fits?
2. Can refunds, including partial ones, be made through an API for these payments, started by the
   platform on the merchant's behalf? How is that authenticated?
3. Is there a test or sandbox environment, and can several test projects be set up?
4. Can sole traders and small individual businesses in Albania, not only sh.p.k., open a business
   account with Checkout?
5. Is there an integrator or partner programme for platforms that bring merchants, and on what
   terms?

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
- **Each venue carries Paysera's sign-up and identity checks.** Expect to help the first venues
  through it in person. That is the slowest step to launch, and it is people work, not code.
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
