# SSO lands in the build it started from — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** An SSO round trip (operator sign-in, operator link, customer sign-in) started under `/sq/`, `/it/` or
`/de/` lands under that same prefix on every outcome.

**Architecture:** Option A of #1804. The authorize request names its build's locale code; `auth` resolves it through
`shared.SiteLocale.fromCode` (closed set, anything else is English) and keeps the `SiteLocale` in the session-held
`SsoAuthorization`. The callback prefixes its fixed landing path with that locale's subpath. The redirect target is
built only from server constants: no request value ever reaches the `Location` header raw. The customer flow's
client-side `sessionStorage` note (`rememberSsoReturn()`, the seed's `riviera-sso-locale` branch) is retired, since
the server now lands it directly.

**Source of intent:** #1804

**Branch:** `bugfix/operator-sso-locale-1804`

## Decision and research

Chosen: **A, server-side**, over B (extend the client seed note to the operator landings).

- OWASP *Unvalidated Redirects and Forwards Cheat Sheet* (fetched from the `OWASP/CheatSheetSeries` repo):
  "do not allow the URL as user input for the destination" and "have the user provide short name, ID or token which
  is mapped server-side to a full target URL". A locale code mapped through `SiteLocale` onto a server-held path is
  exactly that mapping; B keeps the destination decision in the browser.
- Spring Security reference: the OAuth2 client keeps the `OAuth2AuthorizationRequest` in the `HttpSession`
  (`HttpSessionOAuth2AuthorizationRequestRepository`) "from the time the Authorization Request is initiated to the time
  the Authorization Response is received", and the post-login target is the session-held `SavedRequest`
  (`HttpSessionRequestCache`). Carrying the landing context on the session-held round-trip record is the framework's
  own pattern; `SsoAuthorization` already is that record (#276).
- RFC 9700 (OAuth 2.0 Security BCP) §4.11.1: a client must not be an open redirector. Not fetched in this session
  (the host is outside the network allow-list); cited from the published RFC. A closed enum satisfies it.
- Angular i18n deploy guide / ADR-0030: each locale is its own build under its subpath, so the landing must name the
  subpath; the server already maps locales to subpaths (`SiteLocale`, `SpaLocale`) and already takes the build's
  locale code from the SPA for mails (#1770, `AuthController`, `AccountRecoveryController`), so A adds no new pattern.
- B's weaknesses: per-path seed logic for three operator landings (and any future one), a `sessionStorage` note that
  outlives a round trip that never returns, and blocked storage silently landing in English.

No product call: the customer lands where it did (the build it left); only the mechanism moves server-side, which the
issue names as A's scope.

## Acceptance criteria

- [x] **AC-1:** Given an operator sign-in authorize with `locale=sq`, when the callback signs in, refuses, or a link
  started with `"locale":"sq"` links or fails, then each redirect is the same path under `/sq/`
  (`/sq/operator`, `/sq/account/sign-in?audience=operator&sso=failed`, `/sq/account/operator-password?sso=linked|link-failed`).
  *Seam:* `GET /api/auth/sso/{provider}/callback` · *Pinned by:* `OperatorSsoIT` (locale cases)
- [x] **AC-2:** Given a customer authorize with `locale=it`, when the callback signs in, then it redirects to `/it/?sso=signed-in`; an English one to `/?sso=signed-in`, which the seed never redirects.
  *Seam:* the callback · *Pinned by:* `SsoCallbackIT`
- [x] **AC-3:** Given no locale, an unknown code, a case variant or a hostile value (`//evil.example`, `../x`), when the
  round trip lands, then it lands on the unprefixed English path. *Seam:* `SsoAuthorization.landing` · *Pinned by:*
  `SsoAuthorizationTest`
- [x] **AC-4:** Given the `sq` build, when an operator starts SSO sign-in or a link, then the request carries
  `locale=sq` and every outcome renders in the `sq` build. *Seam:* the translated production build · *Pinned by:*
  `e2e/locales/locales.e2e.ts` "an operator SSO round trip"
- [x] **AC-5:** The customer SSO starts carry the build locale and no longer write `riviera-sso-locale`; the seed no
  longer reads it. *Pinned by:* `customer-auth.spec.ts`, `locale.spec.ts`, `locale-boot.spec.ts`, the existing
  locale e2e "an SSO sign-in" cases.

## Non-goals

- Any landing other than the SSO callback's.
- Recording the locale as the operator's stored language (that is the console's language row, #1785).

## Risks

- **R-1 open redirect** → the `Location` is `"/" + SiteLocale.subPath() + <constant path>`; the request value only
  selects an enum constant. Pinned by AC-3.
- **R-2 old SPA tab after deploy** (no `locale` param) → English landing, then the seed's stored choice on `/`; the old
  tab's leftover note is never read again. Harmless.
- **R-3 session record shape change** (`SsoAuthorization` is `Serializable` in Spring Session JDBC): a round trip in
  flight across the deploy fails to deserialize → `consume` sees no record → `400`, the user retries. Bump
  `serialVersionUID`.

## FE↔BE contract

- `GET /api/auth/sso/{provider}/authorize?locale=<code>` and `GET /api/auth/operator/sso/{provider}/authorize?locale=<code>`:
  optional.
- `POST /api/auth/operator/sso/{provider}/link` body `{ currentPassword, locale? }`.

## Phases

- **Phase 0 — record carries the locale:** `SsoAuthorization.locale` + `landing(path)` · red `SsoAuthorizationTest`
- **Phase 1 — callbacks land under it:** authorize/link take `locale` · red `OperatorSsoIT`, `SsoCallbackIT` locale cases
- **Phase 2 — SPA sends it, retires the note:** `customer-auth`, `operator-auth`, `locale.ts`, `index.html` · red the specs
- **Phase 3 — locale e2e + docs:** `e2e/locales` operator round trip; ADR-0030 §5, RESPONSIBILITIES §auth

## Execution status

- [x] Phase 0
- [x] Phase 1 — `OperatorSsoIT`, `SsoCallbackIT`, `SsoAuthorizationTest` green locally
- [x] Phase 2 — unit specs green; `writeSessionStorage` lost its last caller and went with the note
- [x] Phase 3 — locale e2e 28/28 against the production build; mocked `operator-sso`, `sso-sign-in` green
- Finding in phase 3: an English customer return lands on `/`, where the seed would apply a stored choice (the case
  #1772 fixed). Fixed with a server-constant marker, `/?sso=signed-in`, that the seed honours and strips in place
  (no storage); `locale-boot.spec.ts` pins it.
