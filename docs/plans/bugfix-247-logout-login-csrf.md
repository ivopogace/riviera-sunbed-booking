# Bugfix #247 — logout → immediate re-login returns 403 INVALID_CSRF_TOKEN

> Bugfix slice driven through `riviera-sdlc`. Entered at an existing issue → issue-intake
> grill gate + `diagnosing-bugs` (the ticket's root cause was a hypothesis; confirmed
> against running behavior before implementing, since this touches prod auth).

**Goal:** A signed-in user who logs out and immediately logs in again is accepted on the
**first** attempt — no `403 INVALID_CSRF_TOKEN`, no retry — for **both** principal types
(operator + customer), with **no** CSRF protection removed from the login/logout endpoints.

**Architecture:** The single significant decision — fix it **server-side, in the shared
logout filter**, not in the SPA. The framework's `CsrfLogoutHandler` (auto-registered
because CSRF is enabled *and* `.logout(...)` is configured) *clears* the `XSRF-TOKEN`
cookie on logout; `LogoutFilter` then writes the `204` and short-circuits the chain, so
`.spa()`'s deferred-token machinery never re-materializes the cookie on the logout
response. `SecurityConfig`'s logout **success handler** now re-issues a fresh token cookie
on the `204` (it runs *after* `CsrfLogoutHandler`'s clear), restoring the invariant that
every response leaves a usable token. One shared `CookieCsrfTokenRepository` instance backs
both the filter chain and the handler. One fix covers both principals (one logout filter).

**Persistence:** N/A — no schema/migration change (no Flyway version claimed; `main` is at
V26 after S3 #114, untouched here).

**Source of intent:** GitHub issue #247 (label `bug`, `area:fullstack`, `security`).

**Skills consulted (Skill-routing gate):**
- `riviera-sdlc` — routed the bugfix loop (issue-intake gate → diagnose → implement → CI →
  review → sonar → merge).
- `diagnosing-bugs` — Phase-1 feedback loop; confirmed the real mechanism (cookie **deleted,
  not re-issued** on logout — *not* a stale token being sent) before touching code.
- `riviera-local-debug` — scoped-test recipe (JDK-25 toolchain, Docker ITs) + the
  full-suite-only rate-limiter trap (#127): every MockMvc login uses a unique
  `X-Forwarded-For`.
- `riviera-java-conventions` — constructor-style wiring, no magic literals, javadoc-for-why;
  the fix is a `LogoutSuccessHandler` lambda, no new class/module.
- `riviera-modulith` — **not loaded (justified):** the change is entirely at the **platform
  edge** (`SecurityConfig`, login/session machinery — RV-BE-11), no bounded-context module,
  no new port/event/module, no class moved. Placement of any app-edge security helper is the
  established `RateLimitFilter`/`SecurityProblemResponses` precedent.
- `postgres` — N/A (no SQL).
- `riviera-frontend` / `angular-developer` / `playwright-cli` — **N/A:** the FE is correct
  (the interceptor reads the cookie fresh and sends no header when it's absent); the backend
  fix fully resolves the bug with **no FE change**, so no FE spec is in scope.

**Branch:** `bugfix/logout-login-csrf` (off `main` @ `9231d83` = `origin/main`, which
already includes the merged S3 #114). Exists in git. ✅

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in operator, when they `POST /api/auth/logout` and then
  immediately re-login through the real cookie-to-header CSRF flow, then the **first**
  re-login is `200` (not `403`) and `/api/auth/me` reports the session. *Pinned by:*
  `LogoutThenLoginCsrfIT.operatorLogoutThenImmediateLoginIsAccepted`.
- [x] **AC-2:** Same as AC-1 for a **customer** principal. *Pinned by:*
  `LogoutThenLoginCsrfIT.customerLogoutThenImmediateLoginIsAccepted`.
- [x] **AC-3:** Given a logout `204`, then the response leaves a **fresh, non-deleted**
  `XSRF-TOKEN` cookie with the D-1 hardened flags (JS-readable, Secure, SameSite=Lax).
  *Pinned by:* `LogoutThenLoginCsrfIT.logoutReissuesAFreshHardenedCsrfCookie`.
- [x] **AC-4:** No CSRF protection is removed from login/logout — a token-less
  session-authenticated write is still `403 INVALID_CSRF_TOKEN`, and login itself still
  requires the token. *Pinned by (unchanged, still green):* `CsrfProtectionIT`.

## Non-goals

- Not CSRF-exempting the login endpoint (S1 protects it deliberately — design D-8).
- No FE change (the FE interceptor / `signOut()` are correct as-is).
- Not rotating/removing the CSRF-token-on-logout semantics beyond re-materializing a usable
  cookie (the token still rotates: old cleared, fresh issued).
- No real-backend Playwright spec (local-only suite, not a CI regression guard; the IT is the
  CI-enforced regression and covers both principals deterministically).

## Behavior-parity ledger

| Old-surface behavior (logout `204`) | Verdict | How the new handler does it |
|---|---|---|
| Returns `204 No Content`, no redirect | preserved | `HttpStatusReturningLogoutSuccessHandler(NO_CONTENT)` still sets the status (called last) |
| Invalidates server session, kills old session cookie | preserved | unchanged — `SecurityContextLogoutHandler` + `CsrfLogoutHandler` still run |
| Left the browser with **no** `XSRF-TOKEN` cookie | **changed (the bug)** | now re-issues a fresh hardened token cookie before the `204` commits |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Fix masks-only in tests (`.with(csrf())` hides real cookie rotation) | med | high | Regression drives the **real** cookie flow via a browser-faithful jar, never `csrf()`; verified red→green | Ivo | resolved (green after fix) |
| R-2 | Double `Set-Cookie: XSRF-TOKEN` on logout (framework clear + fresh) confuses the browser | low | med | Both are same-name/same-path; browser applies last-wins → fresh token. Jar models this; e2e-equivalent proven in IT | Ivo | resolved |
| R-3 | Sharing one repo instance regresses the `.spa()` bootstrap cookie | low | med | `CsrfCookieBootstrapIT` + `CsrfProtectionIT` re-run green | Ivo | resolved |
| R-4 | Suite-cumulative logins trip the per-IP login rate limit (#127) | low | med | Every login uses `SessionLoginSupport.uniqueClientIp()` | Ivo | resolved |

## Open questions / Assumptions

_None open._

### Resolved
- **Root cause** was hypothesized in the ticket as "stale token sent." Confirmed via repro:
  the real cause is the cookie being **deleted and not re-issued** on the logout response
  (the FE reads the cookie fresh and sends no header when absent). — resolved before impl.

## Availability & concurrency (invariant #2)

N/A — does not touch `booking`, `availability`, or the beach map.

## Spring Modulith — modules, interfaces, events

N/A — no module code. The change is at the **platform edge** (`SecurityConfig`), which owns
the login/session/CSRF machinery (RV-BE-11); no bounded-context module, port, or event is
added or moved. `ModularityTests` / `PackageShapeArchitectureTests` re-run green.

## Payment & payout

N/A — no money in scope.

## Angular — frontend surfaces touched

N/A — backend-only. The FE is correct as-is; no component/service/spec changes.

## FE↔BE contract

N/A — no API shape change. The logout endpoint's status (`204`) and the CSRF cookie
name/flags are unchanged; the fix only ensures the cookie is *present* after logout.

## Execution status

**Stage pointer:** review gate — self-review done, ready for the review gate (`/code-review`
+ `riviera-review-overlay`), then Sonar gate → merge.

**Next action:** open the PR into `main`; run the review gate on the diff.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — repro (red) + fix (green) + regression IT | ✅ | (this commit) |
| 1 — blast-radius + structural-net verification | ✅ | (scoped tests green locally) |

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-3:** `gradle -p platform test --tests "*LogoutThenLoginCsrfIT*"` → **PASS**
  (was RED before the fix: `Status expected:<200> but was:<403>`).
- [x] **AC-4 + no regression:** `CsrfProtectionIT`, `AuthSessionIT`, `CsrfCookieBootstrapIT`,
  `CustomerLoginIT`, `PerOperatorLoginIT`, `SessionPersistenceIT`, `*ModularityTests*`,
  `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*` → **PASS** locally.
  CI owns the full suite.
