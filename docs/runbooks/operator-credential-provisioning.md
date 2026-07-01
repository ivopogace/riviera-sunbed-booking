# Operator credential provisioning & rotation (#74)

Operator logins are **per-operator and DB-backed**. Each `operator` row carries its own hashed
credential (`operator.password_hash`, V17); login is verified at the edge by
`OperatorUserDetailsService` (a Spring Security `UserDetailsService`) against the delegating
`PasswordEncoder`. There is **no shared password**, no JWT, and no self-service HTTP endpoint —
provisioning is deliberately an operational action, not an operator-reachable surface.

## The bootstrap platform-admin operator

The seeded `operator` row (username `operator`, `owns_all_venues`, from V16) is the platform-admin
account. Its credential is provisioned **at startup** by `OperatorCredentialInitializer` from the
`RIVIERA_OPERATOR_PASSWORD` environment variable (bound via `riviera.operator.password`):

- **Set it** (e.g. a Render env var) → on boot the bootstrap operator can log in as
  `operator` / `<that value>`. The value is **never committed** and never logged (invariant #7).
- **Rotate it** → set a new value and restart. Each boot re-stamps the hash (bcrypt salts differ;
  the current password verifies), so changing the variable and restarting rotates the password.
- **Leave it blank** → the bootstrap operator has no login and the operator write API is locked
  (logged at WARN, without the value) until a credential is configured.

Keep `riviera.operator.username` = `operator` (matches the V16 seed). Overriding it without also
seeding a matching `operator` row leaves the login with nowhere to land and venue-scoped endpoints
return `403`.

## Additional operators

Provision further operators (each with their **own** credential) through the `operator` module's
`OperatorProvisioning` port (`ai.riviera.platform.operator.api.OperatorProvisioning`):

- `provision(username, passwordHash)` — create a new `ACTIVE`, per-venue (not owns-all) operator.
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
