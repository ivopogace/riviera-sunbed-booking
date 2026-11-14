# TEM bounce/complaint webhook → suppression list (Email S4) Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a Scaleway TEM delivery event, delivered through Topics & Events and verified as
Scaleway-signed and from our own topic, suppresses the recipient on a hard bounce or complaint. A
send to that address then skips silently, and anything unverified stores nothing.

**Architecture:** TEM has no shared-secret webhook. It publishes to a Scaleway Topics & Events
topic (SNS-compatible), and our HTTPS endpoint subscribes. Authenticity is therefore SNS signature
v1 (SHA1withRSA over the canonical string), with a signing cert that must chain to Scaleway's
configured CA. Because the signature only proves "Scaleway sent this", the endpoint also pins
**our** `TopicArn`. Idempotency needs no new table: the suppression upsert is idempotent, and its
out-of-order guard makes a replayed or stale event move nothing.

**Source of intent:** #372 (issue + its reconciling comment), epic #367, ADR-0011 decision 7,
ADR-0012.

**Branch:** `claude/372-tem-bounce-webhook-3b587f` (stands in for `feature/tem-bounce-webhook`)

**Provider facts (verified 2026-11-14 against Scaleway's docs source, `github.com/scaleway/docs-content`;
the live site is bot-shielded):**
- TEM webhooks are integrated exclusively with Topics & Events (`sns_arn`). There is no direct
  POST and no HMAC secret: `pages/transactional-email/how-to/create-webhooks.mdx`,
  `pages/transactional-email/api-cli/use-webhooks-with-sns-topics.mdx`.
- SNS protocol: `SubscriptionConfirmation` (confirm by GET on `SubscribeURL`, host
  `sns.mnq.<region>.scaleway.com`) and `Notification`. `SignatureVersion` 1 only. The canonical
  string is per AWS's SNS doc (Scaleway points there). The POST may carry no `Origin`.
  Sources: `pages/topics-and-events/how-to/create-manage-subscriptions.mdx`,
  `…/reference-content/topics-and-events-support.mdx`,
  `…/troubleshooting/cant-confirm-subscription.mdx`,
  `https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html`.
- Do not trust `SigningCertURL` directly: validate the cert against the long-term CA trust chain
  (`https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns-trust-chain.pem`, valid to 2032). The
  cert rotates at least yearly, so cache by URL: `…/reference-content/verifying-webhooks.mdx`.
- Event types: `email_dropped` and `email_mailbox_not_found` are hard bounces. `email_spam` is
  "identified as spam by Scaleway or the destination server", the only complaint-like type.
  `email_deferred` is a soft bounce. The others are informational. Payload fields: `id`, `type`,
  `email_to`, `created_at` (RFC 3339) and more:
  `pages/transactional-email/reference-content/webhook-events-payloads.mdx`,
  `macros/tem/webhook-event-types.mdx`.
- Delivery is at-least-once, so the same message may arrive more than once: `pages/topics-and-events/concepts.mdx`.

## Acceptance criteria

- [ ] **AC-1 (signature):** Given a POST whose SNS signature is missing, malformed, signed by a
  cert not chaining to the configured CA, or from a topic other than the configured one, when it
  reaches the endpoint, then it is refused `400 INVALID_SIGNATURE` (one indistinguishable answer)
  and `email_suppression` is untouched. *Seam:* `POST /api/notifications/tem/webhook` ·
  *Pinned by:* `TemWebhookIT` (rejection cases), `SnsMessageVerifierTest`.
- [ ] **AC-2 (suppress):** Given a verified `email_dropped`, `email_mailbox_not_found` or
  `email_spam` notification for an address, when ingested, then `EmailSuppressions.isSuppressed`
  answers true with reason `HARD_BOUNCE` or `COMPLAINT` at the event's `created_at`. Given
  `email_deferred` or another type, nothing is stored. *Seam:* the route plus `EmailSuppressions` ·
  *Pinned by:* `TemWebhookIT`.
- [ ] **AC-3 (idempotent / unordered):** Given a notification replayed after its first ingestion,
  or after an admin reinstated the address, when ingested, then there is no duplicate row, no error
  and no un-reinstatement. An event older than the row's last event never rewinds it, including
  when a reinstate commits while the upsert waits on the row lock. *Seam:*
  `EmailSuppressions.suppress` · *Pinned by:* `EmailSuppressionEventOrderIT`, `TemWebhookIT`
  (replay).
- [ ] **AC-4 (silent skip, end to end):** Given an address the webhook suppressed, when a booking
  confirmation is sent to it through `TransactionalMailService`, then `MockMailer` records nothing
  and the caller sees no error. *Seam:* the route, then the mail chokepoint · *Pinned by:*
  `TemWebhookIT.aBouncedAddressIsNotMailedAgain`.
- [ ] **AC-5 (subscription):** Given a verified `SubscriptionConfirmation` for our topic whose
  `SubscribeURL` is on an allowlisted host, when received, then the endpoint confirms it with one
  GET. An unallowlisted host is never fetched. *Seam:* the route plus the outbound confirmer ·
  *Pinned by:* `TemWebhookIT`, `SnsEndpointPolicyTest`.
- [ ] **AC-6 (SSRF):** Given a `SigningCertURL` that is not https on an allowlisted host with a
  `.crt` path, when verified, then nothing is fetched and the request is refused. *Pinned by:*
  `SnsEndpointPolicyTest`.
- [ ] **AC-7 (unconfigured = closed):** Given no topic ARN or trust chain configured, when anything
  is POSTed, then it is refused and stored nothing, and the app still boots under `prod` (#370 is
  open). *Pinned by:* `TemWebhookIT` / `TemWebhookPropertiesTest`.
- [ ] **AC-8 (docs):** The runbook covers topic, subscription, webhook registration, trust-chain
  and ARN config. No secret is committed (the CA is public; the ARN is config).

## Non-goals

- Closing the G-3 withheld-flag probe. That is an owner decision raised at intake: recommended as
  its own follow-up, and a hard precondition of live registration.
- A per-event-id dedupe table. The guarded upsert already makes replays inert, and storing TEM
  event ids would keep more than hygiene needs (ADR-0012 minimization).
- Acting on `email_blocklisted` / `blocklist_created`. TEM's own blocklist follows a bounce we
  already ingest.
- Live webhook registration (needs #370).

## Risks

- **R-1 forged callback** → SNS v1 signature over the canonical string, cert chained to the
  configured CA (PKIX), `TopicArn` pinned to config. Any failure gets the same `400`.
- **R-2 SSRF through `SigningCertURL` / `SubscribeURL`** (attacker-controlled before
  verification) → https only, an exact host allowlist (config), cert path `*.crt`, no redirects,
  finite timeouts, capped body. `SubscribeURL` is fetched only after verification.
- **R-3 stale or replayed event re-suppresses a reinstated address** → the guarded upsert. Its
  conflict arm reads the newest committed row (a snapshot CTE would not: proven red).
- **R-4 a verified but unreadable payload** → `200` with a WARN naming no address. A retry cannot
  fix a malformed body, and SNS retries are unbounded and undocumented. A database failure answers
  `5xx`, so SNS re-delivers.
- **R-5 `email_spam` may be a filter classification, not a recipient complaint** → suppress anyway
  (it is the only complaint signal TEM gives, and protects the shared IP). Admin reinstatement
  (#391) is the remedy. Documented in the runbook.
- **R-6 the withheld-flag oracle (G-3)** → raised to the owner. The feed is inert until live
  registration (#370), and the runbook gates registration on the decision's outcome.
- **R-7 PII in logs** → never log `email_to`, the token or the `SubscribeURL`. The domain alone
  may be logged (ADR-0012).
- **Flyway:** none needed, so V82 stays free. Sibling #1735 (V83) is unaffected.

## Open questions

### Resolved

- G-3 disposition: owner chose option 1 (owner-verified disclosure, neutral copy for everyone else; OWASP WSTG OTG-IDENT-004) as follow-up #1748, a hard precondition of live registration.

## Modulith

- Everything lives in `notification` (sole writer of `email_suppression`). The SNS protocol
  (controller, verifier, cert source, subscription confirmer, properties) sits in `adapter/in`; it
  calls the existing `application.EmailSuppressions` port. No new published surface, grant or
  event.
- `web` route policy: `POST /api/notifications/tem/webhook` `permitAll` and CSRF-exempt (signed,
  server-to-server, the Stripe-webhook posture). Coverage goes in `EndpointRoleGateCoverageTest`.
  The default 64 KiB body cap fits.

## Phases

- **Phase 0, out-of-order guard:** red `EmailSuppressionEventOrderIT` (4 cases, plus the snapshot
  CTE proven red), then the guarded upsert.
- **Phase 1, SNS verification:** red `SnsMessageVerifierTest` (runtime keytool PKI: valid, wrong
  CA, tampered field, wrong version, wrong topic) and `SnsEndpointPolicyTest` (URL allowlist).
- **Phase 2, the endpoint:** red `TemWebhookIT` (AC-1 through AC-5 and AC-7), then the controller,
  route policy, CSRF and role-gate list.
- **Phase 3, docs:** runbook, `application.properties`, `docs/deploy/cd-pipeline.md` env,
  RESPONSIBILITIES § notification, ADR-0011 decision 7 amendment, ADR-0012 consequence line.

## Execution status

**Stage pointer:** PR, merge main + ready for review

**Next action:** CI green on the docs push, then mark ready and run the high-effort review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0, out-of-order guard | ✅ | |
| 1, SNS verification | ✅ | |
| 2, endpoint | ✅ | |
| 3, docs | ✅ | |
