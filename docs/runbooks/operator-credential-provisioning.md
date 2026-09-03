# Operator credential provisioning & rotation (#74, #115, #326, #344)

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
  **This stays the admin's only rotation path** — it is deliberately excluded from the #326
  self-service page (see below), because a self-service change would be silently reverted at the
  next boot.
- **Leave it blank** → the admin has no login and cannot approve registrations (logged at WARN,
  without the value) until a credential is configured.
- **Set it shorter than 12 characters or longer than 72 bytes** → refused exactly like a blank value:
  not stamped, one WARN that never prints the value, never a boot failure. The bootstrap credential is
  held to the same floor as every chosen password (D-8); on a database that already carries a stamped
  hash the previous credential stays in force, on a fresh one the admin has no login.

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

## Self-service password change (#326)

A signed-in **non-bootstrap** operator changes its own password at
`POST /api/auth/operator/password` (`{currentPassword, newPassword}` → `204`), from the SPA page
`/account/operator-password`, reached via the operator console header's **Change password** link.
Before #326 there was no self-service path at all: an operator that suspected its credential was
compromised had to find a platform admin.

- **The current password must be proved.** Wrong (or an account with no stored hash) →
  `400 INVALID_CURRENT_PASSWORD`, nothing written, nothing revoked. The check is
  `matches(rawInput, storedHash)` — never encode-then-compare, which bcrypt's re-salting makes
  always-false (the defect behind #128 and S8; `OperatorPasswordChangeIT` pins it).
- **Omitted entirely** (absent or empty) → `400 MISSING_CURRENT_PASSWORD`, checked ahead of the policy
  rule below. Its own code since #345: sharing `INVALID_REQUEST` with a policy violation told a caller
  whose new password was fine to pick a different length. The customer twin `POST /api/me/password`
  answers the same code, where the omission previously read as `INVALID_CURRENT_PASSWORD`.
- **New password policy** is the shared one (D-8): 12 characters to 72 bytes → `400 INVALID_REQUEST`
  otherwise; a new password containing the operator's own username or the word `riviera` (any case)
  → `400 PASSWORD_CONTAINS_BLOCKED_TERM`, its own code so the page can name the rule that failed.
- **Other sessions die, and yours is re-issued under a new id.** On success the edge deletes every
  *other* `SPRING_SESSION` row for that principal (`PrincipalSessionRevoker`, #128), then rotates
  the calling session's id (#344). You stay signed in — Spring Session writes the replacement
  `SESSION` cookie on the same response — but the cookie value you arrived with is dead.
  > **What this does and does not recover.** It evicts anyone holding the *password* and anyone
  > holding a copy of **any** cookie that existed before the change, including your own — which is
  > what #344 added; before it, an exfiltrated copy of the caller's cookie named the one session the
  > change deliberately spared and kept working. What it still cannot do is evict an attacker who
  > controls the device *itself* and simply reads the new cookie: for that, have an admin suspend
  > the account (which revokes every session, including yours) and treat the device as lost.
- **The two effects are ordered, not transactional.** The revoke runs **before** the credential write,
  so the failure this used to produce is gone: a revoke that fails now leaves the password unchanged and
  your current one still works. The worst outcome of that case is being signed out of your other devices
  for nothing. (Ordered the other way, as #326 shipped it, a transient failure rotated the hash and *then*
  reported failure, so the retry drew `INVALID_CURRENT_PASSWORD` and looked like a broken account.)
  > **On any failed change, try the NEW password before concluding nothing happened.** Ordering fixes the
  > revoke case, not every case: a failure *after* the credential write — including Spring Session's save
  > of the rotated session id, which happens after the request handler returns — still reports an error
  > with the password already changed. Nothing short of a shared transaction closes that, and there is no
  > transaction shared between the credential store and the session store.
- **Own rate-limit budget.** The path has its own per-IP bucket, separate from operator login, so a
  change flood cannot lock operators out of signing in (the #127 lesson). Exhausted → `429`.
- **The bootstrap admin is refused**: `409 BOOTSTRAP_CREDENTIAL_MANAGED`. Its credential is
  env-managed and re-stamped every boot, so a self-service change would die at the next deploy and
  take the admin's session with it. The guard keys on `riviera.operator.username`, **not** on the
  `is_admin` flag — a *second* admin approved through `/api/admin/operators` is an admin but is not
  env-managed, and keeps self-service.
- **A non-`ACTIVE` account is refused**: `409 ACCOUNT_NOT_ACTIVE` (defence-in-depth; suspension
  already revokes the sessions such a caller would need).

**Still not available:** an admin resetting *another* operator's password, and operator "forgot
password" by email — operators have no verified email channel until the real mailer lands (#255).
A compromised operator is **suspended**, not silently re-credentialed.

## Additional operators (programmatic)

Provision operators directly (bypassing self-registration) through the `operator` module's
`OperatorProvisioning` port (`ai.riviera.platform.operator.api.OperatorProvisioning`):

- `provision(username, passwordHash)` — create a new `ACTIVE`, per-venue (not an admin) operator.
- `setPassword(username, passwordHash)` — rotate an existing operator's credential.

Both take an **already-encoded** hash: encode the raw password with the edge `PasswordEncoder`
(delegating → `{bcrypt}…`) and pass the result, keeping all crypto at the edge (the `operator` module
stores an opaque blob — RV-BE-11). Grant a per-venue operator its venues with `operator_venue` rows;
a per-venue operator owns **only** the venues explicitly mapped to it (invariant #13).

Since #326, `setPassword` also backs the operator's **own** password change over HTTP (above) — but
only for the caller's own account, after proving the current password. Provisioning or
re-credentialing *another* operator remains a programmatic/operational step (e.g. a one-off runner),
not an HTTP call: the admin surface deliberately offers approve/reject/suspend/reinstate and no
credential write.

## Suspending an operator

Set `operator.status = 'SUSPENDED'`. A suspended account is built `disabled`, so
`DaoAuthenticationProvider` rejects its login in the pre-authentication check (401) — before the
password is examined — and it resolves to no owning principal (owns nothing → 403 everywhere).
