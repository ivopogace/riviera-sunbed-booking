# Per-operator credentials — replace the shared `OPERATOR` password (invariant #13) — Implementation Plan

**Goal:** Retire the single shared `OPERATOR` httpBasic password (one in-memory user whose
password is an env var) and replace it with **DB-backed per-operator credentials**: each operator
row carries its own hashed credential, and login is verified by a **framework-native Spring
Security `UserDetailsService`** at the platform edge. The authenticated principal already resolves
to an `OperatorId` (via `operator.api.OperatorDirectory`) that the invariant-#13 ownership checks
consume — this slice makes that principal a *real per-operator identity* instead of one shared login.

**Scope decisions (maintainer, grill 2026-07-01):**
1. **Keep the owns-all bootstrap operator as a DB-credentialed platform-admin account.** The shared
   *password mechanism* is removed; the seeded `operator` row (owns_all, from V16) becomes one
   normal DB account with its own provisioned credential. **Fully retiring owns-all + adding
   creator-owns-on-create is a documented follow-up**, not this slice.
2. **Provisioning/rotation = boot-provision + programmatic port, no new HTTP surface.** An idempotent
   env-driven boot step provisions/rotates the bootstrap operator's credential from a secret; a
   programmatic `operator.api.OperatorProvisioning` port creates/rotates *additional* operators
   (unit/IT-tested, documented in the runbook). **No admin HTTP endpoint, no new ADMIN role, no JWT,
   no custom token filter** — all Spring Security stays at the edge (RV-BE-11 boundary).

**Architecture:** Authentication is a **platform/edge** concern (Spring Security at the root package,
`ai.riviera.platform.SecurityConfig`); the `operator` module owns **account identity incl. the
stored credential** and the ownership mapping — **not** the password-checking machinery
(`RESPONSIBILITIES.md`, RV-BE-11). The module stores and returns an **opaque credential hash**; the
edge does all encoding/verifying. This keeps `operator` free of every Spring Security type.

**Persistence:** JDBC only (invariant #1). New Flyway migration **V17** adds
`operator.password_hash TEXT` (nullable — a null hash means "no login yet"). `JdbcClient` + explicit
SQL, no JPA.

**Source of intent:** GitHub issue **#74** (epic #72, item 02/10); depends on **#73** (the `operator`
module, V16); `RESPONSIBILITIES.md` (`operator` Job/Not-My-Job + the auth-is-edge note); CLAUDE.md
invariants #13, #11, #1, #7 (credentials-as-secrets).

**Skills consulted:** `riviera-sdd` (loop/gates + the two scope decisions escalated at the
Issue-intake grill gate), `riviera-modulith` (edge-vs-module placement: `UserDetailsService`/boot
provisioner live at the root, `operator` publishes credential read + provisioning ports in `api/`;
no `allowedDependencies` change — the root is not a module; api-vs-spi → inbound `api` ports called
by the edge), `riviera-java-conventions` (records for `OperatorCredential`; package-private
`@Service`/adapter + constructor injection; pre-encoded opaque hash keeps Spring Security out of the
module; `@Transactional` on the provisioning writes; no JPA/Lombok; secrets never logged, invariant
#7), `postgres` (V17: additive nullable `TEXT` column, no constraint churn, no index needed —
`username` is already `UNIQUE`), `riviera-plan-doc` (this doc + §4a table), `riviera-review-overlay`
(RV-BE-11 auth-placement boundary, RV-BE-9 the #13 principal→id chain, RV-PROC-1 — walked at the
review gate).

**Branch:** `claude/riviera-sdd-74-6wzkrh` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (per-operator credential store):** Given `OperatorProvisioning.provision(username,
  passwordHash)`, a new `ACTIVE` operator row is created carrying that hash; `OperatorAccounts.findByUsername`
  then returns an `OperatorCredential(username, passwordHash, active=true)`; an unknown username returns
  empty; a `SUSPENDED` account returns `active=false`. *Pinned by:* `OperatorAccountProvisioningIT`.
- [ ] **AC-2 (rotation):** Given an existing operator, `OperatorProvisioning.setPassword(username,
  newHash)` updates its stored hash and returns `true`; for an unknown username it returns `false`
  (no row created). *Pinned by:* `OperatorAccountProvisioningIT`.
- [ ] **AC-3 (per-operator login → own principal):** Given operators A and B provisioned with
  distinct passwords, when a request authenticates with **A's** credentials, the authenticated
  principal is **A** (resolves to A's `OperatorId`) — proven end-to-end: A reaches A's venue data
  (200) but B's venue data is **403**, and B's credentials symmetrically reach only B's. A **wrong
  password** for A is **401**. *Pinned by:* `PerOperatorLoginIT`.
- [ ] **AC-4 (no shared password):** There is no universal login: the bootstrap operator's password
  does **not** authenticate operator A's username (401), and no in-memory shared `operator` user
  exists any more — credentials come solely from the DB. *Pinned by:* `PerOperatorLoginIT`.
- [ ] **AC-5 (boot provisioning):** Given `riviera.operator.password` is set, on startup the
  bootstrap operator's credential is (re)provisioned so it can log in; setting it to a new value and
  restarting rotates the password. When blank, the write API is locked (no login), logged at WARN
  without the value. *Pinned by:* the existing venue-scoped ITs (they set the property and log in as
  `operator`) + `PerOperatorLoginIT`.
- [ ] **AC-6 (framework-native, edge-only):** No JWT, no custom authentication filter; login is
  `httpBasic` + a `UserDetailsService` + `PasswordEncoder` (delegating). The `operator` module
  imports **no** `org.springframework.security.*` type. *Pinned by:* `JdbcOnlyArchitectureTests`
  stays green + a new ArchUnit guard (`operator` has no Spring Security import) + review (RV-BE-11).
- [ ] **AC-7 (structure + no regression):** `ModularityTests` and `JdbcOnlyArchitectureTests` stay
  green; every pre-existing venue-scoped IT (`VenueAdminControllerIT`, `StaffBookingControllerIT`,
  `StaffAvailabilityControllerIT`, `AdminPayoutSecurityIT`, `WeatherRefundSecurityIT`,
  `CrossVenueDenialIT`, `OperatorOwnershipIT`) stays green. *Pinned by:* those tests.

## Non-goals

- **Fully retiring the owns-all bootstrap operator** (every operator strictly per-venue) and
  **creator-owns-on-create** for `POST /api/venues` — deferred follow-up (maintainer decision).
  owns_all stays as a documented platform-admin posture.
- **Admin HTTP endpoints for operator CRUD / a platform `ADMIN` role** — provisioning is boot + the
  programmatic port only (maintainer decision). A future admin UI consumes the same port.
- **JWT / OAuth2 / session cookies / custom token filters** — explicitly out (issue constraint);
  httpBasic + `UserDetailsService` is the framework-native mechanism.
- **Password-policy / lockout / MFA / self-service password reset** — not in v1.
- **Migrating existing modules to ADR-0007 shape** — `operator` is already there; others unchanged.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Login machinery (`UserDetailsService`, `PasswordEncoder`) grows **inside** the `operator` module → RV-BE-11 placement violation ("login subsystem in a domain module") | med | high | All Spring Security stays at the edge (root package). The module stores/returns an **opaque hash** and accepts a **pre-encoded** hash; it imports no `org.springframework.security.*`. New ArchUnit guard + RV-BE-11 at review. | agent | open |
| R-2 | Suspended/absent account can still authenticate → a disabled operator keeps access | med | high | `OperatorAccounts.findByUsername` returns the `active` flag; the edge builds `User.disabled(!active)`, so `DaoAuthenticationProvider`'s pre-auth check rejects a suspended account **before** the password check (no timing/existence oracle either). A null hash → `UsernameNotFoundException` (401). Pinned by `OperatorAccountProvisioningIT` + `PerOperatorLoginIT`. | agent | open |
| R-3 | Removing the in-memory user breaks the `@WebMvcTest` slices (they `@Import(SecurityConfig)`, which now needs `OperatorAccounts`) | high | low | Add an `OperatorAccounts` stub to `WebSliceStubs` (mirrors the existing `OperatorDirectory` stub). Mechanical. | agent | open |
| R-4 | Existing venue-scoped ITs (6) authenticate as `operator`/`test-operator-pw` via the old in-memory user | high | med | The boot provisioner keys off the **same** `riviera.operator.password` property they already set → it provisions the `operator` row with that password, so those ITs log in DB-backed with **no change**. Verified by running them. | agent | open |
| R-5 | Committing a real password/hash | low | high | Nothing is seeded with a credential; the hash is provisioned at runtime from an env secret. V17 adds a **nullable** column, no seed hash. `RIVIERA_OPERATOR_PASSWORD` stays env-only, never logged (invariant #7). | agent | open |
| R-6 | Re-hashing the bootstrap password on every boot causes churn / a write each startup | low | low | Accepted: one idempotent `UPDATE` at startup; bcrypt salt differs but the same password still verifies. Documented; the property being blank is a no-op. | agent | open |
| R-7 | Boot provisioner runs in a `@WebMvcTest` slice (no DB) and fails | low | med | It is a root `@Component` `ApplicationRunner`; `@WebMvcTest` does not component-scan it, so it only runs in full `@SpringBootTest`. Confirmed by the slice tests staying green. | agent | open |

## Open questions / Assumptions

- **Assumption:** The bootstrap login username stays `operator` (`RivieraOperatorProperties` default),
  matching the V16 seed row; the boot provisioner targets that username. Overriding the username
  without a matching seeded row leaves the write API locked — the same documented coupling as #73,
  now the boot provisioner logs a WARN if the target row is missing. — *Owner:* agent · *Resolves by:*
  the owns-all-retirement follow-up.

## Availability & concurrency (invariant #2)

`N/A — no change to any availability(set_id, booking_date) write path.` This slice changes only how
the authenticated principal is *established* (DB-backed per-operator login vs one shared in-memory
user). The claim transaction, pool/cutoff rules, and every availability writer are untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | `Operator` | Owns operator **account identity incl. the stored credential** + the ownership mapping (`RESPONSIBILITIES.md` `operator` Job). Adds credential-read + provisioning ports; still `allowedDependencies = {}`. |
| — | *(edge/root)* | existing | — | `ai.riviera.platform` root (**not a module**): `SecurityConfig`, the new `UserDetailsService`, the boot provisioner. Authentication is a platform/edge concern (RV-BE-11), so these live here, not in `operator`. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `OperatorAccounts#findByUsername(String)` → `Optional<OperatorCredential>` | `OperatorCredential(username, passwordHash, active)` | the edge `OperatorUserDetailsService` |
| NI-2 | `operator.api` | `OperatorProvisioning#provision(String,String)` / `setPassword(String,String)` | `OperatorId` | the edge boot provisioner + provisioning IT (future admin UI) |
| — | `operator.api` | `OperatorDirectory#operatorFor(String)` (existing) | `OperatorId` | the 5 venue-scoped controllers (unchanged) |

**`allowedDependencies` changes:** **none.** The new ports are consumed by the **edge/root package**,
which is not a Modulith module, so no module gains a dependency. `operator` stays `allowedDependencies
= {}` (it imports no other module and no Spring Security). `ModularityTests` unaffected.

**api vs spi (RV-BE-3b):** both new ports are synchronous **inbound** queries/commands the edge
**calls** → `api`, not `spi`. No cross-module driven inversion is introduced.

**Domain events:** `N/A — no new events.` Credential read/provisioning are synchronous.

### §4a Module-ownership table (RV-BE-11)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store an operator's **credential hash**; answer "what is this account's stored credential + active flag?" | `operator` | `operator` Job: "Own operator accounts … and the account *identity*." The stored credential is account identity data; the module treats it as an **opaque blob** (never encodes/verifies it). |
| Provision/rotate an operator credential (programmatic) | `operator` | Same Job — creating an account and setting its stored credential is account lifecycle. It accepts a **pre-encoded** hash, so it needs no crypto/Spring-Security type. |
| **Encoding** a raw password, **verifying** a login, resolving httpBasic → principal | the **edge** (root: `SecurityConfig`, `OperatorUserDetailsService`, boot provisioner) | `operator` **Not-My-Job**: "the password-checking machinery" / login is a platform/edge Spring Security concern (`RESPONSIBILITIES.md`, issue #74, RV-BE-11). No Spring Security in the domain module. |
| Resolving the authenticated principal → `OperatorId` (existing) | edge `CurrentOperator` + `operator.api.OperatorDirectory` | Unchanged from #73 — edge reads the security context; `operator` maps username→id. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money moves and no ledger/refund logic changes.`

## Angular — frontend surfaces touched

`N/A — backend-only.` No FE change: httpBasic operator login is unchanged on the wire; only the
credential *store* moves from one in-memory user to per-operator DB rows. A future operator-console
FE (login + "which venues do I manage") is out of scope.

## FE↔BE contract

`N/A — no request/response shape change.` Same httpBasic scheme, same 401 on bad credentials, same
403 on a non-owned venue. The only behavioural change is that credentials are now per-operator.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V17 migration + `operator` credential-read + provisioning ports + `OperatorAccountProvisioningIT` | ✅ | (this commit) |
| 1 — Edge: DB-backed `UserDetailsService` replaces the in-memory user; boot provisioner; `SecurityConfig`/properties docs; `WebSliceStubs` | ✅ | (this commit) |
| 2 — `PerOperatorLoginIT` (per-operator login/principal, no shared password) + ArchUnit no-Spring-Security-in-operator guard | ✅ | (this commit) |
| 3 — Full regression + docs (runbook provisioning note) | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**New — migration:**
- `platform/src/main/resources/db/migration/V17__operator_credentials.sql` — `ALTER TABLE operator
  ADD COLUMN password_hash TEXT`.

**New — `operator.api` (published):**
- `operator/api/OperatorCredential.java` — `record OperatorCredential(String username, String passwordHash, boolean active)`
- `operator/api/OperatorAccounts.java` — `Optional<OperatorCredential> findByUsername(String)`
- `operator/api/OperatorProvisioning.java` — `OperatorId provision(String username, String passwordHash)`, `boolean setPassword(String username, String passwordHash)`

**New — `operator.application` / `adapter/out`:**
- `operator/application/OperatorAccountService.java` — package-private `@Service implements OperatorAccounts, OperatorProvisioning` (`@Transactional` on writes)
- `operator/application/Operators.java` — **extend** the driven port: `credentialByUsername`, `insert`, `updatePassword`
- `operator/adapter/out/JdbcOperators.java` — **implement** the new port methods (JdbcClient)

**New — root edge:**
- `ai.riviera.platform.OperatorUserDetailsService.java` — package-private `UserDetailsService` over `OperatorAccounts`
- `ai.riviera.platform.OperatorCredentialInitializer.java` — package-private `@Component implements ApplicationRunner`; provisions the bootstrap operator's credential from `riviera.operator.password`

**Modified — edge:**
- `ai.riviera.platform.SecurityConfig.java` — drop `operatorDetailsService` (in-memory); register `OperatorUserDetailsService` bean; keep `passwordEncoder()`; keep the role gate + httpBasic
- `ai.riviera.platform.RivieraOperatorProperties.java` — javadoc: `password` is now the **bootstrap-operator provisioning secret**, not a shared login
- `platform/src/main/resources/application.properties` — rewrite the operator-credential comment block

**Modified — tests:**
- `WebSliceStubs.java` — add an `OperatorAccounts` stub bean
- **New** `operator/OperatorAccountProvisioningIT.java` — ports (AC-1/AC-2)
- **New** `PerOperatorLoginIT.java` (root) — per-operator login/principal + no-shared-password (AC-3/AC-4/AC-5)
- **New** ArchUnit guard (in/next to `JdbcOnlyArchitectureTests` or a small `OperatorAuthPlacementTests`) — `operator.*` imports no `org.springframework.security.*` (AC-6)

**Docs:**
- `riviera-migration-runbook.md` and/or `RESPONSIBILITIES.md` note — how a new operator is provisioned (the port) + how the bootstrap credential rotates (the env secret).

---

## Phases (TDD per behavior)

**Phase 0 — migration + module ports.** Red: `OperatorAccountProvisioningIT` (Testcontainers) —
provision an operator with a hash, assert `findByUsername` returns it (active), `setPassword`
rotates, unknown → empty, suspended → `active=false`, `setPassword` on unknown → false. Implement
V17, the three `api` types, the extended `Operators` port + `JdbcOperators`, `OperatorAccountService`.
Green + `ModularityTests` green.

**Phase 1 — edge login + boot provisioning.** Change `SecurityConfig` to the DB-backed
`UserDetailsService`; add the boot provisioner; add the `WebSliceStubs` bean. Keep the web-slice
tests (`RateLimitFilterTest`, `WebCorsConfigTest`, `RateLimit*`) green. Run the 6 existing
venue-scoped ITs — they must stay green with **no change** (boot provisioner provisions `operator`
from `riviera.operator.password`).

**Phase 2 — per-operator login proof + ArchUnit guard.** Red: `PerOperatorLoginIT` — provision A/B
with distinct passwords, assert A's login reaches only A's venue (200 own / 403 other), wrong
password 401, bootstrap password does not authenticate A (AC-3/AC-4). Add the ArchUnit no-Spring-
Security-in-`operator` guard (AC-6). Green.

**Phase 3 — full regression + docs.** `./gradlew build` green; update the runbook/RESPONSIBILITIES
provisioning note; execution-status table to reality.

## Review-gate note (riviera-review-overlay + /code-review on the working diff)

Ran a high-effort review (3 finder angles: correctness line-scan, removed-behavior/security auditor,
cross-file + conventions) plus the overlay bank. **No Blockers.** RV-BE-11 (auth stays at the edge —
`operator` imports no Spring Security, guarded by `OperatorAuthPlacementTests`), RV-BE-9 (principal →
`OperatorId` still feeds the #13 checks — proven by `PerOperatorLoginIT`), invariant #1 (JDBC-only, no
JPA), and #7 (no secret logged/committed) all passed. Findings resolved through the loop:

- **`PayoutModuleTest` context-load failure (CONFIRMED, fixed).** Surfaced by the full build (not the
  diff finders): `SecurityConfig` now depends on `operator::api` (`OperatorAccounts`) and the root boot
  provisioner on `OperatorProvisioning`; the `payout` `@ApplicationModuleTest` bootstraps `payout` in
  isolation, so those operator ports were absent → the context failed to load. **Fix:** supply the two
  ports as `@MockitoBean`s in `PayoutModuleTest`, mirroring the existing `CurrentOperator`/`VenueOwnership`
  mocks (module test uses none of them). Re-entered at Implement (backend Java, riviera-modulith/
  java-conventions already loaded); `PayoutModuleTest` + full build green after the fix.
- **Duplicated `OPERATOR_ROLE` constant (accepted).** `SecurityConfig` (private, gate) and
  `OperatorUserDetailsService` (the principal's role) each define `"OPERATOR"`; documented as
  "kept in lockstep." Extracting a shared public constant wasn't worth widening a private edge detail.
- **Coverage top-ups (fixed pre-emptively for the Sonar gate):** added `anUnknownUsernameIsRejected`
  (covers the `UserDetailsService` not-found branch) and `OperatorCredentialInitializerTest` (unit,
  covers the blank-password + missing-row branches of the boot provisioner).

## Self-review checklist (before PR)

- [ ] No JPA/Lombok; `JdbcClient` + explicit SQL; `record` for `OperatorCredential`; package-private `@Service`/adapter; `@Transactional` on provisioning writes.
- [ ] The `operator` module imports **no** `org.springframework.security.*` type (ArchUnit guard green); it stores/returns an **opaque** hash and accepts a **pre-encoded** hash.
- [ ] All login machinery (`UserDetailsService`, `PasswordEncoder`, boot provisioner) is at the **edge** (root package); no admin HTTP endpoint, no new role, no JWT, no custom filter.
- [ ] Shared in-memory `operator` user removed; per-operator credentials are DB-backed; a suspended/absent account cannot authenticate; wrong password → 401; principal → `OperatorId` still feeds the #13 checks.
- [ ] V17 present; `password_hash` nullable `TEXT`; no committed credential/hash; `RIVIERA_OPERATOR_PASSWORD` env-only, never logged (invariant #7).
- [ ] `ModularityTests` + `JdbcOnlyArchitectureTests` + all 6 pre-existing venue-scoped ITs green; web-slice tests green (`OperatorAccounts` stub added).
- [ ] Execution-status table matches reality; Open Questions empty or deferred to the follow-up.
