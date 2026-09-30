# Sessions carry a credential stamp checked per request Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a session opened against a credential that has since changed stops authenticating on its next
request. That covers a password reset or change, an operator suspension or rejection, an admin demotion
and an erasure, even when the login's session is saved after the revoke that was meant to end it.

**Architecture:** every session principal carries a stamp: a SHA-256 digest of the password hash it was
authenticated against (the empty string for an SSO-only customer). A root-edge filter in the `/api/**`
chain re-reads the credential for each request whose security context came from the HTTP session.
- Customer: through `CustomerAccounts`.
- Operator: through `OperatorAccounts`, which also checks the may-authenticate status and that the admin
  flag matches `ROLE_ADMIN`.

On a mismatch the filter invalidates the session and the request continues anonymous. The before/after
revokes stay as defence in depth. The self-service password changes re-stamp the session they keep.

**Source of intent:** #1306 (concurrency sweep for #1298). Design chosen by the owner: a per-request stamp,
not re-validation after the save. Unstamped sessions are rejected, since the app is not live yet.

**Branch:** `bugfix/session-credential-stamp`

## Acceptance criteria

- [x] **AC-1:** Given a customer login paused after `authenticate()` verified the old hash, when a password
  reset commits and both of its revokes run, and the login then saves its session, then that session is
  unauthenticated on its next request. *Seam:* `POST /api/auth/customer/login` racing
  `POST /api/auth/customer/reset-password`, observed on `GET /api/auth/me` · *Pinned by:*
  `SessionCredentialRaceIT.aLoginSavedAfterAResetsRevokesIsRejected` (red on `main`).
- [x] **AC-2:** Given an admin operator's login paused the same way, when another admin suspends it, then
  the admin session it saves cannot reach `/api/admin/**`. *Seam:* `POST /api/auth/operator/login` racing
  `POST /api/admin/operators/{id}/suspend` · *Pinned by:*
  `SessionCredentialRaceIT.anAdminLoginSavedAfterItsSuspensionIsRejected` (red on `main`).
- [x] **AC-3:** Given a live session, when its credential changes with no revoke at all (hash, operator
  status, admin flag, erasure), then the next request is unauthenticated. *Seam:* the filter, via the
  account ports · *Pinned by:* `SessionCredentialStampIT` (one method per change).
- [x] **AC-4:** The self-service password changes keep the caller's session, and the SSO callback's
  session authenticates. *Pinned by:* the existing `SetPasswordIT`, `OperatorPasswordChangeIT` and the SSO
  ITs, plus a re-login-free follow-up request in each password-change test.
- [x] **AC-5:** A boot with an unchanged `RIVIERA_OPERATOR_PASSWORD` writes no new hash, so a deploy does
  not end the bootstrap admin's session. *Pinned by:* `OperatorCredentialInitializerTest`.
- [x] **AC-6:** Only a stamped `SessionPrincipal` is ever stored in a session, and a stored session is
  admitted only while its stamp matches the stored hash. *Seam:* `SessionAuthentication` (the one session
  writer) · *Pinned by:* `SessionAuthenticationTest`, `SessionWriterArchitectureTests`,
  `SessionCredentialStampIT.aStoredSessionIsAdmittedOnlyWhileItsStampMatchesTheStoredHash`. MockMvc's
  `with(user(...))` also stores its context in the session, so the filter admits a non-`SessionPrincipal`;
  the single-writer rule is what keeps that from being a hole.

## Non-goals

- Re-validating after the session save (the rejected alternative).
- Changing what revokes when: every existing bracket stays.
- A schema change: the stamp is derived from columns that already exist.

## Risks

- **R-1 (slice tests):** MockMvc `with(user(...))` stores a plain `User` in the session. The filter admits a
  non-`SessionPrincipal`, which is safe only because `SessionAuthentication` is the sole session writer and
  refuses anything else (pinned by an ArchUnit rule).
- **R-2 (cost):** one indexed by-email or by-username read per authenticated `/api` request. Spring Session
  already reads and touches the session row on each request.
- **R-3 (bootstrap):** bcrypt re-salts, so re-stamping the bootstrap hash on every boot would change the
  stamp and sign the admin out on each deploy. Fix: skip the write when the stored hash already matches.
- **R-4 (in-flight residual):** a request already past the filter when the change commits completes on the
  old credential. `RESPONSIBILITIES.md` §Platform edge states it.
- **R-5 (#11):** the customer read is a new method on `customer.api.CustomerAccounts`, the edge's
  credential conversation. There is no new port and no grant; the root composes, nothing depends on it.

## Modulith

- **Port:** `CustomerAccounts#sessionCredential(String)` returns the credential of a live account, SSO-only
  accounts included (null hash). Owner: `customer`. Consumer: the edge filter and the SSO callback. The
  operator side reuses `OperatorAccounts#findByUsername` unchanged.
- **No new grant or event.** Pinned by the structural net, `CustomerAuthPlacementTests` and
  `OperatorAuthPlacementTests`.

## Phases

- **Phase 0 — red:** AC-1, AC-2 race ITs; AC-3 and AC-6 ITs.
- **Phase 1 — stamp + filter:** principal, filter, SSO stamp, re-stamp on self-service change (AC-1..4, 6).
- **Phase 2 — bootstrap:** AC-5.
- **Phase 3 — docs:** `RESPONSIBILITIES.md` §Platform edge, affected Javadoc and ITs' class docs.

## Execution status

**Stage pointer:** PR — draft open; merge main, ready for review, review gate

**Next action:** ready for review, run code-review + overlay (high).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — red | ✅ | 7c49983 |
| 1 — stamp + filter | ✅ | (next commit) |
| 2 — bootstrap | ✅ | (next commit) |
| 3 — docs | ✅ | (next commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
