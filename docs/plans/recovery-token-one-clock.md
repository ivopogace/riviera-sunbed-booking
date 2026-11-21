# Recovery-token expiry reads one clock Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a recovery token issued with a TTL from the application `Clock` is rejected once that same clock has moved
past the TTL, for customer email verification, customer password reset and the admin-issued operator reset.

**Architecture:** the owner chose Option A(i) on #1857. Every expiry check binds `:now` from the injected `Clock`
(`JdbcCustomerAccountTokens.accountFor`/`consume`, `JdbcOperatorResetTokens.operatorFor`/`activeUsernameFor`/`consume`).
`auth` keeps minting the expiry. The `consumed_at` stamps (`retireAll`, `consume`) take the same bound `:now`.
`created_at` keeps its DB default because nothing compares it. No port change, no schema change. Precedent: #1854 / PR #1858.

**Source of intent:** #1857 (owner decision relayed by the wave orchestrator).

**Branch:** `bugfix/recovery-token-one-clock`

## Acceptance criteria

- [ ] **AC-1:** Given a verification token issued through `auth`'s `CustomerRecovery.sendVerificationEmail` at
  clock T, when the context clock reads T + `verificationTokenTtl` + 1s, then `CustomerRecovery.verifyEmail`
  answers `InvalidOrExpired` and the account stays unverified. Before that instant, the same token verifies.
  *Seam:* `CustomerRecovery` · *Pinned by:* `RecoveryTokenExpiryIT.aVerificationTokenLapsesOnTheApplicationClock`
- [ ] **AC-2:** Given a reset token issued through `CustomerRecovery.sendPasswordResetEmail` at T, when the clock reads
  T + `resetTokenTtl` + 1s, then `emailForResetToken` is empty and `resetPassword` answers `InvalidOrExpired` and
  writes nothing. *Seam:* `CustomerRecovery` · *Pinned by:* `RecoveryTokenExpiryIT.aCustomerResetTokenLapsesOnTheApplicationClock`
- [ ] **AC-3:** Given an operator link minted by `auth`'s `OperatorResetLinks.mint()` and issued through
  `operator::api` `OperatorPasswordReset.issue` at T, when the clock reads past `minted.expiresAt()`, then
  `usernameForResetToken` is empty and `resetPassword` answers `InvalidOrExpired` and writes nothing. One second
  before that instant, the username still resolves. *Seam:* `OperatorResetLinks` + `OperatorPasswordReset` ·
  *Pinned by:* `RecoveryTokenExpiryIT.anOperatorResetLinkLapsesAtTheExpiryTheAdminWasShown`
- [ ] **AC-4:** A consumed or retired token's `consumed_at` equals the context clock's instant at that moment.
  *Seam:* `CustomerAccountRecovery` / `OperatorPasswordReset` · *Pinned by:* `RecoveryTokenExpiryIT` (the same tests)
- [ ] **AC-5:** The existing expiry ITs mint their "future" and "past" from the context `Clock`, so they stay green
  with `RIVIERA_TEST_TRAVEL_TO` set. *Pinned by:* `CustomerAccountRecoveryIT`, `TokenRedemptionLockOrderIT`,
  `CustomerErasureRaceIT`, `OperatorPasswordResetStoreIT`, `OperatorPasswordResetIT`, `OperatorSsoLinksIT` (found by the
  travelled run), run once plain and once travelled.

## Non-goals

- Changing `created_at`'s DB default, the TTLs, or any port signature.
- Other `NOW()` stamps outside these two adapters (e.g. `email_verified_at`). A stamp found to be compared against
  an application-clock instant becomes its own needs-triage issue.

## Risks

- **R-1:** A wall-minted test fixture becomes "past" under clock travel → AC-5 moves every listed fixture to the context clock.
- **R-2:** Check-and-consume must stay atomic (OWASP Forgot Password Cheat Sheet: single use, server-side expiry) →
  `consume` stays one `UPDATE … WHERE consumed_at IS NULL AND expires_at > :now RETURNING`, binding one `:now`.
- **R-3:** On a real clock, the app host's skew against the DB moves a lifetime by seconds against TTLs of hours. This
  is accepted: invariant #6 asks for one time source per comparison, and the `Clock` bean is that source (`TimeConfig`).

## Open questions

### Resolved

- Which clock wins, and do the `consumed_at` stamps follow? → the application `Clock`, and yes (owner, #1857).

## Phases

- **Phase 0 — red:** `RecoveryTokenExpiryIT` (AC-1..AC-4) fails on main: the clock-advanced tokens still redeem.
- **Phase 1 — green:** both adapters bind `:now` from the `Clock`, and both class Javadocs are corrected.
- **Phase 2 — fixtures:** AC-5, run plain and travelled.

## Execution status

- Phase 0: done (0f5e0c2). All four `RecoveryTokenExpiryIT` tests red on main for the expected reason.
- Phase 1: done. Five checks and five stamps bind `:now`; `RecoveryTokenExpiryIT` green.
- Phase 2: done. With `RIVIERA_TEST_TRAVEL_TO` 12 years ahead, 10 tests went red before the move (plus
  `OperatorSsoLinksIT` once found). After it, every token-touching IT is green plain and travelled (114 tests, 0 skipped).
- Next: PR ready, review gate (high), Sonar, plan removal.
