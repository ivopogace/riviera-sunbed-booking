# Email S1 — Real SmtpMailer over the SMTP relay (#368) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the throwing `SmtpMailer` with a real `JavaMailSender`-backed adapter that
delivers the existing verification and password-reset emails over a configured SMTP relay
(Scaleway TEM in deployment, any RFC-compliant relay by config), with finite timeouts,
fail-at-boot config validation, an env-configurable link base URL, and an activation runbook.

**Architecture:** The `Mailer` edge port and the profile posture are untouched — `MockMailer`
stays the `!mailer` default, `MockMailerProdGuard` still bars the mock from `prod`; only the
`mailer`-profile implementation changes from "throw" to "send". SMTP config lives in a new
`application-mailer.properties` whose placeholders have **no defaults**, so activating the
profile without env config fails at placeholder resolution — boot, not first send (the one
significant decision; it also keeps `spring.mail.host` unset in the default profile so
`MailSenderAutoConfiguration` never activates there).

**Persistence:** JDBC only (invariant #1). No tables or migrations touched (the suppression
table is a later slice of epic #367).

**Source of intent:** issue #368 (Email S1), epic #367, ADR-0011
(`docs/adr/ADR-0011-transactional-email-scaleway-tem.md`).

**Skills consulted:** `riviera-java-conventions` (package-private edge component, constructor
injection, no bare catch, no secret in logs §10, one-line comments §6c),
`riviera-modulith` (mail transport stays platform-edge — root package, RV-BE-11; `Mailer`
port unchanged, no module surface touched), `riviera-plan-doc` (this doc),
`riviera-local-debug` (to load before the first `./gradlew` of the implement session).
`postgres` N/A — no migration. Frontend skills N/A — backend + docs only.

**Branch:** `feature/email-s1-smtp-mailer`

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an `SmtpMailer` wired to a local SMTP sink (GreenMail), when
  `sendEmailVerification(to, link)` is invoked, then exactly one message is delivered to
  `to` with the verification subject and a plain-text body containing the tokenized link
  exactly as handed in (built on the configured base URL), with no HTML/tracking markup.
  *Pinned by:* `SmtpMailerIT.deliversVerificationEmailOverSmtp`
- [ ] **AC-2:** Given the same wiring, when `sendPasswordReset(to, link)` is invoked, then
  the reset message is delivered with the reset subject and the tokenized link, plain text
  only. *Pinned by:* `SmtpMailerIT.deliversPasswordResetEmailOverSmtp`
- [ ] **AC-3:** Given the `mailer` profile's mail session, then connection, read, and write
  timeouts are all finite (the Jakarta Mail infinite defaults are overridden).
  *Pinned by:* `MailerProfileWiringTest.smtpTimeoutsAreFinite`
- [ ] **AC-4:** Given the `mailer` profile with SMTP env config absent, when the context
  starts, then boot fails (unresolved placeholder), and given the config present it boots
  with `SmtpMailer` as the sole `Mailer`. *Pinned by:*
  `MailerProfileWiringTest.mailerProfileWithoutSmtpConfigFailsAtBoot` /
  `.mailerProfileWithSmtpConfigBootsSmtpMailer`
- [ ] **AC-5:** Given the `prod` profile alone, when the context starts, then boot still
  aborts (guard unchanged); the default profile still wires the recording `MockMailer` and
  every existing suite stays green unchanged. *Pinned by:* existing
  `MockMailerProdGuardTest` + `MockMailerTest` + `EmailVerificationIT` + `PasswordResetIT`
  (all unmodified)
- [ ] **AC-6:** Given no `RIVIERA_RECOVERY_LINK_BASE_URL` in the environment, when
  `RecoveryProperties` binds, then `linkBaseUrl` is `http://localhost:4200` (the placeholder
  default), and the property line is the explicit
  `${RIVIERA_RECOVERY_LINK_BASE_URL:http://localhost:4200}` form documented in
  `docs/deploy/cd-pipeline.md` with the deployed value stated as the backend's own origin.
  *Pinned by:* `MailerProfileWiringTest.linkBaseUrlDefaultsToLocalDevSpa` + doc review
- [ ] **AC-7:** Given a send through `SmtpMailer`, when it succeeds or fails, then the raw
  tokenized link never appears in log output at the transport layer (invariant #7).
  *Pinned by:* `SmtpMailerIT.neverLogsTheTokenizedLink` (OutputCapture)
- [ ] **AC-8:** The activation runbook exists at `docs/runbooks/mailer-profile-smoke-test.md`
  mirroring the Stripe smoke test: profile, env vars, a smoke send, verification steps.
  *Pinned by:* doc review (no test)

## Non-goals

- **Async / off-request-thread dispatch** — #369 (the timing-oracle closure). This slice
  keeps the send synchronous inside `CustomerRecovery.sendQuietly`; acceptable because prod
  activation is blocked on #370 anyway (see R-1).
- **New message kinds** (booking confirmation etc.) — #371+; the `Mailer` port keeps exactly
  its two methods.
- **Bounce/complaint webhooks + suppression table** — later slice (its own Flyway migration).
- **DNS/domain setup, live Scaleway smoke send** — #370 (human setup: account, domain, DPA,
  DNS); the runbook documents it, this slice cannot execute it.
- **HTML templating / localization** — plain-text English v1 (ADR-0011).
- **Changing `MockMailer`, the `Mailer` port, or any module code.**

## Behavior-parity ledger

The replaced surface is the `mailer`-profile `SmtpMailer` itself (deliberately throwing).

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Any send under `mailer` throws `UnsupportedOperationException` (fail loudly, no silent mock fallback) | changed | Sends really deliver; the fail-loudly *intent* moves earlier: missing config now aborts at **boot** (AC-4), which is stricter than failing on first send |
| `RealMailerTest` pins the throw | dropped | The behavior it pinned is the one this slice removes; replaced by `SmtpMailerIT` + `MailerProfileWiringTest` |
| Default profile records via `MockMailer`; `prod` alone aborts | preserved | Untouched — pinned by the existing unmodified suites (AC-5) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Synchronous SMTP round-trip on the request thread under `mailer` re-opens the timing account-enumeration oracle (#255 item 2) and can pin request threads | high (once activated) | med | Known interim state, explicitly scoped to #369 (next slice); prod activation is separately blocked on #370's human setup, so no production exposure inside this slice. `sendQuietly` already prevents transport failures from failing the request | Claude | open |
| R-2 | `spring.mail.host=${…:}` with an **empty default** in the main `application.properties` would satisfy `@ConditionalOnProperty` and activate `MailSenderAutoConfiguration` in the default profile (and defeat fail-at-boot) | med | high | All `spring.mail.*` lives ONLY in `application-mailer.properties`, placeholders **without defaults** → unresolved placeholder aborts boot under `mailer`, and the default profile never sees a `spring.mail.host` | Claude | open |
| R-3 | SMTP credentials or the tokenized link leak into repo, image, or logs (invariant #7) | low | high | Credentials only via env placeholders (Stripe-key posture); `SmtpMailer` logs nothing but exception class names on failure — asserted by `SmtpMailerIT.neverLogsTheTokenizedLink`; STARTTLS `required=true` so credentials never cross plaintext | Claude | open |
| R-4 | GreenMail / Jakarta Mail version mismatch with Spring Boot 4 (jakarta namespace) | med | med | Use the GreenMail 2.x line (`com.icegreen:greenmail-junit5`), which targets jakarta.mail; verify the exact current version at implement time before pinning | Claude | resolved — 2.1.3 pinned, `SmtpMailerIT` green (phase 0) |
| R-5 | Full-suite-only failure from context/profile tests polluting shared state (case history #122/#127) | low | med | `MailerProfileWiringTest` uses `ApplicationContextRunner` (no shared context caching); scoped local runs + the CI gate per push | Claude | open |
| R-6 | A future provider switch breaks silently | low | low | No Scaleway-specific code anywhere — host/port/creds are pure config; the runbook names Scaleway values only in its env-example section | Claude | open |

## Open questions / Assumptions

- **Assumption:** the From address needs its own env-configured value (the issue doesn't name
  one; the epic says `From: noreply@` and the domain is undecided until #370/#291) — modeled
  as `riviera.mail.from=${RIVIERA_MAIL_FROM}` (no default) in `application-mailer.properties`,
  validated non-blank in the `SmtpMailer` constructor. — *Owner:* Claude · *Resolves by:* phase 1
### Resolved

- **Assumption (resolved, phase 0):** subjects are "Verify your email" / "Reset your
  password" — plain-text English v1, shipped as constants in `SmtpMailer`, pinned by
  `SmtpMailerIT`.
- **Risk R-4 (resolved, phase 0):** GreenMail pinned at `greenmail-junit5:2.1.3` (current
  Maven Central latest, jakarta line) — `SmtpMailerIT` green against Boot 4's mail starter.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no booking, beach-map, or `availability` code in scope;
the slice touches only the edge mail transport and docs.

## Spring Modulith — modules, interfaces, events

**Modules touched:** none. Every file in scope lives at the platform edge (root package
`ai.riviera.platform`) per RV-BE-11 — login/session/mail machinery never in modules. The
`Mailer` port, `MockMailer`, `MockMailerProdGuard`, and `CustomerRecovery` keep their exact
signatures; `SmtpMailer` changes implementation only (gains `JavaMailSender` + from-address
constructor deps, stays package-private `@Profile("mailer")`).

**Cross-module named interfaces:** none added or changed.

**Domain events:** none (event-driven mail is #371+, riding the Event Publication Registry).

### Module ownership (§4a)

All in the platform edge (root package), no boundary change: mail transport is edge
machinery (RV-BE-11) exactly as shipped in S8; no module's Job/Not-My-Job is affected.
`ModularityTests` + `PackageShapeArchitectureTests` must stay green untouched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

N/A — backend + docs only.

## FE↔BE contract

N/A — no contract change (no endpoint or DTO touched).

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session before acting.
> Update in the same commit window as the change it records.

**Stage pointer:** implement (phase 1)

**Next action:** phase 1 step 1 — write `MailerProfileWiringTest` red.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Real `SmtpMailer` + GreenMail IT | ✅ | `feat(#368): implement SmtpMailer…` (sha at close-out) |
| 1 — Boot-time config posture (`application-mailer.properties` + wiring tests) | | |
| 2 — `link-base-url` env placeholder + deploy docs | | |
| 3 — Activation runbook | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/build.gradle` — add `spring-boot-starter-mail` (implementation) +
  `greenmail-junit5` (testImplementation)
- `platform/src/main/java/ai/riviera/platform/SmtpMailer.java` — real
  `JavaMailSender`-backed implementation (constructor: sender + from; validates from
  non-blank at boot)
- `platform/src/main/resources/application-mailer.properties` — NEW: `spring.mail.*`
  placeholders without defaults (host/port/username/password), STARTTLS enabled+required,
  finite `connectiontimeout`/`timeout`/`writetimeout`, `riviera.mail.from`
- `platform/src/main/resources/application.properties` — `riviera.recovery.link-base-url`
  becomes `${RIVIERA_RECOVERY_LINK_BASE_URL:http://localhost:4200}`
- `platform/src/test/java/ai/riviera/platform/SmtpMailerIT.java` — NEW: GreenMail delivery
  + no-token-in-logs assertions
- `platform/src/test/java/ai/riviera/platform/MailerProfileWiringTest.java` — NEW:
  `ApplicationContextRunner` boot-posture tests (missing-config fails, present-config boots,
  timeouts finite, link-base-url default)
- `platform/src/test/java/ai/riviera/platform/RealMailerTest.java` — DELETE (pins the
  removed throw behavior; superseded)
- `docs/deploy/cd-pipeline.md` — env section gains `RIVIERA_SMTP_HOST/PORT/USERNAME/PASSWORD`,
  `RIVIERA_MAIL_FROM`, `RIVIERA_RECOVERY_LINK_BASE_URL` (deployed value = backend's own
  origin, same-origin since #110)
- `docs/runbooks/mailer-profile-smoke-test.md` — NEW: activation runbook (profile + env +
  smoke send), mirroring `stripe-profile-smoke-test.md`

---

## Phase 0 — Real `SmtpMailer` + GreenMail IT

**Files:** Modify `platform/build.gradle`, `SmtpMailer.java` · Create `SmtpMailerIT.java` ·
Delete `RealMailerTest.java`

- [ ] **Step 1: Write the failing test** — `SmtpMailerIT`: GreenMail (`greenmail-junit5`
  `@RegisterExtension`, SMTP on a dynamic port), a real `JavaMailSenderImpl` pointed at it,
  `new SmtpMailer(sender, "noreply@test.local")`; assert delivery, recipient, subject,
  plain-text body containing the exact link, no `text/html` part, and (OutputCapture) the
  link/token absent from logs.
- [ ] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*SmtpMailerIT*"` → FAIL (throws `UnsupportedOperationException`)
- [ ] **Step 3: Minimal implementation** — `SmtpMailer` gains
  `SmtpMailer(JavaMailSender sender, @Value("${riviera.mail.from}") String from)`
  (constructor validates from non-blank), builds a `SimpleMailMessage` (plain text) per kind,
  subject constants named (§6a), no logging of the link; delete `RealMailerTest`.
- [ ] **Step 4: Run it, verify it passes** —
  `./gradlew test --tests "*SmtpMailerIT*" --tests "*MockMailer*"` → PASS
- [ ] **Step 5: Generalization-audit pass** — N/A unless a bug surfaces (record if so).
- [ ] **Step 6: Commit** — `feat(#368): implement SmtpMailer over JavaMailSender, proven against a GreenMail sink`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Boot-time config posture

**Files:** Create `application-mailer.properties`, `MailerProfileWiringTest.java`

- [ ] **Step 1: Write the failing test** — `MailerProfileWiringTest`
  (`ApplicationContextRunner` + the mailer auto-config + `SmtpMailer`/`MockMailer`/guard
  beans): `mailer` profile without SMTP properties → context failure (unresolved
  placeholder); with them → single `Mailer` = `SmtpMailer`; session timeouts finite;
  `prod` alone still aborts (delegating to the existing guard behavior).
- [ ] **Step 2: Run red** — `./gradlew test --tests "*MailerProfileWiringTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `application-mailer.properties` with no-default
  placeholders (`RIVIERA_SMTP_HOST`, `RIVIERA_SMTP_PORT` defaulting 587 is allowed,
  `RIVIERA_SMTP_USERNAME`, `RIVIERA_SMTP_PASSWORD`, `RIVIERA_MAIL_FROM`), STARTTLS
  enable+require, `mail.smtp.connectiontimeout/timeout/writetimeout` finite.
- [ ] **Step 4: Run green + scoped regression** —
  `./gradlew test --tests "*Mailer*" --tests "*Recovery*"` → PASS
- [ ] **Step 5: Generalization-audit** — check the Stripe profile posture for the same
  empty-default trap (R-2 pattern) — record findings, fix only if in scope.
- [ ] **Step 6: Commit** — `feat(#368): fail at boot when the mailer profile lacks SMTP config`
- [ ] **Step 7: Update execution status.**

## Phase 2 — `link-base-url` env placeholder + deploy docs

**Files:** Modify `application.properties:221`, `docs/deploy/cd-pipeline.md`

- [ ] **Step 1: Test first** — extend `MailerProfileWiringTest.linkBaseUrlDefaultsToLocalDevSpa`
  binding `RecoveryProperties` against the real property source → default stays
  `http://localhost:4200`.
- [ ] **Step 2–4:** flip the property line to
  `${RIVIERA_RECOVERY_LINK_BASE_URL:http://localhost:4200}`; document all six new env vars in
  `cd-pipeline.md` (deployed `RIVIERA_RECOVERY_LINK_BASE_URL` = the backend's own origin,
  same-origin per #110); scoped run PASS.
- [ ] **Step 6: Commit** — `feat(#368): make the recovery link base URL an explicit env placeholder`
- [ ] **Step 7: Update execution status.**

## Phase 3 — Activation runbook

**Files:** Create `docs/runbooks/mailer-profile-smoke-test.md`

- [ ] Mirror `stripe-profile-smoke-test.md`: prerequisites (#370 human setup: Scaleway
  account, TEM, domain, DNS, DPA), env vars, `SPRING_PROFILES_ACTIVE=mailer` (and the
  `prod,mailer` production pairing), a smoke send via the forgot-password flow, GreenMail
  local variant, cleanup (roll credentials). No secret values anywhere.
- [ ] **Commit** — `docs(#368): mailer activation runbook mirroring the Stripe smoke test`
- [ ] **Update execution status** → stage pointer `CI gate`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/3/7:** `./gradlew test --tests "*SmtpMailerIT*" --tests "*MailerProfileWiringTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** `MailerProfileWiringTest` both directions → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** full CI run green with `MockMailerProdGuardTest`/`MockMailerTest`/`EmailVerificationIT`/`PasswordResetIT` unmodified. Verified at CI run `<url>`.
- [ ] **AC-6:** property line + `cd-pipeline.md` section present; binding test PASS. Verified at commit `<sha>`.
- [ ] **AC-8:** runbook committed. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** N/A justified (no availability code in scope).
- [ ] **Modulith** section filled; no module code touched; `ModularityTests` +
      `PackageShapeArchitectureTests` green untouched (invariant #11).
- [ ] **Payment/payout** N/A.
- [ ] No secret in repo/image/logs; no tokenized link logged at the transport layer (invariant #7).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` plus `riviera-review-overlay`.
