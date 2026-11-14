# Admin-issued operator password reset Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** an admin issues a single-use reset link for a named `ACTIVE` operator from `/admin` →
Operators; the operator chooses a new password with it, and every session that operator held ends.

**Architecture:** `operator` owns the new `operator_password_reset_token` table (sole writer; it
already owns every operator credential write) behind a new `operator::api` port,
`OperatorPasswordReset`, the operator twin of `customer::api.CustomerAccountRecovery`. `auth` mints
and hashes the raw token (`RecoveryTokens`), owns both endpoints and brackets the credential write
with `SessionRevocation`, as the customer reset does. The token row is locked behind the operator
row, the order a suspend takes, so a suspend and a redemption never interleave.

**Source of intent:** issue #1737 (Agent Brief + owner decision 2026-11-14). Self-service by email
is #1759 (blocked on #370), out of scope.

**Branch:** `claude/1737-admin-operator-reset-83042a` (wave worktree branch)

## Acceptance criteria

- [ ] **AC-1:** Given an `ACTIVE` operator holding live sessions, when an admin issues a reset link and
  the operator redeems it with a policy-conforming password, then the stored hash verifies the new
  password, the token is consumed and every `SPRING_SESSION` row of that principal is gone.
  *Seam:* `POST /api/admin/operators/{id}/reset-link` + `POST /api/auth/operator/reset-password` ·
  *Pinned by:* `OperatorPasswordResetIT.resetSetsTheNewPasswordAndRevokesEverySession`
- [ ] **AC-2:** Given a link was issued, when the admin issues a second one, then the first is refused
  and the second works. *Seam:* `OperatorPasswordReset` · *Pinned by:*
  `OperatorPasswordResetIT.aSecondIssueRetiresTheFirstLink`
- [ ] **AC-3:** Given a used, an expired and an unknown token, when each is redeemed, then each gets the
  same `400 INVALID_OR_EXPIRED_TOKEN` body and nothing is written. *Seam:* the reset endpoint ·
  *Pinned by:* `OperatorPasswordResetIT.usedExpiredAndUnknownTokensAreRefusedIdentically`
- [ ] **AC-4:** Given a `SUSPENDED` operator, when an admin issues a link, then `409 WRONG_STATUS` and no
  token row. Given a link issued before the suspension, when it is redeemed (also after
  reinstatement), then it is refused. *Seam:* `OperatorPasswordReset` · *Pinned by:*
  `OperatorPasswordResetIT.suspendedOperatorGetsNoLink`, `…aPreSuspensionLinkStaysDead`
- [ ] **AC-5:** Given the bootstrap admin (`riviera.operator.username`), when a link is requested, then
  `409 BOOTSTRAP_CREDENTIAL_MANAGED` (its hash is rewritten from the env at boot). *Seam:* issue
  endpoint · *Pinned by:* `AdminOperatorControllerTest` (slice)
- [ ] **AC-6:** The raw token is never stored, logged or audited: the row holds its SHA-256, the audit row
  carries the path (`/api/admin/operators/{id}/reset-link`) and never the token. *Seam:* DB + `admin_audit_record` ·
  *Pinned by:* `OperatorPasswordResetIT.onlyTheHashIsStoredAndTheAuditRowNamesTheTarget`
- [ ] **AC-7:** A plain operator gets `403` on the issue endpoint; the role-gate probe lists it.
  *Pinned by:* `EndpointRoleGateCoverageTest`, `AdminSurfaceRoleGateTest`
- [ ] **AC-8:** The admin console's operator row issues the link and shows it once with its expiry; the
  reset page sets the password and points to sign-in. *Pinned by:* `admin-operators.spec.ts`,
  `operator-reset-password.spec.ts`, mocked e2e `admin-operator-reset.e2e.ts`
- [ ] **AC-9:** The runbook's "Still not available" paragraph is updated.

## Non-goals

- Mailing the link, operator email verification, admin-set temporary passwords (#1737 out of scope).
- A `PENDING` operator: the row action lives on the decided-accounts list; only `ACTIVE` is issued.

## Risks

- **R-1: a suspend racing a redemption** resets a suspended account's password → redemption locks the
  operator row `FOR NO KEY UPDATE` with `status = 'ACTIVE'` before consuming the token; suspend
  retires the operator's live tokens in its own transaction after its lock. Same lock order (operator,
  then token), so no deadlock.
- **R-2: two issues both live** → issue locks the operator row first; a partial unique index
  `(operator_id) WHERE consumed_at IS NULL` backs it.
- **R-3: a failed revoke after a spent token** → revoke before and after the write, encode above the
  first revoke (the customer reset's bracket, `RESPONSIBILITIES.md` §auth).
- **R-4: a link built on the mail origin** (`riviera.recovery.link-base-url`, defaulted to
  `localhost:4200` outside `mailer`) would hand over a dead link on the demo → the API returns the
  token and expiry, the same-origin SPA builds the link from its own origin.
- **R-5: the token in the response or a log** → never logged; the audit filter records path and status
  only; the response is `no-store` (Spring Security's default cache headers).
- **R-6: bcrypt re-salt** (#128) → the IT verifies with `matches(raw, storedHash)`.
- **Flyway:** V82, assigned by the wave orchestrator (head V81, no sibling migrates).

## Modulith

- **New port** `operator.api.OperatorPasswordReset` (owner `operator`, consumer `auth`): `issue`,
  `usernameForResetToken`, `resetPassword`. Outcomes `ResetLinkOutcome` and `OperatorResetOutcome` in
  `operator::vocabulary`. A new consumer conversation, so a new port, not methods on
  `OperatorProvisioning`. `auth` already holds `operator::api` + `::vocabulary`; no new grant.
- **Internal** `operator.application.OperatorResetTokens` port, `adapter/out/JdbcOperatorResetTokens`.
- Ownership against `RESPONSIBILITIES.md`: token storage and the lifecycle rule (ACTIVE only, retired on
  suspend) are `operator`'s Job; minting, hashing, the endpoints and revocation are `auth`'s; the audit
  is `web`'s fence (path under `/api/admin/**`). No Spring Security type enters `operator`.

## FE↔BE contract

- `POST /api/admin/operators/{id}/reset-link` (ADMIN, CSRF) → `200 {token, expiresAt}`;
  `404 NO_SUCH_OPERATOR`, `409 WRONG_STATUS`, `409 BOOTSTRAP_CREDENTIAL_MANAGED`.
- `POST /api/auth/operator/reset-password` (anonymous, CSRF, own rate-limit bucket) `{token, newPassword}`
  → `204`; `400 INVALID_OR_EXPIRED_TOKEN`, `400 INVALID_REQUEST`, `400 PASSWORD_CONTAINS_BLOCKED_TERM`, `429`.
- SPA page `/account/operator-reset?token=…` (beside `/account/reset`; clear of `operator/:venueId`).

## Phases

- **Phase 0 — storage + port:** V82, `OperatorPasswordReset`, suspend retires tokens · red
  `OperatorPasswordResetStoreIT` (issue/retire/consume/suspend)
- **Phase 1 — endpoints:** issue + redeem in `auth`, route policy, rate-limit bucket, role-gate lists ·
  red `OperatorPasswordResetIT`, `AdminOperatorControllerTest`
- **Phase 2 — SPA:** admin row action + link panel, reset page, route · red specs + mocked e2e
- **Phase 3 — docs:** runbook, `RESPONSIBILITIES.md` §operator/§auth, CONTEXT if a term lands

## Execution status

**Stage pointer:** PR — ready for review, review gate next

**Next action:** fill PR body, mark ready, run `code-review:code-review` at high.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — storage + port | ✅ | phase 0–1 commit |
| 1 — endpoints | ✅ | phase 0–1 commit |
| 2 — SPA | ✅ | SPA commit |
| 3 — docs | ✅ (runbook, RESPONSIBILITIES, CLAUDE.md row) | phase 0–1 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
