# ADR-0032: The metrics scraper holds its own bearer token, checked on a stateless actuator chain

- **Status:** Accepted. Decided 2026-11-15 by the wave-6 orchestrator for the owner, from best-practice research
  (issue #130).
- **Date:** 2026-11-15
- **Relates to:** `docs/architecture/auth-signin-register.md` D-1 (server-side sessions, not JWT, not Basic; its
  evolution path is an authorization server for new client types). This ADR is an addendum to D-1's direction:
  the platform's first non-session credential. It also relates to `RESPONSIBILITIES.md` § *Platform edge*,
  § `auth` and § `web`, `docs/deploy/production-hardening.md` § *Actuator endpoints*, and #1652, which made the
  scrape ADMIN-only.

## Context

D-1 retired HTTP Basic. That left a metrics scraper (Prometheus, Grafana Alloy) with only one way to read
`/actuator/prometheus` or health's component details: a scripted admin session login. That has three problems:

- **Too much reach.** An admin session reaches all of `/api/admin/**`, including erasure, refunds, payout batches
  and operator approvals. A scraper only reads.
- **The wrong lifetime.** A long-lived scraper credential stored as an admin password means every scraper host
  holds the keys to the money surface.
- **The wrong revocation story.** `PrincipalSessionRevoker` ends an operator's sessions. It cannot tell the
  scraper's session apart from the admin's own.

#130 also asked about a machine path to the admin write surface (the BKT payout curl). A scraper and a human
running a settlement are different clients, with different lifetimes and revocation needs. That half moves to
#284, where ADR-0029's settlement port is designed.

## Decision

1. **A narrow machine credential.** The scraper presents `Authorization: Bearer <token>`. The token is 256 bits
   of randomness (`openssl rand -hex 32`). The server stores only its SHA-256, in
   `riviera.observability.scrape-token-sha256`, plus an optional second hash in `…-sha256-next` for overlap
   rotation. `auth`'s `ScrapeCredentials` hashes the presented token and compares it with each configured hash
   using `MessageDigest.isEqual`, always comparing both slots. A fast hash is right here: a 256-bit random token
   is in no dictionary, so a slow KDF would add latency and buy nothing. A configured value that is not 64 hex
   characters fails the boot, naming the key and never the value.
2. **One authority, meaningful in one place.** A match yields an authentication holding `ROLE_METRICS` alone. It
   reads `GET /actuator/prometheus` and health's details (`management.endpoint.health.roles=METRICS`). The API
   chain never consults the bearer header, so the token reaches no `/api/**` path, no other actuator endpoint and
   no write.
3. **Its own chain, ordered first.** Spring Security invokes only the first `SecurityFilterChain` that matches.
   An `@Order(0)` chain with `securityMatcher("/actuator/**")` owns every actuator path, and the API chain no
   longer matches them. The chain is stateless: `SessionCreationPolicy.STATELESS` and a
   `NullSecurityContextRepository`. It never reads or creates a session, so an admin session is anonymous there
   and loses scrape access (least privilege). CSRF guards ambient credentials (cookies), and this chain honours
   none, so it ignores CSRF. The rate limiter stays in the chain. The chain has no CORS configuration, since it
   has no browser client.
4. **Fail closed.** With no hash configured, every request carrying an `Authorization` header is `401`. Any
   header that is not a matching bearer token is `401` with `WWW-Authenticate: Bearer` and the shared
   `UNAUTHENTICATED` problem body. A request with no header stays anonymous: health answers status only, info its
   commit id, and everything else is `401`. A token on a denied path is `403`.
5. **Revocation and rotation without a store.** To revoke, remove the hash and redeploy. No session exists, so
   `PrincipalSessionRevoker` has nothing to do. To rotate, put the new hash in `…-next`, move the scraper to the
   new token, promote the hash to the primary slot, then clear `…-next`. A refused attempt is logged at `WARN`
   with method and path only, never the header. There is no migration and no table.
6. **Placement.** The credential check and its properties are `auth`'s: credentials and the authorities they
   grant. The filter and the chain are `web`'s, the fence. `web` already holds `auth::api`, so no new grant is
   needed.

## Consequences

- The anonymous actuator surface is unchanged: Render's health check and the CD commit poll keep working with no
  credential. Health's anonymous rule is now `GET` only, like info's.
- An admin can no longer read prometheus or health's details from the console session. Nothing does today.
- The token is a bearer credential. Anyone holding it can read platform-wide metrics (refund and outbox signals,
  per-URI traffic), but nothing else. It lives only in the scraper's secret store and never in the repo. It
  belongs in a file the scraper reads (Prometheus `authorization.credentials_file`, or Alloy's `authorization`
  block fed by `local.file`), never on a command line.
- Deferred: a separate `management.server.port`, or `management.server.address` bound to an ops network. This is
  defence in depth for when the production topology (Hetzner) is known. It would also take the actuator off the
  public listener entirely.

## Alternatives considered

- **A scripted admin session.** Rejected: admin reach for a read-only client, plus a CSRF dance on every change
  and session rows for the scraper.
- **A metrics-only operator account (a session).** Rejected: it still needs session plumbing, a login and a
  password, and the scraper would hold a credential for the session chain, which carries every other role check.
- **An authorization server (D-1's evolution path).** Too large for one read-only client. It stays the path when
  native apps or third-party API clients arrive.
- **HTTP Basic for the actuator only.** Rejected: D-1 retired Basic, and a password hashed with bcrypt per scrape
  costs CPU for no gain over a random token.

## Sources

- Spring Boot reference, Actuator *Endpoints* (health `show-details=when-authorized` with `roles`; a dedicated
  chain matching `EndpointRequest`) and *Monitoring and Management over HTTP* (`management.server.port`,
  `management.server.address`).
- Spring Security reference, *Servlet Architecture* (only the first matching `SecurityFilterChain` is invoked)
  and *Session Management* (`SessionCreationPolicy.STATELESS`).
- Prometheus configuration, `scrape_config.authorization` (`type` defaults to `Bearer`; `credentials_file`).
- Grafana Alloy, `prometheus.scrape` (`authorization` block; `local.file` preferred over `credentials_file`).
- OWASP API Security Top 10 2023, API2:2023 Broken Authentication (API keys authenticate clients, never users).
- OWASP Secrets Management Cheat Sheet (rotate regularly; never log a secret).
