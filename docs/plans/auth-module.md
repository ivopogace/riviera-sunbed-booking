# `auth` module (ADR-0028 Decision 2) Implementation Plan

> A pure move: no behaviour change. Invariant numbers: `CLAUDE.md`.

**Goal:** the login, session, SSO, credential and recovery machinery leaves the root package for a
closed `ai.riviera.platform.auth` module that `verify()` checks, with every existing auth test green
and unchanged in what it asserts.

**Architecture:** `auth` uses the full template. `api` publishes `SessionRevocation` (the revoker)
and `SessionCredentials` (the per-request stamp check `SessionCredentialFilter` calls; it takes the
`Authentication`, so `SessionPrincipal` stays internal). `vocabulary` publishes
`BlockedPasswordException` and `AuthRoles` (the role names and the operator may-authenticate set),
which replace the comment-kept lockstep between `SecurityConfig` and the `UserDetailsService`s.
The authentication beans leave `SecurityConfig` for `auth.adapter.in.AuthConfig`.

**Source of intent:** issue #1325; ADR-0028 Decision 2.

**Branch:** `feature/auth-module-1325`

## Acceptance criteria

- [ ] **AC-1:** Given the moved tree, when `ApplicationModules.verify()` runs, then `auth` is a
  closed module whose dependencies are exactly its `allowedDependencies`. *Seam:* the module graph ·
  *Pinned by:* the structural net (`ModularityTests`, `PackageShape`, `PublishedSurfacePlacement`,
  `DomainPurity`, `JdbcOnly`, `RetiredSetExclusion`).
- [ ] **AC-2:** Given the root after the move, when `CompositionRootDisciplineTests` runs, then the
  root reaches `auth` only through `api` + `vocabulary`. *Seam:* the root grant map · *Pinned by:*
  `CompositionRootDisciplineTests.rootTouchesOnlyGrantedModuleSurfaces`.
- [ ] **AC-3:** Login stays out of the domain modules. *Pinned by:* `CustomerAuthPlacementTests`,
  `OperatorAuthPlacementTests` (unchanged).
- [ ] **AC-4:** The only session writer is `auth`'s `SessionAuthentication`. *Pinned by:*
  `SessionWriterArchitectureTests` (names the moved writer).
- [ ] **AC-5:** Given a session whose credential stamp is stale, when the next request arrives, then
  `SessionCredentialFilter` (root) asks `SessionCredentials` and the request proceeds anonymous.
  *Seam:* `auth.api.SessionCredentials` · *Pinned by:* `SessionCredentialStampIT`, `AuthSessionIT`.
- [ ] **AC-6:** The role gates are unchanged. *Pinned by:* `EndpointRoleGateCoverageTest`,
  `AdminSurfaceRoleGateTest`, `MeSurfaceRoleGateTest`.
- [ ] **AC-7:** Login, per-operator login and set-password behave as before. *Pinned by:*
  `AuthSessionIT`, `PerOperatorLoginIT`, `SetPasswordIT`.

## Non-goals

- Moving `SecurityConfig`, the filters, `ApiErrorHandler` (`web`, #1326), the remodel composition
  (#1327) or `AdminErasureController` (#1329).
- Merging `booking.adapter.in.CustomerPrincipal`/`venue.adapter.in.OperatorPrincipal` into
  `AuthRoles`: `booking` → `auth` closes `auth` → `notification` → `booking`.

## Risks

- **R-1:** Bean wiring leaving `SecurityConfig` (two `AuthenticationManager`s, the encoder, the
  operator `UserDetailsService`) changes what `AuthenticationConfiguration` picks up → moved
  verbatim into one config class; `AuthSessionIT`, `PerOperatorLoginIT`, `CustomerRoleSeparationIT`.
- **R-2:** The filter's stamp check moving behind a port changes its result → the check moves
  verbatim (non-`SessionPrincipal` passes); `SessionCredentialStampIT`, `SessionCredentialRaceIT`.
- **R-3:** `@ApplicationModuleTest`s lose root beans they relied on, or need a new stub for
  `SessionCredentials` (`riviera-local-debug` § *Blast radius*) → `PayoutModuleTest` adjusted,
  `WebSliceStubs` imports `AuthConfig`.
- **R-4:** Sibling slices (#1327, #1329) edit the root grant map, `RESPONSIBILITIES.md`, CLAUDE.md
  and `riviera-modulith` → keep edits local; whoever merges second resolves.

## Modulith

- **New module** `auth` (closed, non-context adapter layer, ADR-0028 Decision 8).
  `allowedDependencies`: `customer::api`, `customer::vocabulary`, `operator::api`,
  `operator::vocabulary`, `notification::api`, `shared`.
- **`auth::api.SessionRevocation`** — owner `auth` (`PrincipalSessionRevoker`); consumers: `auth`'s
  own controllers today, `web` none. Published per the issue.
- **`auth::api.SessionCredentials`** — owner `auth`; consumer: root `SessionCredentialFilter`.
- **`auth::vocabulary`** — `BlockedPasswordException` (consumer `ApiErrorHandler`), `AuthRoles`
  (consumer `SecurityConfig`).
- **Root grant row** `auth → {api, vocabulary}`; `notification::api`, no longer reached, is dropped
  (the fixture's granted control now stands in for `auth::api`).

## Phases

- **Phase 0 — move:** package move + published surfaces + `AuthConfig`; root filter calls
  `SessionCredentials`; tests follow their subjects · structural net, the ACs' tests.
- **Phase 1 — substrate:** CLAUDE.md, `RESPONSIBILITIES.md`, CONTEXT.md, RV-BE-11,
  `riviera-modulith`, `ModularityTests` Javadoc, `riviera-docs-freshness` over the range.

## Execution status

**Stage pointer:** PR — draft open, CI

**Next action:** check CI on the draft; merge `origin/main` (siblings #1327/#1329) before ready.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — move | ✅ | this commit |
| 1 — substrate | ✅ | this commit |

Docs-freshness over the slice's range: CLAUDE.md, CONTEXT.md, `RESPONSIBILITIES.md` (§`customer`,
§`operator`, §`notification`, new §`auth`, § *Platform edge*), RV-BE-11/RV-BE-18,
`riviera-modulith`, `docs/architecture/domain-model.md` §1.1, `auth-signin-register.md`,
`operator-credential-provisioning.md` fixed; `ModularityTests` Javadoc already defers to CLAUDE.md's
lists, so it stays true unchanged.

Legend: blank = not started, ⏳ = in progress, ✅ = done.
