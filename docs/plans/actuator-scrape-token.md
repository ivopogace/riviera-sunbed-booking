# Actuator scrape token Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A metrics scraper holding a 256-bit bearer token reads `GET /actuator/prometheus` and health's
details, and nothing else; no admin session is needed or accepted for either.

**Architecture:** A dedicated stateless `@Order(0)` chain for `/actuator/**` in `web`, ahead of the API
chain (first matching chain wins). `auth` owns the credential: an `auth.api.ScrapeCredentials` port
compares `SHA-256(token)` in constant time against one or two configured hashes and grants
`ROLE_METRICS`. `web`'s bearer filter calls it. The chain never reads or creates a session.

**Source of intent:** issue #130 (scope (i), mechanism decided by the wave orchestrator on the owner's
behalf from best-practice research).

**Branch:** `feature/130-actuator-scrape-token`

## Acceptance criteria

- [x] **AC-1:** Given a configured hash, when a scraper presents the matching token, then prometheus
  answers 200 with the scrape body and health answers with `components`. *Seam:* `GET /actuator/prometheus`,
  `GET /actuator/health` · *Pinned by:* `ActuatorHardeningIT.aValidScrapeTokenReadsPrometheus`,
  `…aValidScrapeTokenSeesHealthDetails`
- [x] **AC-2:** Given overlap rotation (current and next hash both set), when either token is presented,
  then both are accepted. *Seam:* `ScrapeCredentials.authenticate` + the route · *Pinned by:*
  `ScrapeTokenVerifierTest`, `ActuatorHardeningIT.bothRotationTokensAreAccepted`
- [x] **AC-3:** Given a wrong token, a malformed bearer header or no hash configured, when it is presented
  on any actuator path, then 401 `UNAUTHENTICATED` and a WARN log line naming method and path, never the
  token. A missing header on prometheus is 401 (anonymous). *Seam:* the route; `ScrapeCredentials` ·
  *Pinned by:* `ActuatorHardeningIT.aWrongScrapeToken…`, `ScrapeTokenVerifierTest.noHashConfigured…`,
  `ScrapeTokenFilterTest`
- [x] **AC-4:** Given a valid token, when it is presented on `/api/admin/**`, on `/actuator/env` (or another
  denied actuator path), or with a `POST`, then 401 or 403: the token has no meaning outside the
  actuator chain, and `ROLE_METRICS` reaches no write. *Pinned by:*
  `ActuatorHardeningIT.theScrapeTokenReachesNothingElse`
- [x] **AC-5:** Given an admin session, when it requests prometheus or health, then prometheus is denied
  and health shows no details: the actuator chain reads no session (least privilege). *Pinned by:*
  `ActuatorHardeningIT.anAdminSessionNoLongerScrapes`, `…healthHidesDetailsFromAnAdminSession`
- [x] **AC-6:** Anonymous `GET /actuator/health` (status only) and `GET /actuator/info` (commit id alone)
  are unchanged, and no actuator response sets a cookie. *Pinned by:* the existing IT cases +
  `…actuatorResponsesSetNoCookie`
- [x] **AC-7:** The token never appears in logs, on accept or reject. *Pinned by:*
  `ActuatorHardeningIT.theScrapeTokenNeverReachesTheLog` (`OutputCaptureExtension`)
- [x] **AC-8:** A configured hash that is not 64 hex characters fails the boot naming the key, never
  echoing the value. *Pinned by:* `ScrapeTokenPropertiesBindingTest`
- [x] **AC-9:** The structural net is green.

## Non-goals

- A machine path to `/api/admin/**` (Gap 2): moves to #284 with a note; a scraper and a settlement are
  different clients and never share a credential.
- A separate `management.server.port`: defence in depth for when the Hetzner topology is known; named in
  the docs, not built.
- A token store, a migration, per-scraper identities, an actuator rate-limit budget (a 256-bit token is
  not guessable; the limiter stays in the chain for parity).

## Risks

- **R-1:** The API chain still matching `/actuator/**` would make the new rules dead or, worse, split
  the policy → the API chain's matcher drops `/actuator/**`; the actuator chain ends `denyAll()`.
- **R-2:** A stateless chain that still touches the session (CSRF token save, request cache) would create
  `SESSION` rows for a scraper → `STATELESS` + `NullSecurityContextRepository`; CSRF ignores the chain
  (no ambient credential is honoured, so a cross-site page has nothing to ride), pinned by the
  no-cookie AC.
- **R-3:** The token leaking through a log line or a problem body → the filter logs method + path
  only; the problem body is the shared `UNAUTHENTICATED` one; AC-7.
- **R-4:** Timing oracle on the comparison → hash then `MessageDigest.isEqual`, both slots always
  compared.
- **R-5:** Fail open when unconfigured → no hash ⇒ every bearer request 401 (AC-3).
- **R-6:** Sibling conflicts (#394, #364, #276 touch `SecurityConfig`, `application.properties`,
  `production-hardening.md`, CLAUDE.md, RESPONSIBILITIES *Platform edge*) → merge `origin/main`, keep
  both slices' text. ADR number 0032 is this slice's (0031 is #394's, 0033 #276's). No Flyway.

## Open questions

### Resolved

- AC wording "an admin session gets 403 on prometheus": the decided mechanism never reads a session,
  so an admin cookie is anonymous here and gets **401**. The AC's intent (admin sessions lose scrape
  access) holds; the status follows the mechanism. Recorded in the PR.

## Modulith

- **`auth.api.ScrapeCredentials`** (new port, `auth`): `Optional<Authentication> authenticate(String)`.
  Consumer: `web`'s `ScrapeTokenFilter`. `web` already holds `auth::api` + `auth::vocabulary`; no new
  grant. Owner check: credentials and the authorities they grant are `auth`'s Job; the filter and route
  policy are `web`'s (§ *Platform edge*, fence vs mechanism).
- **`auth.vocabulary.AuthRoles.METRICS`**: the role name.
- Implementation `auth.application.ScrapeTokenVerifier` + `ScrapeTokenProperties`
  (`riviera.observability.scrape-token-sha256`, `…-next`), registered by `AuthConfig`.
- `WebSliceStubs` imports the verifier like `StampedSessionCredentials`.

## Phases

- **Phase 0 — verifier:** `ScrapeTokenVerifierTest` + `ScrapeTokenPropertiesBindingTest` red → port,
  properties, verifier.
- **Phase 1 — the chain:** `ActuatorHardeningIT` new cases red → `ScrapeTokenFilter`, `@Order(0)` chain,
  `management.endpoint.health.roles=METRICS`, API chain drops actuator.
- **Phase 2 — docs:** ADR-0032, production-hardening § Actuator, observability upgrade path, minting
  runbook, CLAUDE.md + RESPONSIBILITIES *Platform edge*/`auth`/`web`, #284 note.

## Execution status

**Stage pointer:** PR #1800 — CI, then ready for review

**Next action:** CI green on the docs push → merge origin/main → mark ready → review gate (high).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — verifier | ✅ | 083324fa |
| 1 — the chain | ✅ | 1710ba5d |
| 2 — docs | ✅ | (this push) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
