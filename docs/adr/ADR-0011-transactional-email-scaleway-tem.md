# ADR-0011: Transactional email — EU-jurisdiction provider (Scaleway TEM), SMTP-portable, tracking off

- **Status:** Proposed (flips to Accepted when the preconditions below are met)
- **Date:** 2026-07-27
- **Research basis:** `docs/architecture/research/2026-07-27-dsgvo-transactional-email-provider.md`
- **Epic:** #367

## Context

The platform has an email **port** but no transport: `Mailer` is served by the recording
`MockMailer` everywhere, and the mock is barred from prod (`MockMailerProdGuard`). Real mail is on
the critical path three times over: the product spec promises a booking-code email at checkout
(the code is the venue-arrival credential, invariant #7); account recovery (verify / reset) is
dead in prod until a transport exists; and dormant-account retention needs advance notice by
email.

The legal posture frames the choice. The controller is an **Albanian sh.p.k.** serving EU data
subjects (ADR-0009): GDPR Art. 3(2) applies, every mail processor is an Art. 28 processor needing
a DPA, and the German DSK's guidance says controllers must prepare for a possible CJEU
invalidation of the EU-US Data Privacy Framework. A US-parented provider (SendGrid, Mailgun, SES,
Postmark) is legally workable today but imports CLOUD-Act residual risk we can simply not have.
Separately, **open/click tracking in transactional mail is consent-requiring under §25 TDDDG**.

Hosting is Render today with a Hetzner prod move planned (ADR-0004). Both point the same way:
never send from the app host's own IP (Hetzner blocks ports 25/465; a lone cloud IP has no sender
reputation) — use an external relay on **port 587**, which works identically from either.

Provider landscape (condensed; full table in the research doc): **Scaleway TEM** — French, no US
parent, 100% EU processing, transactional-only, SMTP relay + API, pay-as-you-go. **Brevo** — French,
DE+FR servers, all-in-one with slightly weaker transactional placement. **Mailjet** — EU DC but a
US-linked parent and an SPF/DMARC alignment footgun. **SES / SendGrid / Mailgun (EU regions)** —
data at rest in the EU, jurisdiction still US. **Postmark** — US-only storage. **Self-hosting** —
own IP warm-up, blocklists, DKIM rotation; operationally wrong for a small team.

## Decision

1. **The mail processor must be EU-jurisdiction — no US parent.** This is the durable rule; the
   provider is the instance. It removes the DPF/CLOUD-Act class of risk instead of monitoring it.
2. **Provider: Scaleway Transactional Email (TEM).** Brevo is the named fallback.
3. **Transport: the provider's SMTP relay via `JavaMailSender`** (`spring-boot-starter-mail`),
   port **587** STARTTLS, finite connection/read/write timeouts. SMTP keeps the integration
   provider-portable — switching providers is a config change behind the unchanged `Mailer` port.
   The HTTP API is not used in v1.
4. **Open/click tracking stays off permanently** for transactional mail (§25 TDDDG). No pixels,
   no rewritten links.
5. **Sends are asynchronous, and the payload picks the vehicle.** Nothing sends on the request
   thread of an **anonymous** flow: a synchronous SMTP round-trip only on the known-email branch
   of `register`/`forgot-password` is a measurable account-enumeration oracle. Which asynchronous
   vehicle a mail uses follows from what the payload carries, and, where the payload does not
   settle it, from what triggered the send:

   - **Ids-only payload → the Spring Modulith Event Publication Registry.** Event-driven mail
     (booking confirmation, cancellation record, payment due, request declined/expired) rides
     the registry with republish-on-restart. Delivery is **at-least-once, deduplicated by the
     registry's own `completion_date`**. It is not exactly-once and cannot be: a `Message-ID` is
     invisible at the `Mailer` port, and a dedupe row written inside the listener's transaction
     has the identical crash window as `completion_date`. The narrow sent-then-crashed-before-
     completion window is **accepted and documented**: the guarantee is "does not lose; may
     duplicate once in a crash window".
   - **Bearer-credential payload → a bounded in-memory executor, never the registry.** The
     registry persists each payload into `event_publication` as text and retains it under
     `archive` completion mode; a recovery mail's payload carries the raw single-use token
     (invariant #7), so routing it through the registry would write that credential to the
     database in cleartext. Recovery mail dispatches through a dedicated bounded executor.
   - **Edge-triggered admin notices ride the same in-memory executor, by trigger rather than
     payload.** The operator-approval notice carries no secret, so the payload test does not
     settle it; the trigger does — an admin request, not a domain fact, so minting a domain
     event to carry the news back to the edge that issued the request would be ceremony that
     also persists the payload.
   - **An admin re-send of an already-sent mail sends synchronously, on the request thread.**
     That is not a violation of the rule above: the rule closes a timing oracle on anonymous
     flows, and an ADMIN-gated support action has no anonymous caller to leak to. Synchronous
     is what lets the admin learn the real outcome (sent / withheld / failed) instead of
     "queued", and keeps the bulkhead from silently shedding the press. The send is bounded by
     the relay socket budget and publishes **no** event, which keeps it off `payout` and the
     refund path.

   The in-memory executor is **best-effort, not at-least-once**: a crash, a redeploy past the
   drain window, a saturated queue, or a send the pool accepted and could not deliver loses the
   mail, and nothing retries it. What that loss costs differs per kind, so the justification is
   per kind:

   - **The recovery pair (verification, password reset) self-heals.** The durable half — the
     token — is already committed when the edge calls the port, and the person can ask again. A
     lost send costs one round trip.
   - **The operator-approval notice does not.** It carries no token, nothing re-sends it, and the
     operator learns its account is live only by trying to sign in. This kind is accepted as the
     **knowingly weaker case**: the loss is unrecoverable in the product and mitigated
     operationally — in full, because every loss on this vehicle is counted *and* attributable
     (`MAIL_RECOVERY_FAILED` / `MAIL_RECOVERY_DROPPED` under `kind="operator-approved"`, on every
     `reason`), and `docs/runbooks/observability.md` carries the remedy: the approving admin tells
     them. The tag names the flow, never the person (invariant #7); the approval log identifies
     the operator. Moving this notice to the registry to buy at-least-once was considered and
     rejected: its loss is already visible and remediable, and the durability would be bought by
     minting a domain event whose only consumer is the edge that raised the request. Re-open if a
     real lost approval ever shows the operational remedy failing.

   The pool is deliberately **not** Boot's shared `applicationTaskExecutor`, which carries the
   Modulith money-path listeners, and it drops on saturation rather than running the send on the
   caller's thread, which would re-open the oracle. One **residual** is knowingly open: the token
   row is still inserted synchronously on the known-email branch only, a sub-millisecond delta
   against the ~100 ms SMTP round-trip this closes; on `register` the branch asymmetry is
   structural, and D-8 answers that class with bcrypt-cost equalization rather than write-count
   equalization.
6. **One platform sending domain.** SPF + DKIM (2048-bit) + DMARC (`p=none` → tighten) on the
   platform domain; shared IP pool. Mail "from" an operator's own domain is out until an operator
   demands it; per-tenant `Reply-To` covers the near need.
7. **Bounces/complaints are consumed and suppressed.** A signature-verified webhook endpoint
   records hard bounces + complaints; suppressed addresses are not sent to again — on every path
   but one, deliberately: on the **recovery vehicle**, a **transient** failure of the suppression
   *lookup itself* sends the mail rather than dropping it. The list is empty in production until
   the bounce feed lands; a user-requested reset sent to a suppressed address is the most harmless
   send available; and design D-8 makes the HTTP response identical either way, so a dropped
   reset is a dead end the user cannot distinguish from success. The carve-out is bounded three
   ways: **transient only** (`TransientDataAccessException`, not `DataAccessException` — a
   revoked grant or schema drift still drops the mail); **recovery vehicle only** (on the registry
   vehicle the throw is load-bearing, keeping the publication outstanding so at-least-once
   retries against a healthy database — pinned by
   `TransactionalMailServiceTest.aSuppressionReadFailureStillPropagatesOnTheRegistryVehicle`);
   and **the read is bounded** by a `queryTimeout` scoped to its own adapter, never the global
   property, which would also bound `availability`'s `INSERT … ON CONFLICT` claim at invariant
   #2's serialization point (machine-locked by
   `ScheduledWorkArchitectureTest.noGlobalQueryTimeoutIsIntroduced`). **Revisit when the bounce
   feed lands** and the list stops being empty.

## Preconditions (Proposed → Accepted)

- A **real sending domain exists** — `*.onrender.com` cannot be a sender domain. A launch
  decision shared with the custom-domain work (#291): decide the domain once, for both.
- Scaleway account created, TEM enabled, **DPA signed**; Scaleway added to the processor list in
  the privacy-policy work (#101).
- Domain verified in TEM; SPF/DKIM/DMARC published and green.
- SMTP credentials injected as deploy-environment secrets — never in the repo or image.

## Consequences

- `SmtpMailer` is a real `JavaMailSender`-backed adapter; the profile posture is unchanged (mock
  default, `MockMailerProdGuard` bars the mock from prod) — production runs `prod,mailer`.
- `riviera.recovery.link-base-url` must be an explicit env placeholder documented in
  `docs/deploy/cd-pipeline.md` before real sends exist, or every mailed link points at
  `http://localhost:4200`.
- The mock keeps recording every message kind so CI/e2e stay hermetic.
- An activation runbook (`docs/runbooks/mailer-profile-smoke-test.md`) documents profile +
  secrets + a smoke send.
- A future implementer must **not**: send on the request thread of an anonymous flow; enable
  open/click tracking; log a tokenized link or booking code at the transport layer (invariant
  #7); or pick a US-parented provider without re-opening this ADR.

## Alternatives considered

- **Brevo** — strong second (free 300/day, DE servers, self-serve DPA); shared
  marketing/transactional infra dents deliverability slightly. Named fallback.
- **Mailjet** — EU DC but US-linked parent and an SPF/DMARC alignment footgun.
- **Amazon SES (eu-central-1)** — cheapest at scale, but US parent means DPF dependence + a
  transfer-impact assessment; volume never gets big enough for the price to matter.
- **Postmark** — best-in-class deliverability, US-only storage; rejected on residency.
- **Self-hosted Postfix/Mailcow on Hetzner** — full sovereignty, full ops burden; rejected.
- **Send from the app host directly** — blocked ports (Hetzner) + zero IP reputation; rejected.

## Amendment log

- 2026-07-27, #371 — decision 5's registry vehicle is at-least-once with an accepted crash-window
  duplicate, not idempotent per booking as first written.
- 2026-07-28, #386 — decision 7's transient-lookup carve-out on the recovery vehicle.
- 2026-07-30, #380 — the synchronous admin re-send exception in decision 5.
- 2026-07-30, #439 / #442 — the in-memory vehicle's loss justification made per kind; the drop
  counter carries the kind on every reason.
- 2026-07-30, #451 — the query-timeout bullet named `SELECT … FOR UPDATE`; the claim is an
  `INSERT … ON CONFLICT`. The decision was unaffected.
