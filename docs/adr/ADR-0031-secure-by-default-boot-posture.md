# ADR-0031: Secure-by-default boot posture: a boot without a marker profile is a deployment, and refuses to start until it is a real one

- **Status:** Accepted. Decided 2026-11-15 by the wave orchestrator, on the owner's request to
  decide from best-practice research (issue #394).
- **Date:** 2026-11-15
- **Relates to:**
  - ADR-0011 (the mock mailer's fence) and ADR-0012 (the pepper), both amended with a dated pointer;
  - ADR-0028 (the root holds no module rule, so the check sits in `shared`);
  - ADR-0029 (payment providers join `collecting-gateway`);
  - `RESPONSIBILITIES.md` § `shared` and § *Platform edge*;
  - `docs/deploy/production-hardening.md` § *Boot posture*.

## Context

Three guards kept the mocks and the committed dev pepper out of production:
`MockSsoProdGuard` (`prod & !sso`), `MockMailerProdGuard` (`prod & !mailer`) and
`SuppressionPepperProdGuard` (`prod`). All three fired only when someone remembered to activate a
`prod` profile. The owner's posture is the opposite: real production runs Spring Boot's `default`
profile, the one Boot enables when none is set. That boot tripped no guard. The mock IdP and the
log-only mailer would have been live, and the suppression HMAC would have run on a public
repo-committed pepper, the dictionary-reversal threat ADR-0012 exists to prevent. Nothing fenced
the stub payment gateway at all: an unmarked boot confirmed every booking without collecting.

The options (#394):

1. Keep the opt-in `prod` and rely on a runbook line at cutover.
2. Invert: mocks and dev defaults need an explicit opt-in profile, and a bare boot demands real
   configuration.
3. One required environment variable (`RIVIERA_ENV=dev|prod`) that the guards key on.

## Decision

1. **Option 2, secure by default.** Sources:
   - OWASP Proactive Controls C5 (secure by default);
   - ASVS 5.0 13.2.3 (no default credentials) and 13.3.1 (no secrets in source);
   - OWASP "fail securely";
   - CISA Secure by Design / Secure by Default.

   Option 1 fails open on a forgotten line. Option 3 adds a named-environment switch, which
   Twelve-Factor's config factor argues against, beside a mechanism Spring already has.
2. **Profiles are the markers, and the guards key on their absence.**

   | Marker | Meaning | Defined |
   |---|---|---|
   | `demo` | mock externals allowed | an empty profile |
   | `local` | `demo` plus the committed dev secrets | `spring.profiles.group.local=demo`; `application-local.properties` |

   `dev` and `smtp4dev` group `local` in. `./gradlew bootRun` and the test suite include it (a
   system property; `src/test/resources/config/application.properties`), so a zero-env local
   run still starts.

   | Guard | Module | Present under |
   |---|---|---|
   | `MockSsoProdGuard` | `auth` | `!demo & !sso` |
   | `MockMailerProdGuard` | `notification` | `!demo & !mailer` |
   | `StubPaymentGatewayProdGuard` | `payment` | `!demo & !collecting-gateway` |
   | `SuppressionPepperProdGuard` | `notification` | `!local`: a blank pepper or the committed dev pepper is a gap |

   The dev pepper leaves `application.properties` for `application-local.properties`.
3. **One abort names every gap, before any other bean.** Each guard is a `shared.BootPostureGuard`
   bean beside the mock it fences, answering its gap. `shared.BootPostureCheck`, a bean-factory
   post-processor, collects them all and throws once, before any regular singleton. So a bare
   `java -jar` names the pepper, the mailer, SSO and the payment provider together, rather than
   whichever bean failed first (the datasource, with no env). The check is admitted to `shared` on
   ownership, like `ShutdownBudget`. Each module owns its fence; only the platform owns the verdict
   that a boot is deployable. A guard is built before any bean post-processor runs, so it has a
   no-argument constructor and reads configuration from the `Environment` the check hands it.
4. **The `prod` profile is retired.** A production deployment runs its real profiles (`mailer`,
   `sso`, its payment provider) and nothing else. The Render demo runs `demo,stripe` with a real
   pepper; it keeps the mock IdP and the mail outbox on purpose.

## Consequences

- A forgotten profile fails closed: the boot names what is missing instead of serving mocks.
- Every local entry point (bootRun, `dev`, `smtp4dev`, the suite) includes `local`. A test that
  must see the bare shipped files sets `spring.config.location=classpath:/application.properties`
  (`SecureBootPostureTest`, `PublicOriginSingleVariableTest`).
- A new mock or dev default ships its guard as a `BootPostureGuard` under a marker-absent profile,
  and joins the table in `production-hardening.md`.
- Deploying `local`, `dev` or `smtp4dev` is an explicit opt-in to public secrets. The posture
  fences omission, not a deliberate wrong profile.
- Cutover precondition for the Render demo: `SPRING_PROFILES_ACTIVE=demo,stripe` and a real
  `RIVIERA_SUPPRESSION_PEPPER`, set before the first image carrying this decision.

## Alternatives considered

- **Throwing guard constructors, as before.** Rejected: the first bean to fail aborts the boot,
  so an operator fixes one gap per restart. With no env the datasource fails before any guard,
  and no guard is named at all.
- **One check at the root naming every module's rule.** Rejected: the root reaches no module
  (ADR-0028), and the rule (which profile, which property) belongs beside the mock it fences.
