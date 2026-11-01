# POK for venue-owned checkout: what the published docs settle, and what to ask POK

**Status / provenance.** Findings only, no decision. The decision is ADR-0029 (draft PR #1686), which
keeps POK as the challenger to Paysera; the epic is #284. It is the companion to
`2026-11-01-paysera-venue-owned-checkout.md`, which covers Paysera, and its questions are the same.
Gathered 2026-11-01, and every source was read that day.

POK is the brand of **RPAY SH.P.K.** (rpay.ai redirects to pokpay.io). The sources, by label:

- **[coll]**: the POK Payments API reference, a Postman collection that `docs.pokpay.io` calls "the
  authoritative spec". It was fetched as JSON from
  `https://payments.doc.pokpay.io/api/collections/17029398/UVXojt72?segregateAuth=true&versionTag=latest`.
  It has 15 requests and was first published 2022-01-24.
- **[llms]**: `https://docs.pokpay.io/llms-full.txt`, the text bundle of docs.pokpay.io (JS, React, React
  Native, Flutter, PHP SDK, WooCommerce, PrestaShop, REST).
- **[woo]**: POK's own WooCommerce plugin 1.2.1. `includes/class-wc-gateway-pok.php` is dated
  2026-09-01. Source:
  `https://static.pokpay.io/public/dist/plugins/woocommerce/pokpaymentgateway-1.2.1.zip`, the link
  docs.pokpay.io gives.
- **[php]**: `github.com/pokpay-ltd/php-sdk` 1.5.1 (2024-10-14).
- **[js]**: npm `@nebula-ltd/pok-payments-js` 2.1.2 (2026-10-20, "© RPAY shpk").
- **[pay]**: the bundle shipped with the production hosted payment page, `https://pay.pokpay.io/`.
  This is code, not documentation: it shows what the page does today, and that can change.
- **[pf]**: the **merchant agreement for natural persons**, "KUSHTE PËRDORIMI DHE TERMA SHËRBIMI
  PËRDORUES PËRSON FIZIK", PDF title "…_Maj 2026". It is in Albanian only:
  `https://static.pokpay.io/public/uploads/termsAndConditions/pf_tac-al.pdf`. It is the file POK's own
  endpoint `https://api.pokpay.io/terms-and-conditions?type=PF_MERCHANT_AGREEMENT` returns. The
  translations below are mine.
- **[web]**: pokpay.io marketing and news pages.
- **[BoA]**: the Bank of Albania EMI register, `https://www.bankofalbania.org/rc/doc/Anglisht_34834.xlsx`.

**Re-checked** marks a quote I re-read in the source myself, on top of the research pass.

**Gaps that run through every question.**
- POK publishes **no merchant agreement and no fee list for a legal person (sh.p.k.)**. The
  `GENERAL_BUSINESS` document type returns the consumer terms. The only published merchant contract
  is [pf], for natural persons.
- POK publishes **no notification spec**. What is known about the callback comes from POK's own
  plugin source.

**Blocked / failed.** No host was blocked.
- pokpay.io renders on the client, so its documents were read through the endpoint above, and
  docs.pokpay.io through `llms-full.txt`.
- These all return 404:
  - `docs.pokpay.io/docs/{webhooks,refunds,…}.md`;
  - GitHub `pokpay-ltd/pok-payments-js`, `-rn` and `-flutter` (the JS SDK is read from its npm bundle
    instead);
  - `pokpay.io/business`.
- `isdk-web-staging.pokpay.io`, which appears in an old [coll] example, no longer resolves.

## TL;DR

1. **An Albanian business can take Visa and Mastercard online with POK, under a published contract.**
   - [pf] §4.1 admits a natural or legal person "që … ka zyrën qendrore në Shqipëri" (with its head
     office in Albania). That covers sole traders, and is the gate Paysera's card rules fail.
   - "International" cards appear only in marketing text.
   - **Apple Pay and Google Pay *acceptance* is not published.** Every POK mention of the two wallets is
     about putting POK's own cards into them.
2. **The callback is unsigned.** POK's own WooCommerce plugin: "The callback is not signed, so it is
   treated as a trigger only" *(re-checked)*. ADR-0029's "signature-verified callback" cannot hold
   for POK. A booking is confirmed by re-reading the order from POK with the venue's token.
3. **There is a refund API with partial refunds** (`POST …/sdk-orders/:id/refund`, `refundAmount`
   optional) *(re-checked)*. But:
   - it has no idempotency key, no refund id and no refund notification;
   - it is paid from the venue's POK balance, and fails with **402** "You do not have sufficient
     funds" when that balance is short *(re-checked)*.
4. **Contract risk on Q1.** [pf] §6.1 licenses the integration "Program" "për përdorim personal dhe
   ekskluziv" and says "ndalohet përdorimi ose transferimi i Programit tek palë të treta": personal
   and exclusive use, and no use or transfer to third parties *(re-checked)*. Whether our platform
   creating orders with a venue's API key is such use is POK's call. **Ask in writing.**
5. **Better than Paysera:**
   - per-merchant API keys that can be created and revoked one at a time;
   - order expiry settable per order (`expiresAfterMinutes`);
   - a real staging API with test cards;
   - no published card reserve;
   - the hosted page shows the venue's trade name.
6. **Worse than Paysera:**
   - card fee **2.5% + 0.20 EUR** against Paysera's 1.45–2.90%;
   - chargeback **75 EUR** against 30;
   - an undocumented **300 EUR per-transaction** error in an API example, and a published "up to 1000
     euros" business payment limit, either of which may cap a long stay;
   - amounts in decimal major units, so the adapter must convert (#5).
7. **Licence.** The Bank of Albania register lists RPAY (licence No. 50, 9.9.2021) for "Issuing
   electronic money" only, with the Law 55/2020 payment-services column empty *(re-checked)*. Paysera
   Albania's entry (No. 47) reads the same *(re-checked)*. Card money lands as e-money in the venue's
   POK account and reaches its bank on withdrawal. The platform never touches it.

## Paysera vs POK on the deciding gates

Details and citations are in each note. "Classic" means Paysera Checkout Classic, the only Checkout
open to Albanian merchants.

| Gate | Paysera (Classic, Albania) | POK |
|---|---|---|
| **Cards for an Albanian-registered merchant** | **No, as published.** Card rules: EU-registered business clients only. paysera.al: "Payments with Visa and Mastercard are available for natural and legal persons registered within the EU" | **Yes, as published.** [pf] admits businesses with their head office in Albania; Visa/MC online. Foreign cards: marketing text only |
| **Apple Pay / Google Pay acceptance** | Enabled with card payments ("have card payments activated"), so blocked by the same EU rule | **Not published.** The wallets appear only for POK-issued cards; an unnamed per-order express-wallet path exists in shipped code |
| **Platform holding the merchant's credentials** | Docs show platforms holding project ID + password. The business agreement (9.1.17/14.4) forbids disclosing "Passwords". Our domain must be confirmed in each project | Per-merchant `keyId`/`keySecret`, many keys per merchant, each tagged and revocable. [pf] §6.1 forbids third-party use of "the Program". No domain tie documented |
| **Refund API** | **None** ("There is no refund API"); the venue refunds by hand | **Yes**, full or partial. No idempotency key, no refund id, no refund notification; 402 if the venue's balance is short |
| **Signed notification** | ss2/ss3 RSA with **Paysera's** key, plus a `projectid` check; no event id | **Unsigned**, undocumented callback: re-fetch the order with the venue's token; no event id |
| **Expiry control** | `time_limit` 12 min – 3 days, "Applies to payment initiation only"; default undocumented | `expiresAfterMinutes` per order, then "can no longer be paid" and 410 Gone; default and maximum undocumented (examples: 15 min) |
| **Testing** | No sandbox; test payments on a production project | Separate staging API + test cards. How to get staging merchants, and how many, is undocumented |
| **Sole traders** | Not addressed; the Albanian agreement defines the client as "një person juridik" | **Yes**: the only published merchant contract is for natural persons; "SP - Sole Proprietorship" is a legal form at signup |
| **Fees** | Cards 1.45–2.90%, min 0.15 EUR; refund 0 / 0.50 EUR; chargeback 30 EUR; no monthly fee | Card 2.5% + 0.20 EUR; POK-wallet payer 1.7%; withdrawal to bank 0%; chargeback 75 EUR; no monthly fee listed (natural-person terms; sh.p.k. unpublished) |
| **Reserve / settlement** | **100% of each card payment for 3 days, 5% for 3 months** | No reserve published; credited instantly to the venue's POK account, then withdrawn to its bank ("one or two business days") |
| **Per-payment ceiling** | Apple/Google Pay listed to 10,000 EUR | "300 EUR per transaction" in an API example; "up to 1000 euros" business limit in news. Both unconfirmed for online cards |

---

## Q1: Cards and wallets for an Albanian merchant; currencies; acquirer

**Verdict: PARTLY.** Online Visa and Mastercard are answered. Foreign cards are marketing text only.
Apple Pay and Google Pay are not in the docs, and neither is the acquirer.

- **Online card acceptance.** "Accept payments via Visa/Mastercard, as well as from POK app users,
  directly on your platform through a single integration." *(re-checked)* The same page has a "For
  Booking Systems" section: "local and international customers". [web]
  https://pokpay.io/en/business/acquire
- **The contract.** [pf] preamble (iv) describes the integration as enabling the business "të
  pranojë pagesa nga procesimi i kartave të kreditit dhe debitit (guest checkout) nga Përdoruesit ose
  Jopërdoruesit" (to accept credit and debit card payments from POK users and non-users).
- **The card form.** [llms] says the card field takes "Visa, Visa Electron, Mastercard, Maestro".
- **Foreign-issued cards.** No published sentence says foreign-issued cards are accepted online, and
  none excludes them.
- **Who may sign up.**
  - [pf] §4.1: "person fizik ose juridik që nuk është US Person … që vepron për qëllime profesionale
    dhe ka zyrën qendrore në Shqipëri" (a natural or legal person, not a US person, acting
    professionally, with its head office in Albania).
  - The merchant dashboard's legal-form options include "SP - Sole Proprietorship" and "LLC -
    Limited Liability Company".
  - So **sole traders and sh.p.k. can both sign up**. Only the natural-person contract is published.
- **Apple Pay and Google Pay: NOT IN DOCS as acceptance methods.**
  - What POK publishes is about issuing. https://pokpay.io/en/apple-pay: "Apple Pay ju lejon të kryeni
    blerje me kartën tuaj POK" (Apple Pay lets you buy with your POK card). https://pokpay.io/en/news/34
    (1 Apr 2026): "POK users can add their POK digital cards to iPhone, Apple Watch…".
  - The API reference's card section covers card encryption, tokenization and 3DS only.
  - [js] 2.1.2 and [pay] render an express-wallet block only when an order has
    `walletPaymentsEnabled === true`. It runs through a "capture context" and
    `window.VAS.UnifiedCheckout`. Neither the code nor the docs name the wallets, or say how the flag
    is turned on.
- **Currencies: ALL and EUR are evidenced, with no published list.**
  - [pf] writes fees as "2.5% + 20 Lekë/0.2 Euro".
  - [coll] creates orders in `ALL`, [php] in `EUR`.
  - Orders carry `originalCurrencyCode`, `appliedExchangeRate`, so POK may convert.
  - For splits, `splitWith.merchantId` "must have an account with the order currency", so a merchant
    holds an account per currency.
- **Acquirer: NOT IN DOCS.**
  - [pf] §2.1 defines a chargeback as running between "bankës së nivelit të dytë ku ndodhet llogaria
    bankare e RPay për Biznesin" (the commercial bank holding RPay's account for the Business) and the
    payer's bank. The bank is not named.
  - POK names partners without saying who acquires: "Visa, CREDINS BANK, Raiffeisen Bank Albania,
    Cybersource, Procard Processing Centre" (https://pokpay.io/en/news/19, 15 Oct 2025).
  - [llms] mentions Cybersource device data collection and "Visa Terminal (procard)" flows.
- **Licence.** The register lists RPAY for "Issuing electronic money" only *(re-checked)*. Law 55/2020
  Annex 1 point 5, "acquiring of payment transactions", is not among the services listed for it.
  [pf] frames the service as provided "në cilësinë e tij si Institucion i Parasë Elektronike" (in its
  capacity as an e-money institution). Whether that is enough to acquire cards for merchants is a
  legal question the published sources do not answer. Paysera Albania's entry reads the same.

## Q2: One platform, many merchants; credentials; `splitWith`; terms

**Verdict: PARTLY.**

### How credentials work

Answered by the docs.

- **Each venue issues its own key.** "`keyId` and `keySecret` are issued by PokPay ( from your merchant
  dashboard. At E-payments dropdown you will find API Keys option…)". [llms]
- **The key works for one merchant only.** A 403 on create means "Your `keyId` / `keySecret` is for a
  different merchant than the `merchantId` in the URL". [llms]
- **Login.** `POST /auth/sdk/login` returns a bearer JWT with `expiresAt` *(re-checked)*. The token
  lifetimes in the examples disagree (3600000 / 600000 / 3600), so rely on `expiresAt`. No refresh
  endpoint is documented: "call login again".
- **Which endpoints need the token.**
  - Create, capture, refund, cancel and the detailed retrieve need the bearer token, all under
    `/merchants/:merchantId/…`.
  - `GET /sdk-orders/:id` needs **no** auth. [coll], [woo]: "Retrieving an order needs no
    authorization".
- **Keys can be many and revocable.** The dashboard text lets a merchant hold several API keys, each
  with a tag and description: "Delete the API key “{{tag}}”? Anything that uses it will stop
  working." A venue can therefore give us a **dedicated key it can revoke on its own**. No scope
  narrower than "the whole merchant" is documented.
- **Staging and production keys are separate.** "Staging credentials work only with
  `https://api-staging.pokpay.io`". [llms]
- **No delegation exists.** There is no partner or delegated credential, no OAuth or "connect" flow,
  and no endpoint that acts for another merchant [coll].
- **No domain tie is documented.** The return URLs and `webhookUrl` are set per order. Nothing
  matches Paysera's confirmed-URL rule.

### What `splitWith` does

- [coll] describes it as "Parameters needed when the merchant is splitting the order's payment amount
  with another merchant".
  - `splitWith.merchantId` is the other merchant; `splitWith.userPhoneNumber` sends the share to a
    POK *user* instead.
  - `splitWith.amount` "has to be less than amount".
  - The sources disagree on the field: [php] has `percentage`, and [woo] converts a percentage to
    `amount`.
- The order is created on **one** merchant's account, and a share goes to one other POK account.
- **Not documented:** who the merchant of record is, who bears fees on the share, how refunds work
  after a split, and any marketplace product.
- POK advertises "Building a Marketplace? … split payments between partners"
  (https://pokpay.io/en/business/acquire). The marketing has no published contract behind it.
- `isAffiliate` appears only as `false` in examples, with no description. **NOT IN DOCS.**

### The terms ([pf], May 2026)

- **§6.1** is the main risk: "Kjo licensë i jepet Biznesit për përdorim personal dhe ekskluziv. Për
  këtë shkak, ndalohet përdorimi ose transferimi i Programit tek palë të treta."
  ("This licence is granted to the Business for personal and exclusive use. For this reason, using
  or transferring the Program to third parties is prohibited.") *(re-checked)*
  - §2.1 defines the "Program" as RPay's integration tools (instructions, software, technical data).
  - The "Terminal" it is installed on includes "server i cili mban faqen web" (the server hosting the
    website).
  - Our server holding the venue's key and creating orders on our domain can be read as a third
    party using the Program.
- **§5 and §5.1** only *recommend* keeping the dashboard password secret. The Business is "përgjegjës
  … për pasojat e shpërndarjes ose të përdorimit të tyre nga palë të treta" (responsible for the
  consequences of their distribution or use by third parties). That clause assigns liability for
  sharing; it does not forbid it.
- **§22** fits ADR-0029: "Biznesi gjithashtu merr përsipër të përdorë Llogarinë vetëm për
  transaksionet e tij" (the Business uses the Account only for its own transactions) *(re-checked)*.
  Each venue collects only its own bookings.
- **§10**: the Business must visibly tell the public at its physical or online points of sale that it
  uses RPay. It also needs RPay's prior consent to use RPay's brand or logo.

## Q3: Refunds

**Verdict: PARTLY.** The endpoint and partial refunds are documented. The behaviour that matters for
a reliable refund is not.

- **The endpoint.** `POST /merchants/:merchantId/sdk-orders/:sdkOrderId/refund` with the merchant's
  bearer token. Its fields:
  - `refundAmount`: "The amount to refund from the order payment. If not specified the order will be
    fully refunded." *(re-checked)*
  - `refundReason`: documented as optional, but the 400 example on the same request says
    `"refundReason" is required` *(re-checked)*. Always send it.
- **The response** is the whole order with `isRefunded: true`.
  - There is no refund id, refund object, refunded total or status enum.
  - How a partial refund shows up, and whether more than one is allowed, is **not documented**.
- **Refunds come from the venue's balance.**
  - The request's 402 example: "You do not have sufficient funds. Please top up your account!"
    *(re-checked)*.
  - [pf] §8 says the same: refunds go out of POK Merchant "duke marrë parasysh që Balanca duhet të
    jetë e mjaftueshme" (the Balance must be sufficient), otherwise "Biznesi duhet të rimbushë
    Llogarinë" (the Business must top up the Account).
  - [pf] §7.2: "Llogaria nuk mund në asnjë rast të ketë Balancë negative" (the Account can never go
    negative).
- **Not documented:**
  - an idempotency key or any duplicate protection;
  - a time limit;
  - a refund notification.
- **Fees.** None are listed for refunds in [pf].
- **POK's own integrations don't use it.** Neither plugin calls the refund API, and the WooCommerce
  checklist says to "refund it via the POK dashboard" [llms].

## Q4: Notifications (`webhookUrl`)

**Verdict: NOT IN DOCS.** What follows is from POK's own plugin code, not a spec.

- **What the reference shows.** [coll] Create Order: `webhookUrl`, "Webhook URL", optional, validated
  as "must be a valid uri".
  - No payload, event types, signature, retry policy or event id is documented in [coll], [llms] or
    [php].
  - Chargebacks are not mentioned anywhere in the API docs.
- **What [woo] 1.2.1, POK's own plugin, does:**
  - **Unsigned.** "The callback is not signed, so it is treated as a trigger only: the order is
    retrieved back from POK and the payment is completed only when POK itself reports it confirmed."
    *(re-checked)*
  - **Duplicates.** "POK may deliver the same notification more than once." *(re-checked)* The plugin
    dedupes on its own order state.
  - **Retries.** On a failed re-fetch it returns 502, "so POK retries the callback". That is the
    plugin's assumption. No retry schedule is published.
  - **Correlation.** The plugin carries its own order id in the URL (`?wcOrderId=<id>`), stores POK's
    order id, and sets `merchantCustomReference` to its own id, which it cross-checks after the
    re-fetch.
  - **Payload shape unknown.** It tries `sdkOrderId`, `orderId`, `id` and `data.sdkOrder.id`, and
    accepts any of CONFIRMED, PAID, CAPTURED, COMPLETED, SUCCESS or SUCCEEDED.
  - **Re-fetch.** It uses the unauthenticated `GET /sdk-orders/{id}`.
- **POK's sources disagree.** The PrestaShop module (2022) sends an empty `webhookUrl`, while the
  PrestaShop troubleshooting page in [llms] still mentions a "Capture webhook".

## Q5: Order lifecycle and expiry

**Verdict: PARTLY.**

- **Expiry.** `expiresAfterMinutes`: "Set the `expiresAt` field of the created sdk order. If the given
  amount of minutes passes the sdk order can no longer be paid." *(re-checked)* Retrieving an expired
  order returns **410 Gone**, "SDK order expired".
  - The **default and maximum are not documented**.
  - The examples show 15 minutes with the field unset, and 1440 when set to that. [woo] defaults to
    10.
- **State is a set of booleans, not an enum:** `isCompleted`, `isCanceled`, `isRefunded`,
  `hasFailedPaymentFlow`.
  - `transactionId` is set when paid.
  - `paymentMethod` is `rpay-credit` (POK wallet) or `credit-debit-card`.
  - `sdkOrderPaymentFlows[]` records the 3DS steps, with `isSuccessful` and `errorMessage`.
- **Capture.** `autoCapture` is required. With `false`, `/capture` (≤ total) and `/cancel` ("release
  the frozen funds") apply.
- **Amounts are decimal major units** (`"grossAmount": 100.2`).
- **Commission.** `commissions.grossAmount` is "Total amount to be paid including commission". In
  the example the gross is net + 0.20, which would put POK's fee on the payer. **Not documented.**
- **Ceiling.** A detailed-retrieve example fails 3DS with "The maximum amount of 300 EUR per
  transaction was exceeded" *(re-checked)*. Separately: "POK has increased the payment limit for
  businesses, now allowing transactions of up to 1000 euros" *(re-checked)*
  (https://pokpay.io/en/news/32, 20 Nov 2025). Which limit applies to online guest card payments is
  **not documented**.

## Q6: Checkout flow

**Verdict: PARTLY.** Both a hosted redirect and an embedded SDK are documented. What the hosted page
shows comes from shipped code.

- **Hosted redirect.**
  - The create response returns `_self.confirmUrl`, e.g. `https://pay-staging.pokpay.io/sdk-orders/{id}`,
    and `confirmDeeplink` (the POK app).
  - Prefill parameters: name, email, phone, address and `language`, "AL, EN, IT. Page default is EN".
  - Return URLs: `redirectUrl` and `failRedirectUrl`.
  - Both POK plugins use this redirect. That contradicts the [llms] WooCommerce page ("no redirect").
- **Embedded.** React `GuestCheckoutForm`, the CDN `PokPayment`, `encryptCard()` with your own UI,
  React Native and Flutter [llms] [js]. The backend creates the order and the client confirms it.
- **What the guest sees on the hosted page** [pay]:
  - **"Payment at" / "Pagesë tek" followed by the merchant's `tradeName` and logo**, so the venue's
    name;
  - "Scan with app" (POK wallet) and "Credit Card", with Visa, Visa Electron, MasterCard and Maestro;
  - the express-wallet block only when `walletPaymentsEnabled`.

## Q7: Testing

**Verdict: PARTLY.**

- **A staging environment exists.** Staging API `https://api-staging.pokpay.io` ("non-billing and
  safe for development"); staging page `https://pay-staging.pokpay.io`. ADR-0009's "separate staging
  env + test cards" still holds.
- **Test cards.**
  - [llms] lists 4242 4242 4242 4242 (no 3DS), 4000 0000 0000 1091 (3DS challenge), 4000 0000 0000 1026
    (frictionless) and 5200 0000 0000 1005 (Mastercard, 3DS). Any future expiry works.
  - [coll] lists 4111 1111 1111 1111 and 4000 0000 0000 1091 with a fixed **12/26** expiry, which
    lapses after December 2026.
  - MOTO is "[Staging environment only]".
- **Not documented:**
  - how to get a staging merchant account (the docs say only "from the PokPay dashboard");
  - the staging dashboard URL;
  - **whether several test merchants can be set up**.
- **Webhook reachability.** Nothing is documented beyond "valid uri". POK's servers call it, so in
  practice it must be public.

## Q8: Onboarding

**Verdict: PARTLY.** The steps and identity checks are published. **No approval time is published.**

- **Approval.** [pf] §4.1: "Biznesi duhet të miratohet nga RPay" (the Business must be approved by
  RPay) after verifying its identity, email, beneficial owners and mobile number.
  - A legal person must submit its founding documents ("dokumentet e krijimit të tij nëse është person
    juridik").
  - The decision comes by email.
  - The anti-money-laundering duties under Law 9917 are in §22.
- **Dashboard flow.**
  1. Phone signup.
  2. Business profile: name, trade name, NUIS, address, legal form, fields of operation.
  3. Personal data.
  4. ID document, front and back.

  "The process may take up to 60 minutes" refers to identity verification, not business approval.
  Registration needs a laptop browser, not iOS.
- **Elsewhere.** POK's e-commerce service has "a simpler, fully digital process" with no upfront
  installation costs (https://pokpay.io/en/news/39, 25 Sep 2026). No duration is given.
- **Not documented:** the exact documents for an sh.p.k. or a sole trader, the approval time, and
  whether e-commerce needs separate activation.

## Q9: Fees and settlement

**Verdict: PARTLY.** Fees are published for natural-person merchants, from [pf] "Kushtet e Veçanta
§2". **sh.p.k. pricing is not published.**

| Item | Published value |
|---|---|
| Online card, payer not a POK user | "2.5% + 20 Lekë/0.2 Euro" *(re-checked)* |
| Payer is a POK app user | "1.7 %" *(re-checked)* |
| Withdrawal to the Business's bank account | 0% |
| Monthly or setup fee | none listed |
| Refund fee | none listed |
| Chargeback | "shtatëdhjetë e pesë (75) euro për çdo procedurë Charge Back" (75 EUR each) *(re-checked)*. Liability "gjithmonë e Biznesit" (always the Business's). A shortfall becomes a debt due within 3 months, then interest |
| Fee changes | 2 months' written notice, with free termination (§17) |

- **Settlement.** Funds are credited "në çast" (instantly) to the venue's POK merchant account
  (§7.6.3). The venue withdraws "në çdo moment" (at any time) to its declared bank account (§7.1).
  The dashboard text says "The transfer may take one or two business days" and offers scheduled
  automatic withdrawal.
- **Reserve or holding period:** none in [pf]. **NOT IN DOCS.**
- **Referral programme.** POK runs a "Sill POK" referral programme for "Zhvillues, agjenci web ose
  digjitale, freelancerë, partnerë" (developers, web or digital agencies, freelancers, partners).
  - It pays 2,500–4,000 ALL per e-commerce business referred, plus a 5,000 ALL quick-start bonus.
  - A business qualifies after signing and making ≥3 real transactions totalling ≥2,000 ALL / 20 EUR.
  - It runs for 3 months from a launch date POK announces.
  - Source: https://static.pokpay.io/public/uploads/termsAndConditions/referral_promo_tac-al.pdf.

## Q10: Apple Pay / Google Pay on Paysera Checkout Classic for Albanian merchants

**Verdict: PARTLY.** Paysera publishes no route to the wallets for an Albanian-registered merchant.
That conclusion chains two of its statements; no single sentence says it.

- **The wallets are Classic payment codes.** Classic's Payment Types page lists `apple_pay` and
  `google_pay` under **Albania** *(re-checked)*.
  - The country there is the **payer's**: the `country` request parameter "Shows payment methods
    available in that country".
  - The page also notes "Payment method availability depends on your project configuration".
  - https://developers.paysera.com/guides/checkout-classic/getting-started/payment-types
- **The blog posts name no version or country.** Paysera's Apple Pay post (April 2024) and Google Pay
  post (November 2024) enable the wallets automatically for a Checkout user who has "card payments
  activated". They never name Classic or Modern, any country, or Albania.
  https://www.paysera.com/v2/en/blog/apple-pay-checkout,
  https://www.paysera.com/v2/en/blog/google-pay-checkout
- **Card payments are EU-only.** paysera.al: "Visa, Mastercard, and Maestro cards, as well as Apple
  Pay and Google Pay, are accepted for payment. Payments with Visa and Mastercard are available for
  natural and legal persons registered within the EU." *(re-checked)*
  https://www.paysera.al/v2/en-AL/payment-gateway-checkout
- **Modern says the merchant's country matters.** For contrast: "Merchant country matters, not just
  the payer's" *(re-checked)*.
  https://developers.paysera.com/guides/checkout-modern/reference/payment-methods

The question is added to the Paysera note's email (question 1).

---

## Implications for ADR-0029 / #284

Proposed changes; none is applied here.

**The deciding precondition.** The design needs cards from foreign tourists, which ADR-0029 already
treats as a precondition. POK is the only one of the two whose *published* contract lets an
Albanian venue take them. It has three open points: whether foreign-issued cards are accepted
online, which per-payment ceiling applies, and whether a platform may use the venue's key under
§6.1. If Paysera confirms its EU-only card rule, POK becomes the provider, and the ADR's "one
provider at launch" (decision 8) flips to POK. Neither provider publishes Apple Pay / Google Pay
acceptance for an Albanian merchant. The precondition should therefore separate **cards (required)**
from **wallets (wanted)**, or it can be met by neither. That split is Ivo's call.

### Decisions to reword (if POK)

- **Decision 4 and invariant #8.** "Confirmed only by a signature-verified callback" cannot hold for
  POK. A gateway-neutral wording would be: *"A booking is confirmed only by a payment state the
  platform has verified with the provider: a signed callback, or an authenticated read of the
  provider's record."* For POK, the verification sequence is:
  1. The callback arrives at a per-venue path carrying our payment row id. **Never the booking code**
     (#7).
  2. Log in with that venue's key.
  3. `GET /merchants/{venueMerchantId}/sdk-orders/{id}`: the authenticated read, which also proves
     the order belongs to that venue.
  4. Check `isCompleted`, `transactionId`, amount, currency and `merchantCustomReference`.

  Never use the unauthenticated `GET /sdk-orders/{id}`.
- **Dedup (#1688).** There is no event id. The key is `(provider, venue merchantId, sdkOrderId)`, and
  the state transition itself is the guard. The same shape fits Paysera Classic's
  `(projectid, orderid, status)`. #1688's "provider + event id" should become "provider + a
  provider-scoped payment reference".
- **Decision 5 and refunds.** POK can execute refunds, so a POK venue does not need the manual path
  for every refund. Two gaps keep **P4 needed either way**:
  - **No idempotency key.** A timeout leaves the outcome unknown. The adapter must record the attempt
    before calling. After a timeout it re-reads the order (`isRefunded`), never retries blindly. If
    the result is still unclear it hands over to "left to the venue". A partial refund cannot be
    told apart from a full one by `isRefunded` alone, so a second partial refund is never retried
    without a read that shows the amount.
  - **402 on a short balance.** A venue that has withdrawn its takings blocks the refund. That
    outcome becomes "left to the venue", so the guest still sees the policy's amount (#10).
- **Decision 6.** The venue should create a **dedicated, tagged API key** for us. It can revoke that
  key alone, and the console tells it how. P1 stores `merchantId` + `keyId` + `keySecret`.
- **Decision 2.** POK's "Sill POK" referral bonus would be platform income paid by POK, not a cut of
  venue takings, so decision 2 does not rule it out. It is time-limited and small. Taking it is a
  decision, not a finding.
- **Consequences.**
  - Venue costs on POK: 2.5% + 0.20 EUR per card payment and 75 EUR per chargeback, with no reserve
    published.
  - Takings sit as **e-money in the venue's POK account** until it withdraws them.
  - The hosted page already names the venue. [pf] §10 also asks the venue to show publicly that it
    uses POK.

### Slices

- **P2 (adapter), if POK:**
  - Login per venue with token caching (`expiresAt`).
  - Create the order with `autoCapture: true`, `expiresAfterMinutes` matched to the availability hold,
    `merchantCustomReference` = our payment row id, a per-venue `webhookUrl`, and `redirectUrl` /
    `failRedirectUrl`.
  - Convert decimal major units ↔ minor units at the adapter (#5).
  - **Check a per-provider ceiling before checkout**, until POK confirms 300 or 1000 EUR. A stitched
    stay (ADR-0024) is one payment for several bookings and can exceed it.
- **#1691 (checkout instruction).** POK supports both shapes, redirect (`confirmUrl`) and embedded
  (JS SDK). The redirect is the smaller first step and matches Paysera.
- **#479 (orphan reconciliation).** **Q0 is answered for POK.** An order past `expiresAfterMinutes`
  "can no longer be paid" and reads 410 Gone, so no orphan stays payable.
- **#102 (disputes and reconciliation).** No chargeback notification is documented, so disputes
  surface only in POK's dashboard. Reconciliation can read each order with the venue's token, but no
  list or statement endpoint is documented.
- **ADR-0029 decision 8's description of POK** should be updated:
  - a callback exists, but it is unsigned, by POK's own plugin;
  - there is a staging API;
  - Visa/Mastercard are open to Albanian businesses under the published natural-person contract.

---

## Still to ask POK

Send to **contact@rpay.ai**, the contract and communication address in the merchant agreement (§7.4.2,
§14) and the Bank of Albania register. Cc **support@rpay.ai**, the technical support address (§15).
Ask for written answers. POK publishes no partnerships address.

> **Subject:** Integrating POK for many Albanian beach venues: questions before we build
>
> Hello,
>
> We are building an online booking service for beach venues on the Albanian coast. Guests, mostly
> foreign tourists, pre-book sunbeds and pay online. Each venue would open its **own** POK merchant
> account. Our platform would create each order on that venue's account and confirm the booking
> from your system, so the guest pays the venue directly. We never receive or hold the money, and we
> charge the venues nothing. We have read docs.pokpay.io, the Payments API reference and the merchant
> agreement for natural persons (May 2026). We would be grateful for written answers:
>
> 1. **A platform using the venue's API key.** Each venue would create a dedicated API key in its POK
>    dashboard and give our platform the `keyId`, `keySecret` and `merchantId`, stored encrypted.
>    With them our server would create orders, read them and make refunds for that venue only. Is
>    this allowed under clause 6.1 of the merchant agreement ("ndalohet përdorimi ose transferimi i
>    Programit tek palë të treta")? If not, is there a platform or partner agreement for it? Can an
>    API key be limited to fewer permissions?
> 2. **Cards from foreign tourists.** Can a venue accept online payments with **foreign-issued** Visa
>    and Mastercard cards (EU, UK, US)? In which order currencies (EUR, ALL)? Who is the acquirer?
> 3. **Apple Pay and Google Pay.** Can a POK merchant accept Apple Pay and Google Pay online? If so,
>    how is it enabled (the `walletPaymentsEnabled` order flag?), and at what fee?
> 4. **Limits.** An example in the API reference fails with "The maximum amount of 300 EUR per
>    transaction was exceeded", and your news of 20 November 2025 mentions "up to 1000 euros" for
>    businesses. What is the maximum for one online card payment to a merchant, and does it depend on
>    the merchant's legal form or verification level?
> 5. **Payment notifications (`webhookUrl`).**
>    - What does the notification contain, and for which events (paid, failed, expired, refunded,
>      chargeback)?
>    - Is it signed, or is a signature planned?
>    - What is the retry schedule?
>    - Is there a unique event id?
>    - Is reading the order with `GET /merchants/{merchantId}/sdk-orders/{id}` the recommended way to
>      confirm a payment?
> 6. **Refunds.**
>    - Can one order be refunded partially more than once?
>    - Is there an idempotency key, or another way to make a retried refund safe after a timeout?
>    - How is the refunded amount shown on the order?
>    - Is there a time limit for refunds?
>    - What should we expect when the venue's balance is too low (the 402 response)?
> 7. **Order expiry.** What are the default and the maximum of `expiresAfterMinutes`? Can a payment
>    already in progress (for example in 3DS) complete after `expiresAt`?
> 8. **Commission.** Does `commissions.grossAmount` ("Total amount to be paid including commission")
>    mean the payer pays POK's fee on top, or is it deducted from the merchant?
> 9. **Sh.p.k. merchants.** The published merchant agreement is for natural persons. Which agreement
>    and fees apply to an sh.p.k.? Is there any reserve or holding period on card payments for either
>    form?
> 10. **Onboarding.** Which documents does a sole trader (person fizik with a NIPT), or an sh.p.k.,
>     need for a merchant account with online card payments? How long does approval usually take? Is
>     e-commerce activated separately?
> 11. **Testing.** How do we get staging merchant accounts? Can we have two or more, so we can test
>     that a payment to venue A never confirms a booking at venue B? Will the test cards in the API
>     reference (expiry 12/26) be renewed?
>
> Thank you,
> Ivo Pogace
