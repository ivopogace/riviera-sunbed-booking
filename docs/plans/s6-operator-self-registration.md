# [S6] Operator self-registration → admin approval → creator-owns-on-create Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use `- [ ]`.

**Goal:** An operator can self-register (creating a **PENDING** account that cannot authenticate into any
operator surface); a platform **admin** lists pending registrations and approves/rejects them (role-gated,
not venue-scoped); an **ACTIVE** operator that creates a venue **owns it from creation**
(creator-owns-on-create, enforced in the application service); and the **owns-all bootstrap operator is
retired** — demoted to a venue-less-by-default platform admin, every operator strictly per-venue.

**Architecture:** The single most significant decision — **creator-owns-on-create writes the ownership
row synchronously and atomically inside the venue-create transaction via an `operator::api` command port
(`VenueOwnership.assignOwner`), not a domain event.** An event would leave a window where the venue exists
but is unowned; if the listener failed the creator would be permanently `403`'d on their own venue (a
correctness + BOLA hole). Identity/approval **state** lives in the `operator` module (JDBC, Flyway V29);
all login/approval **machinery** (Spring Security, `ROLE_ADMIN` mapping, the register/approve endpoints,
sessions) stays at the platform **edge** (RV-BE-11), so `operator` imports no Spring Security type
(`OperatorAuthPlacementTests`). The bootstrap `operator` account is **demoted, not deleted**: it keeps its
`RIVIERA_OPERATOR_PASSWORD` login, loses `owns_all_venues`, gains an ADMIN authority, and (V29 backfill)
explicitly owns every venue it previously reached implicitly — so it is a ready approver and the demo
console keeps working, with **no new prod secret**.

**Persistence:** JDBC only (invariant #1). New Flyway migration **V29** (`operator`: widen `status` CHECK
to add `PENDING`/`REJECTED`, add `contact_email`, add `is_admin`; mark the bootstrap admin; **backfill**
`operator_venue` for every currently-unowned venue → bootstrap; **drop** `owns_all_venues`). Writes:
`operator`, `operator_venue`. `JdbcClient` + explicit text-block SQL.

**Source of intent:** GitHub issue **#115** (epic **#108**, S6). Design: `docs/architecture/auth-signin-register.md`
(D-5 self-register + admin approval; D-8 non-enumerating rate-limited auth). Closes the #74 follow-up
recorded in `docs/plans/operator-per-operator-credentials.md` (non-goals) + `CLAUDE.md`'s operator note.

**Skills consulted** (`riviera-sdlc` Skill-routing gate):
- `riviera-sdlc` — issue-intake grill gate (re-validated ACs vs current code; V29 free; sibling close-outs done) + the two maintainer escalations.
- `riviera-modulith` — placement: new `operator::api` ports (`OperatorRegistration`, `OperatorApprovals`) + `VenueOwnership.assignOwner` are **inbound `api/`** (edge/venue *call* them, not `spi`); outcome/value types → `operator::vocabulary`; **creator-owns-on-create is a synchronous `api/` command, not an event** (atomicity); `operator` stays `allowedDependencies={}`, `venue` keeps `operator::api`+`::vocabulary`; admin `/api/admin/**` stays role-gated (invariant #13 exemption).
- `postgres` — V29: `CHECK (status IN (...))` widening over native enum; `contact_email TEXT` nullable; `is_admin BOOLEAN NOT NULL DEFAULT FALSE`; **backfill-before-drop** ordering; `NOT EXISTS`-guarded idempotent backfill; `operator_venue.venue_id` PK = one owner per venue.
- `riviera-java-conventions` — records for the new vocabulary (`PendingOperator`, `RegistrationOutcome`, `ApprovalOutcome`); sealed/enum typed outcomes over exceptions; package-private `@Service`/adapter, constructor injection; `@Transactional` writes; RFC-7807 `ApiProblem`/`ApiErrorHandler` for the admin endpoints; no JPA/Lombok; secrets never logged (invariant #7); log-injection guard on `contact_email` (untrusted).
- `riviera-frontend` — placement: `operator/operator-register.ts` (route `operator/register`), new `admin/` feature folder (`admin/admin-operators.ts`, route `admin`); auth **state** in `core/` (`operator-auth.ts`, `session-auth.ts`); import direction features→core/shared.
- `riviera-tailwind` — new screens authored in Tailwind v4 over `--riv-*` tokens, porcelain operator look; share surfaces via directives (`appCardGlass`), no `@apply`.
- `angular-developer` + angular-cli MCP — Signal Forms for the register form, `resource()` for the pending list, `computed` `isAdmin`; consulted at implementation for the reactive idioms (Ivo's standing ask).
- `playwright-cli` — the mocked-suite register→approve→sign-in→create-venue spec (loaded at phase 6).
- `riviera-plan-doc` (this doc) · `tdd` (build) · `riviera-review-overlay` (review gate — RV-BE-9/#13, RV-BE-11, RV-BE-3b, RV-PROC-1).

**Branch:** `feature/operator-self-registration` (exists; local session — stands in for the cloud "designated branch").

---

## Acceptance criteria (testable)

- [ ] **AC-1 (self-register → PENDING, no login):** Given no operator named `u`, when a client POSTs
  `{username:"u", password:"…", contactEmail:"…"}` to `/api/auth/operator/register`, then a **PENDING**
  operator row is created carrying the encoded hash + contact email, **no session is established**, and a
  subsequent `POST /api/auth/operator/login` with those credentials is rejected (`401`, generic).
  *Pinned by:* `OperatorRegistrationIT.registersPendingAndCannotLogInUntilApproved`.
- [ ] **AC-2 (non-enumerating + timing-safe register, D-8):** Given `u` already exists (any status), when the
  same username is registered again, then the response is **byte-identical** to the fresh-registration
  response (same status `202`, same body), **no second row** is written, and no session is established.
  *Pinned by:* `OperatorRegistrationIT.duplicateRegistrationIsIndistinguishable`.
- [ ] **AC-3 (admin approve → ACTIVE → login works):** Given a PENDING operator, when an **admin** POSTs
  `/api/admin/operators/{id}/approve`, then the account flips to **ACTIVE** and the operator can now log in
  (`200` session) with the password chosen at registration.
  *Pinned by:* `OperatorApprovalIT.approveEnablesLogin`.
- [ ] **AC-4 (admin reject → REJECTED, still no login):** Given a PENDING operator, when an admin POSTs
  `/api/admin/operators/{id}/reject`, then the account is **REJECTED** and still cannot log in; approving a
  non-PENDING id returns `409 NOT_PENDING`, an unknown id `404 NO_SUCH_OPERATOR`.
  *Pinned by:* `OperatorApprovalIT.rejectDisablesLogin` + `…approveNonPendingConflicts`.
- [ ] **AC-5 (approval surface is role-gated, not venue-scoped):** Given a plain ACTIVE operator (no ADMIN
  authority), when it calls any `/api/admin/operators/**` endpoint, then it gets **`403`**; an admin gets
  `200`. The endpoints carry no `venueId` and perform no ownership check.
  *Pinned by:* `OperatorApprovalIT.plainOperatorIsForbiddenFromAdminSurface`.
- [ ] **AC-6 (creator-owns-on-create):** Given ACTIVE operators A and B, when A `POST /api/venues`, then A
  **owns the new venue** (A reaches its venue-scoped endpoints `200`) and B is **`403 NOT_VENUE_OWNER`** on
  it — the ownership row is written in the venue application service, atomically with the insert.
  *Pinned by:* `CrossVenueDenialIT.creatorOwnsCreatedVenueAndOthersAreDenied`.
- [ ] **AC-7 (owns-all retired):** Given the retired schema, there is **no `owns_all_venues`**; the bootstrap
  admin owns only its **explicitly-mapped** (backfilled) venues, not an arbitrary newly-created one.
  *Pinned by:* `OperatorOwnershipIT.bootstrapOwnsOnlyBackfilledVenuesNotAll` + `V29` present.
- [ ] **AC-8 (bootstrap demoted to admin, login preserved):** Given `riviera.operator.password` set, on boot
  the bootstrap `operator` is (re)provisioned, is **ADMIN** (reaches `/api/admin/operators/**` = `200`),
  **owns Miramar** (venue 1) via the backfill, and can still act on it (`200`); no account owns all venues.
  *Pinned by:* `PerOperatorLoginIT.bootstrapIsAdminAndOwnsBackfilledVenueOnly`.
- [ ] **AC-9 (structure holds):** `ModularityTests`, `OperatorAuthPlacementTests`, `JdbcOnlyArchitectureTests`,
  `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` all green; `operator` imports
  no `org.springframework.security.*`. *Pinned by:* those tests.
- [ ] **AC-10 (FE e2e, mocked):** register → pending message → admin approves → operator signs in → creates a
  venue, driven end-to-end against mocked APIs with no serious axe violations.
  *Pinned by:* `frontend/e2e/operator-registration.e2e.ts`.

## Non-goals

- **Rich operator/business profile** (address, docs, KYC) — v1 stores `username` + hash + `contact_email` only;
  richer onboarding is a follow-up.
- **Email verification / mailer for operators** — admin approval is the gate; no `Mailer` involvement (unlike
  customer S8). `contact_email` is informational for the admin, not verified.
- **Operator password reset / SSO / MFA / suspend-via-UI** — not in this slice (`SUSPENDED` stays a DB-only state).
- **Self-service admin management** (creating more admins via UI, revoking admin) — the single demoted-bootstrap
  admin is provisioned by env; more admins are a follow-up.
- **Changing the existing `/api/admin/payout-batches` gating** (stays `hasRole(OPERATOR)`) — out of scope; only
  the new `/api/admin/operators/**` surface uses `ROLE_ADMIN`.
- **Route guards as a new FE pattern** — admin/register pages self-gate in-component (existing operator-console
  precedent); the backend `403` is the real gate.
- **Guest-booking back-linking** — permanent non-goal (D-6). No change to guest checkout / booking-code flow.

## Behavior-parity ledger (retirement / replacement slices only)

Retires the **owns-all bootstrap operator mechanism** (`owns_all_venues` column + its `ownsVenue`
short-circuit). It is infrastructure, not a user surface, but its behavior is security-load-bearing:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Bootstrap `operator` reaches **every** venue's scoped endpoints (owns_all short-circuit in `JdbcOperators.ownsVenue`) | **changed** | Now reaches only venues it **explicitly owns** via `operator_venue` (V29 backfills all currently-unowned venues to it, so no *existing* venue loses its manager); it does **not** implicitly own venues created after V29. |
| Bootstrap `operator` logs in via `RIVIERA_OPERATOR_PASSWORD` (boot provisioner) | **preserved** | Same env var, same `OperatorCredentialInitializer` boot re-stamp; the account is now ADMIN + explicit Miramar owner. |
| Bootstrap `operator` is a plain `OPERATOR` role | **changed** | Gains `ROLE_ADMIN` (via `is_admin`) so it can approve; **keeps** `ROLE_OPERATOR` so it retains console access to its owned venues. |
| `POST /api/venues` writes **no** ownership row (role-gated only) | **changed** | Now writes `operator_venue(newVenueId, creator)` in the same transaction (creator-owns-on-create). Create is still role-gated (any ACTIVE operator may create); it is not *ownership*-checked (there is no prior owner). |
| `CrossVenueDenialIT.venueCreationIsNotOwnershipChecked` (create → `201`, any operator) | **preserved (+extended)** | Create still returns `201` for any ACTIVE operator; a new test `creatorOwnsCreatedVenueAndOthersAreDenied` asserts the creator now owns it and others are denied (AC-6). |
| Bootstrap editing an **unknown** venue → `404 NO_SUCH_VENUE` (e.g. `addSetToUnknownVenueIs404`) | **changed → 403** | Owns-all was what let the bootstrap pass the ownership check on a venue it didn't own and reach the existence check. With it retired, a venue-scoped edit asserts ownership **first** (invariant #13), so an unowned/unknown venue is **`403 NOT_VENUE_OWNER`** — the *uniform, more-secure* contract every real per-venue operator already got (no existence leak to non-owners). Tests renamed `…UnownedVenueIs403` / assert `NOT_VENUE_OWNER`. The `NO_SUCH_VENUE` 404 mapping stays (defensive, for a delete-race) but is now unreachable for a never-existed venue. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Creator-owns-on-create not atomic → venue created but unowned → creator `403`'d on their own venue (BOLA hole) | med | high | `VenueAdminService.onboard` writes the venue **and** `ownership.assignOwner` inside one `@Transactional`; a failed ownership write rolls back the create. Pinned by `CrossVenueDenialIT` (AC-6). | agent | open |
| R-2 | A PENDING/REJECTED operator authenticates into an operator surface | med | high | Only `status='ACTIVE'` resolves (`idByActiveUsername`) and only `active` (=ACTIVE) is non-`disabled` at the edge (`OperatorUserDetailsService.disabled(!active)`), rejecting pre-password-check — same mechanism as `aSuspendedOperatorCannotLogIn`. Pinned by AC-1/AC-4. | agent | open |
| R-3 | Dropping `owns_all_venues` orphans **prod** venues (Miramar + any created via `POST /api/venues` before this ships, which today have no `operator_venue` row) | med | high | V29 **backfills every currently-unowned venue to the bootstrap** (`NOT EXISTS`-guarded) **before** dropping the column. Data-safe forward migration. Pinned by AC-7/AC-8 + migration runs green in every Testcontainers IT. | agent | open |
| R-4 | Registration enumeration / timing oracle (username-taken leak) | med | med | `INSERT … ON CONFLICT (username) DO NOTHING RETURNING id` + constant-time equalizer (`encoder.matches(pw, timingEqualizerHash)` on the taken branch) + byte-identical `202` + own operator-auth rate-limit bucket (D-8). Pinned by AC-2. | agent | open |
| R-5 | New edge deps break `@ApplicationModuleTest` (`PayoutModuleTest`, full-suite-only) AND `@WebMvcTest` web-slice contexts (`WebSliceStubs`) — recurring class (memory: S2) | high | med | Add `@MockitoBean` for the new `operator::api` ports to `PayoutModuleTest` if the isolated context needs them; add stub beans (`OperatorRegistration`, `OperatorApprovals`) to `WebSliceStubs`. Verified by the **full** build in CI (not the diff). | agent | open |
| R-6 | ADMIN-role change accidentally re-gates existing OPERATOR endpoints, or the demoted admin loses console access | med | high | Only the **new** `/api/admin/operators/**` matchers use `hasRole(ADMIN)`; every existing matcher unchanged; the admin account is granted **both** `ROLE_OPERATOR` and `ROLE_ADMIN`. Pinned by all 6 pre-existing venue-scoped ITs staying green + AC-5/AC-8. | agent | open |
| R-7 | Flyway **V29** collision | low | high | Verified V28 is the highest on `main`; the 10 open PRs are all Dependabot FE bumps (no migration). V29 free + unclaimed. Renumber owner if a parallel migration lands first: whoever merges second. | agent | resolved (grill) |
| R-8 | `operator_venue.venue_id` PK conflict: backfill owns Miramar, but `CrossVenueDenialIT`/`OperatorOwnershipIT` previously granted Miramar to a test operator | med | med | Update those tests to insert **fresh** venues per operator instead of reusing Miramar (venue 1), which the backfill now owns; keep the direct-SQL harness. | agent | open |
| R-9 | Cross-module boundary leak (venue writing operator's mapping) | low | med | venue calls `operator::api VenueOwnership.assignOwner` (already-granted `operator::api`); the **write** lives in `operator`'s adapter; `operator` stays `allowedDependencies={}`. Pinned by `ModularityTests`. | agent | open |
| R-10 | Admin endpoints return a non-standard error body | low | low | `AdminOperatorController` maps `ApprovalOutcome` via the central `ApiProblem`/`ApiErrorHandler` (RFC-7807 `code`), no per-controller `@ExceptionHandler` (`ErrorContractArchitectureTests`). | agent | open |

## Open questions / Assumptions

- **Assumption (registration identity key = `username`):** operators authenticate by `username` today
  (`/api/auth/operator/login`, `loadUserByUsername`); registration keys non-enumeration on `username`.
  `contact_email` is informational, **not** a login key and **not** unique. — *Owner:* agent · *Resolves by:* phase 2.
- **Assumption (register response = `202 Accepted`, fixed body `{"status":"PENDING"}`):** no principal is
  established (unlike customer register's `201` + auto-sign-in), so a small fixed body, byte-identical fresh
  vs duplicate. — *Owner:* agent · *Resolves by:* phase 2.
- **Assumption (`admin` on `PrincipalResponse`/`/me`):** additive `admin` boolean derived from `ROLE_ADMIN`;
  customer paths set `false`; keeps the customer register body byte-identical (both fresh+dup gain the same
  field). — *Owner:* agent · *Resolves by:* phase 3.

### Resolved
- **Bootstrap fate** → **demote to platform admin** (keep row, drop owns-all, grant ADMIN, keep
  `RIVIERA_OPERATOR_PASSWORD`). *Maintainer, 2026-07-18.*
- **Existing bootstrap-owned venues** → **backfill to the demoted admin** (all currently-unowned venues,
  incl. Miramar). *Maintainer, 2026-07-18.*
- **Admin identity model** → an `is_admin` flag on the operator account; edge maps it to `ROLE_ADMIN`
  (operator stores opaque flag, no Spring Security). *Agent, follows from the demote decision.*
- **Registration states** → `PENDING → ACTIVE` (approve) / `PENDING → REJECTED` (reject); existing
  `SUSPENDED` retained; only `ACTIVE` authenticates. *Agent (AC "approve/reject").*

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` write path is touched. Venue
creation adds an ownership row (`operator_venue`), not an availability row; the claim transaction, pool
(#3) and cutoff (#4) rules are untouched. (`operator_venue.venue_id` PK gives "≤ one owner per venue", the
ownership analogue, but that is not the availability invariant.)

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | `Operator` | Owns operator **account identity** (now incl. registration/approval **state** + the `is_admin` flag) and the **operator↔venue ownership mapping** (now writable). `RESPONSIBILITIES.md` `operator` Job. Stays `allowedDependencies={}`, no Spring Security. |
| M-2 | `venue` | existing | `Venue` | `POST /api/venues` creates the venue and, in the same application-service transaction, **asks `operator` to record ownership** (creator-owns-on-create). Keeps `operator::api`+`::vocabulary`. |
| — | *(edge/root `ai.riviera.platform`)* | existing | — | `SecurityConfig` (ADMIN role + new matchers), `AuthController` (operator register), new `AdminOperatorController`, `OperatorUserDetailsService` (ROLE_ADMIN mapping), `RateLimitFilter` (operator-register bucket). Authentication/authorization machinery = platform edge (RV-BE-11), **not** a module. |

**Cross-module named interfaces (`api/` ports)** — all **inbound** (`api/`, not `spi/`): edge/venue *call* them.

| # | Module.api | Port | Public types (in `operator::vocabulary`) | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `OperatorRegistration#register(String username, String passwordHash, String contactEmail)` → `RegistrationOutcome` | `RegistrationOutcome` (sealed: `Registered(OperatorId)` \| `AlreadyRegistered`) | edge `AuthController` |
| NI-2 | `operator.api` | `OperatorApprovals#pending()` → `List<PendingOperator>`, `approve(OperatorId)` / `reject(OperatorId)` → `ApprovalOutcome` | `PendingOperator(OperatorId,String,String,Instant)`, `ApprovalOutcome` (enum) | edge `AdminOperatorController` |
| NI-3 | `operator.api` | `VenueOwnership#assignOwner(OperatorId, VenueRef)` (**new method** on the existing port) | `OperatorId`, `VenueRef` (existing) | `venue` `VenueAdminService` |
| NI-4 | `operator.api` | `OperatorAccounts#findByUsername` → `OperatorCredential` (**+`admin` field**) | `OperatorCredential(username,passwordHash,active,admin)` | edge `OperatorUserDetailsService` |

**Domain events:** `N/A — no new events.` Creator-owns-on-create is a **synchronous, transactional command**
(`VenueOwnership.assignOwner`), deliberately not an event: the ownership row must be written atomically with
the venue insert (an async listener could fail, leaving the creator `403`'d on their own venue — invariant
#13 hole). This mirrors the documented synchronous exception for `AvailabilityClaim` (caller must know the
outcome to proceed). Registration/approval are synchronous edge→module commands.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store operator **registration/approval state** (PENDING/ACTIVE/REJECTED), `contact_email`, `is_admin`; create a PENDING account; transition PENDING→ACTIVE/REJECTED; list pending | `operator` | `operator` **Job**: "Own operator accounts … and the account *identity*." Registration/approval is account-lifecycle identity data. Not on any Not-My-Job list (it is **not** login machinery — that stays at the edge). |
| **Write** the operator↔venue ownership row (on venue create + backfill) | `operator` | `operator` **Job**: owns "the operator↔venue ownership mapping." `venue` **Not-My-Job**: "who may act on a venue → `operator`". venue only *triggers* the write via the api port. |
| **Perform** the ownership check on venue-scoped ops | the venue-scoped **application service** | Unchanged, invariant #13 — `assertOwns` in the service, not the controller/adapter. |
| Encode/verify credentials; grant `ROLE_ADMIN` from `is_admin`; the register/approve HTTP endpoints; sessions; rate-limit | platform **edge** | `operator` **Not-My-Job**: "Encoding/verifying credentials → the platform edge (RV-BE-11)". `operator` stores `is_admin` as an **opaque flag**; the edge maps it to a Spring Security authority. `operator` imports no Spring Security (`OperatorAuthPlacementTests`). |
| **Decide** which pending operator to approve/reject (admin action) | platform **edge** (role-gated `/api/admin/**`) | Invariant #13 admin exemption — a platform-wide, role-gated action; the **state transition** it invokes is executed by the `operator` application service. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money moves and no ledger/refund logic changes.` Creating a venue and recording ownership does
not touch `payment`/`payout`. (An operator that later earns takings already flows through the existing
payout ledger; unchanged here.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-register.ts` (route `operator/register`) | new | standalone component | signals + one `error` signal (generic messages) | **Signal Forms** (`form(model)`) |
| FE-2 | `admin/admin-operators.ts` (route `admin`) | new | standalone component | `resource()` for the pending list; refresh after approve/reject; self-gates on `OperatorAuth.signedIn`+`isAdmin` | — (action buttons) |
| FE-3 | `admin/admin-operators.service.ts` | new | `@Service()` HTTP | `pending()` / `approve(id)` / `reject(id)` (cookie+CSRF via interceptor) | — |
| FE-4 | `core/operator-auth.ts` | modify | service | add `register(username,password,contactEmail)` → generic outcome; `isAdmin = computed(...)` | — |
| FE-5 | `core/session-auth.ts` | modify | base service | `AuthPrincipal` gains `admin?: boolean`; adopt it from `/me` | — |
| FE-6 | `operator/operator-console.html` + venue-editor sign-in card | modify | template | show **Admin** link when `operator.isAdmin()`; show "Register as operator" link on the sign-in card | — |
| FE-7 | `app.routes.ts` | modify | routes | add lazy `operator/register` (**before** `operator/:venueId`) + `admin`; both with `title` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, Signal Forms, `data-testid` on every field/
button + `role="alert"` errors (mirror `auth/register.ts`), Tailwind v4 over `--riv-*` tokens. angular-cli
MCP consulted for the `resource()` + Signal-Forms idioms.

## FE↔BE contract

- **New:** `POST /api/auth/operator/register` — body `{username, password, contactEmail}` → **`202`** fixed
  body `{"status":"PENDING"}` (byte-identical fresh vs duplicate, D-8). `400 INVALID_REQUEST` on policy
  violation (blank username / short password); `429` rate-limited. permitAll (CSRF token required, SPA-echoed).
- **New:** `GET /api/admin/operators` → `200` `[{id, username, contactEmail, registeredAt}]`; `403` non-admin. `ROLE_ADMIN`.
- **New:** `POST /api/admin/operators/{id}/approve` and `…/reject` → `200`; `404 NO_SUCH_OPERATOR`; `409 NOT_PENDING`; `403` non-admin. `ROLE_ADMIN`. CSRF token required.
- **Changed:** `GET /api/auth/me` (and login/register `PrincipalResponse`) gains `admin: boolean`.
- **Changed (behavior only):** `POST /api/venues` now writes ownership for the authenticated operator; response shape unchanged (`201` + `{id}`).
- **Client typing:** hand-written typed services (`admin-operators.service.ts`, `operator-auth.ts`); no `as any`. Money/date N/A (no amounts; `registeredAt` is an ISO instant string for display only).

## Execution status

> Session-recovery anchor. Re-read this section + the current `riviera-sdlc` reference file after any
> compaction before acting. Update in the same commit window as the change it records.

**Stage pointer:** `implement` — backend (0–3) + FE (4–5) done and green (`npm run lint`/`test` 732 pass/`build`); starting **phase 6** (mocked e2e).

**Next action:** Commit phases 4–5 (FE register + admin pages), then author the **phase 6** mocked e2e (register → approve → sign-in → create-venue).

| Phase | Status | Commits |
|-------|--------|---------|
| Plan — plan doc + branch | ✅ | a8f6a67 |
| 0+1 — retire owns-all + creator-owns-on-create (combined: phase 0 alone leaves create-then-edit red) | ✅ | 8acb830 |
| 2 — operator registration (PENDING) backend + edge endpoint | ✅ | 6d9fbd1 |
| 3 — admin approval + ADMIN role + `/api/admin/operators` | ✅ | f5e57e4 |
| 4+5 — FE operator-register page + admin-operators page + admin flag/nav | ✅ | 8da8ccb |
| 6 — e2e mocked (register→approve→sign-in→create-venue) | ✅ | (this commit) |
| 7 — docs + merge close-out | ⏳ | |

> **Note (angular-cli MCP unavailable this session):** the angular-cli MCP server didn't connect, so the
> admin-operators list uses the repo's established **imperative-async signal** pattern (as in
> `customer-auth.ts` / the customer register component) — a `signal` list + `load()` on an admin-confirmed
> `effect`, re-fetched after every decision — rather than an unverified `resource()` API. Reconcile-from-server
> (never a local-only card removal) is deliberate (the O6 #176 lesson).

Legend: blank = not started, ⏳ = in progress, ✅ = done.

> **Phases 0+1 combined (rationale):** retiring owns-all and creator-owns-on-create are two halves of one
> atomic change — phase 0 alone makes every "create a venue then edit it as the same operator" flow 403
> (owns-all used to satisfy it implicitly; creator-owns satisfies it explicitly). Committed together so the
> tree is green. Verified green locally: `OperatorOwnershipIT`, `CrossVenueDenialIT` (+creator-owns),
> `PerOperatorLoginIT`, `VenuePhotoReadModelIT`, `PayoutLedgerViewIT`, `OperatorAccountProvisioningIT`, the
> whole `venue` package, `Staff*`/`WeatherRefund*`/`AdminPayout*` security ITs, and the structural net
> (`ModularityTests`, `PackageShape*`, `PublishedSurfacePlacement*`, `JdbcOnly*`, `OperatorAuthPlacementTests`).

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (high, CONFIRMED) | Operator-register timing equalizer was **backwards** — `encode()` runs on both branches and there's no fresh-branch auto-sign-in bcrypt, so the taken-branch `matches()` made a taken username ~1 bcrypt **slower** (a reverse enumeration oracle, defeats D-8). | fixed (review-fix commit) — removed the equalizer; both branches now spend exactly one `encode()` bcrypt |
| F-2 | review (low, CONFIRMED) | `operator-auth.ts` redeclared the customer password-policy constants byte-for-byte → desync risk. | fixed (review-fix commit) — re-export `MIN_PASSWORD_LENGTH`/`PASSWORD_LENGTH_MESSAGE` from `customer-auth` (one source) |
| — | review (refuted) | "operator password validated via customer-named `CustomerPasswords.validate`" — refuted (one shared server-side policy is intended). | no change |

---

## File structure

**New — migration**
- `platform/src/main/resources/db/migration/V29__operator_registration_approval_and_retire_owns_all.sql`

**New — `operator::api`**
- `operator/api/OperatorRegistration.java` — `RegistrationOutcome register(String,String,String)`
- `operator/api/OperatorApprovals.java` — `pending()` / `approve(OperatorId)` / `reject(OperatorId)`

**New — `operator::vocabulary`**
- `operator/vocabulary/RegistrationOutcome.java` — sealed `Registered(OperatorId)` | `AlreadyRegistered`
- `operator/vocabulary/ApprovalOutcome.java` — enum `APPROVED, REJECTED, NOT_PENDING, NO_SUCH_OPERATOR`
- `operator/vocabulary/PendingOperator.java` — `record(OperatorId id, String username, String contactEmail, Instant registeredAt)`

**Modified — `operator`**
- `operator/api/VenueOwnership.java` — add `void assignOwner(OperatorId, VenueRef)`
- `operator/vocabulary/OperatorCredential.java` — add `boolean admin`
- `operator/domain/OperatorStatus.java` — add `PENDING`, `REJECTED`
- `operator/application/Operators.java` — add `insertPending`, `pendingOperators`, `activate`, `reject`, `assignOwner`; `credentialByUsername` selects `is_admin`
- `operator/application/OperatorService.java` — implement `assignOwner`
- `operator/application/OperatorRegistrationService.java` — **new** `@Service implements OperatorRegistration, OperatorApprovals`
- `operator/adapter/out/JdbcOperators.java` — new SQL (insertPending/pending/activate/reject/assignOwner), drop `owns_all` from `ownsVenue` + `insert`, select `is_admin`

**Modified — `venue`**
- `venue/adapter/in/VenueAdminController.java` — `create(Authentication)`; resolve `CurrentOperator`
- `venue/application/OnboardVenue.java` — `onboard(OperatorId, NewVenueCommand)`
- `venue/application/VenueAdminService.java` — write venue + `ownership.assignOwner` in one tx

**Modified — edge (root `ai.riviera.platform`)**
- `SecurityConfig.java` — `ADMIN_ROLE`; `/api/auth/operator/register` permitAll; `/api/admin/operators/**` `hasRole(ADMIN)`
- `OperatorUserDetailsService.java` — grant `ROLE_ADMIN` when `credential.admin()`
- `AuthController.java` — `operatorRegister` endpoint; `admin` on `PrincipalResponse`/`me`; DTO `OperatorRegistrationRequest`
- `AdminOperatorController.java` — **new** `@RestController` `/api/admin/operators` (list/approve/reject)
- `RateLimitFilter.java` — enroll `/api/auth/operator/register` into the operator-auth bucket

**Modified — tests / harness**
- `WebSliceStubs.java` — stub `OperatorRegistration`, `OperatorApprovals`
- `PayoutModuleTest.java` — `@MockitoBean` for new operator ports if the isolated context requires
- `CrossVenueDenialIT.java` — extend (AC-6) + fresh venues (R-8)
- `OperatorOwnershipIT.java` — assignOwner + owns-all-retired (AC-7); fresh venues (R-8)
- `PerOperatorLoginIT.java` — bootstrap-is-admin-owns-backfilled-only (AC-8)
- **New** `OperatorRegistrationIT.java` (AC-1/AC-2), `OperatorApprovalIT.java` (AC-3/AC-4/AC-5)
- `SessionLoginSupport.java` — add an operator-register helper if useful

**New — FE**
- `frontend/src/app/operator/operator-register.ts` (+ `.spec.ts`, `.a11y.spec.ts`)
- `frontend/src/app/admin/admin-operators.ts` (+ `.spec.ts`, `.a11y.spec.ts`), `admin/admin-operators.service.ts` (+ `.spec.ts`), `admin/admin.model.ts`
- `frontend/e2e/operator-registration.e2e.ts`; `frontend/e2e/support/operator-registration.page.ts`

**Modified — FE**
- `frontend/src/app/core/operator-auth.ts`, `core/session-auth.ts`, `app.routes.ts`,
  `operator/operator-console.html`, `venue-admin/venue-editor.ts` (register link),
  `frontend/e2e/support/auth-mocks.ts`

**Docs (phase 7)**
- `CLAUDE.md` (operator note + bounded-contexts row + epic paragraph + Flyway V29), `RESPONSIBILITIES.md`
  (operator Shipped line), `docs/runbooks/operator-credential-provisioning.md`,
  `docs/deploy/production-hardening.md`, this plan doc (final state).

---

## Phase 0 — V29 migration + retire owns-all + ownership-write path

**Files:** Create `V29__…sql` · Modify `JdbcOperators`, `Operators`, `OperatorService`, `VenueOwnership`,
`OperatorStatus`, `OperatorCredential` · Test `OperatorOwnershipIT`

- [ ] **Step 1: Write/extend the failing test** — `OperatorOwnershipIT`:
  - `assignOwnerRecordsMappingAndAssertOwnsPasses` — `operators.assignOwner(op, venueRef)` then `assertOwns` passes; a different operator is denied.
  - `bootstrapOwnsOnlyBackfilledVenuesNotAll` — the bootstrap (`operator`) `assertOwns` Miramar (venue 1, backfilled) **passes**, but a freshly-inserted venue (no mapping) is **denied** (owns-all retired).
  - Use fresh venues per operator (R-8); drop `owns_all_venues` from the test's direct-SQL inserts.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*OperatorOwnershipIT*"` → FAIL (`assignOwner` absent / owns-all still short-circuits).
- [ ] **Step 3: Minimal implementation**
  - **V29** (order matters — backfill before drop):
    ```sql
    ALTER TABLE operator ADD COLUMN contact_email TEXT;
    ALTER TABLE operator ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE operator DROP CONSTRAINT operator_status_check;
    ALTER TABLE operator ADD CONSTRAINT operator_status_check
        CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'));
    -- Demote the bootstrap: it becomes the platform admin (approves operators)…
    UPDATE operator SET is_admin = TRUE WHERE username = 'operator';
    -- …and keeps every venue it previously reached via owns_all, now made explicit
    -- (Miramar + anything created before this migration that has no owner row).
    INSERT INTO operator_venue (venue_id, operator_id)
    SELECT v.id, o.id
    FROM   venue v CROSS JOIN operator o
    WHERE  o.username = 'operator'
      AND  NOT EXISTS (SELECT 1 FROM operator_venue ov WHERE ov.venue_id = v.id);
    -- Retire the crutch: no account owns all venues anymore.
    ALTER TABLE operator DROP COLUMN owns_all_venues;
    ```
  - `OperatorStatus`: add `PENDING`, `REJECTED`.
  - `VenueOwnership`: add `void assignOwner(OperatorId operator, VenueRef venue)`.
  - `Operators` (driven port): add `void assignOwner(OperatorId, VenueRef)`; `credentialByUsername` selects `is_admin` (→ `OperatorCredential.admin`).
  - `OperatorCredential`: add `boolean admin`.
  - `OperatorService`: `assignOwner` → `operators.assignOwner`.
  - `JdbcOperators`: `assignOwner` → `INSERT INTO operator_venue (venue_id, operator_id) VALUES (:venue, :operator)`; `ownsVenue` SQL drops the `o.owns_all_venues OR` branch (pure `operator_venue` EXISTS); `insert` drops `owns_all_venues`; `credentialByUsername`/other reads select `is_admin`.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*OperatorOwnershipIT*"` → PASS.
- [ ] **Step 5: Generalization-audit** — grep `owns_all` across `platform/` → fix **every** reference (JDBC + all direct-SQL test inserts). Record in the log.
- [ ] **Step 6: Commit** — `feat(#115): [S0] V29 retire owns-all + operator-venue assignOwner`
- [ ] **Step 7: Update execution status.**

> Structural net after this phase: `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*OperatorAuthPlacementTests*"`.

## Phase 1 — creator-owns-on-create

**Files:** Modify `VenueAdminController`, `OnboardVenue`, `VenueAdminService` · Test `CrossVenueDenialIT`

- [ ] **Step 1: Extend the failing test** — `CrossVenueDenialIT.creatorOwnsCreatedVenueAndOthersAreDenied`:
  `actingAs(operatorA)` → `POST /api/venues` (`201`, capture id) → A reaches a venue-scoped endpoint on it
  (`200`); `actingAs(operatorB)` → same endpoint → `403 NOT_VENUE_OWNER`. Keep/rename
  `venueCreationIsNotOwnershipChecked` (create still `201` for any operator).
- [ ] **Step 2: Verify it fails** — `./gradlew test --tests "*CrossVenueDenialIT*"` → FAIL (no ownership written; B reaches A's new venue).
- [ ] **Step 3: Minimal implementation** — `VenueAdminController.create(@RequestBody …, Authentication auth)`
  → `OperatorId creator = currentOperator.require(auth)` → `onboardVenue.onboard(creator, request.toCommand())`.
  `OnboardVenue.onboard(OperatorId, NewVenueCommand)`. `VenueAdminService.onboard` (`@Transactional`):
  `var id = new VenueId(venues.insertVenue(command)); ownership.assignOwner(creator, new VenueRef(id.value())); return id;`
- [ ] **Step 4: Verify it passes** — `./gradlew test --tests "*CrossVenueDenialIT*"` → PASS.
- [ ] **Step 5: Generalization-audit** — any other create-without-owner path? (`OnboardVenue` is the only venue-create seam.) Record.
- [ ] **Step 6: Commit** — `feat(#115): [S1] creator-owns-on-create writes operator_venue in venue service`
- [ ] **Step 7: Update execution status.**

## Phase 2 — operator registration (PENDING) backend + edge endpoint

**Files:** Create `OperatorRegistration`, `RegistrationOutcome`, `OperatorRegistrationService`; Modify
`Operators`/`JdbcOperators`, `AuthController`, `SecurityConfig`, `RateLimitFilter`, `WebSliceStubs` · Test
`OperatorRegistrationIT`

- [ ] **Step 1: Write the failing test** — `OperatorRegistrationIT` (mirror `CustomerRegisterIT`):
  `registersPendingAndCannotLogInUntilApproved` (register → `202` fixed body, **no** SESSION cookie; the row
  is PENDING; `POST /api/auth/operator/login` → `401`); `duplicateRegistrationIsIndistinguishable`
  (register twice → byte-identical `202`, exactly one row); `blankOrShortPasswordIsRejected` (`400 INVALID_REQUEST`, nothing written).
  Use a unique `X-Forwarded-For` per call (`SessionLoginSupport.uniqueClientIp`) to avoid the shared bucket.
- [ ] **Step 2: Verify it fails** — `./gradlew test --tests "*OperatorRegistrationIT*"` → FAIL (endpoint/port absent).
- [ ] **Step 3: Minimal implementation**
  - `OperatorRegistration#register(username, passwordHash, contactEmail) → RegistrationOutcome`; `RegistrationOutcome` sealed (`Registered(OperatorId)` | `AlreadyRegistered`).
  - `Operators.insertPending` / `JdbcOperators`: `INSERT INTO operator (username, status, is_admin, password_hash, contact_email) VALUES (:u,'PENDING',FALSE,:h,:email) ON CONFLICT (username) DO NOTHING RETURNING id` → `Registered(id)` or `AlreadyRegistered`.
  - `OperatorRegistrationService implements OperatorRegistration` (`@Transactional register`).
  - `AuthController.operatorRegister(OperatorRegistrationRequest req)`: validate (non-blank username, min password length — reuse the customer min-length policy value), `outcome = operatorRegistration.register(req.username(), passwordEncoder.encode(req.password()), req.contactEmail())`; on `AlreadyRegistered` run the constant-time equalizer (`passwordEncoder.matches(req.password(), timingEqualizerHash)`); **no session** either branch; return `202` fixed body `{"status":"PENDING"}`.
  - `SecurityConfig`: `POST /api/auth/operator/register` → permitAll.
  - `RateLimitFilter`: enroll `/api/auth/operator/register` into the operator-auth (`loginBuckets`) dimension.
  - `WebSliceStubs`: add an `OperatorRegistration` stub.
- [ ] **Step 4: Verify it passes** — `./gradlew test --tests "*OperatorRegistrationIT*"` → PASS.
- [ ] **Step 5: Generalization-audit** — confirm the customer register pattern was mirrored faithfully (no auto-sign-in for operators; equalizer present; own bucket). Record.
- [ ] **Step 6: Commit** — `feat(#115): [S2] operator self-registration → PENDING, non-enumerating + rate-limited`
- [ ] **Step 7: Update execution status.**

## Phase 3 — admin approval + ADMIN role + `/api/admin/operators`

**Files:** Create `OperatorApprovals`, `ApprovalOutcome`, `PendingOperator`, `AdminOperatorController`;
Modify `OperatorRegistrationService`, `Operators`/`JdbcOperators`, `OperatorUserDetailsService`,
`SecurityConfig`, `AuthController` (me admin flag), `WebSliceStubs`, `PayoutModuleTest` · Test
`OperatorApprovalIT`

- [ ] **Step 1: Write the failing test** — `OperatorApprovalIT`:
  `approveEnablesLogin` (register PENDING → admin `POST …/approve` → ACTIVE → operator login `200`);
  `rejectDisablesLogin` (→ REJECTED → login `401`); `approveNonPendingConflicts` (approve an ACTIVE id →
  `409 NOT_PENDING`; unknown id → `404 NO_SUCH_OPERATOR`); `plainOperatorIsForbiddenFromAdminSurface`
  (an ACTIVE non-admin operator → `403` on GET/approve/reject); `adminListsPending` (admin GET returns the
  pending row with username + contactEmail). Admin session via the bootstrap `operator` (now ADMIN).
- [ ] **Step 2: Verify it fails** — `./gradlew test --tests "*OperatorApprovalIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation**
  - `OperatorApprovals#pending()`/`approve(OperatorId)`/`reject(OperatorId)`; `ApprovalOutcome` enum; `PendingOperator` record.
  - `Operators`/`JdbcOperators`: `pendingOperators()` (`SELECT id, username, contact_email, created_at … WHERE status='PENDING' ORDER BY created_at`); `activate(id)`/`reject(id)` = `UPDATE operator SET status=:target WHERE id=:id AND status='PENDING'` (rowcount 1 → APPROVED/REJECTED; 0 → classify NOT_PENDING vs NO_SUCH_OPERATOR by an existence read).
  - `OperatorRegistrationService implements OperatorApprovals` too (`@Transactional` approve/reject).
  - `OperatorUserDetailsService`: `.roles(credential.admin() ? new String[]{OPERATOR_ROLE, ADMIN_ROLE} : new String[]{OPERATOR_ROLE})`.
  - `SecurityConfig`: `ADMIN_ROLE="ADMIN"`; matchers `GET /api/admin/operators`, `POST /api/admin/operators/*/approve`, `…/reject` → `hasRole(ADMIN)` (before `.anyRequest()`; leave payout-batches on OPERATOR).
  - `AdminOperatorController` (`/api/admin/operators`): GET → `pending()` → view DTO list; POST approve/reject → map `ApprovalOutcome` via `ApiProblem` (200 / 409 `NOT_PENDING` / 404 `NO_SUCH_OPERATOR`).
  - `AuthController`/`PrincipalResponse`: add `admin` (from `ROLE_ADMIN` authority) to `/me` + login/register responses.
  - `WebSliceStubs`: add an `OperatorApprovals` stub; `PayoutModuleTest`: `@MockitoBean` the new ports if the isolated context needs them.
- [ ] **Step 4: Verify it passes** — `./gradlew test --tests "*OperatorApprovalIT*"` → PASS; then the venue-scoped IT set (R-6) + structural net.
- [ ] **Step 5: Generalization-audit** — grep other `/api/admin/**` matchers (payout-batches) — confirm intentionally left on OPERATOR. Record.
- [ ] **Step 6: Commit** — `feat(#115): [S3] admin approval surface + ADMIN role (bootstrap demoted to admin)`
- [ ] **Step 7: Update execution status.**

## Phase 4 — FE operator-register page

**Files:** Create `operator/operator-register.ts` (+specs); Modify `core/operator-auth.ts`,
`core/session-auth.ts`, `app.routes.ts`, `venue-admin/venue-editor.ts` (link)

- [ ] TDD (Vitest): `operator-register.spec.ts` — submitting posts `{username,password,contactEmail}`;
  success shows the pending message (no navigation to a signed-in surface); `429`→rate-limited generic
  message; `400`→invalid message. `operator-register.a11y.spec.ts` (axe) + labels/`role="alert"`.
- [ ] Implement the component (Signal Forms, mirror `auth/register.ts`), `OperatorAuth.register(...)` →
  `POST /api/auth/operator/register` returning a generic outcome (`'registered' | 'rate-limited' | 'error'`).
  Route `operator/register` (**before** `operator/:venueId`). Consult angular-cli MCP for the Signal-Forms + generic-error idiom.
- [ ] `npm run lint && npm test -- operator-register && npm run build`.
- [ ] **Commit** — `feat(#115): [S4] FE operator registration page (pending message)`; update status.

## Phase 5 — FE admin-operators page + admin flag

**Files:** Create `admin/admin-operators.ts` (+specs), `admin/admin-operators.service.ts` (+spec),
`admin/admin.model.ts`; Modify `core/session-auth.ts` (`admin?` on `AuthPrincipal`, `isAdmin`),
`core/operator-auth.ts` (`isAdmin`), `operator/operator-console.html` (Admin link), `app.routes.ts`

- [ ] TDD (Vitest): service spec (pending/approve/reject HTTP); component spec — lists pending, Approve/Reject
  call the service and refresh; self-gates (signed-out/non-admin → sign-in prompt / not-authorized). a11y spec.
- [ ] Implement (`resource()` pending list, refresh after action; `computed isAdmin`); route `admin` with
  in-component gate. Admin link in the console header shown only when `operator.isAdmin()`. Consult angular-cli MCP for the `resource()` refresh idiom.
- [ ] `npm run lint && npm test -- admin && npm run build`.
- [ ] **Commit** — `feat(#115): [S5] FE admin approvals surface + admin flag on /me`; update status.

## Phase 6 — e2e mocked (register → approve → sign-in → create-venue)

**Files:** Create `frontend/e2e/operator-registration.e2e.ts`, `frontend/e2e/support/operator-registration.page.ts`;
Modify `frontend/e2e/support/auth-mocks.ts`

- [ ] Load `playwright-cli`. Extend `auth-mocks.ts` with stateful `mockOperatorRegisterApi` (202) +
  `mockAdminOperatorsApi` (pending list / approve flips state) composed with the existing operator/venue mocks.
- [ ] Author `operator-registration.e2e.ts`: register (pending message) → admin approves → operator signs in →
  creates a venue → sees it; `expectNoSeriousAxeViolations` at each rendered state. Place in the **mocked**
  suite (`frontend/e2e/`), consistent with RV-FE-E2E.
- [ ] `npm run test:e2e:a11y` (the mocked suite CI runs — **not** `test:e2e`).
- [ ] **Commit** — `test(#115): [S6] e2e register→approve→sign-in→create-venue (mocked)`; update status.

## Phase 7 — docs + merge close-out

- [ ] `CLAUDE.md`: rewrite the operator note (owns-all retired + creator-owns-on-create + registration/approval
  shipped; bootstrap demoted to admin), the bounded-contexts `operator` row (registration/approval state),
  the epic-#108 paragraph (S6 landed), Flyway high = **V29**.
- [ ] `RESPONSIBILITIES.md`: `operator` Shipped line (owns-all retired, creator-owns-on-create, registration/
  approval state, admin-authority-as-account-flag; still no Spring Security — `OperatorAuthPlacementTests`).
- [ ] `docs/runbooks/operator-credential-provisioning.md` + `docs/deploy/production-hardening.md`:
  `RIVIERA_OPERATOR_PASSWORD` now provisions the **admin** (demoted bootstrap) login; how operators
  self-register + get approved; the admin approval endpoints; **owns-all retired** (behavior change:
  `operator` no longer implicitly owns every venue).
- [ ] Run `riviera-docs-freshness` over the merge span (close-out step 5); `graphify update .` after doc edits.
- [ ] Tick epic **#108** S6 line with the PR number; close #115.
- [ ] **Ready-for-human tail (flag, do not silently change prod):** on deploy, `RIVIERA_OPERATOR_PASSWORD`
  keeps the *same* Render value (no new secret), but the account it unlocks changes from owns-all operator →
  ADMIN + explicit Miramar owner; after V29 runs, logging in as `operator` no longer reaches *every* venue.
  Note this in the PR description; no Render env change required.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-18 | Phase 0 — drop `owns_all_venues` | column refs | `grep owns_all_venues platform/` | `JdbcOperators` + 9 test INSERTs | dropped the column from all; V16 (immutable history) left as-is |
| 2026-07-18 | Phase 0 — retire owns-all short-circuit | tests relying on bootstrap owns-all | `grep operatorFor("operator")` / `operator_venue` | `OperatorOwnershipIT`, `PerOperatorLoginIT`, `CrossVenueDenialIT` (grant Miramar), `VenuePhotoReadModelIT` + `PayoutLedgerViewIT` (bootstrap on fresh venue) | fresh venues per operator + explicit `grant(bootstrap, freshVenue)`; Miramar reserved for the backfilled bootstrap |
| 2026-07-18 | Phase 1 — creator-owns-on-create | create-then-edit-as-bootstrap + unknown-venue-404 | `grep post("/api/venues")` / `NO_SUCH_VENUE` | `BeachMapReplaceIT` (create+seedOwner PK clash → use bootstrap), `VenueAdminControllerIT`/`VenueRepriceIT` (unknown-venue 404→403) | fixed all; unit `NO_SUCH_VENUE` tests unaffected (FakeOwnership grants the owner) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-9 (backend):** `./gradlew test --tests "*OperatorRegistrationIT*" --tests "*OperatorApprovalIT*" --tests "*CrossVenueDenialIT*" --tests "*OperatorOwnershipIT*" --tests "*PerOperatorLoginIT*" --tests "*ModularityTests*" --tests "*OperatorAuthPlacementTests*"` → all green.
- [ ] **AC-10 (e2e):** `npm run test:e2e:a11y` → `operator-registration.e2e.ts` green.
- [ ] Full CI green (backend build + FE lint/test/build + e2e + Sonar) on the PR.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** (invariant #1); `JdbcClient` + explicit SQL; records for the new vocabulary.
- [ ] Availability N/A justified (invariant #2 untouched).
- [ ] **Modulith** boundaries: new ports in `operator::api`/`::vocabulary` (inbound, not `spi`); creator-owns is a synchronous api command not an event; `operator` `allowedDependencies={}`, imports no Spring Security (invariant #11, RV-BE-11).
- [ ] **Per-venue authorization** (invariant #13): creator-owns-on-create writes ownership in the application service; other operators `403` (RV-BE-9). Admin surface role-gated, not venue-scoped.
- [ ] Payment/payout N/A.
- [ ] Flyway **V29** present; status CHECK widened + tested; backfill-before-drop; no committed credential; `RIVIERA_OPERATOR_PASSWORD` env-only, never logged (invariants #12, #7).
- [ ] Registration non-enumerating + constant-time + own rate-limit bucket (D-8); admin errors via central `ProblemDetail` (§6b).
- [ ] **Frontend** standards met (Signal Forms, `data-testid`, a11y, Tailwind tokens); no `as any`.
- [ ] Execution status at HEAD matches reality (stage, phases, findings register).
- [ ] Open Questions empty or deferred with an issue #.
