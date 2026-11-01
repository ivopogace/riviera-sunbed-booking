# Paysera for venue-owned Checkout projects: what the published docs settle, and what to ask Paysera

**Status / provenance.** Findings only, no decision. The decision is ADR-0029 (proposed in draft PR
#1686, branch `claude/adr-0029-venue-owned-payments`), tracked by epic #284. Gathered 2026-11-01.
Every page below was read on **2026-11-01**. The labels:

- **[dev]**: `developers.paysera.com`, the current Docusaurus site. It is split into
  `/guides/checkout-classic` (the old Checkout, "WebToPay") and `/guides/checkout-modern` (the new
  OAuth2/REST Checkout). The old spec URLs (`/en/checkout/basic`, `/en/checkout/integrations/…`) now
  return 404.
- **[src]**: Paysera's own GitHub, `github.com/paysera/lib-webtopay`. The Classic PHP library is at
  release **3.1.6, published 2026-07-17**, and is still maintained.
- **[terms]**: the Paysera Albania legal index, `https://www.paysera.al/v2/en-AL/legal` (sq:
  `/v2/sq-AL/ligjore`), and the fee pages on paysera.al. The merchant supplements are group
  templates: some still cite Lithuanian or EU law even on paysera.al. Each document's date is given
  where it is cited.
- **[BoA]**: the Bank of Albania EMI register.
- **[pok]**: `docs.pokpay.io` and the API reference it calls authoritative,
  `payments.doc.pokpay.io`.

**Re-checked** marks a quote I re-read on the live page myself, on top of the research pass.

**Blocked.** `support.paysera.com` (the help centre) answers every non-browser client with a
Cloudflare bot challenge (HTTP 403), and the built-in browser stayed stuck on it. It was not
bypassed. Its articles on refunds, website-ownership confirmation, test payments and project
creation were **not read**, and no search-engine snippet of them is used as evidence.

## TL;DR

1. **Albanian venues get Checkout Classic only.** Checkout Modern is "currently open to merchants in
   Lithuania, Latvia, Estonia, Bulgaria, Kosovo and North Macedonia". The refund API, HMAC webhooks,
   per-project OAuth credentials and the "For Platforms" programme are all Modern features.
2. **Classic has no refund API.** Every refund, full or partial, is made by hand from the venue's
   Paysera account. No refund or chargeback callback is documented either. **P4 is needed, not
   conditional.**
3. **Q1 is not a "no". It is unsettled on two points only Paysera can answer:**
   - *the domain*: a project may be used only on URLs the merchant gave and Paysera confirmed, and
     the request's referer is checked as well;
   - *the credentials*: the business agreement forbids disclosing "Passwords" to third persons,
     while the developer docs describe platforms that hold merchants' project credentials.

   Paysera's Modern "For Platforms" page describes ADR-0029's shape almost word for word: merchants
   "contract with Paysera directly", with "no fees". That is the strongest support for the design.
4. **New blocker, not in ADR-0029 or #284.** Both card supplements published on paysera.al apply
   only to business clients "registered in the centre of registers of a member country of the
   European Union". The Albanian text says *legal persons*. Read literally, no Albanian venue can
   take cards, whether it is an sh.p.k. or a sole trader. This is probably a group template carried
   over, but it is the published text. **It hits ADR-0009 equally.**
5. **The callback is not verified with "the venue's own key" in Classic's usual mode.** ss2 and ss3
   are RSA signatures checked with *Paysera's* public key, the same for every venue. The venue is
   bound by a per-venue callback URL plus a check of `projectid` in the payload. Only ss1 and the
   encrypted-callback mode use the venue's project password.
6. **An unpaid Classic checkout can be bounded.** `time_limit` takes 12 minutes to 3 days, in
   Europe/Vilnius time, but it "Applies to payment initiation only". The default lifetime without it
   is not documented. Setting it on every checkout mostly settles #479's Q0 for Paysera. What
   happens to a payment initiated just before the limit is still to be asked.
7. **There is no sandbox.** Testing uses a real account and project with "Allow test payments". Test
   payments work before the domain is verified.
8. **There is no paid partner programme.** The affiliate programme has taken no new clients since
   18 May 2020, and the platform integration ID "carries no fees". ADR-0029's "Paysera partner share
   is a possible extra" has no published basis.
9. **The docs correct ADR-0009 in three places:**
   - POK *does* document a refund endpoint, with partial refunds;
   - POK has a `webhookUrl` field, but its payload and signature are undocumented;
   - Paysera *does* document a split-payments ("marketplace policy") feature, but on Modern only.

---

## Q1: One platform creating Checkout payments on many merchants' projects

**Verdict: PARTLY.** Technically it works. The words that would allow or forbid it are not
published, so it must be asked in writing.

### What works technically

- **The URLs are per request.** In Classic, `accepturl`, `cancelurl` and `callbackurl` are
  required parameters of every payment request. Example for `callbackurl`: "Full URL where Paysera
  sends payment status notifications." [dev]
  https://developers.paysera.com/guides/checkout-classic/getting-started/request-parameters
- **The request is signed with the venue's credentials.** Classic signs with `sign =
  md5(data + password)`, using the project ID and project password. [dev]
  https://developers.paysera.com/guides/checkout-classic/getting-started/making-your-first-payment/custom-integration
  Nothing in the request identifies the caller as anyone other than the project's owner.
- **Paysera documents platforms holding merchant credentials.** Shopify (legacy Classic): the
  merchant enters "Project ID" and "Project Password" into the platform, and adds the platform's
  hosts to its own project: "add these URLs to your project settings … https://shopify-integration.paysera.com,
  https://platforms.paysera.com, https://CREATED-NAME.myshopify.com". Ecwid and WiX are documented
  the same way, as "additional hosts". [dev]
  https://developers.paysera.com/guides/checkout-classic/paysera-plugins
- **Modern describes a platform with merchant credentials.** "a merchant that moves from one platform
  to another is re-attributed by the new one, which reports with the project credentials the
  merchant gave it." [dev]
  https://developers.paysera.com/api/checkout-modern/set-integrator-id

### What constrains it

- **The domain is checked.** Error 0x13, "URL address mismatch": "The accepturl, cancelurl,
  callbackurl, or referer address differs from the addresses confirmed in the project."
  *(re-checked)* The page adds: "It is enough to provide your website domain, no need to type the
  exact path", and under solutions, "If using a platform, check if it requires additional addresses
  to be added to your project". [dev]
  https://developers.paysera.com/guides/checkout-classic/error-codes
- **The domain must be verified.** "You were asked to provide your domain during project creation.
  Now you need to verify your ownership of that domain." This is done with
  `<meta name="verify-paysera" …>` on the site's index page. Also: "Only verified projects can make
  real payments." [dev]
  https://developers.paysera.com/guides/checkout-classic/getting-started/obtaining-credentials
- **The terms tie the service to the merchant's own e-shops.** Online collection supplement
  (en-AL "Last updated: 20/07/2020"), cl. 6: "The Merchant can use the service of payment processing
  only in such E-shops of the Merchant and only by such website addresses (URL) which have been
  provided in the Project submitted by the Merchant and confirmed by Paysera." *(re-checked)* Under
  cl. 49.5, use on unconfirmed URLs lets Paysera suspend the service and freeze funds for up to 180
  days. [terms] https://www.paysera.al/v2/en-AL/legal/collection-of-payments-via-internet-2020
- **The card rules repeat the tie.** Card rules, Modern ("Valid from: 2026-09-01"): "E-shop – a
  website of the Merchant provided in the Questionnaire". Cl. 11.15 repeats the confirmed-URL rule.
  Cl. 11.21.1 requires the merchant to "prominently display and identify the name of the Merchant on
  the website". [terms] https://www.paysera.al/v2/en-AL/legal/card-payment-collection-rules
- **Credentials may not be shared.** General Payment Services Agreement for business clients,
  Albania ("comes into force: 15 October 2025"):
  - 9.1.17 prohibits "disclosing Passwords and other personalised safety features of Payment
    Instruments to third persons and allowing other persons to use the Services under the name of
    the Client". *(re-checked)*
  - 14.4: "The Client undertakes to protect and not to disclose any Passwords … to third persons".
    *(re-checked)*
  - "Password" is defined broadly. It covers any code "for the initiation, confirmation and/or
    management of individual services … or payment receipt".
  - Neither the agreement nor the supplements name the *project* password. Whether it counts as a
    "Password" here is an **interpretation, not stated text**.

  [terms] https://www.paysera.al/v2/en-AL/legal/general-payment-service-agreement-for-business
- **No delegated credential exists on either API.** Classic has project ID + password only. The
  `developerid` request parameter ("Your unique developer ID if you're registered as a developer in
  Paysera system") is documented nowhere further. In Modern, "Each set of credentials is scoped to a
  specific project". There is no OAuth "on behalf of" grant.

### What fits ADR-0029

- **Selling for another party is forbidden, and that fits the venue-as-merchant model.** Card rules
  12.8 forbid accepting a card "for commercial activity performed by a third party". *(re-checked)*
  In ADR-0029 the venue is the merchant and sells its own service, so this clause fits. It counts
  *against* ADR-0009's platform-collects-as-agent model.
- **Paysera's platform product is ADR-0029's shape, but Modern-only.** The "For Platforms" page:
  - it addresses "an e-commerce platform, a CMS, a marketplace, or a hosting product that lets your
    merchants accept payments through Paysera";
  - "The integration ID carries no fees, no pricing changes, and no special permissions – your
    merchants pay the standard published Paysera rates, and each of them contracts with Paysera
    directly." *(re-checked)*

  [dev] https://developers.paysera.com/guides/checkout-modern/platform-partners

### What decides which API applies

- **Modern is not in Albania.** "Available now: Lithuania, Latvia, Estonia, Bulgaria, Kosovo, North
  Macedonia … Outside these markets? Integrate with Checkout Classic — we'll notify you when Modern
  is available for your setup." *(re-checked)* [dev]
  https://developers.paysera.com/guides/checkout-modern
- **Modern also has a platform exclusion.** Getting started: Modern "does not yet support some
  custom integrations, or projects created for a hosted platform that has no Checkout Modern
  plugin". [dev] https://developers.paysera.com/guides/checkout-modern/getting-started

### Card acceptance and registration

- **The card supplements are restricted to EU-registered business clients.**
  - Modern card rules, definitions: "Merchant – a Client of the Paysera System, a business client
    registered in the centre of registers of a member country of the European Union". Also: "The
    Supplement can be applied only to business clients who are registered in the centre of registers
    of a member country of the European Union". *(re-checked)*
  - The sq text says "personat juridikë që janë regjistruar në qendër të regjistrave të një vendi
    anëtar të Bashkimit Evropian" ("legal persons registered in the register centre of an EU member
    state"). *(re-checked)*
    https://www.paysera.al/v2/sq-AL/ligjore/rregullat-per-mbledhjen-e-pagesave-me-karta
  - The Classic card rules (07/2020), cl. 9, say the same *(re-checked)*:
    https://www.paysera.al/v2/en-AL/legal/collection-of-payments-via-internet-with-credit-cards-2020
  - Paysera Albania advertises card checkout to Albanian businesses
    (https://www.paysera.al/v2/en-AL/payment-gateway-checkout), so this is likely a template that
    was not localised. That is a guess, not a finding.

**Not in the docs:**
- whether many unrelated accounts may list or verify one platform domain, or whether a per-venue
  host is expected;
- whether a third party holding the project password breaches 9.1.17/14.4;
- whether the EU-registration clause applies to Paysera Albania merchants;
- when Modern opens in Albania, and whether its hosted-platform exclusion would cover us.

## Q2: Refunds by API

**Verdict: ANSWERED BY DOCS. There is no refund API for Albanian venues.**

- **Classic has none.** In the Classic-vs-Modern table, refunds under Classic are: "From the
  Received payments page of the project in your Paysera account, or as a transfer. There is no
  refund API." Later on the same page: "Classic has no refund API." *(re-checked)* [dev]
  https://developers.paysera.com/guides/checkout-modern/migrating-from-classic
- **The manual flow allows full and partial refunds.** The Classic FAQ: "Log in to Paysera account …
  Go to project transactions … Click 'Refund' … Confirm refund amount". The options are "Full refund"
  and "Partial refund", and "Refunds can take 3-10 business days to reach customer." [dev]
  https://developers.paysera.com/guides/checkout-classic/faq
- **Modern has a full and partial Refunds API. It does not apply in Albania today:**
  - endpoints: `GET …/payments/{paymentId}/refunds/eligibility` and `POST …/payments/{paymentId}/refunds`;
  - amount in minor units;
  - idempotent: "This endpoint requires an Idempotency-Key header. Replaying the same key with the
    same payload returns the original response (200); replaying it with a different payload returns
    409";
  - statuses: `initiated, processing, completed, failed`;
  - authentication: the project's OAuth2 bearer token (client_credentials). Anyone holding the
    venue's client ID and secret can refund, with no extra scope.

  [dev] https://developers.paysera.com/guides/checkout-modern/api-integration/refunds
- **Fees.** A refund is free the same day "until midnight" and 0.50 EUR from the following day.
  The original commission is not returned. [terms]
  https://www.paysera.al/v2/en-AL/fees/payment-gateway-with-payment-cards-fees

## Q3: Testing

**Verdict: ANSWERED BY DOCS, except whether several test projects can sit on one account.**

- **There is no sandbox environment.**
  - Classic: the `test` parameter, "Set to 1 for test payments. Must enable 'Allow Test Payments' in
    project settings". Error 0x7 means testing is off. [dev] request-parameters, error-codes (above)
  - Modern: "Checkout has no separate test environment; you integrate against production". It has
    a per-project Test Mode instead, limited to 60 test payments an hour. [dev]
    https://developers.paysera.com/guides/checkout-modern/concepts/split-payments,
    https://developers.paysera.com/guides/checkout-modern/getting-started/test-mode
  - lib-webtopay still carries `sandbox.paysera.com` routes, "@deprecated since 3.0.2", which the
    developer site does not document. Do not rely on them. [src]
- **Test payments work before verification:** "Test payments will continue to be available during
  the verification process." [dev] obtaining-credentials (above)
- **The callback must be public.** "Accessible from the internet - Paysera's servers must be able
  to reach it" and "No authentication required". The FAQ adds "not localhost" and "Must use HTTPS".
  ngrok is recommended for local work. [dev]
  https://developers.paysera.com/guides/checkout-classic/getting-started/making-your-first-payment/processing-callback
- **Several projects per account is implied, not stated.** Modern: "You need separate credentials
  for each project you want to integrate". Whether the *platform's own* account (not a venue's) may
  hold two or more test-only projects is **not in the docs**.

## Q4: Onboarding: sole traders, documents, approval time

**Verdict: PARTLY.**

- **Albania is a supported country for business accounts.** [terms]
  https://www.paysera.al/v2/en-AL/faq/where-paysera-works
- **Opening and running the account is free:** "Account opening for companies registered in SEPA
  countries, Albania, or Kosovo is absolutely free of charge" and "Account administration in …
  Albania … — Free". [terms]
  https://www.paysera.al/v2/en-AL/fees/account-management-and-identification-business
- **Steps.** The representative verifies their identity in the Paysera app (ID document and face).
  The head of the company, or someone holding a notarised or e-signed power of attorney, opens the
  account. Companies outside LT/LV/EE/BG/RO then provide "the company registration document, the
  document confirming the appointment of the head of the company, and the list of shareholders".
  "Your business account will be opened once the documents are approved." [terms]
  https://www.paysera.al/v2/en-AL/business-account-opening
- **The Checkout project has its own review.** The merchant submits the project and a
  questionnaire. Paysera "has the right to refuse to confirm the Project … without any explanation"
  (online collection supplement, cl. 4–6). The e-shop must show a returns policy and delivery
  information, and the merchant must "confirm the ownership of the page"
  (https://www.paysera.al/v2/en-AL/payment-gateway-checkout). The card acquirer named is Adyen N.V.
- **Approval times.** The project's domain verification "can take a few days" (Classic
  obtaining-credentials). No time is given for the account.
- **Sole traders are not addressed:**
  - the sq business agreement defines the client as "një person juridik" (a legal person);
  - the private-client agreement (cl. 1.5) mentions natural persons acting for business purposes;
  - the card supplements require EU-registered legal persons (Q1).

  Whether a sole trader with a NIPT can get Checkout with cards is **not in the docs**.

## Q5: Partner / integrator programme ("Earn with Paysera")

**Verdict: ANSWERED BY DOCS. There is none that pays.**

- **The old page is gone.** The developer page "Earn with Paysera"
  (`developers.paysera.com/en/checkout/integrations/integration-library/1.3`) returns 404. No earn,
  affiliate or referral page appears in https://developers.paysera.com/sitemap.xml.
- **The affiliate programme is closed.** Its rules ("Information has been updated: 12/04/2017")
  carry a banner: "the affiliate programme has been temporarily disabled. Those who are already
  earning money from their invited users will not be affected, but no new clients can be added
  using referral links since 18 May, 2020." *(re-checked)* The historic terms paid 10% of Paysera's
  commission on referred clients. [terms]
  https://www.paysera.al/v2/en-AL/legal/affiliate-program-rules
- **The platform integration ID pays nothing.** "Attribution carries no fees and no partner
  privileges. It exists so third-party integrations can be identified, supported and counted."
  [dev] https://developers.paysera.com/api/checkout-modern/set-integrator-id. It is Modern-only.
- **The "Partner Directory" is a franchise.** The developer home page's link goes to "Expand Paysera
  locally": "Entrance Fee: €30,000" and "Readiness to apply for an E-money (or equivalent)
  licence". It is not an integrator programme. [terms]
  https://www.paysera.al/v2/en-AL/partnership-solutions

## Q6: Callback event catalogue and checkout expiry (#479 Q0)

**Verdict: PARTLY.**

- **Classic statuses** [dev] processing-callback (above):

  | Status | Meaning |
  |---|---|
  | 0 | "Payment has not been executed" |
  | 1 | "Payment successful" |
  | 2 | "Payment order accepted, but not yet executed" |
  | 3 | "Additional information" (bank-supplied payer data) |
  | 4 | "Payment executed, but confirmation about received funds in bank won't be sent" (PIS only) |

  Paysera's own sample says statuses 1 and 3 "should be treated as a successful notification that
  the order can be approved".
- **Classic delivery:**
  - callbacks are sent by GET, or by POST if configured;
  - the handler must reply "OK" within about 30 s and must handle duplicates ("Implement
    idempotency checking");
  - **no retry schedule is documented**;
  - **no refund, chargeback or dispute callback is documented**;
  - **no provider event ID is documented**: the payload carries `projectid`, `orderid`, `amount`,
    `currency`, `status` and `test`.
- **Classic expiry.** `time_limit`, in the format "yyyy-mm-dd HH:MM:SS", "timezone: Europe/Vilnius".
  "Min: 12 minutes, Max: 3 days. Note: Applies to payment initiation only." *(re-checked)* Error
  0x15x1 rejects an invalid or past value. **The default lifetime without `time_limit` is not
  documented.**
- **Modern, for reference.** Modern is not available in Albania today.
  - Events: `order/amount_paid_updated`, `payment/status_updated`, `refund/status_updated` and
    `order/status_updated` (cancel).
  - Payment statuses: `pending_settlement, settled, failed, rejected, cancelled, expired, refunded,
    chargeback`.
  - An order cancelled for expiry carries the reason `expired_ttl`. Payment links default to a
    lifetime of 3 days.
  - Webhooks are attempted 4 times in all, at about +1 h, +6 h and +31 h.

  [dev] https://developers.paysera.com/guides/checkout-modern/reference/webhook-events,
  …/reference/payment-statuses, …/api-integration/payment-links

## Q7: Signature scheme, and what "verify with the venue's own key" means

**Verdict: ANSWERED BY DOCS + Paysera's library source.**

- **Request (Classic):** `data` is the URL-safe base64 of the query string, and
  `sign = md5(data + project_password)`. [dev] custom-integration (above)
- **Callback (Classic)** [dev] processing-callback; [src]:
  - **ss1** = `md5(data + password)`: needs the **venue's** project password.
  - **ss2**: "using RSA private-public key scheme with SHA-1", checked with **Paysera's** public key
    (`https://www.paysera.com/download/public.key`).
  - **ss3**: RSA-SHA256 with the same Paysera key. The docs page does not mention it. It was added
    in lib-webtopay 3.1.2 (2025-07-01: "added support for SS3 SHA256 signature verification"), and
    `src/WebToPay/Sign/SSOpenSslSignChecker.php` maps `'ss3' => OPENSSL_ALGO_SHA256`.
  - **Encrypted callbacks**: added in lib-webtopay 1.8 (2022-04-13). When no `ss*` is present,
    `data` is AES-256-GCM encrypted with the **venue's** project password
    (`src/WebToPay/CallbackValidator.php`). The developer page notes only "The data itself is
    encrypted". The wire format (IV and tag layout) is known only from the library source.
  - The library is PHP only. A Java adapter reimplements the base64/MD5 signing, the RSA
    verification and, if used, the AES-GCM decryption.
- **Modern** (not available in Albania): HMAC-SHA256 over the raw body in `X-Paysera-Signature`.
  "The signing secret is your OAuth Client Secret", so it is truly per venue. The thin payloads
  carry no project ID. [dev]
  https://developers.paysera.com/guides/checkout-modern/api-integration/webhooks
- **What ADR-0029 decision 4 must say for Classic.** "The callback names the project, the project
  names the venue, and the venue's own key verifies the signature" is only true for ss1 and
  encrypted mode. The robust sequence:
  1. Route by a **per-venue callback URL** (`callbackurl` is per request, and 0x13 checks only the
     domain).
  2. Load that venue's credentials.
  3. Verify **ss3**, or ss2, with Paysera's public key, or decrypt with the venue's password.
  4. Check that the decoded `projectid` equals that venue's project ID. lib-webtopay itself fails
     with "Bad projectid".
  5. Match `orderid`, `amount` and `currency` against the payment row.

## Q8: Merchant fees in Albania, and POK

**Verdict: ANSWERED BY DOCS.**

- **Paysera cards** [terms]
  https://www.paysera.al/v2/en-AL/fees/payment-gateway-with-payment-cards-fees:
  - **Commission**, at the tier for the last 30 days of 0–50 transactions / 0–2,500 EUR:
    - 1.45% for EU consumer cards;
    - 2.40% for EU business cards;
    - 2.90% for non-EU cards.

    The minimum is 0.15 EUR. Rates step down to 1.25% / 2.20% / 2.50% at the 501–750 tier.
  - **Reserve:** "Each received payment is reserved when accepting card payments: 100% – for three
    days and 5% – for three months." *(re-checked)* This matters for venue cash flow in a short
    season.
  - **Other fees:** activation 0 EUR; refunds as in Q2; chargeback processing 30 EUR.
  - The page does not distinguish Albanian merchants from others.
- **Paysera bank links:** "Paysera system fee for Paysera Albania clients: ≥ 1 transaction 2%",
  plus the bank's own fee. [terms] https://www.paysera.al/v2/en-AL/fees/payment-gateway-fees
- **POK** [pok]. This was read once, through the API reference's Postman collection JSON in a
  browser, because the pages are JS-rendered. I only re-checked that `docs.pokpay.io/llms-full.txt`
  points to `payments.doc.pokpay.io` as the full HTTP reference.
  - **A refund endpoint is documented**: `POST merchants/:merchantId/sdk-orders/:sdkOrderId/refund`
    with `refundReason` and `refundAmount`. "If not specified the order will be fully refunded",
    so partial refunds are supported. **This corrects ADR-0009** (read 2026-07-22: "no refund API").
  - **Webhooks: PARTLY.** Create Order takes an optional `webhookUrl`. No payload, event list,
    signature or retry policy is documented.
  - `splitWith` splits an order with one other merchant. There is no sub-merchant onboarding API.
- **Licences** [BoA]
  https://www.bankofalbania.org/rc/doc/Anglisht_34834.xlsx (linked from
  https://www.bankofalbania.org/Supervision/Licensed_institutions/Electronic_Money_Institutions/):
  - PAYSERA ALBANIA SH.P.K.: licence "No. 47, date 5.3.2021";
  - RPAY SH.P.K. (POK's operator): "No. 50, date 9.9.2021".

  Neither has a suspension listed.

---

## Implications for ADR-0029 / #284

The docs **do not reopen** ADR-0029: nothing published says "no" to Q1. But they change what the ADR
can promise, and they add a precondition it does not have. Proposed changes, not applied here:

### Preconditions (Proposed → Accepted)

| Precondition | Status after this note |
|---|---|
| Paysera confirms the platform may create checkouts on many merchants' projects | **Still open.** Narrowed to three asks: our domain in many projects' URL lists, holding project passwords under GPSA 9.1.17/14.4, and the hosted-platform exclusion. |
| Sole traders can open a business account with Checkout | **Still open**, and now joined by the card-terms question below. |
| A test setup with at least two projects | **Partly met.** No sandbox; test payments work on an unverified project. Open: can the platform's own account hold two test projects. |
| **New:** card acceptance is open to Albanian-registered venues | **Add it.** The published card supplements say EU-registered only. If Paysera confirms that, venues get bank links only, and the design (and ADR-0009) needs rethinking. |

### Decisions to reword

- **Decision 4.** Replace "the venue's own key verifies the signature" with the Q7 sequence:
  per-venue callback URL, ss3/ss2 with Paysera's key, then a `projectid` match. Replace
  "idempotency on the provider's event id" too: Classic has no event ID, so the dedup key is built
  from `(projectid, orderid, status)`. #1688's "provider + event id" key needs that derived form for
  Paysera.
- **Decision 5.** On Classic the API branch does not exist. The refund is always **left to the
  venue**. The platform also **cannot observe** that the venue made it, because no refund callback
  is documented, so "the operator marks it done" is the only completion signal.
- **Decision 2.** Drop "a Paysera partner share is a possible extra". No paid programme exists
  (Q5).
- **Decision 6.** The Classic project password both **signs** checkouts and decrypts or ss1-verifies
  callbacks. Whoever holds it can create payments into the venue's account. That supports the
  credential posture already chosen.
- **Consequences.**
  - Add the venue-side costs: the **100% / 3-day + 5% / 3-month card reserve**, 30 EUR chargebacks,
    and refunds that cost 0.50 EUR after the same day.
  - Note that Paysera's merchant terms require the venue's name to be shown "prominently" on the
    payment page. The redirect checkout and the booking page must name the venue as the seller.

### Slices

- **P1 (venue payment account).** The secret is the Classic **project password**. The owner also
  has to add our domain to the venue's project URL list, and possibly verify it. Make that a
  checklist step in the console. No documented API reports a project's verification, so the
  verified state is set by hand, or after a successful test payment (test payments work before
  verification, so that proves the credentials, not the verification).
- **P2 (Paysera adapter).**
  - Classic, not Modern: base64 + MD5-signed redirect, and ss3/ss2 RSA verification instead of HMAC.
  - Refunds do not go through the API, so the **refund-bulkhead re-derivation is moot** for Paysera.
  - Always send `time_limit` (12 min – 3 days, **Europe/Vilnius**; convert from the stored UTC
    `Instant`, invariant #6).
  - The callback is GET by default; configure POST or accept both.
- **P3 (return flow).** Unchanged. The accept URL is not proof of payment (#8), as already planned.
- **P4 (refund left to the venue).** **Needed**, and no longer conditional, while Albania is on
  Classic. It is no longer blocked by Paysera's answer, so it can be filed with P1–P3. If Modern
  opens in Albania, a Modern adapter can execute refunds instead, with Idempotency-Key, and P4
  becomes the fallback.
- **#479 (orphan reconciliation).** Q0 is mostly answered. A checkout created with `time_limit`
  cannot be *started* after it (12 min – 3 days). Whether a payment started just before the limit
  can still complete later is not stated ("Applies to payment initiation only"); question 8 asks.
  If Paysera's answer bounds it, #479 shrinks to a report, or closes, once P2 always sets
  `time_limit`.
- **#102 (disputes and reconciliation).** Classic documents no chargeback notification, so the
  dispute half has nothing to surface on Paysera. The reconciliation half has no documented
  statement API for Classic either.

### For the ADR-0009 record, if ADR-0029 is rejected

- Card rules 12.8 forbid accepting cards "for commercial activity performed by a third party", which
  works against ADR-0009's collection-agent model.
- Paysera documents split payments (Modern, enabled by support).
- POK documents a refund API.

---

## Still to ask Paysera

Send to **info@paysera.al** (Paysera Albania SHPK's address in the business agreement, cl. 1.1;
phone +355 44 500 800). Cc **tech_support@paysera.com**, which the developer site gives for project
and domain verification. Ask for the answers in writing.

> **Subject:** Platform integration for Albanian merchants (Checkout): questions before we integrate
>
> Hello,
>
> We are building an online booking service for beach venues on the Albanian coast. Each venue
> would open its **own** Paysera business account and Checkout project, and guests would pay the
> venue directly. Our platform would create each payment request for the venue's project and
> receive the payment callback to confirm the booking. We would never receive or hold the money,
> and we charge the venues nothing. We have read developers.paysera.com and the terms on
> paysera.al, and we would be grateful for written answers to the following:
>
> 1. **Card acceptance for Albanian merchants.** The card payment collection rules published on
>    paysera.al (Checkout Modern, valid from 2026-09-01, and Classic, 07/2020) say they apply only to
>    business clients "registered in the centre of registers of a member country of the European
>    Union". Does this apply to clients of Paysera Albania? Can an Albanian-registered sh.p.k.
>    accept card payments through Checkout? Can a sole trader (person fizik with a NIPT)?
> 2. **Sole traders.** Can a sole trader open a Paysera business account with a Checkout project?
>    Which documents are needed for Albanian businesses (for example the QKB extract), and how long
>    do the account and the project review usually take?
> 3. **Our domain in many merchants' projects.** Error 0x13 requires the accept, cancel and callback
>    URLs to be confirmed in the project. May each venue add our platform's domain to its own
>    project's URL list, as with your Shopify, Ecwid and WiX integrations? Can many unrelated
>    merchants' projects confirm or verify the same domain? Or should each venue have its own
>    subdomain? Does the check also apply to test payments?
> 4. **Holding the project password.** To sign the venue's payment requests, our platform would
>    store the venue's project ID and project password, encrypted. Is this allowed under clauses
>    9.1.17 and 14.4 of the General Payment Services Agreement for Business Clients, which forbid
>    disclosing "Passwords" to third persons? If not, is there an agreement or a delegated
>    credential for platforms? What does the `developerid` request parameter do, and should we
>    register for one?
> 5. **Checkout Modern in Albania.** When do you expect Checkout Modern for Albanian merchants? Would
>    the exclusion of "projects created for a hosted platform that has no Checkout Modern plugin"
>    apply to a platform like ours? Could we then register as a platform partner?
> 6. **Refunds on Checkout Classic.** The developer site says Classic has no refund API. Is any way
>    planned to make a full or partial refund through an API? Is there any notification (callback)
>    or report a platform can read when a merchant makes a refund, or when a chargeback is opened?
> 7. **Testing.** Can our own company account, which sells nothing itself, hold two or more Checkout
>    projects used only with "Allow test payments", so we can test that payments for venue A never
>    confirm bookings for venue B? Is `sandbox.paysera.com` still supported, or should all testing
>    use test payments on production projects?
> 8. **Callbacks and expiry.**
>    - How long does a payment request stay payable if we send no `time_limit`?
>    - `time_limit` "Applies to payment initiation only". Can a payment started before the limit
>      still complete after it, and for how long?
>    - What is the callback retry schedule when our server does not answer "OK"?
>    - Does a callback carry a unique ID we can use for de-duplication?
>    - Which callback signature do you recommend today (ss3)?
>    - Is the encrypted-callback format documented anywhere outside the PHP library?
>
> Thank you,
> Ivo Pogace
