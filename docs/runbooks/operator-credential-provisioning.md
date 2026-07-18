# Operator credential provisioning & rotation (#74, #115)

Operator logins are **per-operator and DB-backed**. Each `operator` row carries its own hashed
credential (`operator.password_hash`, V17); login is verified at the edge by
`OperatorUserDetailsService` (a Spring Security `UserDetailsService`) against the delegating
`PasswordEncoder`. There is **no shared password** and no JWT. Since **#115** operators can also
**self-register** (below), and the owns-all bootstrap operator is retired.

## The bootstrap platform-admin operator (demoted, #115)

The seeded `operator` row (username `operator`, from V16) is the **platform admin**. Since **#115**
it no longer owns all venues — V29 dropped `owns_all_venues` and instead set `is_admin = TRUE` and
**backfilled** every previously-unowned venue (Miramar + anything created before the migration) to it
as explicit `operator_venue` rows, so it keeps managing exactly what it reached before. The edge
grants it `ROLE_ADMIN` (on top of `ROLE_OPERATOR`), which gates the operator-approval surface
`/api/admin/operators`.

Its credential is provisioned **at startup** by `OperatorCredentialInitializer` from the
`RIVIERA_OPERATOR_PASSWORD` environment variable (bound via `riviera.operator.password`) — **the same
variable as before #115; no new secret**:

- **Set it** (e.g. a Render env var) → on boot the admin can log in as `operator` / `<that value>`.
  The value is **never committed** and never logged (invariant #7).
- **Rotate it** → set a new value and restart. Each boot re-stamps the hash (bcrypt salts differ;
  the current password verifies), so changing the variable and restarting rotates the password.
- **Leave it blank** → the admin has no login and cannot approve registrations (logged at WARN,
  without the value) until a credential is configured.

Keep `riviera.operator.username` = `operator` (matches the V16 seed). Overriding it without also
seeding a matching `operator` row leaves the login with nowhere to land, and the admin/venue-scoped
endpoints return `401`/`403`.

> **Deploy note (#115):** `RIVIERA_OPERATOR_PASSWORD` keeps the **same Render value** — no env change
> is required. The only behaviour change after V29 runs is that logging in as `operator` no longer
> reaches *every* venue (only its backfilled ones); it now also unlocks the admin approval surface.

## Operator self-registration & approval (#115)

Prospective operators **self-register** at `POST /api/auth/operator/register` (`username` + `password`
+ `contactEmail`; the SPA page is `/operator/register`). Registration is non-enumerating and on its
own rate-limit budget (D-8) and creates a **`PENDING`** account that **cannot authenticate** until
approved — so there is no open self-signup into anything venue-scoped.

A platform admin reviews the queue at `/api/admin/operators` (SPA page `/admin`, shown via the console
header's *Admin* link when signed in as an admin):

- **Approve** (`POST /api/admin/operators/{id}/approve`) → `PENDING`→`ACTIVE`; the operator can now log
  in. On first `POST /api/venues` it **owns** the venue it creates (creator-owns-on-create).
- **Reject** (`POST /api/admin/operators/{id}/reject`) → `PENDING`→`REJECTED` (terminal; still cannot
  log in).

The approval surface is role-gated to `ADMIN` and **not** venue-scoped (invariant #13's `/api/admin/**`
exemption). All login/approval machinery is at the edge (RV-BE-11); the `operator` module owns only the
account state + the `operator_venue` mapping.

## Additional operators (programmatic)

Provision operators directly (bypassing self-registration) through the `operator` module's
`OperatorProvisioning` port (`ai.riviera.platform.operator.api.OperatorProvisioning`):

- `provision(username, passwordHash)` — create a new `ACTIVE`, per-venue (not an admin) operator.
- `setPassword(username, passwordHash)` — rotate an existing operator's credential.

Both take an **already-encoded** hash: encode the raw password with the edge `PasswordEncoder`
(delegating → `{bcrypt}…`) and pass the result, keeping all crypto at the edge (the `operator` module
stores an opaque blob — RV-BE-11). Grant a per-venue operator its venues with `operator_venue` rows;
a per-venue operator owns **only** the venues explicitly mapped to it (invariant #13).

A future admin console will drive `OperatorProvisioning` behind an authenticated admin surface;
until then, provisioning additional operators is a programmatic/operational step (e.g. a one-off
runner), not an HTTP call.

## Suspending an operator

Set `operator.status = 'SUSPENDED'`. A suspended account is built `disabled`, so
`DaoAuthenticationProvider` rejects its login in the pre-authentication check (401) — before the
password is examined — and it resolves to no owning principal (owns nothing → 403 everywhere).
