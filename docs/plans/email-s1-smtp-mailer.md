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

- [x] **AC-1:** Given an `SmtpMailer` wired to a local SMTP sink (GreenMail), when
  `sendEmailVerification(to, link)` is invoked, then exactly one message is delivered to
  `to` with the verification subject and a plain-text body containing the tokenized link
  exactly as handed in (built on the configured base URL), with no HTML/tracking markup.
  *Pinned by:* `SmtpMailerIT.deliversVerificationEmailOverSmtp`
- [x] **AC-2:** Given the same wiring, when `sendPasswordReset(to, link)` is invoked, then
  the reset message is delivered with the reset subject and the tokenized link, plain text
  only. *Pinned by:* `SmtpMailerIT.deliversPasswordResetEmailOverSmtp`
- [x] **AC-3:** Given the `mailer` profile's mail session, then connection, read, and write
  timeouts are all finite (the Jakarta Mail infinite defaults are overridden).
  *Pinned by:* `MailerProfileWiringTest.smtpTimeoutsAreFinite`
- [x] **AC-4:** Given the `mailer` profile with SMTP env config absent, when the context
  starts, then boot fails (unresolved placeholder), and given the config present it boots
  with `SmtpMailer` as the sole `Mailer`. *Pinned by:*
  `MailerProfileWiringTest.mailerProfileWithoutSmtpConfigFailsAtBoot` /
  `.mailerProfileWithSmtpConfigBootsSmtpMailer`
- [x] **AC-5:** Given the `prod` profile alone, when the context starts, then boot still
  aborts (guard unchanged); the default profile still wires the recording `MockMailer` and
  every existing suite stays green unchanged. *Pinned by:* existing
  `MockMailerProdGuardTest` + `MockMailerTest` + `EmailVerificationIT` + `PasswordResetIT`
  (all unmodified)
- [x] **AC-6:** Given no `RIVIERA_RECOVERY_LINK_BASE_URL` in the environment, when
  `RecoveryProperties` binds, then `linkBaseUrl` is `http://localhost:4200` (the placeholder
  default), and the property line is the explicit
  `${RIVIERA_RECOVERY_LINK_BASE_URL:http://localhost:4200}` form documented in
  `docs/deploy/cd-pipeline.md` with the deployed value stated as the backend's own origin.
  *Pinned by:* `MailerProfileWiringTest.linkBaseUrlDefaultsToLocalDevSpa` + doc review
- [x] **AC-7:** Given a send through `SmtpMailer`, when it succeeds or fails, then the raw
  tokenized link never appears in log output at the transport layer (invariant #7).
  *Pinned by:* `SmtpMailerIT.neverLogsTheTokenizedLink` +
  `SmtpMailerIT.aFailedSendThrowsWithoutLoggingTheTokenizedLink` (OutputCapture)
- [x] **AC-8:** The activation runbook exists at `docs/runbooks/mailer-profile-smoke-test.md`
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
| R-1 | Synchronous SMTP round-trip on the request thread under `mailer` re-opens the timing account-enumeration oracle (#255 item 2) and can pin request threads | high (once activated) | med | Known interim state, explicitly scoped to #369 (next slice); prod activation is separately blocked on #370's human setup, so no production exposure inside this slice. `sendQuietly` already prevents transport failures from failing the request | Claude | closed → deferred to #369 by design (review F-5 concurred); runbook bars prod activation before #369; `CustomerRecovery` Javadoc states the live risk |
| R-2 | `spring.mail.host=${…:}` with an **empty default** in the main `application.properties` would satisfy `@ConditionalOnProperty` and activate `MailSenderAutoConfiguration` in the default profile (and defeat fail-at-boot) | med | high | All `spring.mail.*` lives ONLY in `application-mailer.properties`, placeholders **without defaults** → unresolved placeholder aborts boot under `mailer`, and the default profile never sees a `spring.mail.host` | Claude | closed — shipped that way; pinned by `MailerProfileWiringTest.defaultProfileKeepsTheRecordingMockAndNoMailSession` + `.mailerProfileWithoutSmtpConfigFailsAtBoot` |
| R-3 | SMTP credentials or the tokenized link leak into repo, image, or logs (invariant #7) | low | high | Credentials only via env placeholders (Stripe-key posture); `SmtpMailer` logs nothing but exception class names on failure — asserted by `SmtpMailerIT.neverLogsTheTokenizedLink` (+ the failure-path twin); STARTTLS required by default (`RIVIERA_SMTP_STARTTLS_REQUIRED` override is local-sink-only) | Claude | closed — both log-hygiene tests green; no secret in the diff |
| R-4 | GreenMail / Jakarta Mail version mismatch with Spring Boot 4 (jakarta namespace) | med | med | Use the GreenMail 2.x line (`com.icegreen:greenmail-junit5`), which targets jakarta.mail; verify the exact current version at implement time before pinning | Claude | resolved — 2.1.3 pinned, `SmtpMailerIT` green (phase 0) |
| R-5 | Full-suite-only failure from context/profile tests polluting shared state (case history #122/#127) | low | med | `MailerProfileWiringTest` uses `ApplicationContextRunner` (no shared context caching); scoped local runs + the CI gate per push | Claude | closed — full CI suite green on `44eb284` (10/10 checks) |
| R-6 | A future provider switch breaks silently | low | low | No Scaleway-specific code anywhere — host/port/creds are pure config; the runbook names Scaleway values only in its env-example section | Claude | closed — verified in review; adapter is provider-agnostic |

## Open questions / Assumptions

(none open)

### Resolved

- **Assumption (resolved, phase 1):** the From address needs its own env-configured value —
  shipped as `riviera.mail.from=${RIVIERA_MAIL_FROM}` (no default) in
  `application-mailer.properties`, validated non-blank in the `SmtpMailer` constructor;
  the concrete address (`noreply@<domain>`) lands with #370/#291.

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

**Stage pointer:** DONE — merged via PR #377. All gates ran: CI green (10/10 checks on
`44eb284`), review gate ran 2026-07-27 (`/code-review` 5-agent fan-out + overlay; register
below), Sonar gate green **with the list pulled and clean** (0 new issues, 0 duplicated
blocks, new-code coverage 89.47% on new_lines=55 — a real analysis, not the false-clean read).

**Next action:** none — post-merge GitHub-only steps: epic #367 tick, Stripe fail-at-boot
follow-up issue, docs-freshness ran pre-merge (one finding, `CLAUDE.md` §mocked-externals,
patched in this PR).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Real `SmtpMailer` + GreenMail IT | ✅ | `16e0475` |
| 1 — Boot-time config posture (`application-mailer.properties` + wiring tests) | ✅ | `80ceddb` |
| 2 — `link-base-url` env placeholder + deploy docs | ✅ | `f830d8e` |
| 3 — Activation runbook | ✅ | `55d5347` |
| review-fix round (F-1..F-4, F-6) | ✅ | `44cb2ce` |
| 4 — STARTTLS-required env override for local sinks (user request, post-review) | ✅ | `44eb284` — `${RIVIERA_SMTP_STARTTLS_REQUIRED:true}`, pinned by `MailerProfileWiringTest.theEnvironmentCanRelaxStarttlsRequiredForLocalSinks`; deployed default stays `true` |
| close-out (plan final state + CLAUDE.md freshness patch) | ✅ | `51bdb13` |
| 5 — `smtp4dev` local-dev profile (Ivo, post-close-out): `@Profile("mailer \| smtp4dev")` / mock `!mailer & !smtp4dev`, `application-smtp4dev.properties` (defaults on purpose), sink script under `platform/tools/smtp4dev/` | ✅ | `89921d5` + reconcile commit (header comment rewritten to match the profile's actual posture, `SmtpMailer`/`MockMailer` Javadoc updated, runbook one-flag path, pinned by `MailerProfileWiringTest.smtp4devProfileBootsTheRealMailerOnLocalDefaultsWithoutEnv`) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — review gate ran 2026-07-27 (`/code-review` 5-agent fan-out +
`riviera-review-overlay`); 7 candidates, none ≥ the 80-confidence bar, 5 fixed anyway:

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (75) | `Mailer.java` Javadoc still said the real adapter is deferred | fixed-in-`44cb2ce` |
| F-2 | review (75) | `CustomerRecovery.sendQuietly` Javadoc: throw removed, "when it ships" happened, no #369 pointer | fixed — rewritten as live risk + #369 pointer |
| F-3 | review (75) | `RecoveryProperties` Javadoc: "cosmetic until the real mailer ships" contradicts the PR's own properties comment | fixed |
| F-4 | review (50) | `RecoveryMailerFailureIT` comment described the retired throwing posture | fixed — now "simulates a mail-transport failure" |
| F-5 | review (25) | Sync send on the request thread vs ADR-0011 §5, no code guard on `prod,mailer` | resolved by design — the epic's deliberate slicing (#368 transport / #369 async); AC of #368 requires `prod,mailer` to boot; prod exposure impossible until #370; runbook bars activation before #369 |
| F-6 | review (75) | AC-7 promised "succeeds or fails" but only the success path was tested | fixed — `SmtpMailerIT.aFailedSendThrowsWithoutLoggingTheTokenizedLink` |
| F-7 | review (0) | `RealMailerTest` deleted instead of "evolved" (epic wording) | false positive — behavior-parity ledger documents the replace; coverage intact |

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

- [x] **Step 1: Write the failing test** — `SmtpMailerIT`: GreenMail (`greenmail-junit5`
  `@RegisterExtension`, SMTP on a dynamic port), a real `JavaMailSenderImpl` pointed at it,
  `new SmtpMailer(sender, "noreply@test.local")`; assert delivery, recipient, subject,
  plain-text body containing the exact link, no `text/html` part, and (OutputCapture) the
  link/token absent from logs.
- [x] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*SmtpMailerIT*"` → FAIL (throws `UnsupportedOperationException`)
- [x] **Step 3: Minimal implementation** — `SmtpMailer` gains
  `SmtpMailer(JavaMailSender sender, @Value("${riviera.mail.from}") String from)`
  (constructor validates from non-blank), builds a `SimpleMailMessage` (plain text) per kind,
  subject constants named (§6a), no logging of the link; delete `RealMailerTest`.
- [x] **Step 4: Run it, verify it passes** —
  `./gradlew test --tests "*SmtpMailerIT*" --tests "*MockMailer*"` → PASS
- [x] **Step 5: Generalization-audit pass** — N/A unless a bug surfaces (record if so).
- [x] **Step 6: Commit** — `feat(#368): implement SmtpMailer over JavaMailSender, proven against a GreenMail sink`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Boot-time config posture

**Files:** Create `application-mailer.properties`, `MailerProfileWiringTest.java`

- [x] **Step 1: Write the failing test** — `MailerProfileWiringTest`
  (`ApplicationContextRunner` + the mailer auto-config + `SmtpMailer`/`MockMailer`/guard
  beans): `mailer` profile without SMTP properties → context failure (unresolved
  placeholder); with them → single `Mailer` = `SmtpMailer`; session timeouts finite;
  `prod` alone still aborts (delegating to the existing guard behavior).
- [x] **Step 2: Run red** — `./gradlew test --tests "*MailerProfileWiringTest*"` → FAIL
- [x] **Step 3: Minimal implementation** — `application-mailer.properties` with no-default
  placeholders (`RIVIERA_SMTP_HOST`, `RIVIERA_SMTP_PORT` defaulting 587 is allowed,
  `RIVIERA_SMTP_USERNAME`, `RIVIERA_SMTP_PASSWORD`, `RIVIERA_MAIL_FROM`), STARTTLS
  enable+require, `mail.smtp.connectiontimeout/timeout/writetimeout` finite.
- [x] **Step 4: Run green + scoped regression** —
  `./gradlew test --tests "*Mailer*" --tests "*Recovery*"` → PASS
- [x] **Step 5: Generalization-audit** — check the Stripe profile posture for the same
  empty-default trap (R-2 pattern) — record findings, fix only if in scope.
- [x] **Step 6: Commit** — `feat(#368): fail at boot when the mailer profile lacks SMTP config`
- [x] **Step 7: Update execution status.**

## Phase 2 — `link-base-url` env placeholder + deploy docs

**Files:** Modify `application.properties:221`, `docs/deploy/cd-pipeline.md`

- [x] **Step 1: Test first** — extend `MailerProfileWiringTest.linkBaseUrlDefaultsToLocalDevSpa`
  binding `RecoveryProperties` against the real property source → default stays
  `http://localhost:4200`.
- [x] **Step 2–4:** flip the property line to
  `${RIVIERA_RECOVERY_LINK_BASE_URL:http://localhost:4200}`; document all six new env vars in
  `cd-pipeline.md` (deployed `RIVIERA_RECOVERY_LINK_BASE_URL` = the backend's own origin,
  same-origin per #110); scoped run PASS.
- [x] **Step 6: Commit** — `feat(#368): make the recovery link base URL an explicit env placeholder`
- [x] **Step 7: Update execution status.**

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
| 2026-07-27 | Phase 1 (fail-at-boot posture, R-2) | Other profile-gated externals that boot with missing/empty credentials and fail on first use | grep `api-key`/`isBlank` across `Stripe*` | `StripeConfig`/`StripeProperties`: `stripe` profile with `STRIPE_API_KEY` unset builds a client with an empty key — fails on first call, not at boot | Out of scope (payment module, own slice); follow-up issue filed at close-out |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/2/3/7:** `./gradlew test --tests "*SmtpMailerIT*" --tests "*MailerProfileWiringTest*"` → PASS. Verified locally at `44eb284`.
- [x] **AC-4:** `MailerProfileWiringTest` both directions → PASS. Verified locally at `44eb284`.
- [x] **AC-5:** full CI run green with `MockMailerProdGuardTest`/`MockMailerTest`/`EmailVerificationIT`/`PasswordResetIT` unmodified. Verified at CI run 30266110385 (all 10 checks green on `44eb284`).
- [x] **AC-6:** property line + `cd-pipeline.md` section present; binding test PASS. Verified at `f830d8e`/`44eb284`.
- [x] **AC-8:** runbook committed at `55d5347` (SPA-driven smoke path corrected against the real endpoints + CSRF posture).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-8 is a doc, verified by review).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — `spring-boot-starter-mail` only.
- [x] **Availability** N/A justified (no availability code in scope).
- [x] **Modulith** section filled; no module code touched; `ModularityTests` +
      `PackageShapeArchitectureTests` green untouched (invariant #11).
- [x] **Payment/payout** N/A.
- [x] No secret in repo/image/logs; no tokenized link logged at the transport layer (invariant #7).
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final plan-doc state cites `merged via PR #377`.
- [x] **The review gate ran in full** — `/code-review` (5-agent fan-out) plus `riviera-review-overlay`.
