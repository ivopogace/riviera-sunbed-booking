# ADR-0011: Transactional email — EU-jurisdiction provider (Scaleway TEM), SMTP-portable, tracking off

- **Status:** Proposed (flips to Accepted when the preconditions below are met)
- **Date:** 2026-07-27
- **Research basis:** `docs/architecture/research/2026-07-27-dsgvo-transactional-email-provider.md`
  (provider landscape, DSGVO analysis, pricing — researched 2026-07-27)

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
5. **Sends are asynchronous and at-least-once.** Nothing sends on a request thread (the #255
   timing-oracle finding: a synchronous SMTP round-trip only on the known-email branch of
   `register`/`forgot-password` is a measurable account-enumeration oracle). Event-driven mail
   (booking confirmation) rides the Spring Modulith **Event Publication Registry** (already on
   the classpath, JDBC-backed) with republish-on-restart; every send is **idempotent** keyed on
   the driving event/booking id, so a retried publication never double-sends.
6. **One platform sending domain.** SPF + DKIM (2048-bit) + DMARC (`p=none` → tighten) on the
   platform domain; shared IP pool (our volume never keeps a dedicated IP warm). Mail "from" an
   operator's own domain (per-tenant DKIM delegation) is explicitly out until an operator
   demands it; per-tenant `Reply-To` covers the near need.
7. **Bounces/complaints are consumed and suppressed.** A signature-verified webhook endpoint
   records hard bounces + complaints; suppressed addresses are not sent to again.

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
