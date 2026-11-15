# Secure-by-default boot posture Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a boot with no marker profile refuses to start until it has a real suppression pepper, a
real mailer, real SSO and a collecting payment gateway, and names every gap in one abort.

**Architecture:** the safety marker flips from an opt-in `prod` profile to the absence of
`demo` / `local` (ADR-0031). Each module keeps its guard beside the mock it fences, as a bean
under the marker-absent profile that reports its gap. A `shared` check runs in the bean-factory
post-processing phase, before any regular singleton (the datasource included). It collects every
guard's gap and aborts once, listing them all.

**Source of intent:** issue #394; the wave orchestrator's decision (option 2, secure by default).

**Branch:** `bugfix/394-secure-boot-posture`

## Acceptance criteria

- [x] **AC-1:** Given no profile and no env, when the jar boots, then it aborts before any other
  bean. The one message names the pepper, the mailer, SSO and the payment provider. *Seam:* the
  bean-factory phase (`BootPostureCheck`). *Pinned by:* `BootPostureCheckTest`, the four guard
  tests, and a manual `java -jar` run recorded in the PR.
- [x] **AC-2:** Given `demo` and a real pepper, the context starts on the mocks. *Pinned by:* the
  guard tests' `demo` cases and `SecureBootPostureProfilesTest`.
- [x] **AC-3:** Given `local` (or `dev`/`smtp4dev`, which group it in), the context starts with
  zero env on the committed dev pepper. *Pinned by:* `SecureBootPostureProfilesTest`, and the whole
  suite, which boots under the test-only `local` include.
- [x] **AC-4:** Given `SPRING_PROFILES_ACTIVE` unset or `stripe|mailer|smtp4dev`, when
  `./gradlew bootRun` runs, then `local` is included. *Pinned by:* `build.gradle`, plus a manual
  bootRun.
- [x] **AC-5:** Given no marker, when the stub payment gateway would be live (no
  `collecting-gateway`), then `StubPaymentGatewayProdGuard` reports it.
  *Pinned by:* `StubPaymentGatewayProdGuardTest`; `ProviderProfileConfinementArchitectureTests`
  stays green.
- [x] **AC-6:** The `prod` profile is retired: no code, properties file, test or deploy doc names
  it as a marker. *Pinned by:* grep in the PR.

## Non-goals

- Real SSO credentials (S5 #116) or mailer activation (#370). The demo keeps the mock IdP and the
  mail outbox on purpose.
- Any change to what the mocks do.

## Risks

- **R-1: the Render demo aborts on the new image.** Mitigation: the PR's **Deploy precondition**
  says to set `SPRING_PROFILES_ACTIVE=demo,stripe` and a real `RIVIERA_SUPPRESSION_PEPPER` before
  the merge. Both are no-ops on today's code.
- **R-2: tests stop booting** (every context would fail the guards). Mitigation:
  `src/test/resources/config/application.properties` includes `local`, so it reaches every Boot
  test context. A runner that needs the bare shipped files sets
  `spring.config.location=classpath:/application.properties`.
- **R-3: nested profile groups (`dev → local → demo`)** are not documented by Boot. Mitigation:
  pinned by `SecureBootPostureProfilesTest`.
- **R-4: early instantiation.** Guard beans are created in the bean-factory post-processing
  phase, so no bean post-processor applies to them. They take only `Environment`, and none has a
  lifecycle callback.

## Modulith

- `shared` gains `BootPostureGuard` (an interface: `Optional<String> gap()`) and the package-private
  `BootPostureCheck` (a `BeanFactoryPostProcessor`). Admitted on ownership, like `ShutdownBudget`:
  each module fences its own mock, and only the platform owns the verdict that a boot is
  deployable, plus its one report. The root cannot hold it (it would name module rules, and
  modules would need it).
- Guards stay package-private in their module's `adapter.out`: `auth` (`MockSsoProdGuard`),
  `notification` (`MockMailerProdGuard`, `SuppressionPepperProdGuard`), `payment`
  (`StubPaymentGatewayProdGuard`, new).

## Phases

- **Phase 1 — shared check + guards:** `BootPostureCheckTest`, then the guard tests rewritten to no-marker / `demo` /
  provider cases; the new `StubPaymentGatewayProdGuardTest`.
- **Phase 2 — profiles:** `demo`, `local` groups, `application-local.properties`, the pepper default moved, `prod`
  retired; test `config/application.properties`; `bootRun` include; `SecureBootPostureProfilesTest`,
  `PublicOriginSingleVariableTest`, the pepper lockstep test.
- **Phase 3 — docs:** ADR-0031, cd-pipeline, production-hardening, mailer runbook, RESPONSIBILITIES
  (*Platform edge*, `shared`), CLAUDE.md.
- **Phase 4 — verify:** full suite, structural net, the manual `java -jar` and bootRun runs.

## Execution status

- [x] Phase 1 — shared check + guards (746a1560)
- [x] Phase 2 — profiles, test include, bootRun (746a1560)
- [x] Phase 3 — ADR-0031 + docs (746a1560)
- [x] Phase 4 — `./gradlew build` green with no env (4291 tests, 0 skipped); bare `java -jar` aborts
  naming all four gaps before the datasource; `demo` + pepper starts; zero-env `bootRun` runs
  `local, demo`; `SPRING_PROFILES_ACTIVE=stripe ./gradlew bootRun` runs `local, demo, stripe,
  collecting-gateway`.
- [ ] PR ready → review gate (high) → Sonar → plan removed
