# ADR-0011: Transactional email — EU-jurisdiction provider (Scaleway TEM), SMTP-portable, tracking off

- **Status:** Proposed (flips to Accepted when the preconditions below are met)
- **Date:** 2026-07-27
- **Research basis:** `docs/architecture/research/2026-07-27-dsgvo-transactional-email-provider.md`
  (provider landscape, DSGVO analysis, pricing — researched 2026-07-27)
- **Epic:** #367 (transactional-email epic; absorbs #255)

## Context

The platform has an email **port** but no transport: `Mailer` (edge, RV-BE-11) is served by the
recording `MockMailer` everywhere, and `SmtpMailer` (`@Profile("mailer")`) throws
`UnsupportedOperationException` — deliberately deferred in S8 (#113) and tracked as #255. Real mail
is now on the critical path three times over:

- The **product design spec promises a booking-code email** at checkout ("booking code plus an
  email") — never built, and the booking code is the venue-arrival credential (invariant #7).
- **Account recovery** (verify / reset, S8) is demoable only via the mock's log line; in prod the
  mock is barred (`MockMailerProdGuard`) so the flows are dead until a real transport exists.
- **Dormant-account retention** (#101 Slice 2 follow-up) is explicitly blocked on real mail: an
  account scrub needs advance notice by email.

The legal posture frames the choice. The controller is becoming an **Albanian sh.p.k.** serving EU
data subjects (ADR-0009, #101): GDPR Art. 3(2) applies, every mail processor is an Art. 28
processor needing an AVV/DPA, and the German DSK's guidance says controllers must *prepare for*
the possible CJEU invalidation of the EU-US Data Privacy Framework (Latombe appeal pending as of
mid-2026). A US-parented provider (SendGrid, Mailgun, SES, Postmark) is legally workable today but
imports CLOUD-Act residual risk and a live legal dependency we can simply not have. Separately,
**open/click tracking in transactional mail is consent-requiring under §25 TDDDG** — a reason to
prefer a transactional-only product with tracking off.

Hosting is Render today with a **Hetzner prod move planned** (#101, ADR-0004's deferred
EU-sovereign migration). Both environments point the same way: never send from the app host's own
IP (Hetzner blocks ports 25/465 by default; a lone cloud IP has no sender reputation anywhere) —
use an external relay on **port 587**, which works identically from Render and Hetzner, so this
decision is robust to the hosting timeline.

Provider landscape (condensed; full table in the research doc):

- **Scaleway TEM** — French, no US parent, 100% EU processing ("no personal data is transferred
  outside the EU, so a TIA was not required"), transactional-only, SMTP relay + API,
  pay-as-you-go €0.25/1,000 (free 300/month). Cleanest sovereignty story.
- **Brevo** — French group, DE+FR servers, self-serve AVV, free 300/day; all-in-one
  (marketing + transactional) with slightly weaker transactional inbox placement.
- **Mailjet** — French, EU DC, but Sinch (US-linked group) parent; SPF misaligns for DMARC by
  default (Return-Path on Mailjet's domain).
- **SES / SendGrid / Mailgun (EU regions)** — data-at-rest in the EU, jurisdiction still US.
- **Postmark** — US-only storage; residency dealbreaker.
- **Self-hosting (Postfix/Mailcow)** — own IP warm-up, blocklists, DKIM rotation; operationally
  wrong for a small team.

## Decision

1. **The mail processor must be EU-jurisdiction — no US parent.** This is the durable rule; the
   provider is the instance. It removes the DPF/CLOUD-Act class of risk entirely instead of
   monitoring it.
2. **Provider: Scaleway Transactional Email (TEM).** Transactional-only, EU-processed, trivially
   cheap at our volume (5k–20k mails/month ≈ €1.25–5/month). Brevo is the named fallback if the
   free tier or an all-in-one becomes decisive.
3. **Transport: the provider's SMTP relay via `JavaMailSender`** (`spring-boot-starter-mail`),
   port **587** STARTTLS, finite connection/read/write timeouts. SMTP keeps the integration
   provider-portable — switching providers is a config change behind the unchanged `Mailer`
   port (the `StubPaymentGateway`/gateway-swap posture). The HTTP API is not used in v1; reach
   for it only if templating/analytics needs outgrow SMTP.
4. **Open/click tracking stays off permanently** for transactional mail (§25 TDDDG). No pixels,
   no rewritten links.
5. **Sends are asynchronous, and the payload picks the mechanism.** Nothing sends on a request
   thread (the #255 timing-oracle finding: a synchronous SMTP round-trip only on the known-email
   branch of `register`/`forgot-password` is a measurable account-enumeration oracle). *Which*
   asynchronous vehicle a mail uses is not the implementer's taste — it follows from what the
   payload carries:

   - **Ids-only payload → the Spring Modulith Event Publication Registry.** Event-driven mail
     (booking confirmation) rides the registry (already on the classpath, JDBC-backed) with
     republish-on-restart. Delivery is **at-least-once, deduplicated by the registry's own
     `completion_date`** — a completed publication is never redelivered.

     > **Amended 2026-07-27 (#371).** This bullet previously promised that "every send is
     > **idempotent** keyed on the driving event/booking id, so a retried publication never
     > double-sends." That is not what shipped, and could not be: a `Message-ID` is invisible at the
     > `Mailer` port, so nothing can test it and no relay guarantees dedupe on it; and a dedupe table
     > buys nothing, because a row written inside the listener's transaction has the *identical*
     > crash window as `completion_date` (send succeeds → process dies → row rolls back → republish
     > → second email). Both are database writes wrapped around a non-transactional SMTP call, so
     > neither is exactly-once. The narrow *sent-then-crashed-before-completion* window is
     > **accepted and documented**, not defended against. User story 9's "neither loses nor
     > duplicates" holds as *"does not lose; may duplicate once in a crash window"*.
   - **Bearer-credential payload → an in-memory async executor, never the registry.** The registry
     persists each publication's payload into `event_publication` as text, and under our `archive`
     completion mode retains it after the send. A recovery mail's payload carries the raw
     single-use token inside the tokenized link (invariant #7), so routing it through the registry
     would write that credential to the database in cleartext — undoing the S8 design in which only
     the SHA-256 digest is ever stored. Recovery mail (#369) therefore dispatches through a
     dedicated, bounded in-memory executor — shipped. The operator-approval mail (#375) uses that
     same vehicle — **shipped**. It is the case that shows this bullet's heading names the *usual*
     discriminator rather than the whole rule: its payload carries no secret at all (the link is the
     public sign-in URL), so the payload test does not settle it and the **trigger** does — an admin
     request, not a domain fact, so an event minted to carry the news back to the edge that issued
     the request would be ceremony that also persists the payload.

   The executor's trade-off is accepted deliberately: it is **best-effort, not at-least-once** — a
   crash, a redeploy past the drain window, a saturated queue, or a send the pool accepted and could
   not deliver loses the mail, and nothing retries it. **What that loss costs is not the same for
   every kind riding the vehicle, so the justification has to be read per kind:**

   - **The recovery pair (verification, password reset) self-heals.** The durable half — the token —
     is already committed when the edge calls the port, and the flow is user-retryable: the person
     asks again and gets a fresh link. A lost send costs one round trip.
   - **The operator-approval notice (#375) does not.** It carries no token, so there is no durable
     half already committed; and nothing re-sends it — the operator is not sitting on a page offering
     a retry, and learns its account is live only by trying to sign in, which is the exact experience
     #375 was written to remove. This kind is accepted as the **knowingly weaker case**: the loss is
     unrecoverable *in the product* and is mitigated only *operationally* — but, since
     [#442](https://github.com/ivopogace/riviera-sunbed-booking/issues/442), mitigated **in full rather
     than in part**. Every loss on this vehicle is now both counted *and* attributable: a send the
     transport ran and lost raises `MAIL_RECOVERY_FAILED` under `kind="operator-approved"`, and a send
     the pool never ran raises `MAIL_RECOVERY_DROPPED` under the same tag, on all three of its
     `reason`s. Either way an increment names one identifiable person at a volume of one per approval,
     and `docs/runbooks/observability.md` carries the remedy — tell them — which is a real remedy
     rather than a shrug because a human is already in the loop: the admin who approved. What the tag
     does **not** do is name the person: invariant #7 keeps the address out of metrics and logs, so the
     operator is still identified from the approval log. The tag is what says to go and look.

   The pool is deliberately **not** Boot's shared
   `applicationTaskExecutor`, which carries the Modulith money-path listeners; and it drops on
   saturation rather than running the send on the caller's thread, which would re-open the oracle.
   One **residual** is knowingly left open: the token row is still inserted synchronously on the
   known-email branch only, a sub-millisecond delta against the ~100ms SMTP round-trip this closes.
   Equalizing it was considered and rejected — on `register` the branch asymmetry is structural and
   pre-existing (the fresh branch also inserts an account and a session row), and D-8 answers that
   class with bcrypt-cost equalization rather than write-count equalization.

   > **Amended 2026-07-30 (#439).** The paragraph above previously justified the whole vehicle's loss
   > risk in one breath: a lost send is "tolerable precisely because the flow is **user-retryable**
   > (re-request the email) and the durable half, **the token**, is already committed." Both halves
   > were true of the only kinds the vehicle carried when that was written, and **neither is true of
   > the operator-approval notice** #375 later put on it. So the ADR went on recording the risk as
   > uniformly self-healing after it had stopped being so — while the code
   > (`TransactionalMailService`) and `docs/runbooks/observability.md` already said otherwise. This
   > amendment makes the justification per-kind; it does not discover a new risk, it stops
   > mis-describing one we already run.
   >
   > **The vehicle *choice* is not what changed, and was not reconsidered.** It stays pre-authorised
   > by this bullet and by epic #367 ("no secret, but it's edge-orchestrated from an admin request,
   > not a domain event"), and #375 shipped it as specified.
   >
   > **Moving the notice to the Event Publication Registry to buy it at-least-once was the considered
   > alternative, and was rejected** (maintainer, #439). Its payload is ids-only in practice, so the
   > payload test above would have allowed it — but taking it would reverse the *trigger settles it*
   > reasoning for a kind whose loss is already **visible** (a tagged counter, at a volume of one per
   > approval) and **remediable** (the approving admin can be told to tell them), and would buy that
   > durability by minting a domain event whose only consumer is the edge that raised the request.
   > Re-open it if a real lost approval ever shows the operational remedy failing in practice.

   > **Amended 2026-07-30 (#442).** The amendment directly above shipped with a caveat that has now
   > been retired. It recorded the operator-approval notice's loss as mitigated *"only **in part**"*,
   > because "only one of the two is *attributable*: … a send the pool never ran raises
   > `MAIL_RECOVERY_DROPPED`, which carries `reason` alone and **cannot carry the kind**, because it is
   > raised by the dispatcher, whose interface is `dispatch(Runnable)`" — so a dropped approval notice
   > "surfaces only as an unattributed increment, to be reconciled by hand against that window's
   > approvals." That was an accurate reading of the code and, per the same note, the open question
   > #442 was filed to settle.
   >
   > It was settled by **widening the seam** (maintainer, #442): `dispatch` now takes the kind
   > alongside the send, and all three of the drop counter's `reason`s carry it. The "cannot" was never
   > a property of the event — a drop is exactly as attributable as a failure — only of an interface
   > that had not been given what its own accounting needed. **Leaving the gap and recording it as
   > accepted was the considered alternative, and was rejected:** drop volume is near-zero by
   > construction, but that argues *for* attribution rather than against it, since a rare signal is
   > read one increment at a time during an incident and has to be self-describing.
   >
   > **What did not change:** the vehicle choice, the metric names, and the limit invariant #7 sets on
   > all of this — the tag names the flow, never the person, so the approval log is still what
   > identifies the operator.
6. **One platform sending domain.** SPF + DKIM (2048-bit) + DMARC (`p=none` → tighten) on the
   platform domain; shared IP pool (our volume never keeps a dedicated IP warm). Mail "from" an
   operator's own domain (per-tenant DKIM delegation) is explicitly out until an operator
   demands it; per-tenant `Reply-To` covers the near need.
7. **Bounces/complaints are consumed and suppressed.** A signature-verified webhook endpoint
   records hard bounces + complaints; suppressed addresses are not sent to again.

   > **Amended 2026-07-28 (#386).** "Not sent to again" holds on every path except one, and the
   > exception is deliberate: on the **recovery vehicle** (password reset / email verification), a
   > **transient** failure of the suppression *lookup itself* now sends the mail rather than dropping
   > it. This bullet was written when suppression was a decision the code would simply make; it
   > became a database read that can fail, and the bullet had no answer for what to do then.
   >
   > The trade, taken with the maintainer rather than inferred: the suppression list is **empty in
   > production** until #370's bounce feed lands, so today the branch can only fire against an empty
   > table; a user-*requested* reset sent to a suppressed address is the most harmless send available
   > (they asked for it, and a hard-bounced address simply bounces again); and design **D-8** makes
   > the HTTP response byte- and timing-identical either way, so a dropped reset is a dead end the
   > user gets no signal about and cannot distinguish from success. Failing closed traded a
   > *certain* user-visible dead end for an *unlikely* deliverability ding.
   >
   > **Bounded three ways**, so this is a carve-out and not a hole:
   > - **Transient only.** The catch is `TransientDataAccessException`, not `DataAccessException`
   >   (narrowed at #386's review gate). A structurally broken lookup — a revoked grant, schema
   >   drift — is *not* a blip and still drops the mail; failing open on one would mail every
   >   suppressed address indefinitely behind a single log line.
   > - **Recovery vehicle only.** On the registry vehicle the throw is load-bearing: it keeps the
   >   publication outstanding so the at-least-once contract retries against a healthy database
   >   instead of burning the delivery on a blip. Pinned by
   >   `TransactionalMailServiceTest.aSuppressionReadFailureStillPropagatesOnTheRegistryVehicle`.
   > - **The read is bounded.** It runs on the single mail-drainer thread, so it now carries a finite
   >   `queryTimeout` scoped to its own adapter (never the global property, which would also bound
   >   `availability`'s `SELECT … FOR UPDATE` — invariant #2). That bound is what makes this branch
   >   reachable at all, which is why the two shipped together.
   >
   > **Revisit when #370 lands.** Once a real bounce feed populates the list, the list stops being
   > empty and the calculus above changes: re-weigh whether the recovery vehicle should fail closed.

## Preconditions (Proposed → Accepted)

- A **real sending domain exists** — the platform has none (`*.onrender.com` cannot be a sender
  domain). This is a launch decision shared with #291 (custom domain / own Cloudflare zone):
  decide the domain **once**, for both.
- Scaleway account created, TEM enabled, **DPA/AVV signed**; Scaleway added to the processor
  list in #101's privacy-policy work (alongside Paysera + Hetzner).
- Domain verified in TEM; SPF/DKIM/DMARC published and green.
- SMTP credentials injected as deploy-environment secrets (the Stripe-key posture, #54) — never
  in the repo or image.

## Consequences

- `SmtpMailer` becomes a real `JavaMailSender`-backed adapter; the profile posture is unchanged
  (mock default, `MockMailerProdGuard` bars the mock from prod) — production runs `prod,mailer`.
- `riviera.recovery.link-base-url` must become an explicit env placeholder documented in
  `docs/deploy/cd-pipeline.md` before real sends exist, or every mailed link points at
  `http://localhost:4200` (#255 comment).
- The `Mailer` port grows message kinds beyond verify/reset (booking confirmation first); the
  mock keeps recording them so CI/e2e stay hermetic.
- An activation runbook (mirror `docs/runbooks/stripe-profile-smoke-test.md`) documents
  profile + secrets + a smoke send.
- A future implementer must **not**: send on a request thread; enable open/click tracking; log a
  tokenized link or booking code at the transport layer (invariant #7); or pick a US-parented
  provider without re-opening this ADR.

## Alternatives considered

- **Brevo** — strong second (free 300/day, DE servers, self-serve AVV); shared
  marketing/transactional infra dents deliverability slightly, and we don't need the marketing
  half. Named fallback.
- **Mailjet** — EU DC but US-linked parent and an SPF/DMARC alignment footgun; no advantage over
  Scaleway for pure transactional.
- **Amazon SES (eu-central-1)** — cheapest at scale, but US parent means DPF dependence + a
  transfer-impact assessment our DPO would have to own; volume never gets big enough for the
  price to matter.
- **Postmark** — best-in-class deliverability, US-only storage; rejected on residency.
- **Self-hosted Postfix/Mailcow on Hetzner** — full sovereignty, full ops burden (reputation,
  warm-up, blocklists); rejected for a small team.
- **Send from the app host directly** — blocked ports (Hetzner) + zero IP reputation; rejected.
