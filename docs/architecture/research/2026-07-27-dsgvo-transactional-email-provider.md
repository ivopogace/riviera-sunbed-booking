# DSGVO-Compliant Transactional Email for a Hetzner-Hosted Spring Boot + Angular App ("Riviera")

**TL;DR**
- **Use a European-jurisdiction email API/SMTP relay — do not send directly from your Hetzner Cloud IP.** For "Riviera," the best all-around DSGVO pick is **Scaleway Transactional Email (TEM)** (French, 100% EU-processed, pay-as-you-go €0.25 per 1,000 mails, no US parent); the best budget/all-in-one EU pick is **Brevo** (French group; Sendinblue GmbH, Berlin; free 300/day; DE+FR servers; self-serve AVV); and the best "German-servers" option for regulator-sensitive tenants is **rapidmail** or **CleverReach** (though those are newsletter-first, not developer-first).
- **"DSGVO-conform" from a provider means, concretely: a self-serve Art. 28 AVV/DPA, EU-only data residency for content + logs + recipient data, a published sub-processor list, no mandatory non-essential tracking (open/click pixels need consent under §25 TDDDG), and ideally ISO 27001 / C5 / TÜV certification.** US-headquartered providers (SendGrid/Twilio, Postmark, Amazon SES, Mailgun) remain legally *workable* under the EU-US Data Privacy Framework as of mid-2026, but the framework is under appeal (Latombe) and the German DSK explicitly tells controllers to "prepare for" its possible CJEU invalidation — so an EU-jurisdiction provider removes an entire class of risk.
- **Integration:** send asynchronously from a Spring Modulith `@ApplicationModuleListener` backed by the Event Publication Registry (at-least-once retry), prefer the provider SMTP relay via Spring Boot's `JavaMailSender` on **port 587** (25/465 are blocked by default on Hetzner Cloud), keep secrets out of the image, and set up SPF + DKIM + DMARC per sending domain.

---

## Key Findings

1. **An EU-jurisdiction provider is the cleanest legal path.** Scaleway TEM, Brevo, Mailjet (French, but Sinch parent is Swedish + DPF-registered), rapidmail and CleverReach (German servers) all avoid or minimize third-country transfer. Scaleway's TEM FAQ states verbatim: *"For our Transactional Email service, no personal data is transferred outside the EU, so a TIA was not required."*
2. **The DPF is valid but fragile.** The EU General Court upheld it on 3 Sep 2025 (Latombe, Case T-553/23) — IAPP: the court *"dismissed a challenge brought by Member of French Parliament Philippe Latombe to annul the DPF and confirmed the framework validity based on the facts and law at the time of the European Commission's adequacy determination."* An appeal to the CJEU was reported (Case C-703/25 P, filed 31 Oct 2025 per University of Copenhagen and Recording Law commentary) and is pending as of mid-2026; FISA §702 is in short-term extension limbo, and the PCLOB lost quorum in Jan 2025.
3. **US "EU regions" fix data-at-rest but not jurisdiction.** SendGrid EU, Mailgun EU, Amazon SES EU (Frankfurt/Ireland) and (US-only) Postmark still fall under the US CLOUD Act via their parent company; German procurement reviews will flag this as residual risk.
4. **Open/click tracking is a consent problem** under §25 TDDDG/TTDSG even for transactional mail (Dr. Datenschutz: reading that an email was opened is an "Auslesen bzw. Zugriff" requiring consent); keep tracking **off** for booking confirmations, receipts and password resets.
5. **Never send from the Hetzner IP directly:** Hetzner's Cloud FAQ states it *"block[s] ports 25 and 465 by default on all cloud servers,"* unblockable only via a limit request *"once you have been with us for a month and paid your first invoice."* Port 587 (submission to an external relay) *"is not blocked and can be used without sending a limit request."*
6. **Multi-tenant "send on behalf of operators"** is best handled with a single platform domain and per-tenant `Reply-To` for the simple case, or per-tenant domain authentication (own DKIM selector per operator domain) if operators want mail truly "from" their own brand.

---

## Details

### 1. Provider landscape (EU-first)

| Provider | HQ / jurisdiction | Data residency | AVV/DPA | Tracking off by default? | Certs | Notes |
|---|---|---|---|---|---|---|
| **Scaleway TEM** | France (EU) | 100% EU (fr-par; FR/NL) | Yes | Yes (transactional only, no marketing) | ISO 27001 (Scaleway) | Dev-first API + SMTP relay `smtp.tem.scw.cloud`; no US parent. Best sovereignty story. |
| **Brevo** (ex-Sendinblue) | France; Sendinblue GmbH, Berlin | DE (Frankfurt) + FR (Paris) | Yes, self-serve in account | Configurable | ISO 27001, ISO 27701, SOC 2 Type II; TÜV (legacy Sendinblue GmbH) | All-in-one (marketing + transactional). Note: marketing-automation cookie needs consent. |
| **Mailjet** (Sinch) | France; parent Sinch (Sweden) | EU (data centre in Belgium/FR) | Yes | Yes | AFNOR/AFAQ (GDPR), ISO 27001 | Sinch adheres to EU-US DPF; SPF alignment fails by default (Return-Path on Mailjet domain) → rely on DKIM. |
| **Mailgun EU** | US (Sinch) | EU region opt-in | Yes | — | ISO 27001 (Sinch) | US parent → CLOUD Act residual risk. Dev tooling strong. |
| **rapidmail** | Germany (Freiburg) | Germany only (Freiburg + Frankfurt) | Yes, in-account | Double-opt-in mandatory | ISO 27001 (data centre), TÜV Saarland | Newsletter-first; limited transactional API. |
| **CleverReach** | Germany (Rastede) | Germany | Yes, in-account | Double-opt-in default | DIN ISO/IEC 27001 (data centre), PCI DSS L1 | Newsletter-first; regulator-friendly. |
| **SMTP2GO** | US/NZ | EU DC option (Amsterdam; inbound London/Frankfurt) | Yes, in dashboard | Yes | ISO 27001, M3AAWG | Good deliverability, but US-linked corporate group. |
| **Postmark** | US (ActiveCampaign) | **US only, no EU option** | Yes | Streams; tracking optional | SOC 2 | Excellent deliverability but **dealbreaker** for strict EU residency. |
| **Amazon SES (EU)** | US (AWS) | EU region (eu-central-1 Frankfurt) | Yes (AWS GDPR DPA) | Yes | ISO 27001, C5 (BSI), many | Cheapest at volume ($0.10/1,000) but US parent + self-managed. |
| **SendGrid (Twilio) EU** | US | EU region | Yes | Configurable | ISO 27001 | US parent → CLOUD Act. |
| **Newer EU-sovereign dev options** | EU (various) | EU only | Yes | Yes | varies | AhaSend, Lettermint, Remails, Notifuse, EmailLabs (PL), MessageFlow (PL) — smaller but EU-native. |

**Hetzner's own mail / self-hosting.** Hetzner does not offer a managed transactional-email API; it offers general hosting and (on its managed products) mailbox hosting, not a developer send-API. Self-hosting a mail stack (Mailcow, Postfix relay, mailbox.org/mail.de mailboxes, Uberspace) is possible but means you own IP-reputation, warm-up, blocklist handling, DKIM rotation and deliverability monitoring — high operational cost for a small team, and Hetzner Cloud IPs start with poor reputation. **Mailpit** and **Mailcow's** dev tooling are for local/testing, not production sending. Recommendation: don't self-host production transactional mail for this project.

**Newsletter2Go** was acquired and folded into **Brevo** (the Berlin-based Sendinblue GmbH) — so "Newsletter2Go" is now Brevo. **Mailingwork** and **Inxmail** are German marketing-email houses (German servers, AVV) but are campaign platforms, overkill for transactional API sending.

### 2. What "DSGVO-conform" actually requires from the provider

- **Art. 28 AVV/DPA.** You (controller) must have a data processing agreement with the provider (processor). Self-serve/in-account is available at **Brevo, rapidmail, CleverReach, SMTP2GO** (dashboard) and via signed DPA at **Scaleway, Mailjet, AWS**. Practically every serious provider publishes one; the differentiator is EU vs. US processing, not whether a DPA exists.
- **Data residency (content + logs + recipient data + sub-processors).** This is the real differentiator. Scaleway processes TEM entirely in the EU (no TIA needed). Brevo stores on DE/FR servers. US providers' "EU regions" cover data-at-rest but the parent remains subject to the US CLOUD Act — "your data sits in Frankfurt and you are still not GDPR-safe" is the widely-cited critique. Always read the sub-processor list (e.g., CDN/monitoring may still route through a US sub-processor).
- **Post-Schrems II / DPF status (2026).** The EU-US Data Privacy Framework is *current EU law*: the General Court upheld it (Latombe, 3 Sep 2025), but a CJEU appeal is pending, and the DSK's official Anwendungshinweise (4 Sep 2023, "V. Ausblick," p. 31) state verbatim that adequacy decisions *"können nach Art. 45 DS-GVO durch den EuGH gerichtlich überprüft und ggf. für ungültig erklärt werden. Auf diese Möglichkeit müssen Verantwortliche sich einstellen"* ("controllers must prepare for this possibility"), and that if adequacy is lost you must fall back on another Chapter V instrument (SCCs) or stop the transfer. **Legal nuance is genuinely contested here — consult a data-protection lawyer / your DPO before relying on a US provider for personal data.** Note the DPF is *sectoral*: a US provider must actually appear on the U.S. DoC DPF certification list, re-checked annually.
- **Tracking / logging.** Open-tracking pixels and click-tracking links are, per German commentary (Dr. Datenschutz) and §25 TDDDG, generally consent-requiring because they read/store information on the recipient's device — even in "transactional" mail. Keep tracking disabled for confirmations, receipts, resets. Also review IP logging and log-retention settings (e.g., Brevo retains transactional logs without a fixed time limit for standard accounts; Mailgun's base plan keeps only 5 days).
- **Certifications German DPAs like:** ISO 27001, ISO 27701, BSI **C5**, SOC 2, and German TÜV audits. AWS carries C5; Brevo carries ISO 27001/27701 + SOC 2; German houses carry ISO 27001 (data-centre level) + TÜV. Caveat: those German certs are typically at the *data-centre* level, not the company/software level.

### 3. Spring Boot 4.1 integration

**SMTP vs. HTTP API.** SMTP (via `spring-boot-starter-mail` + `JavaMailSender`) is provider-portable — switching providers is a config change, and all EU providers (Scaleway `smtp.tem.scw.cloud`, Brevo, Mailjet) offer an SMTP relay. HTTP APIs (provider SDKs) give richer features (templates, batch, per-message metadata, webhook IDs) but couple you to one vendor. **For a portable, multi-provider-friendly design, use SMTP through `JavaMailSender`; reach for the HTTP API only if you need templating/analytics that SMTP can't express.**

**Autoconfiguration.** Spring Boot autoconfigures a `JavaMailSender` (`MailSenderAutoConfiguration`) when `spring-boot-starter-mail` is on the classpath and `spring.mail.host` is set. This is unchanged in Spring Boot 4.x; there is no breaking change to mail autoconfiguration in 4.1 beyond the Jakarta Mail baseline (`jakarta.mail`, not `javax.mail`, which has been the case since Boot 3.x). Set finite timeouts (the defaults are infinite):

```yaml
spring:
  mail:
    host: smtp.tem.scw.cloud
    port: 587
    username: ${SMTP_USERNAME}
    password: ${SMTP_PASSWORD}
    properties:
      mail.smtp.auth: true
      mail.smtp.starttls.enable: true
      mail.smtp.connectiontimeout: 5000
      mail.smtp.timeout: 5000
      mail.smtp.writetimeout: 5000
```

**Async sending with Spring Modulith.** Publish a domain event inside the booking transaction and consume it with `@ApplicationModuleListener` — a meta-annotation combining `@Async`, `@Transactional`, and `@TransactionalEventListener(phase = AFTER_COMMIT)`. The listener runs in its own transaction only after the booking commits, so a mail failure never rolls back the booking. Back it with the **Event Publication Registry** (`spring-modulith-starter-jdbc`, since you use Spring Data JDBC) which persists each publication to an `event_publication` table and marks it complete on success — giving at-least-once delivery. Set `spring.modulith.events.republish-outstanding-events-on-restart=true` so incomplete sends are retried after a crash/restart, and pick a completion mode (`DELETE` or `ARCHIVE`) so the table doesn't grow unbounded.

```java
@Component
class BookingNotifications {
  @ApplicationModuleListener
  void on(BookingConfirmed event) {
    mailService.sendConfirmation(event.bookingId()); // async, own tx, persisted + retried
  }
}
```

**Retry / idempotency.** The registry gives retry; make the send idempotent by keying on the event/booking ID (store a `sent` marker or use the provider's idempotency key / `Message-ID`) so a retried publication doesn't double-send. For provider outages, wrap the send with a short retry/backoff and let the registry hold the incomplete entry.

**Bounce/complaint webhooks.** Expose an HTTP endpoint to receive the provider's delivery/bounce/complaint webhooks (Scaleway: one webhook per domain on Essential, unlimited on Scale; Brevo/Mailjet have event webhooks). Persist hard bounces/complaints and suppress future sends to those addresses (list hygiene). Verify webhook signatures.

**Secrets on Hetzner.** Don't bake SMTP credentials into the Docker image or commit them. Use Docker/Compose secrets, environment variables injected at deploy, or a secrets manager; mount at runtime. Rotate on leak.

### 4. Deliverability & DNS (Hetzner scenario)

- **Why not the Hetzner IP:** ports 25 & 465 are blocked by default on Hetzner Cloud; you can request unblocking only after ~1 month and your first paid invoice, decided case-by-case. Port **587** (submission to an external relay) is open. Even unblocked, a single cloud IP has no sending reputation and lands in spam — use a relay/ESP with warmed, monitored IPs. (Practical gotcha reported by Hetzner users: 587 with STARTTLS works; implicit-TLS on 465 needs the unblock and sometimes explicit config.)
- **SPF** (TXT on the sending domain), authorizing the provider, e.g. Scaleway: `v=spf1 include:_spf.tem.scw.cloud ~all` (use the provider's exact include).
- **DKIM**: publish the provider's DKIM public key as a TXT/CNAME at `<selector>._domainkey.<domain>`; 2048-bit keys are standard.
- **DMARC**: start `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain` to monitor, then tighten to `quarantine`/`reject`.
- **Return-Path / alignment gotcha:** some providers (Mailjet) use their own bounce domain for Return-Path, so SPF won't align for DMARC — **rely on DKIM alignment**, or configure a custom return-path/CNAME where the provider supports it.
- **Dedicated vs shared IP:** at 1k–50k mails/month you want a **shared** pool (a dedicated IP needs high, steady daily volume to stay warm, and Scaleway's dedicated IP is on the Scale plan only). Shared is the right call for Riviera's volume.
- **Multi-tenant "send on behalf of operators":**
  - **Simple/default:** send from one platform domain (e.g. `noreply@riviera.app`), set a per-tenant friendly From name and a per-tenant `Reply-To: operator@venue.de`. One SPF/DKIM/DMARC set to maintain. Recommended starting point.
  - **Per-tenant branding:** authenticate each operator's domain — each operator publishes an SPF include + their own **DKIM selector** (selectors are independent namespaces, so many operators coexist without key-sharing) + DMARC. Higher ops cost; do it only for operators who insist mail be "from" their own domain. Scaleway, MailerSend, Mailgun and SES all support many verified sending domains.

### 5. Pricing (2026, 1k–50k mails/month)

| Provider | Free tier | Paid entry | Model |
|---|---|---|---|
| **Scaleway TEM** | 300 mails/month | **€0.25 per 1,000 mails**, no monthly fee (Essential, pay-as-you-go; billed per recipient) | per-email sent |
| **Brevo** | **300 emails/day** (~9,000/mo), forever free | ~$9/mo (5,000), ~$19/mo (20,000) | per-email sent (contacts free) |
| **Mailjet** | 6,000/mo (200/day cap) | Starter ~$9/mo (8,000 emails, up to 2,000 contacts); Essential ~$15–17/mo (15,000 emails, unlimited contacts) | per-email sent (contacts free) |
| **SMTP2GO** | 1,000/mo (200/day) | Starter ~$10/mo (10,000; $1/1k overage) | per-email sent |
| **Mailgun EU** | 100/day trial | ~$15/mo (10,000); Foundation ~$35/mo (50,000) | per-email sent |
| **Amazon SES (EU)** | (free only from EC2, first 12 mo) | **$0.10 per 1,000** (flat, no volume discount; per recipient) | per-email sent |
| **rapidmail** | 1 free send up to 2,000 recipients | from ~€15/mo, or pay-per-use from €0.001/email | per-email or per-contact |
| **CleverReach** | free entry tier | from ~€15–18/mo | per-contact |

At Riviera's volume (say 5k–20k mails/month), **Scaleway TEM costs roughly €1.25–€5/month** (pay-as-you-go), the cheapest realistic EU-sovereign option; **Brevo's free 300/day likely covers early production for free**, with $9–19/mo when you outgrow it. Brevo/Mailjet meter by **emails sent**, not contacts, which suits a booking app (many one-off recipients). Confirm exact current EUR figures on each provider's live pricing page before committing — Mailjet's live EUR price in particular should be re-checked, as its published pricing page is JS-rendered and third-party trackers disagree on the Essential tier ($15 vs $17).

### 6. Concrete recommendation for Riviera

**Rank 1 — Scaleway TEM (best all-around EU pick).** French cloud, 100% EU processing for content + logs, no US parent (no DPF/CLOUD-Act exposure), dev-first API + SMTP relay, transactional-only (no marketing-tracking baggage), trivially cheap pay-as-you-go, SPF/DKIM/DMARC + webhooks + dedicated-IP upgrade path. Fits your "concrete, code-grounded, EU-sovereign" priorities best. Wire it via `JavaMailSender` on port 587. Caveats: TEM sending is `fr-par`-region only; deliverability tooling is competent but less polished than Postmark; the 99.9% SLA applies only to the Scale plan.

**Rank 2 — Brevo (best budget / all-in-one EU pick).** Sendinblue GmbH (Berlin) with DE+FR servers, self-serve AVV, ISO 27001/27701 + SOC 2, generous free tier (300/day), clean REST API + SMTP + official Java SDK, easy SPF/DKIM/DMARC setup. Ideal if you later want operator newsletters too. Caveats: shared marketing+transactional infrastructure can slightly dent transactional deliverability (independent tests put Brevo below Postmark/SMTP2GO on inbox placement); keep the marketing-automation tracking cookie **off** unless you add a consent banner.

**Rank 3 — Mailjet (EU pick with strong API + template collaboration).** French, EU data centre, ISO 27001/AFNOR; good if you value the collaborative template editor. Caveats: Sinch (US-linked group) adheres to the DPF, so it's a hair less "clean" than Scaleway on sovereignty; and **SPF won't align for DMARC by default (Return-Path on Mailjet's domain) — rely on DKIM.**

**What to avoid and why.**
- **Postmark** — US-only storage, no EU region; a residency dealbreaker despite excellent deliverability.
- **Sending directly from Hetzner** — blocked ports + dead IP reputation; don't.
- **SendGrid / Mailgun / Amazon SES as primary for personal data** — legally *workable* via the DPF today, but you inherit US-parent CLOUD-Act residual risk and a pending CJEU appeal; only choose SES if cost-at-scale dominates and your DPO signs off on a transfer-impact assessment.
- **Self-hosting production mail (Mailcow/Postfix on Hetzner)** — operationally heavy; reputation/warm-up/blocklist burden not worth it for a small team.

---

## Recommendations (staged)

1. **Now (MVP):** Integrate **Scaleway TEM** (or Brevo if you want the free tier + future newsletters) via `spring-boot-starter-mail` + `JavaMailSender` on **port 587**. Send from `@ApplicationModuleListener` handlers backed by the Modulith Event Publication Registry (`spring-modulith-starter-jdbc`), with `republish-outstanding-events-on-restart=true`. Keep open/click tracking **off**. Sign the provider's AVV/DPA and add the provider to your Verzeichnis von Verarbeitungstätigkeiten and privacy policy.
2. **DNS:** Add SPF, DKIM (2048-bit), and DMARC (`p=none` → tighten) for `riviera.app`. Multi-tenant: start with single platform domain + per-tenant `Reply-To`.
3. **Webhooks + hygiene:** Consume bounce/complaint webhooks, persist suppressions, verify signatures, make sends idempotent by booking/event ID.
4. **Secrets:** Inject SMTP creds via Docker/Compose secrets or a secrets manager; never in the image.
5. **Scale triggers / thresholds:**
   - If a single operator exceeds **~5,000 mails/day**, move that operator to a **dedicated IP** (Scaleway Scale plan) and its own subdomain/stream.
   - If operators demand mail truly "from" their own domain → implement **per-tenant DKIM delegation** (own selector per operator domain).
   - If DMARC aggregate reports show failures → confirm you're relying on DKIM alignment (esp. on Mailjet) and fix SPF includes.
   - **Legal trigger:** if the CJEU invalidates the DPF (watch the pending Latombe appeal) and you're on a US provider, you must fall back to SCCs + a transfer-impact assessment or stop the transfer — another reason to sit on an EU-jurisdiction provider now.

---

## Caveats
- **I am not a lawyer and this is not legal advice.** The DPF's legal status is actively contested (Latombe appeal pending; FISA §702 in flux; PCLOB weakened since Jan 2025). For any reliance on a US provider for personal data — or for your AVV, privacy policy, and transfer assessments — consult a Datenschutzbeauftragte(r) / German data-protection lawyer.
- I could independently confirm the Latombe General Court ruling (3 Sep 2025, T-553/23) via IAPP, and the appeal (reported as Case C-703/25 P, filed 31 Oct 2025) via academic and legal commentary; the exact CJEU docket number is worth re-verifying against the official CJEU register before you cite it in anything formal.
- Certifications are often held at the **data-centre** level, not the company/software level (true for rapidmail/CleverReach's ISO 27001) — verify scope.
- Pricing and free-tier limits change frequently; confirm exact current EUR figures on each provider's live pricing page before committing.
- "DSGVO-konform" in marketing copy is a claim, not a guarantee — your own obligations (consent, DPA, records of processing, data-subject rights, breach notification) remain regardless of provider.