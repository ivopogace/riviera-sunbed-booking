# Operator SSO (link-only) Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a signed-in operator links Google/Apple from the console (proving the current password) and
can then sign in with it, without SSO ever creating an operator, linking by email, or crossing the
customer/operator principal line.

**Architecture:** `operator` owns `operator_sso_identity` (V87, keyed on `(issuer, subject)`) behind a
new `operator::api` port, `OperatorSsoLinks`; `auth` keeps one callback per provider and dispatches it
only on a session-held `SsoAuthorization` record (provider, audience, intent, PKCE verifier, nonce,
linking operator) found by `state`, never on URL input. Sessions opened by SSO carry the same username
principal and credential stamp as a password sign-in, so suspend, reset and the stamp filter end them
unchanged.

**Source of intent:** issue #276, with the wave orchestrator's decisions (link-only, issuer key, no
email column, password-gated link, state-record dispatch, nonce). `docs/architecture/auth-signin-register.md`
D-2/D-3/D-4/D-5/D-8.

**Branch:** `claude/issue-276-operator-sso-7ed118` (the wave's worktree branch).

## Acceptance criteria

- [ ] **AC-1 (unknown identity):** Given a Google identity linked to no operator, when it completes an
  operator sign-in, then no `operator_sso_identity`/`operator` row is written, no authenticated session
  exists, and the browser lands on the generic operator failure redirect. *Seam:* `GET
  /api/auth/operator/sso/{p}/authorize` → `GET /api/auth/sso/{p}/callback` · *Pinned by:*
  `OperatorSsoIT.anUnknownIdentityCreatesNoRowAndNoSession`
- [ ] **AC-2 (non-enumerating):** Given an identity linked to a SUSPENDED or a REJECTED operator, when it
  signs in, then the answer is byte-identical to AC-1's (same redirect, no session). *Seam:* as AC-1 ·
  *Pinned by:* `OperatorSsoIT.suspendedAndRejectedGetTheUnknownAnswer`
- [ ] **AC-3 (link then sign in):** Given a signed-in PENDING or ACTIVE operator, when it links Google with
  its current password and completes the callback, then one link row exists and a later operator SSO
  sign-in yields an `OPERATOR` session for that username. *Seam:* `POST
  /api/auth/operator/sso/{p}/link` + callback + `/api/auth/me` · *Pinned by:*
  `OperatorSsoIT.aLinkedIdentitySignsInAsItsOperator`
- [ ] **AC-4 (password gate):** Given a signed-in operator, when it starts a link without or with a wrong
  current password, then `400 MISSING_CURRENT_PASSWORD` / `400 INVALID_CURRENT_PASSWORD` and no state
  record. *Seam:* `POST …/link` · *Pinned by:* `OperatorSsoIT.linkingWithoutTheCurrentPasswordIsRefused`
- [ ] **AC-5 (bootstrap):** Given the bootstrap admin, when it starts a link, then `409
  BOOTSTRAP_CREDENTIAL_MANAGED`. *Seam:* `POST …/link` · *Pinned by:*
  `OperatorSsoIT.theBootstrapAdminCannotLink`
- [ ] **AC-6 (link re-check):** Given a LINK record, when the callback arrives on a session that no longer
  holds that operator (signed out, another principal, a stale stamp), then nothing is linked. *Seam:*
  callback · *Pinned by:* `OperatorSsoIT.aLinkCallbackOnALostSessionLinksNothing`
- [ ] **AC-7 (conflict):** Given `(issuer, sub)` linked to operator A, when operator B links it, then B
  gets the generic link-failed redirect and A's link is untouched; `OperatorSsoLinks.link` returns
  `Conflict` for both the taken identity and a second sub on one issuer. *Seam:* `OperatorSsoLinks` ·
  *Pinned by:* `OperatorSsoLinksIT.*`
- [ ] **AC-8 (audience isolation):** Given one Google identity linked to an operator, when the customer
  flow completes with it, then the session is `CUSTOMER` (a customer account), never the operator; and a
  customer-audience `state` replayed under the operator authorize never yields an operator session.
  *Seam:* callback · *Pinned by:* `OperatorSsoIT.aCustomerStateNeverYieldsAnOperatorSession`,
  `OperatorSsoIT.anOperatorStateNeverYieldsACustomerSession`
- [ ] **AC-9 (revocation):** An SSO-opened operator session dies on suspend, on unlink (from another
  session), and on redeeming an admin-issued reset, and the reset deletes every link. *Seam:* the admin
  suspend/reset endpoints, `DELETE …/sso/{p}`, `/api/auth/me` · *Pinned by:*
  `OperatorSsoIT.anSsoSessionDiesOn{Suspend,Unlink,Reset}`
- [ ] **AC-10 (unlink):** Unlink removes the link and ends every other session; it is refused `409
  LAST_CREDENTIAL` when it would leave no credential, and `404`-free idempotent `204` when not linked.
  *Seam:* `OperatorSsoLinks.unlink` · *Pinned by:* `OperatorSsoLinksIT.unlinkRefusesTheLastCredential`
- [ ] **AC-11 (nonce):** The mock IdP carries the authorize `nonce` into its code; a callback whose code
  carries another nonce is refused with nothing written. *Seam:* `SsoGateway.exchangeCode` · *Pinned
  by:* `MockSsoGatewayTest.aMismatchedNonceIsRefused`
- [ ] **AC-12 (FE + e2e):** The operator tab shows the SSO buttons; the operator password page gets a
  "Sign-in methods" section (link with current password, unlink); a mocked e2e links Google then signs
  in with it. *Pinned by:* `operator-sso.e2e.ts`, the flipped assertion in `unified-auth.e2e.ts`,
  `sso-buttons.spec.ts`, `operator-sign-in-methods.spec.ts`
- [ ] **AC-13 (structure):** structural net green; `OperatorAuthPlacementTests` pins the SSO link classes
  inside the scanned module.

## Non-goals

- SSO registration of an operator (would invent the username principal and take Apple's relay address
  as `contact_email`).
- Linking by email match, ever (OIDC Core §5.7; Sudhodanan & Paverd, USENIX Security 2022).
- A link-notification mail (`contact_email` unverified, mailer not live; ASVS 6.3.7 is L3) → Scope note.
- Real Google/Apple adapters (#116); the customer table's provider key.

## Risks

- **R-1 cross-audience confusion** → the callback reads audience/intent only from the session record;
  the authorize URL path names the audience at mint time only.
- **R-2 link CSRF / session swap** → link start is a CSRF-protected POST with the current password; the
  callback re-checks principal name → operator id and the credential stamp; the record is single-use.
- **R-3 a session saved during unlink/reset** → unlink and reset revoke before and after their write
  (`SessionRevocation` contract).
- **R-4 Flyway** → V87 is the wave's only migration (claimed by the orchestrator).
- **R-5 sibling conflicts** (#394 SSO mock guard, #364 `RateLimitFilter`, #130 `SecurityConfig`) → merge
  `origin/main`, keep both.

## Modulith

- `operator::api.OperatorSsoLinks` (resolve, link → sealed `SsoLinkOutcome`, unlink → sealed
  `SsoUnlinkOutcome`, links) — consumer `auth`, already granted `operator::api` + `::vocabulary`;
  implemented by `operator.application.OperatorSsoLinkService` over `OperatorSsoIdentities` (JDBC).
- `OperatorPasswordResetService.resetPassword` deletes the operator's links in its transaction.
- `auth`: `SsoAuthorization` record + enums, `OperatorSsoController`; `SsoController`'s callback
  dispatches on the record. `web`: route policy + rate buckets. No new grant.

## FE↔BE contract

- `GET /api/auth/operator/sso/{provider}/authorize` (anonymous) → 302 to the IdP.
- `POST /api/auth/operator/sso/{provider}/link` `{currentPassword}` (OPERATOR) → `200 {authorizeUrl}`.
- `GET /api/auth/operator/sso` (OPERATOR) → `200 [{provider, linkedAt}]`.
- `DELETE /api/auth/operator/sso/{provider}` (OPERATOR) → `204` | `409 LAST_CREDENTIAL`.
- Callback outcomes (302): operator sign-in → `/operator` or `/account/sign-in?audience=operator&sso=failed`;
  link → `/account/operator-password?sso=linked|link-failed`.

## Phases

- **Phase 0 — V87 + operator port:** `OperatorSsoLinksIT` red → table, port, service, adapter, reset deletes links.
- **Phase 1 — state record + nonce + issuer:** `MockSsoGatewayTest`, `SsoCallbackIT` stay green through the refactor.
- **Phase 2 — operator sign-in + link + unlink + list:** `OperatorSsoIT` red → controllers, route policy, buckets.
- **Phase 3 — frontend:** specs red → `SsoButtons` operator side, sign-in-methods section, auth-page failure notice, e2e.
- **Phase 4 — docs:** RESPONSIBILITIES §operator/§auth/§Platform edge, `auth-signin-register.md`, CLAUDE.md table.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** write `OperatorSsoLinksIT` red.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V87 + operator port | ⏳ | |
| 1 — state record + nonce + issuer | | |
| 2 — operator endpoints | | |
| 3 — frontend | | |
| 4 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
