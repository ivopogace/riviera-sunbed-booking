# Sign-in / registration for customers and operators (form + Google/Apple SSO)

Status: **accepted design, epic in flight** (see the epic issue that references this
doc). Decisions below were made at the refine stage (self-grill, 2026-07-02) and
approved by the maintainer; each is a one-paragraph re-decision if reality disagrees.

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

> The #74 "no JWT / no custom filters" posture was a proof-of-concept-era rule; the
> maintainer reopened the choice (2026-07-02) and this decision was re-made with all
> options on the table, not inherited.

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

- The current FE `OperatorAuth` (raw password held in a signal, replayed as
  `Authorization: Basic` per request) is retired by this epic; SSO cannot be
  expressed as Basic anyway.
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

- `customer` module: customer **account identity** + opaque credential hash +
  SSO subject linkage. (This supersedes the "tourist accounts out of scope in v1"
  line — update `RESPONSIBILITIES.md`/`CONTEXT.md` when the first slice ships.)
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
**ACTIVE**. Approved operators create venues they then own
(**creator-owns-on-create** on `POST /api/venues` — the documented #74 follow-up),
which finally retires the owns-all **bootstrap operator**. Invariant #13 continues
to be enforced in the application services.

### D-6: Email flows — mocked mailer, same stub pattern

Email verification and self-service password reset ship in this epic against a
**mock mailer adapter** (logs/records the tokenized link); a real SMTP/provider
adapter is deferred exactly like the SSO credentials. A **verified email gates
linking past guest bookings** to a new account — linking by unverified email would
hand an attacker the victim's booking codes (invariant #7). Tokens are single-use,
expiring, and stored hashed (they are bearer credentials, invariant #7 posture).

### D-7: Same-site FE/BE hosting is an architectural requirement (dev now, prod hoster later)

Session cookies require the FE and the API to be **same-site in every deployed
environment** — that is a property of this auth design, not of any particular
host. Per environment:

- **Dev/demo (Render — this is the only thing Render is for):** GitHub Pages
  (`github.io`) and Render (`onrender.com`) are cross-site; a session cookie would
  need `SameSite=None` and Safari's ITP would still drop it. Fix (devops slice):
  serve the FE from a **Render static site with an `/api/*` rewrite-proxy** to the
  backend service → same-origin, cookies work, the CORS surface shrinks.
  ADR-0004 (non-prod hosting) gets amended by that slice.
- **Prod:** will run on a **DSGVO-conform hoster** (the ADR-0004 deferred
  follow-up; identity data makes this stricter, not looser). The same-site
  constraint is an explicit **selection criterion** for that hoster: one origin
  (reverse proxy serving SPA + `/api/**`) or same-registrable-domain subdomains
  (e.g. `app.…`/`api.…`). Anything else re-breaks the cookie.

Local dev is unaffected (`localhost:4200` → `localhost:8080` is same-site).

### D-8: Abuse hardening

Login, register, SSO callback, and reset/verify endpoints go behind the existing
`RateLimitFilter` pattern (#56). Login failures return a generic "invalid
credentials" (no account enumeration — registration responses likewise avoid
confirming whether an email exists). Password storage uses the existing delegating
encoder (`{bcrypt}`); password minimum length enforced server-side.

## Slice map (the epic's sub-issues)

| # | Slice | Blocked by |
|---|---|---|
| S1 | Session-auth foundation: login/logout + CSRF; operator FE off Basic | — |
| S2 | Customer register + sign-in (form) | S1 |
| S3 | Signed-in checkout linking + my-bookings (guest-mode extension) | S2 (back-linking gated by S8's verified email) |
| S4 | `SsoGateway` port + mocked Google/Apple end-to-end; real adapters throw | S2 |
| S5 | Real Google/Apple adapters (credentials are a ready-for-human prerequisite) | S4 |
| S6 | Operator self-registration → approval → creator-owns-on-create; retire bootstrap owns-all | S1 |
| S7 | Same-site hosting (Render static + `/api/*` rewrite) for session cookies | — (needed before demoing S1+ in the cloud) |
| S8 | Email verification + password reset via mocked mailer | S2 |

## Invariants and review hooks in play

- **#7** booking codes / tokens as bearer credentials (S3 linking rule, S8 tokens).
- **#13** per-venue authorization; object-level checks stay in application
  services (S6). Reviewed by RV-BE-9.
- **RV-BE-11** no login machinery inside domain modules — everything
  authentication-mechanical stays at the platform edge (`OperatorAuthPlacementTests`
  extends to the customer side).
- **#1/#11/#12** as always: JDBC-only, ADR-0007 module shape, Flyway migrations
  for the new account/credential/token tables.

## Explicit non-goals (this epic)

- Real Google/Apple credentials, real SMTP — external provisioning, tracked as
  ready-for-human prerequisites inside S5/S8.
- MFA, account lockout policies, OAuth for the operator side, native-app auth.
- Any change to guest checkout or the booking-code flow.
