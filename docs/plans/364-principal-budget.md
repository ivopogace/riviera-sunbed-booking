# #364 — per-principal budget for the authenticated credential endpoints

Branch: `bugfix/364-principal-budget` · Tier: Risk (authentication throttling at the edge) · Issue #364

## Decision (orchestrator, from best-practice research; not re-opened)

Option 2: a second, narrow `PrincipalRateLimitFilter` in `web/adapter/in`, `addFilterAfter(…,
AuthorizationFilter.class)` (`AdminAuditFilter`'s slot), built with `new` (a `@Bean` filter is registered
twice). `RateLimitFilter` keeps its slot and its per-IP budgets as volume control. Rejected: option 1
(moves the anonymous budgets behind CSRF and authorization), option 3 (re-implements Spring Session's
lookup). Accepted trade-off: a session thief can lock the victim's sign-in for up to 15 minutes, as a
username-holder already can through the login.

## Acceptance criteria

Seam: the `@WebMvcTest` slice with `SecurityConfig` (`RateLimitFilterTest`, `username` capacity 2),
unless noted. Each is red on `origin/main` except AC-7 (a guard).

- **AC-1** Given operator `A` signed in, when it sends three failing `POST /api/auth/operator/password`
  from three IPs, then the third is `429`, while operator `B` from a fresh IP still gets `400`. Customer
  twin on `POST /api/me/password`.
- **AC-2** Given an operator whose two password changes answered `204`, when it then fails twice, then
  the third failure is `429` (a 2xx refunds its token).
- **AC-3** Given ten CSRF-less, ten wrong-role (CUSTOMER on the operator path, OPERATOR on the customer
  path) requests for one name, then that account still has its whole budget (third failure is the `429`).
  Anonymous requests have no principal and are denied by `AuthorizationFilter` first.
- **AC-4** Given two failed logins for a name from two IPs, when that principal fails a password change,
  then it is `429` — one bucket per account. Customer: login key `Emails.normalize`d, so ` Shopper@X.COM `
  and principal `shopper@x.com` share it. Operator usernames compare case-sensitively (`operator.username`
  `TEXT UNIQUE`, exact `=`), so `Drain-Op` and `drain-op` are two accounts and two buckets.
- **AC-5** Given a customer, when it sends three `POST /api/me/verify-email/request` (each `200`) from three
  IPs, then the third is `429`; its own map, so that customer's password change still gets `400`.
- **AC-6** The principal `429` carries `Retry-After` and the `RATE_LIMITED` problem (no `instance`); the
  filter logs the `principal` dimension and never the name.
- **AC-7** `RateLimitDisabledTest`: with the limiter off, one principal's repeated changes are never `429`.

## Design

- `IdentityBuckets` (package-private): the per-process salt, the per-account map shared by the login
  per-identity budget and the password-change budget, and the key functions `operatorKey` (`op:` + salted
  SHA-256 of the name) and `customerKey` (`cust:` + salted SHA-256 of `Emails.normalize`). Both filters
  receive one instance from `SecurityConfig`.
- `BucketMap` (package-private): the bounded tracked-key map (`maxTrackedKeys`, lossless prune, reset
  backstop), extracted from `RateLimitFilter.bucketFor` so both filters bound their maps the same way.
- `SecurityProblemResponses.writeRateLimited(response, retryAfterSeconds)`: the shared 429.
- Password change: spend first, refund on any 2xx. Resend: spend on every request.
- #343 holds by construction: `ExceptionTranslationFilter` runs before `AuthorizationFilter`, so a denied
  request never reaches the new filter. `AuthBudget` unchanged.

## Modulith

`web` only; no new grant (`customer::vocabulary` already granted for `Emails`). No port, event or table.

## Risks

- Existing tests reuse one principal across methods; with a per-principal budget they would drain it.
  Remedy: unique principal per call in the helpers.
- Sibling #276 may add buckets to `RateLimitFilter`/`RateLimitProperties`; merge `origin/main`, keep both.

## Execution status

- [x] Phase 1 — red tests (AC-1..AC-7): 10 red on origin/main, each on the missing 429
- [x] Phase 2 — `BucketMap`, `IdentityBuckets`, `writeRateLimited`, `PrincipalRateLimitFilter`, wiring
- [x] Phase 3 — docs (RateLimitProperties, application.properties, RESPONSIBILITIES `web` + *Platform edge*, D-8)
- [ ] PR, CI, review gate (high), Sonar
