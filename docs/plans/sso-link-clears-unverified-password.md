# SSO link onto an unverified password account clears its password (#1295)

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** An SSO first sign-in that auto-links onto an existing account whose email is unverified and
that holds a password leaves that account password-less, so the password holder's live sessions are
refused on their next request and their password login fails; a verified-email account links and keeps
its password.

**Architecture:** The rule lives in `customer` as one guarded statement under the SSO claim's row lock
(`lockLiveAccount`, #1307), before `markEmailVerified` flips the flag. No port signature changes:
`auth`'s per-request credential stamp (#1315, `CredentialStamp` hashes the stored password hash) turns
the cleared hash into a refused session with no edge revocation.

**Source of intent:** GitHub issue #1295, owner decision comment of 2026-10-02.

**Branch:** `bugfix/1295-sso-link-clears-unverified-password`

## Acceptance criteria

- [ ] **AC-1:** Given a password account whose email is unverified, when an unknown SSO subject with that
  email resolves, then the account is linked, marked verified and its `password_hash` is `NULL`.
  *Seam:* `customer::api` `SsoAccountProvisioning.resolveOrCreate` · *Pinned by:*
  `SsoAccountProvisioningIT.linkingOntoAnUnverifiedPasswordAccountClearsItsPassword`,
  `CustomerAccountServiceTest.resolveOrCreateClearsThePasswordOfAnUnverifiedAccountItLinksOnto`
- [ ] **AC-2:** Given a password account whose email is verified, when an unknown SSO subject with that
  email resolves, then the account is linked and its password hash is unchanged.
  *Seam:* same · *Pinned by:* `SsoAccountProvisioningIT.linkingOntoAVerifiedPasswordAccountKeepsItsPassword`,
  `CustomerAccountServiceTest.resolveOrCreateKeepsThePasswordOfAVerifiedAccountItLinksOnto`
- [ ] **AC-3:** Given the password holder is signed in (a live session) on an unverified account, when the
  SSO sign-in links onto it, then the holder's next request is `401` and the SSO session's requests are
  `200`; the holder's password login is refused.
  *Seam:* the `web` chain (`SessionCredentialFilter` via `auth::api` `SessionCredentials`) ·
  *Pinned by:* `SsoCallbackIT.anSsoSignInOntoAnUnverifiedPasswordAccountEndsThePasswordHoldersSession`
- [ ] **AC-4:** The store statement clears only a live, unverified account's password; a verified or an
  erased account is left alone. *Seam:* `CustomerAccountStore.clearUnverifiedPassword` ·
  *Pinned by:* `JdbcCustomerAccountsIT.clearingAnUnverifiedPasswordLeavesVerifiedAndErasedAccountsAlone`
- [ ] **AC-5 (pin only, fixed by #1318):** an SSO first sign-in racing the account's erasure never links the
  identity to the erased account. *Pinned by:*
  `CustomerErasureRaceIT.anSsoSignInWhoseAccountWasErasedMeanwhileGetsAFreshAccount` (already on `main`).

## Non-goals

- Gating the link on the provider's `email_verified` claim: #116's real adapters.
- A sealed outcome on `SsoAccountProvisioning` or edge-side session revocation: the stamp refuses them.
- Re-fixing the erasure race (#1318).

## Risks

- **R-1:** a legitimate user who registered with a password, never verified, then signs in with SSO loses
  their password silently → they stay signed in via SSO and can set a password while signed in
  (`SetPasswordIT`, `changePassword(id, null, …)`), or use the reset flow. Residual accepted by the owner.
- **R-2:** a victim who clicks the attacker-triggered verification mail before using SSO verifies the
  attacker's account; SSO then links and keeps the password → out of scope by the owner's decision
  (verified accounts keep their password); noted in the PR.
- **R-3:** a concurrent password change by the holder racing the SSO link → `replacePasswordHash` is a
  guarded one-statement write on the same row; it waits on the SSO transaction's row lock and then fails
  its `IS NOT DISTINCT FROM :expected` guard against the cleared hash.

## Open questions

### Resolved

- Port signature unchanged — owner's decision; the behaviour is a `customer`-internal write.

## Modulith

No new port, event or cross-module call. `CustomerAccountStore` (internal to `customer`) gains one
guarded write; `customer`'s `allowedDependencies = {}` is untouched.

## Phases

- **Phase 0 — rule in the service:** red `CustomerAccountServiceTest.resolveOrCreateClearsThePasswordOfAnUnverifiedAccountItLinksOnto`
  (+ the verified twin), then the store method and the service call.
- **Phase 1 — the guarded statement:** red `JdbcCustomerAccountsIT.clearingAnUnverifiedPasswordLeavesVerifiedAndErasedAccountsAlone`.
- **Phase 2 — the port and the edge:** `SsoAccountProvisioningIT` split (AC-1/AC-2), `SsoCallbackIT` (AC-3).
- **Phase 3 — docs:** `RESPONSIBILITIES.md` § `customer`, `auth-signin-register.md` D-6, the port Javadoc.

## Execution status

**Stage pointer:** `implement (phases 1–2 — ITs running locally, draft PR up for CI)`

**Next action:** read the IT batches; mark ready for review once CI is green, then run the review gate at HIGH.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — rule in the service | ✅ | first commit |
| 1 — the guarded statement | ⏳ | first commit (test written, IT pending) |
| 2 — the port and the edge | ⏳ | first commit (tests written, ITs pending) |
| 3 — docs | ✅ | first commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
