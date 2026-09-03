# Sign-in / registration for customers and operators (form + Google/Apple SSO)

Status: **accepted design, shipped** (epic #108), except the D-8 revision's proof-of-work
challenge, which is **decided but in flight** under epic #903 (slices #905–#907); the revised
password policy shipped with #904, the challenge is absent until those merge. Decisions below were made at the refine stage (2026-07-02) and approved by the
maintainer; each is a one-paragraph re-decision if reality disagrees. The per-module contracts these decisions settled are in
`RESPONSIBILITIES.md` (§`customer`, §`operator`, § *Platform edge*).

## What this adds

Accounts and sign-in for both sides of the marketplace, **as an extension of guest
mode — guest checkout stays**:

- **Customers (tourists):** register / sign in with an email+password form, or via
  Google / Apple SSO. A signed-in customer's bookings are linked to their
  `CustomerId` and listable ("my bookings"). Guests keep booking exactly as today
  (booking code as the bearer credential, invariant #7).
- **Operators:** sign in via the same session mechanism (replacing the FE's
  Basic-auth-per-request); **self-registration with admin approval** (see below).

## Decision record (the self-grill)

### D-1: Server-side sessions (BFF shape), not JWT, not Basic — decided on merits

Authentication is a **Spring Security server-side session**: an `HttpOnly; Secure;
SameSite=Lax` session cookie established by framework-native login, with **CSRF
cookie-to-header** protection for the SPA on session-authenticated writes, and
**sessions persisted in Postgres via Spring Session JDBC** (a Render restart or
redeploy must not sign everyone out; also multi-instance-safe).

Alternatives considered and rejected:

- **JWT access+refresh in the browser** — the token must be reachable from browser
  JS (XSS-stealable, and this app takes payments); revocation (logout, password
  reset, operator deactivation) needs a server-side denylist that reintroduces the
  state JWT was meant to remove; refresh rotation + key management is standing
  complexity; the stateless-scaling benefit is nil for a single-monolith Modulith.
  Current OAuth browser-based-app best practice (and OWASP) says: keep tokens out
  of browser JS, use a backend-for-frontend with cookies — which is this design.
- **Own OAuth2 Authorization Server (Spring Authorization Server)** — right when
  multiple client types need tokens (native apps, third-party API). Today there is
  one SPA and one backend, and the AS would still need an internal login session.
  Recorded as the **evolution path**: when native apps arrive, add an authorization
  server over the same identity store and issue tokens to those clients; the web
  app keeps cookies. Nothing here blocks that.
- **Managed IdP (Keycloak/Auth0/Cognito/Firebase)** — external dependency + cost;
  US-provider DSGVO posture is worse for identity data than for hosting (cf.
  ADR-0004's deferred concern); self-hosted Keycloak is real ops burden solo; and
  the mocked-SSO-until-credentials requirement fits a port we own far more cleanly.

Consequences kept from the session choice:

- The frontend holds no credential: the old `Authorization: Basic`-per-request operator auth
  is retired in favour of the session; SSO could not be expressed as Basic anyway.
- Session fixation: Spring's default protection (session id rotates on login).
  Logout/password-reset truly invalidate server sessions (needs the server-side
  session store — trivial here, a denylist under JWT).
- RV-BE-11 / `OperatorAuthPlacementTests` remain valid as a *placement* rule
  (login machinery at the platform edge, not in domain modules) independent of the
  mechanism re-decision.

### D-2: Two principal types, one edge mechanism

`CUSTOMER` and `OPERATOR` are distinct principal types with separate
login/register endpoints, sharing the platform-edge machinery. Module ownership
(RESPONSIBILITIES boundary, RV-BE-11):

- `customer` module: customer **account identity** + opaque credential hash + SSO subject
  linkage. The account is a **separate identity** — its own `customer_account` table (own PK,
  **no FK** to the guest `customer` row) — so registration never auto-claims a guest email's
  past bookings. Login machinery stays at the edge (RV-BE-11, `CustomerAuthPlacementTests`).
- `operator` module: unchanged ownership (account identity + operator↔venue
  mapping), gains registration/approval state.
- Platform edge (`ai.riviera.platform`): all login machinery — filter chain,
  session config, the SSO redirect/callback handling.

### D-3: SSO flow — OIDC Authorization Code + PKCE, server-side

The SSO flow is **Authorization Code + PKCE completed on the backend**: tokens
never reach browser JS; a successful callback establishes the same session cookie
as form login. Google is plain OIDC; Apple ("Sign in with Apple") needs an ES256
client-secret JWT and `form_post` response mode — both are adapter details behind
one port.

### D-4: SSO adapters are mocked until credentials ship (payment-stub precedent)

Same shape as `StubPaymentGateway` vs `StripePaymentGateway`:

- An **`SsoGateway` port** at the platform edge (provider → verified external
  identity: subject, email, display name).
- A **mock adapter** (default/demo profile) that completes a fake
  "Continue with Google/Apple" flow end-to-end with canned verified identities —
  the FE buttons, redirects, and session establishment are all real.
- **Real `GoogleSsoGateway` / `AppleSsoGateway` adapters that throw
  `UnsupportedOperationException`** ("not implemented — awaiting client
  credentials"; Java's equivalent of a NotImplementedException) until the Google
  Cloud / Apple Developer credentials are provisioned.
- **Startup guard:** the mock adapter active together with the prod profile fails
  the boot — a fake IdP must never be reachable in production.

### D-5: Operator registration — self-register + admin approval

Operators touch real venues and money, so no open self-signup:
registration creates a **PENDING** operator account; a platform admin approves →
**ACTIVE**. The PENDING account signs in immediately (the frontend auto-signs-in with the
just-entered credentials after the session-less `202`) and uses the full console —
**creator-owns-on-create** on `POST /api/venues` applies from PENDING, and what approval
gates is **tourist visibility**, not access. `SUSPENDED`/`REJECTED` cannot authenticate, and
reject/suspend revoke live sessions. No operator owns all venues; the bootstrap account is the
platform admin. Invariant #13 is enforced in the application services.

### D-6: Email flows — mocked mailer, same stub pattern

Email verification and self-service password reset run against the `notification` module's
mailer (a recording mock by default; the real SMTP adapter is ADR-0011). Tokens are single-use,
expiring, and stored hashed (bearer credentials, invariant #7 posture).

Back-linking past guest bookings to a new account is a **permanent non-goal**: bookings made
in guest mode are **never** auto-attached to an account; guest bookings stay device-/code-scoped.
Email verification is therefore a **soft, non-blocking** signal: registration issues a
verification link, visiting it sets `email_verified`, and the flag is informational (a "please
verify" nudge + email-ownership/anti-spam trust) — it blocks no sign-in or booking. SSO-created
accounts count as provider-verified. An SSO-only, password-less account gains a password only via
an authenticated set-password while signed in **or** the token-proven reset flow — never an
unauthenticated register-time UPSERT (an account-takeover vector).

### D-7: Same-site FE/BE hosting is an architectural requirement (dev now, prod hoster later)

Session cookies require the FE and the API to be **same-site in every deployed
environment** — that is a property of this auth design, not of any particular
host. Per environment:

- **Dev/demo (Render):** the **backend serves the SPA itself** — the Angular app is bundled
  into the Spring Boot image (`classpath:/static/`), so one Render service hosts both the app
  and `/api/**` → same-origin, cookies work, no cross-origin CORS (ADR-0004, including the
  rejected static-site rewrite-proxy).
- **Prod:** will run on Hetzner (ADR-0004; identity data makes the DSGVO posture stricter, not
  looser). The same-site
  constraint is an explicit **selection criterion** for that hoster: one origin
  (reverse proxy serving SPA + `/api/**`) or same-registrable-domain subdomains
  (e.g. `app.…`/`api.…`). Anything else re-breaks the cookie.

Local dev is unaffected (`localhost:4200` → `localhost:8080` is same-site).

### D-8: Abuse hardening

Login, register, SSO callback, and reset/verify endpoints go behind the existing
`RateLimitFilter` pattern. Login failures return a generic "invalid
credentials" (no account enumeration — registration responses likewise avoid
confirming whether an email exists). Password storage uses the existing delegating
encoder (`{bcrypt}`).

**Password policy** — shipped with #904. Chosen ahead of the first live deploy, so no existing
credential needs a migration path; the rule applies where a password is chosen, never at sign-in:

- **Minimum 12 characters, maximum 72 bytes** (the bcrypt input cap), for tourists **and**
  operators. One server-side rule shared by every surface that accepts a new password
  (register on both sides, reset, set, change); the frontend mirrors the constant. Length is the
  primary control — no composition rules (uppercase / digit / symbol), per NIST SP 800-63B.
- **Context blocklist:** a password that contains the account's email local part, the operator
  username, or `riviera` (case-insensitive) is rejected.
- **The bootstrap admin credential** (`RIVIERA_OPERATOR_PASSWORD`) is held to the same floor:
  a shorter value is **not stamped** and is logged at WARN without the value — the same
  outcome as an empty value (admin login disabled) — never a boot failure.
- **Not adopted, deliberately:** a breached-password check (Spring Security's
  `HaveIBeenPwnedRestApiPasswordChecker`; evaluated in
  `docs/research/2026-09-03-altcha-proof-of-work-and-replay-registry.md` § 5). It would put an
  external call in the credential path; the epic keeps that path self-contained. Revisit if the
  per-identity login throttle shows credential-stuffing patterns. Also deferred: a client-side
  strength meter, re-checking passwords at sign-in, and any lockout policy.

**Proof-of-work challenge** (ADR-0016; shipping with #905–#907): customer register, operator register, forgot-password
and booking create additionally require a solved, single-use ALTCHA challenge — self-hosted,
no third party, no cookie — verified at the edge against a Postgres registry. Login keeps the
per-identity throttle and gets no challenge; an adaptive "challenge once the bucket runs low"
is the recorded phase-two shape.

## Slices

All eight slices of epic #108 shipped: session-auth foundation (S1), customer register + sign-in
(S2), signed-in checkout linking + my-bookings (S3), the mocked SSO gateway (S4), operator
self-registration → approval → creator-owns-on-create (S6), same-origin hosting (S7), and email
verification + password reset (S8). Real Google/Apple adapters (S5) remain a ready-for-human
prerequisite: the adapters throw until credentials are provisioned.

## Invariants and review hooks in play

- **#7** booking codes / tokens as bearer credentials.
- **#13** per-venue authorization; object-level checks stay in application services.
  Reviewed by RV-BE-9.
- **RV-BE-11** no login machinery inside domain modules — everything
  authentication-mechanical stays at the platform edge (`OperatorAuthPlacementTests`
  extends to the customer side).
- **#1/#11/#12** as always: JDBC-only, ADR-0007 module shape, Flyway migrations
  for the new account/credential/token tables.

## Explicit non-goals (this epic)

- Real Google/Apple credentials — external provisioning, a ready-for-human prerequisite.
- MFA, account lockout policies, OAuth for the operator side, native-app auth.
- Any change to guest checkout or the booking-code flow.
